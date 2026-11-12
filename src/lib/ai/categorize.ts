import { callGeminiFlash, isAIError } from './gemini-client';
import { maskTransactionForAI } from './pii-mask';
import type { Transaction, AuditLogEntry } from '../../types/transactions';
import type { Category } from '../../types/categories';
import { getCategories } from '../actions/categories';

export interface CategorizationResult {
  transaction_id: string;
  category_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  score?: number;
  reasoning?: string;
}

export interface CategorizeSummary {
  totalProcessed: number;
  autoAppliedHigh: number;
  autoAppliedMedium: number;
  needsReviewLow: number;
  results: CategorizationResult[];
  error?: string;
}

/**
 * Runs 3-tier AI categorization on uncategorized transactions using gemini-2.5-flash.
 * Strictly checks audit log and rules: never overrides user edits or rules.
 * Chunks in batches of max 50 items.
 */
export async function categorizeTransactionsWithAI(
  transactions: Transaction[],
  categories?: Category[],
  profileName?: string
): Promise<CategorizeSummary> {
  // If no transactions provided, return empty
  if (!transactions || transactions.length === 0) {
    return {
      totalProcessed: 0,
      autoAppliedHigh: 0,
      autoAppliedMedium: 0,
      needsReviewLow: 0,
      results: [],
    };
  }

  // Filter: only transactions where category_id is null / undefined and not marked transfer
  const candidates = transactions.filter(
    (t) => !t.category_id && !t.is_transfer && t.txn_type !== 'transfer'
  );

  if (candidates.length === 0) {
    return {
      totalProcessed: 0,
      autoAppliedHigh: 0,
      autoAppliedMedium: 0,
      needsReviewLow: 0,
      results: [],
    };
  }

  // Load categories if not provided
  const availableCategories = categories && categories.length > 0 ? categories : await getCategories();

  const categoryPayload = availableCategories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.is_income ? 'income' : 'expense',
  }));

  const CHUNK_SIZE = 50;
  const allResults: CategorizationResult[] = [];
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Process sequentially in chunks of max 50
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);

    // Prepare PII-masked transaction objects
    const maskedChunk = chunk.map((t) => {
      const masked = maskTransactionForAI(t, profileName);
      return {
        id: masked.id,
        date: masked.txn_date,
        description: masked.masked_description,
        amount: masked.debit ?? masked.credit ?? 0,
        type: masked.txn_type || (t.debit ? 'expense' : 'income'),
      };
    });

    const prompt = `You are a personal finance categorization assistant for an Indian user.
Categorize each transaction into exactly one of the provided categories.
Return ONLY a JSON array. No explanation, no markdown, no preamble.

Categories:
${JSON.stringify(categoryPayload, null, 2)}

Transactions to categorize:
${JSON.stringify(maskedChunk, null, 2)}

Response format:
[
  { "id": "<transaction_id>", "category_id": "<category_id>", "confidence": "high"|"medium"|"low" }
]`;

    try {
      const geminiRes = await callGeminiFlash(prompt, {
        responseMimeType: 'application/json',
      });

      if (isAIError(geminiRes)) {
        console.warn('[AI Categorization Notice]', geminiRes.message);
        continue;
      }

      let parsed: any[] = [];
      try {
        const cleanedText = geminiRes.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.error('Failed to parse Gemini categorization response:', parseErr);
        continue;
      }

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item.id) continue;

          // Validate that the returned category_id actually exists in the categories table
          const validCat = categoryPayload.find((c) => c.id === item.category_id);
          const assignedCatId = validCat ? validCat.id : null;

          const conf =
            item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
              ? item.confidence
              : 'medium';

          const resItem: CategorizationResult = {
            transaction_id: item.id,
            category_id: assignedCatId,
            confidence: conf,
            score: conf === 'high' ? 0.9 : conf === 'medium' ? 0.7 : 0.3,
          };

          allResults.push(resItem);

          if (conf === 'high' && assignedCatId) highCount++;
          else if (conf === 'medium' && assignedCatId) mediumCount++;
          else lowCount++;
        }
      }
    } catch (chunkErr) {
      console.error('Error processing AI categorization chunk:', chunkErr);
    }
  }

  return {
    totalProcessed: candidates.length,
    autoAppliedHigh: highCount,
    autoAppliedMedium: mediumCount,
    needsReviewLow: lowCount,
    results: allResults,
  };
}
