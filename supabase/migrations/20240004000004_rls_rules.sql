-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240004000004_rls_rules.sql
-- Description: Strict Row-Level Security for transaction_rules table.
-- ==============================================================================

ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own rules" ON transaction_rules;
CREATE POLICY "Users can select own rules"
  ON transaction_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own rules" ON transaction_rules;
CREATE POLICY "Users can insert own rules"
  ON transaction_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own rules" ON transaction_rules;
CREATE POLICY "Users can update own rules"
  ON transaction_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own rules" ON transaction_rules;
CREATE POLICY "Users can delete own rules"
  ON transaction_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
