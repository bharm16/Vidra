import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type {
  VideoComposition,
  VideoExport,
  VideoValidationIssue,
} from "@shared/schemas/workflow/video-edit.schemas";
import { sourceElementIds } from "@shared/video-edit/composition";

export interface UnavailableSource {
  elementId: string;
  versionId: string;
  kind: "picture" | "clip" | "music";
  label: string;
}

/** Issues saved before versionId existed named the source version in elementId. */
function issueSource(
  issue: VideoValidationIssue,
  composition: VideoComposition,
): { elementId: string; versionId: string } | undefined {
  if (issue.code !== "source_unavailable") return undefined;
  if (issue.versionId)
    return { elementId: issue.elementId, versionId: issue.versionId };
  const elementId = sourceElementIds(composition, issue.elementId)[0];
  return elementId === undefined
    ? undefined
    : { elementId, versionId: issue.elementId };
}

function describe(
  composition: VideoComposition,
  elementId: string,
  versionId: string,
  labels: readonly MediaVersion[],
): UnavailableSource | undefined {
  const item = composition.items.find(
    (row) => row.id === elementId && row.versionId === versionId,
  );
  const music =
    composition.backgroundAudio?.id === elementId &&
    composition.backgroundAudio.versionId === versionId;
  if (!item && !music) return undefined;
  const kind = item ? item.kind : "music";
  const label =
    labels.find((version) => version.id === versionId)?.label ??
    (kind === "picture"
      ? "This picture"
      : kind === "clip"
        ? "This clip"
        : "This music");
  return { elementId, versionId, kind, label };
}

/** Sources in the current composition that can never export: saved issues, then the latest export's named failure. */
export function unavailableSources(
  composition: VideoComposition,
  issues: readonly VideoValidationIssue[],
  latestExport: VideoExport | undefined,
  media: readonly MediaVersion[],
): UnavailableSource[] {
  const labels = [...media, ...(latestExport?.sources ?? [])];
  const found = new Map<string, UnavailableSource>();
  for (const issue of issues) {
    const source = issueSource(issue, composition);
    const described =
      source &&
      describe(composition, source.elementId, source.versionId, labels);
    if (described) found.set(described.elementId, described);
  }
  const failed =
    latestExport?.state === "failed" ? latestExport.failedVersionId : undefined;
  if (failed && latestExport) {
    const elements = sourceElementIds(composition, failed);
    const elementId =
      latestExport.failedItemId !== undefined &&
      elements.includes(latestExport.failedItemId)
        ? latestExport.failedItemId
        : elements[0];
    const described =
      elementId === undefined
        ? undefined
        : describe(composition, elementId, failed, labels);
    if (described && !found.has(described.elementId))
      found.set(described.elementId, described);
  }
  return [...found.values()];
}
