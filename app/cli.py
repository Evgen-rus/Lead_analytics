from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from app import db
from app.config import OUTPUT_DIR, ensure_dirs
from app.excel_reader import read_excel_sheet, workbook_preview
from app.export_history import (
    ExportMetadata,
    delete_analysis_export,
    write_project_comparison,
    write_project_summary,
)
from app.interactive import ask_analyze_mapping, ask_match_mapping, ask_status_group
from app.matcher import match_files
from app.models import StatusRule
from app.pipeline import analyze_file
from app.status_classifier import unknown_statuses
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
    export_number: Optional[int] = typer.Option(None),
    period_from: Optional[str] = typer.Option(None),
    period_to: Optional[str] = typer.Option(None),
    analysis_date: Optional[str] = typer.Option(None),
    replace_export: bool = typer.Option(False),
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

    export_metadata = None
    if export_number or period_from or period_to or analysis_date:
        if export_number is None or not period_from or not period_to:
            raise typer.BadParameter(
                "Для сохранения выгрузки укажите --export-number, --period-from и --period-to."
            )
        export_metadata = ExportMetadata(
            export_number=export_number,
            period_start=period_from,
            period_end=period_to,
            analysis_date=analysis_date,
            source_file_name=file.name,
        )

    output = analyze_file(project, file, mapping, OUTPUT_DIR, export_metadata, replace_export)
    typer.echo(f"Готово: {output}")


@app.command("project-summary")
def project_summary(project: str = typer.Option(...)) -> None:
    ensure_dirs()
    db.init_db()
    output = write_project_summary(project, OUTPUT_DIR)
    typer.echo(f"Готово: {output}")


@app.command("compare-exports")
def compare_exports(project: str = typer.Option(...)) -> None:
    ensure_dirs()
    db.init_db()
    output = write_project_comparison(project, OUTPUT_DIR)
    typer.echo(f"Готово: {output}")


@app.command("delete-export")
def delete_export(project: str = typer.Option(...), export_number: int = typer.Option(...)) -> None:
    db.init_db()
    deleted = delete_analysis_export(project, export_number)
    typer.echo("Выгрузка удалена." if deleted else "Выгрузка не найдена.")


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
