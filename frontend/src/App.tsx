import { useMemo, useState } from "react";

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

export default function App() {
  const [project, setProject] = useState("Baltlease");
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
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canUpload = useMemo(() => project.trim() && lkFile && clientFile, [project, lkFile, clientFile]);

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
    if (!upload) return;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ filename: string; preview: WorkbookPreview }>(`${API}/runs/${upload.run_id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, mapping: analyzeMapping, status_rules: statusRules })
      });
      setAnalyzePreview(data.preview);
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
            <input value={project} onChange={(event) => setProject(event.target.value)} />
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
            <button onClick={runAnalyze} disabled={loading}>
              Сделать аналитику
            </button>
          </div>
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
