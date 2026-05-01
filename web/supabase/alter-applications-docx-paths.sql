-- Run once on existing ApplyPanda DBs created before DOCX tracker columns existed.
alter table public.applications add column if not exists cv_ats_docx_path text;
alter table public.applications add column if not exists cv_full_docx_path text;
alter table public.applications add column if not exists cl_docx_path text;
