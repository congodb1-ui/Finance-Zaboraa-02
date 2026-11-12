import { callGeminiFlash, isAIError } from './gemini-client';
import { maskForAI } from './pii-mask';
import { getTransactions } from '../actions/transactions';
import { getAccounts } from '../actions/accounts';
import { getCategories } from '../actions/categories';
import type { Transaction } from '../../types/transactions';

export interface AllowedQueryParams {
  date_from?: string; // ISO date YYYY-MM-DD
  date_to?: string; // ISO date YYYY-MM-DD
  account_ids?: string[]; // must exist in user's accounts
  category_ids?: string[]; // must exist in user's categories
  workspace?: 'personal' | 'business' | 'mixed' | 'all';
  txn_type?: 'expense' | 'income' | 'transfer' | 'refund';
  group_by?: 'category' | 'month' | 'account' | 'workspace';
  limit?: number; // max 100
  metric?: 'sum' | 'count' | 'avg';
  target_account_id?: string;
}

export interface ChatAnswerResponse {
  answer: string;
  queryParams: AllowedQueryParams;
  dataSummary: {
    totalRecordsFound: number;
    metricCalculated?: number;
    breakdown?: Record<string, number>;
    sampleItems?: Array<{ date: string; desc: string; amount: number }>;
  };
}

/**
 * Strict allowlist parameter sanitizer: rejects any unknown fields or SQL injection attempts.
 */
export function validateAndSanitizeQueryParams(
  raw: any,
  validAccountIds: string[],
  validCategoryIds: string[]
): AllowedQueryParams {
  const sanitized: AllowedQueryParams = {};

  if (!raw || typeof raw !== 'object') return sanitized;

  // 1. date_from
  if (typeof raw.date_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date_from)) {
    sanitized.date_from = raw.date_from;
  }

  // 2. date_to
  if (typeof raw.date_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date_to)) {
    sanitized.date_to = raw.date_to;
  }

  // 3. account_ids (must strictly exist in valid accounts)
  if (Array.isArray(raw.account_ids)) {
    sanitized.account_ids = raw.account_ids.filter((id: string) => validAccountIds.includes(id));
  }

  // 4. category_ids (must strictly exist in valid categories)
  if (Array.isArray(raw.category_ids)) {
    sanitized.category_ids = raw.category_ids.filter((id: string) => validCategoryIds.includes(id));
  }

  // 5. workspace
  if (['personal', 'business', 'mixed', 'all'].includes(raw.workspace)) {
    sanitized.workspace = raw.workspace;
  }

  // 6. txn_type
  if (['expense', 'income', 'transfer', 'refund'].includes(raw.txn_type)) {
    sanitized.txn_type = raw.txn_type;
  }

  // 7. group_by
  if (['category', 'month', 'account', 'workspace'].includes(raw.group_by)) {
    sanitized.group_by = raw.group_by;
  }

  // 8. limit (strictly capped at 100)
  if (typeof raw.limit === 'number' && raw.limit > 0) {
    sanitized.limit = Math.min(Math.floor(raw.limit), 100);
  }

  // 9. metric
  if (['sum', 'count', 'avg'].includes(raw.metric)) {
    sanitized.metric = raw.metric;
  }

  return sanitized;
}

/**
 * Executes a pre-written, parameterized query against the transaction ledger.
 * NO dynamic SQL strings are ever constructed or executed.
 */
export async function executePreWrittenQuery(
  params: AllowedQueryParams,
  allTransactions: Transaction[]
): Promise<ChatAnswerResponse['dataSummary']> {
  let filtered = [...allTransactions];

  // Apply date filters
  if (params.date_from) {
    filtered = filtered.filter((t) => t.txn_date >= params.date_from!);
  }
  if (params.date_to) {
    filtered = filtered.filter((t) => t.txn_date <= params.date_to!);
  }

  // Apply account filter
  if (params.account_ids && params.account_ids.length > 0) {
    filtered = filtered.filter((t) => params.account_ids!.includes(t.account_id));
  }

  // Apply category filter
  if (params.category_ids && params.category_ids.length > 0) {
    filtered = filtered.filter((t) => t.category_id && params.category_ids!.includes(t.category_id));
  }

  // Apply workspace filter
  if (params.workspace && params.workspace !== 'all') {
    filtered = filtered.filter((t) => {
      const wsName = t.workspace?.name?.toLowerCase() || '';
      return wsName.includes(params.workspace!);
    });
  }

  // Apply txn_type filter
  if (params.txn_type) {
    filtered = filtered.filter((t) => t.txn_type === params.txn_type);
  }

  // Calculate metrics
  let metricVal = 0;
  const amounts = filtered.map((t) => t.debit ?? t.credit ?? 0);
  const totalSum = amounts.reduce((acc, v) => acc + v, 0);

  if (params.metric === 'count') {
    metricVal = filtered.length;
  } else if (params.metric === 'avg') {
    metricVal = filtered.length > 0 ? totalSum / filtered.length : 0;
  } else {
    // Default: sum
    metricVal = totalSum;
  }

  // Group by aggregation
  const breakdown: Record<string, number> = {};
  if (params.group_by) {
    for (const t of filtered) {
      let key = 'Other';
      if (params.group_by === 'category') key = t.category?.name || 'Uncategorized';
      else if (params.group_by === 'month') key = t.txn_date.slice(0, 7);
      else if (params.group_by === 'workspace') key = t.workspace?.name || 'Personal';
      else if (params.group_by === 'account') key = t.account?.name || 'Account';

      const amt = t.debit ?? t.credit ?? 0;
      breakdown[key] = (breakdown[key] || 0) + amt;
    }
  }

  // Top sample items (sorted descending by amount)
  const sorted = [...filtered].sort(
    (a, b) => (b.debit ?? b.credit ?? 0) - (a.debit ?? a.credit ?? 0)
  );

  const limit = params.limit || 5;
  const sampleItems = sorted.slice(0, limit).map((t) => ({
    date: t.txn_date,
    desc: maskForAI(t.description),
    amount: t.debit ?? t.credit ?? 0,
  }));

  return {
    totalRecordsFound: filtered.length,
    metricCalculated: Math.round(metricVal * 100) / 100,
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
    sampleItems,
  };
}

/**
 * Ask-Your-Data Chat Controller
 * 7-step security architecture: Natural Language -> Parameters -> Validation -> Pre-written Query -> Natural Language Synthesis
 */
export async function askYourDataChat(
  userQuestion: string,
  profileName?: string,
  client?: any
): Promise<ChatAnswerResponse> {
  const [accounts, categories, ledger] = await Promise.all([
    getAccounts(client),
    getCategories(client),
    getTransactions(
      {
        page: 1,
        pageSize: 500,
        filters: {
          startDate: '2024-04-01',
          endDate: '2028-03-31',
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      },
      client
    ),
  ]);

  const accountMetadata = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryMetadata = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.is_income ? 'income' : 'expense',
  }));

  const todayStr = new Date().toISOString().split('T')[0];

  // STEP 2 & 3: Ask Gemini for parameter mapping ONLY (NO DATA SENT)
  const paramPrompt = `You are an Indian personal finance query planner.
Translate the user's natural language question into a structured JSON query parameter object.
DO NOT write SQL. DO NOT answer the question yet.
Only extract the filtering and aggregation parameters conforming to this schema.

Schema definition:
{
  "date_from": "YYYY-MM-DD",
  "date_to": "YYYY-MM-DD",
  "account_ids": ["string ids from valid accounts list"],
  "category_ids": ["string ids from valid categories list"],
  "workspace": "personal" | "business" | "mixed" | "all",
  "txn_type": "expense" | "income" | "transfer" | "refund",
  "group_by": "category" | "month" | "account" | "workspace",
  "limit": number (1 to 100),
  "metric": "sum" | "count" | "avg"
}

Reference Context:
Current Date: ${todayStr}
Valid Accounts: ${JSON.stringify(accountMetadata)}
Valid Categories: ${JSON.stringify(categoryMetadata)}

User Question:
"${userQuestion}"

Return ONLY a JSON object. No explanation.`;

  let extractedParams: AllowedQueryParams = {};

  try {
    const paramRes = await callGeminiFlash(paramPrompt, {
      responseMimeType: 'application/json',
    });

    if (!isAIError(paramRes)) {
      const cleanJson = paramRes.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      extractedParams = JSON.parse(cleanJson);
    }
  } catch (err) {
    console.warn('Parameter extraction failed, falling back to basic query:', err);
  }

  // STEP 4: Strict validation against allowlist
  const validAccountIds = accounts.map((a) => a.id);
  const validCategoryIds = categories.map((c) => c.id);
  const sanitizedParams = validateAndSanitizeQueryParams(
    extractedParams,
    validAccountIds,
    validCategoryIds
  );

  // STEP 5: Server executes pre-written parameterized query
  const querySummary = await executePreWrittenQuery(sanitizedParams, ledger.transactions);

  // STEP 6 & 7: Gemini generates natural language synthesis based on DB results
  const synthesisPrompt = `You are Zaboraa Finance's accounting assistant.
Answer the user's question clearly, concisely, and accurately based ONLY on the verified ledger query results provided below.
All financial numbers must come directly from this data. Format currency figures as Indian Rupees (e.g., ₹1,42,500).
Keep the response within 2-4 sentences.

User Question: "${userQuestion}"

Verified Query Results:
- Total records found: ${querySummary.totalRecordsFound}
- Calculated metric (${sanitizedParams.metric || 'sum'}): ₹${querySummary.metricCalculated || 0}
${
  querySummary.breakdown
    ? `- Breakdown: ${JSON.stringify(querySummary.breakdown)}`
    : ''
}
${
  querySummary.sampleItems && querySummary.sampleItems.length > 0
    ? `- Notable Items: ${JSON.stringify(querySummary.sampleItems)}`
    : ''
}

Respond in clean, friendly plain text.`;

  let finalAnswer = `Based on your records, the calculated total is ₹${(
    querySummary.metricCalculated || 0
  ).toLocaleString('en-IN')}.`;

  try {
    const answerRes = await callGeminiFlash(synthesisPrompt);
    if (!isAIError(answerRes) && answerRes.text.trim()) {
      finalAnswer = answerRes.text.trim();
    }
  } catch (err) {
    console.warn('Synthesis failed, using template answer:', err);
  }

  return {
    answer: finalAnswer,
    queryParams: sanitizedParams,
    dataSummary: querySummary,
  };
}
