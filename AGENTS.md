# Lead Analytics

## Scope and layout

- Local Excel matching and lead-status analytics application; no external CRM integration is in scope.
- `app/`: domain logic, CLI, SQLite access. `backend/app/main.py`: FastAPI API.
  `frontend/`: React/Vite UI. `tests/`: pytest suite. `data/analytics.db`: local state.
- Column mappings are project-specific. Auto-detection is in
  `app/structure_detector.py`; persisted mappings are in SQLite tables
  `column_mappings` and `file_match_mappings`.

## Commands (PowerShell, repository root)

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8001
cd frontend; npm.cmd run build
cd frontend; npm.cmd run dev
```

- Initialise a new local database only when needed:
  `.\.venv\Scripts\python.exe -m app.cli init-db`.
- Run relevant tests for a focused Python change; run the full pytest suite and
  frontend build when changes span the API/UI boundary.

## Working rules

- Keep source files and text documentation in UTF-8. Russian column names,
  statuses, and documentation are intentional; do not replace or re-encode them
  merely because a terminal displays mojibake.
- Preserve the real names selected from uploaded Excel columns; internal
  canonical fields are assembled in `app/pipeline.py` and `app/matcher.py`.
- Do not hand-edit generated files, virtual environments, `frontend/node_modules`,
  or build outputs.
- Treat `data/analytics.db`, `data/input`, `data/output`, `data/runs`, and real
  Excel exports as user data. Ask for approval before deleting, overwriting,
  migrating, bulk-modifying, exporting, or committing them.
- Ask before destructive or externally visible actions (including database schema
  changes, deleting exports/rules, `git reset`, force-push, or network uploads).
- Keep changes minimal and verify them with the relevant commands above.
