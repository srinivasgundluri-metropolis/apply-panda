# ApplyPanda Vercel SaaS Setup

This document describes production setup for hosted ApplyPanda (Vercel + Supabase + OpenAI/Codex-compatible API).

## 1) Supabase

1. Create a Supabase project.
2. In SQL editor, run `web/supabase/schema.sql`.
3. Create a storage bucket named `documents` (private).
4. In the SQL editor, run `web/supabase/storage-documents-policies.sql` so authenticated users can read/write objects under `{their_user_id}/…` (required for tailored draft uploads).
5. In Auth settings, configure email auth (password + optional confirmation).

## 2) Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for permanent account deletion flow)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4.1-mini`)
- `OPENAI_FALLBACK_MODELS` (optional comma-separated fallback list for 429/503 mitigation)
- `APPLYPANDA_ALLOWED_EMAILS` (comma-separated allowlist for access control)
- `APPLYPANDA_LOCKDOWN` (optional, set `true` to force global 503 maintenance mode)
- `SMTP_HOST` (optional)
- `SMTP_PORT` (optional, default 587)
- `SMTP_SECURE` (optional, `true`/`false`)
- `SMTP_USER` (optional)
- `SMTP_PASSWORD` (optional)
- `SMTP_FROM` (optional)

## 3) Deployment

- Framework preset: Next.js
- Root directory: `web`
- Install command: `npm install`
- Build command: `npm run build`

**Tailored PDFs** (`/api/docs/generate`): on **deployed** Vercel (Linux, `VERCEL_ENV` `preview`|`production`) this uses `puppeteer-core` + `@sparticuz/chromium`. The resolver passes an explicit **`node_modules/@sparticuz/chromium/bin`** path (Next bundles break Sparticuz’s default `__dirname`). **`web/vercel.json`** requests **3008 MB** memory and **120s** for this route — Pro-level plans honor it; Hobby may clamp memory/timeouts. **`vercel dev`** is detected via `VERCEL_REGION=dev1` and/or missing preview/production env — install **Chrome**, **Edge**, or **Brave** locally, or set **`PUPPETEER_EXECUTABLE_PATH`**. If you copied hosted env vars into Linux dev and the wrong Chromium runs, use **`APPLYPANDA_FORCE_LOCAL_CHROME=1`**. If launch still fails in production on **ARM** serverless regions, Sparticuz’s current build is aimed at **x86** Lambda-style runtimes — pick an x86 region or an alternate PDF pipeline.

## 4) Smoke checklist

- `/auth` loads and allows sign-up/sign-in.
- Unauthenticated request to `/dashboard` redirects to `/auth`.
- Authenticated user can load tracker/chat/profile pages.
- Chat route (`/api/chat/stream`) returns model output.
- Resume coach route (`/api/resume-context/apply`) works with `OPENAI_API_KEY`.
- Applications/profile/reports/scan APIs return only authenticated user data.
- Run an evaluation once: Tracker should show a new row; tailored doc generation should create a row under **Documents** (Markdown drafts) after the stream finishes.

## 5) Security notes

- Keep Supabase RLS enabled on all user tables.
- Keep storage bucket private; serve files through authenticated API routes.
- Do not expose service role keys to browser code.
- Deploy gate: `npm run build` now executes `verify:tenant-isolation` first. If isolation checks fail, build (and deploy) fails.
