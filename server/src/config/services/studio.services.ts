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
import { resolveAllFlags } from "../feature-flags.ts";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerStudioServices(container: DIContainer): void {
  container.register(
    "studioService",
    (
      config: ServiceConfig,
      storageService: StudioImageStorage | null,
      aiService: StudioAIService | null,
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
        runner: new ReplicateStudioImageRunner({ apiToken }),
        storage: storageService,
        policy: new StudioPolicyEngine({ ai: aiService }),
        // Boot-validated (env.ts studioSchema) and centrally parsed
        // (core.services config) — $5/user/day default.
        dailyCapCents: config.studio.dailyCapCents,
      });
    },
    ["config", "storageService", "aiService"],
  );
}
