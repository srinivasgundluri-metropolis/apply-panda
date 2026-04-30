# ApplyPanda Vercel SaaS Setup

This document describes production setup for hosted ApplyPanda (Vercel + Supabase + OpenAI/Codex-compatible API).

## 1) Supabase

1. Create a Supabase project.
2. In SQL editor, run `web/supabase/schema.sql`.
3. Create a storage bucket named `documents` (private).
4. In Auth settings, configure email auth (password + optional confirmation).

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

## 4) Smoke checklist

- `/auth` loads and allows sign-up/sign-in.
- Unauthenticated request to `/dashboard` redirects to `/auth`.
- Authenticated user can load tracker/chat/profile pages.
- Chat route (`/api/chat/stream`) returns model output.
- Resume coach route (`/api/resume-context/apply`) works with `OPENAI_API_KEY`.
- Applications/profile/reports/scan APIs return only authenticated user data.

## 5) Security notes

- Keep Supabase RLS enabled on all user tables.
- Keep storage bucket private; serve files through authenticated API routes.
- Do not expose service role keys to browser code.
- Deploy gate: `npm run build` now executes `verify:tenant-isolation` first. If isolation checks fail, build (and deploy) fails.
