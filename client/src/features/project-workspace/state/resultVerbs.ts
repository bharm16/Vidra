import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { CreationAction, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { resultVerbs } from "@shared/workflow/actionRegistry";

/** A button on a result (Rule 8): a profile-backed action that opens the composer with the result bound, or a workspace verb. */
export type ResultVerb =
  | { kind: "action"; label: string; action: CreationAction; role: DraftInput["role"] }
  | { kind: "variation" | "region" | "reference" | "frame" | "add-to-video"; label: string };

const ORDER: Record<"image" | "video" | "audio", readonly string[]> = {
  image: ["New variation", "Edit", "Edit a region", "Animate", "Upscale", "Use as reference"],
  video: ["Edit", "Extend", "Upscale", "Reframe", "Make captions", "Use a frame", "Add to video"],
  audio: ["Add to video", "Make captions"],
};

/** The verbs a result shows; profile-backed verbs appear only while a qualified profile takes the result. */
export function verbsForResult(version: Pick<MediaVersion, "kind">, profiles: readonly CapabilityProfile[], options: { variation: boolean }): ResultVerb[] {
  const kind = version.kind === "export" ? "video" : version.kind;
  const verbs: ResultVerb[] = resultVerbs(kind, profiles).map(verb => ({ kind: "action", label: verb.label, action: verb.action, role: verb.role }));
  if (kind === "image") {
    if (options.variation) verbs.push({ kind: "variation", label: "New variation" });
    if (profiles.some(profile => profile.availability === "qualified" && profile.inputs.some(rule => rule.role === "mask"))) verbs.push({ kind: "region", label: "Edit a region" });
    verbs.push({ kind: "reference", label: "Use as reference" });
  }
  if (kind === "video") verbs.push({ kind: "frame", label: "Use a frame" });
  if (kind === "video" || kind === "audio") verbs.push({ kind: "add-to-video", label: "Add to video" });
  // Figma's order for the verbs it names; a verb a new action adds comes just before the last one, so it appears with no client change.
  const order = ORDER[kind];
  const rank = (label: string): number => { const index = order.indexOf(label); return index < 0 ? order.length - 1.5 : index; };
  return verbs.sort((a, b) => rank(a.label) - rank(b.label));
}
