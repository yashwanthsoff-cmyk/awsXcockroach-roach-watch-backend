export type Severity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "investigating" | "fix_proposed" | "resolved" | "monitoring";
export type RiskLevel = "low" | "medium" | "high";
export type HealthState = "healthy" | "degraded" | "down";

export interface Incident {
  id: string;
  service: string;
  summary: string;
  severity: Severity;
  status: IncidentStatus;
  triggeredAt: string;
  alertPayload: Record<string, unknown>;
  matchedRecordId: string | null;
  rootCause?: string;
  confidence?: number;
  fixSummary?: string;
  recurrenceRisk?: RiskLevel;
  postmortemDraft?: string;
}

export interface MemoryRecord {
  id: string;
  recordNumber: number;
  service: string;
  title: string;
  rootCause: string;
  resolution: string;
  writtenAt: string;
  committedLatencyMs: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  similarityScore: number;
  retrievedAtMs: number;
  committedLatencyMs: number;
}

export interface TraceStep {
  time: string;
  step: string;
  tool: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface CitedRecord {
  id: string;
  text: string;
  root_cause: string | null;
  fix_summary: string | null;
  created_at: string;
  score: number;
}

export interface Evidence {
  similarIncidentsFound: number;
  confirmedFixCount: number;
  avgEffectiveness: number | null;
}

export interface AgentReply {
  text: string;
  citedRecords: CitedRecord[];
  evidence: Evidence;
  toolsUsed: string[];
  trace: TraceStep[];
  totalDurationMs: number;
}

export interface ClusterNode {
  id: number;
  name: string;
  state: HealthState;
  region: string;
  latencyMs: number;
  replicas: number;
}

export interface ClusterStatus {
  nodes: ClusterNode[];
  activeConnections: number;
  lastQueryLatencyMs: number;
  replicasUnderReplicated: number;
  memoryRecords: number;
}

export interface InspectionRun {
  id: string;
  startedAt: string;
  result: "healthy" | "degraded";
  durationMs: number;
  steps: string[];
}

export type ToolName =
  | "Groq API"
  | "NVIDIA NIM Embedding"
  | "NVIDIA NIM Reranker"
  | "CockroachDB"
  | "CockroachDB MCP Server"
  | "AWS";

export interface ToolHealth {
  tool: ToolName;
  status: "connected" | "degraded" | "not_configured";
  latencyMs: number | null;
  lastChecked: string;
  detail: string;
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const randomDelay = () => delay(150 + Math.round(Math.random() * 250));
