from __future__ import annotations

import json
import re
from pathlib import Path

from rapidfuzz import fuzz

from app import db
from app.config import RULES_DIR
from app.models import StatusRule


DEMAND_GROUPS = {"Качественные", "Рабочий потенциал", "Уже наши / уже купил"}
ALL_GROUPS = [
    "Качественные",
    "Рабочий потенциал",
    "Уже наши / уже купил",
    "Недозвон",
    "Некачественные",
    "Не подходит по гео",
    "Еще не звонили",
    "Не учитывать",
    "Требует проверки",
]


def load_json_rules(path: Path | None = None) -> list[StatusRule]:
    rules_path = path or RULES_DIR / "default_status_rules.json"
    if not rules_path.exists():
        return []
    data = json.loads(rules_path.read_text(encoding="utf-8"))
    rules = []
    for item in data:
        rules.append(
            StatusRule(
                pattern=item["pattern"],
                match_type=item.get("match_type", "contains"),
                group_name=item["group_name"],
                priority=int(item.get("priority", 100)),
                project_code=item.get("project_code"),
                comment=item.get("comment"),
            )
        )
    return rules


def load_db_rules(project: str) -> list[StatusRule]:
    db.init_db()
    rows = db.list_status_rules(project)
    return [
        StatusRule(
            pattern=row["pattern"],
            match_type=row["match_type"],
            group_name=row["group_name"],
            subgroup_name=row["subgroup_name"],
            comment=row["comment"],
            priority=row["priority"],
            project_code=row["project_code"],
        )
        for row in rows
    ]


def sorted_rules(project: str) -> list[StatusRule]:
    rules = load_db_rules(project) + load_json_rules()
    return sorted(
        rules,
        key=lambda rule: (
            0 if rule.project_code == project else 1 if rule.project_code else 2,
            rule.priority,
        ),
    )


def _match(rule: StatusRule, text: str, status_text: str) -> bool:
    value = text.casefold()
    status_value = status_text.casefold()
    pattern = rule.pattern.casefold()
    if rule.match_type == "exact":
        return status_value.strip() == pattern.strip()
    if rule.match_type == "contains":
        return pattern in value
    if rule.match_type == "regex":
        return re.search(rule.pattern, text, flags=re.IGNORECASE) is not None
    if rule.match_type == "fuzzy":
        return fuzz.partial_ratio(pattern, value) >= 88
    return False


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    try:
        if value != value:
            return True
    except TypeError:
        pass
    text = str(value).strip().casefold()
    return text in {"", "nan", "none", "<na>", "nat"}


def _clean_text(value: object) -> str:
    if _is_missing(value):
        return ""
    return str(value).strip()


def classify(status: object, comment: object = None, project: str = "") -> tuple[str, str]:
    status_text = _clean_text(status)
    comment_text = _clean_text(comment)
    text = " ".join(part for part in [status_text, comment_text] if part)
    if not text.strip():
        return "Не учитывать", "пустой статус"
    rules = sorted_rules(project)
    for rule in rules:
        if _match(rule, text, status_text):
            return rule.group_name, rule.pattern
    if re.search(r"[\w.\-]+@[\w.\-]+\.\w+", text):
        return "Рабочий потенциал", "email"
    return "Требует проверки", "нет правила"


def unknown_statuses(statuses: list[object], project: str) -> list[str]:
    result = []
    for value in sorted({_clean_text(status) for status in statuses if _clean_text(status)}):
        group, _ = classify(value, None, project)
        if group == "Требует проверки":
            result.append(value)
    return result
