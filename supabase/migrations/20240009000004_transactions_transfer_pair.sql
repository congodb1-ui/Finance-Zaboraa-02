-- ==============================================================================
-- Zaboraa Finance
-- Migration: 20240009000004_transactions_transfer_pair.sql
-- Description: Ensure transfer_pair_id column exists on transactions table.
-- ==============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_pair_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
