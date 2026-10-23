import type { DIContainer } from "@infrastructure/DIContainer";
import { ShareStore } from "@services/share/ShareStore";
import { ShareService } from "@services/share/ShareService";
import type { SessionService } from "@services/sessions/SessionService";
import type { StorageService } from "@services/storage/StorageService";
import type { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";

/**
 * Registers the public clip sharing store + service (ADR-0010 site-scope D8).
 *
 * Session ownership expresses the Share action; owned paths or authoritative
 * video-job results prove the selected media before a public grant is stored.
 */
export function registerShareServices(container: DIContainer): void {
  container.register("shareStore", () => new ShareStore(), []);
  container.register(
    "shareService",
    (
      shareStore: ShareStore,
      sessionService: SessionService,
      storageService: StorageService,
      videoJobStore: VideoJobStore,
    ) => new ShareService(shareStore, sessionService, storageService, videoJobStore),
    ["shareStore", "sessionService", "storageService", "videoJobStore"],
  );
}
