import type { DraftInput } from "@shared/schemas/workflow/draft.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

/** Ready import bytes may be displayed while the persisted draft keeps its import receipt. */
export function observedDraftInputs(inputs: DraftInput[], media: MediaVersion[]): DraftInput[] {
  return inputs.map(input => {
    if (input.state !== "importing") return input;
    const version = media.find(candidate => candidate.id === `version_${input.importId.slice(7)}` && candidate.object.identity === "verified" && candidate.metadata.state === "verified");
    return version ? { state: "resolved", role: input.role, versionId: version.id } : input;
  });
}

/** Replacing one reference must retain the other references and their order. */
export function bindDraftInput(inputs: DraftInput[], next: DraftInput, maxCount: number, replacing?: DraftInput): DraftInput[] {
  if (replacing) {
    const matches = inputs.flatMap((input, index) => input === replacing || canonicalJson(input) === canonicalJson(replacing) ? [index] : []);
    if (matches.length !== 1) return inputs;
    return inputs.map((input, index) => index === matches[0] ? next : input);
  }
  const existing = inputs.filter(input => input.role === next.role);
  if (existing.some(input => canonicalJson(input) === canonicalJson(next))) return inputs;
  if (maxCount > 1) return existing.length < maxCount ? [...inputs, next] : inputs;
  const first = inputs.findIndex(input => input.role === next.role);
  const remaining = inputs.filter(input => input.role !== next.role);
  remaining.splice(first < 0 ? remaining.length : first, 0, next);
  return remaining;
}
