-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240008000000_invoicing.sql
-- Description: Invoicing schema for client billing and business invoicing.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  client_name    text NOT NULL,
  client_email   text,
  issue_date     date NOT NULL DEFAULT CURRENT_DATE,
  due_date       date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  line_items     jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal       numeric(14, 2) NOT NULL DEFAULT 0.00,
  tax_percent    numeric(5, 2) NOT NULL DEFAULT 18.00,
  total          numeric(14, 2) NOT NULL DEFAULT 0.00,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at ON invoices;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- 4 Standard RLS Policies for Invoices
DROP POLICY IF EXISTS "Users can select own invoices" ON invoices;
CREATE POLICY "Users can select own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;
CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
