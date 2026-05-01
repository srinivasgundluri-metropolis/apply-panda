# ApplyPanda Vercel SaaS Setup

This document describes production setup for hosted ApplyPanda (Vercel + Supabase + OpenAI/Codex-compatible API).

## 1) Supabase

1. Create a Supabase project.
2. In SQL editor, run `web/supabase/schema.sql`.
3. Create a storage bucket named `documents` (private). If you configure **allowed MIME types**, ensure **generic binary** (`application/octet-stream` — used for tailored `.html`) is allowed, or leave the list unrestricted. If uploads fail with “mime type … is not supported”, run **`web/supabase/alter-storage-documents-bucket-mime.sql`** once or relax types in Dashboard → Storage → `documents`.
4. In the SQL editor, run `web/supabase/storage-documents-policies.sql` so authenticated users can read/write objects under `{their_user_id}/…` (required for tailored draft uploads).
5. In Auth settings, configure email auth (password + optional confirmation).

## 2) Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; account deletion flow; tailored-doc **Storage** uploads also use this on the server with paths prefixed strictly as `{authenticated_user_id}/` — avoids flaky Storage RLS with the JWT. Set **`APPLYPANDA_STORAGE_FORCE_USER_JWT=true`** only to force JWT Storage requests instead (then policies in `storage-documents-policies.sql` must pass).)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4.1-mini`)
- `OPENAI_FALLBACK_MODELS` (optional comma-separated fallback list for 429/503 mitigation)
- `APPLYPANDA_ALLOWED_EMAILS` (comma-separated allowlist for access control)
- `APPLYPANDA_LOCKDOWN` (optional, set `true` to force global 503 maintenance mode)
- **Tailored `/api/docs/generate` is HTML-only** (`…-ats.html`, `…-full.html`, `…-cover.html`). Older env vars **`APPLYPANDA_SKIP_PDF`** / **`APPLYPANDA_SKIP_DOCX`** have no effect and can be deleted.

Legacy DB columns `applications.cv_ats_docx_path`, `cv_full_docx_path`, `cl_docx_path` remain nullable; regenerate clears them when present. **Existing** installs that predated DOCX tracking: run `web/supabase/alter-applications-docx-paths.sql` once if those columns are missing.

- `SMTP_HOST` (optional)
- `SMTP_PORT` (optional, default 587)
- `SMTP_SECURE` (optional, `true`/`false`)
- `SMTP_USER` (optional)
- `SMTP_PASSWORD` (optional)
- `SMTP_FROM` (optional)

## 3) Deployment

- Framework preset: Next.js
- Root directory: `**web`** (required — the app and `pnpm-lock.yaml` live here)
- Install command: **leave empty** (Vercel auto-detects **pnpm** from `web/pnpm-lock.yaml`). Do **not** override with `npm install` unless you also commit `**web/package-lock.json`** — otherwise installs ignore the lockfile and can diverge from local.
- Build command: **leave empty** (`pnpm run build` / default `next build`), or explicitly `pnpm run build`

Common reasons Vercel fails while `**cd web && pnpm run build` works locally:**

1. **Root directory is the repo root** — build runs career-ops `package.json` (no Next.js) or skips `web` files; tenant isolation then fails missing `app/api/...`.
2. **Install command forced to npm** — no committed `package-lock.json` → different dependency tree vs `pnpm-lock.yaml`.
3. **Custom build** runs something that does not exist in `web/package.json` (for example `**typecheck`** on an old revision without that script).

The `web/package.json` field `**packageManager**` pins pnpm via Corepack for consistent CI installs.

### Build shows “Failed” but no obvious error line

1. **Expand every section** in the deployment (not only **Building**): **Collating**, **Uploading**, **Assigning domains**, etc. Vercel often surfaces the real failure there.
2. **Download logs** (deployment menu → **Download Build Logs**) and search for `error`, `failed`, `Killed`, `137`, `ENOMEM`, `EACCES`, `ENOENT`.
3. In **Project → Settings → Environment Variables**, turn **on** [access to system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) if it is off. Some builds behave oddly when `VERCEL_*` metadata is missing during install/build.
4. **Redeploy without build cache** once to rule out a bad cache layer.
5. Confirm the log shows `**[apply-panda] next build starting`** then `**[apply-panda] next build finished ok**` (markers from `web/package.json` `build` script). If the first appears but not the second, the failure is inside `**next build**`; if the second appears, the failure is **after** Next (upload / Vercel packaging).

6. If logs show **The framework produced an invalid deployment package for a Serverless Function** / **symlinked directories** after `next build` succeeds, Vercel is rejecting **pnpm’s symlink tree** in the function bundle. `**web/.npmrc**` sets `**node-linker=hoisted**` (flatter `node_modules`). Redeploy with **Clear build cache** once so installs use that layout.

**Tailored documents** (`/api/docs/generate`): model output is saved as **print-ready HTML** in Storage and linked from the Tracker. Users who need PDFs open the `.html` in a browser → **Print → Save as PDF**. `**web/vercel.json**` keeps **120s** `maxDuration` for LLM latency + uploads (no Chromium in this route).

**Optional Chromium debug** (`**/api/docs/pdf-probe`): still available if you need to troubleshoot Puppeteer/Sparticuz installs for other tooling; tailored generation does **not** call it.

1. Sign in → open **`/api/docs/pdf-probe`** (same deployment or local `pnpm dev`).
2. If `diagnostics.sparticuzBinPresent` is false in production, check `next.config.ts` **`outputFileTracingIncludes`** for `@sparticuz/chromium/bin`.
3. **Local:** Chrome/Edge/Brave or **`PUPPETEER_EXECUTABLE_PATH`** (often `**/Applications/Google Chrome.app/Contents/MacOS/Google Chrome**` on macOS).

## 4) Smoke checklist

- `/auth` loads and allows sign-up/sign-in.
- Unauthenticated request to `/dashboard` redirects to `/auth`.
- Authenticated user can load tracker/chat/profile pages.
- Chat route (`/api/chat/stream`) returns model output.
- Resume coach route (`/api/resume-context/apply`) works with `OPENAI_API_KEY`.
- Applications/profile/reports/scan APIs return only authenticated user data.
- Run an evaluation once: Tracker should show a new row; tailored doc generation should create **HTML** artifacts under **Documents** after the stream finishes (Markdown drafts are optional/legacy elsewhere).

## 5) Security notes

- Keep Supabase RLS enabled on all user tables.
- Keep storage bucket private; serve files through authenticated API routes.
- Do not expose service role keys to browser code.
- Deploy gate: `npm run build` now executes `verify:tenant-isolation` first. If isolation checks fail, build (and deploy) fails.

