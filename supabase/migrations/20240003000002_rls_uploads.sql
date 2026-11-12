-- Batch 3a: Row-Level Security for Uploads & Staged Transactions
-- Guarantees single-user isolation: users can only see and manipulate their own data

-- 1. statement_uploads RLS Policies
DROP POLICY IF EXISTS "Users can view their own statement uploads" ON statement_uploads;
CREATE POLICY "Users can view their own statement uploads"
  ON statement_uploads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own statement uploads" ON statement_uploads;
CREATE POLICY "Users can insert their own statement uploads"
  ON statement_uploads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own statement uploads" ON statement_uploads;
CREATE POLICY "Users can update their own statement uploads"
  ON statement_uploads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own statement uploads" ON statement_uploads;
CREATE POLICY "Users can delete their own statement uploads"
  ON statement_uploads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. staged_transactions RLS Policies
DROP POLICY IF EXISTS "Users can view their own staged transactions" ON staged_transactions;
CREATE POLICY "Users can view their own staged transactions"
  ON staged_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own staged transactions" ON staged_transactions;
CREATE POLICY "Users can insert their own staged transactions"
  ON staged_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own staged transactions" ON staged_transactions;
CREATE POLICY "Users can update their own staged transactions"
  ON staged_transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own staged transactions" ON staged_transactions;
CREATE POLICY "Users can delete their own staged transactions"
  ON staged_transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
