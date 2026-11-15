import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { encryptValue } from '../../src/lib/crypto';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const body = req.body || {};
    const payload: Record<string, any> = {
      user_id: req.user!.id,
    };

    if (body.full_name !== undefined) {
      payload.full_name = typeof body.full_name === 'string' ? body.full_name.trim() || null : null;
    }
    if (body.email !== undefined) {
      payload.email = typeof body.email === 'string' ? body.email.trim() || null : null;
    }
    if (body.phone !== undefined) {
      payload.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
    }
    if (body.address !== undefined) {
      payload.address = typeof body.address === 'string' ? body.address.trim() || null : null;
    }
    if (body.default_fy !== undefined) {
      payload.default_fy = body.default_fy || '2026-27';
    }
    if (body.dark_mode !== undefined) {
      payload.dark_mode = Boolean(body.dark_mode);
    }
    if (body.last_backup_at !== undefined) {
      payload.last_backup_at = body.last_backup_at;
    }

    const rawPan = typeof body.pan === 'string' ? body.pan.trim().toUpperCase() : '';
    if (!rawPan) {
      return res.status(400).json({ error: 'PAN is required.' });
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan)) {
      return res.status(400).json({
        error: 'Invalid PAN format. Expected 10-character format (e.g. ABCDE1234F).',
      });
    }

    payload.pan_encrypted = await encryptValue(rawPan);

    const { data: updated, error } = await req.supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error || !updated) {
      return res.status(500).json({
        error: error?.message || 'Failed to save encrypted PAN profile.',
      });
    }

    return res.json(updated);
  } catch (err: any) {
    const message = err?.message || 'Failed to encrypt and save PAN.';
    console.error('Save encrypted PAN error:', message);
    return res.status(500).json({ error: message });
  }
}
