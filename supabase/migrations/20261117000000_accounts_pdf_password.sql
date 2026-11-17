-- Migration: Add pdf_password column to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pdf_password text;
