import pytest
from fastapi import HTTPException

from backend.app.main import _validate_unknown_status_rules


def test_unknown_status_rules_require_a_group_for_every_unknown_status():
    with pytest.raises(HTTPException, match="Выберите группу"):
        _validate_unknown_status_rules(["Новый статус", "Другой статус"], {"Новый статус": "Качественные"})


def test_unknown_status_rules_accept_complete_valid_assignment():
    _validate_unknown_status_rules(
        ["Новый статус", "Другой статус"],
        {"Новый статус": "Качественные", "Другой статус": "Недозвон"},
    )


def test_unknown_status_rules_reject_unknown_group():
    with pytest.raises(HTTPException, match="Неизвестная группа"):
        _validate_unknown_status_rules(["Новый статус"], {"Новый статус": "Другая группа"})
