import { useEffect, useMemo, useState } from "react";
import {
  deleteExportRequest,
  downloadUrl,
  fetchAnalyzeSetup,
  fetchExports,
  fetchProjects,
  runAnalyzeRequest,
  runMatchRequest,
  uploadRun
} from "./api";
import {
  AnalyzeSummary,
  ExportHistory,
  MappingPanel,
  MatchSummary,
  StatusRulesPanel,
  Stepper,
  WorkbookViewer
} from "./components";
import type { AnalyzeSetup, ExportRecord, Mapping, Step, UploadResponse, WorkbookPreview } from "./types";

const emptyMapping: Mapping = { sheet_name: "" };

function normalizeMapping(mapping: Mapping, sheetName: string): Mapping {
  return { ...mapping, sheet_name: mapping.sheet_name || sheetName };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileName(file: File | null): string {
  return file?.name ?? "Файл не выбран";
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
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [deletingExport, setDeletingExport] = useState<number | null>(null);

  const canUpload = useMemo(() => project.trim() && lkFile && clientFile, [project, lkFile, clientFile]);
  const canMatch = useMemo(
    () => upload && lkMapping.lkid_column && lkMapping.source_column && clientMapping.status_column,
    [upload, lkMapping.lkid_column, lkMapping.source_column, clientMapping.status_column]
  );
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
      setProjects(await fetchProjects());
    } catch {
      setProjects([]);
    }
  }

  async function refreshExports(projectValue = project) {
    if (!projectValue.trim()) return;
    try {
      setSavedExports(await fetchExports(projectValue));
    } catch {
      setSavedExports([]);
    }
  }

  function resetRunOutputs() {
    setUpload(null);
    setLkMapping(emptyMapping);
    setClientMapping(emptyMapping);
    setMatchPreview(null);
    setAnalyzeSetup(null);
    setAnalyzeMapping(emptyMapping);
    setStatusRules({});
    setAnalyzePreview(null);
    setStep("upload");
  }

  async function uploadFiles() {
    if (!canUpload || !lkFile || !clientFile) return;
    setLoading(true);
    setOperation("Загружаю и читаю Excel-файлы");
    setError("");
    try {
      const data = await uploadRun(project, lkFile, clientFile);
      setUpload(data);
      setMatchPreview(null);
      setAnalyzeSetup(null);
      setAnalyzePreview(null);
      setLkMapping(normalizeMapping(data.lk.detected, data.lk.sheets[0]?.name ?? ""));
      setClientMapping(normalizeMapping(data.client.detected, data.client.sheets[0]?.name ?? ""));
      await refreshProjects();
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файлы");
    } finally {
      setLoading(false);
      setOperation("");
    }
  }

  async function runMatch() {
    if (!upload || !canMatch) return;
    setLoading(true);
    setOperation("Сопоставляю строки и готовлю Excel");
    setError("");
    try {
      const data = await runMatchRequest(upload.run_id, project, lkMapping, clientMapping);
      setMatchPreview(data.preview);
      setOperation("Определяю колонки аналитики и неизвестные статусы");
      const setup = await fetchAnalyzeSetup(upload.run_id, project);
      setAnalyzeSetup(setup);
      setAnalyzeMapping(normalizeMapping(setup.mapping, setup.sheets[0]?.name ?? ""));
      setStatusRules(Object.fromEntries(setup.unknown_statuses.map((status) => [status, setup.status_groups[0] ?? "Качественные"])));
      setStep("analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сопоставить файлы");
    } finally {
      setLoading(false);
      setOperation("");
    }
  }

  async function runAnalyze() {
    if (!upload || !canAnalyze) return;
    setLoading(true);
    setOperation("Формирую аналитику и сохраняю выгрузку");
    setError("");
    try {
      const numberValue = Number(exportNumber);
      if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new Error("Укажите положительный номер выгрузки");
      }
      const data = await runAnalyzeRequest(upload.run_id, {
        project,
        mapping: analyzeMapping,
        status_rules: statusRules,
        export_number: numberValue,
        period_start: periodStart,
        period_end: periodEnd,
        analysis_date: analysisDate || null,
        source_file_name: clientFile?.name || matchPreview?.filename || upload.client.filename,
        replace_export: replaceExport
      });
      setAnalyzePreview(data.preview);
      await refreshProjects();
      await refreshExports(project);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сделать аналитику");
    } finally {
      setLoading(false);
      setOperation("");
    }
  }

  async function confirmDeleteExport() {
    if (!project.trim() || deletingExport === null) return;
    setLoading(true);
    setOperation("Удаляю выгрузку из истории");
    setError("");
    try {
      await deleteExportRequest(project, deletingExport);
      setDeletingExport(null);
      await refreshExports(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить выгрузку");
    } finally {
      setLoading(false);
      setOperation("");
    }
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <h1>Lead Analytics</h1>
          <p>Локальное сопоставление и аналитика Excel-файлов</p>
        </div>
        <div className="status">{loading ? operation || "Выполняется..." : "Готово к работе"}</div>
      </section>

      <Stepper step={step} />
      {error && <div className="alert">{error}</div>}

      {step === "upload" && (
        <>
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Проект и файлы</h2>
                <p>Выбери проект, файл из ЛК и файл клиента</p>
              </div>
              <button onClick={uploadFiles} disabled={!canUpload || loading}>
                Загрузить и проверить
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
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => {
                    setLkFile(event.target.files?.[0] ?? null);
                    resetRunOutputs();
                  }}
                />
                <small>{fileName(lkFile)}</small>
              </label>
              <label className="fileField">
                <span>Файл клиента</span>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => {
                    setClientFile(event.target.files?.[0] ?? null);
                    resetRunOutputs();
                  }}
                />
                <small>{fileName(clientFile)}</small>
              </label>
            </div>
          </section>
          <ExportHistory
            project={project}
            exports={savedExports}
            loading={loading}
            deletingExport={deletingExport}
            onAskDelete={setDeletingExport}
            onCancelDelete={() => setDeletingExport(null)}
            onConfirmDelete={confirmDeleteExport}
          />
        </>
      )}

      {step === "mapping" && upload && (
        <>
          <div className="sectionBar">
            <div>
              <span>Проверка колонок</span>
              <p>Автовыбор уже подставлен, проверь обязательные поля перед сопоставлением</p>
            </div>
            <div className="actions">
              <button className="ghostButton" onClick={() => setStep("upload")} disabled={loading}>
                Назад
              </button>
              <button onClick={runMatch} disabled={!canMatch || loading}>
                Сопоставить
              </button>
            </div>
          </div>
          <div className="twoColumn">
            <MappingPanel title="ЛК" file={upload.lk} mapping={lkMapping} role="lk" onChange={setLkMapping} />
            <MappingPanel title="Клиент" file={upload.client} mapping={clientMapping} role="client" onChange={setClientMapping} />
          </div>
        </>
      )}

      {step === "analyze" && upload && analyzeSetup && (
        <>
          <div className="sectionBar">
            <div>
              <span>Параметры аналитики</span>
              <p>Сопоставление готово, осталось указать период и проверить колонки аналитики</p>
            </div>
            <div className="actions">
              <button className="ghostButton" onClick={() => setStep("mapping")} disabled={loading}>
                Назад
              </button>
              <button onClick={runAnalyze} disabled={!canAnalyze || loading}>
                Сделать аналитику
              </button>
            </div>
          </div>

          {matchPreview && (
            <section className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Итог сопоставления</h2>
                  <p>{matchPreview.filename}</p>
                </div>
                <a className="download" href={downloadUrl(upload.run_id, "match")}>
                  Скачать сопоставление
                </a>
              </div>
              <MatchSummary workbook={matchPreview} />
            </section>
          )}

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
                <input type="number" min="1" step="1" value={exportNumber} onChange={(event) => setExportNumber(event.target.value)} />
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
          <StatusRulesPanel setup={analyzeSetup} statusRules={statusRules} onChange={setStatusRules} />
          {matchPreview && <WorkbookViewer title="Предпросмотр сопоставления" workbook={matchPreview} />}
        </>
      )}

      {step === "done" && upload && analyzePreview && (
        <>
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Аналитика готова</h2>
                <p>{analyzePreview.filename}</p>
              </div>
              <div className="actions">
                <a className="download" href={downloadUrl(upload.run_id, "analyze")}>
                  Скачать аналитику
                </a>
                <button className="ghostButton" onClick={() => setStep("upload")} disabled={loading}>
                  Новая выгрузка
                </button>
              </div>
            </div>
            <AnalyzeSummary workbook={analyzePreview} />
          </section>
          <WorkbookViewer title="Предпросмотр аналитики" workbook={analyzePreview} />
          <ExportHistory
            project={project}
            exports={savedExports}
            loading={loading}
            deletingExport={deletingExport}
            onAskDelete={setDeletingExport}
            onCancelDelete={() => setDeletingExport(null)}
            onConfirmDelete={confirmDeleteExport}
          />
        </>
      )}
    </main>
  );
}
