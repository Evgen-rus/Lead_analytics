import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import DB_PATH, ensure_dirs
from app.models import ColumnMapping, StatusRule


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path | None = None) -> None:
    with connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT UNIQUE,
                project_name TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS column_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT NOT NULL,
                sheet_name TEXT NOT NULL,
                date_column TEXT,
                phone_column TEXT,
                channel_column TEXT,
                source_column TEXT,
                status_column TEXT NOT NULL,
                comment_column TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS status_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT,
                pattern TEXT NOT NULL,
                pattern_key TEXT,
                match_type TEXT NOT NULL,
                group_name TEXT NOT NULL,
                subgroup_name TEXT,
                comment TEXT,
                priority INTEGER DEFAULT 100,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS source_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT,
                source_value TEXT NOT NULL,
                normalized_source TEXT NOT NULL,
                comment TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS manual_flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT,
                pattern TEXT NOT NULL,
                flag_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS file_match_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT NOT NULL,
                file_role TEXT NOT NULL,
                sheet_name TEXT NOT NULL,
                lkid_column TEXT,
                phone_column TEXT,
                date_column TEXT,
                source_column TEXT,
                status_column TEXT,
                comment_column TEXT,
                project_column TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS analysis_exports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT NOT NULL,
                export_number INTEGER NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                analysis_date TEXT NOT NULL,
                source_file_name TEXT NOT NULL,
                report_file_name TEXT,
                total_count INTEGER NOT NULL DEFAULT 0,
                missed_count INTEGER NOT NULL DEFAULT 0,
                missed_rate REAL NOT NULL DEFAULT 0,
                quality_count INTEGER NOT NULL DEFAULT 0,
                quality_rate REAL NOT NULL DEFAULT 0,
                demand_count INTEGER NOT NULL DEFAULT 0,
                demand_rate REAL NOT NULL DEFAULT 0,
                metrics_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_code, export_number)
            );
            CREATE TABLE IF NOT EXISTS analysis_export_breakdowns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                export_id INTEGER NOT NULL,
                breakdown_type TEXT NOT NULL,
                dimension_1 TEXT,
                dimension_2 TEXT,
                total_count INTEGER NOT NULL DEFAULT 0,
                missed_count INTEGER NOT NULL DEFAULT 0,
                missed_rate REAL NOT NULL DEFAULT 0,
                quality_count INTEGER NOT NULL DEFAULT 0,
                quality_rate REAL NOT NULL DEFAULT 0,
                demand_count INTEGER NOT NULL DEFAULT 0,
                demand_rate REAL NOT NULL DEFAULT 0,
                metrics_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(export_id) REFERENCES analysis_exports(id) ON DELETE CASCADE
            );
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(status_rules)")}
        if "pattern_key" not in columns:
            conn.execute("ALTER TABLE status_rules ADD COLUMN pattern_key TEXT")
        conn.execute("DROP INDEX IF EXISTS uq_status_rules_project_pattern")
        rows = conn.execute(
            """
            SELECT id, project_code, pattern
            FROM status_rules
            ORDER BY priority ASC, id ASC
            """
        ).fetchall()
        seen: set[tuple[str, str]] = set()
        for row in rows:
            pattern_key = normalize_status_pattern(row["pattern"])
            project = row["project_code"]
            key = (project, pattern_key) if project is not None else None
            if key is not None and key in seen:
                conn.execute("DELETE FROM status_rules WHERE id = ?", (row["id"],))
                continue
            if key is not None:
                seen.add(key)
            conn.execute(
                "UPDATE status_rules SET pattern_key = ? WHERE id = ?",
                (pattern_key, row["id"]),
            )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_status_rules_project_pattern
            ON status_rules(project_code, pattern_key)
            WHERE project_code IS NOT NULL
            """
        )


def now_text() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalize_status_pattern(pattern: str) -> str:
    return pattern.strip().casefold()


def ensure_project(project: str) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO projects(project_code, project_name, created_at)
            VALUES (?, ?, ?)
            """,
            (project, project, now_text()),
        )


def list_projects() -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT project_code FROM projects
            ORDER BY project_code COLLATE NOCASE ASC
            """
        ).fetchall()
    return [row["project_code"] for row in rows]


def get_column_mapping(project: str) -> ColumnMapping | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM column_mappings
            WHERE project_code = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (project,),
        ).fetchone()
    if not row:
        return None
    return ColumnMapping(
        sheet_name=row["sheet_name"],
        date_column=row["date_column"],
        phone_column=row["phone_column"],
        channel_column=row["channel_column"],
        source_column=row["source_column"],
        status_column=row["status_column"],
        comment_column=row["comment_column"],
    )


def save_column_mapping(project: str, mapping: ColumnMapping) -> None:
    stamp = now_text()
    with connect() as conn:
        conn.execute("DELETE FROM column_mappings WHERE project_code = ?", (project,))
        conn.execute(
            """
            INSERT INTO column_mappings(
                project_code, sheet_name, date_column, phone_column, channel_column,
                source_column, status_column, comment_column, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project,
                mapping.sheet_name,
                mapping.date_column,
                mapping.phone_column,
                mapping.channel_column,
                mapping.source_column,
                mapping.status_column,
                mapping.comment_column,
                stamp,
                stamp,
            ),
        )


def get_match_mapping(project: str, file_role: str) -> ColumnMapping | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM file_match_mappings
            WHERE project_code = ? AND file_role = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (project, file_role),
        ).fetchone()
    if not row:
        return None
    return ColumnMapping(
        sheet_name=row["sheet_name"],
        lkid_column=row["lkid_column"],
        phone_column=row["phone_column"],
        date_column=row["date_column"],
        source_column=row["source_column"],
        status_column=row["status_column"],
        comment_column=row["comment_column"],
        project_column=row["project_column"],
    )


def save_match_mapping(project: str, file_role: str, mapping: ColumnMapping) -> None:
    stamp = now_text()
    with connect() as conn:
        conn.execute(
            "DELETE FROM file_match_mappings WHERE project_code = ? AND file_role = ?",
            (project, file_role),
        )
        conn.execute(
            """
            INSERT INTO file_match_mappings(
                project_code, file_role, sheet_name, lkid_column, phone_column,
                date_column, source_column, status_column, comment_column,
                project_column, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project,
                file_role,
                mapping.sheet_name,
                mapping.lkid_column,
                mapping.phone_column,
                mapping.date_column,
                mapping.source_column,
                mapping.status_column,
                mapping.comment_column,
                mapping.project_column,
                stamp,
                stamp,
            ),
        )


def add_status_rule(rule: StatusRule) -> None:
    stamp = now_text()
    pattern_key = normalize_status_pattern(rule.pattern)
    with connect() as conn:
        if rule.project_code is not None:
            existing = conn.execute(
                """
                SELECT id FROM status_rules
                WHERE project_code = ?
                  AND pattern_key = ?
                ORDER BY priority ASC, id ASC
                LIMIT 1
                """,
                (rule.project_code, pattern_key),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE status_rules
                    SET pattern = ?, pattern_key = ?, match_type = ?, group_name = ?, subgroup_name = ?,
                        comment = ?, priority = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        rule.pattern,
                        pattern_key,
                        rule.match_type,
                        rule.group_name,
                        rule.subgroup_name,
                        rule.comment,
                        rule.priority,
                        stamp,
                        existing["id"],
                    ),
                )
                return
        conn.execute(
            """
            INSERT INTO status_rules(
                project_code, pattern, pattern_key, match_type, group_name,
                subgroup_name, comment, priority, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rule.project_code,
                rule.pattern,
                pattern_key,
                rule.match_type,
                rule.group_name,
                rule.subgroup_name,
                rule.comment,
                rule.priority,
                stamp,
                stamp,
            ),
        )


def list_status_rules(project: str | None = None) -> list[sqlite3.Row]:
    with connect() as conn:
        if project:
            return list(
                conn.execute(
                    """
                    SELECT * FROM status_rules
                    WHERE project_code IS NULL OR project_code = ?
                    ORDER BY project_code DESC, priority ASC, id ASC
                    """,
                    (project,),
                )
            )
        return list(conn.execute("SELECT * FROM status_rules ORDER BY id ASC"))


def list_project_status_rules(project: str) -> list[sqlite3.Row]:
    with connect() as conn:
        return list(
            conn.execute(
                """
                SELECT * FROM status_rules
                WHERE project_code = ?
                ORDER BY pattern COLLATE NOCASE ASC, id ASC
                """,
                (project,),
            )
        )


def list_global_status_rules() -> list[sqlite3.Row]:
    with connect() as conn:
        return list(
            conn.execute(
                """
                SELECT * FROM status_rules
                WHERE project_code IS NULL
                ORDER BY priority ASC, id ASC
                """
            )
        )


def update_project_status_rule_group(rule_id: int, project: str, group_name: str) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            """
            UPDATE status_rules
            SET group_name = ?, updated_at = ?
            WHERE id = ? AND project_code = ?
            """,
            (group_name, now_text(), rule_id, project),
        )
    return cursor.rowcount > 0


def delete_project_status_rule(rule_id: int, project: str) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            "DELETE FROM status_rules WHERE id = ? AND project_code = ?",
            (rule_id, project),
        )
    return cursor.rowcount > 0


def update_status_rule(rule_id: int, **fields: str | int | None) -> None:
    allowed = {"pattern", "match_type", "group_name", "subgroup_name", "comment", "priority"}
    assignments = []
    values: list[str | int | None] = []
    for key, value in fields.items():
        if key in allowed and value is not None:
            assignments.append(f"{key} = ?")
            values.append(value)
            if key == "pattern":
                assignments.append("pattern_key = ?")
                values.append(normalize_status_pattern(str(value)))
    if not assignments:
        return
    assignments.append("updated_at = ?")
    values.append(now_text())
    values.append(rule_id)
    with connect() as conn:
        conn.execute(f"UPDATE status_rules SET {', '.join(assignments)} WHERE id = ?", values)


def delete_status_rule(rule_id: int | None = None, project: str | None = None, pattern: str | None = None) -> None:
    with connect() as conn:
        if rule_id is not None:
            conn.execute("DELETE FROM status_rules WHERE id = ?", (rule_id,))
        elif project and pattern:
            conn.execute(
                "DELETE FROM status_rules WHERE project_code = ? AND pattern = ?",
                (project, pattern),
            )
