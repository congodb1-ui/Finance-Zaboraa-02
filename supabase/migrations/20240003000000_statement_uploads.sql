-- Batch 3a: Statement Uploads Table
-- Stores metadata and status for uploaded statement files (CSV, XLSX, PDF)

CREATE TABLE IF NOT EXISTS statement_uploads (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id              uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  file_name               text NOT NULL,
  file_hash               text NOT NULL,          -- SHA-256 of raw file bytes, hex string
  file_type               text NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'pdf')),
  file_size_bytes         bigint,
  storage_path            text NOT NULL,          -- path in Supabase Storage bucket
  parser_version          text NOT NULL,          -- e.g. "csv-generic-v1", "hdfc-csv-v1"
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','review','imported','failed','replaced')),
  row_count               int,
  imported_count          int,
  duplicate_count         int,
  error_message           text,
  statement_period_start  date,
  statement_period_end    date,
  imported_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_hash)                      -- file-hash dedup: same file = blocked
);

CREATE INDEX IF NOT EXISTS idx_statement_uploads_user_id ON statement_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_statement_uploads_account_id ON statement_uploads(account_id);
CREATE INDEX IF NOT EXISTS idx_statement_uploads_status ON statement_uploads(status);

ALTER TABLE statement_uploads ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at timestamp trigger
DROP TRIGGER IF EXISTS handle_statement_uploads_updated_at ON statement_uploads;
CREATE TRIGGER handle_statement_uploads_updated_at
  BEFORE UPDATE ON statement_uploads
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
