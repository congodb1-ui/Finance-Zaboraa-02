-- ==============================================================================
-- Zaboraa Finance (https://finance.zaboraa.com)
-- Migration: 20240011000001_batch_2b_family_and_seed.sql
-- Description: Batch 2b — Family schema (families, family_members), family_id
--              columns and family-member SELECT RLS policies across Category A
--              tables, profile/account column extensions, and system transfer
--              categories.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. New Tables: public.families & public.family_members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_owner_id ON public.families(owner_id);
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.family_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  email           text,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers break mutual policy recursion between families and family_members
CREATE OR REPLACE FUNCTION public.get_user_family_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id
  FROM public.family_members
  WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_family_owner(p_family_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.families
    WHERE id = p_family_id AND owner_id = p_user_id
  );
$$;

-- RLS Policies for public.families
DROP POLICY IF EXISTS "families: owner read" ON public.families;
CREATE POLICY "families: owner read" ON public.families
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "families: owner insert" ON public.families;
CREATE POLICY "families: owner insert" ON public.families
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "families: owner update" ON public.families;
CREATE POLICY "families: owner update" ON public.families
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "families: member read" ON public.families;
CREATE POLICY "families: member read" ON public.families
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.get_user_family_ids(auth.uid()))
  );

-- RLS Policies for public.family_members
DROP POLICY IF EXISTS "family_members: owner read" ON public.family_members;
CREATE POLICY "family_members: owner read" ON public.family_members
  FOR SELECT
  TO authenticated
  USING (public.is_family_owner(family_id, auth.uid()));

DROP POLICY IF EXISTS "family_members: self read" ON public.family_members;
CREATE POLICY "family_members: self read" ON public.family_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "family_members: owner write" ON public.family_members;
CREATE POLICY "family_members: owner write" ON public.family_members
  FOR ALL
  TO authenticated
  USING (public.is_family_owner(family_id, auth.uid()))
  WITH CHECK (public.is_family_owner(family_id, auth.uid()));

-- ------------------------------------------------------------------------------
-- 2. Add nullable family_id to all Category A tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.staged_transactions ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.transaction_rules ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.payment_instructions ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id);

CREATE INDEX IF NOT EXISTS idx_accounts_family_id ON public.accounts(family_id);
CREATE INDEX IF NOT EXISTS idx_transactions_family_id ON public.transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_staged_transactions_family_id ON public.staged_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_categories_family_id ON public.categories(family_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_family_id ON public.workspaces(family_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_family_id ON public.transaction_rules(family_id);
CREATE INDEX IF NOT EXISTS idx_budgets_family_id ON public.budgets(family_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_family_id ON public.recurring_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_invoices_family_id ON public.invoices(family_id);
CREATE INDEX IF NOT EXISTS idx_clients_family_id ON public.clients(family_id);
CREATE INDEX IF NOT EXISTS idx_payment_instructions_family_id ON public.payment_instructions(family_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_family_id ON public.business_profiles(family_id);

-- ------------------------------------------------------------------------------
-- 3. Add family member read SELECT policy to Category A tables
--    (Existing user_id = auth.uid() policies are left untouched.)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "accounts: family member read" ON public.accounts;
CREATE POLICY "accounts: family member read" ON public.accounts
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "transactions: family member read" ON public.transactions;
CREATE POLICY "transactions: family member read" ON public.transactions
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "staged_transactions: family member read" ON public.staged_transactions;
CREATE POLICY "staged_transactions: family member read" ON public.staged_transactions
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "categories: family member read" ON public.categories;
CREATE POLICY "categories: family member read" ON public.categories
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "workspaces: family member read" ON public.workspaces;
CREATE POLICY "workspaces: family member read" ON public.workspaces
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "transaction_rules: family member read" ON public.transaction_rules;
CREATE POLICY "transaction_rules: family member read" ON public.transaction_rules
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "budgets: family member read" ON public.budgets;
CREATE POLICY "budgets: family member read" ON public.budgets
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "recurring_transactions: family member read" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions: family member read" ON public.recurring_transactions
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "invoices: family member read" ON public.invoices;
CREATE POLICY "invoices: family member read" ON public.invoices
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "clients: family member read" ON public.clients;
CREATE POLICY "clients: family member read" ON public.clients
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "payment_instructions: family member read" ON public.payment_instructions;
CREATE POLICY "payment_instructions: family member read" ON public.payment_instructions
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

DROP POLICY IF EXISTS "business_profiles: family member read" ON public.business_profiles;
CREATE POLICY "business_profiles: family member read" ON public.business_profiles
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())));

-- Guard optional documents table if present in an environment
DO $$
BEGIN
  IF to_regclass('public.documents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id)';
    EXECUTE 'DROP POLICY IF EXISTS "documents: family member read" ON public.documents';
    EXECUTE 'CREATE POLICY "documents: family member read" ON public.documents FOR SELECT TO authenticated USING (family_id IN (SELECT public.get_user_family_ids(auth.uid())))';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Profiles & Accounts New Columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_full_name text,
  ADD COLUMN IF NOT EXISTS gmail_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_last_synced timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Kolkata';

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS operated_by_owner boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS ifsc text,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS icon text;

-- ------------------------------------------------------------------------------
-- 5. System Transfer Categories & Software & Cloud Category
-- ------------------------------------------------------------------------------
ALTER TABLE public.categories ALTER COLUMN user_id DROP NOT NULL;

INSERT INTO public.categories (user_id, name, icon, color_index, is_income, is_system)
SELECT NULL, v.name, v.icon, v.color_index, false, true
FROM (
  VALUES
    ('Self Transfer', 'ArrowLeftRight', 0),
    ('Family Transfer', 'Users', 8),
    ('Monthly Bissi', 'Repeat', 5),
    ('Software & Cloud', 'Cloud', 1)
) AS v(name, icon, color_index)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE lower(c.name) = lower(v.name)
    AND c.user_id IS NULL
);
