-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000006_rls_categories.sql
-- Description: Comprehensive RLS policies for categories table.
-- System categories (is_system = true) are readable by all authenticated users.
-- User categories are strictly scoped to auth.uid() = user_id.
-- ==============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own categories" ON categories;
DROP POLICY IF EXISTS "Users can read system or own categories" ON categories;
CREATE POLICY "Users can read system or own categories"
  ON categories FOR SELECT
  TO authenticated
  USING (is_system = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own categories" ON categories;
CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can update own categories" ON categories;
CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND is_system = false)
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can delete own non-system categories" ON categories;
CREATE POLICY "Users can delete own non-system categories"
  ON categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND is_system = false);
