import type { DIContainer } from "@infrastructure/DIContainer";
import { ShareStore } from "@services/share/ShareStore";
import { ShareService } from "@services/share/ShareService";
import type { SessionService } from "@services/sessions/SessionService";
import type { StorageService } from "@services/storage/StorageService";

/**
 * Registers the public clip sharing store + service (ADR-0010 site-scope D8).
 *
 * ShareService reuses SessionService (owner-scoped read at mint time) and
 * StorageService (fresh view URL at public read time) via their structural
 * shapes — no new external dependency.
 */
export function registerShareServices(container: DIContainer): void {
  container.register("shareStore", () => new ShareStore(), []);
  container.register(
    "shareService",
    (
      shareStore: ShareStore,
      sessionService: SessionService,
      storageService: StorageService,
    ) => new ShareService(shareStore, sessionService, storageService),
    ["shareStore", "sessionService", "storageService"],
  );
}
