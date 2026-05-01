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
- `APPLYPANDA_SKIP_PDF` (optional, `1` / `true` / `yes` — never start Chromium; tailor flow uploads **printable HTML** only; use when serverless PDF stays broken)
- `APPLYPANDA_SKIP_DOCX` (optional — skip **`html-to-docx`** conversion; tracker won’t show Word buttons)

New Supabase installs get `applications.cv_ats_docx_path`, `cv_full_docx_path`, `cl_docx_path` from `web/supabase/schema.sql`. **Existing** projects: run `web/supabase/alter-applications-docx-paths.sql` once in the SQL editor.
- `SMTP_HOST` (optional)
- `SMTP_PORT` (optional, default 587)
- `SMTP_SECURE` (optional, `true`/`false`)
- `SMTP_USER` (optional)
- `SMTP_PASSWORD` (optional)
- `SMTP_FROM` (optional)

## 3) Deployment

- Framework preset: Next.js
- Root directory: **`web`** (required — the app and `pnpm-lock.yaml` live here)
- Install command: **leave empty** (Vercel auto-detects **pnpm** from `web/pnpm-lock.yaml`). Do **not** override with `npm install` unless you also commit **`web/package-lock.json`** — otherwise installs ignore the lockfile and can diverge from local.
- Build command: **leave empty** (`pnpm run build` / default `next build`), or explicitly `pnpm run build`

Common reasons Vercel fails while **`cd web && pnpm run build` works locally:**

1. **Root directory is the repo root** — build runs career-ops `package.json` (no Next.js) or skips `web` files; tenant isolation then fails missing `app/api/...`.
2. **Install command forced to npm** — no committed `package-lock.json` → different dependency tree vs `pnpm-lock.yaml`.
3. **Custom build** runs something that does not exist in `web/package.json` (for example **`typecheck`** on an old revision without that script).

The `web/package.json` field **`packageManager`** pins pnpm via Corepack for consistent CI installs.

**Tailored documents** (`/api/docs/generate`): **tries PDF first** (`puppeteer-core` + `@sparticuz/chromium` on deployed Linux `preview`|`production`). **If Chromium fails to start or `page.pdf()` throws, the route automatically saves printable `.html` to the same storage paths (`.pdf` → `.html`), updates the tracker, and returns exit code 0** — open the file → **Print → Save as PDF**. Set **`APPLYPANDA_SKIP_PDF`** to skip Chromium entirely. The Sparticuz resolver passes an explicit **`node_modules/@sparticuz/chromium/bin`** path (Next bundles break Sparticuz’s default `__dirname`). **`web/vercel.json`** sets **120s** `maxDuration` for this route. On **Fluid / Active CPU** billing, per-function **`memory` in `vercel.json` is ignored** — configure memory (and related limits) in the Vercel project **Functions** UI instead; Chromium PDFs need enough provisioned memory or they OOM. **`vercel dev`** is detected via `VERCEL_REGION=dev1` and/or missing preview/production env — install **Chrome**, **Edge**, or **Brave** locally, or set **`PUPPETEER_EXECUTABLE_PATH`**. If you copied hosted env vars into Linux dev and the wrong Chromium runs, use **`APPLYPANDA_FORCE_LOCAL_CHROME=1`**. If launch still fails in production on **ARM** serverless regions, Sparticuz’s current build is aimed at **x86** Lambda-style runtimes — pick an x86 region or an alternate PDF pipeline.

**PDF troubleshooting (step-by-step):**

1. While signed in to the dashboard, open **`/api/docs/pdf-probe`** on the same deployment (or run `pnpm dev`, sign in locally, hit `http://localhost:3000/api/docs/pdf-probe`).
2. Copy the JSON. If **`diagnostics.sparticuzBinPresent`** is false on production, `@sparticuz/chromium/bin` wasn’t deployed — redeploy after `next.config.ts` **`outputFileTracingIncludes`** (already in repo) picks up **`bin/**/*.br`**.
3. If **`bundledChromium`** is false but you meant to use hosted PDFs, confirm you’re hitting **deployed** Vercel (`VERCEL_ENV` should be **`preview`** or **`production`** in that JSON).
4. **Local:** Install **Chrome**, **Edge**, or **Brave**, or set **`PUPPETEER_EXECUTABLE_PATH`** to the executable; macOS Spotlight path is often **`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`**.
5. **Hosted:** Give the generate route **enough memory in Vercel dashboard** (Fluid Compute ignores `memory` in `vercel.json`). Hobby may still be too tight for Chromium. Prefer **Washington / classic x86** regions over ARM-only setups for Sparticuz.
6. **Workaround offline:** Generate CVs locally with **`node generate-pdf.mjs`** against your `cv.md` / HTML (career-ops CLI), then upload artifacts manually until serverless Chromium is sorted.

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
