// Shared types for form schemas, generated data, and run results.

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "checkbox"
  | "checkbox-group"
  | "radio-group"
  | "file"
  | "hidden"
  | "password"
  | "other";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldSchema {
  name: string;
  type: FieldType;
  label: string | null;
  placeholder: string | null;
  required: boolean;
  pattern: string | null;
  min: string | null;
  max: string | null;
  maxLength: number | null;
  step: string | null;
  options: SelectOption[] | null; // select / radio-group / checkbox-group
  accept: string | null; // file inputs
  multiple: boolean; // file / select multiple
  selector: string; // best-effort CSS selector to locate the element(s)
}

export interface StepSchema {
  index: number;
  label: string | null;
  fields: FieldSchema[];
}

export interface FormSchema {
  url: string;
  formSelector: string;
  hiddenFields: FieldSchema[];
  steps: StepSchema[]; // single-step forms have exactly one entry
  submitSelector: string | null;
  submitLabel: string | null;
}

export type FormData = Record<string, string | string[] | boolean>;

export interface ValidationErrorEntry {
  field: string | null;
  message: string;
}

export interface FillResult {
  finalUrl: string;
  httpStatus: number | null;
  redirectChain: string[];
  success: boolean;
  validationErrors: ValidationErrorEntry[];
  consoleErrors: string[];
  failedRequests: { url: string; status: number | null; error: string | null }[];
  screenshotPath: string;
  runDir: string;
  dryRun: boolean;
  submittedData: FormData;
}

export interface LoginProfile {
  loginUrl: string;
  fields: Record<string, string>;
  submit: string;
}

export interface FormpilotConfig {
  allowedHosts: string[];
  profiles: Record<string, LoginProfile>;
  headless?: boolean;
}
