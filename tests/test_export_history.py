import pandas as pd

from app import db
from app.export_history import (
    ExportMetadata,
    ExportPeriod,
    build_conclusions,
    build_export_dynamics,
    build_registry,
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
