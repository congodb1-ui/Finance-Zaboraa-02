-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000007_rls_workspaces.sql
-- Description: Strict RLS policies for workspaces table (Personal vs Business)
-- ==============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own workspaces" ON workspaces;
CREATE POLICY "Users can select own workspaces"
  ON workspaces FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workspaces" ON workspaces;
CREATE POLICY "Users can insert own workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workspaces" ON workspaces;
CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own workspaces" ON workspaces;
CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE
  USING (auth.uid() = user_id);
