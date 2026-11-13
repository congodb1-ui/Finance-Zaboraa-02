-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240009000002_ai_settings.sql
-- Description: Create ai_settings table for user AI master toggle and feature
--              preferences. Never stores any API key.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_enabled      boolean NOT NULL DEFAULT true,
  feature_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_user_id ON ai_settings(user_id);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at_ai_settings ON ai_settings;
CREATE TRIGGER handle_updated_at_ai_settings BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS Policies (user owns their own row)
DROP POLICY IF EXISTS "Users can select own ai_settings" ON ai_settings;
CREATE POLICY "Users can select own ai_settings"
  ON ai_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai_settings" ON ai_settings;
CREATE POLICY "Users can insert own ai_settings"
  ON ai_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ai_settings" ON ai_settings;
CREATE POLICY "Users can update own ai_settings"
  ON ai_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
