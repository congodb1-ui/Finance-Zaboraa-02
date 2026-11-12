import { NextRequest, NextResponse } from 'next/server';
import { testGeminiConnection } from '../../../../lib/ai/gemini-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await testGeminiConnection();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message || 'Error occurred while testing Gemini connection.',
      },
      { status: 500 }
    );
  }
}
