from app.source_utils import extract_lkid_from_source


def test_extract_lkid_after_last_underscore():
    assert extract_lkid_from_source("baltlease.ru_300123") == "300123"
    assert extract_lkid_from_source("alfaleasing.ru_SMS_30169258") == "30169258"
    assert extract_lkid_from_source("alfaleasing.ru_78003024486") == "78003024486"
    assert extract_lkid_from_source("no_lkid_here") == ""
