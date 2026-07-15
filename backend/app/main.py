from __future__ import annotations

import math
import shutil
import threading
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app import db
from app.config import DATA_DIR, ensure_dirs
from app.excel_reader import list_sheets, read_excel_sheet
from app.export_history import (
    ExportMetadata,
    delete_analysis_export,
    list_exports,
    write_project_comparison,
    write_project_summary,
)
from app.google_sheets import export_workbook
from app.matcher import match_files
from app.models import ColumnMapping, StatusRule
from app.pipeline import analyze_file
from app.status_classifier import ALL_GROUPS, load_json_rules, unknown_statuses
from app.structure_detector import detect_analyze_mapping, detect_match_mapping

RUNS_DIR = DATA_DIR / "runs"
PREVIEW_ROWS = 25


app = FastAPI(title="Lead Analytics API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MappingPayload(BaseModel):
    sheet_name: str
    date_column: str | None = None
    phone_column: str | None = None
    channel_column: str | None = None
    source_column: str | None = None
    status_column: str | None = None
    comment_column: str | None = None
    lkid_column: str | None = None
    project_column: str | None = None


class MatchPayload(BaseModel):
    project: str
    lk_mapping: MappingPayload
    client_mapping: MappingPayload


class AnalyzeSetupPayload(BaseModel):
    project: str
    mapping: MappingPayload | None = None


class AnalyzePayload(BaseModel):
    project: str
    mapping: MappingPayload
    status_rules: dict[str, str] = {}
    export_number: int
    period_start: date
    period_end: date
    analysis_date: date | None = None
    source_file_name: str | None = None
    replace_export: bool = False


class ExportRecord(BaseModel):
    export_number: int
    period_start: str
    period_end: str
    analysis_date: str
    source_file_name: str
    total_count: int
    missed_count: int
    missed_rate: float
    quality_count: int
    quality_rate: float
    demand_count: int
    demand_rate: float


class SheetPreview(BaseModel):
    name: str
    columns: list[str]
    rows: list[dict[str, Any]]


class FileInspect(BaseModel):
    filename: str
    detected: MappingPayload
    sheets: list[SheetPreview]


class UploadResponse(BaseModel):
    run_id: str
    project: str
    lk: FileInspect
    client: FileInspect


class WorkbookPreview(BaseModel):
    filename: str
    sheets: list[SheetPreview]


class MatchResponse(BaseModel):
    filename: str
    preview: WorkbookPreview


class AnalyzeSetupResponse(BaseModel):
    filename: str
    mapping: MappingPayload
    sheets: list[SheetPreview]
    unknown_statuses: list[str]
    status_groups: list[str]


class AnalyzeResponse(BaseModel):
    filename: str
    preview: WorkbookPreview


class GoogleSheetsExportPayload(BaseModel):
    project: str
    analysis_date: date


class GoogleSheetsExportResponse(BaseModel):
    spreadsheet_url: str
    spreadsheet_title: str
    sheet_titles: list[str]


class JobResponse(BaseModel):
    id: int
    run_id: str
    kind: Literal["match", "analyze"]
    status: Literal["queued", "running", "completed", "failed"]
    phase: str
    processed_rows: int
    total_rows: int
    error_text: str | None = None
    output_file_name: str | None = None


class StatusRuleResponse(BaseModel):
    id: int | None = None
    pattern: str
    match_type: str
    group_name: str
    priority: int
    source: Literal["project", "global", "default"]


class StatusRulesResponse(BaseModel):
    project_rules: list[StatusRuleResponse]
    system_rules: list[StatusRuleResponse]
    status_groups: list[str]


class StatusRuleUpdatePayload(BaseModel):
    project: str
    group_name: str


JOB_WORKER_LOCK = threading.Lock()


def _run_dir(run_id: str) -> Path:
    if not run_id or any(part in run_id for part in ["..", "/", "\\"]):
        raise HTTPException(status_code=400, detail="Некорректный run_id")
    path = RUNS_DIR / run_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Запуск не найден")
    return path


def _input_path(run_id: str, role: Literal["lk", "client"]) -> Path:
    return _run_dir(run_id) / "input" / f"{role}.xlsx"


def _output_dir(run_id: str) -> Path:
    path = _run_dir(run_id) / "output"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _output_file(run_id: str, kind: Literal["match", "analyze"]) -> Path:
    suffix = "_сопоставление.xlsx" if kind == "match" else "_аналитика.xlsx"
    matches = sorted(_output_dir(run_id).glob(f"*{suffix}"), key=lambda item: item.stat().st_mtime)
    if not matches:
        raise HTTPException(status_code=404, detail="Файл еще не создан")
    return matches[-1]


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _to_mapping(payload: MappingPayload) -> ColumnMapping:
    return ColumnMapping(
        sheet_name=payload.sheet_name,
        date_column=_clean_optional(payload.date_column),
        phone_column=_clean_optional(payload.phone_column),
        channel_column=_clean_optional(payload.channel_column),
        source_column=_clean_optional(payload.source_column),
        status_column=_clean_optional(payload.status_column),
        comment_column=_clean_optional(payload.comment_column),
        lkid_column=_clean_optional(payload.lkid_column),
        project_column=_clean_optional(payload.project_column),
    )


def _from_mapping(mapping: ColumnMapping) -> MappingPayload:
    return MappingPayload(
        sheet_name=mapping.sheet_name,
        date_column=mapping.date_column,
        phone_column=mapping.phone_column,
        channel_column=mapping.channel_column,
        source_column=mapping.source_column,
        status_column=mapping.status_column,
        comment_column=mapping.comment_column,
        lkid_column=mapping.lkid_column,
        project_column=mapping.project_column,
    )


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    return value


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for item in df.head(PREVIEW_ROWS).to_dict(orient="records"):
        rows.append({str(key): _json_value(value) for key, value in item.items()})
    return rows


def _inspect_workbook(path: Path) -> list[SheetPreview]:
    previews = []
    for sheet in list_sheets(path):
        df = read_excel_sheet(path, sheet).head(PREVIEW_ROWS)
        previews.append(
            SheetPreview(
                name=sheet,
                columns=[str(column) for column in df.columns],
                rows=_records(df),
            )
        )
    return previews


def _inspect_upload(path: Path, filename: str, role: Literal["lk", "client"]) -> FileInspect:
    detected = detect_match_mapping(path, role)
    return FileInspect(
        filename=filename,
        detected=_from_mapping(detected),
        sheets=_inspect_workbook(path),
    )


def _preview_workbook(path: Path) -> WorkbookPreview:
    return WorkbookPreview(filename=path.name, sheets=_inspect_workbook(path))


def _validate_excel(file: UploadFile) -> None:
    name = file.filename or ""
    if not name.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail=f"Файл {name} должен быть .xlsx")


def _validate_unknown_status_rules(unknown: list[str], status_rules: dict[str, str]) -> None:
    missing = [status for status in unknown if not status_rules.get(status, "").strip()]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Выберите группу для каждого неизвестного статуса перед аналитикой",
        )
    invalid_groups = [
        group
        for status, group in status_rules.items()
        if status.strip() and group.strip() and group.strip() not in ALL_GROUPS
    ]
    if invalid_groups:
        raise HTTPException(status_code=400, detail="Неизвестная группа статуса")


def _job_response(job: dict[str, object]) -> JobResponse:
    return JobResponse(
        id=int(job["id"]),
        run_id=str(job["run_id"]),
        kind=str(job["kind"]),
        status=str(job["status"]),
        phase=str(job["phase"]),
        processed_rows=int(job["processed_rows"]),
        total_rows=int(job["total_rows"]),
        error_text=str(job["error_text"]) if job["error_text"] else None,
        output_file_name=str(job["output_file_name"]) if job["output_file_name"] else None,
    )


def _run_processing_job(job: dict[str, object]) -> None:
    job_id = int(job["id"])
    run_id = str(job["run_id"])
    payload = job["payload"]
    if not isinstance(payload, dict):
        raise ValueError("Некорректные данные задания")
    last_progress: tuple[str, int, int] | None = None

    def report(phase: str, current: int, total: int) -> None:
        nonlocal last_progress
        previous = last_progress
        should_save = (
            previous is None
            or phase != previous[0]
            or current == total
            or current - previous[1] >= max(1, total // 100)
        )
        if should_save:
            db.update_processing_job(
                job_id,
                phase=phase,
                processed_rows=current,
                total_rows=total,
            )
            last_progress = (phase, current, total)

    try:
        kind = str(job["kind"])
        if kind == "match":
            report("Чтение и подготовка файлов", 0, 0)
            output = match_files(
                str(payload["project"]),
                _input_path(run_id, "lk"),
                _input_path(run_id, "client"),
                _to_mapping(MappingPayload(**payload["lk_mapping"])),
                _to_mapping(MappingPayload(**payload["client_mapping"])),
                _output_dir(run_id),
                progress=report,
            )
        elif kind == "analyze":
            report("Подготовка аналитики", 0, 0)
            mapping = _to_mapping(MappingPayload(**payload["mapping"]))
            for status, group in dict(payload["status_rules"]).items():
                db.add_status_rule(
                    StatusRule(
                        project_code=str(payload["project"]),
                        pattern=str(status).strip(),
                        match_type="exact",
                        group_name=str(group).strip(),
                        priority=10,
                        comment="Добавлено через web",
                    )
                )
            output = analyze_file(
                str(payload["project"]),
                _output_file(run_id, "match"),
                mapping,
                _output_dir(run_id),
                ExportMetadata(
                    export_number=int(payload["export_number"]),
                    period_start=str(payload["period_start"]),
                    period_end=str(payload["period_end"]),
                    analysis_date=payload.get("analysis_date"),
                    source_file_name=str(payload["source_file_name"]),
                ),
                replace_export=bool(payload["replace_export"]),
                progress=report,
            )
            shutil.rmtree(_run_dir(run_id) / "input", ignore_errors=True)
        else:
            raise ValueError("Неизвестный тип задания")
        db.update_processing_job(
            job_id,
            status="completed",
            phase="Готово",
            output_file_name=output.name,
        )
    except Exception as exc:
        db.update_processing_job(job_id, status="failed", phase="Ошибка", error_text=str(exc))


def _run_job_worker() -> None:
    try:
        while job := db.claim_next_processing_job():
            _run_processing_job(job)
    finally:
        JOB_WORKER_LOCK.release()
    if db.has_queued_processing_jobs():
        _start_job_worker()


def _start_job_worker() -> None:
    if not JOB_WORKER_LOCK.acquire(blocking=False):
        return
    threading.Thread(target=_run_job_worker, daemon=True, name="lead-analytics-jobs").start()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/projects", response_model=list[str])
def projects() -> list[str]:
    db.init_db()
    return db.list_projects()


@app.get("/api/status-rules", response_model=StatusRulesResponse)
def status_rules(project: str) -> StatusRulesResponse:
    db.init_db()
    project = project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    project_rules = [
        StatusRuleResponse(
            id=row["id"],
            pattern=row["pattern"],
            match_type=row["match_type"],
            group_name=row["group_name"],
            priority=row["priority"],
            source="project",
        )
        for row in db.list_project_status_rules(project)
    ]
    global_rules = [
        StatusRuleResponse(
            id=row["id"],
            pattern=row["pattern"],
            match_type=row["match_type"],
            group_name=row["group_name"],
            priority=row["priority"],
            source="global",
        )
        for row in db.list_global_status_rules()
    ]
    default_rules = [
        StatusRuleResponse(
            pattern=rule.pattern,
            match_type=rule.match_type,
            group_name=rule.group_name,
            priority=rule.priority,
            source="default",
        )
        for rule in load_json_rules()
    ]
    return StatusRulesResponse(
        project_rules=project_rules,
        system_rules=global_rules + default_rules,
        status_groups=ALL_GROUPS,
    )


@app.put("/api/status-rules/{rule_id}", response_model=StatusRuleResponse)
def update_status_rule(rule_id: int, payload: StatusRuleUpdatePayload) -> StatusRuleResponse:
    db.init_db()
    project = payload.project.strip()
    group_name = payload.group_name.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    if group_name not in ALL_GROUPS:
        raise HTTPException(status_code=400, detail="Неизвестная группа статуса")
    if not db.update_project_status_rule_group(rule_id, project, group_name):
        raise HTTPException(status_code=404, detail="Правило проекта не найдено")
    row = next(
        (item for item in db.list_project_status_rules(project) if item["id"] == rule_id),
        None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Правило проекта не найдено")
    return StatusRuleResponse(
        id=row["id"],
        pattern=row["pattern"],
        match_type=row["match_type"],
        group_name=row["group_name"],
        priority=row["priority"],
        source="project",
    )


@app.delete("/api/status-rules/{rule_id}")
def delete_status_rule(rule_id: int, project: str) -> dict[str, bool]:
    db.init_db()
    project = project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    if not db.delete_project_status_rule(rule_id, project):
        raise HTTPException(status_code=404, detail="Правило проекта не найдено")
    return {"deleted": True}


@app.get("/api/exports", response_model=list[ExportRecord])
def saved_exports(project: str) -> list[ExportRecord]:
    db.init_db()
    return [ExportRecord(**item) for item in list_exports(project.strip())]


@app.delete("/api/exports")
def delete_saved_export(project: str, export_number: int) -> dict[str, bool]:
    db.init_db()
    deleted = delete_analysis_export(project.strip(), export_number)
    if not deleted:
        raise HTTPException(status_code=404, detail="Выгрузка не найдена")
    return {"deleted": True}


@app.get("/api/summary/download")
def download_summary(project: str) -> FileResponse:
    db.init_db()
    path = write_project_summary(project.strip(), RUNS_DIR / "summaries")
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/compare/download")
def download_comparison(project: str) -> FileResponse:
    db.init_db()
    path = write_project_comparison(project.strip(), RUNS_DIR / "summaries")
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.post("/api/runs", response_model=UploadResponse)
def create_run(
    project: str = Form(...),
    lk_file: UploadFile = File(...),
    client_file: UploadFile = File(...),
) -> UploadResponse:
    _validate_excel(lk_file)
    _validate_excel(client_file)
    ensure_dirs()
    db.init_db()
    project = project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")

    run_id = uuid.uuid4().hex[:12]
    input_dir = RUNS_DIR / run_id / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    lk_path = input_dir / "lk.xlsx"
    client_path = input_dir / "client.xlsx"
    with lk_path.open("wb") as handle:
        shutil.copyfileobj(lk_file.file, handle)
    with client_path.open("wb") as handle:
        shutil.copyfileobj(client_file.file, handle)

    return UploadResponse(
        run_id=run_id,
        project=project,
        lk=_inspect_upload(lk_path, lk_file.filename or "lk.xlsx", "lk"),
        client=_inspect_upload(client_path, client_file.filename or "client.xlsx", "client"),
    )


@app.post("/api/runs/{run_id}/match", response_model=MatchResponse)
def run_match(run_id: str, payload: MatchPayload) -> MatchResponse:
    project = payload.project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    lk_mapping = _to_mapping(payload.lk_mapping)
    client_mapping = _to_mapping(payload.client_mapping)
    if not lk_mapping.lkid_column or not lk_mapping.source_column:
        raise HTTPException(status_code=400, detail="Для ЛК нужны LKID и полный источник")
    if not client_mapping.status_column:
        raise HTTPException(status_code=400, detail="Для клиента нужен статус")

    db.init_db()
    db.ensure_project(project)
    db.save_match_mapping(project, "lk", lk_mapping)
    db.save_match_mapping(project, "client", client_mapping)
    output = match_files(
        project,
        _input_path(run_id, "lk"),
        _input_path(run_id, "client"),
        lk_mapping,
        client_mapping,
        _output_dir(run_id),
    )
    return MatchResponse(filename=output.name, preview=_preview_workbook(output))


@app.post("/api/runs/{run_id}/match/jobs", response_model=JobResponse)
def queue_match(run_id: str, payload: MatchPayload) -> JobResponse:
    project = payload.project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    lk_mapping = _to_mapping(payload.lk_mapping)
    client_mapping = _to_mapping(payload.client_mapping)
    if not lk_mapping.lkid_column or not lk_mapping.source_column:
        raise HTTPException(status_code=400, detail="Для ЛК нужны LKID и полный источник")
    if not client_mapping.status_column:
        raise HTTPException(status_code=400, detail="Для клиента нужен статус")
    _input_path(run_id, "lk")
    db.init_db()
    db.ensure_project(project)
    db.save_match_mapping(project, "lk", lk_mapping)
    db.save_match_mapping(project, "client", client_mapping)
    job = db.create_processing_job(
        run_id,
        "match",
        {
            "project": project,
            "lk_mapping": payload.lk_mapping.model_dump(),
            "client_mapping": payload.client_mapping.model_dump(),
        },
    )
    _start_job_worker()
    return _job_response(job)


@app.post("/api/runs/{run_id}/analyze/setup", response_model=AnalyzeSetupResponse)
def analyze_setup(run_id: str, payload: AnalyzeSetupPayload) -> AnalyzeSetupResponse:
    match_file = _output_file(run_id, "match")
    mapping = _to_mapping(payload.mapping) if payload.mapping else detect_analyze_mapping(match_file)
    df = read_excel_sheet(match_file, mapping.sheet_name)
    unknown = unknown_statuses(df[mapping.status_column].tolist(), payload.project) if mapping.status_column else []
    return AnalyzeSetupResponse(
        filename=match_file.name,
        mapping=_from_mapping(mapping),
        sheets=_inspect_workbook(match_file),
        unknown_statuses=unknown,
        status_groups=ALL_GROUPS,
    )


@app.post("/api/runs/{run_id}/analyze", response_model=AnalyzeResponse)
def run_analyze(run_id: str, payload: AnalyzePayload) -> AnalyzeResponse:
    project = payload.project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    if payload.export_number <= 0:
        raise HTTPException(status_code=400, detail="Номер выгрузки должен быть положительным")
    if payload.period_start > payload.period_end:
        raise HTTPException(status_code=400, detail="Дата начала периода не может быть позже даты конца")
    mapping = _to_mapping(payload.mapping)
    if not mapping.status_column:
        raise HTTPException(status_code=400, detail="Для аналитики нужен статус")

    input_file = _output_file(run_id, "match")
    df = read_excel_sheet(input_file, mapping.sheet_name)
    unknown = unknown_statuses(df[mapping.status_column].tolist(), project)
    _validate_unknown_status_rules(unknown, payload.status_rules)

    db.init_db()
    db.ensure_project(project)
    db.save_column_mapping(project, mapping)
    for status, group in payload.status_rules.items():
        if status.strip() and group.strip():
            db.add_status_rule(
                StatusRule(
                    project_code=project,
                    pattern=status.strip(),
                    match_type="exact",
                    group_name=group.strip(),
                    priority=10,
                    comment="Добавлено через web",
                )
            )
    try:
        output = analyze_file(
            project,
            input_file,
            mapping,
            _output_dir(run_id),
            ExportMetadata(
                export_number=payload.export_number,
                period_start=payload.period_start.isoformat(),
                period_end=payload.period_end.isoformat(),
                analysis_date=payload.analysis_date.isoformat() if payload.analysis_date else None,
                source_file_name=payload.source_file_name or input_file.name,
            ),
            replace_export=payload.replace_export,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AnalyzeResponse(filename=output.name, preview=_preview_workbook(output))


@app.post("/api/runs/{run_id}/analyze/jobs", response_model=JobResponse)
def queue_analyze(run_id: str, payload: AnalyzePayload) -> JobResponse:
    project = payload.project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    if payload.export_number <= 0:
        raise HTTPException(status_code=400, detail="Номер выгрузки должен быть положительным")
    if payload.period_start > payload.period_end:
        raise HTTPException(status_code=400, detail="Дата начала периода не может быть позже даты конца")
    mapping = _to_mapping(payload.mapping)
    if not mapping.status_column:
        raise HTTPException(status_code=400, detail="Для аналитики нужен статус")
    input_file = _output_file(run_id, "match")
    df = read_excel_sheet(input_file, mapping.sheet_name)
    unknown = unknown_statuses(df[mapping.status_column].tolist(), project)
    _validate_unknown_status_rules(unknown, payload.status_rules)
    db.init_db()
    db.ensure_project(project)
    db.save_column_mapping(project, mapping)
    job = db.create_processing_job(run_id, "analyze", payload.model_dump(mode="json"))
    _start_job_worker()
    return _job_response(job)


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def processing_job(job_id: int) -> JobResponse:
    try:
        return _job_response(db.get_processing_job(job_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/jobs/{job_id}/preview", response_model=WorkbookPreview)
def processing_job_preview(job_id: int) -> WorkbookPreview:
    try:
        job = db.get_processing_job(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Задание ещё не завершено")
    return _preview_workbook(_output_file(str(job["run_id"]), str(job["kind"])))


@app.get("/api/runs/{run_id}/download/{kind}")
def download_file(run_id: str, kind: Literal["match", "analyze"]) -> FileResponse:
    path = _output_file(run_id, kind)
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.post("/api/runs/{run_id}/google-sheets", response_model=GoogleSheetsExportResponse)
def export_analysis_to_google_sheets(
    run_id: str,
    payload: GoogleSheetsExportPayload,
) -> GoogleSheetsExportResponse:
    project = payload.project.strip()
    if not project:
        raise HTTPException(status_code=400, detail="Укажите проект")
    try:
        result = export_workbook(_output_file(run_id, "analyze"), project, payload.analysis_date)
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось выгрузить в Google Таблицу: {exc}") from exc
    return GoogleSheetsExportResponse(
        spreadsheet_url=str(result["spreadsheet_url"]),
        spreadsheet_title=str(result["spreadsheet_title"]),
        sheet_titles=[str(sheet["title"]) for sheet in result["sheets"]],
    )
