export interface AnalyticsMonthRow {
  month: string; // e.g. 'Apr 2025'
  income: number;
  expense: number;
  net: number;
  txnCount: number;
}

export interface AnalyticsCategoryRow {
  category: string;
  type: 'income' | 'expense';
  total: number;
  txnCount: number;
  pct: number;
}

export interface AnalyticsAccountRow {
  nickname: string;
  bank: string;
  type: string;
  totalIn: number;
  totalOut: number;
  net: number;
}

export interface AnalyticsPayeeRow {
  payee: string;
  total: number;
  txnCount: number;
}

export interface AnalyticsLargeTransactionRow {
  date: string;
  amount: number;
  payee: string;
  category: string;
  account: string;
}

export interface AnalyticsUnusualTransactionRow {
  date: string;
  amount: number;
  payee: string;
  reason: string;
}

export interface AnalyticsWorkspaceSummaryRow {
  name: string;
  income: number;
  expense: number;
}

export interface AnalyticsSummaryPayload {
  period: {
    from: string;
    to: string;
    months: number;
  };
  totals: {
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    savingsRate: number;
  };
  byMonth: AnalyticsMonthRow[];
  byCategory: AnalyticsCategoryRow[];
  byAccount: AnalyticsAccountRow[];
  topPayees: AnalyticsPayeeRow[];
  largeTransactions: AnalyticsLargeTransactionRow[];
  unusualTransactions: AnalyticsUnusualTransactionRow[];
  selfTransferSummary: {
    count: number;
    totalVolume: number;
  };
  itSummary: {
    businessIncome: number;
    businessExpense: number;
    personalIncome: number;
    personalExpense: number;
    workspaces: AnalyticsWorkspaceSummaryRow[];
  };
}

export interface AnalyticsReportJson {
  executiveSummary: string;
  incomeAnalysis: {
    summary: string;
    trend: string;
    keyInsight: string;
  };
  expenseAnalysis: {
    summary: string;
    topCategories: string;
    keyInsight: string;
  };
  savingsAnalysis: {
    summary: string;
    averageMonthlySavings: string;
    bestMonth: string;
    worstMonth: string;
    keyInsight: string;
  };
  cashFlowPatterns: string;
  anomaliesAndAlerts: string[];
  itrRelevantNotes: string;
  recommendations: string[];
  overallHealthScore: number;
}

export interface AnalyticsReportRecord {
  id: string;
  user_id: string;
  generated_at: string;
  period_from: string | null;
  period_to: string | null;
  txn_count: number;
  report_json: AnalyticsReportJson;
  summary_json: AnalyticsSummaryPayload;
  model_used: string;
  created_at: string;
}
