-- Private bucket `documents` — run in Supabase SQL editor AFTER the bucket exists.
-- Object paths must be `{auth.uid()}/...` (first `/`-separated segment = user id) for RLS below.
--
-- Use split_part(...) instead of storage.foldername(...) — same rule, avoids edge mismatches on some Postgres/Storage revisions.
--
-- MIME errors on upload (“mime type … is not supported”): widen or clear the bucket
-- allow-list — see alter-storage-documents-bucket-mime.sql (dashboard: Storage → documents → configuration).

drop policy if exists "documents_read_own" on storage.objects;
create policy "documents_read_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "documents_update_own" on storage.objects;
create policy "documents_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );
