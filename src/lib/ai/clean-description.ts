import { callGeminiFlash, isAIError } from './gemini-client';
import { maskForAI } from './pii-mask';
import type { Transaction } from '../../types/transactions';

export interface CleanedDescriptionResult {
  transaction_id: string;
  cleaned_description: string;
  original_description: string;
}

/**
 * Cleans a single machine-generated Indian banking narration into a human-readable merchant/payee label.
 * Max 60 characters. Falls back to original if AI fails or returns invalid text.
 */
export async function cleanDescriptionWithAI(
  rawNarration: string,
  profileName?: string
): Promise<string> {
  if (!rawNarration || rawNarration.trim().length === 0) return rawNarration;

  const masked = maskForAI(rawNarration, profileName);

  const prompt = `You are a financial narration cleaner for Indian bank and UPI statements.
Convert this raw bank narration into a clean, human-readable merchant, service, or payee label (max 60 characters).
If it is a known vendor (like Swiggy, Zomato, Uber, Amazon, Netflix, WeWork, Starbucks, DMart, etc.), include the merchant name and brief category in parentheses if obvious.
Never include transaction IDs, reference numbers, or bank codes.
Return ONLY the cleaned text string. No quotes, no markdown, no explanation.

Raw narration:
${masked}`;

  try {
    const res = await callGeminiFlash(prompt);
    if (isAIError(res)) {
      return rawNarration;
    }

    const cleaned = res.text.replace(/["`]/g, '').trim();

    // Confidence threshold: if Gemini returns something longer than 80 chars or identical to input, keep original
    if (!cleaned || cleaned.length > 80 || cleaned.toLowerCase() === rawNarration.toLowerCase()) {
      return rawNarration;
    }

    return cleaned.slice(0, 60);
  } catch {
    return rawNarration;
  }
}

/**
 * Batch cleans descriptions for newly imported statement rows.
 * Only processes rows where raw_description is present.
 * Batched in chunks of up to 30.
 */
export async function batchCleanDescriptionsWithAI(
  transactions: Transaction[],
  profileName?: string
): Promise<CleanedDescriptionResult[]> {
  const eligible = transactions.filter(
    (t) => t.raw_description && t.raw_description.trim().length > 0 && !t.is_manual
  );

  if (eligible.length === 0) return [];

  const results: CleanedDescriptionResult[] = [];
  const CHUNK_SIZE = 30;

  for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + CHUNK_SIZE);
    const maskedPayload = chunk.map((t) => ({
      id: t.id,
      raw: maskForAI(t.raw_description || t.description, profileName),
    }));

    const prompt = `You are an Indian bank narration cleaner.
Given a list of raw bank narrations, return a clean, human-readable merchant or payee label (max 60 chars) for each item.
Remove machine codes, UPI reference hashes, IFSC strings, and VPA tails.
Return ONLY a valid JSON array of objects with "id" and "cleaned". No markdown, no explanation.

Items:
${JSON.stringify(maskedPayload, null, 2)}

Response format:
[
  { "id": "<id>", "cleaned": "<clean label>" }
]`;

    try {
      const res = await callGeminiFlash(prompt, {
        responseMimeType: 'application/json',
      });

      if (!isAIError(res)) {
        const cleanedJson = res.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const originalTx = chunk.find((t) => t.id === item.id);
            if (!originalTx) continue;

            const cleanedLabel = (item.cleaned || '').trim();
            const finalDesc =
              cleanedLabel && cleanedLabel.length <= 80 && cleanedLabel.toLowerCase() !== originalTx.description.toLowerCase()
                ? cleanedLabel.slice(0, 60)
                : originalTx.description;

            results.push({
              transaction_id: originalTx.id,
              cleaned_description: finalDesc,
              original_description: originalTx.description,
            });
          }
        }
      }
    } catch (err) {
      console.warn('Batch clean descriptions chunk error:', err);
    }
  }

  return results;
}
