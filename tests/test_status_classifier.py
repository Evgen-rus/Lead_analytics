from app.status_classifier import classify, unknown_statuses


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
