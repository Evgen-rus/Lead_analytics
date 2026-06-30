import pandas as pd

from app.analytics import summarize


def test_summarize_excludes_do_not_count_group():
    df = pd.DataFrame(
        {
            "Канал": ["A", "A", "A"],
            "Группа статуса": ["Качественные", "Недозвон", "Не учитывать"],
        }
    )
    result = summarize(df, ["Канал"])
    assert result.loc[0, "Всего идентификаций"] == 2
    assert result.loc[0, "Сигнал спроса"] == 1
    assert result.loc[0, "Сигнал спроса %"] == 0.5


def test_summarize_places_demand_signal_after_already_bought_percent():
    df = pd.DataFrame(
        {
            "Группа статуса": ["Качественные", "Уже наши / уже купил", "Недозвон"],
        }
    )
    result = summarize(df, [])
    columns = list(result.columns)
    already_percent_index = columns.index("Уже наши / купил %")
    assert columns[already_percent_index + 1] == "Сигнал спроса"
    assert columns[already_percent_index + 2] == "Сигнал спроса %"
    assert columns[already_percent_index + 3] == "Недозвон"
