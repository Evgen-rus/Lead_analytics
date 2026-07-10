# Lead analytics

Локальный Python-инструмент для сопоставления выгрузок LeadRecord с клиентскими Excel-файлами и последующего анализа статусов.

## Установка

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.cli init-db
```

## Локальный веб-интерфейс

Backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

После запуска откройте `http://localhost:5174`.

Порты `8001` (backend) и `5174` (frontend) выбраны специально, чтобы не конфликтовать
с другим локальным проектом на `8000` / `5173`.

В веб-интерфейсе можно загрузить файл из ЛК и файл клиента, проверить найденные колонки,
запустить сопоставление, выбрать группы для неизвестных статусов, посмотреть предпросмотр
листов и скачать готовые Excel-файлы.

## Сопоставление файлов

```powershell
.\.venv\Scripts\python.exe -m app.cli match --project "LR001 Client" --lk-file "data/input/lk.xlsx" --client-file "data/input/client.xlsx" --interactive
```

Результат сохраняется в `data/output/<project>_сопоставление.xlsx`.

Для клиента без отдельного `LKID` и телефона используйте колонку источника/UTM: инструмент умеет извлекать `LKID` после последнего `_`.

## Анализ файла

```powershell
.\.venv\Scripts\python.exe -m app.cli analyze "data/output/LR001_Client_сопоставление.xlsx" --project "LR001 Client" --interactive
```

Результат сохраняется в `data/output/<project>_аналитика.xlsx`.

## История выгрузок и сводка проекта

В веб-интерфейсе перед запуском аналитики нужно указать номер выгрузки и период данных через календарь. Дата анализа ставится автоматически текущей датой, но ее можно изменить вручную. После успешного анализа агрегированные показатели сохраняются в SQLite `data/analytics.db`.

Одна выгрузка хранится как отдельный срез проекта. Сводка и сравнение строятся из SQLite: проценты используются как основной показатель эффективности, количества показываются как объем выборки.

Служебные CLI-команды:

```powershell
.\.venv\Scripts\python.exe -m app.cli analyze "data/output/file.xlsx" --project "Project" --export-number 1 --period-from 2026-06-01 --period-to 2026-06-07 --auto
.\.venv\Scripts\python.exe -m app.cli project-summary --project "Project"
.\.venv\Scripts\python.exe -m app.cli compare-exports --project "Project"
.\.venv\Scripts\python.exe -m app.cli delete-export --project "Project" --export-number 1
```

## Inspect

```powershell
.\.venv\Scripts\python.exe -m app.cli inspect "data/input/file.xlsx" --project "LR001 Client"
```

Команда показывает листы, первые строки, предполагаемые колонки, каналы, источники и топ статусов.

## Правила статусов

```powershell
.\.venv\Scripts\python.exe -m app.cli add-rule --project "LR001 Client" --pattern "Запрет звонка" --group "Некачественные" --match-type exact
.\.venv\Scripts\python.exe -m app.cli list-rules --project "LR001 Client"
.\.venv\Scripts\python.exe -m app.cli update-rule --id 12 --group "Недозвон"
.\.venv\Scripts\python.exe -m app.cli delete-rule --id 12
```

Проектом считается полная строка `--project`, например `LR001 Client`. Она не разбивается на код и имя.

## Структура данных

Входные файлы удобно складывать в `data/input`, результаты CLI появляются в `data/output`,
временные файлы веб-интерфейса хранятся в `data/runs`, база правил находится в `data/analytics.db`.

## Будущее расширение

Модуль `app/google_sheets.py` оставлен как заглушка под будущую выгрузку в Google Sheets.
