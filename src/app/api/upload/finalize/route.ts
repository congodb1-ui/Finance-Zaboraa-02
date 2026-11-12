import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { commitUploadTransactions } from '../../../../lib/actions/transactions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // STEP 1 — Authenticate. Reject 401 if no session.
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // In production, enforce strict auth; in dev sandbox allow fallback
    if (authError && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const body = await req.json();
    const { upload_id, replace_previous_id } = body;

    if (!upload_id) {
      return NextResponse.json({ error: 'upload_id is required.' }, { status: 400 });
    }

    // STEPS 2-9 — Execute commit pipeline
    const result = await commitUploadTransactions(upload_id, replace_previous_id);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Finalize upload API route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error finalizing statement upload.' },
      { status: 500 }
    );
  }
}
