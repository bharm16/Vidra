/**
 * One-shot script: pull scored events from PostHog per surface, stratify
 * into 4 quartiles by totalScore, fetch the corresponding source events'
 * content, write 20 stub CalibrationEntry records per surface.
 *
 * Run: `npx tsx --tsconfig server/tsconfig.json scripts/quality-judge/calibration/select-samples.ts`
 *
 * After this script runs, the three *.calibration.json files contain
 * stub entries with placeholder humanScore/humanDimensions/humanNotes.
 * Tasks 3-5 of the implementation plan fill those in by hand.
 *
 * See docs/superpowers/specs/2026-05-15-quality-judge-calibration-seeding-design.md
 * for the design rationale.
 */

import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  extractInputContent,
  extractOutputContent,
} from "../content-extractors.js";
import {
  QUALITY_SCORED_SURFACES,
  scoredEventNameFor,
  type QualityScoredSurface,
} from "../judge-event-types.js";
import { stratifyByQuartile } from "./stratify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!POSTHOG_PROJECT_ID || !POSTHOG_PERSONAL_API_KEY) {
  throw new Error(
    "POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY required. Set them in .env.",
  );
}

/**
 * Excludes pre-harness-rewrite synthetic-pool events. Commit 4bf218dd
 * (2026-05-14T23:16:39Z) replaced canned synthesizeSpans/optimize/suggestions
 * helpers with live AIModelService calls. Events emitted before that
 * timestamp annotate themselves with provider/model fields but their content
 * is fake. See docs/superpowers/programs/measurement.md reordering log
 * 2026-05-22 entry.
 *
 * F5 (2026-05-22) shipped harnessVersion stamping in PostHogClient — every
 * event captured after commit 970f6122 carries `properties.harnessVersion`.
 * Once all post-cutoff-pre-F5 events (Sub-projects A/B/C/D era, with null
 * harnessVersion) age out of common lookback windows (~mid-June 2026), this
 * constant can be retired in favor of `properties.harnessVersion IS NOT NULL`.
 * Until then, MIN_EVENT_TIMESTAMP is the canonical filter; harnessVersion
 * stamping is forward-looking defense-in-depth.
 */
const MIN_EVENT_TIMESTAMP = "2026-05-14T23:16:39Z";

interface HogQLResponse {
  results: Array<Array<unknown>>;
  columns: string[];
}

async function runHogQL(query: string): Promise<HogQLResponse> {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
    }),
  });
  if (!res.ok) {
    throw new Error(`HogQL ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as HogQLResponse;
}

interface ScoredRow {
  scoredEventId: string;
  totalScore: number;
}

interface SourceRow {
  uuid: string;
  properties: Record<string, unknown>;
}

interface SampledEntry {
  scoredEventId: string;
  totalScore: number;
  source: SourceRow;
}

async function fetchScoredRows(
  surface: QualityScoredSurface,
): Promise<ScoredRow[]> {
  const q = `
    SELECT properties.scoredEventId AS scoredEventId, toFloat(properties.totalScore) AS totalScore
    FROM events
    WHERE event = 'quality.scored'
      AND properties.surface = '${surface}'
      AND timestamp > now() - INTERVAL 14 DAY
      AND timestamp > parseDateTimeBestEffort('${MIN_EVENT_TIMESTAMP}')
    ORDER BY timestamp DESC
    LIMIT 500
  `;
  const r = await runHogQL(q);
  return r.results.map((row) => ({
    scoredEventId: String(row[0]),
    totalScore: Number(row[1]),
  }));
}

function parseProps(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

async function fetchSourceRows(
  surface: QualityScoredSurface,
  uuids: string[],
): Promise<SourceRow[]> {
  if (uuids.length === 0) return [];
  const eventName = scoredEventNameFor(surface);
  const quotedUuids = uuids.map((u) => `'${u.replace(/'/g, "")}'`).join(",");
  const q = `
    SELECT toString(uuid) AS uuid, properties
    FROM events
    WHERE event = '${eventName}'
      AND toString(uuid) IN (${quotedUuids})
      AND timestamp > now() - INTERVAL 14 DAY
      AND timestamp > parseDateTimeBestEffort('${MIN_EVENT_TIMESTAMP}')
  `;
  const r = await runHogQL(q);
  return r.results.map((row) => ({
    uuid: String(row[0]),
    properties: parseProps(row[1]),
  }));
}

async function selectForSurface(
  surface: QualityScoredSurface,
): Promise<SampledEntry[]> {
  const scored = await fetchScoredRows(surface);
  if (scored.length < 20) {
    throw new Error(
      `${surface}: only ${scored.length} scored events in last 7 days; need at least 20. Run more baseline data first.`,
    );
  }
  const ids = scored.map((s) => s.scoredEventId);
  const sources = await fetchSourceRows(surface, ids);
  const sourceById = new Map(sources.map((s) => [s.uuid, s]));

  const joined: SampledEntry[] = [];
  for (const s of scored) {
    const source = sourceById.get(s.scoredEventId);
    if (!source) continue;
    joined.push({ ...s, source });
  }
  if (joined.length < 20) {
    throw new Error(
      `${surface}: only ${joined.length} scored events have matching source events; need at least 20.`,
    );
  }

  return stratifyByQuartile(joined, (e) => e.totalScore);
}

function buildStubEntry(
  surface: QualityScoredSurface,
  entry: SampledEntry,
): Record<string, unknown> {
  return {
    scoredEvent: scoredEventNameFor(surface),
    scoredEventId: entry.scoredEventId,
    inputContent: extractInputContent(
      { properties: entry.source.properties },
      surface,
    ),
    outputContent: extractOutputContent(
      { properties: entry.source.properties },
      surface,
    ),
    humanScore: 0,
    humanDimensions: {},
    humanNotes: "TODO: label me",
    authoredAt: new Date().toISOString(),
    authoredBy: "claude",
  };
}

async function writeFileFor(
  surface: QualityScoredSurface,
  entries: SampledEntry[],
): Promise<void> {
  const stubs = entries.map((e) => buildStubEntry(surface, e));
  const path = join(__dirname, `${surface}.calibration.json`);
  await writeFile(path, JSON.stringify(stubs, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(
    `[select-samples] ${surface}: wrote ${stubs.length} stubs → ${path}`,
  );
}

async function main(): Promise<void> {
  for (const surface of QUALITY_SCORED_SURFACES) {
    // eslint-disable-next-line no-console
    console.log(`[select-samples] processing ${surface}…`);
    const entries = await selectForSurface(surface);
    await writeFileFor(surface, entries);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[select-samples] fatal:", err);
  process.exit(1);
});
