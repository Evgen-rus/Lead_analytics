from app import db


def test_processing_jobs_are_claimed_in_creation_order(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "analytics.db")
    db.init_db()

    first = db.create_processing_job("run-1", "match", {"project": "First"})
    second = db.create_processing_job("run-2", "analyze", {"project": "Second"})

    claimed_first = db.claim_next_processing_job()
    claimed_second = db.claim_next_processing_job()

    assert claimed_first is not None
    assert claimed_second is not None
    assert claimed_first["id"] == first["id"]
    assert claimed_second["id"] == second["id"]
    assert claimed_first["status"] == "running"


def test_processing_job_progress_and_completion_are_persisted(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "analytics.db")
    db.init_db()
    job = db.create_processing_job("run-1", "match", {"project": "First"})

    db.update_processing_job(
        int(job["id"]),
        status="completed",
        phase="Готово",
        processed_rows=50,
        total_rows=50,
        output_file_name="First_сопоставление.xlsx",
    )

    saved = db.get_processing_job(int(job["id"]))
    assert saved["status"] == "completed"
    assert saved["processed_rows"] == 50
    assert saved["total_rows"] == 50
    assert saved["output_file_name"] == "First_сопоставление.xlsx"
