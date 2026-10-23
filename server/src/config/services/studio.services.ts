import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { FirestoreStudioProjectStore } from "@services/studio/storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import {
  StudioService,
  type StudioImageStorage,
} from "@services/studio/StudioService";
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

  // Studio records stay readable after Studio retired into /app (ADR-0027).
  container.register(
    "studioService",
    (
      config: ServiceConfig,
      storageService: StudioImageStorage | null,
      studioProjectStore: StudioProjectStore,
    ) => {
      if (!storageService) {
        logger.warn("Storage service unavailable, studio records disabled");
        return null;
      }

      return new StudioService({
        store: studioProjectStore,
        storage: storageService,
        // Recovering an interrupted turn releases cents against the same
        // daily cap (env.ts studioSchema) the workflow spend guard consumes.
        dailyCapCents: config.studio.dailyCapCents,
      });
    },
    ["config", "storageService", "studioProjectStore"],
  );
}
