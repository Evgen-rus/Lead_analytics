from app import status_classifier
from app.status_classifier import classify, sorted_rules, unknown_statuses


def test_default_status_rules():
    assert classify("Заявка принята", project="x")[0] == "Качественные"
    assert classify("Отложенный спрос", project="x")[0] == "Рабочий потенциал"
    assert classify("Недозвон", project="x")[0] == "Недозвон"
    assert classify("Запрет звонка", project="x")[0] == "Некачественные"
    assert classify("совсем новый статус", project="x")[0] == "Требует проверки"


def test_missing_statuses_are_not_counted():
    assert classify(None, project="x")[0] == "Не учитывать"
    assert classify("", project="x")[0] == "Не учитывать"
    assert classify(float("nan"), project="x")[0] == "Не учитывать"
    assert classify("nan", project="x")[0] == "Не учитывать"
    assert unknown_statuses([None, "", float("nan"), "nan", "совсем новый статус"], "x") == [
        "совсем новый статус"
    ]


def test_classify_uses_preloaded_rules_without_reloading(monkeypatch):
    rules = sorted_rules("x")

    def unexpected_reload(project):
        raise AssertionError(f"Правила не должны загружаться повторно для {project}")

    monkeypatch.setattr(status_classifier, "sorted_rules", unexpected_reload)

    assert classify("Заявка принята", project="x", rules=rules)[0] == "Качественные"
