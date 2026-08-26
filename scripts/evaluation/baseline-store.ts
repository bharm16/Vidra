/**
 * Shared JSON-baseline persistence for the eval scripts.
 *
 * Each eval owns its own baseline directory, key field, and `Baseline` shape;
 * only the path / read / write / mkdir mechanics were duplicated. A store binds
 * the directory (and the baseline type) once, so call sites read as
 * `store.read(key)` / `store.write(key, baseline)`. Comparators/gates stay
 * per-eval (see baseline-gate.ts) — this module only handles storage.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface BaselineStore<T> {
  /** Absolute path to the baseline file for `key`. */
  path(key: string): string;
  /** Parsed baseline for `key`, or null when none has been blessed yet. */
  read(key: string): T | null;
  /** Write `baseline` for `key` as pretty JSON with a trailing newline. */
  write(key: string, baseline: T): void;
}

export function createBaselineStore<T>(dir: string): BaselineStore<T> {
  const pathFor = (key: string): string => join(dir, `${key}.json`);
  return {
    path: pathFor,
    read(key: string): T | null {
      const path = pathFor(key);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf8")) as T;
    },
    write(key: string, baseline: T): void {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(
        pathFor(key),
        JSON.stringify(baseline, null, 2) + "\n",
        "utf8",
      );
    },
  };
}
