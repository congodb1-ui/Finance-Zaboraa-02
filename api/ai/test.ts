import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { testGeminiConnection } from '../../src/lib/ai/gemini-client';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const result = await testGeminiConnection();
    return res.json(result);
  } catch (err: any) {
    console.error('Gemini test connection error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to test AI connection.',
    });
  }
}
