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

const DEFAULT_DAILY_CAP_CENTS = 500; // $5/user/day (plan: "Spend cap")

/**
 * M5 hardening moves this into env.ts Zod config; until then the cap is a
 * defensively-parsed env read with a safe default.
 */
function resolveDailyCapCents(): number {
  const raw = process.env.STUDIO_DAILY_SPEND_CAP_CENTS;
  if (!raw) return DEFAULT_DAILY_CAP_CENTS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DAILY_CAP_CENTS;
}

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
        dailyCapCents: resolveDailyCapCents(),
      });
    },
    ["config", "storageService", "aiService"],
  );
}
