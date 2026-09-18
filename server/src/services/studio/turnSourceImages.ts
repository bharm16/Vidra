/**
 * What a turn ACTUALLY consumed — ADR-0022 decision 4, issue #89.
 *
 * `decision.sourceImageIds` / `decision.sourceImageId` are what the LLM ASKED
 * for. `StudioService.resolveSourceImages` turns those ids into real stored
 * records at run time, and until this module that resolution was thrown away
 * the moment the call dispatched. Decision 4's provenance rule is stated over
 * the resolved inputs — "the returning picture's ancestry derives from the
 * producing turn and that turn's actual inputs" — so they have to survive on
 * the turn, and they have to be read back through validation because
 * Firestore hands records out as a cast.
 *
 * The read is a total switch over `decision.action`, and that is the whole
 * classifier: a `generate` has no image inputs AT ALL, which is what keeps an
 * unrelated generation inside a bridged project from inheriting the bridged
 * picture's ancestry. Nothing here inspects prompts, filenames or ids to
 * decide what a turn did — the decision union already says it.
 */

import { z } from "zod";
import type { StudioTurnRecord, StudioTurnSourceImage } from "./types";

export const StudioTurnSourceImageSchema = z.object({
  id: z.string().min(1),
  storagePath: z.string().min(1),
});

export const StudioTurnSourceImagesSchema = z.array(
  StudioTurnSourceImageSchema,
);

/**
 * Compile-time contract, the same guard `asStudioDecision` gives the decision
 * union: if the schema and the hand-written record type drift, this errors.
 */
type ParsedSourceImages = z.infer<typeof StudioTurnSourceImagesSchema>;
export function asTurnSourceImages(
  parsed: ParsedSourceImages,
): StudioTurnSourceImage[] {
  return parsed;
}

/**
 * The turn's resolved source images, or an empty list.
 *
 * Empty means "this turn consumed no stored image", and for a `generate` that
 * is the truth rather than a gap — the branch is explicit so a future reader
 * cannot mistake the absence of a persisted field for missing data.
 *
 * An unparseable field also reads as empty: a turn whose record was written
 * before this contract, or corrupted, must not be able to produce a fabricated
 * ancestry. No inputs means no display ancestor, which is the honest answer.
 */
export function readTurnSourceImages(
  turn: StudioTurnRecord,
): readonly StudioTurnSourceImage[] {
  switch (turn.decision.action) {
    case "generate":
      // Text to image: no image inputs at all. This is the case that must
      // never inherit the project's bridged picture (ADR-0022 decision 4).
      return [];
    case "edit":
    case "transform": {
      const parsed = StudioTurnSourceImagesSchema.safeParse(turn.sourceImages);
      return parsed.success ? asTurnSourceImages(parsed.data) : [];
    }
    case "clarify":
    case "diagnose":
    case "negotiate":
      // Conversational: no model ran, so there is no produced image to bridge
      // and nothing consumed it.
      return [];
  }
}
