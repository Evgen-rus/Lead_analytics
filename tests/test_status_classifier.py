from app.status_classifier import classify


def test_default_status_rules():
    assert classify("Заявка принята", project="x")[0] == "Качественные"
    assert classify("Отложенный спрос", project="x")[0] == "Рабочий потенциал"
    assert classify("Недозвон", project="x")[0] == "Недозвон"
    assert classify("Запрет звонка", project="x")[0] == "Некачественные"
    assert classify("совсем новый статус", project="x")[0] == "Требует проверки"
