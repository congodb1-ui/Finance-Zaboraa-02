-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000000_accounts.sql
-- Description: Create accounts table with multi-account registry, check constraints,
--              credit card limits and billing cycle fields, and moddatetime trigger.
-- ==============================================================================

CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  bank_name             text NOT NULL,
  account_type          text NOT NULL CHECK (account_type IN (
                          'savings', 'current', 'salary', 'credit_card',
                          'loan', 'fd', 'ppf', 'nps', 'wallet', 'other')),
  account_number_last4  text,          -- last 4 digits only, never full number
  currency              text NOT NULL DEFAULT 'INR',
  is_active             boolean NOT NULL DEFAULT true,
  color_index           smallint DEFAULT 0,  -- maps to the 10-color categorical palette
  notes                 text,
  -- Credit card specific (NULL for non-credit-card accounts)
  credit_limit          numeric(15,2),
  billing_cycle_day     smallint CHECK (billing_cycle_day BETWEEN 1 AND 31),
  payment_due_day       smallint CHECK (payment_due_day BETWEEN 1 AND 31),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Automatic updated_at timestamp trigger using moddatetime extension
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
