# Streamlit Dashboard (optional)

This project already includes a Go TUI under `dashboard/`. This file documents an **optional** Streamlit UI that reads the existing Career-Ops files (tracker/reports/output) and visualizes them.

## Install

```bash
python -m pip install -r dashboard/streamlit_requirements.txt
```

## Run

From the repo root:

```bash
streamlit run dashboard/streamlit_app.py
```

## Data sources (read-only)

- `data/applications.md`
- `data/pipeline.md`
- `reports/*.md` (reads PDF path + legitimacy from report header)
- `output/*.pdf`
- `output/cover-letters/*.pdf`
- `cv.md`, `config/profile.yml`

