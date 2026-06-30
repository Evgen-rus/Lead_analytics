from __future__ import annotations

import pandas as pd

from app.source_utils import extract_domain
from app.status_classifier import ALL_GROUPS, DEMAND_GROUPS


COUNT_COL = "Всего идентификаций"
GROUP_COL = "Группа статуса"


def prepare_denominator(df: pd.DataFrame) -> pd.DataFrame:
    if GROUP_COL not in df.columns:
        return df
    return df[df[GROUP_COL] != "Не учитывать"].copy()


def summarize(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    work = prepare_denominator(df)
    if not by:
        grouped = [("__all__", work)]
    else:
        grouped = work.groupby(by, dropna=False)
    rows = []
    for key, part in grouped:
        row = {}
        if by:
            keys = key if isinstance(key, tuple) else (key,)
            row.update({col: value for col, value in zip(by, keys)})
        total = len(part)
        row[COUNT_COL] = total
        demand = int(part[GROUP_COL].isin(DEMAND_GROUPS).sum())
        for group in ALL_GROUPS:
            count = int((part[GROUP_COL] == group).sum())
            row[group] = count
            row[f"{_short(group)} %"] = count / total if total else 0
            if group == "Уже наши / уже купил":
                row["Сигнал спроса"] = demand
                row["Сигнал спроса %"] = demand / total if total else 0
        rows.append(row)
    result = pd.DataFrame(rows)
    return result


def _short(group: str) -> str:
    return {
        "Качественные": "Кач.",
        "Рабочий потенциал": "Рабочий потенциал",
        "Уже наши / уже купил": "Уже наши / купил",
        "Недозвон": "Недозвон",
        "Некачественные": "Некач.",
        "Не подходит по гео": "Не подходит по гео",
        "Еще не звонили": "Еще не звонили",
        "Требует проверки": "Требует проверки",
    }.get(group, group)


def add_domain(df: pd.DataFrame, source_col: str = "Полный источник") -> pd.DataFrame:
    result = df.copy()
    result["Домен"] = result[source_col].map(extract_domain)
    return result


def status_summary(df: pd.DataFrame) -> pd.DataFrame:
    work = prepare_denominator(df)
    return (
        work.groupby(["Группа статуса", "Исходный статус"], dropna=False)
        .size()
        .reset_index(name="Количество")
        .sort_values("Количество", ascending=False)
    )
