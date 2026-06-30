import { useEffect, useMemo, useState } from "react";

const API = "/api";

type Mapping = {
  sheet_name: string;
  date_column?: string | null;
  phone_column?: string | null;
  channel_column?: string | null;
  source_column?: string | null;
  status_column?: string | null;
  comment_column?: string | null;
  lkid_column?: string | null;
  project_column?: string | null;
};

type SheetPreview = {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

type FileInspect = {
  filename: string;
  detected: Mapping;
  sheets: SheetPreview[];
};

type UploadResponse = {
  run_id: string;
  project: string;
  lk: FileInspect;
  client: FileInspect;
};

type WorkbookPreview = {
  filename: string;
  sheets: SheetPreview[];
};

type ExportRecord = {
  export_number: number;
  period_start: string;
  period_end: string;
  analysis_date: string;
  source_file_name: string;
  total_count: number;
  missed_count: number;
  missed_rate: number;
  quality_count: number;
  quality_rate: number;
  demand_count: number;
  demand_rate: number;
};

type AnalyzeSetup = {
  filename: string;
  mapping: Mapping;
  sheets: SheetPreview[];
  unknown_statuses: string[];
  status_groups: string[];
};

type Step = "upload" | "mapping" | "matched" | "analyze" | "done";

const emptyMapping: Mapping = { sheet_name: "" };

function sheetColumns(file: FileInspect | AnalyzeSetup | null, mapping: Mapping): string[] {
  if (!file) return [];
  return file.sheets.find((sheet) => sheet.name === mapping.sheet_name)?.columns ?? [];
}

function activeSheet(file: FileInspect | AnalyzeSetup | WorkbookPreview | null, sheetName: string): SheetPreview | null {
  if (!file) return null;
  return file.sheets.find((sheet) => sheet.name === sheetName) ?? file.sheets[0] ?? null;
}

function normalizeMapping(mapping: Mapping, sheetName: string): Mapping {
  return { ...mapping, sheet_name: mapping.sheet_name || sheetName };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function projectQuery(project: string): string {
  return `project=${encodeURIComponent(project.trim())}`;
}

async function jsonRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || `Ошибка запроса: ${response.status}`);
  }
  return response.json();
}

function SelectField({
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

function MappingPanel({
  title,
  file,
  mapping,
  role,
  onChange
}: {
  title: string;
  file: FileInspect | AnalyzeSetup;
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

function PreviewTable({ sheet }: { sheet: SheetPreview }) {
  const columns = sheet.columns.slice(0, 12);
  return (
    <div className="preview">
      <div className="previewTitle">{sheet.name}</div>
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
            {sheet.rows.slice(0, 10).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkbookViewer({ title, workbook }: { title: string; workbook: WorkbookPreview }) {
  const [sheetName, setSheetName] = useState(workbook.sheets[0]?.name ?? "");
  const sheet = activeSheet(workbook, sheetName);

  return (
    <section className="panel">
      <div className="panelHeader compact">
        <div>
          <h2>{title}</h2>
          <p>{workbook.filename}</p>
        </div>
        <select value={sheet?.name ?? ""} onChange={(event) => setSheetName(event.target.value)}>
          {workbook.sheets.map((item) => (
            <option value={item.name} key={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {sheet && <PreviewTable sheet={sheet} />}
    </section>
  );
}

function ExportHistory({
  project,
  exports,
  loading,
  onDelete
}: {
  project: string;
  exports: ExportRecord[];
  loading: boolean;
  onDelete: (exportNumber: number) => void;
}) {
  const hasProject = project.trim().length > 0;
  const summaryUrl = hasProject ? `${API}/summary/download?${projectQuery(project)}` : "#";
  const compareUrl = hasProject ? `${API}/compare/download?${projectQuery(project)}` : "#";

  return (
    <section className="panel">
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
                    <button className="dangerButton" disabled={loading} onClick={() => onDelete(item.export_number)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [savedExports, setSavedExports] = useState<ExportRecord[]>([]);
  const [lkFile, setLkFile] = useState<File | null>(null);
  const [clientFile, setClientFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [lkMapping, setLkMapping] = useState<Mapping>(emptyMapping);
  const [clientMapping, setClientMapping] = useState<Mapping>(emptyMapping);
  const [matchPreview, setMatchPreview] = useState<WorkbookPreview | null>(null);
  const [analyzeSetup, setAnalyzeSetup] = useState<AnalyzeSetup | null>(null);
  const [analyzeMapping, setAnalyzeMapping] = useState<Mapping>(emptyMapping);
  const [statusRules, setStatusRules] = useState<Record<string, string>>({});
  const [analyzePreview, setAnalyzePreview] = useState<WorkbookPreview | null>(null);
  const [exportNumber, setExportNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [analysisDate, setAnalysisDate] = useState(todayIso());
  const [replaceExport, setReplaceExport] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canUpload = useMemo(() => project.trim() && lkFile && clientFile, [project, lkFile, clientFile]);
  const canAnalyze = useMemo(
    () => upload && analyzeMapping.status_column && exportNumber && periodStart && periodEnd,
    [upload, analyzeMapping.status_column, exportNumber, periodStart, periodEnd]
  );

  useEffect(() => {
    refreshProjects();
  }, []);

  useEffect(() => {
    if (project.trim()) {
      refreshExports(project);
    } else {
      setSavedExports([]);
    }
  }, [project]);

  async function refreshProjects() {
    try {
      const data = await jsonRequest<string[]>(`${API}/projects`, { method: "GET" });
      setProjects(data);
    } catch {
      setProjects([]);
    }
  }

  async function refreshExports(projectValue = project) {
    if (!projectValue.trim()) return;
    try {
      const data = await jsonRequest<ExportRecord[]>(`${API}/exports?${projectQuery(projectValue)}`, { method: "GET" });
      setSavedExports(data);
    } catch {
      setSavedExports([]);
    }
  }

  async function uploadFiles() {
    if (!canUpload) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("project", project.trim());
      form.append("lk_file", lkFile!);
      form.append("client_file", clientFile!);
      const data = await jsonRequest<UploadResponse>(`${API}/runs`, { method: "POST", body: form });
      setUpload(data);
      refreshProjects();
      setLkMapping(normalizeMapping(data.lk.detected, data.lk.sheets[0]?.name ?? ""));
      setClientMapping(normalizeMapping(data.client.detected, data.client.sheets[0]?.name ?? ""));
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файлы");
    } finally {
      setLoading(false);
    }
  }

  async function runMatch() {
    if (!upload) return;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ filename: string; preview: WorkbookPreview }>(`${API}/runs/${upload.run_id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, lk_mapping: lkMapping, client_mapping: clientMapping })
      });
      setMatchPreview(data.preview);
      setStep("matched");
      const setup = await jsonRequest<AnalyzeSetup>(`${API}/runs/${upload.run_id}/analyze/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project })
      });
      setAnalyzeSetup(setup);
      setAnalyzeMapping(normalizeMapping(setup.mapping, setup.sheets[0]?.name ?? ""));
      setStatusRules(Object.fromEntries(setup.unknown_statuses.map((status) => [status, setup.status_groups[0] ?? "Качественные"])));
      setStep("analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сопоставить файлы");
    } finally {
      setLoading(false);
    }
  }

  async function runAnalyze() {
    if (!upload || !canAnalyze) return;
    setLoading(true);
    setError("");
    try {
      const numberValue = Number(exportNumber);
      if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new Error("Укажите положительный номер выгрузки");
      }
      const data = await jsonRequest<{ filename: string; preview: WorkbookPreview }>(`${API}/runs/${upload.run_id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          mapping: analyzeMapping,
          status_rules: statusRules,
          export_number: numberValue,
          period_start: periodStart,
          period_end: periodEnd,
          analysis_date: analysisDate || null,
          source_file_name: clientFile?.name || matchPreview?.filename || upload.client.filename,
          replace_export: replaceExport
        })
      });
      setAnalyzePreview(data.preview);
      await refreshProjects();
      await refreshExports(project);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сделать аналитику");
    } finally {
      setLoading(false);
    }
  }

  function downloadUrl(kind: "match" | "analyze") {
    return upload ? `${API}/runs/${upload.run_id}/download/${kind}` : "#";
  }

  async function deleteExport(exportNumberValue: number) {
    if (!project.trim()) return;
    const confirmed = window.confirm(`Удалить сохраненную выгрузку №${exportNumberValue}?`);
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      await jsonRequest<{ deleted: boolean }>(`${API}/exports?${projectQuery(project)}&export_number=${exportNumberValue}`, {
        method: "DELETE"
      });
      await refreshExports(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить выгрузку");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <h1>Lead Analytics</h1>
          <p>Локальное сопоставление и аналитика Excel-файлов</p>
        </div>
        <div className="status">{loading ? "Выполняется..." : "Готово к работе"}</div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Файлы</h2>
            <p>Загрузи файл из ЛК и файл клиента</p>
          </div>
          <button onClick={uploadFiles} disabled={!canUpload || loading}>
            Загрузить
          </button>
        </div>
        <div className="uploadGrid">
          <label className="field">
            <span>Проект</span>
            <input
              value={project}
              list="project-options"
              placeholder="Введите проект или выберите сохраненный"
              onChange={(event) => setProject(event.target.value)}
            />
            <datalist id="project-options">
              {projects.map((item) => (
                <option value={item} key={item} />
              ))}
            </datalist>
          </label>
          <label className="fileField">
            <span>Файл из ЛК</span>
            <input type="file" accept=".xlsx" onChange={(event) => setLkFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="fileField">
            <span>Файл клиента</span>
            <input type="file" accept=".xlsx" onChange={(event) => setClientFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>
      </section>

      <ExportHistory project={project} exports={savedExports} loading={loading} onDelete={deleteExport} />

      {step !== "upload" && upload && (
        <>
          <div className="sectionBar">
            <span>Колонки для сопоставления</span>
            <button onClick={runMatch} disabled={loading}>
              Сопоставить
            </button>
          </div>
          <div className="twoColumn">
            <MappingPanel title="ЛК" file={upload.lk} mapping={lkMapping} role="lk" onChange={setLkMapping} />
            <MappingPanel title="Клиент" file={upload.client} mapping={clientMapping} role="client" onChange={setClientMapping} />
          </div>
        </>
      )}

      {matchPreview && (
        <>
          <div className="downloadRow">
            <a className="download" href={downloadUrl("match")}>
              Скачать сопоставление
            </a>
          </div>
          <WorkbookViewer title="Предпросмотр сопоставления" workbook={matchPreview} />
        </>
      )}

      {analyzeSetup && (
        <>
          <div className="sectionBar">
            <span>Аналитика</span>
            <button onClick={runAnalyze} disabled={!canAnalyze || loading}>
              Сделать аналитику
            </button>
          </div>
          <section className="panel">
            <div className="panelHeader compact">
              <div>
                <h2>Параметры выгрузки</h2>
                <p>Эти данные сохраняются в истории проекта и используются для сводки</p>
              </div>
            </div>
            <div className="exportMetaGrid">
              <label className="field">
                <span>Номер выгрузки *</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={exportNumber}
                  onChange={(event) => setExportNumber(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Период от *</span>
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </label>
              <label className="field">
                <span>Период до *</span>
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              </label>
              <label className="field">
                <span>Дата анализа</span>
                <input type="date" value={analysisDate} onChange={(event) => setAnalysisDate(event.target.value)} />
              </label>
              <label className="checkField">
                <input type="checkbox" checked={replaceExport} onChange={(event) => setReplaceExport(event.target.checked)} />
                <span>Заменить выгрузку с таким номером</span>
              </label>
            </div>
          </section>
          <MappingPanel title="Колонки аналитики" file={analyzeSetup} mapping={analyzeMapping} role="analyze" onChange={setAnalyzeMapping} />
          {analyzeSetup.unknown_statuses.length > 0 && (
            <section className="panel">
              <div className="panelHeader compact">
                <div>
                  <h2>Неизвестные статусы</h2>
                  <p>Выбери группу для каждого статуса</p>
                </div>
              </div>
              <div className="rulesGrid">
                {analyzeSetup.unknown_statuses.map((status) => (
                  <label className="ruleRow" key={status}>
                    <span>{status}</span>
                    <select
                      value={statusRules[status] ?? analyzeSetup.status_groups[0]}
                      onChange={(event) => setStatusRules({ ...statusRules, [status]: event.target.value })}
                    >
                      {analyzeSetup.status_groups.map((group) => (
                        <option value={group} key={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {analyzePreview && (
        <>
          <div className="downloadRow">
            <a className="download" href={downloadUrl("analyze")}>
              Скачать аналитику
            </a>
          </div>
          <WorkbookViewer title="Предпросмотр аналитики" workbook={analyzePreview} />
        </>
      )}
    </main>
  );
}
