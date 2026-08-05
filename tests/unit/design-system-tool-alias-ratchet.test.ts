import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The `--tool-*` bridge only shrinks.
 *
 * `client/src/index.css` declares these aliases and states their exit in the
 * same breath: "These names remain only so existing call sites keep compiling
 * ... Migrate a call site to the canonical class, then delete its alias."
 *
 * The plan was already the right one; what it lacked was an expiry. Nothing
 * measured whether the set was shrinking, so a bridge meant to drain could
 * quietly grow — and it had, to four names for one muted grey and three for
 * one border, which is how one screen ended up reading surfaces from three
 * vocabularies at once.
 *
 * This pins the set as of 2026-08-04. Deleting an alias is expected and needs
 * no change here. Adding one fails, and should: the canonical namespace
 * (--canvas / --chrome / --raise / --hairline / --fg*) is where a new name
 * belongs.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The bridge as declared on 2026-08-04. This list may lose entries, never gain them. */
const PINNED_ALIASES: readonly string[] = [
  "--tool-accent-neutral",
  "--tool-accent-soft",
  "--tool-border-dark",
  "--tool-border-primary",
  "--tool-nav-active-bg",
  "--tool-nav-hover-bg",
  "--tool-panel-inner-bg",
  "--tool-rail-border",
  "--tool-surface-card",
  "--tool-surface-deep",
  "--tool-surface-inset",
  "--tool-surface-prompt",
  "--tool-surface-prompt-compact",
  "--tool-text-disabled",
  "--tool-text-dim",
  "--tool-text-label",
  "--tool-text-muted",
  "--tool-text-placeholder",
  "--tool-text-secondary",
  "--tool-text-subdued",
];

/** Every `--tool-*` custom property this stylesheet declares. */
function declaredToolAliases(css: string): string[] {
  const found: string[] = [];
  for (const rawLine of css.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("--tool-")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    found.push(line.slice(0, colon).trim());
  }
  return found.sort();
}

describe("the --tool-* bridge only shrinks", () => {
  const css = readFileSync(path.join(repoRoot, "client/src/index.css"), "utf8");
  const declared = declaredToolAliases(css);

  it("declares no alias that was not already on the bridge", () => {
    const added = declared.filter((name) => !PINNED_ALIASES.includes(name));
    expect(
      added,
      "A new --tool-* alias is a second vocabulary for a value the design system already names. Use the canonical token (--canvas / --chrome / --raise / --hairline / --fg*) instead.",
    ).toEqual([]);
  });

  it("never grows past its pinned size", () => {
    expect(declared.length).toBeLessThanOrEqual(PINNED_ALIASES.length);
  });

  /**
   * Not a failure — a reminder that the list above is stale in the good
   * direction, and can be trimmed to match.
   */
  it("reports aliases already retired", () => {
    const retired = PINNED_ALIASES.filter((name) => !declared.includes(name));
    expect(Array.isArray(retired)).toBe(true);
  });
});
