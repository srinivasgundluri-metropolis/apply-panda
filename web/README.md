# Career-Ops Web (Next.js)

A polished, customer-facing-grade React frontend for career-ops. Runs alongside
the Streamlit dashboard — they share the same backend (`.mjs` scripts, `modes/`,
`templates/`, `data/`, `reports/`) so you can switch between them freely.

```
career-ops/
├── dashboard/                # Streamlit (untouched)
├── web/                      # ← this app
│   ├── app/
│   │   ├── (app)/            # everything with the sidebar layout
│   │   │   ├── dashboard/    # Status Dashboard
│   │   │   ├── tracker/      # Interactive Tracker
│   │   │   ├── chat/         # AI assistant + LinkedIn search
│   │   │   ├── pipeline/     # Paste JD / scan portals
│   │   │   ├── scan-results/ # Discovered jobs
│   │   │   ├── documents/    # Generated CVs + cover letters
│   │   │   └── profile/      # Edit config/profile.yml
│   │   ├── api/              # 16 route handlers — see below
│   │   └── page.tsx          # Marketing landing
│   ├── components/
│   │   ├── ui/               # shadcn/ui primitives (Tailwind v4)
│   │   ├── layout/           # sidebar + page header
│   │   ├── chat/             # chat panel, job actions, recent searches
│   │   ├── tracker/          # applications table, doc-gen card
│   │   ├── pipeline/         # paste form, scan runner
│   │   ├── scan-results/     # filterable scan table
│   │   ├── dashboard/        # KPI cards, funnel chart
│   │   └── profile/          # profile form
│   └── lib/                  # data layer + prompt builders + SSE helpers
└── ...
```

## Quick start

```bash
cd web
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000
```

Streamlit and this app can run side by side:

```bash
# terminal 1
streamlit run dashboard/streamlit_app.py    # :8501
# terminal 2
cd web && npm run dev                        # :3000
```

Both surfaces read and write the same files — there is **no data migration**
needed and no risk of drift.

## How it talks to the rest of career-ops

Every API route in `web/app/api/` is a thin wrapper around the existing helpers.

| Route                              | Backed by                                            |
| ---------------------------------- | ---------------------------------------------------- |
| `GET /api/applications`            | `lib/parse-applications.ts` → `data/applications.md` |
| `PATCH /api/applications/[num]`    | `lib/parse-applications.ts` (status / notes / pdf)   |
| `GET /api/scan-history`            | `lib/scan-history.ts` → `data/scan-history.tsv`      |
| `PATCH /api/scan-history/status`   | `lib/scan-history.ts`                                |
| `GET /api/reports` / `[num]`       | `lib/parse-reports.ts` → `reports/*.md`              |
| `GET / PUT /api/profile`           | `lib/profile.ts` → `config/profile.yml`              |
| `GET /api/cv`                      | reads `cv.md`                                        |
| `POST /api/jd`                     | server-side fetch + HTML strip for a JD URL          |
| `POST /api/linkedin/search`        | spawns `node scrape-linkedin.mjs`                    |
| `POST /api/scan/add`               | spawns `node add-to-scan.mjs --from-stdin`           |
| `GET /api/scan/run` (SSE)          | spawns `node scan.mjs`                               |
| `POST /api/eval/stream` (SSE)      | spawns `cursor-agent` with the `oferta` prompt       |
| `POST /api/chat/stream` (SSE)      | spawns `cursor-agent` with the chat prompt           |
| `POST /api/docs/generate` (SSE)    | spawns `cursor-agent` with the `pdf` prompt          |
| `GET /api/files/[...path]`         | serves files under `output/` and `reports/` only     |

The streaming routes use **Server-Sent Events** so the React UI sees stdout
line by line — same UX as Streamlit's live evaluator, but with native browser
streaming.

## Design system

- **Tailwind v4** with CSS-based theme tokens in `app/globals.css`.
- **shadcn/ui** components owned by this project under `components/ui/`. Add
  more with `npx shadcn@latest add <component>` if your npm cache is
  permission-clean (otherwise just hand-write them — they're plain React).
- **next-themes** for light/dark/system. The toggle lives in the sidebar
  footer.
- **Recharts** for the conversion funnel.
- **Sonner** for toasts.
- **react-markdown + remark-gfm** for rendering chat replies and the cv.md
  preview.

## Environment

The app does **not** read any env vars at runtime. Both the `cursor-agent`
binary and `node` need to be on `PATH` — that's it. All paths resolve
relative to the parent career-ops repo via `lib/paths.ts`.

## Hard rules baked into the chat agent

The chat prompt (`lib/prompts.ts → buildChatPrompt`) restricts what the agent
can do, mirroring the Streamlit chat:

- No file writes EXCEPT through `add-to-scan.mjs` for explicit bulk saves.
- No evaluations or doc generation from the chat — emit a `jobs-json` block
  and let the React UI render the inline `⚡ Evaluate` button instead.
- LinkedIn searches go through `scrape-linkedin.mjs` (zero LLM cost on the
  scrape itself; only the agent's framing of the results uses tokens).

## Customizing

This app follows the same data contract as the rest of career-ops:

- **User-specific** content (CV, profile, archetypes, narrative) goes in
  `cv.md`, `config/profile.yml`, `modes/_profile.md`, or `article-digest.md`.
- **System** content (modes/_shared, scripts, templates, this UI) is
  auto-updatable.

So when you ask the agent to "rename the dashboard to 'Career Compass'" or
"make the funnel chart vertical instead of horizontal", it edits the React
files — the user-data files stay untouched.
