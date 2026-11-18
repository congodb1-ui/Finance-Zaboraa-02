-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20261117000001_fix_service_role_and_gmail_grants.sql
-- Description: Ensure service_role and authenticated have explicit table & sequence
--              grants across user-facing public tables, and allow authenticated
--              users to delete their own gmail_sync_log / email_parse_errors rows.
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_reports TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_parse_errors TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_sync_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_instructions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staged_transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_uploads TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

DROP POLICY IF EXISTS "gmail_sync_log: owner delete" ON public.gmail_sync_log;
CREATE POLICY "gmail_sync_log: owner delete"
  ON public.gmail_sync_log FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "email_parse_errors: owner delete" ON public.email_parse_errors;
CREATE POLICY "email_parse_errors: owner delete"
  ON public.email_parse_errors FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
