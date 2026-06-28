from app.phone_utils import normalize_phone


def test_normalize_russian_phone_variants():
    assert normalize_phone("+7 (923) 123-45-67") == "79231234567"
    assert normalize_phone("8 923 123-45-67") == "79231234567"
    assert normalize_phone("9231234567") == "79231234567"
    assert normalize_phone("123") == ""
