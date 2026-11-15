-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20240012000001_batch_4b_dedup_self_transfer.sql
-- Description: Batch 4b — Cross-source dedup columns (upi_ref_no, imps_ref_no,
--              source), balance_after, transfer_pair_id, is_self_transfer, and
--              review status on transactions / staged_transactions.
-- ==============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS upi_ref_no        text,
  ADD COLUMN IF NOT EXISTS imps_ref_no       text,
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'manual_upload'
    CHECK (source IN ('manual_upload', 'gmail_auto', 'statement_import')),
  ADD COLUMN IF NOT EXISTS balance_after     numeric(15,2),
  ADD COLUMN IF NOT EXISTS transfer_pair_id  uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_self_transfer  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'review'));

ALTER TABLE public.staged_transactions
  ADD COLUMN IF NOT EXISTS upi_ref_no   text,
  ADD COLUMN IF NOT EXISTS imps_ref_no  text,
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'manual_upload'
    CHECK (source IN ('manual_upload', 'gmail_auto', 'statement_import'));

CREATE INDEX IF NOT EXISTS idx_transactions_upi_ref
  ON public.transactions(upi_ref_no)
  WHERE upi_ref_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_imps_ref
  ON public.transactions(imps_ref_no)
  WHERE imps_ref_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source
  ON public.transactions(source);

CREATE INDEX IF NOT EXISTS idx_transactions_self_transfer
  ON public.transactions(is_self_transfer)
  WHERE is_self_transfer = true;
