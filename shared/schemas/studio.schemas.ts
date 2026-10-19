/**
 * The studio's wire contract with the session — ADR-0022 decision 4.
 *
 * A studio project is still its own record in its own collection (ADR-0019
 * decisions 1 and 3 stand): this is the bridge, not a fold. What crosses is
 * one immutable fact — which session picture the project was born from.
 */
import { z } from "zod";
import { TakeSourceInputSchema } from "./session.schemas.js";

/**
 * Where a studio project came from, captured at the moment the creator
 * invoked "Refine in the studio" and never rewritten. Opening the studio does
 * not touch the source take, and a later change to the session does not change
 * this record — which is the whole point of capturing rather than linking.
 *
 * `sourceInput` is #86's `TakeSourceInput`, not a shape invented here: the
 * return path (#89) hands it straight back to the admission boundary as the
 * returning take's source input and display ancestor, so the two directions
 * speak one vocabulary.
 *
 * Deliberately NOT here: any URL. A signed view URL lives one hour
 * (`signedUrlPolicy`), and an origin that expires is not an origin. The
 * durable handles — `storagePath` on the source input, and the project's own
 * copy under `bridgedImageId` — are what the project re-resolves from.
 */
export const StudioProjectOriginSchema = z.object({
  /** The session the picture was taken from. */
  sessionId: z.string(),
  /**
   * The words-version the take is filed under — its associated words
   * (ADR-0022 decision 2), resolved from the session at invocation.
   */
  promptVersionId: z.string(),
  /** The take's identity and durable handles, as the session recorded them. */
  sourceInput: TakeSourceInputSchema,
  /**
   * The project's OWN copy of that picture, by the id the project addresses it
   * with — the selectable, editable image an edit turn sources from. It names
   * which of the project's images is the bridged one, which is what lets #89
   * tell an edit that actually consumed it (a `refine` edge) from an unrelated
   * generation inside the same project (no edge).
   */
  bridgedImageId: z.string(),
  capturedAtMs: z.number(),
});

export type StudioProjectOrigin = z.infer<typeof StudioProjectOriginSchema>;

/**
 * The identity and captured context a turn submission carries on the wire —
 * issue #115.
 *
 * `submissionId` is a per-submission idempotency token: two requests that
 * carry the same one converge on ONE turn (a lost response, the auth
 * transport re-sending a POST after sign-in, or a reload all re-send the same
 * body, so they resolve to the turn the first created rather than a second
 * paid decision). It is per-submission, not per-text: two DELIBERATE
 * submissions of the same words mint two ids and stay two turns.
 *
 * `selectedImageId` and `pinnedModel` are the effective selection and pin AS
 * THE CREATOR SAW THEM at submit time. They travel with the submission so the
 * turn is decided against them and NOT against a later selection or pin change
 * made in another tab between submit and decision. `null` is an explicit
 * "no selection" / "Auto" captured at submit time — distinct from the field
 * being absent, which lets a non-studio caller fall back to the project's
 * persisted values. The pin is a lenient string, never the slug enum: a stale
 * pin reverts to Auto at resolution and never rejects the turn.
 *
 * Deliberately NOT here: the message text or attachment ids. The message is
 * the turn's own field; attachment ids are already captured on the wire.
 */
export const StudioTurnSubmissionSchema = z.object({
  submissionId: z.string().min(1).max(200),
  selectedImageId: z.string().min(1).nullable().optional(),
  pinnedModel: z.string().min(1).nullable().optional(),
});

export type StudioTurnSubmission = z.infer<typeof StudioTurnSubmissionSchema>;
