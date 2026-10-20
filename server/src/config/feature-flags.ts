/**
 * The server's environment toggles, read straight from the environment.
 * env.ts validates their values at boot, so a typo such as `ture` fails
 * startup instead of resolving to the default.
 *
 * This file must remain free of infrastructure imports (no logger, no DI).
 * It is consumed from early-boot code paths where those may not be ready.
 */

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/** Kill switches for the worker role's background jobs. Both default on. */
export interface FeatureFlags {
  /** CREDIT_REFUND_SWEEPER_ENABLED: legacy failed-refund recovery. */
  creditRefundSweeperEnabled: boolean;
  /** VIDEO_ASSET_RETENTION_ENABLED: deletes expired video assets. */
  videoAssetRetentionEnabled: boolean;
}

export function getFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): FeatureFlags {
  return {
    creditRefundSweeperEnabled: readBool(
      env.CREDIT_REFUND_SWEEPER_ENABLED,
      true,
    ),
    videoAssetRetentionEnabled: readBool(
      env.VIDEO_ASSET_RETENTION_ENABLED,
      true,
    ),
  };
}

export interface RuntimeFlags {
  processRole: "api" | "worker";
  videoWorkerDisabled: boolean;
  videoWorkerShutdownDrainSeconds: number;
}

export function getRuntimeFlags(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeFlags {
  const processRole = env.PROCESS_ROLE === "worker" ? "worker" : "api";
  const drainParsed = Number.parseInt(
    env.VIDEO_WORKER_SHUTDOWN_DRAIN_SECONDS ?? "",
    10,
  );

  return {
    processRole,
    videoWorkerDisabled: processRole !== "worker",
    videoWorkerShutdownDrainSeconds:
      Number.isFinite(drainParsed) && drainParsed > 0 ? drainParsed : 45,
  };
}
