/**
 * Sub-project E: matrix comparison report.
 *
 * Queries PostHog for the most recent matrix run's scored events (those
 * whose source event has a non-null modelVariant). Joins quality.scored
 * to the source surface event by scoredEventId, groups by modelVariant,
 * computes per-dimension averages.
 *
 * Usage:
 *   npm run synthetic:report-matrix -- --only suggestions --since 30m
 *
 * Requires POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in env (same
 * as scripts/quality-judge/calibration/select-samples.ts).
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.4-2.5 for the data flow and report format.
 */

import "dotenv/config";

import type { Surface } from "./variants.js";

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

export interface SurfaceTelemetry {
  modelVariant: string;
  n: number;
  dimensions: Record<string, number>;
  totalScore: number;
}

const SOURCE_EVENT_BY_SURFACE: Record<Surface, string> = {
  suggestions: "suggestions.completed",
  optimize: "optimize.completed",
  "span-labeling": "label-spans.completed",
};

const DIM_KEYS_BY_SURFACE: Record<Surface, readonly string[]> = {
  suggestions: [
    "relevance",
    "diversity",
    "categoryFidelity",
    "plausibility",
    "qualityRange",
  ],
  optimize: [
    "fidelity",
    "detailEnrichment",
    "coherence",
    "constraintCompliance",
    "brevityDiscipline",
  ],
  "span-labeling": [
    "coverage",
    "precision",
    "categoryAccuracy",
    "granularity",
    "boundaryCleanness",
  ],
};

const UNIT_NAME: Record<string, string> = {
  m: "MINUTE",
  h: "HOUR",
  d: "DAY",
};

/**
 * Parse `--since` values like '30m', '2h', '1d' into a HogQL INTERVAL
 * suffix like '30 MINUTE'. Char-by-char parsing per the project's
 * no-regex rule. Throws on malformed input.
 */
export function parseSinceArg(raw: string): string {
  let i = 0;
  while (i < raw.length) {
    const c = raw.charCodeAt(i);
    if (c < 48 || c > 57) break; // not a digit
    i++;
  }
  if (i === 0 || i !== raw.length - 1) {
    throw new Error(
      `Invalid --since value '${raw}'. Use formats like '30m', '2h', '1d'.`,
    );
  }
  const value = raw.slice(0, i);
  const unit = raw[i]!;
  const unitName = UNIT_NAME[unit];
  if (!unitName) {
    throw new Error(`Invalid --since unit '${unit}'. Use 'm', 'h', or 'd'.`);
  }
  return `${value} ${unitName}`;
}

export function buildComparisonQuery(
  surface: Surface,
  interval: string,
): string {
  const sourceEvent = SOURCE_EVENT_BY_SURFACE[surface];
  const dims = DIM_KEYS_BY_SURFACE[surface];
  const dimAggregates = dims
    .map(
      (d) => `avg(toFloat(JSONExtractRaw(scored.dimensions, '${d}'))) AS ${d}`,
    )
    .join(",\n           ");

  // CTE rewrite: pre-filter both sides BEFORE joining. The previous
  // shape did INNER JOIN events s ON ... with JSON extraction in SELECT
  // and a post-join `modelVariant IS NOT NULL` filter, which times out
  // (HogQL 504) on real PostHog data sizes. Narrowing each side to its
  // own CTE first lets the query engine scan the smallest possible row
  // sets before the join. Verified to return in seconds on ~60-100
  // events per variant where the JOIN form hit the time budget.
  return `
    WITH scored AS (
      SELECT properties.scoredEventId AS sourceId,
             toFloat(properties.totalScore) AS totalScore,
             properties.dimensions AS dimensions
      FROM events
      WHERE event = 'quality.scored'
        AND properties.surface = '${surface}'
        AND timestamp > now() - INTERVAL ${interval}
    ),
    source AS (
      SELECT toString(uuid) AS uuid,
             properties.modelVariant AS modelVariant
      FROM events
      WHERE event = '${sourceEvent}'
        AND properties.modelVariant IS NOT NULL
        AND timestamp > now() - INTERVAL ${interval}
    )
    SELECT source.modelVariant AS modelVariant,
           count() AS n,
           ${dimAggregates},
           avg(scored.totalScore) AS totalScore
    FROM scored
    INNER JOIN source ON source.uuid = scored.sourceId
    GROUP BY modelVariant
    ORDER BY totalScore DESC
  `.trim();
}

export function formatComparisonTable(
  surface: Surface,
  rows: SurfaceTelemetry[],
): string {
  if (rows.length === 0) {
    return `## Sub-project E matrix run — ${surface} surface\n\nno scored events found for any variant in the time window.`;
  }
  const dims = DIM_KEYS_BY_SURFACE[surface];
  const header = ["Variant", "n", ...dims, "total"];
  const sep = header.map((h) => "-".repeat(Math.max(3, h.length)));

  const dataRows = rows.map((r) => [
    r.modelVariant,
    String(r.n),
    ...dims.map((d) => (r.dimensions[d] ?? 0).toFixed(2)),
    r.totalScore.toFixed(2),
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...dataRows.map((row) => (row[i] ?? "").length)),
  );

  const fmtRow = (cells: string[]): string =>
    "| " + cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ") + " |";

  const lines: string[] = [];
  lines.push(`## Sub-project E matrix run — ${surface} surface`);
  lines.push("");
  lines.push(fmtRow(header));
  lines.push(fmtRow(sep));
  for (const row of dataRows) {
    lines.push(fmtRow(row));
  }
  lines.push("");

  const winner = rows[0]!;
  const second = rows[1];
  const lead = second
    ? winner.totalScore - second.totalScore
    : winner.totalScore;
  lines.push(
    `Winner (by total): ${winner.modelVariant} — ${winner.totalScore.toFixed(2)}` +
      (second ? ` (+${lead.toFixed(2)} vs ${second.modelVariant})` : ""),
  );

  return lines.join("\n");
}

interface CliArgs {
  surface: Surface;
  since: string;
}

function parseCli(argv: string[]): CliArgs {
  let surface: Surface | null = null;
  let since = "30m";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      const v = argv[++i];
      if (v !== "suggestions" && v !== "optimize" && v !== "span-labeling") {
        throw new Error(
          `--only must be one of: suggestions, optimize, span-labeling (got: ${v})`,
        );
      }
      surface = v;
    } else if (argv[i] === "--since") {
      const v = argv[++i];
      if (!v) throw new Error("--since requires a value");
      since = v;
    }
  }
  if (!surface) throw new Error("--only is required");
  return { surface, since };
}

interface HogQLResponse {
  results: Array<Array<unknown>>;
  columns: string[];
}

async function runHogQL(query: string): Promise<HogQLResponse> {
  if (!POSTHOG_PROJECT_ID || !POSTHOG_PERSONAL_API_KEY) {
    throw new Error(
      "POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY required for matrix report.",
    );
  }
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    throw new Error(`HogQL ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as HogQLResponse;
}

function rowsFromHogQL(
  surface: Surface,
  response: HogQLResponse,
): SurfaceTelemetry[] {
  const dims = DIM_KEYS_BY_SURFACE[surface];
  return response.results.map((row) => {
    const modelVariant = String(row[0]);
    const n = Number(row[1]);
    const dimensions: Record<string, number> = {};
    for (let i = 0; i < dims.length; i++) {
      dimensions[dims[i]!] = Number(row[2 + i]);
    }
    const totalScore = Number(row[2 + dims.length]);
    return { modelVariant, n, dimensions, totalScore };
  });
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const interval = parseSinceArg(args.since);
  const query = buildComparisonQuery(args.surface, interval);
  const response = await runHogQL(query);
  const rows = rowsFromHogQL(args.surface, response);
  console.log(formatComparisonTable(args.surface, rows));
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[report-matrix] fatal:", err);
    process.exit(1);
  });
}
