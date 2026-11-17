import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ALLOWED_AUTO_CATEGORIES,
  ALLOWED_CATEGORY_NAMES,
  normalizeAllowedCategoryName,
} from '../../src/lib/auto-categorize/constants';
import {
  detectPersonName,
  detectSelfOrFamilyTransfer,
  groupTransactionsByMerchant,
  normalizeMerchantKey,
} from '../../src/lib/auto-categorize/merchant-grouping';
import { classifyMerchantGroups } from '../../src/lib/auto-categorize/ai-classify';
import {
  applyAutoCategorizeBatch,
  previewUploadCategorization,
  revertAutoCategorizeBatch,
  runAutoCategorizeAnalysis,
  saveAutoCategorizeDraft,
  updateStagedCategoryChoice,
} from '../../src/lib/auto-categorize/service';
import { evaluateRuleMatch, findFirstMatchingRule } from '../../src/lib/rules-engine';
import * as geminiClient from '../../src/lib/ai/gemini-client';
import type { Category } from '../../src/types/categories';
import type { TransactionRule } from '../../src/types/transactions';

function createInMemorySupabase(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    categories: [],
    accounts: [],
    transactions: [],
    transaction_rules: [],
    profiles: [{ id: 'prof-1', user_id: 'user-1', full_name: 'Wasim Sayyed', owner_full_name: 'Wasim Sayyed' }],
    family_members: [],
    audit_log: [],
    auto_categorization_batches: [],
    statement_uploads: [],
    staged_transactions: [],
    ...seed,
  };

  let idSeq = 1;

  function makeBuilder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    const filters: Array<(r: any) => boolean> = [];
    const orders: Array<{ col: string; ascending: boolean }> = [];
    let limitNum: number | null = null;
    let rangeTuple: [number, number] | null = null;
    let singleMode: 'single' | 'maybeSingle' | null = null;

    const builder: any = {
      select() {
        return builder;
      },
      insert(rows: any) {
        op = 'insert';
        payload = rows;
        return builder;
      },
      update(patch: any) {
        op = 'update';
        payload = patch;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col: string, val: any) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: any) {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      in(col: string, vals: any[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      or(expr: string) {
        const clauses = expr.split(',').map((c) => c.trim());
        filters.push((r) =>
          clauses.some((cl) => {
            const [col, opName, rawVal] = cl.split('.');
            const v = rawVal === 'true' ? true : rawVal === 'false' ? false : rawVal;
            return opName === 'eq' ? r[col] === v : true;
          })
        );
        return builder;
      },
      order(col: string, opts: { ascending?: boolean } = {}) {
        orders.push({ col, ascending: opts.ascending !== false });
        return builder;
      },
      limit(n: number) {
        limitNum = n;
        return builder;
      },
      range(from: number, to: number) {
        rangeTuple = [from, to];
        return builder;
      },
      single() {
        singleMode = 'single';
        return builder;
      },
      maybeSingle() {
        singleMode = 'maybeSingle';
        return builder;
      },
      then(onFulfilled: any, onRejected: any) {
        try {
          if (!tables[table]) tables[table] = [];
          const now = new Date().toISOString();
          let out: any[] = [];

          if (op === 'insert') {
            const arr = Array.isArray(payload) ? payload : [payload];
            const inserted = arr.map((item) => ({
              id: item.id || `${table}-${idSeq++}`,
              created_at: item.created_at || now,
              updated_at: item.updated_at || now,
              ...item,
            }));
            tables[table].push(...inserted);
            out = inserted;
          } else if (op === 'update') {
            tables[table] = tables[table].map((r) => {
              if (filters.every((fn) => fn(r))) {
                const updated = { ...r, ...payload, updated_at: now };
                out.push(updated);
                return updated;
              }
              return r;
            });
          } else if (op === 'delete') {
            tables[table] = tables[table].filter((r) => {
              if (filters.every((fn) => fn(r))) {
                out.push(r);
                return false;
              }
              return true;
            });
          } else {
            out = tables[table].filter((r) => filters.every((fn) => fn(r)));
          }

          if (orders.length > 0) {
            out = [...out].sort((a, b) => {
              for (const o of orders) {
                if (a[o.col] === b[o.col]) continue;
                if (a[o.col] < b[o.col]) return o.ascending ? -1 : 1;
                return o.ascending ? 1 : -1;
              }
              return 0;
            });
          }

          if (rangeTuple) {
            out = out.slice(rangeTuple[0], rangeTuple[1] + 1);
          } else if (limitNum !== null) {
            out = out.slice(0, limitNum);
          }

          let res: any;
          if (singleMode === 'single') {
            res = out.length > 0 ? { data: out[0], error: null } : { data: null, error: { message: 'Not found' } };
          } else if (singleMode === 'maybeSingle') {
            res = { data: out[0] || null, error: null };
          } else {
            res = { data: out, error: null };
          }
          return Promise.resolve(res).then(onFulfilled, onRejected);
        } catch (err) {
          return Promise.reject(err).then(onFulfilled, onRejected);
        }
      },
    };
    return builder;
  }

  return {
    tables,
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

const CANONICAL_CATS: Category[] = ALLOWED_AUTO_CATEGORIES.map((c, idx) => ({
  id: `cat-${idx + 1}`,
  user_id: 'user-1',
  name: c.name,
  icon: c.icon,
  color_index: c.color_index,
  is_income: c.is_income,
  is_system: true,
  created_at: '2026-01-01T00:00:00Z',
}));

describe('Auto-Categorization — Taxonomy & Merchant Grouping', () => {
  it('enforces the exact 13 allowed categories and falls back unknown names to Other', () => {
    expect(ALLOWED_CATEGORY_NAMES).toHaveLength(13);
    expect(ALLOWED_CATEGORY_NAMES).toEqual([
      'Food & Groceries',
      'Pharmacy / Health',
      'Fuel / Petrol',
      'Transport / Vehicle',
      'Rent & Utilities',
      'Shopping',
      'Entertainment',
      'Business Expense',
      'Business Income',
      'Salary / Income',
      'Family Transfer',
      'Bank Charges',
      'Other',
    ]);
    expect(normalizeAllowedCategoryName('Invented AI Category')).toBe('Other');
    expect(normalizeAllowedCategoryName('pharmacy / health')).toBe('Pharmacy / Health');
  });

  it('collapses spelling, UPI, PaytmQR, and case variants into one canonical merchant', () => {
    expect(normalizeMerchantKey('RELIEF CHEMIST')).toBe('RELIEF CHEMIST');
    expect(normalizeMerchantKey('UPI-RELIEF CHEMIST-PAYTMQR281005050101X1Y2@PAYTM')).toBe('RELIEF CHEMIST');
    expect(normalizeMerchantKey('Relief Chemist')).toBe('RELIEF CHEMIST');

    expect(normalizeMerchantKey('BHAWANI SUPER MARKET')).toBe('BHAWANI SUPER MARKET');
    expect(normalizeMerchantKey('Bhawani Super Market')).toBe('BHAWANI SUPER MARKET');

    expect(normalizeMerchantKey('WESTERN BAKERY AND GENERAL STORES')).toBe('WESTERN BAKERY AND GENERAL STORES');
    expect(normalizeMerchantKey('Western Bakery & General Stores')).toBe('WESTERN BAKERY AND GENERAL STORES');

    expect(normalizeMerchantKey('SHEETAL PETROLEUM')).toBe('SHEETAL PETROLEUM');
    expect(normalizeMerchantKey('Sheetal Petroleum')).toBe('SHEETAL PETROLEUM');
  });

  it('flags person names strictly as isPersonName even across variants', () => {
    expect(detectPersonName('NASEEMUSSAHAR SAJID PERWEZ ANSARI')).toBe(true);
    expect(detectPersonName('SALIM GAFFAR SAYYED')).toBe(true);
    expect(detectPersonName('WASIM SALIM SAYYED')).toBe(true);

    expect(detectPersonName('RELIEF CHEMIST')).toBe(false);
    expect(detectPersonName('BHAWANI SUPER MARKET')).toBe(false);
    expect(detectPersonName('WESTERN BAKERY AND GENERAL STORES')).toBe(false);
    expect(detectPersonName('SHEETAL PETROLEUM')).toBe(false);
  });

  it('detects self and family transfers accurately', () => {
    const accounts = [{ id: 'a1', name: 'HDFC Savings', account_number_last4: '4821', account_holder_name: 'Wasim Sayyed' }];
    expect(detectSelfOrFamilyTransfer('TRANSFER TO WASIM SAVING', [], accounts, 'Wasim Sayyed', [])).toBe(true);
    expect(detectSelfOrFamilyTransfer('SELF TRANSFER TO OWN ACCOUNT', [], accounts, 'Wasim Sayyed', [])).toBe(true);
    expect(detectSelfOrFamilyTransfer('FAMILY TRANSFER', [], accounts, 'Wasim Sayyed', [])).toBe(true);
  });

  it('groups transactions with stats sorted highest-spend first and masks PII', () => {
    const accounts = [
      { id: 'acc-p', name: 'HDFC Personal', purpose: 'personal', operated_by_owner: true },
      { id: 'acc-b', name: 'ICICI Business', purpose: 'business', operated_by_owner: true },
    ];
    const txns = [
      { id: 't1', account_id: 'acc-p', txn_date: '2026-01-05', description: 'RELIEF CHEMIST', raw_description: 'UPI-RELIEF CHEMIST-PAN ABCDE1234F', debit: 500, credit: null },
      { id: 't2', account_id: 'acc-p', txn_date: '2026-01-20', description: 'UPI-RELIEF CHEMIST-PAYTMQR123@PAYTM', raw_description: 'UPI', debit: 1500, credit: null },
      { id: 't3', account_id: 'acc-p', txn_date: '2026-02-01', description: 'Relief Chemist', raw_description: '', debit: 1000, credit: null },
      { id: 't4', account_id: 'acc-p', txn_date: '2026-01-10', description: 'SHEETAL PETROLEUM', raw_description: '', debit: 4500, credit: null },
      { id: 't5', account_id: 'acc-b', txn_date: '2026-01-12', description: 'SHEETAL PETROLEUM', raw_description: '', debit: 2500, credit: null },
    ];

    const groups = groupTransactionsByMerchant(txns, accounts);
    expect(groups).toHaveLength(2);
    // Highest spend first: Sheetal Petroleum (7000) before Relief Chemist (3000)
    expect(groups[0].merchantKey).toBe('SHEETAL PETROLEUM');
    expect(groups[0].totalAmount).toBe(7000);
    expect(groups[0].isMixedPersonalAndBusiness).toBe(true);
    expect(groups[0].minAmount).toBe(2500);
    expect(groups[0].maxAmount).toBe(4500);
    expect(groups[0].avgAmount).toBe(3500);

    expect(groups[1].merchantKey).toBe('RELIEF CHEMIST');
    expect(groups[1].count).toBe(3);
    expect(groups[1].variants).toHaveLength(3);
    expect(groups[1].maskedSample).not.toContain('ABCDE1234F');
  });
});

describe('Auto-Categorization — AI Safety Gates & Classification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies key real-world merchants accurately and sends person names & mixed merchants to Needs Your Decision', async () => {
    vi.spyOn(geminiClient, 'callGeminiFlash').mockResolvedValue({
      text: JSON.stringify([
        { id: 'ACME CLIENT PAYOUT', category: 'Shopping', confidence: 'high', score: 0.9, is_transfer: false, reasoning: 'Test business credit guard' },
      ]),
    });

    const accounts = [
      { id: 'acc-p', name: 'HDFC Personal', purpose: 'personal', operated_by_owner: true },
      { id: 'acc-b', name: 'ICICI Business', purpose: 'business', operated_by_owner: true },
    ];

    const txns = [
      { id: 't1', account_id: 'acc-p', txn_date: '2026-01-01', description: 'UPI-RELIEF CHEMIST-PAYTMQR123@PAYTM', debit: 850, credit: null },
      { id: 't2', account_id: 'acc-p', txn_date: '2026-01-02', description: 'Bhawani Super Market', debit: 1200, credit: null },
      { id: 't3', account_id: 'acc-p', txn_date: '2026-01-03', description: 'Western Bakery And General Stores', debit: 450, credit: null },
      { id: 't4', account_id: 'acc-p', txn_date: '2026-01-04', description: 'Sheetal Petroleum', debit: 2000, credit: null },
      { id: 't5', account_id: 'acc-p', txn_date: '2026-01-05', description: 'MSEDCL MAHAVITARAN BILL', debit: 3400, credit: null },
      { id: 't6', account_id: 'acc-p', txn_date: '2026-01-06', description: 'SMS ALERT CHARGES', debit: 18, credit: null },
      { id: 't7', account_id: 'acc-p', txn_date: '2026-01-07', description: 'NASEEMUSSAHAR SAJID PERWEZ ANSARI', debit: 5000, credit: null },
      { id: 't8', account_id: 'acc-p', txn_date: '2026-01-08', description: 'SALIM GAFFAR SAYYED', debit: 6000, credit: null },
      { id: 't9', account_id: 'acc-p', txn_date: '2026-01-09', description: 'WASIM SALIM SAYYED', debit: 7000, credit: null },
      { id: 't10', account_id: 'acc-p', txn_date: '2026-01-10', description: 'AMAZON INDIA', debit: 900, credit: null },
      { id: 't11', account_id: 'acc-b', txn_date: '2026-01-11', description: 'AMAZON INDIA', debit: 1900, credit: null },
      { id: 't12', account_id: 'acc-b', txn_date: '2026-01-12', description: 'ACME CLIENT PAYOUT', debit: null, credit: 95000 },
      { id: 't13', account_id: 'acc-p', txn_date: '2026-01-13', description: 'TRANSFER TO WASIM SAVING', debit: 10000, credit: null },
    ];

    const groups = groupTransactionsByMerchant(txns, accounts, { ownerName: 'Wasim Sayyed' });
    const items = await classifyMerchantGroups(groups, [], CANONICAL_CATS, 'Wasim Sayyed');

    const byKey = new Map(items.map((i) => [i.merchantKey, i]));

    expect(byKey.get('RELIEF CHEMIST')?.suggestedCategoryName).toBe('Pharmacy / Health');
    expect(byKey.get('RELIEF CHEMIST')?.confidence).toBe('high');
    expect(byKey.get('RELIEF CHEMIST')?.needsDecision).toBe(false);

    expect(byKey.get('BHAWANI SUPER MARKET')?.suggestedCategoryName).toBe('Food & Groceries');
    expect(byKey.get('WESTERN BAKERY AND GENERAL STORES')?.suggestedCategoryName).toBe('Food & Groceries');
    expect(byKey.get('SHEETAL PETROLEUM')?.suggestedCategoryName).toBe('Fuel / Petrol');
    expect(byKey.get('MSEDCL MAHAVITARAN BILL')?.suggestedCategoryName).toBe('Rent & Utilities');
    expect(byKey.get('SMS ALERT CHARGES')?.suggestedCategoryName).toBe('Bank Charges');

    // Business credit never gets Shopping
    expect(byKey.get('ACME CLIENT PAYOUT')?.suggestedCategoryName).toBe('Business Income');

    // Person names ALWAYS go to Needs Your Decision
    for (const person of ['NASEEMUSSAHAR SAJID PERWEZ ANSARI', 'SALIM GAFFAR SAYYED', 'WASIM SALIM SAYYED']) {
      const pItem = byKey.get(person);
      expect(pItem?.isPersonName).toBe(true);
      expect(pItem?.needsDecision).toBe(true);
      expect(pItem?.decisionReasons).toContain('person_name');
    }

    // Mixed personal + business goes to Needs Your Decision with pending scope
    const mixed = byKey.get('AMAZON INDIA');
    expect(mixed?.isMixedPersonalAndBusiness).toBe(true);
    expect(mixed?.needsDecision).toBe(true);
    expect(mixed?.selectedScope).toBe('pending');
    expect(mixed?.decisionReasons).toContain('mixed_personal_business');

    // Transfer to Wasim Saving flagged as Transfer & Needs Your Decision
    const transfer = byKey.get('TRANSFER TO WASIM SAVING');
    expect(transfer?.isTransfer).toBe(true);
    expect(transfer?.needsDecision).toBe(true);
    expect(transfer?.suggestedCategoryName).toBe('Family Transfer');
  });

  it('strips PAN and sensitive tokens before sending to Gemini Flash', async () => {
    const aiSpy = vi.spyOn(geminiClient, 'callGeminiFlash').mockResolvedValue({
      text: JSON.stringify([{ id: 'UNKNOWN VENDOR', category: 'Other', confidence: 'low', score: 0.3, is_transfer: false, reasoning: 'Unknown' }]),
    });

    const accounts = [{ id: 'acc-p', name: 'HDFC', purpose: 'personal', operated_by_owner: true }];
    const txns = [
      {
        id: 't1',
        account_id: 'acc-p',
        txn_date: '2026-01-05',
        description: 'UNKNOWN VENDOR',
        raw_description: 'UNKNOWN VENDOR PAN ABCDE1234F A/C 998877665544 OTP 445566',
        debit: 500,
        credit: null,
      },
    ];

    const groups = groupTransactionsByMerchant(txns, accounts, { ownerName: 'Wasim Sayyed' });
    await classifyMerchantGroups(groups, [], CANONICAL_CATS, 'Wasim Sayyed');

    expect(aiSpy).toHaveBeenCalledTimes(1);
    const sentPrompt = aiSpy.mock.calls[0][0];
    expect(sentPrompt).not.toContain('ABCDE1234F');
    expect(sentPrompt).not.toContain('998877665544');
    expect(sentPrompt).not.toContain('445566');
  });
});

describe('Scoped Rules Engine & Full Batch Apply -> Revert -> Future Upload Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates scoped rules (personal, business, account) and canonical merchant_key accurately', () => {
    const personalRule: TransactionRule = {
      id: 'r1',
      user_id: 'user-1',
      name: 'Amazon Personal',
      priority: 10,
      match_field: 'description',
      match_type: 'contains',
      match_value: 'AMAZON',
      merchant_key: 'AMAZON',
      scope: 'personal',
      set_category: 'cat-shop',
      set_workspace: null,
      set_txn_type: 'expense',
      set_tags: null,
      is_active: true,
      created_at: '',
      updated_at: '',
    };

    expect(
      evaluateRuleMatch(personalRule, { description: 'UPI-AMAZON-PAYTMQR1@PAYTM' }, { id: 'acc-p', purpose: 'personal' })
    ).toBe(true);
    expect(
      evaluateRuleMatch(personalRule, { description: 'UPI-AMAZON-PAYTMQR1@PAYTM' }, { id: 'acc-b', purpose: 'business' })
    ).toBe(false);
  });

  it('returns clear empty message when user has 0 transactions', async () => {
    const db = createInMemorySupabase();
    const res = await runAutoCategorizeAnalysis(db, 'user-1');
    expect(res.empty).toBe(true);
    expect(res.message).toBe('Upload your bank statements first, then run analysis');
  });

  it('protects manual categories during Apply and Revert, blocks unresolved decisions, avoids duplicate rules, and learns on future uploads', async () => {
    const db = createInMemorySupabase({
      categories: [...CANONICAL_CATS],
      accounts: [
        { id: 'acc-p', user_id: 'user-1', name: 'HDFC Personal', purpose: 'personal', operated_by_owner: true },
        { id: 'acc-b', user_id: 'user-1', name: 'ICICI Business', purpose: 'business', operated_by_owner: true },
      ],
      transactions: [
        {
          id: 'tx-1',
          user_id: 'user-1',
          account_id: 'acc-p',
          txn_date: '2026-02-01',
          description: 'UPI-RELIEF CHEMIST-PAYTMQR99@PAYTM',
          debit: 600,
          credit: null,
          category_id: null,
          txn_type: 'expense',
          is_manual: false,
          category_source: null,
        },
        {
          id: 'tx-manual',
          user_id: 'user-1',
          account_id: 'acc-p',
          txn_date: '2026-02-02',
          description: 'RELIEF CHEMIST',
          debit: 250,
          credit: null,
          category_id: CANONICAL_CATS[0].id, // Food & Groceries set manually by owner!
          txn_type: 'expense',
          is_manual: true,
          category_source: 'manual',
        },
        {
          id: 'tx-person',
          user_id: 'user-1',
          account_id: 'acc-p',
          txn_date: '2026-02-03',
          description: 'SALIM GAFFAR SAYYED',
          debit: 4000,
          credit: null,
          category_id: null,
          txn_type: 'expense',
          is_manual: false,
          category_source: null,
        },
      ],
    });

    // 1. Analyze creates draft WITHOUT mutating real transactions or creating rules
    const analysis = await runAutoCategorizeAnalysis(db, 'user-1');
    expect(analysis.empty).toBe(false);
    expect(analysis.batch?.status).toBe('draft');
    expect(db.tables.transaction_rules).toHaveLength(0);
    expect(db.tables.transactions.find((t) => t.id === 'tx-1')?.category_id).toBeNull();
    expect(db.tables.transactions.find((t) => t.id === 'tx-manual')?.category_id).toBe(CANONICAL_CATS[0].id);

    // Save draft keeps everything untouched
    await saveAutoCategorizeDraft(db, 'user-1', analysis.batch!.id, analysis.items);
    expect(db.tables.transactions.find((t) => t.id === 'tx-1')?.category_id).toBeNull();

    // 2. Apply gate rejects if Needs Your Decision item is unresolved
    const itemsWithUnresolved = analysis.items.map((i) =>
      i.merchantKey === 'RELIEF CHEMIST' ? { ...i, approved: true } : i
    );
    await expect(
      applyAutoCategorizeBatch(db, 'user-1', analysis.batch!.id, itemsWithUnresolved)
    ).rejects.toThrow(/Needs Your Decision/i);

    // 3. Resolve SALIM GAFFAR SAYYED + approve RELIEF CHEMIST -> Apply succeeds
    const famTransferCat = CANONICAL_CATS.find((c) => c.name === 'Family Transfer')!;
    const resolvedItems = itemsWithUnresolved.map((i) => {
      if (i.merchantKey === 'SALIM GAFFAR SAYYED') {
        return {
          ...i,
          selectedCategoryName: 'Family Transfer',
          selectedCategoryId: famTransferCat.id,
          selectedScope: 'personal' as const,
          isTransfer: true,
          decisionResolved: true,
          approved: true,
        };
      }
      return i;
    });

    const applyRes = await applyAutoCategorizeBatch(db, 'user-1', analysis.batch!.id, resolvedItems);
    expect(applyRes.rulesCreated).toBe(2);
    expect(applyRes.transactionsCategorized).toBe(2);

    // Manual transaction MUST remain untouched!
    expect(db.tables.transactions.find((t) => t.id === 'tx-manual')?.category_id).toBe(CANONICAL_CATS[0].id);
    expect(db.tables.transactions.find((t) => t.id === 'tx-manual')?.category_source).toBe('manual');

    // Batch transactions updated with ai_batch metadata
    const pharmacyCat = CANONICAL_CATS.find((c) => c.name === 'Pharmacy / Health')!;
    expect(db.tables.transactions.find((t) => t.id === 'tx-1')?.category_id).toBe(pharmacyCat.id);
    expect(db.tables.transactions.find((t) => t.id === 'tx-1')?.category_source).toBe('ai_batch');
    expect(db.tables.transactions.find((t) => t.id === 'tx-person')?.is_transfer).toBe(true);

    // 4. Future upload uses existing rules FIRST and NEVER invokes AI for matched merchants
    const aiSpy = vi.spyOn(geminiClient, 'callGeminiFlash').mockResolvedValue({
      text: JSON.stringify([{ id: 'ZETA TECH CORP', category: 'Business Expense', confidence: 'high', score: 0.9, is_transfer: false, reasoning: 'Tech vendor' }]),
    });

    db.tables.statement_uploads.push({
      id: 'up-2',
      user_id: 'user-1',
      account_id: 'acc-p',
      status: 'staged',
    });
    db.tables.staged_transactions.push(
      {
        id: 'st-rule',
        upload_id: 'up-2',
        user_id: 'user-1',
        row_index: 1,
        txn_date: '2026-03-01',
        description: 'Relief Chemist',
        raw_description: 'UPI-RELIEF CHEMIST-PAYTMQR',
        debit: 400,
        credit: null,
      },
      {
        id: 'st-ai',
        upload_id: 'up-2',
        user_id: 'user-1',
        row_index: 2,
        txn_date: '2026-03-02',
        description: 'ZETA TECH CORP',
        raw_description: 'ZETA TECH CORP',
        debit: 320,
        credit: null,
      }
    );

    const previewRes = await previewUploadCategorization(db, 'user-1', 'up-2');
    const ruleStaged = previewRes.transactions.find((r: any) => r.id === 'st-rule');
    const aiStaged = previewRes.transactions.find((r: any) => r.id === 'st-ai');

    expect(ruleStaged.suggestion_source).toBe('rule');
    expect(ruleStaged.suggested_category_id).toBe(pharmacyCat.id);
    expect(aiStaged.suggestion_source).toBe('ai');
    // Gemini only called once for ZETA TECH CORP, never for Relief Chemist
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(aiSpy.mock.calls[0][0]).not.toContain('RELIEF CHEMIST');

    // User changes AI suggestion and clicks "Yes" to apply to future transactions
    const bizCat = CANONICAL_CATS.find((c) => c.name === 'Business Expense')!;
    const learnRes = await updateStagedCategoryChoice(db, 'user-1', 'st-ai', {
      category_id: bizCat.id,
      apply_to_future: true,
    });
    expect(learnRes.ruleCreated).toBe(true);
    expect(
      findFirstMatchingRule(db.tables.transaction_rules, { description: 'ZETA TECH CORP' })?.set_category
    ).toBe(bizCat.id);

    // 5. Revert batch resets batch transactions back to Uncategorized & deletes AI-batch rules, preserving manual categories
    const revertRes = await revertAutoCategorizeBatch(db, 'user-1', analysis.batch!.id);
    expect(revertRes.resetTransactions).toBe(2);
    expect(revertRes.deletedRules).toBe(2);

    expect(db.tables.transactions.find((t) => t.id === 'tx-1')?.category_id).toBeNull();
    expect(db.tables.transactions.find((t) => t.id === 'tx-person')?.category_id).toBeNull();
    // Manual category preserved!
    expect(db.tables.transactions.find((t) => t.id === 'tx-manual')?.category_id).toBe(CANONICAL_CATS[0].id);
    // Manual rule created from upload review ("ZETA TECH CORP") preserved!
    expect(db.tables.transaction_rules).toHaveLength(1);
    expect(db.tables.transaction_rules[0].source).toBe('manual');
  });
});
