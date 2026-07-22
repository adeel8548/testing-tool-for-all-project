export type AuditStage = 'queued' | 'starting' | 'authenticating' | 'discovering_routes' | 'page_audit' | 'completed' | 'failed' | 'cancelled';
export type AuditStatus = 'queued' | 'starting' | 'running' | 'testing' | 'waiting' | 'passed' | 'warning' | 'failed' | 'critical' | 'issues' | 'completed' | 'completed_with_issues' | 'cancelled';
export type PageStatus = 'waiting' | 'testing' | 'passed' | 'issues' | 'failed' | 'skipped';
export type CheckStatus = 'passed' | 'warning' | 'failed' | 'critical';
export type TestingMode = 'read-only' | 'safe-crud' | 'full-staging';
export type TestingDepth = 'basic' | 'functional' | 'full-crud';
export type DataSafety = 'generated-only' | 'read-only' | 'disposable';

export interface AuditEvent {
  id?: number;
  runId: string;
  timestamp: string;
  type: string;
  stage: AuditStage;
  status?: AuditStatus;
  message: string;
  pageIndex?: number;
  totalPages?: number;
  url?: string;
  check?: string;
  progress?: number;
  details?: Record<string, unknown>;
}

export interface AuditSummary {
  pagesScanned: number;
  passed: number;
  warnings: number;
  failed: number;
  critical: number;
  workflowsFound: number;
  workflowsVerified: number;
  skippedUnsafeWorkflows: number;
}

export interface AuditRun {
  runId: string;
  target: string;
  testingMode: TestingMode;
  testingDepth: TestingDepth;
  dataSafety: DataSafety;
  status: AuditStatus;
  startedAt: string;
  completedAt?: string;
  events: AuditEvent[];
  summary?: AuditSummary;
}

const unsafeAction = /\b(delete|remove|archive|reject|deactivate|disable|create|add|save|submit|edit|update|approve|assign|upload|import)\b/i;

export function normalizeAuditUrl(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || /(?:^|\/)(?:logout|signout|logoff)(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return null; }
}

export function requiresWorkflowConfiguration(label: string): boolean {
  return unsafeAction.test(label);
}

export function redactAuditValue(key: string, value: unknown): unknown {
  return /password|authorization|cookie|token|secret/i.test(key) ? '[REDACTED]' : value;
}
