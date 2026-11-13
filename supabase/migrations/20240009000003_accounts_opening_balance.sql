-- ==============================================================================
-- Zaboraa Finance
-- Migration: 20240009000003_accounts_opening_balance.sql
-- Description: Add opening_balance and opening_date columns to accounts table.
-- ==============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(18,2) DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_date date;
