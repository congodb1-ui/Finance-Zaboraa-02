-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000005_invoice_numbering_rpc.sql
-- Description: Atomic per-user invoice number allocator using row-level locking
--              on business_profiles.
-- ==============================================================================

CREATE OR REPLACE FUNCTION allocate_invoice_number(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_next   integer;
  v_number text;
BEGIN
  SELECT invoice_prefix, next_invoice_no
    INTO v_prefix, v_next
    FROM business_profiles
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No business profile found for user';
  END IF;

  v_number := v_prefix || '-' || LPAD(v_next::text, 4, '0');

  UPDATE business_profiles
     SET next_invoice_no = next_invoice_no + 1,
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION allocate_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allocate_invoice_number(uuid) TO authenticated;
