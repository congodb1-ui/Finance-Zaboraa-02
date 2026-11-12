-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000004_seed_categories.sql
-- Description: Function to seed default categories for a new user with is_system = true.
--              Includes 20 standard expense categories and 7 standard income categories.
-- ==============================================================================

CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert Standard Expense Categories (is_income = false, is_system = true)
  INSERT INTO categories (user_id, name, icon, color_index, is_income, is_system)
  VALUES
    (p_user_id, 'Food & Dining', 'Utensils', 5, false, true),
    (p_user_id, 'Groceries', 'ShoppingBag', 4, false, true),
    (p_user_id, 'Transport', 'Car', 1, false, true),
    (p_user_id, 'Fuel', 'Fuel', 6, false, true),
    (p_user_id, 'Shopping', 'ShoppingBag', 8, false, true),
    (p_user_id, 'Entertainment', 'Film', 9, false, true),
    (p_user_id, 'Utilities', 'Zap', 2, false, true),
    (p_user_id, 'Rent / EMI', 'Home', 7, false, true),
    (p_user_id, 'Medical & Health', 'HeartPulse', 7, false, true),
    (p_user_id, 'Education', 'GraduationCap', 1, false, true),
    (p_user_id, 'Travel', 'Plane', 1, false, true),
    (p_user_id, 'Personal Care', 'Smile', 8, false, true),
    (p_user_id, 'Insurance', 'Shield', 0, false, true),
    (p_user_id, 'Subscriptions', 'Repeat', 9, false, true),
    (p_user_id, 'Fees & Charges', 'AlertCircle', 6, false, true),
    (p_user_id, 'Gifts & Donations', 'Gift', 8, false, true),
    (p_user_id, 'Investment', 'TrendingUp', 3, false, true),
    (p_user_id, 'EMI / Loan', 'CreditCard', 9, false, true),
    (p_user_id, 'Tax', 'FileText', 7, false, true),
    (p_user_id, 'Miscellaneous', 'MoreHorizontal', 0, false, true)
  ON CONFLICT DO NOTHING;

  -- Insert Standard Income Categories (is_income = true, is_system = true)
  INSERT INTO categories (user_id, name, icon, color_index, is_income, is_system)
  VALUES
    (p_user_id, 'Salary', 'Briefcase', 1, true, true),
    (p_user_id, 'Freelance / Consulting', 'Laptop', 0, true, true),
    (p_user_id, 'Business Income', 'Building2', 0, true, true),
    (p_user_id, 'Rental Income', 'Home', 2, true, true),
    (p_user_id, 'Interest & Dividends', 'Coins', 2, true, true),
    (p_user_id, 'Refund', 'RotateCcw', 3, true, true),
    (p_user_id, 'Other Income', 'PlusCircle', 4, true, true)
  ON CONFLICT DO NOTHING;

  -- Also seed default Personal & Business workspaces
  INSERT INTO workspaces (user_id, name, description, color_index)
  VALUES
    (p_user_id, 'Personal', 'Personal income, groceries, household and family expenses', 0),
    (p_user_id, 'Business', 'Freelance consulting, professional contracts, office and vendor expenses', 1)
  ON CONFLICT DO NOTHING;
END;
$$;
