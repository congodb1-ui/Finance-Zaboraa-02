-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000001_business_profiles.sql
-- Description: Create business_profiles table for seller identity, tax/export
--              credentials (GSTIN, IEC, LUT), and invoice numbering settings.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text,
  logo_path text,
  address text,
  country char(2),
  email text,
  phone text,
  website text,
  gstin text,
  iec text,
  lut_number text,
  lut_date date,
  default_currency char(3) NOT NULL DEFAULT 'INR',
  invoice_prefix text NOT NULL DEFAULT 'INV',
  next_invoice_no integer NOT NULL DEFAULT 1,
  default_payment_terms_days integer NOT NULL DEFAULT 30,
  default_notes text,
  default_footer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS handle_updated_at_business_profiles ON business_profiles;
CREATE TRIGGER handle_updated_at_business_profiles BEFORE UPDATE ON business_profiles
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP POLICY IF EXISTS "Users can select own business profile" ON business_profiles;
CREATE POLICY "Users can select own business profile"
  ON business_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own business profile" ON business_profiles;
CREATE POLICY "Users can insert own business profile"
  ON business_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own business profile" ON business_profiles;
CREATE POLICY "Users can update own business profile"
  ON business_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
