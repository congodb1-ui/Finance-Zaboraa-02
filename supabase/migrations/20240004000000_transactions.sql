CREATE TABLE IF NOT EXISTS transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  upload_id         uuid REFERENCES statement_uploads(id) ON DELETE SET NULL,
  txn_date          date NOT NULL,
  description       text NOT NULL,
  raw_description   text,
  debit             numeric(15,2),
  credit            numeric(15,2),
  balance           numeric(15,2),
  reference_number  text,
  category_id       uuid REFERENCES categories(id) ON DELETE SET NULL,
  workspace_id      uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  txn_type          text CHECK (txn_type IN ('expense','income','transfer','refund','opening')),
  is_transfer       boolean NOT NULL DEFAULT false,
  transfer_pair_id  uuid,               -- links two legs of a transfer
  notes             text,
  tags              text[],
  is_manual         boolean NOT NULL DEFAULT false,
  source_staged_id  uuid,               -- references staged_transactions.id (audit trail)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id     ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id  ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_txn_date    ON transactions(txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_id   ON transactions(upload_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at ON transactions;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
