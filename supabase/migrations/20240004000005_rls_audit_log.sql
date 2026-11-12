-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240004000005_rls_audit_log.sql
-- Description: SELECT-only Row-Level Security for audit_log table.
-- Users can only read their own audit logs; modifications are restricted to service role.
-- ==============================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own audit logs" ON audit_log;
CREATE POLICY "Users can read own audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
