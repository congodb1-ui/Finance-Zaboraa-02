-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000002_clients.sql
-- Description: Create clients table for domestic and international invoicing
--              recipients with billing currency and payment terms.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  country char(2),
  address text,
  city text,
  email text,
  phone text,
  tax_id text,
  default_currency char(3) NOT NULL DEFAULT 'USD',
  payment_terms_days integer NOT NULL DEFAULT 30,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id_name ON clients(user_id, name);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at_clients ON clients;
CREATE TRIGGER handle_updated_at_clients BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP POLICY IF EXISTS "Users can select own clients" ON clients;
CREATE POLICY "Users can select own clients"
  ON clients FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own clients" ON clients;
CREATE POLICY "Users can insert own clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own clients" ON clients;
CREATE POLICY "Users can update own clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own clients" ON clients;
CREATE POLICY "Users can delete own clients"
  ON clients FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
