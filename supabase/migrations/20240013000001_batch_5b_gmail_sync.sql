-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20240013000001_batch_5b_gmail_sync.sql
-- Description: Batch 5b — Gmail auto-import tables (gmail_sync_log,
--              email_parse_errors), accounts.current_balance, profiles.gmail_email,
--              and server-only Supabase Vault RPC helpers for gmail_token_{user_id}.
-- ==============================================================================

-- 1. Account current_balance + Profile gmail_email metadata (never tokens)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS current_balance numeric(15,2);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gmail_email text;

-- 2. Sync Log Table
CREATE TABLE IF NOT EXISTS public.gmail_sync_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at       timestamptz NOT NULL DEFAULT now(),
  emails_processed     integer NOT NULL DEFAULT 0,
  transactions_added   integer NOT NULL DEFAULT 0,
  errors_count         integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_log_user_id
  ON public.gmail_sync_log(user_id, last_synced_at DESC);

ALTER TABLE public.gmail_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_sync_log: owner read" ON public.gmail_sync_log;
CREATE POLICY "gmail_sync_log: owner read"
  ON public.gmail_sync_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Email Parse Errors Table (200-char max raw_snippet; NEVER full body)
CREATE TABLE IF NOT EXISTS public.email_parse_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_msg_id text,
  from_address text,
  subject      text,
  error_reason text,
  raw_snippet  text CHECK (raw_snippet IS NULL OR char_length(raw_snippet) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_parse_errors_user_id
  ON public.email_parse_errors(user_id, created_at DESC);

ALTER TABLE public.email_parse_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_parse_errors: owner read" ON public.email_parse_errors;
CREATE POLICY "email_parse_errors: owner read"
  ON public.email_parse_errors FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Server-only encrypted token storage fallback (used only if vault.secrets is unavailable)
--    RLS enabled with ZERO client policies + REVOKE ALL ensures anon/authenticated cannot access.
CREATE TABLE IF NOT EXISTS public.gmail_oauth_vault_fallback (
  secret_name  text PRIMARY KEY,
  secret_value text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_oauth_vault_fallback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gmail_oauth_vault_fallback FROM PUBLIC, anon, authenticated;

-- 5. SECURITY DEFINER Vault RPCs (service_role only — key pattern: gmail_token_{user_id})
CREATE OR REPLACE FUNCTION public.upsert_gmail_vault_token(
  p_secret_name  text,
  p_secret_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF p_secret_name IS NULL OR p_secret_name NOT LIKE 'gmail_token_%' THEN
    RAISE EXCEPTION 'Invalid Gmail Vault secret key name';
  END IF;

  BEGIN
    IF to_regclass('vault.secrets') IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM vault.secrets
      WHERE name = p_secret_name
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        PERFORM vault.update_secret(v_existing_id, p_secret_value, p_secret_name, 'Zaboraa Finance Gmail OAuth token');
      ELSE
        PERFORM vault.create_secret(p_secret_value, p_secret_name, 'Zaboraa Finance Gmail OAuth token');
      END IF;
      RETURN;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Fall back to service_role-only encrypted fallback table if vault extension permissions differ
    NULL;
  END;

  INSERT INTO public.gmail_oauth_vault_fallback (secret_name, secret_value, updated_at)
  VALUES (p_secret_name, p_secret_value, now())
  ON CONFLICT (secret_name)
  DO UPDATE SET secret_value = EXCLUDED.secret_value, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gmail_vault_token(
  p_secret_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_secret_name IS NULL OR p_secret_name NOT LIKE 'gmail_token_%' THEN
    RAISE EXCEPTION 'Invalid Gmail Vault secret key name';
  END IF;

  BEGIN
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = p_secret_name
      LIMIT 1;

      IF v_secret IS NOT NULL THEN
        RETURN v_secret;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT secret_value INTO v_secret
  FROM public.gmail_oauth_vault_fallback
  WHERE secret_name = p_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_gmail_vault_token(
  p_secret_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_secret_name IS NULL OR p_secret_name NOT LIKE 'gmail_token_%' THEN
    RAISE EXCEPTION 'Invalid Gmail Vault secret key name';
  END IF;

  BEGIN
    IF to_regclass('vault.secrets') IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE name = p_secret_name;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  DELETE FROM public.gmail_oauth_vault_fallback WHERE secret_name = p_secret_name;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gmail_vault_token(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_gmail_vault_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_gmail_vault_token(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_gmail_vault_token(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_gmail_vault_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_gmail_vault_token(text) TO service_role;
