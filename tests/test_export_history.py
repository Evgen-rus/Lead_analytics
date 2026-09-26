from pathlib import Path

import pandas as pd

from app import db, export_history
from app.export_history import (
    ExportMetadata,
    ExportPeriod,
    build_conclusions,
    build_export_dynamics,
    build_registry,
    delete_analysis_export,
    list_exports,
    save_analysis_export,
)


def test_registry_conclusion_prefers_percent_over_volume():
    exports = [
        {
            "export_number": 1,
            "period_start": "2026-06-01",
            "period_end": "2026-06-07",
            "analysis_date": "2026-06-08",
            "source_file_name": "first.xlsx",
            "total_count": 100,
            "missed_count": 20,
            "missed_rate": 0.2,
            "quality_count": 10,
            "quality_rate": 0.1,
            "demand_count": 10,
            "demand_rate": 0.1,
        },
        {
            "export_number": 2,
            "period_start": "2026-06-01",
            "period_end": "2026-06-29",
            "analysis_date": "2026-06-30",
            "source_file_name": "second.xlsx",
            "total_count": 500,
            "missed_count": 150,
            "missed_rate": 0.3,
            "quality_count": 30,
            "quality_rate": 0.06,
            "demand_count": 30,
            "demand_rate": 0.06,
        },
    ]

    registry = build_registry(exports)
    dynamics = build_export_dynamics(exports)
    conclusions = build_conclusions(exports, "Demo")

    assert "объем больше, но эффективность ниже" in registry.loc[1, "Краткий вывод"]
    assert dynamics.loc[1, "Изм. качественных, п.п."] == -4
    assert dynamics.loc[1, "Изм. сигнала спроса, п.п."] == -4
    assert any("Объем вырос, эффективность снизилась" in item for item in conclusions)


def test_export_number_is_automatic_and_periods_are_saved(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "analytics.db")
    db.init_db()
    total = pd.DataFrame(
        {
            "Всего идентификаций": [2],
            "Недозвон": [1],
            "Недозвон %": [0.5],
            "Качественные": [1],
            "Кач. %": [0.5],
            "Сигнал спроса": [1],
            "Сигнал спроса %": [0.5],
        }
    )
    periods = [ExportPeriod("2026-01-01", "2026-01-31"), ExportPeriod("2026-02-01", "2026-02-28")]
    results = [(period, total, {"domain_channel": pd.DataFrame(), "source_channel": pd.DataFrame(), "channel": pd.DataFrame()}) for period in periods]

    save_analysis_export("Demo", ExportMetadata(None, periods), results)
    save_analysis_export("Demo", ExportMetadata(None, periods[:1]), results[:1])

    exports = list_exports("Demo")
    assert [item["export_number"] for item in exports] == [1, 2]
    assert [(item["period_start"], item["period_end"]) for item in exports[0]["periods"]] == [
        ("2026-01-01", "2026-01-31"),
        ("2026-02-01", "2026-02-28"),
    ]


def test_saved_report_is_downloadable_and_removed_with_history(tmp_path, monkeypatch):
    from backend.app import main

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "analytics.db")
    reports_dir = tmp_path / "reports"
    monkeypatch.setattr(export_history, "ANALYSIS_REPORTS_DIR", reports_dir)
    db.init_db()
    total = pd.DataFrame(
        {
            "Всего идентификаций": [2],
            "Недозвон": [1],
            "Недозвон %": [0.5],
            "Качественные": [1],
            "Кач. %": [0.5],
            "Сигнал спроса": [1],
            "Сигнал спроса %": [0.5],
        }
    )
    period = ExportPeriod("2026-01-01", "2026-01-31")
    report_name = "0123456789abcdef0123456789abcdef.xlsx"
    report_path = reports_dir / report_name
    reports_dir.mkdir(parents=True)
    report_path.write_bytes(b"complete workbook")
    export_id = save_analysis_export(
        "Demo",
        ExportMetadata(None, [period]),
        [(period, total, {"domain_channel": pd.DataFrame(), "source_channel": pd.DataFrame(), "channel": pd.DataFrame()})],
        report_file_name=report_name,
    )

    history = main.saved_exports("Demo")
    assert history[0].id == export_id
    assert history[0].report_available is True
    assert Path(main.download_saved_export("Demo", export_id).path) == report_path
    replacement_name = "fedcba9876543210fedcba9876543210.xlsx"
    replacement_path = reports_dir / replacement_name
    replacement_path.write_bytes(b"replacement workbook")
    replacement_id = save_analysis_export(
        "Demo",
        ExportMetadata(1, [period]),
        [(period, total, {"domain_channel": pd.DataFrame(), "source_channel": pd.DataFrame(), "channel": pd.DataFrame()})],
        report_file_name=replacement_name,
        replace=True,
    )
    assert not report_path.exists()
    assert replacement_path.exists()
    assert Path(main.download_saved_export("Demo", replacement_id).path) == replacement_path
    assert delete_analysis_export("Demo", 1)
    assert not replacement_path.exists()
