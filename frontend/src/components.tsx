import { DragEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { API, projectQuery } from "./api";
import type {
  AnalyzeSetup,
  ExportRecord,
  FileInspect,
  Mapping,
  OperationStage,
  SheetPreview,
  StatusRulesData,
  Step,
  WorkbookPreview
} from "./types";

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

function fileLabel(file: File | null): string {
  if (!file) return "Файл не выбран";
  const sizeMb = file.size / 1024 / 1024;
  return `${file.name} · ${sizeMb >= 1 ? sizeMb.toFixed(1) : "<1"} МБ`;
}

function validExcelFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xlsx");
}

export function FileDropZone({
  label,
  file,
  disabled = false,
  onChange
}: {
  label: string;
  file: File | null;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function selectFile(nextFile: File | null) {
    if (nextFile && !validExcelFile(nextFile)) {
      setError("Нужен файл .xlsx");
      return;
    }
    setError("");
    onChange(nextFile);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="filePicker">
      <span>{label}</span>
      <label
        className={`dropZone ${dragging ? "dragging" : ""} ${file ? "hasFile" : ""}`}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          id={inputId}
          type="file"
          accept=".xlsx"
          disabled={disabled}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <span className="fileBadge">XLSX</span>
        <strong>{file ? file.name : "Выберите или перетащите файл"}</strong>
        <small>{fileLabel(file)}</small>
      </label>
      {error && <small className="fieldError">{error}</small>}
    </div>
  );
}

export function ProjectCombo({
  value,
  projects,
  disabled = false,
  onChange
}: {
  value: string;
  projects: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const normalized = value.trim().toLowerCase();
  const filtered = projects
    .filter((project) => !normalized || project.toLowerCase().includes(normalized))
    .slice(0, 12);
  const hasOptions = filtered.length > 0;

  function pickProject(project: string) {
    onChange(project);
    setOpen(false);
  }

  return (
    <div
      className="projectCombo"
      ref={wrapperRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <input
        value={value}
        disabled={disabled}
        placeholder="Введите проект или выберите сохраненный"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="comboMenu" role="listbox">
          {hasOptions ? (
            filtered.map((project) => (
              <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => pickProject(project)} key={project}>
                {project}
              </button>
            ))
          ) : (
            <div className="comboEmpty">Сохраненные проекты не найдены</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProcessProgress({
  active,
  stage,
  label,
  processedRows = 0,
  totalRows = 0,
  queued = false
}: {
  active: boolean;
  stage: OperationStage | null;
  label: string;
  processedRows?: number;
  totalRows?: number;
  queued?: boolean;
}) {
  if (!active || !stage) return null;
  const stages: { id: OperationStage; title: string }[] = [
    { id: "upload", title: "Загрузка" },
    { id: "read", title: "Чтение" },
    { id: "match", title: "Сопоставление" },
    { id: "prepare", title: "Подготовка аналитики" },
    { id: "done", title: "Готово" }
  ];
  const current = Math.max(0, stages.findIndex((item) => item.id === stage));
  const remaining = Math.max(0, stages.length - current - 1);
  const actualProgress = totalRows > 0 ? Math.min(100, (processedRows / totalRows) * 100) : null;

  return (
    <section className="processPanel" aria-live="polite">
      <div className="processHeader">
        <div>
          <h2>{label || stages[current].title}</h2>
          <p>
            {queued
              ? "Ожидает выполнения в очереди"
              : actualProgress !== null
                ? `${processedRows} из ${totalRows} строк`
                : remaining
                  ? `Осталось этапов: ${remaining}`
                  : "Завершаю обработку"}
          </p>
        </div>
        <div className="spinner" aria-hidden="true" />
      </div>
      <div className="processTrack" aria-hidden="true">
        <span style={{ width: `${actualProgress ?? ((current + 1) / stages.length) * 100}%` }} />
      </div>
      <div className="processSteps">
        {stages.map((item, index) => (
          <div className={`processStep ${index < current ? "done" : ""} ${index === current ? "active" : ""}`} key={item.id}>
            <span>{index + 1}</span>
            <strong>{item.title}</strong>
          </div>
        ))}
      </div>
    </section>
  );
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
              value={statusRules[status] ?? ""}
              onChange={(event) => onChange({ ...statusRules, [status]: event.target.value })}
            >
              <option value="" disabled>
                Выберите группу
              </option>
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

export function StatusRulesModal({
  open,
  setup,
  statusRules,
  loading,
  onChange,
  onCancel,
  onConfirm
}: {
  open: boolean;
  setup: AnalyzeSetup;
  statusRules: Record<string, string>;
  loading: boolean;
  onChange: (rules: Record<string, string>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const count = setup.unknown_statuses.length;
  const missingCount = setup.unknown_statuses.filter((status) => !statusRules[status]).length;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="status-modal-title">
      <section className="modalPanel">
        <div className="modalHeader">
          <div>
            <h2 id="status-modal-title">Проверь статусы перед аналитикой</h2>
            <p>{count} {count === 1 ? "статус требует" : "статуса требуют"} ручного выбора группы</p>
          </div>
          <button className="ghostButton iconButton" type="button" disabled={loading} onClick={onCancel} aria-label="Закрыть">
            x
          </button>
        </div>
        <div className="rulesGrid modalRules">
          {setup.unknown_statuses.map((status) => (
            <label className="ruleRow" key={status}>
              <span>{status}</span>
              <select
                value={statusRules[status] ?? ""}
                disabled={loading}
                onChange={(event) => onChange({ ...statusRules, [status]: event.target.value })}
              >
                <option value="" disabled>
                  Выберите группу
                </option>
                {setup.status_groups.map((group) => (
                  <option value={group} key={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {missingCount > 0 && (
          <p className="formHint">Осталось выбрать групп: {missingCount}</p>
        )}
        <div className="modalFooter">
          <button className="ghostButton" type="button" disabled={loading} onClick={onCancel}>
            Вернуться
          </button>
          <button type="button" disabled={loading || missingCount > 0} onClick={onConfirm}>
            Запустить аналитику
          </button>
        </div>
      </section>
    </div>
  );
}

export function StatusRulesManager({
  open,
  project,
  data,
  loading,
  onClose,
  onSave,
  onDelete
}: {
  open: boolean;
  project: string;
  data: StatusRulesData | null;
  loading: boolean;
  onClose: () => void;
  onSave: (ruleId: number, groupName: string) => Promise<void>;
  onDelete: (ruleId: number) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [deletingRule, setDeletingRule] = useState<number | null>(null);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (data?.project_rules ?? [])
          .filter((rule) => rule.id !== null)
          .map((rule) => [rule.id as number, rule.group_name])
      )
    );
  }, [data]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDeletingRule(null);
    }
  }, [open]);

  if (!open) return null;
  const query = search.trim().toLocaleLowerCase("ru");
  const matches = (pattern: string, group: string) =>
    !query ||
    pattern.toLocaleLowerCase("ru").includes(query) ||
    group.toLocaleLowerCase("ru").includes(query);
  const projectRules = (data?.project_rules ?? []).filter((rule) => matches(rule.pattern, rule.group_name));
  const systemRules = (data?.system_rules ?? []).filter((rule) => matches(rule.pattern, rule.group_name));

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="rules-manager-title">
      <section className="modalPanel rulesManagerModal">
        <div className="modalHeader">
          <div>
            <h2 id="rules-manager-title">Соответствия статусов</h2>
            <p>{project}</p>
          </div>
          <button className="ghostButton iconButton" type="button" disabled={loading} onClick={onClose} aria-label="Закрыть">
            x
          </button>
        </div>

        <label className="field rulesSearch">
          <span>Поиск по статусу или группе</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Начните вводить..." />
        </label>

        <div className="rulesSectionHeader">
          <div>
            <h2>Правила проекта</h2>
            <p>Изменения применяются только к будущим аналитикам</p>
          </div>
          <strong>{projectRules.length}</strong>
        </div>
        {projectRules.length === 0 ? (
          <div className="emptyState">
            <strong>Соответствия не найдены</strong>
            <span>{query ? "Измените строку поиска." : "Для этого проекта пока нет сохраненных соответствий."}</span>
          </div>
        ) : (
          <div className="tableWrap rulesTableWrap">
            <table className="rulesTable">
              <thead>
                <tr>
                  <th>Исходный статус</th>
                  <th>Группа</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {projectRules.map((rule) => {
                  const ruleId = rule.id as number;
                  const draft = drafts[ruleId] ?? rule.group_name;
                  const changed = draft !== rule.group_name;
                  return (
                    <tr key={ruleId}>
                      <td title={rule.pattern}>{rule.pattern}</td>
                      <td>
                        <select
                          value={draft}
                          disabled={loading}
                          onChange={(event) => setDrafts({ ...drafts, [ruleId]: event.target.value })}
                        >
                          {(data?.status_groups ?? []).map((group) => (
                            <option value={group} key={group}>{group}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="ruleActions">
                          <button
                            type="button"
                            disabled={loading || !changed}
                            onClick={() => onSave(ruleId, draft)}
                          >
                            Сохранить
                          </button>
                          <button
                            className="dangerButton"
                            type="button"
                            disabled={loading}
                            onClick={() => setDeletingRule(ruleId)}
                          >
                            Удалить
                          </button>
                        </div>
                        {deletingRule === ruleId && (
                          <div className="inlineConfirm">
                            <span>Удалить это соответствие?</span>
                            <button
                              className="dangerButton"
                              type="button"
                              disabled={loading}
                              onClick={async () => {
                                await onDelete(ruleId);
                                setDeletingRule(null);
                              }}
                            >
                              Да
                            </button>
                            <button
                              className="ghostButton"
                              type="button"
                              disabled={loading}
                              onClick={() => setDeletingRule(null)}
                            >
                              Нет
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rulesSectionHeader systemRulesHeader">
          <div>
            <h2>Системные правила</h2>
            <p>Используются автоматически и доступны только для просмотра</p>
          </div>
          <strong>{systemRules.length}</strong>
        </div>
        <div className="tableWrap rulesTableWrap systemRulesTableWrap">
          <table className="rulesTable">
            <thead>
              <tr>
                <th>Шаблон</th>
                <th>Группа</th>
                <th>Тип</th>
              </tr>
            </thead>
            <tbody>
              {systemRules.map((rule, index) => (
                <tr key={`${rule.source}-${rule.id ?? index}-${rule.pattern}`}>
                  <td title={rule.pattern}>{rule.pattern}</td>
                  <td>{rule.group_name}</td>
                  <td>{rule.match_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modalFooter">
          <span />
          <button className="ghostButton" type="button" disabled={loading} onClick={onClose}>Закрыть</button>
        </div>
      </section>
    </div>
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
          <p>{hasProject ? "Сохранённые аналитики выбранного проекта" : "Введите проект или выберите сохранённый"}</p>
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
        <div className="emptyState">
          <strong>Сохранённых выгрузок пока нет.</strong>
          <span>После первой аналитики здесь появятся периоды, файлы и ключевые показатели.</span>
        </div>
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
