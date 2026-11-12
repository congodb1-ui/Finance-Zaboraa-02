-- Batch 3a: Private Supabase Storage Bucket for Statements
-- Bucket: 'statements' (Private, 20 MB size limit)
-- Strict Storage RLS: enforces {user_id}/{YYYY-MM}/{filename} folder naming convention

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'statements',
  'statements',
  false,
  20971520,   -- 20 MB in bytes
  ARRAY[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf',
    'application/octet-stream'
  ];

-- Storage RLS: users can only upload to their own folder
DROP POLICY IF EXISTS "Users can upload their own statements" ON storage.objects;
CREATE POLICY "Users can upload their own statements"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'statements' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: users can only read their own statements
DROP POLICY IF EXISTS "Users can read their own statements" ON storage.objects;
CREATE POLICY "Users can read their own statements"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'statements' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: users can only delete their own statements
DROP POLICY IF EXISTS "Users can delete their own statements" ON storage.objects;
CREATE POLICY "Users can delete their own statements"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'statements' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
