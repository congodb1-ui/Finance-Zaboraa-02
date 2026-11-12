-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240002000002_workspaces.sql
-- Description: Create workspaces table for business vs personal segregation
-- ==============================================================================

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  color_index smallint DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
