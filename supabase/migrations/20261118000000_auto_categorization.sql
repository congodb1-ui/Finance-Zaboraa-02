-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20261118000000_auto_categorization.sql
-- Description:
--   1. Ensure the 13 strict canonical auto-categorization categories exist.
--   2. Add scope, account_id, is_transfer, merchant_key, ai_batch_id, source to transaction_rules.
--   3. Add category_source and ai_batch_id to transactions (for manual protection & batch revert).
--   4. Add suggestion preview columns + updated_at to staged_transactions.
--   5. Create auto_categorization_batches table with RLS for Draft/Apply/Revert lifecycle.
-- ==============================================================================

-- 1. Seed the 13 canonical categories for every existing user if missing
INSERT INTO public.categories (user_id, name, icon, color_index, is_income, is_system)
SELECT
  u.id AS user_id,
  v.name,
  v.icon,
  v.color_index,
  v.is_income,
  true AS is_system
FROM auth.users u
CROSS JOIN (
  VALUES
    ('Food & Groceries',    'Utensils',       5, false),
    ('Pharmacy / Health',   'HeartPulse',     7, false),
    ('Fuel / Petrol',       'Fuel',           6, false),
    ('Transport / Vehicle', 'Car',            1, false),
    ('Rent & Utilities',    'Home',           2, false),
    ('Shopping',            'ShoppingBag',    8, false),
    ('Entertainment',       'Film',           9, false),
    ('Business Expense',    'Briefcase',      0, false),
    ('Business Income',     'Building2',      3, true),
    ('Salary / Income',     'Wallet',         4, true),
    ('Family Transfer',     'ArrowLeftRight', 1, false),
    ('Bank Charges',        'AlertCircle',    6, false),
    ('Other',               'MoreHorizontal', 0, false)
) AS v(name, icon, color_index, is_income)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE c.user_id = u.id
    AND lower(c.name) = lower(v.name)
);

-- Also ensure seed_default_categories(uuid) creates these canonical categories for future users
CREATE OR REPLACE FUNCTION public.seed_canonical_auto_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color_index, is_income, is_system)
  SELECT
    p_user_id,
    v.name,
    v.icon,
    v.color_index,
    v.is_income,
    true
  FROM (
    VALUES
      ('Food & Groceries',    'Utensils',       5, false),
      ('Pharmacy / Health',   'HeartPulse',     7, false),
      ('Fuel / Petrol',       'Fuel',           6, false),
      ('Transport / Vehicle', 'Car',            1, false),
      ('Rent & Utilities',    'Home',           2, false),
      ('Shopping',            'ShoppingBag',    8, false),
      ('Entertainment',       'Film',           9, false),
      ('Business Expense',    'Briefcase',      0, false),
      ('Business Income',     'Building2',      3, true),
      ('Salary / Income',     'Wallet',         4, true),
      ('Family Transfer',     'ArrowLeftRight', 1, false),
      ('Bank Charges',        'AlertCircle',    6, false),
      ('Other',               'MoreHorizontal', 0, false)
  ) AS v(name, icon, color_index, is_income)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.user_id = p_user_id
      AND lower(c.name) = lower(v.name)
  );
END;
$$;

-- 2. Extend transaction_rules for scoped, merchant-aware auto-categorization rules
ALTER TABLE public.transaction_rules
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'personal', 'business', 'account')),
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_key text,
  ADD COLUMN IF NOT EXISTS ai_batch_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_transaction_rules_ai_batch_id
  ON public.transaction_rules(ai_batch_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_merchant_key
  ON public.transaction_rules(merchant_key);

-- 3. Extend transactions with category_source and ai_batch_id
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS category_source text,
  ADD COLUMN IF NOT EXISTS ai_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_transactions_ai_batch_id
  ON public.transactions(ai_batch_id);

-- 4. Extend staged_transactions for upload verification category preview
ALTER TABLE public.staged_transactions
  ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_source text,
  ADD COLUMN IF NOT EXISTS suggestion_confidence numeric,
  ADD COLUMN IF NOT EXISTS is_transfer_suggestion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 5. Create auto_categorization_batches table for Draft / Apply / Revert
CREATE TABLE IF NOT EXISTS public.auto_categorization_batches (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                   text NOT NULL CHECK (status IN ('draft', 'applied', 'reverted')),
  draft_state              jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_created            int NOT NULL DEFAULT 0,
  transactions_categorized int NOT NULL DEFAULT 0,
  applied_at               timestamptz,
  reverted_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_cat_batches_user_status
  ON public.auto_categorization_batches(user_id, status, created_at DESC);

ALTER TABLE public.auto_categorization_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_cat_batches_owner_all" ON public.auto_categorization_batches;
CREATE POLICY "auto_cat_batches_owner_all"
  ON public.auto_categorization_batches
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS handle_updated_at ON public.auto_categorization_batches;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.auto_categorization_batches
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
