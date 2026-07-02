import type { DIContainer } from '@infrastructure/DIContainer';
import { logger } from '@infrastructure/Logger';
import { CassetteStore } from '@server/replay/CassetteStore';
import { resolveAllFlags } from '../feature-flags.ts';

/**
 * Record/replay wiring (REPLAY_MODE flag, Debug category).
 *
 * Registers the shared cassette store consumed by the aiService seam
 * (llm.services.ts) and the image preview provider seam
 * (image-generation.services.ts). Resolves to null when REPLAY_MODE=off so
 * both seams stay on their live code paths.
 */
export function registerReplayServices(container: DIContainer): void {
  container.register(
    'replayCassetteStore',
    () => {
      const { flags } = resolveAllFlags(process.env);
      if (flags.replayMode === 'off') {
        return null;
      }

      const store = new CassetteStore();
      if (flags.replayMode === 'replay') {
        const { files, entries } = store.loadAll();
        logger.info('Replay mode active: cassettes loaded', {
          files,
          entries,
        });
      } else {
        logger.info('Record mode active: provider responses will be captured');
      }
      return store;
    },
    []
  );
}
