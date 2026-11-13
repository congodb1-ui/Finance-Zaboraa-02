-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000003_payment_instructions.sql
-- Description: Create payment_instructions table for beneficiary bank/wire/UPI
--              details per currency with partial unique default constraint.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payment_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  beneficiary_name text NOT NULL,
  bank_name text,
  bank_address text,
  account_number_encrypted text,
  last4 char(4),
  iban_encrypted text,
  swift_bic text,
  ifsc text,
  intermediary_bank text,
  currency char(3) NOT NULL DEFAULT 'USD',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_instructions_user_id ON payment_instructions(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_instructions_default_per_currency
  ON payment_instructions (user_id, currency)
  WHERE is_default = true;

ALTER TABLE payment_instructions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at_payment_instructions ON payment_instructions;
CREATE TRIGGER handle_updated_at_payment_instructions BEFORE UPDATE ON payment_instructions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP POLICY IF EXISTS "Users can select own payment instructions" ON payment_instructions;
CREATE POLICY "Users can select own payment instructions"
  ON payment_instructions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own payment instructions" ON payment_instructions;
CREATE POLICY "Users can insert own payment instructions"
  ON payment_instructions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own payment instructions" ON payment_instructions;
CREATE POLICY "Users can update own payment instructions"
  ON payment_instructions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own payment instructions" ON payment_instructions;
CREATE POLICY "Users can delete own payment instructions"
  ON payment_instructions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
