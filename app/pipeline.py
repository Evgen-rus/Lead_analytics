from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.analytics import add_domain, status_summary, summarize
from app.conclusions import build_conclusions
from app.excel_reader import read_excel_sheet
from app.models import ColumnMapping
from app.report_writer import write_excel
from app.source_utils import NO_DATA, normalize_source, safe_filename
from app.status_classifier import classify


def analyze_file(
    project: str,
    file: str | Path,
    mapping: ColumnMapping,
    output_dir: str | Path,
) -> Path:
    df = read_excel_sheet(file, mapping.sheet_name)

    data = pd.DataFrame()
    data["Дата"] = df[mapping.date_column] if mapping.date_column else pd.NaT
    data["Телефон"] = df[mapping.phone_column] if mapping.phone_column else ""
    data["Канал"] = df[mapping.channel_column] if mapping.channel_column else NO_DATA
    data["Полный источник"] = (
        df[mapping.source_column].map(normalize_source) if mapping.source_column else NO_DATA
    )
    data["Исходный статус"] = df[mapping.status_column]
    data["Комментарий"] = df[mapping.comment_column] if mapping.comment_column else ""
    classifications = [
        classify(status, comment, project)
        for status, comment in zip(data["Исходный статус"], data["Комментарий"])
    ]
    data["Группа статуса"] = [item[0] for item in classifications]
    data["Правило"] = [item[1] for item in classifications]
    data = add_domain(data)

    total = summarize(data, [])
    total.insert(0, "Проект", project)
    by_domain_channel = summarize(data, ["Домен", "Канал"]).sort_values(
        ["Кач. %", "Сигнал спроса %", "Всего идентификаций"],
        ascending=[False, False, False],
    )
    by_source_channel = summarize(data, ["Полный источник", "Канал"]).sort_values(
        ["Кач. %", "Сигнал спроса %", "Всего идентификаций"],
        ascending=[False, False, False],
    )
    channels = summarize(data, ["Канал"]).sort_values(
        ["Сигнал спроса %", "Недозвон %"],
        ascending=[False, True],
    )
    statuses = status_summary(data)
    conclusions = build_conclusions(total, channels)

    output = Path(output_dir) / f"{safe_filename(project)}_аналитика.xlsx"
    return write_excel(
        output,
        {
            "Итог": total,
            "Итог по доменам + каналам": by_domain_channel,
            "Итог по источникам + каналам": by_source_channel,
            "Статусы": statuses,
            "Каналы": channels,
            "Выводы": conclusions,
            "Данные": data,
        },
    )
