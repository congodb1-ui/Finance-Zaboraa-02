import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { askYourDataChat } from '../../src/lib/ai/chat';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const question = (req.body?.question || '').trim();

    if (!question) {
      return res.status(400).json({ error: 'Question string is required.' });
    }

    const result = await askYourDataChat(question, undefined, req.supabase);

    return res.json({
      success: true,
      answer: result.answer,
      queryParams: result.queryParams,
      dataSummary: result.dataSummary,
    });
  } catch (err: any) {
    console.error('Chat API error:', err);
    return res.status(500).json({
      success: false,
      error: 'AI is currently unavailable. Try again later.',
    });
  }
}
