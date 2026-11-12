-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000003_rls_accounts.sql
-- Description: Strict Row-Level Security (RLS) policies for accounts, categories,
--              and workspaces. Ensures complete single-user data isolation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Accounts RLS Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can select own accounts"
  ON accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. Categories RLS Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can select own categories"
  ON categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own non-system categories"
  ON categories FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

-- ------------------------------------------------------------------------------
-- 3. Workspaces RLS Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can select own workspaces"
  ON workspaces FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE
  USING (auth.uid() = user_id);
