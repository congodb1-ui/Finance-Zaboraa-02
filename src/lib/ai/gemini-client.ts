import { GoogleGenAI } from '@google/genai';

export interface AIError {
  error: true;
  message: string;
  code?: string;
}

export function isAIError(res: any): res is AIError {
  return res && typeof res === 'object' && res.error === true && typeof res.message === 'string';
}

export const GEMINI_MODELS = {
  // TODO: Verify against https://ai.google.dev/gemini-api/docs/models before Go-Live
  FLASH: 'gemini-2.5-flash',
  // TODO: Verify against https://ai.google.dev/gemini-api/docs/models before Go-Live
  PRO: 'gemini-2.5-pro',
} as const;

// Simple in-memory token bucket rate limiter: max 50 requests per 60 seconds
class TokenBucketRateLimiter {
  private maxTokens = 50;
  private tokens = 50;
  private lastRefill = Date.now();
  private refillIntervalMs = 60_000;

  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > this.refillIntervalMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  getRemaining(): number {
    return this.tokens;
  }
}

const rateLimiter = new TokenBucketRateLimiter();

/**
 * Server-only client initializer.
 * Never exposes GEMINI_API_KEY to the client bundle.
 */
function getAIClient(): GoogleGenAI | null {
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('placeholder')) {
    return null;
  }

  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Executes a call to gemini-2.5-flash (categorization, cleaning, anomaly detection, chat).
 * Strictly logs metadata only (never logs prompt contents).
 */
export async function callGeminiFlash(
  contents: string,
  config?: {
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
  }
): Promise<{ text: string; tokens?: number } | AIError> {
  return executeGeminiCall(GEMINI_MODELS.FLASH, contents, config);
}

/**
 * Executes a call to gemini-2.5-pro (monthly report narrative only).
 */
export async function callGeminiPro(
  contents: string,
  config?: {
    systemInstruction?: string;
    responseMimeType?: string;
  }
): Promise<{ text: string; tokens?: number } | AIError> {
  return executeGeminiCall(GEMINI_MODELS.PRO, contents, config);
}

/**
 * Common call executor with token bucket rate limiting, safe logging, and typed error handling.
 */
async function executeGeminiCall(
  model: string,
  contents: string,
  config?: any
): Promise<{ text: string; tokens?: number } | AIError> {
  // Check rate limit
  if (!rateLimiter.tryConsume()) {
    console.warn(`[Gemini AI] Rate limit reached (50 req/min). Request dropped.`);
    return {
      error: true,
      message: 'Gemini free-tier rate limit reached (50 requests/min). Please try again in a moment.',
      code: 'RATE_LIMIT_EXCEEDED',
    };
  }

  const ai = getAIClient();
  if (!ai) {
    return {
      error: true,
      message: 'GEMINI_API_KEY is not configured in the server environment.',
      code: 'MISSING_API_KEY',
    };
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: config || {},
    });

    const tokenCount =
      response.usageMetadata?.promptTokenCount ??
      response.usageMetadata?.totalTokenCount ??
      Math.ceil(contents.length / 4);

    // SECURITY: Log model, tokens, and timestamp ONLY — NEVER log the prompt content
    console.log(
      `[Gemini AI Success] Model: ${model} | Tokens: ${tokenCount} | Timestamp: ${new Date().toISOString()}`
    );

    const text = response.text || '';
    return {
      text,
      tokens: tokenCount,
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown error occurred while contacting Gemini API.';
    const errorCode = err?.status || err?.code || 'GEMINI_CALL_FAILED';

    console.error(
      `[Gemini AI Error] Model: ${model} | Code: ${errorCode} | Timestamp: ${new Date().toISOString()}`
    );

    return {
      error: true,
      message: errorMsg,
      code: String(errorCode),
    };
  }
}

/**
 * Pings Gemini with a minimal lightweight test prompt to verify API connectivity.
 */
export async function testGeminiConnection(): Promise<{
  success: boolean;
  message: string;
  model?: string;
  raw?: string;
}> {
  const ai = getAIClient();
  if (!ai) {
    return {
      success: false,
      message: 'GEMINI_API_KEY is not configured or is empty. Please set GEMINI_API_KEY in your environment.',
    };
  }

  try {
    const res = await callGeminiFlash('Respond with exactly the word "CONNECTED" in plain text.');
    if (isAIError(res)) {
      return {
        success: false,
        message: res.message,
      };
    }

    const reply = res.text.trim();
    return {
      success: true,
      message: 'Gemini API connection established successfully.',
      model: GEMINI_MODELS.FLASH,
      raw: reply,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to Gemini API.',
    };
  }
}
