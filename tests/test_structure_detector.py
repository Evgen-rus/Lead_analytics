import pandas as pd

from app.structure_detector import detect_analyze_mapping


def test_detect_analyze_mapping_from_excel(tmp_path):
    path = tmp_path / "sample.xlsx"
    pd.DataFrame(
        {
            "Дата": ["2026-01-01"],
            "Телефон": ["79231234567"],
            "Канал": ["A"],
            "Источники": ["site.ru_12345"],
            "Стадия сделки": ["Недозвон"],
        }
    ).to_excel(path, index=False)
    mapping = detect_analyze_mapping(path)
    assert mapping.date_column == "Дата"
    assert mapping.phone_column == "Телефон"
    assert mapping.channel_column == "Канал"
    assert mapping.source_column == "Источники"
    assert mapping.status_column == "Стадия сделки"
