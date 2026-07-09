export type Mapping = {
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

export type SheetPreview = {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type FileInspect = {
  filename: string;
  detected: Mapping;
  sheets: SheetPreview[];
};

export type UploadResponse = {
  run_id: string;
  project: string;
  lk: FileInspect;
  client: FileInspect;
};

export type WorkbookPreview = {
  filename: string;
  sheets: SheetPreview[];
};

export type ExportRecord = {
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

export type AnalyzeSetup = {
  filename: string;
  mapping: Mapping;
  sheets: SheetPreview[];
  unknown_statuses: string[];
  status_groups: string[];
};

export type StatusRuleItem = {
  id: number | null;
  pattern: string;
  match_type: string;
  group_name: string;
  priority: number;
  source: "project" | "global" | "default";
};

export type StatusRulesData = {
  project_rules: StatusRuleItem[];
  system_rules: StatusRuleItem[];
  status_groups: string[];
};

export type Step = "upload" | "mapping" | "analyze" | "done";

export type OperationStage = "upload" | "read" | "match" | "prepare" | "done";
