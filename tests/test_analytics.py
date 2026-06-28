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
