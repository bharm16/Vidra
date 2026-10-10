# Vidra product and ownership contract

A creator expands a brief into visible words, refines them, makes a picture, then makes it move. Studio provides standalone conversational image work; Sketch provides live drawing-conditioned output. Each has explicit admission/handoffs into a session. Testing is free ([ADR-0023](docs/adr/0023-bounded-free-validation-proposal.md)); existing Studio/Sketch spending bounds remain.

## Vocabulary

| Term                    | Contract                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Span labeling           | Categorizes phrases for semantic highlights without rewriting.                                      |
| Enhancement/suggestions | Alternatives for a selected phrase, applied through an explicit edit.                               |
| Optimization            | Structured rewriting and model-specific compilation, finished by intent validation and prompt lint. |
| Session                 | Persisted authoring work: words versions and takes with destination/ancestry.                       |
| Working words           | Current editable direction/settings. Browsing preserves them.                                       |
| Take                    | Durable picture or clip with a server-assigned id, distinct from its job id.                        |
| Associated words        | Words version named at admission. Explicit **Reuse setup** restores setup.                          |
| Production provenance   | Known inputs/instructions that made the artifact. Unknown upload provenance stays unknown.          |
| Origin                  | Closed admission set: generated, upload, sketchpad, studio.                                         |
| Space                   | Session media in chronological dispatch rows, with ancestry persisted.                              |
| Draft/render tier       | Model cost/quality choice, not lifecycle. Generated takes are persisted.                            |
| Studio project          | Standalone persisted conversation/images with explicit one-image handoffs.                          |
| Sketchpad/live output   | Drawing surface and ephemeral generated image; **Use this** admits the exact displayed output.      |

`/api/preview` remains a compatibility URL prefix. Say picture, clip or take for artifacts.

## State and recovery

Selection inspects artifacts without changing the working draft. **Reuse setup** deliberately restores setup. Tool panels persist across context changes. Playback requires a selected playable clip.

Dispatch captures words, inputs, model, settings and destination. Receipts recover accepted artifacts after lost responses. Video jobs retain claims/leases and terminal failure evidence. Durable completion precedes attachment; repair reuses media, take id, session and words version without resubmission or refunds.

Uploaded references are owned durable copies with explicit words association. Generic sessions and saved camera/model/continuity fields remain compatible. Source retirement does not migrate or delete stored records.

## Ownership

| Responsibility                    | Source                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| Claims/replay receipts            | `server/src/services/admission/idempotency/`                            |
| Picture admission                 | `server/src/services/admission/`                                        |
| Video completion/attachment       | `server/src/services/video-generation/runtime/`                         |
| Legacy charged-job refunds        | `server/src/services/video-generation/refunds/`                         |
| Sessions/owed picture attachments | `server/src/services/sessions/`                                         |
| Durable media/URL authorization   | Storage services, image/video asset stores, `infrastructure/signedUrl/` |
| Routes                            | [ROUTE_MAP.md](docs/architecture/ROUTE_MAP.md)                          |

Named assets/triggers, depth/convergence, continuity generation, storyboards/character preprocessing, recommendation, coherence/observation endpoints, paid intake and broad automatic replay workers are retired. Legacy refunds remain until charged jobs/refund debt are drained or migrated.

Generation offers come from `shared/videoModels.ts`. Historical model/provider ids remain readable; prompt compilation keeps separate targets. Retiring an adapter does not rewrite saved takes.

## References

[Page 21 migration](docs/design/page21-component-migration.md) and [tokens](docs/design/page21-tokens.json) retain the current visual/behavioral reference. [Cross-mode contracts](docs/architecture/cross-mode-golden-path.md), [replay](docs/architecture/replay-mode.md) and [media lifecycle](docs/architecture/admission-media-lifecycle.md) define recovery and proof limits. Replay does not qualify live provider quality. Current decisions live in [ADRs](docs/adr/); retired plans/studies/handoffs are recoverable from Git history.

ADRs are preserved project records, including superseded decisions. Their dated implementation descriptions remain historical evidence; current ownership is defined above and verified against source.
