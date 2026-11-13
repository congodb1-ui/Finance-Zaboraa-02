-- ==============================================================================
-- Zaboraa Finance (https://zaboraa.com)
-- Migration: 20240010000006_logos_bucket.sql
-- Description: Private Supabase Storage bucket 'logos' (1 MB limit; PNG, JPG,
--              WebP only) with strict per-user folder RLS policies.
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  false,
  1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only read their own logos
DROP POLICY IF EXISTS "Users can select own logos" ON storage.objects;
CREATE POLICY "Users can select own logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: users can only upload to their own folder
DROP POLICY IF EXISTS "Users can insert own logos" ON storage.objects;
CREATE POLICY "Users can insert own logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: users can only update their own logos
DROP POLICY IF EXISTS "Users can update own logos" ON storage.objects;
CREATE POLICY "Users can update own logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: users can only delete their own logos
DROP POLICY IF EXISTS "Users can delete own logos" ON storage.objects;
CREATE POLICY "Users can delete own logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
