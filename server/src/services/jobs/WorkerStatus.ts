export interface WorkerStatus {
  running: boolean;
  lastRunAt: Date | null;
  lastSuccessfulRunAt?: Date | null;
  consecutiveFailures: number;
}
