from app.export_history import build_conclusions, build_export_dynamics, build_registry


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
