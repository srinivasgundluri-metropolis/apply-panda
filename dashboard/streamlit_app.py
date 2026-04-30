from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests
import streamlit as st
import yaml
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
REPORTS_DIR = REPO_ROOT / "reports"
OUTPUT_DIR = REPO_ROOT / "output"
COVER_LETTERS_DIR = OUTPUT_DIR / "cover-letters"
JDS_DIR = REPO_ROOT / "jds"
PROFILE_PATH = REPO_ROOT / "config" / "profile.yml"
CV_PATH = REPO_ROOT / "cv.md"
APPLICATIONS_PATH = DATA_DIR / "applications.md"
PIPELINE_PATH = DATA_DIR / "pipeline.md"
SCAN_HISTORY_PATH = DATA_DIR / "scan-history.tsv"
CHAT_HISTORY_PATH = DATA_DIR / "chat-history.json"
ENV_PATH = REPO_ROOT / ".env"

# Default Cursor Agent model when the user doesn't override it.
# `cursor-agent --list-models` reads from the user's account; leaving model
# empty lets the agent pick its default, which is the safest cross-account choice.
DEFAULT_CURSOR_MODEL = ""

# Canonical application states. Source of truth: `templates/states.yml`.
# Order matters — used as the dropdown's display order.
CANONICAL_STATES: list[str] = [
    "Evaluated",
    "Applied",
    "Responded",
    "Interview",
    "Offer",
    "Rejected",
    "Discarded",
    "SKIP",
]


@dataclass(frozen=True)
class ReportMeta:
    path: Path
    company: str | None
    role: str | None
    score: float | None
    pdf_path: Path | None
    legitimacy: str | None
    url: str | None


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def _extract_md_link_target(text: str) -> str | None:
    # [001](reports/001-company-date.md)
    m = re.search(r"\[[^\]]+\]\(([^)]+)\)", text)
    return m.group(1) if m else None


def _parse_score(value: str) -> float | None:
    v = value.strip().replace("**", "")
    if v in {"", "N/A", "DUP"}:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*5", v)
    return float(m.group(1)) if m else None


def save_applications_table(df: pd.DataFrame) -> None:
    """Serializes the DataFrame back to the applications.md markdown table format."""
    # Backup
    if APPLICATIONS_PATH.exists():
        backup_path = APPLICATIONS_PATH.with_suffix(".md.bak")
        backup_path.write_text(APPLICATIONS_PATH.read_text(encoding="utf-8"), encoding="utf-8")

    # Clean up derived/helper columns that aren't part of applications.md
    helper_cols = {"ScoreValue", "ReportPath", "ReportNum", "Docs", "URL"}
    cols_to_keep = [c for c in df.columns if c not in helper_cols]
    out_df = df[cols_to_keep].copy()

    # Convert to markdown
    md_table = out_df.to_markdown(index=False, tablefmt="github")

    content = "# Applications Tracker\n\n" + md_table + "\n"
    APPLICATIONS_PATH.write_text(content, encoding="utf-8")


def fetch_job_description(url: str) -> str:
    """Attempts to fetch and clean the job description from a URL."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove scripts, styles, and common nav/footer elements
        for s in soup(["script", "style", "nav", "footer", "header"]):
            s.decompose()

        # Try to find common JD containers
        main = soup.find("main") or soup.find("article") or soup.body
        text = main.get_text(separator="\n", strip=True)

        # Basic cleanup: remove too many newlines
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text
    except Exception as e:
        return f"Error fetching JD: {str(e)}"


def _read_env_file(path: Path) -> dict[str, str]:
    """Minimal .env parser used to detect API keys without requiring python-dotenv."""
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def detect_backends() -> dict[str, dict[str, Any]]:
    """Detects which evaluation backends are usable in the current environment."""
    cursor_path = shutil.which("cursor-agent")

    env_vars = _read_env_file(ENV_PATH)
    gemini_key = os.environ.get("GEMINI_API_KEY") or env_vars.get("GEMINI_API_KEY", "")
    gemini_eval_script = REPO_ROOT / "gemini-eval.mjs"
    node_path = shutil.which("node")

    return {
        "cursor_agent": {
            "available": bool(cursor_path),
            "binary": cursor_path,
            "label": "Cursor Agent (full pipeline)",
            "description": (
                "Runs the full `oferta` mode end-to-end: reads modes/cv, verifies the "
                "posting, writes `reports/{NNN}-{slug}-{date}.md`, drops a tracker TSV, "
                "and runs `merge-tracker.mjs` automatically."
            ),
        },
        "gemini": {
            "available": bool(gemini_key) and bool(node_path) and gemini_eval_script.exists(),
            "binary": node_path,
            "label": "Gemini (fast / free)",
            "description": (
                "Single Gemini call via `gemini-eval.mjs`. No web verification or PDF "
                "generation, but quick and free-tier friendly."
            ),
        },
    }


def stage_jd(jd_text: str, source_url: str | None) -> Path:
    """Writes the JD to `jds/dashboard-{timestamp}.txt` so the agent can read it."""
    JDS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = JDS_DIR / f"dashboard-{timestamp}.txt"

    header_lines: list[str] = []
    if source_url:
        header_lines.append(f"Source URL: {source_url}")
        header_lines.append("")
    path.write_text("\n".join(header_lines) + jd_text, encoding="utf-8")
    return path


def _stream_subprocess(cmd: list[str], env: dict[str, str] | None = None) -> Iterator[str]:
    """Yields stdout/stderr lines as they arrive, then yields a final exit-code marker."""
    proc = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        env=env or os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        yield line
    proc.stdout.close()
    code = proc.wait()
    yield f"\n[exit code: {code}]\n"


def _build_cursor_agent_prompt(jd_path: Path, source_url: str | None) -> str:
    rel_jd = jd_path.relative_to(REPO_ROOT)
    lines = [
        "Evaluate this job offer end-to-end using the career-ops `oferta` mode.",
        "",
        f"The job description is saved at: `{rel_jd}`",
    ]
    if source_url:
        lines.append(f"Source URL: {source_url}")
    lines += [
        "",
        "Required steps (do them all, in order):",
        "1. Read `modes/oferta.md`, `modes/_shared.md`, `modes/_profile.md`, `cv.md`, "
        "and `config/profile.yml` and follow them exactly.",
        "2. Produce the full Blocks A through G evaluation in English (unless the JD is "
        "in another language, in which case follow the language rules in `_shared.md`).",
        "3. Save the report to `reports/{NNN}-{company-slug}-{YYYY-MM-DD}.md` using the "
        "canonical header (Date, Archetype, Score, URL, Legitimacy, PDF). Use the next "
        "sequential 3-digit number based on existing files in `reports/`.",
        "4. Write the tracker TSV to `batch/tracker-additions/{NNN}-{company-slug}.tsv` "
        "with the 9 tab-separated columns documented in `CLAUDE.md`.",
        "5. Run `node merge-tracker.mjs` to merge the TSV into `data/applications.md`.",
        "6. Print a final single-line summary in the form: "
        "`DONE: reports/{filename} | score={X.X}/5 | legitimacy={tier}`.",
        "",
        "Do NOT submit any application. Do NOT generate a CV PDF unless explicitly "
        "asked. Never edit `applications.md` directly to add new rows — always go "
        "through the TSV + merge flow.",
    ]
    return "\n".join(lines)


def run_cursor_agent_eval(
    jd_text: str,
    source_url: str | None,
    model: str | None = None,
) -> Iterator[str]:
    """Streams a full career-ops evaluation via `cursor-agent -p`."""
    jd_path = stage_jd(jd_text, source_url)
    yield f"📝 Staged JD: {jd_path.relative_to(REPO_ROOT)}\n"

    prompt = _build_cursor_agent_prompt(jd_path, source_url)

    cmd: list[str] = [
        "cursor-agent",
        "-p",
        "--force",
        "--trust",
        "--workspace",
        str(REPO_ROOT),
    ]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)

    yield f"🚀 Launching: cursor-agent -p {'--model ' + model + ' ' if model else ''}...\n\n"
    yield from _stream_subprocess(cmd)


def run_gemini_eval(
    jd_text: str,
    source_url: str | None,
    model: str | None = None,  # noqa: ARG001 — accepted for dispatcher parity
) -> Iterator[str]:
    """Streams a Gemini-only evaluation via `gemini-eval.mjs`."""
    # gemini-eval.mjs accepts the JD as a positional arg, but very long JDs can blow
    # past argv limits — stage it to a file and pass --file instead.
    jd_path = stage_jd(jd_text, source_url)
    yield f"📝 Staged JD: {jd_path.relative_to(REPO_ROOT)}\n"

    cmd = [
        "node",
        str(REPO_ROOT / "gemini-eval.mjs"),
        "--file",
        str(jd_path),
    ]
    yield "🚀 Launching: node gemini-eval.mjs --file ...\n\n"

    env = os.environ.copy()
    # Promote .env entries into the subprocess env so users don't need a global export.
    for k, v in _read_env_file(ENV_PATH).items():
        env.setdefault(k, v)

    yield from _stream_subprocess(cmd, env=env)


def newest_report() -> Path | None:
    """Returns the most-recently-modified report file in `reports/`."""
    if not REPORTS_DIR.exists():
        return None
    candidates = [p for p in REPORTS_DIR.glob("*.md") if p.is_file()]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


# Tokens that, on their own, are too generic to count as a "company match" in
# the fuzzy doc-detection fallback. Drop them before comparing slugs.
_COMPANY_STOPWORDS: frozenset[str] = frozenset(
    {"corp", "company", "the", "and", "inc", "ltd", "llc", "gmbh", "group"}
)


def _company_match_tokens(company_slug: str) -> list[str]:
    """Returns the set of tokens from `company_slug` that are distinctive
    enough to use for fuzzy doc filename matching (length >= 4 and not a
    generic stopword like 'corp' or 'group')."""
    parts = re.split(r"-+", company_slug)
    return [t for t in parts if len(t) >= 4 and t not in _COMPANY_STOPWORDS]


def find_existing_doc(
    candidate_slug: str, company_slug: str, kind: str
) -> Path | None:
    """Returns the most-recent generated CV (`kind="cv"`) or cover letter
    (`kind="cl"`) that matches `{candidate_slug}` and the company.

    Matching is permissive: it falls back from the canonical
    `cv-{candidate}-{company}-{date}.pdf` slug to a token-based fuzzy match,
    so a CV saved as `cv-jeevitha-puttaiah-uchicago-2026-04-28.pdf` is still
    found when the tracker row says `University of Chicago`.
    """
    if not candidate_slug or not company_slug:
        return None
    if kind == "cv":
        directory, prefix = OUTPUT_DIR, f"cv-{candidate_slug}-"
    elif kind == "cl":
        directory, prefix = (
            COVER_LETTERS_DIR,
            f"cover-letter-{candidate_slug}-",
        )
    else:
        return None
    if not directory.exists():
        return None

    # 1) Strict canonical match — fast path.
    strict = sorted(
        directory.glob(f"{prefix}{company_slug}-*.pdf"), reverse=True
    )
    if strict:
        return strict[0]

    # 2) Token-based fuzzy fallback. Walk all PDFs for this candidate, peel
    #    the candidate prefix and the trailing `-YYYY-MM-DD` suffix, then
    #    compare what's left to the company slug.
    tokens = _company_match_tokens(company_slug)
    if not tokens:
        return None

    file_re = re.compile(
        r"^" + re.escape(prefix) + r"(.+)-\d{4}-\d{2}-\d{2}\.pdf$"
    )
    fuzzy_matches: list[Path] = []
    for path in directory.glob(f"{prefix}*.pdf"):
        m = file_re.match(path.name)
        if not m:
            continue
        file_company = m.group(1)
        # Match if any distinctive company token appears in the file's
        # company segment, OR if the file's company segment appears as a
        # substring of the canonical slug (catches abbreviations like
        # "uchicago" inside "university-of-chicago").
        if any(t in file_company for t in tokens) or file_company in company_slug:
            fuzzy_matches.append(path)

    if fuzzy_matches:
        return sorted(fuzzy_matches, reverse=True)[0]
    return None


def run_cursor_agent_task(
    prompt: str, model: str | None = None
) -> Iterator[str]:
    """Runs a generic cursor-agent task in print mode and streams its output."""
    cmd: list[str] = [
        "cursor-agent",
        "-p",
        "--force",
        "--trust",
        "--workspace",
        str(REPO_ROOT),
    ]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)

    yield f"🚀 Launching: cursor-agent -p {'--model ' + model + ' ' if model else ''}...\n\n"
    yield from _stream_subprocess(cmd)


def run_cursor_agent_chat(
    prompt: str, model: str | None = None
) -> Iterator[str]:
    """Runs cursor-agent in default print mode for the chat assistant.

    Why not `--mode ask`? Because ask is read-only for *every* tool, including
    shell, which means the agent can't invoke `scrape-linkedin.mjs` for live
    LinkedIn searches. The system prompt below tightly constrains what the
    agent is allowed to write or execute.
    """
    cmd: list[str] = [
        "cursor-agent",
        "-p",
        "--force",
        "--trust",
        "--workspace",
        str(REPO_ROOT),
    ]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)
    yield from _stream_subprocess(cmd)


def _build_chat_prompt(
    user_message: str,
    history: list[dict[str, str]],
    candidate_first_name: str,
) -> str:
    """Builds a single self-contained prompt for the chat assistant.

    Each turn is independent: we re-send the entire prior conversation so
    the agent (which doesn't share state across `cursor-agent -p` invocations)
    has the context it needs.
    """
    history_block = ""
    if history:
        formatted = []
        for msg in history:
            role = "User" if msg["role"] == "user" else "Assistant"
            formatted.append(f"{role}: {msg['content']}")
        history_block = "\n\nPrevious conversation:\n" + "\n".join(formatted)

    you = candidate_first_name or "the user"
    return f"""You are {you}'s career-ops assistant inside a Streamlit dashboard. Answer their questions concisely in GitHub-flavored markdown.

LOCAL WORKSPACE (prefer this for "what's in my tracker / scan history" questions):
- `data/scan-history.tsv` — every job offer the portal scanner has ever seen (columns include `company`, `title`, `url`, `portal`, `status`, `first_seen`, `last_seen`).
- `data/applications.md` — the canonical application tracker (markdown table with `#`, `Date`, `Company`, `Role`, `Score`, `Status`, `PDF`, `Report`, `Notes`).
- `reports/*.md` — completed evaluation reports (one per evaluated job, with full A–G blocks).
- `cv.md`, `config/profile.yml`, `modes/_profile.md` — {you}'s CV, profile, and personalized targeting rules.
- `portals.yml` — the list of companies / portals the scanner is configured to track.

LIVE TOOLS:
1. **LinkedIn jobs scraper** — `node scrape-linkedin.mjs` returns clean JSON from LinkedIn's public guest endpoint. Use it for *any* request involving LinkedIn jobs by company, location, or keywords.

   Examples:
     node scrape-linkedin.mjs --keywords "biotech" --location "Chicago" --limit 25
     node scrape-linkedin.mjs --keywords "AI engineer" --location "California" --time-range week
     node scrape-linkedin.mjs --keywords "research associate" --location "Stanford University" --limit 15
     node scrape-linkedin.mjs --keywords "ML engineer" --remote --time-range 24h --limit 50

   Time range: `24h` | `week` | `month` | `any` (default `any`).
   When the user asks for "Stanford" or any specific employer, pass it via `--location` first; if results are weak, retry with the company name in `--keywords`.
   Always parse the JSON and present `results` as a markdown table: Title, Company, Location, Posted, Link.

2. **Add jobs to the dashboard's scan list** — `node add-to-scan.mjs --from-stdin` (or single-job flags) appends jobs to `data/scan-history.tsv` with `status=added`. Skips duplicates by URL automatically. Use it ONLY as a fallback when the user explicitly asks to bulk-save (e.g. _"save all 25 to my scan list"_) — for normal LinkedIn results, the dashboard renders inline 💾 Save / ⚡ Evaluate buttons (see "STRUCTURED OUTPUT" below) so the user clicks instead of asking you.

   Pipe pattern (bulk save, batched):
     node scrape-linkedin.mjs --keywords "biotech" --location "Stanford University" --limit 10 \\
       | node add-to-scan.mjs --from-stdin --pretty

3. **WebSearch / WebFetch** — for general company research, comp benchmarks, or non-LinkedIn job boards (Indeed, company careers pages). Use only when LinkedIn / local data can't answer.

4. **Shell** — restricted to:
   - `node scrape-linkedin.mjs ...` and `node add-to-scan.mjs ...` (the two helpers above).
   - Read-only inspection: `grep`, `rg`, `head`, `tail`, `wc`, `cat`, `ls`, `awk`/`sed` (no `-i`).
   Never run anything else. No `scan.mjs`, no `merge-tracker.mjs`, no `gemini-eval.mjs`, no `generate-pdf.mjs`, no `git`, no `npm`, no `pip`, no destructive commands.

STRUCTURED OUTPUT — REQUIRED FOR LIVE JOB RESULTS:
Whenever you present jobs from `scrape-linkedin.mjs` (or any live source), you MUST also emit a fenced ```jobs-json``` block at the END of your reply. The dashboard parses it to render inline 💾 Save and ⚡ Evaluate buttons under your message — that's how the user acts on individual rows in one click.

Format — exactly this, with the `jobs-json` language tag:

  ```jobs-json
  [
    {{"url": "https://www.linkedin.com/jobs/view/...", "company": "Stanford University", "title": "Research Associate", "location": "Stanford, CA", "posted": "1 week ago"}},
    {{"url": "...", "company": "...", "title": "...", "location": "...", "posted": "..."}}
  ]
  ```

Rules:
- Include every job you displayed in the markdown table (one object per row, same order).
- `url`, `company`, `title` are REQUIRED. `location` and `posted` are optional.
- Use bare URLs (no markdown link syntax) inside the JSON.
- Cap the array at 25 items — if the scrape returned more, keep the most recent 25.
- Place the block AT THE END of the message, after the markdown table. No prose after it.
- If the user asks a non-job question or no jobs were found, OMIT the block entirely.

HARD RULES:
- DO NOT write or edit files directly (`>`, `>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`, `Write`/`Edit` tool calls). The only state changes you may make are through `add-to-scan.mjs` when explicitly asked for a bulk save.
- DO NOT trigger evaluations, CV/CL generation, applications, or recruiter outreach. The user clicks the inline ⚡ Evaluate button (which the dashboard renders from your jobs-json block) — you do not run any evaluation script yourself.
- If asked "evaluate this LinkedIn job", just emit the jobs-json block and reply: _"Click ⚡ Evaluate next to the row you want — it'll run the full A–G pipeline inline."_

ANSWER STYLE:
- For multi-row results, use a compact markdown table. Keep URLs as bare links, not "click here".
- Sort job listings by recency (`first_seen` for local, `posted_date` for LinkedIn) descending.
- Be concise — under 250 words unless the user asks for detail.
- If you're going to run a shell command, just do it (don't ask for confirmation). The user expects results, not status updates.
- LinkedIn ToS reminder: this is for {you}'s personal job search only. If results look blocked / empty, say so plainly.{history_block}

User: {user_message}
"""


# ── Chat persistence ─────────────────────────────────────────────────
#
# Streamlit drops `st.session_state` on every full browser refresh, which
# means chat history would vanish each time the user reloads the tab. We
# persist the conversation (and its matching `recent_searches`) to a JSON
# file under `data/` so the chat survives restarts. The file is gitignored
# alongside the rest of the user's personal data.


def _load_chat_state() -> dict[str, Any]:
    """Reads persisted chat history + recent searches from disk.

    Returns `{"chat_history": [...], "recent_searches": [...]}`. Any read
    or parse error is swallowed and an empty state is returned so a corrupt
    file never blocks the dashboard from booting.
    """
    if not CHAT_HISTORY_PATH.exists():
        return {"chat_history": [], "recent_searches": []}
    try:
        data = json.loads(CHAT_HISTORY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"chat_history": [], "recent_searches": []}
    if not isinstance(data, dict):
        return {"chat_history": [], "recent_searches": []}
    history = data.get("chat_history") or []
    recent = data.get("recent_searches") or []
    if not isinstance(history, list):
        history = []
    if not isinstance(recent, list):
        recent = []
    return {"chat_history": history, "recent_searches": recent}


def _save_chat_state() -> None:
    """Writes current chat history + recent searches to `CHAT_HISTORY_PATH`.

    Best-effort: any I/O failure is swallowed so a missing/locked disk
    never crashes the chat UI. Atomic rename keeps the file from being
    truncated mid-write if Streamlit reloads at the wrong moment.
    """
    payload = {
        "chat_history": st.session_state.get("chat_history", []),
        "recent_searches": st.session_state.get("recent_searches", []),
    }
    try:
        CHAT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = CHAT_HISTORY_PATH.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(CHAT_HISTORY_PATH)
    except OSError:
        pass


# ── Chat job-results parsing + actions ───────────────────────────────
#
# The chat agent is instructed to emit a `jobs-json` fenced block alongside
# any LinkedIn results table (see _build_chat_prompt above). We parse that
# sidecar block out of the raw markdown reply, hide it from the rendered
# message, and use it to drive inline 💾 Save / ⚡ Evaluate buttons.
# Recent search history (last 4) lives in st.session_state["recent_searches"]
# so the user can re-display past results without re-running the agent.

_JOBS_BLOCK_RE = re.compile(
    r"```jobs[-_]?json\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE
)


def _extract_jobs_block(content: str) -> tuple[str, list[dict[str, Any]] | None]:
    """Returns `(content_without_block, jobs_list_or_None)`.

    Tolerates `jobs-json`, `jobs_json`, or `JOBS-JSON` tags. If the block
    parses as JSON but is not a list of dicts, the block is stripped and
    `None` is returned (so we never render bogus buttons). The block is
    removed from the visible markdown so the user sees a clean reply.
    """
    m = _JOBS_BLOCK_RE.search(content)
    if not m:
        return content, None
    raw = m.group(1).strip()
    cleaned = _JOBS_BLOCK_RE.sub("", content, count=1).rstrip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return cleaned, None
    if not isinstance(parsed, list):
        return cleaned, None
    jobs: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url", "")).strip()
        company = str(item.get("company", "")).strip()
        title = str(item.get("title", "")).strip()
        if not url or not company or not title:
            continue
        jobs.append(
            {
                "url": url,
                "company": company,
                "title": title,
                "location": str(item.get("location", "")).strip(),
                "posted": str(item.get("posted", "")).strip(),
            }
        )
    return cleaned, jobs or None


def save_jobs_to_scan(jobs: list[dict[str, Any]]) -> dict[str, Any]:
    """Pipes jobs through `add-to-scan.mjs --from-stdin` and parses its summary.

    Returns a dict shaped like
        {"added": int, "skipped_duplicates": int, "total": int,
         "added_jobs": [...], "error": str | None}.
    Never raises — surfaces errors via the `error` key so callers can render
    them in the UI without crashing the chat.
    """
    if not jobs:
        return {
            "added": 0,
            "skipped_duplicates": 0,
            "total": 0,
            "added_jobs": [],
            "error": None,
        }
    payload = json.dumps({"results": jobs})
    try:
        proc = subprocess.run(
            ["node", "add-to-scan.mjs", "--from-stdin"],
            input=payload,
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            check=False,
            timeout=30,
        )
    except FileNotFoundError:
        return {
            "added": 0,
            "skipped_duplicates": 0,
            "total": len(jobs),
            "added_jobs": [],
            "error": "node not found — install Node.js to use Save buttons.",
        }
    except subprocess.TimeoutExpired:
        return {
            "added": 0,
            "skipped_duplicates": 0,
            "total": len(jobs),
            "added_jobs": [],
            "error": "add-to-scan.mjs timed out after 30s.",
        }
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "unknown error").strip()
        return {
            "added": 0,
            "skipped_duplicates": 0,
            "total": len(jobs),
            "added_jobs": [],
            "error": err,
        }
    try:
        summary = json.loads(proc.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return {
            "added": 0,
            "skipped_duplicates": 0,
            "total": len(jobs),
            "added_jobs": [],
            "error": f"could not parse summary: {proc.stdout!r}",
        }
    summary.setdefault("error", None)
    return summary


def _track_recent_search(
    user_prompt: str, jobs: list[dict[str, Any]], *, max_keep: int = 4
) -> None:
    """Records this search in `st.session_state['recent_searches']`.

    Dedupes by exact prompt — re-asking the same question bumps it to the top
    rather than creating a duplicate entry. Keeps at most `max_keep` entries.
    """
    if not jobs:
        return
    bucket = st.session_state.setdefault("recent_searches", [])
    entry = {
        "prompt": user_prompt.strip(),
        "jobs": jobs,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": len(jobs),
    }
    deduped = [s for s in bucket if s.get("prompt") != entry["prompt"]]
    st.session_state["recent_searches"] = ([entry] + deduped)[:max_keep]
    _save_chat_state()


def _render_recent_jobs_table(jobs: list[dict[str, Any]]) -> None:
    """Renders a compact markdown table for replayed recent-search results.

    Used inside the "Recent searches" expander when the user clicks "Show".
    Mirrors the table the agent originally produced, but rebuilt from the
    cached jobs-json so we don't re-run the LinkedIn scrape.
    """
    if not jobs:
        st.caption("No jobs in this search.")
        return
    rows = ["| Title | Company | Location / Posted | Link |", "|---|---|---|---|"]
    for j in jobs:
        title = (j.get("title") or "—").replace("|", "\\|")
        company = (j.get("company") or "—").replace("|", "\\|")
        loc = (j.get("location") or j.get("posted") or "—").replace("|", "\\|")
        url = j.get("url", "")
        link = f"[Open]({url})" if url else "—"
        rows.append(f"| {title} | {company} | {loc} | {link} |")
    st.markdown("\n".join(rows))


def _render_chat_job_actions(
    jobs: list[dict[str, Any]],
    key_prefix: str,
    *,
    show_bulk: bool = True,
) -> None:
    """Renders inline Save / Evaluate buttons under a chat message.

    `key_prefix` MUST be unique per render origin (message index for fresh
    chat replies, "recent_<i>" for replayed history). Streamlit raises
    DuplicateWidgetID otherwise.

    Sets `st.session_state['chat_pending_eval']` when the user clicks ⚡ —
    the chat page detects that flag at the bottom and runs the eval inline.
    """
    if not jobs:
        return
    n = len(jobs)
    st.markdown("")  # tiny vertical breather
    header_cols = st.columns([5, 2])
    with header_cols[0]:
        st.caption(
            f"💼 **{n}** job{'s' if n != 1 else ''} from this search — act on them below."
        )
    if show_bulk:
        with header_cols[1]:
            if st.button(
                f"💾 Save all to scan list",
                key=f"{key_prefix}_save_all",
                use_container_width=True,
                help="Append every job above to data/scan-history.tsv (skips duplicates).",
            ):
                summary = save_jobs_to_scan(jobs)
                if summary.get("error"):
                    st.toast(f"Save failed: {summary['error']}", icon="❌")
                else:
                    st.cache_data.clear()
                    st.toast(
                        f"Saved {summary['added']} · skipped {summary['skipped_duplicates']} duplicate(s).",
                        icon="✅",
                    )
                    st.rerun()

    with st.expander(f"Per-job actions ({n})", expanded=False):
        for j_idx, job in enumerate(jobs):
            row = st.columns([5, 1, 1])
            with row[0]:
                title = job.get("title", "—")
                company = job.get("company", "—")
                loc = job.get("location") or job.get("posted") or ""
                st.markdown(f"**{title}** · {company}")
                if loc:
                    st.caption(loc)
            with row[1]:
                if st.button(
                    "💾",
                    key=f"{key_prefix}_save_{j_idx}",
                    help=f"Save '{job.get('title')}' to scan list",
                    use_container_width=True,
                ):
                    summary = save_jobs_to_scan([job])
                    if summary.get("error"):
                        st.toast(f"Save failed: {summary['error']}", icon="❌")
                    elif summary.get("added", 0) > 0:
                        st.cache_data.clear()
                        st.toast(f"Saved: {company} — {title}", icon="✅")
                        st.rerun()
                    else:
                        st.toast(
                            f"Already in scan history: {company} — {title}",
                            icon="ℹ️",
                        )
            with row[2]:
                if st.button(
                    "⚡",
                    key=f"{key_prefix}_eval_{j_idx}",
                    help="Run full A–G evaluation pipeline inline",
                    use_container_width=True,
                ):
                    save_jobs_to_scan([job])  # ensure it's in scan-history first
                    st.session_state["chat_pending_eval"] = {
                        "url": job.get("url", ""),
                        "company": company,
                        "title": title,
                    }
                    st.session_state.pop("chat_eval_result", None)
                    st.cache_data.clear()
                    st.rerun()


# Ordered phase detector. The first matching pattern wins, so put the most
# specific signals (final "DONE", saving, tracker merge) before general ones
# (reading files, generic tool use). Patterns are matched case-insensitively.
_PHASE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^\s*DONE:\s", re.MULTILINE), "Finalizing"),
    (re.compile(r"merge-tracker\.mjs"), "Updating tracker"),
    (re.compile(r"batch/tracker-additions/"), "Writing tracker TSV"),
    (re.compile(r"reports/\d{3}-[\w-]+-\d{4}-\d{2}-\d{2}\.md"), "Writing report"),
    (re.compile(r"report\s+saved", re.IGNORECASE), "Writing report"),
    (re.compile(r"playwright|browser_navigate|browser_snapshot", re.IGNORECASE), "Verifying posting"),
    (re.compile(r"web[_ ]?search|web[_ ]?fetch", re.IGNORECASE), "Researching company / comp"),
    (re.compile(r"calling\s+gemini", re.IGNORECASE), "Calling Gemini API"),
    (re.compile(r"loading context", re.IGNORECASE), "Loading context"),
    (re.compile(r"modes/oferta|modes/_shared|modes/_profile", re.IGNORECASE), "Reading evaluation rules"),
    (re.compile(r"\bcv\.md\b|config/profile\.yml", re.IGNORECASE), "Reading profile / CV"),
    (re.compile(r"^\s*(staged jd|launching)", re.IGNORECASE | re.MULTILINE), "Starting"),
]


def _detect_phase(line: str, current: str) -> str:
    for pattern, phase in _PHASE_PATTERNS:
        if pattern.search(line):
            return phase
    return current


def update_application_status(app_num: str | int, new_status: str) -> bool:
    """Updates the `Status` column for the row matching `#` in applications.md.

    Reads the current table fresh (clearing the cache first), patches the row,
    and writes the entire table back via `save_applications_table` so the
    canonical markdown formatting is preserved. Returns True on success.
    """
    if new_status not in CANONICAL_STATES:
        return False
    if not APPLICATIONS_PATH.exists():
        return False

    # Drop cached copy so we read the latest on-disk state.
    st.cache_data.clear()
    df = load_applications_table()
    if df.empty or "#" not in df.columns or "Status" not in df.columns:
        return False

    target = str(app_num).strip()
    mask = df["#"].astype(str).str.strip() == target
    if not mask.any():
        return False

    df.loc[mask, "Status"] = new_status
    save_applications_table(df)
    st.cache_data.clear()
    return True


def update_scan_status(url: str, new_status: str) -> bool:
    """Updates the `status` column for the row matching `url` in scan-history.tsv.

    Returns True if a row was updated, False otherwise.
    """
    if not SCAN_HISTORY_PATH.exists():
        return False
    try:
        df = pd.read_csv(SCAN_HISTORY_PATH, sep="\t")
    except Exception:
        return False
    if "url" not in df.columns or "status" not in df.columns:
        return False
    mask = df["url"] == url
    if not mask.any():
        return False

    # Backup once before the first edit of this session, mirroring the
    # applications.md backup pattern used by save_applications_table.
    backup_path = SCAN_HISTORY_PATH.with_suffix(".tsv.bak")
    if not backup_path.exists():
        backup_path.write_text(
            SCAN_HISTORY_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )

    df.loc[mask, "status"] = new_status
    df.to_csv(SCAN_HISTORY_PATH, sep="\t", index=False)
    return True


@st.cache_data(show_spinner=False)
def load_scan_history() -> pd.DataFrame:
    if not SCAN_HISTORY_PATH.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(SCAN_HISTORY_PATH, sep="\t")
        return df
    except Exception:
        return pd.DataFrame()


@st.cache_data(show_spinner=False)
def load_profile() -> dict[str, Any]:
    if not PROFILE_PATH.exists():
        return {}
    return yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8")) or {}


@st.cache_data(show_spinner=False)
def load_cv_markdown() -> str:
    if not CV_PATH.exists():
        return ""
    return CV_PATH.read_text(encoding="utf-8")


@st.cache_data(show_spinner=False)
def load_pipeline_markdown() -> str:
    if not PIPELINE_PATH.exists():
        return ""
    return PIPELINE_PATH.read_text(encoding="utf-8")


def parse_pipeline(text: str) -> tuple[list[str], list[str]]:
    pending: list[str] = []
    processed: list[str] = []
    section: str | None = None

    for raw in text.splitlines():
        line = raw.strip()
        if line.lower().startswith("## pendientes"):
            section = "pending"
            continue
        if line.lower().startswith("## procesadas"):
            section = "processed"
            continue
        if not line.startswith("- ["):
            continue

        if section == "pending":
            pending.append(line)
        elif section == "processed":
            processed.append(line)

    return pending, processed


@st.cache_data(show_spinner=False)
def load_applications_table() -> pd.DataFrame:
    if not APPLICATIONS_PATH.exists():
        return pd.DataFrame()

    lines = APPLICATIONS_PATH.read_text(encoding="utf-8").splitlines()
    table_lines = [ln for ln in lines if ln.strip().startswith("|")]
    if len(table_lines) < 2:
        return pd.DataFrame()

    header = [c.strip() for c in table_lines[0].strip().strip("|").split("|")]
    rows: list[list[str]] = []
    for ln in table_lines[2:]:
        if "---" in ln:
            continue
        # Notes (and sometimes other fields) may contain raw "|" characters.
        # The core scripts tolerate this, so the dashboard must be resilient:
        # if we have extra splits, merge the tail back into the last column.
        parts = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(parts) < len(header):
            continue
        if len(parts) > len(header):
            parts = parts[: len(header) - 1] + [" | ".join(parts[len(header) - 1 :]).strip()]
        rows.append(parts)

    df = pd.DataFrame(rows, columns=header)
    # Normalize expected columns
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce").dt.date
    if "Score" in df.columns:
        df["ScoreValue"] = df["Score"].apply(_parse_score)
    if "Report" in df.columns:
        df["ReportPath"] = df["Report"].apply(lambda v: _extract_md_link_target(str(v)) or "")
        df["ReportNum"] = df["Report"].str.extract(r"\[(\d+)\]")[0]

    # Derive a clickable Apply URL per row. Source order:
    #   1. The evaluation report's `**URL:**` header line (most reliable).
    #   2. Fallback to scan-history.tsv matching by company (best-effort —
    #      grabs the first row whose company case-insensitively matches).
    # Both lookups are cheap because their inner reads are @cache_data.
    scan_url_by_company: dict[str, str] = {}
    if SCAN_HISTORY_PATH.exists():
        try:
            scan_df = pd.read_csv(SCAN_HISTORY_PATH, sep="\t")
            if "company" in scan_df.columns and "url" in scan_df.columns:
                for _, srow in scan_df.iterrows():
                    key = str(srow["company"]).strip().lower()
                    if key and key not in scan_url_by_company:
                        scan_url_by_company[key] = str(srow["url"]).strip()
        except Exception:
            scan_url_by_company = {}

    def _row_url(row: pd.Series) -> str:
        report_path = str(row.get("ReportPath", "")).strip()
        if report_path:
            meta = load_report_meta(report_path)
            if meta and meta.url:
                return meta.url
        company_key = str(row.get("Company", "")).strip().lower()
        return scan_url_by_company.get(company_key, "")

    df["URL"] = df.apply(_row_url, axis=1) if not df.empty else ""

    return df


@st.cache_data(show_spinner=False)
def load_report_meta(report_rel_path: str) -> ReportMeta | None:
    if not report_rel_path:
        return None
    report_path = (REPO_ROOT / report_rel_path).resolve()
    if not report_path.exists():
        return None

    text = report_path.read_text(encoding="utf-8", errors="replace")

    # First line: "# Evaluation: Company — Role"
    company = None
    role = None
    first = text.splitlines()[0] if text else ""
    m = re.match(r"^#\s*Evaluation:\s*(.*?)\s+—\s+(.*)$", first)
    if m:
        company = m.group(1).strip()
        role = m.group(2).strip()

    score = None
    m = re.search(r"^\*\*Score:\*\*\s*([0-9.]+)\s*/\s*5", text, flags=re.MULTILINE)
    if m:
        score = float(m.group(1))

    legitimacy = None
    m = re.search(r"^\*\*Legitimacy:\*\*\s*(.+)$", text, flags=re.MULTILINE)
    if m:
        legitimacy = m.group(1).strip()

    pdf_path = None
    m = re.search(r"^\*\*PDF:\*\*\s*(.+)$", text, flags=re.MULTILINE)
    if m:
        candidate_pdf = m.group(1).strip()
        # stored as relative like "output/..."
        p = (REPO_ROOT / candidate_pdf).resolve()
        if p.exists():
            pdf_path = p

    # Reports include `**URL:** https://...` in the header (per oferta.md
    # template). Pull it out so the tracker can render a one-click "Apply"
    # link without forcing the user to open the report first. We also strip
    # any markdown link wrapping like `[Apply here](https://...)`.
    url: str | None = None
    m = re.search(r"^\*\*URL:\*\*\s*(.+?)\s*$", text, flags=re.MULTILINE)
    if m:
        candidate_url = m.group(1).strip()
        link_match = re.match(r"\[.*?\]\((https?://[^)]+)\)", candidate_url)
        if link_match:
            candidate_url = link_match.group(1).strip()
        if candidate_url.startswith(("http://", "https://")):
            url = candidate_url

    return ReportMeta(
        path=report_path,
        company=company,
        role=role,
        score=score,
        pdf_path=pdf_path,
        legitimacy=legitimacy,
        url=url,
    )


def _download_button(label: str, path: Path, mime: str) -> None:
    if not path.exists():
        st.caption(f"Missing: `{path.relative_to(REPO_ROOT)}`")
        return
    st.download_button(
        label=label,
        data=path.read_bytes(),
        file_name=path.name,
        mime=mime,
        use_container_width=True,
    )


def _candidate_slug(profile: dict[str, Any]) -> str:
    full_name = ((profile.get("candidate") or {}).get("full_name") or "").strip()
    return _slugify(full_name) if full_name else "candidate"


def _candidate_full_name(profile: dict[str, Any]) -> str:
    return ((profile.get("candidate") or {}).get("full_name") or "").strip()


def _first_name(profile: dict[str, Any]) -> str:
    full = _candidate_full_name(profile)
    return full.split()[0] if full else ""


def _initials(profile: dict[str, Any]) -> str:
    full = _candidate_full_name(profile)
    parts = [p[0].upper() for p in full.split() if p]
    return "".join(parts[:2]) or "?"


# Stable color picked deterministically from the candidate's name so the
# avatar circle in the sidebar feels like "theirs" without requiring an
# upload. Catppuccin Mocha-ish palette to match the Go TUI's vibe.
_AVATAR_PALETTE = [
    "#cba6f7",  # mauve
    "#89b4fa",  # blue
    "#74c7ec",  # sapphire
    "#a6e3a1",  # green
    "#f9e2af",  # yellow
    "#fab387",  # peach
    "#f38ba8",  # pink
]


def _avatar_color(profile: dict[str, Any]) -> str:
    name = _candidate_full_name(profile) or "career-ops"
    return _AVATAR_PALETTE[sum(ord(c) for c in name) % len(_AVATAR_PALETTE)]


def update_profile(updates: dict[str, Any]) -> bool:
    """Patches `config/profile.yml` with a deep-merged partial dict.

    Backs up the existing file once per session to `config/profile.yml.bak`,
    preserves all fields the form doesn't touch, and clears the Streamlit
    cache so the next read sees the new values. Returns True on success.
    """
    PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any] = {}
    if PROFILE_PATH.exists():
        backup_path = PROFILE_PATH.with_suffix(".yml.bak")
        if not backup_path.exists():
            backup_path.write_text(
                PROFILE_PATH.read_text(encoding="utf-8"), encoding="utf-8"
            )
        try:
            existing = (
                yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8")) or {}
            )
        except yaml.YAMLError:
            existing = {}

    def deep_merge(target: dict[str, Any], src: dict[str, Any]) -> dict[str, Any]:
        for k, v in src.items():
            if isinstance(v, dict) and isinstance(target.get(k), dict):
                deep_merge(target[k], v)
            else:
                target[k] = v
        return target

    merged = deep_merge(existing, updates)
    try:
        PROFILE_PATH.write_text(
            yaml.dump(
                merged,
                sort_keys=False,
                default_flow_style=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
    except OSError:
        return False

    st.cache_data.clear()
    return True


def _render_avatar(profile: dict[str, Any], size: int = 48) -> None:
    """Renders a colored circle with the candidate's initials inside it.

    The HTML stays inside Streamlit's `st.markdown(unsafe_allow_html=True)`
    sandbox — no scripts, no external resources, just inline styles.
    """
    initials = _initials(profile)
    color = _avatar_color(profile)
    st.markdown(
        f"""
        <div style="
            width:{size}px;height:{size}px;border-radius:50%;
            background:{color};color:#11111b;display:flex;
            align-items:center;justify-content:center;
            font-weight:700;font-size:{int(size * 0.4)}px;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
            box-shadow:0 1px 4px rgba(0,0,0,0.15);
        ">{initials}</div>
        """,
        unsafe_allow_html=True,
    )


def _render_personalized_sidebar(profile: dict[str, Any]) -> None:
    """Sidebar header: avatar + name + key contact fields."""
    candidate = profile.get("candidate") or {}
    first = _first_name(profile)
    full_name = _candidate_full_name(profile)

    with st.sidebar:
        col_avatar, col_name = st.columns([1, 3])
        with col_avatar:
            _render_avatar(profile, size=44)
        with col_name:
            st.markdown(
                f"**👋 Hi, {first}!**" if first else "**Career-Ops**"
            )
            st.caption(full_name or "Career-Ops Dashboard")

        meta_lines: list[str] = []
        if candidate.get("email"):
            meta_lines.append(f"📧 {candidate['email']}")
        if candidate.get("location"):
            meta_lines.append(f"📍 {candidate['location']}")
        if meta_lines:
            st.caption("  \n".join(meta_lines))

        st.divider()


def _render_onboarding() -> None:
    """First-run form shown when `candidate.full_name` is empty.

    Keeps things lightweight: only `Full name` is required. Email, location,
    and a target role are optional — everything can be edited later on the
    Profile page or directly in `config/profile.yml`.
    """
    st.title("👋 Welcome to Career-Ops")
    st.markdown(
        "Let's personalize your dashboard. The system uses these details "
        "to tailor your CV, cover letters, and the greeting you'll see "
        "everywhere. You can change them later on the **Profile** page."
    )

    with st.form("onboarding_form", clear_on_submit=False):
        col1, col2 = st.columns(2)
        full_name = col1.text_input(
            "Full name *",
            placeholder="e.g. Jeevitha Puttaiah",
            help="Used in your CV header, generated file names, and the dashboard greeting.",
        )
        email = col2.text_input(
            "Email", placeholder="you@example.com"
        )
        location = col1.text_input(
            "Location", placeholder="City, Country"
        )
        linkedin = col2.text_input(
            "LinkedIn (optional)",
            placeholder="https://linkedin.com/in/your-handle",
        )

        st.markdown("**Career targeting** _(optional, helps the evaluator)_")
        primary_roles_raw = st.text_input(
            "Primary target roles",
            placeholder="Comma-separated, e.g. Senior AI Engineer, ML Research",
        )

        submitted = st.form_submit_button(
            "Save and continue", type="primary", use_container_width=True
        )

    if not submitted:
        st.info(
            "All fields except **Full name** are optional. You can flesh out "
            "your profile any time."
        )
        return

    if not full_name.strip():
        st.error("Full name is required.")
        return

    candidate_payload: dict[str, Any] = {"full_name": full_name.strip()}
    for key, value in (
        ("email", email.strip()),
        ("location", location.strip()),
        ("linkedin", linkedin.strip()),
    ):
        if value:
            candidate_payload[key] = value

    updates: dict[str, Any] = {"candidate": candidate_payload}
    primary_roles = [
        r.strip() for r in (primary_roles_raw or "").split(",") if r.strip()
    ]
    if primary_roles:
        updates["target_roles"] = {"primary": primary_roles}

    if update_profile(updates):
        first = full_name.strip().split()[0]
        st.success(f"Welcome, {first}! Loading your dashboard…")
        time.sleep(0.6)
        st.rerun()
    else:
        st.error(
            "Could not write `config/profile.yml`. Check filesystem "
            "permissions and try again."
        )


def _derive_status_label(
    canonical_status: str, has_cv: bool, has_cl: bool
) -> tuple[str, str]:
    """Returns `(display_label, hint)` — a richer view of the row's state.

    The canonical status in `applications.md` is preserved untouched. This is
    purely a UI overlay so the user can tell at a glance whether an
    `Evaluated` row is actually staged with documents and ready to submit.
    """
    if canonical_status == "Evaluated":
        if has_cv and has_cl:
            return "🎯 Ready to Apply", "Both CV and Cover Letter are on disk."
        if has_cv or has_cl:
            return "🛠️ Docs Partial", (
                "One document is missing — generate the other before applying."
            )
    return canonical_status, ""


def _cover_letter_pdf_path(candidate_slug: str, company_slug: str, day: date) -> Path:
    filename = f"cover-letter-{candidate_slug}-{company_slug}-{day.isoformat()}.pdf"
    return COVER_LETTERS_DIR / filename


def _backend_picker(
    backends: dict[str, dict[str, Any]],
    key_prefix: str,
    default: str | None = None,
) -> tuple[str | None, str | None]:
    """Renders the backend (and optional model) picker. Returns (backend_id, model)."""
    available_ids = [bid for bid, info in backends.items() if info["available"]]
    if not available_ids:
        st.error(
            "No evaluation backend is available. Install `cursor-agent` (and run "
            "`cursor-agent login`) or set `GEMINI_API_KEY` in `.env`."
        )
        return None, None

    default_id = default if default in available_ids else available_ids[0]
    backend_id = st.radio(
        "Backend",
        options=available_ids,
        index=available_ids.index(default_id),
        format_func=lambda bid: backends[bid]["label"],
        key=f"{key_prefix}_backend",
        horizontal=True,
    )
    st.caption(backends[backend_id]["description"])

    model: str | None = None
    if backend_id == "cursor_agent":
        raw_model = st.text_input(
            "Cursor Agent model (optional)",
            value=DEFAULT_CURSOR_MODEL,
            placeholder="e.g. sonnet-4-thinking, gpt-5 — leave empty to use account default",
            key=f"{key_prefix}_cursor_model",
        )
        model = raw_model.strip() or None

    return backend_id, model


def _render_report_inline(report_rel_path: str, *, allow_expander: bool = True) -> None:
    """Renders a report (metrics + full markdown) at the current container level.

    `allow_expander=False` disables the inner `st.expander`, which is required when
    this function is called from inside another expander (Streamlit forbids nesting).
    """
    p = (REPO_ROOT / report_rel_path).resolve()
    if not p.exists():
        st.warning(f"Report not found at `{report_rel_path}`.")
        return

    meta = load_report_meta(report_rel_path)

    cols = st.columns(3)
    if meta and meta.score is not None:
        cols[0].metric("Score", f"{meta.score:.1f}/5")
    if meta and meta.legitimacy:
        cols[1].metric("Legitimacy", meta.legitimacy)
    if meta and meta.company:
        cols[2].metric("Company", meta.company)

    body = p.read_text(encoding="utf-8", errors="replace")
    if allow_expander:
        with st.expander("Full report", expanded=True):
            st.markdown(body)
    else:
        st.markdown("**Full report**")
        with st.container(border=True):
            st.markdown(body)

    if meta and meta.pdf_path and meta.pdf_path.exists():
        _download_button("Download CV PDF", meta.pdf_path, "application/pdf")


def _run_streaming_agent(
    runner: Iterator[str],
    backend_label: str,
    *,
    starting_label: str = "Starting...",
) -> tuple[bool, str | None, int]:
    """Drives a runner generator with an `st.status` widget. Returns
    `(ok, error_message, elapsed_seconds)`.

    The widget shows a live phase label (heuristically extracted from the
    runner's output via `_detect_phase`), an elapsed-time counter, and a
    collapsible raw log. Final state flips to ✅ / ❌ / ⚠️.
    """
    status_box = st.status(
        f"{starting_label} ({backend_label})",
        expanded=True,
        state="running",
    )
    with status_box:
        phase_label = st.empty()
        elapsed_label = st.empty()
        log_box = st.empty()

    phase_label.markdown("**Phase:** _Initializing..._")
    elapsed_label.caption("Elapsed: 0s")

    start_time = time.monotonic()
    current_phase = "Initializing"
    buf: list[str] = []
    error: str | None = None

    try:
        for chunk in runner:
            buf.append(chunk)

            new_phase = _detect_phase(chunk, current_phase)
            if new_phase != current_phase:
                current_phase = new_phase
                phase_label.markdown(f"**Phase:** {current_phase}")
                status_box.update(label=f"⏳ {backend_label}: {current_phase}")

            elapsed = int(time.monotonic() - start_time)
            elapsed_label.caption(f"Elapsed: {elapsed}s")

            joined = "".join(buf)
            if len(joined) > 60_000:
                joined = "...(truncated)...\n" + joined[-60_000:]
            log_box.code(joined, language="text")
    except FileNotFoundError as e:
        error = f"Backend binary not found: {e}"
    except Exception as e:  # noqa: BLE001 — surface any runner failure to the user
        error = f"Run failed: {e}"

    elapsed_total = int(time.monotonic() - start_time)

    if error is not None:
        status_box.update(
            label=f"❌ {backend_label} failed after {elapsed_total}s",
            state="error",
            expanded=True,
        )
        return False, error, elapsed_total

    status_box.update(
        label=f"✅ {backend_label}: complete in {elapsed_total}s",
        state="complete",
        expanded=False,
    )
    return True, None, elapsed_total


def _run_eval_and_render(
    backend_id: str,
    jd_text: str,
    source_url: str | None,
    model: str | None,
    *,
    allow_expander: bool = True,
) -> Path | None:
    """Streams the chosen runner into the page with live phase + elapsed feedback.

    Returns the absolute path of the newly produced report, or `None` if the run
    failed or did not produce a fresh report.
    """
    runners = {
        "cursor_agent": run_cursor_agent_eval,
        "gemini": run_gemini_eval,
    }
    runner_fn = runners.get(backend_id)
    if runner_fn is None:
        st.error(f"Unknown backend: {backend_id}")
        return None

    pre_existing = newest_report()
    pre_mtime = pre_existing.stat().st_mtime if pre_existing else 0.0

    backend_label = {
        "cursor_agent": "Cursor Agent",
        "gemini": "Gemini",
    }.get(backend_id, backend_id)

    runner_iter = runner_fn(jd_text, source_url, model=model)
    ok, error, _elapsed = _run_streaming_agent(
        runner_iter, backend_label, starting_label="Evaluating"
    )

    if not ok:
        st.error(error or "Evaluation failed.")
        return None

    st.cache_data.clear()

    latest = newest_report()
    if latest is None or latest.stat().st_mtime <= pre_mtime:
        st.warning(
            "Evaluation finished, but no new report was detected in `reports/`. "
            "Check the live output above for errors."
        )
        return None

    rel = latest.relative_to(REPO_ROOT)
    st.success(f"New report: `{rel}`")
    _render_report_inline(str(rel), allow_expander=allow_expander)
    return latest


def _build_cv_prompt(
    company: str,
    role: str,
    report_rel_path: str | None,
) -> str:
    lines = [
        f"Generate a tailored CV PDF for `{company}` — `{role}` using the career-ops `pdf` mode.",
        "",
        "Required steps (do them all, in order):",
        "1. Read `modes/pdf.md` and follow it exactly.",
        "2. Read `cv.md`, `modes/_profile.md`, `config/profile.yml`, and "
        "`templates/cv-template.html` for source content + template.",
    ]
    if report_rel_path:
        lines.append(
            f"3. Read the evaluation report at `{report_rel_path}` to extract the JD, "
            "keywords, and detected archetype — use them to tailor the Summary, Core "
            "Competencies, and bullet ordering."
        )
    else:
        lines.append(
            "3. (No report on file for this row — tailor based on the role title and "
            "company alone, plus general best practices.)"
        )
    lines += [
        "4. Render the populated template HTML to `/tmp/cv-{candidate}-{company-slug}.html`.",
        "5. Run `node generate-pdf.mjs /tmp/cv-{candidate}-{company-slug}.html "
        "output/cv-{candidate}-{company-slug}-{YYYY-MM-DD}.pdf --format={letter|a4}`.",
        "6. Print a final single-line summary: `DONE: output/cv-{candidate}-{company-slug}-{date}.pdf`.",
        "",
        "Do NOT modify `cv.md`. Do NOT submit any application. Only invent content "
        "that is grounded in `cv.md` or `article-digest.md` (per `modes/pdf.md`).",
    ]
    return "\n".join(lines)


def _build_cover_letter_prompt(
    company: str,
    role: str,
    report_rel_path: str | None,
) -> str:
    lines = [
        f"Generate a tailored cover-letter PDF for `{company}` — `{role}`.",
        "",
        "Required steps (do them all, in order):",
        "1. Read `cv.md`, `modes/_profile.md`, `config/profile.yml`, and "
        "`templates/cv-template.html` for source content, contact info, and base styling.",
    ]
    if report_rel_path:
        lines.append(
            f"2. Read the evaluation report at `{report_rel_path}` to understand the "
            "JD, the archetype, comp / mission context, and the strongest proof "
            "points to lean on."
        )
    else:
        lines.append(
            "2. (No report on file — write a competent generic cover letter for the "
            "role + company, grounded only in `cv.md`.)"
        )
    lines += [
        "3. Draft the letter — under 350 words, 3 short paragraphs:",
        "   - Para 1: hook + why this role / company specifically (reference something",
        "     concrete: a product, a mission line, a recent move).",
        "   - Para 2: 2-3 proof points from `cv.md` mapped to the JD's needs",
        "     (numbers and outcomes, no generic platitudes).",
        "   - Para 3: cultural / mission fit + a clear call to action.",
        "4. Render the letter to HTML using the same fonts, margins, and header style",
        "   as `templates/cv-template.html` (single column, EB Garamond serif, "
        "   `letter` for US/Canada, `a4` elsewhere — derive paper size from the "
        "   company location in `config/profile.yml` or the report).",
        "5. Save the HTML to `/tmp/cover-letter-{candidate}-{company-slug}.html`.",
        "6. Ensure `output/cover-letters/` exists, then run "
        "`node generate-pdf.mjs /tmp/cover-letter-{candidate}-{company-slug}.html "
        "output/cover-letters/cover-letter-{candidate}-{company-slug}-{YYYY-MM-DD}.pdf "
        "--format={letter|a4}`.",
        "7. Print a final single-line summary: "
        "`DONE: output/cover-letters/cover-letter-{candidate}-{company-slug}-{date}.pdf`.",
        "",
        "Hard rules: NEVER invent achievements; only reuse facts present in `cv.md` "
        "or `article-digest.md`. NO emojis. NO clichés like \"I am writing to apply\". "
        "Address the company by name. Do NOT submit any application.",
    ]
    return "\n".join(lines)


def _run_doc_gen_and_render(
    *,
    kind: str,  # "cv" or "cl"
    company: str,
    role: str,
    candidate_slug: str,
    company_slug: str,
    report_rel_path: str | None,
    model: str | None,
) -> Path | None:
    """Runs cursor-agent to generate a tailored CV or cover letter, with live status."""
    pre_existing = find_existing_doc(candidate_slug, company_slug, kind)
    pre_mtime = pre_existing.stat().st_mtime if pre_existing else 0.0

    if kind == "cv":
        prompt = _build_cv_prompt(company, role, report_rel_path)
        label = "Cursor Agent (CV)"
        not_found_warning = (
            "Generation finished, but no new tailored CV was detected in `output/`. "
            "Check the live output above for errors."
        )
    else:
        prompt = _build_cover_letter_prompt(company, role, report_rel_path)
        label = "Cursor Agent (Cover Letter)"
        not_found_warning = (
            "Generation finished, but no new cover letter was detected in "
            "`output/cover-letters/`. Check the live output above for errors."
        )

    runner_iter = run_cursor_agent_task(prompt, model=model)
    ok, error, _elapsed = _run_streaming_agent(
        runner_iter, label, starting_label=f"Generating {kind.upper()}"
    )

    if not ok:
        st.error(error or "Generation failed.")
        return None

    latest = find_existing_doc(candidate_slug, company_slug, kind)
    if latest is None or latest.stat().st_mtime <= pre_mtime:
        st.warning(not_found_warning)
        return None

    rel = latest.relative_to(REPO_ROOT)
    st.success(f"Generated: `{rel}`")
    _download_button(
        f"Download {('CV' if kind == 'cv' else 'Cover Letter')} PDF",
        latest,
        "application/pdf",
    )
    return latest


def main() -> None:
    profile = load_profile()
    full_name = _candidate_full_name(profile)

    page_title = (
        f"{full_name} — Career-Ops Dashboard"
        if full_name
        else "Career-Ops Dashboard"
    )
    st.set_page_config(page_title=page_title, page_icon="🎯", layout="wide")

    if not full_name:
        # First-run / unconfigured: focus the user on onboarding before
        # exposing any of the navigation, so they don't try to evaluate
        # jobs without a CV identity.
        st.sidebar.title("Career-Ops")
        st.sidebar.caption("Setup required — finish onboarding to continue.")
        _render_onboarding()
        return

    candidate = profile.get("candidate") or {}
    first = _first_name(profile)

    _render_personalized_sidebar(profile)
    page = st.sidebar.radio(
        "Navigation",
        [
            "Status Dashboard",
            "Chat",
            "Pipeline",
            "Interactive Tracker",
            "Scan Results",
            "CV & Documents",
            "Profile",
        ],
    )

    if page == "Status Dashboard":
        greeting = f"Welcome back, {first}" if first else "Status Dashboard"
        st.title(greeting)
        st.caption("Here's where your job search stands today.")
        df = load_applications_table()
        if df.empty:
            st.warning("`data/applications.md` not found or empty.")
            return

        status_col = "Status" if "Status" in df.columns else None
        score_col = "ScoreValue" if "ScoreValue" in df.columns else None

        total = len(df)
        applied = int((df[status_col] == "Applied").sum()) if status_col else 0
        interviewed = int((df[status_col] == "Interview").sum()) if status_col else 0
        offers = int((df[status_col] == "Offer").sum()) if status_col else 0
        avg_score = (
            float(df[score_col].dropna().mean())
            if score_col and df[score_col].notna().any()
            else None
        )

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Total", total)
        c2.metric("Applied", applied)
        c3.metric("Interview", interviewed)
        c4.metric("Offer", offers)
        c5.metric("Avg score", f"{avg_score:.2f}/5" if avg_score is not None else "—")

        st.subheader("Funnel")
        funnel_data = pd.DataFrame(
            {
                "Stage": ["Total", "Applied", "Interview", "Offer"],
                "Count": [total, applied, interviewed, offers],
            }
        )
        st.bar_chart(funnel_data.set_index("Stage"))

        if status_col:
            st.subheader("Status Breakdown")
            st.bar_chart(df[status_col].value_counts())

    elif page == "Chat":
        st.title("Career-Ops Assistant")
        st.caption(
            f"Ask anything about your job search. Try _'show me the latest "
            f"jobs at Stanford'_, _'AI roles in California'_, _'why was the "
            f"uchicago role scored 4.5?'_."
        )

        backends = detect_backends()
        if not backends["cursor_agent"]["available"]:
            st.warning(
                "Cursor Agent is required for the chat assistant. Install "
                "`cursor-agent` and run `cursor-agent login` to enable this page."
            )
            return

        if (
            "chat_history" not in st.session_state
            or "recent_searches" not in st.session_state
        ):
            persisted = _load_chat_state()
            st.session_state.setdefault(
                "chat_history", persisted["chat_history"]
            )
            st.session_state.setdefault(
                "recent_searches", persisted["recent_searches"]
            )

        # ── Sidebar controls ─────────────────────────────────────────
        with st.sidebar:
            chat_model_raw = st.text_input(
                "Chat model (optional)",
                value=DEFAULT_CURSOR_MODEL,
                placeholder=(
                    "e.g. sonnet-4-thinking, gpt-5 — leave empty for account default"
                ),
                key="chat_model_input",
            )
            chat_model = chat_model_raw.strip() or None
            if st.button(
                "🧹 Clear chat", key="chat_clear", use_container_width=True
            ):
                st.session_state["chat_history"] = []
                st.session_state.pop("chat_pending_eval", None)
                st.session_state.pop("recent_show_idx", None)
                _save_chat_state()
                st.rerun()
            if st.session_state["recent_searches"]:
                if st.button(
                    "🗑️ Clear recent searches",
                    key="chat_clear_recent",
                    use_container_width=True,
                ):
                    st.session_state["recent_searches"] = []
                    st.session_state.pop("recent_show_idx", None)
                    _save_chat_state()
                    st.rerun()

        # ── Recent searches (last 4) ─────────────────────────────────
        recent = st.session_state["recent_searches"]
        if recent:
            with st.expander(
                f"📚 Recent searches ({len(recent)})", expanded=False
            ):
                for r_idx, search in enumerate(recent):
                    cols = st.columns([5, 1, 1])
                    with cols[0]:
                        st.markdown(f"**{search['prompt']}**")
                        st.caption(
                            f"{search['count']} job{'s' if search['count'] != 1 else ''}"
                            f" · {search['timestamp']}"
                        )
                    with cols[1]:
                        if st.button(
                            "Show",
                            key=f"recent_show_btn_{r_idx}",
                            use_container_width=True,
                            help="Re-display these jobs with Save / Evaluate buttons.",
                        ):
                            st.session_state["recent_show_idx"] = r_idx
                            st.rerun()
                    with cols[2]:
                        if st.button(
                            "🔁",
                            key=f"recent_replay_btn_{r_idx}",
                            use_container_width=True,
                            help="Re-run this exact search via the agent (fresh results).",
                        ):
                            st.session_state["chat_replay_prompt"] = search[
                                "prompt"
                            ]
                            st.session_state.pop("recent_show_idx", None)
                            st.rerun()

                show_idx = st.session_state.get("recent_show_idx")
                if (
                    show_idx is not None
                    and isinstance(show_idx, int)
                    and 0 <= show_idx < len(recent)
                ):
                    s = recent[show_idx]
                    st.divider()
                    st.markdown(
                        f"**Replaying:** _{s['prompt']}_ · "
                        f"{s['count']} jobs · {s['timestamp']}"
                    )
                    _render_recent_jobs_table(s["jobs"])
                    _render_chat_job_actions(
                        s["jobs"], key_prefix=f"recent_{show_idx}"
                    )

        # ── Render conversation history (extracts jobs blocks) ───────
        for m_idx, msg in enumerate(st.session_state["chat_history"]):
            with st.chat_message(msg["role"]):
                content = msg["content"]
                if msg["role"] == "assistant":
                    cleaned, jobs = _extract_jobs_block(content)
                    st.markdown(cleaned or "_(empty response)_")
                    if jobs:
                        _render_chat_job_actions(
                            jobs, key_prefix=f"hist_{m_idx}"
                        )
                else:
                    st.markdown(content)

        if not st.session_state["chat_history"]:
            with st.chat_message("assistant"):
                st.markdown(
                    f"Hi {first}! I can search **LinkedIn jobs live**, then you "
                    f"can act on them with inline 💾 Save / ⚡ Evaluate buttons. "
                    f"Try:\n\n"
                    f"**Find on LinkedIn:**\n"
                    f"- _find biotech jobs at Stanford University_\n"
                    f"- _show me research associate roles in California posted this week_\n"
                    f"- _ML engineer remote roles posted in the last 24h_\n\n"
                    f"**Then click the buttons under each result:**\n"
                    f"- 💾 saves the job to your scan list (`data/scan-history.tsv`).\n"
                    f"- ⚡ runs the full A–G evaluation pipeline inline — report, "
                    f"tracker, and status update happen automatically.\n\n"
                    f"**Your data (local):**\n"
                    f"- _summarize the report for the uchicago role_\n"
                    f"- _which evaluated jobs scored above 4.0?_\n"
                    f"- _what's in the pipeline inbox right now?_\n\n"
                    f"_LinkedIn results come from the public guest endpoint — for personal job-search use only._"
                )

        # Replay path: if user clicked 🔁 on a recent search, treat the
        # saved prompt as the next user message. Pop BEFORE the chat_input
        # widget so a fresh typed message still wins on the next run.
        replay_prompt = st.session_state.pop("chat_replay_prompt", None)
        typed_prompt = st.chat_input("Ask about your job search...")
        user_msg = typed_prompt or replay_prompt

        if user_msg:
            st.session_state["chat_history"].append(
                {"role": "user", "content": user_msg}
            )
            _save_chat_state()
            with st.chat_message("user"):
                st.markdown(user_msg)

            history_for_prompt = st.session_state["chat_history"][:-1]
            prompt = _build_chat_prompt(user_msg, history_for_prompt, first)

            with st.chat_message("assistant"):
                placeholder = st.empty()
                buf: list[str] = []
                try:
                    for chunk in run_cursor_agent_chat(prompt, model=chat_model):
                        buf.append(chunk)
                        joined = "".join(buf)
                        joined = re.sub(
                            r"\n*\[exit code:[^\]]*\]\s*$", "", joined
                        )
                        placeholder.markdown(joined or "_thinking..._")
                except FileNotFoundError as e:
                    placeholder.error(f"`cursor-agent` not found: {e}")
                    st.session_state["chat_history"].pop()
                    _save_chat_state()
                    return
                except Exception as e:  # noqa: BLE001
                    placeholder.error(f"Chat failed: {e}")
                    st.session_state["chat_history"].pop()
                    _save_chat_state()
                    return

            response = re.sub(
                r"\n*\[exit code:[^\]]*\]\s*$", "", "".join(buf)
            ).strip()
            if not response:
                response = "_(empty response)_"
            st.session_state["chat_history"].append(
                {"role": "assistant", "content": response}
            )
            _save_chat_state()

            # Detect a jobs-json sidecar block and (if present) record the
            # search and rerun so the unified history loop renders the
            # message *with* Save / Evaluate buttons next to the table.
            _, parsed_jobs = _extract_jobs_block(response)
            if parsed_jobs:
                _track_recent_search(user_msg, parsed_jobs)
                st.cache_data.clear()
                st.rerun()

            # Legacy path: agent ran add-to-scan.mjs directly (bulk save).
            # Clear cache so Scan Results sees fresh data on next visit.
            if "add-to-scan" in response or '"added"' in response:
                st.cache_data.clear()
                st.toast(
                    "Scan history updated — refresh Scan Results to see new rows.",
                    icon="✅",
                )

        # ── Inline evaluation panel (triggered by ⚡ button) ──────────
        pending = st.session_state.get("chat_pending_eval")
        if pending:
            st.divider()
            st.subheader(
                f"⚡ Evaluating: {pending['company']} — {pending['title']}"
            )
            st.caption(pending["url"])

            dismiss_col, _ = st.columns([1, 5])
            with dismiss_col:
                if st.button(
                    "✕ Cancel", key="chat_eval_dismiss", use_container_width=True
                ):
                    st.session_state.pop("chat_pending_eval", None)
                    st.rerun()

            with st.spinner(f"Fetching {pending['company']}..."):
                jd_text = fetch_job_description(pending["url"])

            if jd_text.startswith("Error"):
                st.error(jd_text)
            else:
                with st.expander("Fetched JD preview", expanded=False):
                    st.text_area(
                        "JD",
                        jd_text,
                        height=200,
                        label_visibility="collapsed",
                    )
                # Always use cursor-agent for chat-triggered evals — the
                # chat page already requires it, and gemini-eval doesn't do
                # the full pipeline (Playwright verify, tracker merge, etc.)
                report_path = _run_eval_and_render(
                    "cursor_agent", jd_text, pending["url"], chat_model
                )
                if report_path is not None:
                    if update_scan_status(pending["url"], "Evaluated"):
                        st.toast(
                            f"Marked {pending['company']} as Evaluated in scan history.",
                            icon="✅",
                        )
                    if st.button(
                        "Done — back to chat", key="chat_eval_done"
                    ):
                        st.session_state.pop("chat_pending_eval", None)
                        st.rerun()

    elif page == "Pipeline":
        st.title("Pipeline")
        st.caption(
            "Find new jobs (Scan portals) or evaluate a specific role "
            "(Paste JD or URL). Cursor Agent does the heavy lifting and "
            "writes the report + tracker TSV automatically."
        )

        tab_paste, tab_scan = st.tabs(
            ["📝 Paste JD or URL", "🔍 Scan portals"]
        )

        # ----- Tab 1: Paste / URL evaluation --------------------------------
        with tab_paste:
            backends = detect_backends()
            with st.form("evaluate_job_form"):
                backend_id, model = _backend_picker(
                    backends, key_prefix="eval_page", default="cursor_agent"
                )
                url = st.text_input(
                    "Job URL (optional)", placeholder="https://..."
                )
                jd_text = st.text_area(
                    "Or paste the full job description",
                    height=300,
                    placeholder=(
                        "Paste the JD here. If you provided a URL above, the "
                        "dashboard will fetch the page when you submit (and "
                        "you can leave this empty)."
                    ),
                )
                submitted = st.form_submit_button(
                    "Run Evaluation", type="primary", use_container_width=True
                )

            if submitted:
                if backend_id is None:
                    return
                cleaned_jd = (jd_text or "").strip()
                cleaned_url = (url or "").strip() or None
                if not cleaned_jd and not cleaned_url:
                    st.error("Provide a Job URL, paste the JD text, or both.")
                    return
                if not cleaned_jd and cleaned_url:
                    with st.spinner(f"Fetching {cleaned_url}..."):
                        cleaned_jd = fetch_job_description(cleaned_url)
                    if cleaned_jd.startswith("Error"):
                        st.error(cleaned_jd)
                        return
                    with st.expander("Fetched JD preview", expanded=False):
                        st.text_area(
                            "JD",
                            cleaned_jd,
                            height=200,
                            label_visibility="collapsed",
                        )

                report_path = _run_eval_and_render(
                    backend_id, cleaned_jd, cleaned_url, model
                )
                if report_path is not None and cleaned_url:
                    if update_scan_status(cleaned_url, "Evaluated"):
                        st.toast(
                            "Marked URL as Evaluated in scan history.",
                            icon="✅",
                        )
                        st.cache_data.clear()

        # ----- Tab 2: Scan portals ------------------------------------------
        with tab_scan:
            st.markdown(
                "Run the zero-token portal scanner — hits Greenhouse, Ashby, "
                "and Lever APIs directly using `portals.yml` as config and "
                "appends new offers to `data/scan-history.tsv` + "
                "`data/pipeline.md`."
            )

            portals_path = REPO_ROOT / "portals.yml"
            if not portals_path.exists():
                st.warning(
                    "`portals.yml` not found. Copy "
                    "`templates/portals.example.yml` to the repo root and "
                    "configure your tracked companies first."
                )
            else:
                with st.form("scan_form"):
                    col_a, col_b = st.columns(2)
                    company_filter = col_a.text_input(
                        "Limit to one company (optional)",
                        placeholder="e.g. Stanford, Cohere",
                        help=(
                            "Maps to `--company NAME` — case-insensitive "
                            "substring match against `portals.yml` entries."
                        ),
                    )
                    dry_run = col_b.checkbox(
                        "Dry run (preview only, don't write files)",
                        value=False,
                    )
                    scan_submitted = st.form_submit_button(
                        "🔍 Run scan now",
                        type="primary",
                        use_container_width=True,
                    )

                if scan_submitted:
                    cmd = ["node", str(REPO_ROOT / "scan.mjs")]
                    if company_filter.strip():
                        cmd += ["--company", company_filter.strip()]
                    if dry_run:
                        cmd.append("--dry-run")

                    pre_history_size = (
                        SCAN_HISTORY_PATH.stat().st_size
                        if SCAN_HISTORY_PATH.exists()
                        else 0
                    )

                    runner_iter = _stream_subprocess(cmd)
                    ok, error, elapsed = _run_streaming_agent(
                        runner_iter,
                        backend_label="scan.mjs",
                        starting_label="Scanning portals",
                    )

                    if not ok:
                        st.error(error or "Scan failed.")
                    else:
                        # Diff scan-history.tsv to surface a new-jobs count.
                        post_size = (
                            SCAN_HISTORY_PATH.stat().st_size
                            if SCAN_HISTORY_PATH.exists()
                            else 0
                        )
                        if post_size > pre_history_size and not dry_run:
                            st.cache_data.clear()
                            st.success(
                                f"Scan complete in {elapsed}s. New offers were "
                                "added to `data/scan-history.tsv`. Open the "
                                "**Scan Results** page to evaluate them."
                            )
                        elif dry_run:
                            st.info(
                                f"Dry run finished in {elapsed}s — no files "
                                "written. Inspect the live output above."
                            )
                        else:
                            st.info(
                                f"Scan complete in {elapsed}s. No new offers "
                                "matched the filters."
                            )

    elif page == "Interactive Tracker":
        st.title("Interactive Tracker")
        df = load_applications_table()
        if df.empty:
            st.info("No applications found. Run a scan and evaluate a job to get started!")
            return

        candidate_slug = _candidate_slug(profile)

        # Derive a read-only "Docs" column from the filesystem so the user can
        # see at a glance whether a tailored CV / cover letter already exists.
        def _doc_summary(row: pd.Series) -> str:
            company_slug = _slugify(str(row.get("Company", "")))
            cv = find_existing_doc(candidate_slug, company_slug, "cv")
            cl = find_existing_doc(candidate_slug, company_slug, "cl")
            parts: list[str] = []
            parts.append("📄 CV ✅" if cv else "📄 CV ❌")
            parts.append("📝 CL ✅" if cl else "📝 CL ❌")
            return "  ".join(parts)

        df = df.copy()
        df["Docs"] = df.apply(_doc_summary, axis=1)

        st.info(
            "💡 Edit the table below and click 'Save Changes' to update "
            "`data/applications.md`. The **Docs** and **Apply** columns "
            "are read-only — Apply links come from each row's evaluation "
            "report (or scan history as a fallback)."
        )

        # Reorder so Apply sits right next to Role, where the eye is. The
        # original column order from applications.md is preserved otherwise.
        if "URL" in df.columns and "Role" in df.columns:
            cols = list(df.columns)
            cols.remove("URL")
            insert_at = cols.index("Role") + 1
            cols = cols[:insert_at] + ["URL"] + cols[insert_at:]
            df = df[cols]

        # Mark all derived/helper columns as disabled in the editor.
        non_editable = {"Docs", "ScoreValue", "ReportPath", "ReportNum", "URL"}
        column_config: dict[str, Any] = {
            col: st.column_config.Column(disabled=True)
            for col in non_editable
            if col in df.columns and col != "URL"
        }
        if "URL" in df.columns:
            # `LinkColumn` renders the URL as a clickable button — `display_text`
            # uses a regex to extract a short label so we don't bloat the row
            # with full URLs. Falls back to "🔗 Apply" for non-matching shapes.
            column_config["URL"] = st.column_config.LinkColumn(
                "Apply",
                help="Click to open the job posting in a new tab.",
                display_text="🔗 Apply",
                disabled=True,
            )

        edited_df = st.data_editor(
            df,
            use_container_width=True,
            num_rows="dynamic",
            column_config=column_config,
            key="apps_editor",
        )

        if st.button("Save Changes"):
            save_applications_table(edited_df)
            st.success("Changes saved to `data/applications.md`!")
            st.cache_data.clear()

        # ---- Generate tailored documents -------------------------------------
        st.divider()
        st.subheader("Generate tailored documents")
        st.caption(
            "Pick a row and generate a **tailored CV** or **cover letter** for it. "
            "Cursor Agent will read the evaluation report (if any) and produce a PDF "
            "in `output/` or `output/cover-letters/`."
        )

        backends = detect_backends()
        if not backends["cursor_agent"]["available"]:
            st.warning(
                "Cursor Agent is required for document generation (the Gemini "
                "backend can't write files or run shell). Install `cursor-agent` "
                "and run `cursor-agent login` to enable this section."
            )
        else:
            status_options = (
                edited_df["Status"].dropna().unique().tolist()
                if "Status" in edited_df.columns
                else []
            )
            default_filter = (
                ["Evaluated"] if "Evaluated" in status_options else status_options[:1]
            )
            picked_statuses = st.multiselect(
                "Status filter",
                options=status_options,
                default=default_filter,
                help="Defaults to `Evaluated` — rows where you've scored the role "
                "but haven't tailored documents or applied yet.",
                key="docgen_status_filter",
            )
            cursor_model = st.text_input(
                "Cursor Agent model (optional)",
                value=DEFAULT_CURSOR_MODEL,
                placeholder=(
                    "e.g. sonnet-4-thinking, gpt-5 — leave empty for account default"
                ),
                key="docgen_cursor_model",
            )
            model = cursor_model.strip() or None

            filtered = (
                edited_df[edited_df["Status"].isin(picked_statuses)]
                if "Status" in edited_df.columns and picked_statuses
                else edited_df.iloc[0:0]
            )

            if filtered.empty:
                st.info("No rows match the selected statuses.")
            else:
                for idx, row in filtered.iterrows():
                    company = str(row.get("Company", "")).strip()
                    role = str(row.get("Role", "")).strip()
                    if not company or not role:
                        continue
                    company_slug = _slugify(company)
                    app_num = str(row.get("#", "")).strip()
                    current_status = str(row.get("Status", "")).strip() or "—"
                    report_rel = (
                        str(row.get("ReportPath", "")).strip() or None
                        if "ReportPath" in row
                        else None
                    )

                    cv_path = find_existing_doc(candidate_slug, company_slug, "cv")
                    cl_path = find_existing_doc(candidate_slug, company_slug, "cl")

                    target_payload: dict[str, Any] = {
                        "company": company,
                        "role": role,
                        "company_slug": company_slug,
                        "report_rel": report_rel,
                        "app_num": app_num,
                    }

                    has_cv = cv_path is not None
                    has_cl = cl_path is not None
                    display_status, status_hint = _derive_status_label(
                        current_status, has_cv, has_cl
                    )

                    apply_url = str(row.get("URL", "")).strip()

                    with st.container(border=True):
                        head_cols = st.columns([4, 1])
                        title_html = (
                            f"**{company}** — {role}  &nbsp; "
                            f"<span style='font-size:0.9em;color:#888'>"
                            f"{display_status}</span>"
                        )
                        # Inline Apply link in the card header — the data
                        # editor already renders one, but the cards are where
                        # users actually plan their next action, so it earns
                        # its place here too.
                        if apply_url:
                            title_html += (
                                f"  &nbsp; <a href='{apply_url}' target='_blank' "
                                "rel='noopener noreferrer' "
                                "style='font-size:0.85em;text-decoration:none;"
                                "background:#313244;color:#cdd6f4;"
                                "padding:2px 8px;border-radius:6px;'>"
                                "🔗 Apply</a>"
                            )
                        head_cols[0].markdown(title_html, unsafe_allow_html=True)
                        score = str(row.get("Score", "")).strip() or "—"
                        date_val = row.get("Date", "")
                        caption = (
                            f"Canonical: `{current_status}`  •  Score: {score}  "
                            f"•  Date: {date_val}"
                            + (f"  •  Report: `{report_rel}`" if report_rel else "")
                        )
                        if status_hint:
                            caption += f"  •  _{status_hint}_"
                        head_cols[0].caption(caption)
                        head_cols[1].markdown(_doc_summary(row))

                        # ----- Document actions ------------------------------
                        # When both docs already exist, show only Download +
                        # a small Regenerate option to avoid suggesting work
                        # that's already done.
                        action_cols = st.columns(2)
                        with action_cols[0]:
                            if has_cv:
                                _download_button(
                                    "📄 Download CV", cv_path, "application/pdf"
                                )
                            else:
                                if st.button(
                                    "📄 Generate CV",
                                    key=f"gen_cv_{idx}",
                                    type="primary",
                                    use_container_width=True,
                                ):
                                    st.session_state["docgen_target"] = {
                                        **target_payload,
                                        "kind": "cv",
                                    }
                        with action_cols[1]:
                            if has_cl:
                                _download_button(
                                    "📝 Download Cover Letter",
                                    cl_path,
                                    "application/pdf",
                                )
                            else:
                                if st.button(
                                    "📝 Generate Cover Letter",
                                    key=f"gen_cl_{idx}",
                                    type="primary",
                                    use_container_width=True,
                                ):
                                    st.session_state["docgen_target"] = {
                                        **target_payload,
                                        "kind": "cl",
                                    }

                        # "Generate Both" — only when at least one is missing.
                        if not (has_cv and has_cl):
                            if st.button(
                                "📦 Generate Both",
                                key=f"gen_both_{idx}",
                                use_container_width=True,
                                help="Run CV generation, then Cover Letter, in sequence.",
                            ):
                                st.session_state["docgen_target"] = {
                                    **target_payload,
                                    "kind": "both",
                                }
                        else:
                            # Both docs ready — offer regen but tucked away.
                            with st.expander("Regenerate documents", expanded=False):
                                regen_cols = st.columns(2)
                                if regen_cols[0].button(
                                    "Regenerate CV",
                                    key=f"regen_cv_{idx}",
                                    use_container_width=True,
                                ):
                                    st.session_state["docgen_target"] = {
                                        **target_payload,
                                        "kind": "cv",
                                    }
                                if regen_cols[1].button(
                                    "Regenerate Cover Letter",
                                    key=f"regen_cl_{idx}",
                                    use_container_width=True,
                                ):
                                    st.session_state["docgen_target"] = {
                                        **target_payload,
                                        "kind": "cl",
                                    }

                        # ----- Status quick-actions --------------------------
                        st.markdown("**Update status**")
                        if not app_num:
                            st.caption(
                                "_No `#` on this row — save the table first to "
                                "enable status updates._"
                            )
                        else:
                            quick_cols = st.columns(3)
                            if quick_cols[0].button(
                                "✅ Applied",
                                key=f"st_applied_{idx}",
                                type="primary",
                                use_container_width=True,
                                disabled=current_status == "Applied",
                            ):
                                st.session_state["status_update"] = {
                                    "num": app_num,
                                    "status": "Applied",
                                    "company": company,
                                }
                            if quick_cols[1].button(
                                "⏭️ SKIP",
                                key=f"st_skip_{idx}",
                                use_container_width=True,
                                disabled=current_status == "SKIP",
                            ):
                                st.session_state["status_update"] = {
                                    "num": app_num,
                                    "status": "SKIP",
                                    "company": company,
                                }
                            if quick_cols[2].button(
                                "🗑️ Discarded",
                                key=f"st_discard_{idx}",
                                use_container_width=True,
                                disabled=current_status == "Discarded",
                            ):
                                st.session_state["status_update"] = {
                                    "num": app_num,
                                    "status": "Discarded",
                                    "company": company,
                                }

                            # Dropdown for the rest of the canonical states
                            other_states = [
                                s
                                for s in CANONICAL_STATES
                                if s not in {"Applied", "SKIP", "Discarded"}
                            ]
                            try:
                                default_idx = other_states.index(current_status)
                            except ValueError:
                                default_idx = 0
                            picked = st.selectbox(
                                "Other status",
                                options=other_states,
                                index=default_idx,
                                key=f"st_other_select_{idx}",
                                label_visibility="collapsed",
                            )
                            if st.button(
                                f"Set `{picked}`",
                                key=f"st_other_apply_{idx}",
                                disabled=picked == current_status,
                                use_container_width=True,
                            ):
                                st.session_state["status_update"] = {
                                    "num": app_num,
                                    "status": picked,
                                    "company": company,
                                }

                # Process any pending status update before doc-gen so the
                # `Status` filter re-applies on the rerun.
                pending_status = st.session_state.pop("status_update", None)
                if pending_status:
                    ok = update_application_status(
                        pending_status["num"], pending_status["status"]
                    )
                    if ok:
                        st.toast(
                            f"Marked #{pending_status['num']} "
                            f"({pending_status['company']}) as "
                            f"`{pending_status['status']}`.",
                            icon="✅",
                        )
                        st.rerun()
                    else:
                        st.error(
                            f"Could not update #{pending_status['num']} — row not "
                            "found or applications.md missing."
                        )

                target = st.session_state.get("docgen_target")
                if target:
                    st.divider()
                    if target["kind"] == "both":
                        st.subheader(
                            f"Generating CV + Cover Letter: "
                            f"{target['company']} — {target['role']}"
                        )
                        st.caption("Step 1 of 2 — Tailored CV")
                        cv_result = _run_doc_gen_and_render(
                            kind="cv",
                            company=target["company"],
                            role=target["role"],
                            candidate_slug=candidate_slug,
                            company_slug=target["company_slug"],
                            report_rel_path=target["report_rel"],
                            model=model,
                        )
                        st.caption("Step 2 of 2 — Cover Letter")
                        cl_result = _run_doc_gen_and_render(
                            kind="cl",
                            company=target["company"],
                            role=target["role"],
                            candidate_slug=candidate_slug,
                            company_slug=target["company_slug"],
                            report_rel_path=target["report_rel"],
                            model=model,
                        )
                        if cv_result and cl_result:
                            st.success(
                                "Both documents generated. You can mark this "
                                "application as **Applied** above when you're ready."
                            )
                        st.cache_data.clear()
                    else:
                        kind_label = (
                            "CV" if target["kind"] == "cv" else "Cover Letter"
                        )
                        st.subheader(
                            f"Generating {kind_label}: "
                            f"{target['company']} — {target['role']}"
                        )
                        produced = _run_doc_gen_and_render(
                            kind=target["kind"],
                            company=target["company"],
                            role=target["role"],
                            candidate_slug=candidate_slug,
                            company_slug=target["company_slug"],
                            report_rel_path=target["report_rel"],
                            model=model,
                        )
                        if produced is not None:
                            st.cache_data.clear()
                    # Always clear so reruns don't re-fire the generation.
                    st.session_state.pop("docgen_target", None)

    elif page == "Scan Results":
        st.title("Scan Results")
        scan_df = load_scan_history()
        if scan_df.empty:
            st.info("Scan history is empty. Run `/career-ops scan` first.")
            return

        backends = detect_backends()
        with st.container(border=True):
            st.markdown("**Evaluation backend** (used by the per-row buttons below)")
            backend_id, model = _backend_picker(
                backends, key_prefix="scan_page", default="cursor_agent"
            )

        # Show only 'added' or interesting ones by default
        status_filter = st.sidebar.multiselect(
            "Filter by scan status",
            options=scan_df["status"].unique().tolist(),
            default=["added"],
        )
        filtered_scan = scan_df[scan_df["status"].isin(status_filter)].sort_values(
            "first_seen", ascending=False
        )

        st.write(f"Showing {len(filtered_scan)} results.")

        # Per-row buttons only stash the click in session_state. The actual
        # evaluation render happens *after* the loop, outside any expander, to
        # avoid Streamlit's "expanders may not be nested" error.
        for idx, row in filtered_scan.iterrows():
            with st.expander(f"{row['company']} — {row['title']} ({row['first_seen']})"):
                st.write(f"**Portal:** {row['portal']}")
                st.write(f"**URL:** {row['url']}")
                st.write(f"**Status:** {row['status']}")

                if st.button("Evaluate Job", key=f"eval_{idx}"):
                    st.session_state["scan_pending_eval"] = {
                        "url": row["url"],
                        "company": row["company"],
                        "title": row["title"],
                    }
                    # New evaluation invalidates any cached previous result.
                    st.session_state.pop("scan_eval_result", None)

        pending = st.session_state.get("scan_pending_eval")
        if pending and backend_id is not None:
            st.divider()
            st.subheader(f"Evaluating: {pending['company']} — {pending['title']}")
            st.caption(pending["url"])

            with st.spinner(f"Fetching {pending['company']}..."):
                jd_text = fetch_job_description(pending["url"])

            if jd_text.startswith("Error"):
                st.error(jd_text)
                st.session_state.pop("scan_pending_eval", None)
            else:
                with st.expander("Fetched JD preview", expanded=False):
                    st.text_area(
                        "JD", jd_text, height=200, label_visibility="collapsed"
                    )
                report_path = _run_eval_and_render(
                    backend_id, jd_text, pending["url"], model
                )
                if report_path is not None:
                    st.session_state["scan_eval_result"] = str(
                        report_path.relative_to(REPO_ROOT)
                    )
                    # Promote the scan-history row from `added` → `Evaluated`
                    # so the table reflects new state on the next render.
                    if update_scan_status(pending["url"], "Evaluated"):
                        st.toast(
                            f"Marked {pending['company']} as Evaluated in scan history.",
                            icon="✅",
                        )
                        st.cache_data.clear()
                        st.session_state["scan_table_dirty"] = True
                # Always clear `pending` so reruns don't re-trigger the eval.
                st.session_state.pop("scan_pending_eval", None)
        else:
            cached_rel = st.session_state.get("scan_eval_result")
            if cached_rel:
                st.divider()
                st.subheader("Last evaluation")
                _render_report_inline(cached_rel, allow_expander=True)

                col_clear, col_refresh = st.columns(2)
                with col_clear:
                    if st.button("Clear result", key="scan_clear_result"):
                        st.session_state.pop("scan_eval_result", None)
                        st.session_state.pop("scan_table_dirty", None)
                        st.rerun()
                with col_refresh:
                    if st.session_state.get("scan_table_dirty") and st.button(
                        "Refresh table", key="scan_refresh_table"
                    ):
                        st.session_state.pop("scan_table_dirty", None)
                        st.cache_data.clear()
                        st.rerun()

    elif page == "CV & Documents":
        st.title("CV & Documents")
        col1, col2 = st.columns([2, 1])

        with col1:
            st.subheader("Current CV (cv.md)")
            cv_text = load_cv_markdown()
            if cv_text:
                st.markdown(cv_text)
            else:
                st.caption("`cv.md` not found.")

        with col2:
            st.subheader("Generated Outputs")

            # Resumes
            st.write("**Resumes**")
            resume_pdfs = sorted(OUTPUT_DIR.glob("cv-*.pdf"), reverse=True)
            if resume_pdfs:
                for p in resume_pdfs[:15]:
                    with st.container():
                        st.caption(p.name)
                        _download_button(f"Download Resume", p, "application/pdf")
            else:
                st.caption("No resumes found.")

            st.write("---")
            # Cover Letters
            st.write("**Cover Letters**")
            cl_pdfs = sorted(COVER_LETTERS_DIR.glob("cover-letter-*.pdf"), reverse=True)
            if cl_pdfs:
                for p in cl_pdfs[:15]:
                    with st.container():
                        st.caption(p.name)
                        _download_button(f"Download Cover Letter", p, "application/pdf")
            else:
                st.caption("No cover letters found.")

    elif page == "Profile":
        # Interactive profile editor. Saves through `update_profile`, which
        # deep-merges into `config/profile.yml` so untouched fields survive.
        head_cols = st.columns([1, 6])
        with head_cols[0]:
            _render_avatar(profile, size=72)
        with head_cols[1]:
            st.title(full_name or "Profile")
            sub_bits: list[str] = []
            if candidate.get("email"):
                sub_bits.append(candidate["email"])
            if candidate.get("location"):
                sub_bits.append(candidate["location"])
            if sub_bits:
                st.caption("  •  ".join(sub_bits))

        st.divider()

        targeting = profile.get("target_roles") or {}
        primary_default = ", ".join(targeting.get("primary") or [])

        with st.form("profile_form"):
            st.subheader("Personal info")
            c1, c2 = st.columns(2)
            in_full_name = c1.text_input(
                "Full name", value=candidate.get("full_name", "")
            )
            in_email = c2.text_input("Email", value=candidate.get("email", ""))
            in_location = c1.text_input(
                "Location", value=candidate.get("location", "")
            )
            in_phone = c2.text_input(
                "Phone", value=candidate.get("phone", "")
            )
            in_linkedin = c1.text_input(
                "LinkedIn", value=candidate.get("linkedin", "")
            )
            in_portfolio = c2.text_input(
                "Portfolio URL", value=candidate.get("portfolio_url", "")
            )
            in_github = c1.text_input(
                "GitHub", value=candidate.get("github", "")
            )

            st.subheader("Career targeting")
            in_primary_roles = st.text_input(
                "Primary target roles",
                value=primary_default,
                help="Comma-separated. Used by the evaluator to score role fit.",
            )

            submitted = st.form_submit_button(
                "Save profile", type="primary", use_container_width=True
            )

        if submitted:
            updates: dict[str, Any] = {
                "candidate": {
                    "full_name": in_full_name.strip(),
                    "email": in_email.strip(),
                    "location": in_location.strip(),
                    "phone": in_phone.strip(),
                    "linkedin": in_linkedin.strip(),
                    "portfolio_url": in_portfolio.strip(),
                    "github": in_github.strip(),
                }
            }
            primary_roles = [
                r.strip()
                for r in (in_primary_roles or "").split(",")
                if r.strip()
            ]
            if primary_roles:
                updates["target_roles"] = {"primary": primary_roles}

            if update_profile(updates):
                st.success("Profile saved.")
                time.sleep(0.4)
                st.rerun()
            else:
                st.error(
                    "Could not write `config/profile.yml`. Check permissions."
                )

        with st.expander("Advanced — raw YAML", expanded=False):
            if PROFILE_PATH.exists():
                st.caption(
                    f"`{PROFILE_PATH.relative_to(REPO_ROOT)}` "
                    "(edit on disk for fields not covered above)."
                )
                st.code(
                    PROFILE_PATH.read_text(encoding="utf-8"),
                    language="yaml",
                )
            else:
                st.caption("`config/profile.yml` missing.")


if __name__ == "__main__":
    main()
