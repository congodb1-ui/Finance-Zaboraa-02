import { callGeminiFlash, isAIError } from './ai/gemini-client';
import { maskForAI } from './ai/pii-mask';
import { getValidGmailAccessToken } from './gmail-vault';
import {
  parseGmailTransactionEmail,
  truncateSnippet200,
  type GmailMessage,
  type ParsedEmailTransaction,
} from './parsers/gmail';
import { findFirstMatchingRule } from './rules-engine';
import { detectAndLinkSelfTransfers } from './self-transfer';
import type { Category } from '../types/categories';
import type { TransactionRule } from '../types/transactions';

export interface GmailSyncResult {
  emails_processed: number;
  transactions_added: number;
  errors_count: number;
  last_synced_at: string;
}

const GMAIL_ALERT_QUERY_BASE =
  'from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in)';

async function categoriseSingleGmailTransaction(params: {
  payeeName: string;
  amount: number;
  method: 'UPI' | 'IMPS';
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
      .select('id, account_number_last4, account_type')
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

  const accountByLast4 = new Map<string, { id: string; account_type: string }>();
  for (const acc of accounts || []) {
    if (acc.account_number_last4) {
      accountByLast4.set(String(acc.account_number_last4).trim(), {
        id: acc.id,
        account_type: acc.account_type || 'savings',
      });
    }
  }

  // 3. Query Gmail API
  const messageRefs = await listGmailAlertMessages(accessToken, afterUnixSec);

  let emailsProcessed = 0;
  let transactionsAdded = 0;
  let errorsCount = 0;
  const insertedTxIds: string[] = [];

  // 4 & 5. Fetch & parse each message -> dedup -> categorise -> insert
  for (const ref of messageRefs) {
    emailsProcessed++;
    try {
      const fullMsg = await fetchFullGmailMessage(accessToken, ref.id);
      const outcome = parseGmailTransactionEmail(fullMsg);

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

      // Balance alert: update accounts.current_balance ONLY (no transaction row, skip dedup)
      if (outcome.record_type === 'balance_alert') {
        await serviceSupabase
          .from('accounts')
          .update({
            current_balance: outcome.balance_after,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedAccount.id)
          .eq('user_id', userId);
        continue;
      }

      // Transaction dedup check (UPI / IMPS ref)
      const parsedTx: ParsedEmailTransaction = outcome;
      if (parsedTx.upi_ref_no) {
        const { data: existingUpi } = await serviceSupabase
          .from('transactions')
          .select('id')
          .eq('upi_ref_no', parsedTx.upi_ref_no)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (existingUpi) {
          continue; // Silent dedup skip
        }
      } else if (parsedTx.imps_ref_no) {
        const { data: existingImps } = await serviceSupabase
          .from('transactions')
          .select('id')
          .eq('imps_ref_no', parsedTx.imps_ref_no)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (existingImps) {
          continue; // Silent dedup skip
        }
      }

      // Step 6: Rules BEFORE AI categorisation
      const debit = parsedTx.direction === 'debit' ? parsedTx.amount : null;
      const credit = parsedTx.direction === 'credit' ? parsedTx.amount : null;
      let txnType: 'expense' | 'income' | 'transfer' | 'refund' =
        parsedTx.direction === 'debit' ? 'expense' : 'income';
      let categoryId: string | null = null;
      let workspaceId: string | null = null;
      let tags: string[] | null = null;
      let status: 'confirmed' | 'review' = 'review';

      const matchedRule = findFirstMatchingRule((rules || []) as TransactionRule[], {
        description: parsedTx.payee_name,
        reference_number: parsedTx.upi_ref_no || parsedTx.imps_ref_no,
        debit,
        credit,
        txn_type: txnType,
      });

      if (matchedRule) {
        if (matchedRule.set_category) categoryId = matchedRule.set_category;
        if (matchedRule.set_workspace) workspaceId = matchedRule.set_workspace;
        if (matchedRule.set_txn_type) txnType = matchedRule.set_txn_type;
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
          status = aiCat.confidence > 0.75 ? 'confirmed' : 'review';
        }
      }

      // Step 7: Insert transaction (using Zaboraa schema columns)
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
          reference_number: parsedTx.upi_ref_no || parsedTx.imps_ref_no,
          upi_ref_no: parsedTx.upi_ref_no,
          imps_ref_no: parsedTx.imps_ref_no,
          source: 'gmail_auto',
          status,
          category_id: categoryId,
          workspace_id: workspaceId,
          txn_type: txnType,
          is_transfer: false,
          is_self_transfer: false,
          is_manual: false,
          tags,
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

      // Step 8: Update account current_balance if balance_after was extracted
      if (parsedTx.balance_after !== null && parsedTx.balance_after !== undefined) {
        await serviceSupabase
          .from('accounts')
          .update({
            current_balance: parsedTx.balance_after,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedAccount.id)
          .eq('user_id', userId);
      }
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
