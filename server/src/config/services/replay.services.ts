import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { CassetteStore } from "@server/replay/CassetteStore";
import {
  createSketchRelayFetch,
  type SketchRelayFetch,
} from "@server/replay/RecordReplaySketchRelay";
import { resolveAllFlags } from "../feature-flags.ts";

/**
 * Record/replay wiring (REPLAY_MODE flag, Debug category).
 *
 * Registers the shared cassette store consumed by the aiService seam
 * (llm.services.ts), the image preview provider seam
 * (image-generation.services.ts) and the studio image seam
 * (studio.services.ts), plus the sketch relay's own seam — the relay calls its
 * injected fetch directly rather than going through a provider adapter, so it
 * is the one boundary that needs its substitute handed to it. Everything here
 * resolves to null when REPLAY_MODE=off, and every seam stays on its live code
 * path.
 */
export function registerReplayServices(container: DIContainer): void {
  container.register(
    "replayCassetteStore",
    () => {
      const { flags } = resolveAllFlags(process.env);
      if (flags.replayMode === "off") {
        return null;
      }

      const store = new CassetteStore();
      if (flags.replayMode === "replay") {
        const { files, entries } = store.loadAll();
        logger.info("Replay mode active: cassettes loaded", {
          files,
          entries,
        });
      } else {
        logger.info("Record mode active: provider responses will be captured");
      }
      return store;
    },
    [],
  );

  container.register(
    "sketchRelayFetch",
    (replayCassetteStore: CassetteStore | null): SketchRelayFetch | null => {
      if (!replayCassetteStore) return null;
      const { flags } = resolveAllFlags(process.env);
      if (flags.replayMode === "off") return null;
      return createSketchRelayFetch({
        mode: flags.replayMode,
        store: replayCassetteStore,
      });
    },
    ["replayCassetteStore"],
  );
}
