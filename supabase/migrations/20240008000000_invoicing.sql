-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240008000000_invoicing.sql
-- Description: Create invoices table for client invoicing, GST tracking,
--              status management, and strict Row-Level Security.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number  text NOT NULL,
  client_name     text NOT NULL,
  client_email    text,
  issue_date      date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  line_items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal        numeric(15,2) NOT NULL DEFAULT 0,
  tax_percent     numeric(5,2) NOT NULL DEFAULT 18.00,
  total           numeric(15,2) NOT NULL DEFAULT 0,
  status          text NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue')) DEFAULT 'draft',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at_invoices BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS Policies
DROP POLICY IF EXISTS "Users can select own invoices" ON invoices;
CREATE POLICY "Users can select own invoices"
  ON invoices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;
CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  USING (auth.uid() = user_id);
