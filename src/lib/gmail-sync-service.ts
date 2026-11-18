import { callGeminiFlash, isAIError } from './ai/gemini-client';
import { maskForAI } from './ai/pii-mask';
import { getValidGmailAccessToken } from './gmail-vault';
import {
  GMAIL_ALERT_QUERY_BASE,
  parseGmailTransactionEmail,
  truncateSnippet200,
  type GmailMessage,
  type ParsedEmailTransaction,
} from './parsers/gmail';
import {
  findBestCrossSourceMatch,
  normalizeRefForDedup,
  type DedupCandidateTx,
  type IncomingDedupRow,
} from './dedup-sync';
import { findFirstMatchingRule } from './rules-engine';
import { detectAndLinkSelfTransfers } from './self-transfer';
import {
  computeAuthoritativeAccountBalance,
  orderTransactionsChronologically,
} from './balance-utils';
import type { Category } from '../types/categories';
import type { TransactionRule } from '../types/transactions';

export interface GmailSyncResult {
  emails_processed: number;
  transactions_added: number;
  errors_count: number;
  last_synced_at: string;
}

export interface DeleteGmailDataResult {
  success: boolean;
  deleted_transactions: number;
  preserved_statement_transactions: number;
  affected_accounts: number;
}

async function categoriseSingleGmailTransaction(params: {
  payeeName: string;
  amount: number;
  method: string;
  accountType: string;
  categories: Category[];
  profileName?: string;
}): Promise<{ category_id: string | null; confidence: number }> {
  const { payeeName, amount, method, accountType, categories, profileName } = params;

  if (!process.env.GEMINI_API_KEY || categories.length === 0) {
    return { category_id: null, confidence: 0 };
  }

  // Strictly mask payee name via pii-mask.ts and send ONLY { payee_name, amount, method, account_type }
  const maskedPayeeName = maskForAI(payeeName, profileName) || 'Merchant';
  const payloadInput = {
    payee_name: maskedPayeeName,
    amount,
    method,
    account_type: accountType,
  };

  const categoryPayload = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.is_income ? 'income' : 'expense',
  }));

  const prompt = `Categorise this single Indian bank transaction into one of the provided categories.
Return ONLY valid JSON: { "category_id": "<id_or_null>", "confidence": <0.0_to_1.0> }

Categories:
${JSON.stringify(categoryPayload)}

Transaction:
${JSON.stringify(payloadInput)}`;

  const res = await callGeminiFlash(prompt, { responseMimeType: 'application/json' });
  if (isAIError(res)) {
    return { category_id: null, confidence: 0 };
  }

  try {
    const cleaned = res.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { category_id?: string | null; confidence?: number };
    const matchedCat = categories.find((c) => c.id === parsed.category_id);
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    return {
      category_id: matchedCat ? matchedCat.id : null,
      confidence,
    };
  } catch {
    return { category_id: null, confidence: 0 };
  }
}

async function listGmailAlertMessages(
  accessToken: string,
  afterUnixSec: number
): Promise<Array<{ id: string }>> {
  const query = `${GMAIL_ALERT_QUERY_BASE} after:${afterUnixSec}`;
  const collected: Array<{ id: string }> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gmail API list messages failed (${res.status}): ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };

    if (Array.isArray(json.messages)) {
      collected.push(...json.messages);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return collected;
}

async function fetchFullGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
    messageId
  )}?format=full`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail API get message ${messageId} failed (${res.status})`);
  }

  return (await res.json()) as GmailMessage;
}

export async function runGmailSyncForUser(
  serviceSupabase: any,
  userId: string
): Promise<GmailSyncResult> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run Gmail sync.');
  }

  // 1 & 2. Load token from Vault & refresh if expired
  const accessToken = await getValidGmailAccessToken(serviceSupabase, userId);

  // Load user profile, accounts, rules, categories, and AI settings
  const [
    { data: profileRow },
    { data: accounts },
    { data: rules },
    { data: categories },
    { data: aiSettingsRow },
  ] = await Promise.all([
    serviceSupabase
      .from('profiles')
      .select('gmail_last_synced, owner_full_name, full_name')
      .eq('user_id', userId)
      .maybeSingle(),
    serviceSupabase
      .from('accounts')
      .select('id, account_number_last4, account_type, purpose, opening_balance')
      .eq('user_id', userId),
    serviceSupabase
      .from('transaction_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: true }),
    serviceSupabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_system.eq.true`),
    serviceSupabase
      .from('ai_settings')
      .select('ai_enabled')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const lastSyncedMs = profileRow?.gmail_last_synced
    ? new Date(profileRow.gmail_last_synced).getTime()
    : NaN;
  const afterUnixSec = Number.isFinite(lastSyncedMs)
    ? Math.max(0, Math.floor(lastSyncedMs / 1000) - 60)
    : Math.floor(Date.now() / 1000) - 30 * 86400;

  const ownerName: string | undefined =
    profileRow?.owner_full_name || profileRow?.full_name || undefined;
  const aiEnabled = aiSettingsRow ? Boolean(aiSettingsRow.ai_enabled) : true;

  const accountByLast4 = new Map<
    string,
    { id: string; account_type: string; purpose: string; opening_balance: number }
  >();
  const openingBalanceByAccountId = new Map<string, number>();
  for (const acc of accounts || []) {
    const openBal = Number(acc.opening_balance ?? 0);
    openingBalanceByAccountId.set(acc.id, openBal);
    if (acc.account_number_last4) {
      accountByLast4.set(String(acc.account_number_last4).trim(), {
        id: acc.id,
        account_type: acc.account_type || 'savings',
        purpose: acc.purpose || 'personal',
        opening_balance: openBal,
      });
    }
  }

  // 3. Query Gmail API
  const messageRefs = await listGmailAlertMessages(accessToken, afterUnixSec);

  let emailsProcessed = 0;
  let transactionsAdded = 0;
  let errorsCount = 0;
  const insertedTxIds: string[] = [];
  const touchedAccountIds = new Set<string>();
  const latestBalanceAlertByAccount = new Map<
    string,
    { balance: number; dateIso: string; internalMs: number }
  >();

  // 4 & 5. Fetch & parse each message -> dedup -> categorise -> insert
  for (const ref of messageRefs) {
    emailsProcessed++;
    try {
      const fullMsg = await fetchFullGmailMessage(accessToken, ref.id);
      const outcome = parseGmailTransactionEmail(fullMsg);

      if (outcome.record_type === 'ignored') {
        continue; // OTPs, e-statement notices, declined alerts silently ignored
      }

      if (outcome.record_type === 'error') {
        errorsCount++;
        await serviceSupabase.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: outcome.gmail_msg_id,
          from_address: outcome.from_address,
          subject: outcome.subject,
          error_reason: outcome.error_reason,
          raw_snippet: truncateSnippet200(outcome.raw_snippet),
        });
        continue;
      }

      // Match account by last4 alone (Minaz 0553 alerts arrive in Wasim's Gmail)
      const matchedAccount = accountByLast4.get(outcome.account_last4);
      if (!matchedAccount) {
        errorsCount++;
        await serviceSupabase.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: outcome.gmail_msg_id,
          from_address: outcome.from_address,
          subject: `Unmatched account ${outcome.account_last4}`,
          error_reason: `No account matched last4 ${outcome.account_last4}`,
          raw_snippet: truncateSnippet200(
            outcome.record_type === 'transaction'
              ? outcome.description_raw
              : `Balance alert Rs.${outcome.balance_after}`
          ),
        });
        continue;
      }

      // Balance alert: record latest alert per account and reconcile after loop
      if (outcome.record_type === 'balance_alert') {
        const rawMs = (fullMsg as any)?.internalDate;
        const internalMs = rawMs && /^\d+$/.test(String(rawMs)) ? Number(rawMs) : Date.now();
        const dateIso = new Date(internalMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
        const prev = latestBalanceAlertByAccount.get(matchedAccount.id);
        if (!prev || internalMs >= prev.internalMs) {
          latestBalanceAlertByAccount.set(matchedAccount.id, {
            balance: outcome.balance_after,
            dateIso,
            internalMs,
          });
        }
        touchedAccountIds.add(matchedAccount.id);
        continue;
      }

      // Transaction dedup check (Tier 1 ref + Tier 2 fuzzy date/amount/counterparty across sources)
      const parsedTx: ParsedEmailTransaction = outcome;
      const refNumber =
        normalizeRefForDedup(
          parsedTx.upi_ref_no ||
            parsedTx.imps_ref_no ||
            parsedTx.rtgs_ref_no ||
            parsedTx.neft_ref_no ||
            parsedTx.reference_number
        ) || null;

      const debit = parsedTx.direction === 'debit' ? parsedTx.amount : null;
      const credit = parsedTx.direction === 'credit' ? parsedTx.amount : null;

      const minDate = new Date(parsedTx.txn_date);
      minDate.setDate(minDate.getDate() - 2);
      const maxDate = new Date(parsedTx.txn_date);
      maxDate.setDate(maxDate.getDate() + 2);

      const candidateSelect =
        'id, account_id, upload_id, txn_date, description, raw_description, debit, credit, balance, balance_after, reference_number, upi_ref_no, imps_ref_no, source';

      const [refMatchesRes, windowMatchesRes] = await Promise.all([
        refNumber
          ? serviceSupabase
              .from('transactions')
              .select(candidateSelect)
              .eq('user_id', userId)
              .or(
                `reference_number.eq.${refNumber},upi_ref_no.eq.${refNumber},imps_ref_no.eq.${refNumber}`
              )
              .limit(10)
          : Promise.resolve({ data: [] }),
        serviceSupabase
          .from('transactions')
          .select(candidateSelect)
          .eq('user_id', userId)
          .eq('account_id', matchedAccount.id)
          .gte('txn_date', minDate.toISOString().split('T')[0])
          .lte('txn_date', maxDate.toISOString().split('T')[0])
          .limit(100),
      ]);

      const candidateMap = new Map<string, DedupCandidateTx>();
      for (const row of [...(refMatchesRes.data || []), ...(windowMatchesRes.data || [])]) {
        candidateMap.set(row.id, {
          ...row,
          debit: row.debit !== null && row.debit !== undefined ? Number(row.debit) : null,
          credit: row.credit !== null && row.credit !== undefined ? Number(row.credit) : null,
          balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : null,
          balance_after:
            row.balance_after !== null && row.balance_after !== undefined
              ? Number(row.balance_after)
              : null,
        });
      }

      const incomingRow: IncomingDedupRow = {
        account_id: matchedAccount.id,
        txn_date: parsedTx.txn_date,
        description: parsedTx.payee_name,
        raw_description: parsedTx.description_raw,
        debit,
        credit,
        balance: parsedTx.balance_after,
        reference_number: refNumber,
        upi_ref_no: parsedTx.upi_ref_no,
        imps_ref_no: parsedTx.imps_ref_no,
        source: 'gmail_auto',
      };

      const dedupMatch = findBestCrossSourceMatch(
        incomingRow,
        Array.from(candidateMap.values())
      );

      if (dedupMatch) {
        if (dedupMatch.enrichmentPatch) {
          await serviceSupabase
            .from('transactions')
            .update({
              ...dedupMatch.enrichmentPatch,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dedupMatch.matched.id)
            .eq('user_id', userId);
        }
        touchedAccountIds.add(matchedAccount.id);
        continue; // Silent cross-source / replay dedup skip
      }

      // Step 6: Rules BEFORE AI categorisation (with account scope context)
      let txnType: 'expense' | 'income' | 'transfer' | 'refund' =
        parsedTx.direction === 'debit' ? 'expense' : 'income';
      let categoryId: string | null = null;
      let workspaceId: string | null = null;
      let tags: string[] | null = null;
      let status: 'confirmed' | 'review' = 'review';
      let isTransfer = false;
      let categorySource: 'rule' | 'ai_suggested' | null = null;

      const matchedRule = findFirstMatchingRule(
        (rules || []) as TransactionRule[],
        {
          description: parsedTx.payee_name,
          raw_description: parsedTx.description_raw,
          reference_number: refNumber || undefined,
          debit,
          credit,
          txn_type: txnType,
          account_id: matchedAccount.id,
        },
        {
          id: matchedAccount.id,
          purpose: matchedAccount.purpose,
        }
      );

      if (matchedRule) {
        if (matchedRule.set_category) {
          categoryId = matchedRule.set_category;
          categorySource = 'rule';
        }
        if (matchedRule.set_workspace) workspaceId = matchedRule.set_workspace;
        if (matchedRule.set_txn_type) txnType = matchedRule.set_txn_type;
        if (matchedRule.is_transfer || matchedRule.set_txn_type === 'transfer') {
          isTransfer = true;
          txnType = 'transfer';
        }
        if (matchedRule.set_tags && matchedRule.set_tags.length > 0) {
          tags = [...matchedRule.set_tags];
        }
        status = 'confirmed';
      } else if (aiEnabled) {
        const aiCat = await categoriseSingleGmailTransaction({
          payeeName: parsedTx.payee_name,
          amount: parsedTx.amount,
          method: parsedTx.method,
          accountType: matchedAccount.account_type,
          categories: (categories || []) as Category[],
          profileName: ownerName,
        });
        if (aiCat.category_id) {
          categoryId = aiCat.category_id;
          categorySource = 'ai_suggested';
          status = aiCat.confidence > 0.75 ? 'confirmed' : 'review';
        }
      }

      // Step 7: Insert transaction (preserve Gmail alert timestamp for chronological intra-day order)
      const rawInternalMs = (fullMsg as any)?.internalDate;
      const alertCreatedAt =
        rawInternalMs && /^\d+$/.test(String(rawInternalMs))
          ? new Date(Number(rawInternalMs)).toISOString()
          : undefined;

      const { data: insertedTx, error: insertErr } = await serviceSupabase
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: matchedAccount.id,
          txn_date: parsedTx.txn_date,
          description: parsedTx.payee_name,
          raw_description: parsedTx.description_raw,
          debit,
          credit,
          balance: parsedTx.balance_after,
          balance_after: parsedTx.balance_after,
          reference_number: refNumber,
          upi_ref_no: parsedTx.upi_ref_no,
          imps_ref_no: parsedTx.imps_ref_no,
          source: 'gmail_auto',
          status,
          category_id: categoryId,
          category_source: categorySource,
          workspace_id: workspaceId,
          txn_type: txnType,
          is_transfer: isTransfer,
          is_self_transfer: false,
          is_manual: false,
          tags,
          ...(alertCreatedAt ? { created_at: alertCreatedAt } : {}),
        })
        .select('id')
        .single();

      if (insertErr || !insertedTx) {
        errorsCount++;
        await serviceSupabase.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: parsedTx.gmail_msg_id,
          from_address: parsedTx.from_address,
          subject: parsedTx.kind,
          error_reason: `DB insert error: ${insertErr?.message || 'unknown'}`,
          raw_snippet: truncateSnippet200(parsedTx.description_raw),
        });
        continue;
      }

      transactionsAdded++;
      insertedTxIds.push(insertedTx.id);
      touchedAccountIds.add(matchedAccount.id);
    } catch (msgErr: any) {
      errorsCount++;
      await serviceSupabase
        .from('email_parse_errors')
        .insert({
          user_id: userId,
          gmail_msg_id: ref.id,
          from_address: null,
          subject: null,
          error_reason: msgErr?.message || 'Unexpected Gmail sync message error',
          raw_snippet: null,
        })
        .catch(() => {});
    }
  }

  // Step 5 (Batch 4b): Self-transfer check across newly inserted Gmail transactions
  if (insertedTxIds.length > 0) {
    try {
      await detectAndLinkSelfTransfers(serviceSupabase, userId, insertedTxIds);
    } catch (stErr: any) {
      console.error('[gmail-sync] Self-transfer linking warning:', stErr?.message);
    }
  }

  // Step 8: Recompute authoritative current_balance chronologically for every touched account
  for (const accountId of touchedAccountIds) {
    try {
      await recomputeAccountBalanceForUser(
        serviceSupabase,
        userId,
        accountId,
        openingBalanceByAccountId.get(accountId),
        latestBalanceAlertByAccount.get(accountId)
      );
    } catch (balErr: any) {
      console.warn('[gmail-sync] Account balance recompute warning:', balErr?.message);
    }
  }

  // Step 9: Write gmail_sync_log & update profiles.gmail_last_synced
  const nowIso = new Date().toISOString();
  await Promise.all([
    serviceSupabase.from('gmail_sync_log').insert({
      user_id: userId,
      last_synced_at: nowIso,
      emails_processed: emailsProcessed,
      transactions_added: transactionsAdded,
      errors_count: errorsCount,
    }),
    serviceSupabase
      .from('profiles')
      .update({ gmail_last_synced: nowIso })
      .eq('user_id', userId),
  ]);

  return {
    emails_processed: emailsProcessed,
    transactions_added: transactionsAdded,
    errors_count: errorsCount,
    last_synced_at: nowIso,
  };
}

async function recomputeAccountBalanceForUser(
  db: any,
  userId: string,
  accountId: string,
  openingBalanceOverride?: number,
  latestBalanceAlert?: { balance: number; dateIso: string }
): Promise<number> {
  let openBal = openingBalanceOverride;
  if (openBal === undefined) {
    const { data: acc } = await db
      .from('accounts')
      .select('opening_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();
    openBal = Number(acc?.opening_balance ?? 0);
  }

  const txns: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const q = db
      .from('transactions')
      .select('txn_date, debit, credit, balance, balance_after')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true });
    const { data: pageRows, error: pageErr } =
      typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;
    if (pageErr || !pageRows || pageRows.length === 0) break;
    txns.push(...pageRows);
    if (typeof q.range !== 'function' || pageRows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const { ordered: chronologicalTxns } = orderTransactionsChronologically(txns);
  let nextBal = computeAuthoritativeAccountBalance(openBal ?? 0, chronologicalTxns);

  if (latestBalanceAlert) {
    const latestTxnDate =
      chronologicalTxns.length > 0
        ? chronologicalTxns[chronologicalTxns.length - 1].txn_date || ''
        : '';
    if (!latestTxnDate || latestBalanceAlert.dateIso >= latestTxnDate) {
      nextBal = latestBalanceAlert.balance;
    }
  }

  await db
    .from('accounts')
    .update({
      current_balance: nextBal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('user_id', userId);

  return nextBal;
}

function isPermissionDeniedError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').trim();
  const msg = String(err.message || err.details || '').toLowerCase();
  return code === '42501' || msg.includes('permission denied');
}

/**
 * Deletes all purely Gmail-imported transactions (source = 'gmail_auto' and upload_id IS NULL),
 * preserves any cross-source statement-backed rows by reclassifying them as 'statement_import',
 * clears Gmail sync logs/parse errors, resets profiles.gmail_last_synced (preserving OAuth connection),
 * and recalculates affected account balances.
 */
export async function deleteGmailImportedData(
  db: any,
  userId: string,
  fallbackDb?: any
): Promise<DeleteGmailDataResult> {
  if (!db && !fallbackDb) {
    throw new Error('Database client is required to delete Gmail imported data.');
  }

  let activeDb = db || fallbackDb;
  const altDb = fallbackDb && fallbackDb !== activeDb ? fallbackDb : null;

  const gmailRows: Array<{ id: string; account_id: string | null; upload_id: string | null }> = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const runQuery = async (client: any) => {
      const q = client
        .from('transactions')
        .select('id, account_id, upload_id')
        .eq('user_id', userId)
        .eq('source', 'gmail_auto');
      return typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;
    };

    let res = await runQuery(activeDb);
    if (res?.error && isPermissionDeniedError(res.error) && altDb && activeDb !== altDb) {
      activeDb = altDb;
      res = await runQuery(activeDb);
    }

    const { data, error } = res || {};
    if (error) {
      throw new Error(`Failed to query Gmail transactions: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    gmailRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const gmailOnlyIds: string[] = [];
  const statementLinkedIds: string[] = [];
  const affectedAccountIds = new Set<string>();

  for (const row of gmailRows) {
    if (row.account_id) affectedAccountIds.add(row.account_id);
    if (row.upload_id) {
      statementLinkedIds.push(row.id);
    } else {
      gmailOnlyIds.push(row.id);
    }
  }

  const nowIso = new Date().toISOString();
  const CHUNK_SIZE = 150;

  for (let i = 0; i < gmailOnlyIds.length; i += CHUNK_SIZE) {
    const chunk = gmailOnlyIds.slice(i, i + CHUNK_SIZE);

    // Unlink any counterpart self-transfer rows pointing to deleted Gmail rows
    try {
      await activeDb
        .from('transactions')
        .update({
          transfer_pair_id: null,
          is_self_transfer: false,
          is_transfer: false,
          updated_at: nowIso,
        })
        .eq('user_id', userId)
        .in('transfer_pair_id', chunk);
    } catch {
      // Ignore if transfer_pair_id column is absent in minimal mocks
    }

    // Unlink any invoice references pointing to deleted Gmail rows
    try {
      await activeDb
        .from('invoices')
        .update({ linked_transaction_id: null, updated_at: nowIso })
        .eq('user_id', userId)
        .in('linked_transaction_id', chunk);
    } catch {
      // Best-effort cleanup
    }

    let delRes = await activeDb
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .in('id', chunk);

    if (delRes?.error && isPermissionDeniedError(delRes.error) && altDb && activeDb !== altDb) {
      activeDb = altDb;
      delRes = await activeDb
        .from('transactions')
        .delete()
        .eq('user_id', userId)
        .in('id', chunk);
    }

    if (delRes?.error) {
      throw new Error(`Failed to delete Gmail transactions: ${delRes.error.message}`);
    }
  }

  // Preserve rows that are also backed by a manual statement upload
  for (let i = 0; i < statementLinkedIds.length; i += CHUNK_SIZE) {
    const chunk = statementLinkedIds.slice(i, i + CHUNK_SIZE);
    let updRes = await activeDb
      .from('transactions')
      .update({ source: 'statement_import', updated_at: nowIso })
      .eq('user_id', userId)
      .in('id', chunk);

    if (updRes?.error && isPermissionDeniedError(updRes.error) && altDb && activeDb !== altDb) {
      activeDb = altDb;
      updRes = await activeDb
        .from('transactions')
        .update({ source: 'statement_import', updated_at: nowIso })
        .eq('user_id', userId)
        .in('id', chunk);
    }

    if (updRes?.error) {
      throw new Error(`Failed to preserve statement-linked transactions: ${updRes.error.message}`);
    }
  }

  // Clear Gmail sync logs & parse error logs (best-effort across service/user clients)
  const logClients = Array.from(new Set([fallbackDb, db, activeDb].filter(Boolean)));
  for (const logClient of logClients) {
    await Promise.all([
      Promise.resolve(logClient.from('gmail_sync_log').delete().eq('user_id', userId)).catch(() => {}),
      Promise.resolve(logClient.from('email_parse_errors').delete().eq('user_id', userId)).catch(() => {}),
    ]);
  }

  // Reset gmail_last_synced so a future Sync Now can re-fetch alerts cleanly
  try {
    await activeDb
      .from('profiles')
      .update({ gmail_last_synced: null, updated_at: nowIso })
      .eq('user_id', userId);
  } catch {
    // Non-blocking profile timestamp reset
  }

  // Recalculate current_balance for all affected accounts
  for (const accountId of affectedAccountIds) {
    try {
      await recomputeAccountBalanceForUser(activeDb, userId, accountId);
    } catch (balErr: any) {
      console.warn('[gmail-sync] Balance recalculation warning after Gmail wipe:', balErr?.message);
    }
  }

  try {
    await activeDb.from('audit_log').insert({
      user_id: userId,
      table_name: 'transactions',
      record_id: userId,
      action: 'delete',
      old_data: {
        source: 'gmail_auto',
        deleted_transactions: gmailOnlyIds.length,
        preserved_statement_transactions: statementLinkedIds.length,
      },
      new_data: null,
    });
  } catch {
    // Non-blocking audit log
  }

  return {
    success: true,
    deleted_transactions: gmailOnlyIds.length,
    preserved_statement_transactions: statementLinkedIds.length,
    affected_accounts: affectedAccountIds.size,
  };
}
