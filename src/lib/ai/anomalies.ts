import { callGeminiFlash, isAIError } from './gemini-client';
import { maskTransactionForAI } from './pii-mask';
import type { Transaction } from '../../types/transactions';

export type AnomalyType = 'large_amount' | 'possible_duplicate' | 'unusual_category' | 'unusual_timing';
export type AnomalySeverity = 'high' | 'medium' | 'low';

export interface DetectedAnomaly {
  transaction_id: string;
  anomaly_type: AnomalyType;
  explanation: string;
  severity: AnomalySeverity;
  transaction?: {
    id: string;
    txn_date: string;
    description: string;
    amount: number;
    txn_type: string | null;
  };
}

// In-memory cache for detected anomalies scoped per user_id
const userAnomalyCache = new Map<string, DetectedAnomaly[]>();

/**
 * Scans up to 90 days of transactions for financial anomalies using gemini-2.5-flash.
 * Strictly PII-masks all inputs.
 */
export async function detectAnomaliesWithAI(
  transactions: Transaction[],
  profileName?: string,
  userId?: string
): Promise<DetectedAnomaly[]> {
  const cacheKey = userId || transactions?.[0]?.user_id || '';
  const previousCached = cacheKey ? userAnomalyCache.get(cacheKey) || [] : [];

  if (!transactions || transactions.length === 0) return [];

  // Filter last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoffStr = ninetyDaysAgo.toISOString().split('T')[0];

  const recentTxns = transactions.filter((t) => t.txn_date >= cutoffStr).slice(0, 100);
  if (recentTxns.length === 0) return [];

  const maskedPayload = recentTxns.map((t) => {
    const masked = maskTransactionForAI(t, profileName);
    return {
      transaction_id: masked.id,
      date: masked.txn_date,
      description: masked.masked_description,
      debit: masked.debit,
      credit: masked.credit,
      type: masked.txn_type,
      category: t.category?.name || 'Uncategorized',
    };
  });

  const prompt = `You are a personal financial fraud and anomaly detection assistant for an Indian user.
Analyze the following list of transactions from the past 90 days.
Identify up to 5 genuine anomalies based on:
1. "large_amount": Significantly larger than typical spending or income
2. "possible_duplicate": Similar amounts and descriptions on consecutive or identical dates
3. "unusual_category": Merchant categorized unexpectedly or suspicious merchant pattern
4. "unusual_timing": Abnormal spike or repeated micro-charges

Return ONLY a valid JSON array conforming to this exact schema. Do NOT include markdown code blocks or explanations outside JSON.

Response schema:
[
  {
    "transaction_id": "<must match an ID from input>",
    "anomaly_type": "large_amount" | "possible_duplicate" | "unusual_category" | "unusual_timing",
    "explanation": "<Brief plain-English explanation, max 100 characters>",
    "severity": "high" | "medium" | "low"
  }
]

Transactions:
${JSON.stringify(maskedPayload, null, 2)}`;

  try {
    const res = await callGeminiFlash(prompt, {
      responseMimeType: 'application/json',
    });

    if (isAIError(res)) {
      console.warn('[Anomaly Detection Warning]', res.message);
      return previousCached;
    }

    const cleanedText = res.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    if (Array.isArray(parsed)) {
      const validAnomalies: DetectedAnomaly[] = [];

      for (const item of parsed) {
        if (!item.transaction_id) continue;
        const matchingTx = recentTxns.find((t) => t.id === item.transaction_id);
        if (!matchingTx) continue;

        const sev: AnomalySeverity =
          item.severity === 'high' || item.severity === 'medium' || item.severity === 'low'
            ? item.severity
            : 'medium';

        const type: AnomalyType = [
          'large_amount',
          'possible_duplicate',
          'unusual_category',
          'unusual_timing',
        ].includes(item.anomaly_type)
          ? item.anomaly_type
          : 'large_amount';

        validAnomalies.push({
          transaction_id: item.transaction_id,
          anomaly_type: type,
          explanation: (item.explanation || 'Unusual transaction detected').slice(0, 100),
          severity: sev,
          transaction: {
            id: matchingTx.id,
            txn_date: matchingTx.txn_date,
            description: matchingTx.description,
            amount: matchingTx.debit ?? matchingTx.credit ?? 0,
            txn_type: matchingTx.txn_type,
          },
        });
      }

      if (cacheKey) {
        userAnomalyCache.set(cacheKey, validAnomalies);
      }
      return validAnomalies;
    }
  } catch (err) {
    console.error('Failed to parse anomaly detection results:', err);
  }

  return previousCached;
}

export function getCachedAnomalies(userId?: string): DetectedAnomaly[] {
  if (!userId) return [];
  return [...(userAnomalyCache.get(userId) || [])];
}
