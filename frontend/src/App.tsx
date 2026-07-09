import { useEffect, useMemo, useState } from "react";
import {
  deleteStatusRule,
  deleteExportRequest,
  downloadUrl,
  fetchAnalyzeSetup,
  fetchExports,
  fetchProjects,
  fetchStatusRules,
  runAnalyzeRequest,
  runMatchRequest,
  updateStatusRule,
  uploadRun
} from "./api";
import {
  AnalyzeSummary,
  ExportHistory,
  FileDropZone,
  MappingPanel,
  MatchSummary,
  ProcessProgress,
  ProjectCombo,
  StatusRulesManager,
  StatusRulesModal,
  Stepper,
  WorkbookViewer
} from "./components";
import type {
  AnalyzeSetup,
  ExportRecord,
  Mapping,
  OperationStage,
  StatusRulesData,
  Step,
  UploadResponse,
  WorkbookPreview
} from "./types";

const emptyMapping: Mapping = { sheet_name: "" };

function normalizeMapping(mapping: Mapping, sheetName: string): Mapping {
  return { ...mapping, sheet_name: mapping.sheet_name || sheetName };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [operationStage, setOperationStage] = useState<OperationStage | null>(null);
  const [error, setError] = useState("");
  const [deletingExport, setDeletingExport] = useState<number | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [rulesManagerOpen, setRulesManagerOpen] = useState(false);
  const [rulesData, setRulesData] = useState<StatusRulesData | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);

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
    setRulesManagerOpen(false);
    setRulesData(null);
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
    setStatusModalOpen(false);
    setStep("upload");
  }

  async function uploadFiles() {
    if (!canUpload || !lkFile || !clientFile) return;
    setLoading(true);
    setOperation("Загружаю и читаю Excel-файлы");
    setOperationStage("upload");
    setError("");
    try {
      const data = await uploadRun(project, lkFile, clientFile);
      setOperationStage("read");
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
      setOperationStage(null);
    }
  }

  async function runMatch() {
    if (!upload || !canMatch) return;
    setLoading(true);
    setOperation("Сопоставляю строки и готовлю Excel");
    setOperationStage("match");
    setError("");
    try {
      const data = await runMatchRequest(upload.run_id, project, lkMapping, clientMapping);
      setMatchPreview(data.preview);
      setOperation("Определяю колонки аналитики и неизвестные статусы");
      setOperationStage("prepare");
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
      setOperationStage(null);
    }
  }

  function requestAnalyze() {
    if (!analyzeSetup) return;
    if (analyzeSetup.unknown_statuses.length > 0) {
      setStatusModalOpen(true);
      return;
    }
    runAnalyze();
  }

  async function runAnalyze() {
    if (!upload || !canAnalyze) return;
    setStatusModalOpen(false);
    setLoading(true);
    setOperation("Формирую аналитику и сохраняю выгрузку");
    setOperationStage("prepare");
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
      setOperationStage("done");
      setAnalyzePreview(data.preview);
      await refreshProjects();
      await refreshExports(project);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сделать аналитику");
    } finally {
      setLoading(false);
      setOperation("");
      setOperationStage(null);
    }
  }

  async function confirmDeleteExport() {
    if (!project.trim() || deletingExport === null) return;
    setLoading(true);
    setOperation("Удаляю выгрузку из истории");
    setOperationStage("done");
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
      setOperationStage(null);
    }
  }

  async function openRulesManager() {
    if (!project.trim()) return;
    setRulesManagerOpen(true);
    setRulesLoading(true);
    setError("");
    try {
      setRulesData(await fetchStatusRules(project));
    } catch (err) {
      setRulesManagerOpen(false);
      setError(err instanceof Error ? err.message : "Не удалось загрузить соответствия статусов");
    } finally {
      setRulesLoading(false);
    }
  }

  async function saveStatusRule(ruleId: number, groupName: string) {
    setRulesLoading(true);
    setError("");
    try {
      const updated = await updateStatusRule(ruleId, project, groupName);
      setRulesData((current) => current ? {
        ...current,
        project_rules: current.project_rules.map((rule) => rule.id === ruleId ? updated : rule)
      } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить соответствие");
    } finally {
      setRulesLoading(false);
    }
  }

  async function removeStatusRule(ruleId: number) {
    setRulesLoading(true);
    setError("");
    try {
      await deleteStatusRule(ruleId, project);
      setRulesData((current) => current ? {
        ...current,
        project_rules: current.project_rules.filter((rule) => rule.id !== ruleId)
      } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить соответствие");
    } finally {
      setRulesLoading(false);
    }
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <h1>Lead Analytics</h1>
          <p>Локальное сопоставление и аналитика Excel-файлов</p>
        </div>
        <div className={`statusBadge ${loading ? "busy" : "ready"}`}>
          <span aria-hidden="true" />
          {loading ? operation || "Выполняется..." : "Готово к работе"}
        </div>
      </section>

      <Stepper step={step} />
      <ProcessProgress active={loading} stage={operationStage} label={operation} />
      {error && <div className="alert">{error}</div>}

      {step === "upload" && (
        <>
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Проект и файлы</h2>
                <p>Выбери проект, нашу выгрузку и выгрузку клиента</p>
              </div>
              <div className="actions">
                <button className="ghostButton" onClick={openRulesManager} disabled={!project.trim() || loading}>
                  Соответствия статусов
                </button>
                <button onClick={uploadFiles} disabled={!canUpload || loading}>
                  Загрузить и проверить
                </button>
              </div>
            </div>
            <div className="uploadGrid">
              <label className="field">
                <span>Проект</span>
                <ProjectCombo value={project} projects={projects} disabled={loading} onChange={setProject} />
              </label>
              <FileDropZone
                label="Наша выгрузка / ЛК"
                file={lkFile}
                disabled={loading}
                onChange={(file) => {
                  setLkFile(file);
                  resetRunOutputs();
                }}
              />
              <FileDropZone
                label="Выгрузка клиента / CRM"
                file={clientFile}
                disabled={loading}
                onChange={(file) => {
                  setClientFile(file);
                  resetRunOutputs();
                }}
              />
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
              <button onClick={requestAnalyze} disabled={!canAnalyze || loading}>
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
          {matchPreview && <WorkbookViewer title="Предпросмотр сопоставления" workbook={matchPreview} />}
          <StatusRulesModal
            open={statusModalOpen}
            setup={analyzeSetup}
            statusRules={statusRules}
            loading={loading}
            onChange={setStatusRules}
            onCancel={() => setStatusModalOpen(false)}
            onConfirm={runAnalyze}
          />
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
      <StatusRulesManager
        open={rulesManagerOpen}
        project={project}
        data={rulesData}
        loading={rulesLoading}
        onClose={() => setRulesManagerOpen(false)}
        onSave={saveStatusRule}
        onDelete={removeStatusRule}
      />
    </main>
  );
}
