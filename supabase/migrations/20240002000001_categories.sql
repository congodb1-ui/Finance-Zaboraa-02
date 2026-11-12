-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000001_categories.sql
-- Description: Create categories table for income and expense classification
-- ==============================================================================

CREATE TABLE categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  icon         text,                   -- lucide-react icon name string
  color_index  smallint DEFAULT 0,     -- maps to 10-color categorical palette
  is_income    boolean NOT NULL DEFAULT false,
  is_system    boolean NOT NULL DEFAULT false,  -- true = seeded default, cannot be deleted
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
