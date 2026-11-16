-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20261116000001_profiles_gmail_refresh_token.sql
-- Description: Add gmail_refresh_token_encrypted column to profiles if not exists and ensure grants for service_role and authenticated.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gmail_refresh_token_encrypted text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
