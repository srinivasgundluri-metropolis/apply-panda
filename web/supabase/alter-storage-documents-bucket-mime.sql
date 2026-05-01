-- If tailored doc uploads fail with: "mime type ... is not supported"
-- your `documents` bucket likely has a MIME allow-list that excludes HTML / DOCX.
-- Run once in Supabase SQL Editor (Storage → buckets are mirrored in storage.buckets).
--
-- Option A — no MIME restriction (accept all types the app uploads):
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'documents';

-- Option B — explicit allow-list (comment out Option A first if you prefer this instead):
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY[
--   'application/pdf',
--   'text/html',
--   'application/octet-stream',
--   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--   'text/markdown',
--   'text/plain'
-- ]::text[]
-- WHERE id = 'documents';
