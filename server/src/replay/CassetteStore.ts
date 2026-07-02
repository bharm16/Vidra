import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '@infrastructure/Logger';
import {
  REPLAY_CASSETTE_FORMAT_VERSION,
  type ReplayCassette,
  type ReplayCassetteEntry,
  type ReplaySurface,
} from '@shared/schemas/replay.schemas';
import { validateCassette, validateEntryPayload } from './contracts';
import { ReplayCassetteMissError, ReplayError } from './errors';

const DEFAULT_FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures'
);

interface IndexedEntry {
  entry: ReplayCassetteEntry;
  surface: ReplaySurface;
  scenario: string;
}

interface ScenarioContext {
  surface: ReplaySurface;
  scenario: string;
}

/**
 * Versioned fixture store for the record/replay seams.
 *
 * Layout: `<fixturesDir>/<surface>/<scenario>.json`, one cassette per file.
 * Every cassette is validated against the shared Zod contracts on load
 * (replay) and on record/flush, so invalid or drifted fixtures fail loudly
 * instead of producing confusing downstream behavior.
 */
export class CassetteStore {
  private readonly fixturesDir: string;
  private readonly entries = new Map<string, IndexedEntry>();
  private readonly pending = new Map<string, ReplayCassette>();
  private context: ScenarioContext | null = null;

  constructor({ fixturesDir }: { fixturesDir?: string } = {}) {
    this.fixturesDir = fixturesDir ?? DEFAULT_FIXTURES_DIR;
  }

  /** Load and contract-validate every cassette under the fixtures dir. */
  loadAll(): { files: number; entries: number } {
    let files = 0;
    for (const path of this.listCassetteFiles(this.fixturesDir)) {
      const label = relative(this.fixturesDir, path);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        throw new ReplayError(
          `Replay fixture ${label} is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      const cassette = validateCassette(raw, label);
      files += 1;
      for (const entry of cassette.entries) {
        const existing = this.entries.get(entry.key);
        if (existing) {
          logger.warn('Duplicate replay cassette key; keeping first entry', {
            key: entry.key,
            firstScenario: `${existing.surface}/${existing.scenario}`,
            duplicateScenario: `${cassette.surface}/${cassette.scenario}`,
          });
          continue;
        }
        this.entries.set(entry.key, {
          entry,
          surface: cassette.surface,
          scenario: cassette.scenario,
        });
      }
    }
    return { files, entries: this.entries.size };
  }

  lookup(key: string): ReplayCassetteEntry | undefined {
    return this.entries.get(key)?.entry;
  }

  /** Lookup that throws the loud, actionable miss error. */
  lookupOrThrow(key: string, summary: string): ReplayCassetteEntry {
    const hit = this.entries.get(key);
    if (!hit) {
      throw new ReplayCassetteMissError({
        key,
        summary,
        loadedEntries: this.entries.size,
      });
    }
    return hit.entry;
  }

  // ─── Recording ─────────────────────────────────────────────────────

  /** Declare which surface + scenario subsequent record() calls belong to. */
  beginScenario(surface: ReplaySurface, scenario: string): void {
    this.context = { surface, scenario };
  }

  /**
   * Capture one request/response pair into the pending cassette for the
   * current scenario. Contract-validates immediately — a bad capture aborts
   * the recording run rather than writing an unusable fixture.
   */
  record(entry: ReplayCassetteEntry): void {
    if (!this.context) {
      throw new ReplayError(
        'CassetteStore.record() called before beginScenario() — the record ' +
          'script must declare surface + scenario before invoking a surface.'
      );
    }
    const { surface, scenario } = this.context;
    validateEntryPayload(entry, { surface, scenario });

    const pendingKey = `${surface}/${scenario}`;
    let cassette = this.pending.get(pendingKey);
    if (!cassette) {
      cassette = {
        formatVersion: REPLAY_CASSETTE_FORMAT_VERSION,
        surface,
        scenario,
        recordedAt: new Date().toISOString(),
        entries: [],
      };
      this.pending.set(pendingKey, cassette);
    }
    // Re-recording the identical request within a run keeps the latest response.
    cassette.entries = cassette.entries.filter((e) => e.key !== entry.key);
    cassette.entries.push(entry);
  }

  /** Validate and write every pending cassette. Returns written file paths. */
  flush(): string[] {
    const written: string[] = [];
    for (const cassette of this.pending.values()) {
      const label = `${cassette.surface}/${cassette.scenario}.json`;
      validateCassette(cassette, label);
      const path = join(
        this.fixturesDir,
        cassette.surface,
        `${cassette.scenario}.json`
      );
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(cassette, null, 2)}\n`, 'utf8');
      written.push(path);
    }
    this.pending.clear();
    return written;
  }

  private listCassetteFiles(dir: string): string[] {
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const dirent of dirents) {
      const path = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        files.push(...this.listCassetteFiles(path));
      } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
        files.push(path);
      }
    }
    return files.sort();
  }
}
