-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000006_rls_categories.sql
-- Description: Explicit RLS policies for categories.
--              System categories (is_system = true) are readable by all authenticated
--              users or owned users, but can only be updated/deleted if is_system = false.
-- ==============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own or system categories" ON categories;
CREATE POLICY "Users can select own or system categories"
  ON categories FOR SELECT
  USING (auth.uid() = user_id OR is_system = true);

DROP POLICY IF EXISTS "Users can insert own categories" ON categories;
CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can update own categories" ON categories;
CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false)
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can delete own non-system categories" ON categories;
CREATE POLICY "Users can delete own non-system categories"
  ON categories FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);
