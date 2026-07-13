import type {
  AnalyzeSetup,
  ExportRecord,
  Mapping,
  ProcessingJob,
  StatusRuleItem,
  StatusRulesData,
  UploadResponse,
  WorkbookPreview
} from "./types";

export const API = "/api";

export function projectQuery(project: string): string {
  return `project=${encodeURIComponent(project.trim())}`;
}

export async function jsonRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || `Ошибка запроса: ${response.status}`);
  }
  return response.json();
}

export async function fetchProjects(): Promise<string[]> {
  return jsonRequest<string[]>(`${API}/projects`, { method: "GET" });
}

export async function fetchExports(project: string): Promise<ExportRecord[]> {
  return jsonRequest<ExportRecord[]>(`${API}/exports?${projectQuery(project)}`, { method: "GET" });
}

export async function fetchStatusRules(project: string): Promise<StatusRulesData> {
  return jsonRequest<StatusRulesData>(`${API}/status-rules?${projectQuery(project)}`, { method: "GET" });
}

export async function updateStatusRule(
  ruleId: number,
  project: string,
  groupName: string
): Promise<StatusRuleItem> {
  return jsonRequest<StatusRuleItem>(`${API}/status-rules/${ruleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, group_name: groupName })
  });
}

export async function deleteStatusRule(ruleId: number, project: string): Promise<void> {
  await jsonRequest<{ deleted: boolean }>(
    `${API}/status-rules/${ruleId}?${projectQuery(project)}`,
    { method: "DELETE" }
  );
}

export async function uploadRun(project: string, lkFile: File, clientFile: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("project", project.trim());
  form.append("lk_file", lkFile);
  form.append("client_file", clientFile);
  return jsonRequest<UploadResponse>(`${API}/runs`, { method: "POST", body: form });
}

export async function runMatchRequest(
  runId: string,
  project: string,
  lkMapping: Mapping,
  clientMapping: Mapping
): Promise<{ filename: string; preview: WorkbookPreview }> {
  return jsonRequest<{ filename: string; preview: WorkbookPreview }>(`${API}/runs/${runId}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, lk_mapping: lkMapping, client_mapping: clientMapping })
  });
}

export async function queueMatchJob(
  runId: string,
  project: string,
  lkMapping: Mapping,
  clientMapping: Mapping
): Promise<ProcessingJob> {
  return jsonRequest<ProcessingJob>(`${API}/runs/${runId}/match/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, lk_mapping: lkMapping, client_mapping: clientMapping })
  });
}

export async function fetchAnalyzeSetup(runId: string, project: string): Promise<AnalyzeSetup> {
  return jsonRequest<AnalyzeSetup>(`${API}/runs/${runId}/analyze/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project })
  });
}

export async function runAnalyzeRequest(
  runId: string,
  payload: {
    project: string;
    mapping: Mapping;
    status_rules: Record<string, string>;
    export_number: number;
    period_start: string;
    period_end: string;
    analysis_date: string | null;
    source_file_name: string;
    replace_export: boolean;
  }
): Promise<{ filename: string; preview: WorkbookPreview }> {
  return jsonRequest<{ filename: string; preview: WorkbookPreview }>(`${API}/runs/${runId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function queueAnalyzeJob(
  runId: string,
  payload: {
    project: string;
    mapping: Mapping;
    status_rules: Record<string, string>;
    export_number: number;
    period_start: string;
    period_end: string;
    analysis_date: string | null;
    source_file_name: string;
    replace_export: boolean;
  }
): Promise<ProcessingJob> {
  return jsonRequest<ProcessingJob>(`${API}/runs/${runId}/analyze/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function fetchProcessingJob(jobId: number): Promise<ProcessingJob> {
  return jsonRequest<ProcessingJob>(`${API}/jobs/${jobId}`, { method: "GET" });
}

export function fetchProcessingJobPreview(jobId: number): Promise<WorkbookPreview> {
  return jsonRequest<WorkbookPreview>(`${API}/jobs/${jobId}/preview`, { method: "GET" });
}

export async function deleteExportRequest(project: string, exportNumber: number): Promise<void> {
  await jsonRequest<{ deleted: boolean }>(`${API}/exports?${projectQuery(project)}&export_number=${exportNumber}`, {
    method: "DELETE"
  });
}

export function downloadUrl(runId: string | null, kind: "match" | "analyze"): string {
  return runId ? `${API}/runs/${runId}/download/${kind}` : "#";
}
