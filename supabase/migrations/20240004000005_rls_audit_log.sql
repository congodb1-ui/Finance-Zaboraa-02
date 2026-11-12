-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240004000005_rls_audit_log.sql
-- Description: SELECT-only RLS for audit_log (users see only their own rows;
--              inserts and mutations are performed exclusively by server service-role).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own audit log entries" ON audit_log;
CREATE POLICY "Users can select own audit log entries"
  ON audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT, UPDATE, or DELETE policies for standard users.
-- Only service role can write audit events.
