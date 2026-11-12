-- Batch 4: Row-Level Security for Transactions, Rules, and Audit Log

-- 1. transactions RLS Policies (Full CRUD for owner)
DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON transactions;
CREATE POLICY "Users can insert their own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
CREATE POLICY "Users can update their own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own transactions" ON transactions;
CREATE POLICY "Users can delete their own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. transaction_rules RLS Policies (Full CRUD for owner)
DROP POLICY IF EXISTS "Users can view their own transaction rules" ON transaction_rules;
CREATE POLICY "Users can view their own transaction rules"
  ON transaction_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transaction rules" ON transaction_rules;
CREATE POLICY "Users can insert their own transaction rules"
  ON transaction_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own transaction rules" ON transaction_rules;
CREATE POLICY "Users can update their own transaction rules"
  ON transaction_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own transaction rules" ON transaction_rules;
CREATE POLICY "Users can delete their own transaction rules"
  ON transaction_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. audit_log RLS Policies (SELECT and INSERT only — APPEND-ONLY, NO UPDATE OR DELETE)
DROP POLICY IF EXISTS "Users can view their own audit logs" ON audit_log;
CREATE POLICY "Users can view their own audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON audit_log;
CREATE POLICY "Users can insert their own audit logs"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Note: No UPDATE or DELETE policies are defined for audit_log to enforce append-only ledger integrity

-- 4. Deferred foreign key on staged_transactions now that transactions table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_duplicate_of'
  ) THEN
    ALTER TABLE staged_transactions
      ADD CONSTRAINT fk_duplicate_of FOREIGN KEY (duplicate_of_id)
      REFERENCES transactions(id) ON DELETE SET NULL;
  END IF;
END $$;
