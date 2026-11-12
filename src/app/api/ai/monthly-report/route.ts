import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyReportWithAI } from '../../../../lib/ai/monthly-report';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const month = body.month; // Optional YYYY-MM

    const report = await generateMonthlyReportWithAI(month);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error('Monthly report API route error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to generate monthly AI report.',
      },
      { status: 500 }
    );
  }
}
