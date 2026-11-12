-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000005_on_new_user_trigger.sql
-- Description: Trigger on auth.users to auto-seed default categories and workspaces
--              on the first Google login of any new user without app-layer calls.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the category seeding function for the newly inserted auth user
  PERFORM seed_default_categories(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop trigger if already exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_setup();
