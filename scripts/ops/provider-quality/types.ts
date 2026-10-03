export interface QualityPathResult {
  id: string;
  operation: "generate" | "edit" | "transform" | "sketch" | "motion";
  model: string;
  configuration: Record<string, unknown>;
  contract: "passed" | "failed" | "not-run";
  assertions: string[];
  submitted: { model: string; input: Record<string, unknown> }[];
  reason?: string;
  diagnosticCode?: "luma-model-mismatch";
  live: "not-verified";
  quality: "awaiting-owner-review";
}

export interface ProviderQualityReport {
  schema: "vidra-provider-quality/v1";
  mode: "offline-contract";
  revision: string;
  workingTreeStatus?: string[];
  startedAt: string;
  finishedAt: string;
  verdict: "contract-passed-quality-pending" | "contract-failed";
  taskSet: "creative-tasks/v1";
  paths: QualityPathResult[];
  pending: string[];
}
