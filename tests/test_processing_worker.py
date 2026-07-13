import time

import pandas as pd

from app import db
from backend.app import main


def test_match_job_reports_row_progress_and_writes_report(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "analytics.db")
    monkeypatch.setattr(main, "RUNS_DIR", tmp_path / "runs")
    run_id = "test-run"
    input_dir = main.RUNS_DIR / run_id / "input"
    input_dir.mkdir(parents=True)
    pd.DataFrame(
        {"LKID": ["1", "2"], "Источник": ["site_1", "site_2"], "Дата": ["2026-01-01", "2026-01-02"]}
    ).to_excel(input_dir / "lk.xlsx", index=False)
    pd.DataFrame(
        {"Статус": ["Заявка принята", "Недозвон"], "LKID": ["1", "2"], "Дата": ["2026-01-01", "2026-01-02"]}
    ).to_excel(input_dir / "client.xlsx", index=False)

    job = main.queue_match(
        run_id,
        main.MatchPayload(
            project="Demo",
            lk_mapping=main.MappingPayload(sheet_name="Sheet1", lkid_column="LKID", source_column="Источник", date_column="Дата"),
            client_mapping=main.MappingPayload(sheet_name="Sheet1", lkid_column="LKID", status_column="Статус", date_column="Дата"),
        ),
    )

    for _ in range(100):
        current = main.processing_job(job.id)
        if current.status in {"completed", "failed"}:
            break
        time.sleep(0.02)

    assert current.status == "completed"
    assert current.processed_rows == 4
    assert current.total_rows == 4
    assert (main.RUNS_DIR / run_id / "output" / current.output_file_name).exists()
