import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { StudioModelRegistry } from "@services/studio/StudioModelRegistry";
import { StudioPolicyEngine } from "@services/studio/StudioPolicyEngine";
import { ReplicateStudioImageRunner } from "@services/studio/providers/ReplicateStudioImageRunner";
import { FirestoreStudioProjectStore } from "@services/studio/storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import {
  StudioService,
  type StudioImageStorage,
} from "@services/studio/StudioService";
import { resolveAllFlags } from "../feature-flags.ts";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerStudioServices(container: DIContainer): void {
  // Its own token for the same reason `sessionStore` is one: it is the
  // studio's process-external persistence boundary, and a boundary that is
  // only reachable through the service that owns it cannot be given a
  // deterministic adapter (issue #90).
  container.register(
    "studioProjectStore",
    () => new FirestoreStudioProjectStore(),
    [],
  );

  container.register(
    "studioService",
    (
      config: ServiceConfig,
      storageService: StudioImageStorage | null,
      aiService: AIExecutionPort | null,
      studioProjectStore: StudioProjectStore,
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
        store: studioProjectStore,
        registry: new StudioModelRegistry(),
        runner: new ReplicateStudioImageRunner({ apiToken }),
        storage: storageService,
        policy: new StudioPolicyEngine({ ai: aiService }),
        // Boot-validated (env.ts studioSchema) and centrally parsed
        // (core.services config) — $5/user/day default.
        dailyCapCents: config.studio.dailyCapCents,
      });
    },
    [
      "config",
      "storageService",
      "aiService",
      "studioProjectStore",
    ],
  );
}
