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
 * "Use this in the session" — the return leg of the same bridge (#89).
 *
 * The creator names only the project and the image; every other fact is read
 * from records the server already holds. The destination in particular is
 * never accepted from the wire: it is the project's own origin, and a client
 * that could name a session would be a second, disagreeing copy of where the
 * picture belongs.
 */

/**
 * What to do when the project's origin session is gone.
 *
 * `refuse` — the default, and what an unprompted press means — reports the
 * loss and stops. A silently recreated session would answer "where did this
 * go?" with a place the creator never worked in, and the ADR forbids exactly
 * that. `new-session` is the creator's answer to the refusal, sent on the
 * second press; the choice is theirs, so it travels rather than being
 * inferred.
 */
export const STUDIO_MISSING_ORIGIN_SESSION_CHOICES = [
  "refuse",
  "new-session",
] as const;

export const StudioUseInSessionRequestSchema = z.object({
  onMissingOriginSession: z
    .enum(STUDIO_MISSING_ORIGIN_SESSION_CHOICES)
    .optional(),
  /**
   * The creator-confirmed associated words for a session this return mints
   * (ADR-0022 decision 2, issue #131). Required only when a new session is
   * created — a return into the project's existing origin session ignores it,
   * because the take is filed under that session's own words. It is NEVER the
   * edit instruction or the transform operation label that produced the image:
   * those are recorded separately as production provenance, and restoring an
   * instruction as a session's words is the exact fabrication decision 2
   * forbids. When the server mints a session and no confirmed words are
   * supplied, it asks for them (offering a from-scratch generate's prompt as an
   * editable suggestion) rather than inventing any.
   */
  confirmedWords: z.string().min(1).max(4000).optional(),
});

export const StudioUseInSessionResultSchema = z.object({
  sessionId: z.string(),
  promptVersionId: z.string(),
  /** The admitted take's identity — what a clip names as its ancestor. */
  generationId: z.string(),
  imageUrl: z.string(),
  /**
   * ADR-0022 decision 3: the one picture ancestor the space draws, or `null`
   * when the producing turn consumed no take of this session. `null` is an
   * answer — "this picture has no picture ancestor" — not a missing field.
   */
  ancestorGenerationId: z.string().nullable(),
  /** True when the project had no origin session and this press started one. */
  createdSession: z.boolean(),
});

export type StudioUseInSessionResult = z.infer<
  typeof StudioUseInSessionResultSchema
>;

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
