-- ==============================================================================
-- Zaboraa Finance
-- Migration: 20240009000005_ai_settings_report_cache.sql
-- Description: Add monthly report cache and dismissed anomaly IDs to ai_settings.
-- ==============================================================================

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS monthly_report_last_run_at timestamptz;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS monthly_report_cache jsonb;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS dismissed_anomaly_ids uuid[] DEFAULT '{}';
