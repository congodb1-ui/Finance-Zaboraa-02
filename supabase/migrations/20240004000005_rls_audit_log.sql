-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240004000005_rls_audit_log.sql
-- Description: SELECT-only RLS for audit_log (users see only their own rows;
--              inserts and mutations are performed exclusively by server service-role).
-- ==============================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own audit logs" ON audit_log;
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON audit_log;
DROP POLICY IF EXISTS "Users can select own audit log entries" ON audit_log;

CREATE POLICY "Users can select own audit log entries"
  ON audit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT, UPDATE, or DELETE policies for standard users.
-- Only service role or database triggers can write audit events.
