-- Migration: 20240007000000_recurring.sql
-- Description: Recurring transactions schema with RLS and updated_at trigger

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description     text NOT NULL,
  amount          numeric(15,2) NOT NULL,
  txn_type        text NOT NULL CHECK (txn_type IN ('expense','income')),
  category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  frequency       text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  next_due_date   date NOT NULL,
  last_seen_date  date,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

-- Updated at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS Policies (Full CRUD scoped to user_id)
CREATE POLICY "Users can view their own recurring transactions"
  ON recurring_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring transactions"
  ON recurring_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring transactions"
  ON recurring_transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring transactions"
  ON recurring_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_recurring_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next_due_date ON recurring_transactions(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_transactions(is_active);
