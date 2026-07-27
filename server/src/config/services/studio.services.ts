import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { StudioModelRegistry } from "@services/studio/StudioModelRegistry";
import {
  StudioPolicyEngine,
  type StudioAIService,
} from "@services/studio/StudioPolicyEngine";
import { ReplicateStudioImageRunner } from "@services/studio/providers/ReplicateStudioImageRunner";
import { FirestoreStudioProjectStore } from "@services/studio/storage/FirestoreStudioProjectStore";
import {
  StudioService,
  type StudioImageStorage,
} from "@services/studio/StudioService";
import type { CassetteStore } from "@server/replay/CassetteStore";
import { RecordReplayStudioImageRunner } from "@server/replay/RecordReplayStudioImageRunner";
import { resolveAllFlags } from "../feature-flags.ts";
import type { ServiceConfig } from "./service-config.types.ts";

/**
 * Studio's image run is a recorded surface too: the policy decision goes
 * through the seamed aiService, so the run that spends the money must not
 * bypass the seam.
 */
function throughReplaySeam(
  runner: ReplicateStudioImageRunner,
  replayCassetteStore: CassetteStore | null,
): ReplicateStudioImageRunner {
  if (!replayCassetteStore) {
    return runner;
  }
  const { flags } = resolveAllFlags(process.env);
  if (flags.replayMode === "off") {
    return runner;
  }
  return new RecordReplayStudioImageRunner({
    mode: flags.replayMode,
    store: replayCassetteStore,
    inner: runner,
  });
}

export function registerStudioServices(container: DIContainer): void {
  container.register(
    "studioService",
    (
      config: ServiceConfig,
      storageService: StudioImageStorage | null,
      aiService: StudioAIService | null,
      replayCassetteStore: CassetteStore | null,
    ) => {
      const { flags } = resolveAllFlags(process.env);
      if (!flags.studio) {
        logger.info("Studio disabled by ENABLE_STUDIO flag");
        return null;
      }

      const apiToken = config.replicate.apiToken;
      if (!apiToken) {
        logger.warn("REPLICATE_API_TOKEN not provided, studio disabled");
        return null;
      }
      if (!storageService) {
        logger.warn("Storage service unavailable, studio disabled");
        return null;
      }
      if (!aiService) {
        logger.warn("aiService unavailable, studio disabled");
        return null;
      }

      return new StudioService({
        store: new FirestoreStudioProjectStore(),
        registry: new StudioModelRegistry(),
        runner: throughReplaySeam(
          new ReplicateStudioImageRunner({ apiToken }),
          replayCassetteStore,
        ),
        storage: storageService,
        policy: new StudioPolicyEngine({ ai: aiService }),
        // Boot-validated (env.ts studioSchema) and centrally parsed
        // (core.services config) — $5/user/day default.
        dailyCapCents: config.studio.dailyCapCents,
      });
    },
    ["config", "storageService", "aiService", "replayCassetteStore"],
  );
}
