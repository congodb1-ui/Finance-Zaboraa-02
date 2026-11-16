-- ==============================================================================
-- Migration: 20261116000000_statement_uploads_edit_columns.sql
-- Description: Add bank_name and file_label to statement_uploads table for upload editing
-- ==============================================================================

ALTER TABLE public.statement_uploads
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS file_label text;
