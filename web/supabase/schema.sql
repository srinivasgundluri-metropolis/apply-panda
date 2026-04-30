-- ApplyPanda hosted schema baseline (Supabase Postgres)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.resumes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content_md text not null default '',
  source text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  num text not null,
  date text,
  company text,
  role text,
  score text,
  status text,
  pdf text,
  notes text,
  source_url text,
  report_num text,
  report_path text,
  cv_path text,
  cv_ats_path text,
  cv_full_path text,
  cv_legacy_path text,
  cl_path text,
  has_cv_ats boolean not null default false,
  has_cv_full boolean not null default false,
  has_cv_legacy_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, num)
);

create table if not exists public.scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  first_seen text,
  portal text,
  title text,
  company text,
  status text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, url)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  num text,
  path text,
  company text,
  role text,
  score double precision,
  legitimacy text,
  url text,
  pdf_path text,
  body_md text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  kind text not null default 'other',
  size bigint not null default 0,
  mtime bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, storage_path)
);

alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.scan_history enable row level security;
alter table public.reports enable row level security;
alter table public.documents enable row level security;

drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists resumes_owner_all on public.resumes;
create policy resumes_owner_all on public.resumes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists applications_owner_all on public.applications;
create policy applications_owner_all on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists scan_history_owner_all on public.scan_history;
create policy scan_history_owner_all on public.scan_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists reports_owner_all on public.reports;
create policy reports_owner_all on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists documents_owner_all on public.documents;
create policy documents_owner_all on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
