# ApplyPanda Web (Next.js)

Customer-facing hosted app for AI-assisted job search workflows.

## Stack

- Next.js App Router
- Supabase Auth + Postgres (RLS)
- Supabase Storage (`documents` bucket)
- Gemini (`GEMINI_API_KEY`) for AI chat/evaluation/document generation

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
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODELS="gemini-1.5-flash,gemini-2.0-flash-lite"
APPLYPANDA_ALLOWED_EMAILS="user1@example.com,user2@example.com,user3@example.com,user4@example.com"
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

Core tables:

- `profiles`
- `resumes`
- `applications`
- `scan_history`
- `reports`
- `documents`

All tables are user-scoped with Supabase RLS.

## Route overview

- `POST /api/chat/stream` -> Gemini SSE chat
- `POST /api/eval/stream` -> Gemini SSE evaluation output
- `POST /api/docs/generate` -> Gemini SSE CV/CL generation output
- `POST /api/resume-context/apply` -> Gemini profile/resume coach
- `GET/PUT /api/profile` -> `profiles`
- `GET/PUT /api/cv` -> `resumes`
- `GET/PATCH /api/applications*` -> `applications`
- `GET/PATCH /api/scan-history*` -> `scan_history`
- `GET /api/reports*` -> `reports`
- `GET /api/output` + `GET /api/files/[...path]` -> `documents` + storage

## Notes

- Auth is required for `/(app)` pages and protected API routes.
- Landing page copy and CTA are configured for a free-for-everyone SaaS entry flow.
