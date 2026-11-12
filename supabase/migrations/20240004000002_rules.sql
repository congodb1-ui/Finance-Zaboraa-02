CREATE TABLE IF NOT EXISTS transaction_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  priority      int NOT NULL DEFAULT 100,
  match_field   text NOT NULL CHECK (match_field IN ('description','reference_number','amount','txn_type')),
  match_type    text NOT NULL CHECK (match_type IN ('contains','starts_with','exact','regex','gte','lte')),
  match_value   text NOT NULL,
  set_category  uuid REFERENCES categories(id) ON DELETE SET NULL,
  set_workspace uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  set_txn_type  text CHECK (set_txn_type IN ('expense','income','transfer','refund')),
  set_tags      text[],
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_rules_user_id ON transaction_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_priority ON transaction_rules(priority ASC);

ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at ON transaction_rules;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON transaction_rules
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
