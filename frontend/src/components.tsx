import { useMemo, useState } from "react";
import { API, projectQuery } from "./api";
import type { AnalyzeSetup, ExportRecord, FileInspect, Mapping, SheetPreview, Step, WorkbookPreview } from "./types";

type MappingFile = FileInspect | AnalyzeSetup;

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function activeSheet(file: MappingFile | WorkbookPreview | null, sheetName: string): SheetPreview | null {
  if (!file) return null;
  return file.sheets.find((sheet) => sheet.name === sheetName) ?? file.sheets[0] ?? null;
}

export function sheetColumns(file: MappingFile | null, mapping: Mapping): string[] {
  if (!file) return [];
  return file.sheets.find((sheet) => sheet.name === mapping.sheet_name)?.columns ?? [];
}

function sheetRowsLabel(sheet: SheetPreview): string {
  const shown = sheet.rows.length;
  return shown ? `${shown} строк в предпросмотре` : "нет строк в предпросмотре";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  return String(value);
}

function valueFromCheckSheet(workbook: WorkbookPreview, key: string): string {
  const sheet = workbook.sheets.find((item) => item.name === "Проверка");
  const row = sheet?.rows.find((item) => item["Показатель"] === key);
  return displayValue(row?.["Значение"]);
}

function firstRow(workbook: WorkbookPreview, sheetName: string): Record<string, unknown> {
  return workbook.sheets.find((item) => item.name === sheetName)?.rows[0] ?? {};
}

export function SelectField({
  label,
  value,
  columns,
  required = false,
  onChange
}: {
  label: string;
  value?: string | null;
  columns: string[];
  required?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Не выбрано</option>
        {columns.map((column) => (
          <option value={column} key={column}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; title: string }[] = [
    { id: "upload", title: "Файлы" },
    { id: "mapping", title: "Колонки" },
    { id: "analyze", title: "Аналитика" },
    { id: "done", title: "Результат" }
  ];
  const current = steps.findIndex((item) => item.id === step);

  return (
    <nav className="stepper" aria-label="Шаги обработки">
      {steps.map((item, index) => (
        <div className={`stepItem ${index === current ? "active" : ""} ${index < current ? "done" : ""}`} key={item.id}>
          <span>{index + 1}</span>
          <strong>{item.title}</strong>
        </div>
      ))}
    </nav>
  );
}

export function SheetTabs({
  sheets,
  value,
  onChange
}: {
  sheets: SheetPreview[];
  value: string;
  onChange: (sheetName: string) => void;
}) {
  if (sheets.length <= 1) return null;
  return (
    <div className="sheetTabs" role="tablist">
      {sheets.map((sheet) => (
        <button
          className={sheet.name === value ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={sheet.name === value}
          onClick={() => onChange(sheet.name)}
          key={sheet.name}
        >
          {sheet.name}
        </button>
      ))}
    </div>
  );
}

export function PreviewTable({ sheet }: { sheet: SheetPreview }) {
  const [query, setQuery] = useState("");
  const columns = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const selected = normalized ? sheet.columns.filter((column) => column.toLowerCase().includes(normalized)) : sheet.columns;
    return selected.slice(0, 14);
  }, [query, sheet.columns]);

  return (
    <div className="preview">
      <div className="previewHeader">
        <div>
          <div className="previewTitle">{sheet.name}</div>
          <p>{sheetRowsLabel(sheet)}</p>
        </div>
        <input
          className="columnSearch"
          value={query}
          placeholder="Поиск колонки"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.slice(0, 12).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
            {columns.length === 0 && (
              <tr>
                <td>Колонки не найдены</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MappingPanel({
  title,
  file,
  mapping,
  role,
  onChange
}: {
  title: string;
  file: MappingFile;
  mapping: Mapping;
  role: "lk" | "client" | "analyze";
  onChange: (mapping: Mapping) => void;
}) {
  const columns = sheetColumns(file, mapping);
  const active = activeSheet(file, mapping.sheet_name);

  function patch(update: Partial<Mapping>) {
    onChange({ ...mapping, ...update });
  }

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          <p>{file.filename}</p>
        </div>
      </div>
      <SheetTabs sheets={file.sheets} value={mapping.sheet_name} onChange={(sheetName) => patch({ sheet_name: sheetName })} />
      <div className="mappingGrid">
        <label className="field">
          <span>Лист *</span>
          <select value={mapping.sheet_name} onChange={(event) => patch({ sheet_name: event.target.value })}>
            {file.sheets.map((sheet) => (
              <option value={sheet.name} key={sheet.name}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
        {role === "lk" && (
          <>
            <SelectField label="LKID" value={mapping.lkid_column} columns={columns} required onChange={(value) => patch({ lkid_column: value })} />
            <SelectField label="Полный источник" value={mapping.source_column} columns={columns} required onChange={(value) => patch({ source_column: value })} />
            <SelectField label="Телефон" value={mapping.phone_column} columns={columns} onChange={(value) => patch({ phone_column: value })} />
            <SelectField label="Дата" value={mapping.date_column} columns={columns} onChange={(value) => patch({ date_column: value })} />
          </>
        )}
        {role === "client" && (
          <>
            <SelectField label="Статус" value={mapping.status_column} columns={columns} required onChange={(value) => patch({ status_column: value })} />
            <SelectField label="LKID" value={mapping.lkid_column} columns={columns} onChange={(value) => patch({ lkid_column: value })} />
            <SelectField label="Источник" value={mapping.source_column} columns={columns} onChange={(value) => patch({ source_column: value })} />
            <SelectField label="Телефон" value={mapping.phone_column} columns={columns} onChange={(value) => patch({ phone_column: value })} />
            <SelectField label="Дата" value={mapping.date_column} columns={columns} onChange={(value) => patch({ date_column: value })} />
            <SelectField label="Комментарий" value={mapping.comment_column} columns={columns} onChange={(value) => patch({ comment_column: value })} />
          </>
        )}
        {role === "analyze" && (
          <>
            <SelectField label="Статус" value={mapping.status_column} columns={columns} required onChange={(value) => patch({ status_column: value })} />
            <SelectField label="Полный источник" value={mapping.source_column} columns={columns} onChange={(value) => patch({ source_column: value })} />
            <SelectField label="Канал" value={mapping.channel_column} columns={columns} onChange={(value) => patch({ channel_column: value })} />
            <SelectField label="Дата" value={mapping.date_column} columns={columns} onChange={(value) => patch({ date_column: value })} />
            <SelectField label="Телефон" value={mapping.phone_column} columns={columns} onChange={(value) => patch({ phone_column: value })} />
            <SelectField label="Комментарий" value={mapping.comment_column} columns={columns} onChange={(value) => patch({ comment_column: value })} />
          </>
        )}
      </div>
      {active && <PreviewTable sheet={active} />}
    </section>
  );
}

export function WorkbookViewer({ title, workbook }: { title: string; workbook: WorkbookPreview }) {
  const [sheetName, setSheetName] = useState(workbook.sheets[0]?.name ?? "");
  const sheet = activeSheet(workbook, sheetName);

  return (
    <section className="panel">
      <div className="panelHeader compact">
        <div>
          <h2>{title}</h2>
          <p>{workbook.filename}</p>
        </div>
      </div>
      <SheetTabs sheets={workbook.sheets} value={sheet?.name ?? ""} onChange={setSheetName} />
      {sheet && <PreviewTable sheet={sheet} />}
    </section>
  );
}

export function MatchSummary({ workbook }: { workbook: WorkbookPreview }) {
  const total = valueFromCheckSheet(workbook, "Строк в ЛК");
  const matched = valueFromCheckSheet(workbook, "Сопоставлено");
  const unmatched = valueFromCheckSheet(workbook, "Не сопоставлено из ЛК");
  const duplicateRows = valueFromCheckSheet(workbook, "Дублей клиента");
  const matchedNumber = toNumber(matched);
  const totalNumber = toNumber(total);
  const rate = matchedNumber !== null && totalNumber ? matchedNumber / totalNumber : null;

  return (
    <div className="summaryGrid">
      <MetricCard label="Строк в ЛК" value={total || "0"} />
      <MetricCard label="Сопоставлено" value={matched || "0"} hint={rate !== null ? formatPercent(rate) : undefined} />
      <MetricCard label="Не найдено из ЛК" value={unmatched || "0"} />
      <MetricCard label="Дублей клиента" value={duplicateRows || "0"} />
    </div>
  );
}

export function AnalyzeSummary({ workbook }: { workbook: WorkbookPreview }) {
  const row = firstRow(workbook, "Итог");
  return (
    <div className="summaryGrid">
      <MetricCard label="Всего идентификаций" value={displayValue(row["Всего идентификаций"]) || "0"} />
      <MetricCard label="Качественные" value={displayValue(row["Качественные"]) || "0"} hint={formatMetric(row["Кач. %"])} />
      <MetricCard label="Недозвон" value={displayValue(row["Недозвон"]) || "0"} hint={formatMetric(row["Недозвон %"])} />
      <MetricCard label="Сигнал спроса" value={displayValue(row["Сигнал спроса"]) || "0"} hint={formatMetric(row["Сигнал спроса %"])} />
    </div>
  );
}

function formatMetric(value: unknown): string | undefined {
  const numeric = toNumber(value);
  return numeric === null ? undefined : formatPercent(numeric);
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metricCard">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function StatusRulesPanel({
  setup,
  statusRules,
  onChange
}: {
  setup: AnalyzeSetup;
  statusRules: Record<string, string>;
  onChange: (rules: Record<string, string>) => void;
}) {
  if (setup.unknown_statuses.length === 0) return null;
  return (
    <section className="panel">
      <div className="panelHeader compact">
        <div>
          <h2>Неизвестные статусы</h2>
          <p>Выбери группу для каждого статуса</p>
        </div>
      </div>
      <div className="rulesGrid">
        {setup.unknown_statuses.map((status) => (
          <label className="ruleRow" key={status}>
            <span>{status}</span>
            <select
              value={statusRules[status] ?? setup.status_groups[0]}
              onChange={(event) => onChange({ ...statusRules, [status]: event.target.value })}
            >
              {setup.status_groups.map((group) => (
                <option value={group} key={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

export function ExportHistory({
  project,
  exports,
  loading,
  deletingExport,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete
}: {
  project: string;
  exports: ExportRecord[];
  loading: boolean;
  deletingExport: number | null;
  onAskDelete: (exportNumber: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const hasProject = project.trim().length > 0;
  const summaryUrl = hasProject ? `${API}/summary/download?${projectQuery(project)}` : "#";
  const compareUrl = hasProject ? `${API}/compare/download?${projectQuery(project)}` : "#";

  return (
    <section className="panel historyPanel">
      <div className="panelHeader">
        <div>
          <h2>История выгрузок</h2>
          <p>{hasProject ? "Сохраненные аналитики выбранного проекта" : "Введите проект или выберите сохраненный"}</p>
        </div>
        <div className="actions">
          <a className={`download ${!exports.length ? "disabledLink" : ""}`} href={exports.length ? summaryUrl : "#"}>
            Скачать сводку
          </a>
          <a className={`download secondary ${exports.length < 2 ? "disabledLink" : ""}`} href={exports.length >= 2 ? compareUrl : "#"}>
            Сравнить
          </a>
        </div>
      </div>
      {exports.length === 0 ? (
        <div className="emptyState">Сохраненных выгрузок пока нет.</div>
      ) : (
        <div className="tableWrap historyWrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Период</th>
                <th>Дата анализа</th>
                <th>Файл</th>
                <th>Всего</th>
                <th>Недозвон</th>
                <th>Качественные</th>
                <th>Сигнал спроса</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exports.map((item) => (
                <tr key={item.export_number}>
                  <td>{item.export_number}</td>
                  <td>
                    {item.period_start} - {item.period_end}
                  </td>
                  <td>{item.analysis_date}</td>
                  <td>{item.source_file_name}</td>
                  <td>{item.total_count}</td>
                  <td>
                    {item.missed_count} / {formatPercent(item.missed_rate)}
                  </td>
                  <td>
                    {item.quality_count} / {formatPercent(item.quality_rate)}
                  </td>
                  <td>
                    {item.demand_count} / {formatPercent(item.demand_rate)}
                  </td>
                  <td>
                    <button className="dangerButton" disabled={loading} onClick={() => onAskDelete(item.export_number)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deletingExport !== null && (
        <div className="confirmBar">
          <span>Удалить сохраненную выгрузку №{deletingExport}?</span>
          <div className="actions">
            <button className="dangerButton" disabled={loading} onClick={onConfirmDelete}>
              Удалить
            </button>
            <button className="ghostButton" disabled={loading} onClick={onCancelDelete}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
