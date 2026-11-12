import { NextRequest, NextResponse } from 'next/server';
import { askYourDataChat } from '../../../../lib/ai/chat';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = (body.question || '').trim();

    if (!question) {
      return NextResponse.json({ error: 'Question string is required.' }, { status: 400 });
    }

    // Call server-side chat controller
    const result = await askYourDataChat(question);

    return NextResponse.json({
      success: true,
      answer: result.answer,
      queryParams: result.queryParams,
      dataSummary: result.dataSummary,
    });
  } catch (err: any) {
    console.error('Chat API error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'AI is currently unavailable. Try again later.',
        details: err.message,
      },
      { status: 500 }
    );
  }
}
