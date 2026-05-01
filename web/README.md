# ApplyPanda Web (Next.js)

Customer-facing hosted app for AI-assisted job search workflows.

## Stack

- Next.js App Router
- Supabase Auth + Postgres (RLS)
- Supabase Storage (`documents` bucket)
- OpenAI/Codex-compatible API (`OPENAI_API_KEY`) for AI chat/evaluation/document generation

## Local development

```bash
cd web
npm install
npm run dev
```

Create a local `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_FALLBACK_MODELS="gpt-4.1-mini"
APPLYPANDA_ALLOWED_EMAILS="user1@example.com,user2@example.com,user3@example.com,user4@example.com"
# Optional: Chrome/Chromium binary for tailored PDF rendering locally (or debugging `/api/docs/pdf-probe`)
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
#
# Scan behavior:
# - `/api/linkedin/search` exists for integrations; AI Chat does not call it (use Pipeline scan for boards)
# - Pipeline/ATS scan uses curated Greenhouse/Ashby/Lever/Workday boards via profile targeting filters
```

## Hosted deployment (Vercel)

See: `docs/VERCEL_SAAS_SETUP.md`

## Safety gate and lockdown mode

- `npm run build` runs `npm run verify:tenant-isolation` before Next.js build.
- If tenant isolation checks fail, build exits non-zero (deployment is blocked).
- Set `APPLYPANDA_LOCKDOWN=true` to force global `503 Service Unavailable` responses while incident response is in progress.

## Data model

Baseline schema lives in:

- `web/supabase/schema.sql`
- `web/supabase/storage-documents-policies.sql` (run after creating the `documents` bucket)

Core tables:

- `profiles`
- `resumes`
- `applications`
- `scan_history`
- `reports`
- `documents`

All tables are user-scoped with Supabase RLS.

## Route overview

- `POST /api/chat/stream` -> LLM SSE chat (injects hosted `resumes.content_md` excerpt for grounded Q&A)
- `POST /api/eval/stream` -> LLM SSE evaluation output
- `POST /api/docs/generate` -> one-page Letter HTML via model → PDF (Chromium) to Storage with HTML fallback; updates `applications` + `documents`
- `POST /api/docs/persist-artifact` -> optional Markdown-only save (legacy)
- `POST /api/resume-context/apply` -> LLM profile/resume coach
- `GET/PUT /api/profile` -> `profiles`
- `GET/PUT /api/cv` -> `resumes`
- `GET/PATCH /api/applications*` -> `applications`
- `GET/PATCH /api/scan-history*` -> `scan_history`
- `GET /api/reports*` -> `reports`
- `GET /api/output` + `GET /api/files/[...path]` -> `documents` + storage

## Notes

- Auth is required for `/(app)` pages and protected API routes.
- Landing page copy and CTA are configured for a free-for-everyone SaaS entry flow.
