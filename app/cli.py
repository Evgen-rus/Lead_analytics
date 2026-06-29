from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd
import typer

from app import db
from app.analytics import add_domain, status_summary, summarize
from app.conclusions import build_conclusions
from app.config import OUTPUT_DIR, ensure_dirs
from app.excel_reader import read_excel_sheet, workbook_preview
from app.interactive import ask_analyze_mapping, ask_match_mapping, ask_status_group
from app.matcher import match_files
from app.models import StatusRule
from app.report_writer import write_excel
from app.source_utils import NO_DATA, normalize_source, safe_filename
from app.status_classifier import classify, unknown_statuses
from app.structure_detector import detect_analyze_mapping, detect_match_mapping

app = typer.Typer(no_args_is_help=True)


def _mapping_or_detect_analyze(path: str, project: str, interactive: bool, remap: bool):
    saved = None if remap else db.get_column_mapping(project)
    if saved:
        return saved
    detected = detect_analyze_mapping(path)
    if interactive and (remap or not detected.status_column):
        detected = ask_analyze_mapping(path, detected)
    if not detected.status_column:
        raise typer.BadParameter("Не удалось определить колонку статуса. Запустите --interactive --remap.")
    db.save_column_mapping(project, detected)
    return detected


def _mapping_or_detect_match(path: str, project: str, role: str, interactive: bool, remap: bool):
    saved = None if remap else db.get_match_mapping(project, role)
    if saved:
        return saved
    detected = detect_match_mapping(path, role)
    need_prompt = remap or (role == "lk" and (not detected.lkid_column or not detected.source_column))
    need_prompt = need_prompt or (role == "client" and not detected.status_column)
    if interactive and need_prompt:
        detected = ask_match_mapping(path, role)
    if role == "lk" and (not detected.lkid_column or not detected.source_column):
        raise typer.BadParameter("Для ЛК нужны LKID и источник. Запустите --interactive --remap.")
    if role == "client" and not detected.status_column:
        raise typer.BadParameter("Для клиента нужен статус. Запустите --interactive --remap.")
    db.save_match_mapping(project, role, detected)
    return detected


@app.command("init-db")
def init_db() -> None:
    ensure_dirs()
    db.init_db()
    typer.echo("База и папки готовы.")


@app.command()
def inspect(file: Path, project: str = "") -> None:
    previews = workbook_preview(file)
    typer.echo(f"Файл: {file}")
    for sheet, preview in previews.items():
        typer.echo(f"\nЛист: {sheet}")
        typer.echo("Колонки:")
        for col in preview.columns:
            typer.echo(f"- {col}")
        typer.echo("\nПервые строки:")
        typer.echo(preview.head(10).to_string(index=False))
    mapping = detect_analyze_mapping(file)
    typer.echo("\nПредполагаемые колонки:")
    typer.echo(mapping)
    df = read_excel_sheet(file, mapping.sheet_name)
    if mapping.channel_column:
        typer.echo("\nУникальные каналы:")
        typer.echo(df[mapping.channel_column].dropna().astype(str).value_counts().head(20).to_string())
    if mapping.source_column:
        typer.echo("\nУникальные источники:")
        typer.echo(df[mapping.source_column].dropna().astype(str).value_counts().head(20).to_string())
    if mapping.status_column:
        typer.echo("\nТоп статусов:")
        typer.echo(df[mapping.status_column].dropna().astype(str).value_counts().head(30).to_string())
        if project:
            unknown = unknown_statuses(df[mapping.status_column].tolist(), project)
            typer.echo("\nНеизвестные статусы:")
            typer.echo("\n".join(unknown) if unknown else "нет")


@app.command()
def match(
    project: str = typer.Option(...),
    lk_file: Path = typer.Option(...),
    client_file: Path = typer.Option(...),
    interactive: bool = typer.Option(False),
    remap: bool = typer.Option(False),
) -> None:
    ensure_dirs()
    db.init_db()
    db.ensure_project(project)
    lk_mapping = _mapping_or_detect_match(str(lk_file), project, "lk", interactive, remap)
    client_mapping = _mapping_or_detect_match(str(client_file), project, "client", interactive, remap)
    output = match_files(project, lk_file, client_file, lk_mapping, client_mapping, OUTPUT_DIR)
    typer.echo(f"Готово: {output}")


@app.command()
def analyze(
    file: Path,
    project: str = typer.Option(...),
    auto: bool = typer.Option(False),
    interactive: bool = typer.Option(False),
    strict: bool = typer.Option(False),
    remap: bool = typer.Option(False),
) -> None:
    ensure_dirs()
    db.init_db()
    db.ensure_project(project)
    if not (auto or interactive or strict):
        interactive = True
    mapping = _mapping_or_detect_analyze(str(file), project, interactive, remap)
    df = read_excel_sheet(file, mapping.sheet_name)

    if strict:
        unknown = unknown_statuses(df[mapping.status_column].tolist(), project)
        if unknown:
            typer.echo("Есть неизвестные статусы:")
            typer.echo("\n".join(unknown))
            raise typer.Exit(1)

    if interactive:
        for status in unknown_statuses(df[mapping.status_column].tolist(), project):
            group = ask_status_group(status)
            db.add_status_rule(
                StatusRule(
                    project_code=project,
                    pattern=status,
                    match_type="exact",
                    group_name=group,
                    priority=10,
                    comment="Добавлено через interactive mode",
                )
            )

    data = pd.DataFrame()
    data["Дата"] = df[mapping.date_column] if mapping.date_column else pd.NaT
    data["Телефон"] = df[mapping.phone_column] if mapping.phone_column else ""
    data["Канал"] = df[mapping.channel_column] if mapping.channel_column else NO_DATA
    data["Полный источник"] = df[mapping.source_column].map(normalize_source) if mapping.source_column else NO_DATA
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
        ["Кач. %", "Сигнал спроса %", "Всего идентификаций"], ascending=[False, False, False]
    )
    by_source_channel = summarize(data, ["Полный источник", "Канал"]).sort_values(
        ["Кач. %", "Сигнал спроса %", "Всего идентификаций"], ascending=[False, False, False]
    )
    channels = summarize(data, ["Канал"]).sort_values(
        ["Сигнал спроса %", "Недозвон %"], ascending=[False, True]
    )
    statuses = status_summary(data)
    conclusions = build_conclusions(total, channels)

    output = OUTPUT_DIR / f"{safe_filename(project)}_аналитика.xlsx"
    write_excel(
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
    typer.echo(f"Готово: {output}")


@app.command("add-rule")
def add_rule(
    project: Optional[str] = typer.Option(None),
    pattern: str = typer.Option(...),
    group: str = typer.Option(...),
    match_type: str = typer.Option("exact"),
    subgroup: Optional[str] = typer.Option(None),
    comment: Optional[str] = typer.Option(None),
    priority: int = typer.Option(100),
) -> None:
    db.init_db()
    db.add_status_rule(
        StatusRule(
            project_code=project,
            pattern=pattern,
            match_type=match_type,
            group_name=group,
            subgroup_name=subgroup,
            comment=comment,
            priority=priority,
        )
    )
    typer.echo("Правило добавлено.")


@app.command("list-rules")
def list_rules(project: Optional[str] = typer.Option(None)) -> None:
    db.init_db()
    rows = db.list_status_rules(project)
    for row in rows:
        typer.echo(
            f'{row["id"]}: project={row["project_code"]} {row["match_type"]} '
            f'"{row["pattern"]}" -> {row["group_name"]}'
        )


@app.command("update-rule")
def update_rule(
    id: int = typer.Option(...),
    group: Optional[str] = typer.Option(None),
    pattern: Optional[str] = typer.Option(None),
    match_type: Optional[str] = typer.Option(None),
    priority: Optional[int] = typer.Option(None),
) -> None:
    db.update_status_rule(
        id,
        group_name=group,
        pattern=pattern,
        match_type=match_type,
        priority=priority,
    )
    typer.echo("Правило обновлено.")


@app.command("delete-rule")
def delete_rule(
    id: Optional[int] = typer.Option(None),
    project: Optional[str] = typer.Option(None),
    pattern: Optional[str] = typer.Option(None),
) -> None:
    db.delete_status_rule(id, project, pattern)
    typer.echo("Правило удалено.")


if __name__ == "__main__":
    app()
