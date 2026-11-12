import { callGeminiPro, isAIError } from './gemini-client';
import { maskForAI } from './pii-mask';
import { getTransactions } from '../actions/transactions';
import { getCategories } from '../actions/categories';

export interface MonthlyReportPayload {
  month: string; // YYYY-MM
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  workspaceSplit: {
    personal: number;
    business: number;
    mixed: number;
  };
  categoryTotals: Array<{ category: string; amount: number; percentage: number }>;
  topTransactions: Array<{ date: string; description: string; amount: number; type: string }>;
}

export interface GeneratedMonthlyReport {
  markdown: string;
  generatedAt: string;
  model: string;
  month: string;
  stats: MonthlyReportPayload;
}

/**
 * Compiles aggregated financial figures for a given month and generates a 300-500 word
 * executive narrative report using gemini-2.5-pro.
 */
export async function generateMonthlyReportWithAI(
  targetMonth?: string,
  profileName?: string,
  client?: any
): Promise<GeneratedMonthlyReport> {
  // Determine month (default to current month YYYY-MM or last active month)
  const month = targetMonth || new Date().toISOString().slice(0, 7);

  // Fetch ledger transactions
  const ledger = await getTransactions(
    {
      page: 1,
      pageSize: 300,
      filters: {
        startDate: `${month}-01`,
        endDate: `${month}-31`,
        accountIds: [],
        categoryIds: [],
        workspaceId: 'all',
        txnType: 'all',
        search: '',
      },
    },
    client
  );

  const txns = ledger.transactions;

  let totalIncome = 0;
  let totalExpense = 0;
  const workspaceSplit = { personal: 0, business: 0, mixed: 0 };
  const catMap: Record<string, number> = {};

  for (const t of txns) {
    if (t.is_transfer || t.txn_type === 'transfer') continue;

    if (t.txn_type === 'income' || (t.credit && t.credit > 0)) {
      totalIncome += t.credit || 0;
    } else {
      const amt = t.debit || 0;
      totalExpense += amt;

      const catName = t.category?.name || 'Other Living Expenses';
      catMap[catName] = (catMap[catName] || 0) + amt;

      const ws = t.workspace?.name?.toLowerCase() || 'personal';
      if (ws.includes('business')) workspaceSplit.business += amt;
      else if (ws.includes('mixed')) workspaceSplit.mixed += amt;
      else workspaceSplit.personal += amt;
    }
  }

  const categoryTotals = Object.entries(catMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Top 10 transactions by amount (PII-masked)
  const topTransactions = [...txns]
    .sort((a, b) => (b.debit ?? b.credit ?? 0) - (a.debit ?? a.credit ?? 0))
    .slice(0, 10)
    .map((t) => ({
      date: t.txn_date,
      description: maskForAI(t.description, profileName),
      amount: t.debit ?? t.credit ?? 0,
      type: t.debit ? 'debit' : 'credit',
    }));

  const payload: MonthlyReportPayload = {
    month,
    totalIncome,
    totalExpense,
    netSavings: totalIncome - totalExpense,
    workspaceSplit,
    categoryTotals: categoryTotals.slice(0, 8),
    topTransactions,
  };

  const prompt = `You are an elite personal accountant and financial analyst for an Indian professional.
Generate a structured, professional narrative financial review (300 to 500 words) for the month of ${month}.
Format your response in clean Markdown with clear headings (##, ###), bullet points, and bold emphasis.

Cover the following 4 sections:
1. Executive Summary: High-level overview of income vs outflow and net cash flow in Indian Rupees (INR).
2. Spending Patterns & Category Distribution: Breakdown of where the money went and standout expense categories.
3. Business vs Personal Allocation: Comparison of professional business operations vs personal living expenses.
4. Strategic Cost Reduction & Tax Opportunities: 2-3 actionable, realistic recommendations to optimize savings or tax deductions.

Data for the month:
${JSON.stringify(payload, null, 2)}

Tone: Objective, disciplined, private vault accounting style.
Avoid generic fluff. Reference the actual category figures from the data.`;

  let markdownReport = `## Monthly Financial Review — ${month}

### Executive Summary
During ${month}, total income stood at ₹${payload.totalIncome.toLocaleString('en-IN')}, against total disbursements of ₹${payload.totalExpense.toLocaleString('en-IN')}, resulting in a net cash flow of ₹${payload.netSavings.toLocaleString('en-IN')}.

### Spending Patterns
Your largest expense categories were ${payload.categoryTotals.slice(0, 3).map((c) => `${c.category} (₹${c.amount.toLocaleString('en-IN')})`).join(', ')}.

### Workspace Allocation
- **Personal Living Expenses:** ₹${payload.workspaceSplit.personal.toLocaleString('en-IN')}
- **Business Operations:** ₹${payload.workspaceSplit.business.toLocaleString('en-IN')}

### Actionable Takeaways
1. Monitor recurring software and dining subscriptions to reduce discretionary outflow.
2. Ensure all consulting receipts and office expenses are flagged with proper invoices for year-end ITR claims.`;

  try {
    const res = await callGeminiPro(prompt);
    if (!isAIError(res) && res.text.trim()) {
      markdownReport = res.text.trim();
    }
  } catch (err) {
    console.warn('Gemini Pro report generation fallback triggered:', err);
  }

  return {
    markdown: markdownReport,
    generatedAt: new Date().toISOString(),
    model: 'gemini-2.5-pro',
    month,
    stats: payload,
  };
}
