-- Batch 3a: Staged Transactions Table
-- Temporary staging area for raw parsed transactions prior to final dedup and commit in Batch 4

CREATE TABLE IF NOT EXISTS staged_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id         uuid NOT NULL REFERENCES statement_uploads(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  raw_date          text,                   -- original string from file
  txn_date          date NOT NULL,
  description       text NOT NULL,
  raw_description   text,                   -- unmodified original
  debit             numeric(15,2),
  credit            numeric(15,2),
  balance           numeric(15,2),
  reference_number  text,
  is_duplicate      boolean NOT NULL DEFAULT false,
  duplicate_of_id   uuid,                   -- references transactions.id if known
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staged_transactions_upload_id ON staged_transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_staged_transactions_user_id ON staged_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_staged_transactions_account_id ON staged_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_staged_transactions_txn_date ON staged_transactions(txn_date);

ALTER TABLE staged_transactions ENABLE ROW LEVEL SECURITY;
