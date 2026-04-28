from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
REPORTS_DIR = REPO_ROOT / "reports"
OUTPUT_DIR = REPO_ROOT / "output"
COVER_LETTERS_DIR = OUTPUT_DIR / "cover-letters"
PROFILE_PATH = REPO_ROOT / "config" / "profile.yml"
CV_PATH = REPO_ROOT / "cv.md"
APPLICATIONS_PATH = DATA_DIR / "applications.md"
PIPELINE_PATH = DATA_DIR / "pipeline.md"


@dataclass(frozen=True)
class ReportMeta:
    path: Path
    company: str | None
    role: str | None
    score: float | None
    pdf_path: Path | None
    legitimacy: str | None


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

    return ReportMeta(
        path=report_path,
        company=company,
        role=role,
        score=score,
        pdf_path=pdf_path,
        legitimacy=legitimacy,
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


def _cover_letter_pdf_path(candidate_slug: str, company_slug: str, day: date) -> Path:
    filename = f"cover-letter-{candidate_slug}-{company_slug}-{day.isoformat()}.pdf"
    return COVER_LETTERS_DIR / filename


def main() -> None:
    profile = load_profile()
    candidate = profile.get("candidate") or {}
    candidate_name = candidate.get("full_name") or "Career-Ops"

    st.set_page_config(page_title=f"{candidate_name} — Career-Ops Dashboard", layout="wide")
    st.title("Career-Ops Dashboard")

    if not APPLICATIONS_PATH.exists():
        st.warning("`data/applications.md` not found. Run the pipeline at least once to populate the tracker.")
        return

    tab_pipeline, tab_apps, tab_outputs, tab_cv, tab_profile = st.tabs(
        ["Pipeline", "Applications", "Outputs", "CV", "Profile"]
    )

    with tab_pipeline:
        text = load_pipeline_markdown()
        if not text:
            st.info("`data/pipeline.md` is empty or missing.")
        pending, processed = parse_pipeline(text)
        c1, c2 = st.columns(2)
        c1.metric("Pending", len(pending))
        c2.metric("Processed", len(processed))
        if pending:
            st.subheader("Pending")
            st.code("\n".join(pending), language="markdown")
        if processed:
            st.subheader("Processed")
            st.code("\n".join(processed[-25:]), language="markdown")

    with tab_apps:
        df = load_applications_table()
        if df.empty:
            st.info("No tracker rows found yet.")
            return

        status_col = "Status" if "Status" in df.columns else None
        score_col = "ScoreValue" if "ScoreValue" in df.columns else None

        total = len(df)
        applied = int((df[status_col] == "Applied").sum()) if status_col else 0
        interviewed = int((df[status_col] == "Interview").sum()) if status_col else 0
        offers = int((df[status_col] == "Offer").sum()) if status_col else 0
        avg_score = float(df[score_col].dropna().mean()) if score_col and df[score_col].notna().any() else None

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Total", total)
        c2.metric("Applied", applied)
        c3.metric("Interview", interviewed)
        c4.metric("Offer", offers)
        c5.metric("Avg score", f"{avg_score:.2f}/5" if avg_score is not None else "—")

        with st.sidebar:
            st.header("Filters")
            statuses = sorted(df[status_col].dropna().unique()) if status_col else []
            selected_statuses = st.multiselect("Status", statuses, default=statuses)
            min_score = st.slider("Min score", 0.0, 5.0, 0.0, 0.1)
            query = st.text_input("Company/Role contains", "")

        filtered = df.copy()
        if status_col and selected_statuses:
            filtered = filtered[filtered[status_col].isin(selected_statuses)]
        if score_col:
            filtered = filtered[(filtered[score_col].isna()) | (filtered[score_col] >= min_score)]
        if query.strip():
            q = query.strip().lower()
            filtered = filtered[
                filtered.get("Company", "").astype(str).str.lower().str.contains(q)
                | filtered.get("Role", "").astype(str).str.lower().str.contains(q)
            ]

        st.subheader("Status breakdown")
        if status_col:
            st.bar_chart(filtered[status_col].value_counts())

        st.subheader("Tracker")
        show_cols = [c for c in ["#", "Date", "Company", "Role", "Score", "Status", "PDF", "Report", "Notes"] if c in filtered.columns]
        st.dataframe(filtered[show_cols], use_container_width=True, hide_index=True)

        st.subheader("Downloads")
        row = st.selectbox(
            "Select an entry",
            options=filtered.index.tolist(),
            format_func=lambda i: f"{filtered.at[i, 'Company']} — {filtered.at[i, 'Role']}",
        )

        report_rel = str(filtered.at[row, "ReportPath"]) if "ReportPath" in filtered.columns else ""
        meta = load_report_meta(report_rel) if report_rel else None

        left, right = st.columns(2)
        with left:
            if meta:
                st.write(f"Report: `{meta.path.relative_to(REPO_ROOT)}`")
                _download_button("Download report (.md)", meta.path, "text/markdown")
            else:
                st.caption("No report found for this entry.")

        with right:
            if meta and meta.pdf_path:
                st.write(f"Resume PDF: `{meta.pdf_path.relative_to(REPO_ROOT)}`")
                _download_button("Download resume (.pdf)", meta.pdf_path, "application/pdf")
            else:
                st.caption("No resume PDF found in report header.")

        # Cover letter PDF (best-effort from company slug + date)
        if meta and "Date" in filtered.columns:
            company_slug = _slugify(str(filtered.at[row, "Company"]))
            candidate_slug = _candidate_slug(profile)
            d = filtered.at[row, "Date"]
            if isinstance(d, date):
                cl_pdf = _cover_letter_pdf_path(candidate_slug, company_slug, d)
                if cl_pdf.exists():
                    st.write(f"Cover letter PDF: `{cl_pdf.relative_to(REPO_ROOT)}`")
                    _download_button("Download cover letter (.pdf)", cl_pdf, "application/pdf")
                else:
                    st.caption("Cover letter PDF not found for this entry.")

    with tab_outputs:
        st.subheader("Resumes (output/)")
        resume_pdfs = sorted(OUTPUT_DIR.glob("cv-*.pdf"))
        if resume_pdfs:
            for p in resume_pdfs[-25:]:
                st.write(f"- `{p.relative_to(REPO_ROOT)}`")
        else:
            st.caption("No resume PDFs yet.")

        st.subheader("Cover letters (output/cover-letters/)")
        cl_pdfs = sorted(COVER_LETTERS_DIR.glob("cover-letter-*.pdf"))
        if cl_pdfs:
            for p in cl_pdfs[-25:]:
                st.write(f"- `{p.relative_to(REPO_ROOT)}`")
        else:
            st.caption("No cover letter PDFs yet.")

    with tab_cv:
        st.subheader("cv.md")
        cv = load_cv_markdown()
        if not cv:
            st.caption("`cv.md` missing or empty.")
        else:
            st.markdown(cv)

    with tab_profile:
        st.subheader("config/profile.yml")
        if PROFILE_PATH.exists():
            st.code(PROFILE_PATH.read_text(encoding="utf-8"), language="yaml")
        else:
            st.caption("`config/profile.yml` missing.")


if __name__ == "__main__":
    main()
