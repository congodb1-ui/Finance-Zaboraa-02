-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000004_invoices_v2.sql
-- Description: Extend existing invoices table for multi-currency billing, FX
--              realization, client/payment instruction links, immutable snapshots,
--              and extended status lifecycle.
-- ==============================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6),
  ADD COLUMN IF NOT EXISTS inr_equivalent numeric(18,2),
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS country char(2),
  ADD COLUMN IF NOT EXISTS tax_label text NOT NULL DEFAULT 'GST',
  ADD COLUMN IF NOT EXISTS seller_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS client_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS bank_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS amount_received numeric(18,2),
  ADD COLUMN IF NOT EXISTS inr_received numeric(18,2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_instruction_id uuid REFERENCES payment_instructions(id) ON DELETE SET NULL;

-- Extend status check to include partial and cancelled
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled'));

-- Unique invoice number per user
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_user_unique;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_number_user_unique
  UNIQUE (user_id, invoice_number);

-- Back-fill currency for existing rows
UPDATE invoices SET currency = 'INR' WHERE currency IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_linked_transaction_id ON invoices(linked_transaction_id);
