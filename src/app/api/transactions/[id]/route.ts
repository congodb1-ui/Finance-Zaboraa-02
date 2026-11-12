import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { updateTransaction } from '../../../../lib/actions/transactions';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  context: { params?: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const resolvedParams = context.params instanceof Promise ? await context.params : context.params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json({ error: 'Transaction id is required.' }, { status: 400 });
    }

    const body = await req.json();

    // Sacred fields check: amounts, date, description are strictly non-editable
    if (body.debit !== undefined || body.credit !== undefined || body.balance !== undefined) {
      return NextResponse.json(
        { error: 'Transaction amounts are sacred and non-editable after import.' },
        { status: 400 }
      );
    }

    const updated = await updateTransaction(id, {
      category_id: body.category_id,
      workspace_id: body.workspace_id,
      tags: body.tags,
      notes: body.notes,
      txn_type: body.txn_type,
      is_transfer: body.is_transfer,
      transfer_pair_id: body.transfer_pair_id,
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Update transaction API route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error updating transaction.' },
      { status: 500 }
    );
  }
}
