-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20240014000001_batch_6b_analytics_reports.sql
-- Description: Batch 6b — AI Analytics & Consolidated Report table
--              (analytics_reports) with owner-only RLS policies.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_from  date,
  period_to    date,
  txn_count    integer NOT NULL DEFAULT 0,
  report_json  jsonb NOT NULL,
  summary_json jsonb NOT NULL,
  model_used   text NOT NULL DEFAULT 'gemini-pro',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_reports_user_generated
  ON public.analytics_reports(user_id, generated_at DESC);

ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_reports: owner read" ON public.analytics_reports;
CREATE POLICY "analytics_reports: owner read"
  ON public.analytics_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "analytics_reports: owner insert" ON public.analytics_reports;
CREATE POLICY "analytics_reports: owner insert"
  ON public.analytics_reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "analytics_reports: owner delete" ON public.analytics_reports;
CREATE POLICY "analytics_reports: owner delete"
  ON public.analytics_reports FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
