from __future__ import annotations

import typer

from app.excel_reader import list_sheets, read_excel_sheet
from app.models import ColumnMapping
from app.status_classifier import ALL_GROUPS


GROUPS = ALL_GROUPS


def _choose(prompt: str, values: list[str], required: bool = False) -> str | None:
    for idx, value in enumerate(values, 1):
        typer.echo(f"{idx}. {value}")
    if not required:
        typer.echo("0. нет")
    while True:
        raw = typer.prompt(prompt)
        try:
            choice = int(raw)
        except ValueError:
            typer.echo("Введите номер из списка.")
            continue
        if not required and choice == 0:
            return None
        if 1 <= choice <= len(values):
            return values[choice - 1]
        typer.echo("Введите номер из списка.")


def ask_analyze_mapping(path: str, current: ColumnMapping | None = None) -> ColumnMapping:
    sheets = list_sheets(path)
    typer.echo("Листы:")
    sheet = _choose("Выберите лист для анализа", sheets, required=True)
    df = read_excel_sheet(path, sheet)
    columns = list(df.columns)
    typer.echo(f'Колонки на листе "{sheet}":')
    return ColumnMapping(
        sheet_name=sheet or sheets[0],
        date_column=_choose("Выберите столбец даты", columns),
        phone_column=_choose("Выберите столбец телефона", columns),
        channel_column=_choose("Выберите столбец канала", columns),
        source_column=_choose("Выберите столбец источника", columns),
        status_column=_choose("Выберите столбец статуса", columns, required=True),
        comment_column=_choose("Выберите столбец комментария", columns),
    )


def ask_match_mapping(path: str, role: str) -> ColumnMapping:
    sheets = list_sheets(path)
    typer.echo(f"Листы файла {role}:")
    sheet = _choose("Выберите лист", sheets, required=True)
    df = read_excel_sheet(path, sheet)
    columns = list(df.columns)
    typer.echo(f'Колонки на листе "{sheet}":')
    if role == "lk":
        return ColumnMapping(
            sheet_name=sheet or sheets[0],
            lkid_column=_choose("Выберите колонку LKID", columns, required=True),
            phone_column=_choose("Выберите колонку телефона", columns),
            date_column=_choose("Выберите колонку даты", columns),
            source_column=_choose("Выберите колонку полного источника", columns, required=True),
            project_column=_choose("Выберите колонку проекта", columns),
        )
    return ColumnMapping(
        sheet_name=sheet or sheets[0],
        lkid_column=_choose("Выберите колонку LKID", columns),
        phone_column=_choose("Выберите колонку телефона", columns),
        date_column=_choose("Выберите колонку даты", columns),
        status_column=_choose("Выберите колонку статуса", columns, required=True),
        comment_column=_choose("Выберите колонку комментария", columns),
        source_column=_choose("Выберите колонку источника", columns),
    )


def ask_status_group(status: str) -> str:
    typer.echo(f"\nНеизвестный статус: {status}")
    return _choose("К какой группе отнести", GROUPS, required=True) or "Требует проверки"
