-- Migration: 20240007000001_budgets.sql
-- Description: Budgets schema with RLS, uniqueness constraints, and updated_at trigger

CREATE TABLE IF NOT EXISTS budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES categories(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  period        text NOT NULL CHECK (period IN ('monthly','quarterly','yearly')),
  fy_year       text NOT NULL,              -- e.g. "2026-27"
  amount        numeric(15,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id, period, fy_year)
);

-- Enable Row Level Security
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Updated at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS Policies (Full CRUD scoped to user_id)
CREATE POLICY "Users can view their own budgets"
  ON budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets"
  ON budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets"
  ON budgets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets"
  ON budgets FOR DELETE
  USING (auth.uid() = user_id);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_fy_period ON budgets(fy_year, period);
