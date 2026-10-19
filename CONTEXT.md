# Vidra product and ownership contract

## Product direction — 2026-10-09

Vidra helps creators make and edit images, video clips, and finished videos, including ads. All three are intended outputs. An image does not have to become a video, and a video does not have to start with a generated image.

There is **no required creation order**. A creator can start with a description, an image, a sketch, or existing footage, then choose what to make or change. Expanding a description, generating a starting image, and animating it are optional actions. They must not be prerequisites imposed on unrelated work.

The creator should be able to tell what an action will do, which media it uses, and where the result will go. Viewing another result must not change an unfinished request. A completed generation must not take over work started while it was running. Making media, saving it, selecting it, editing it, and exporting it are different facts; the workspace must not collapse them into one overall stage.

The outcome is usable work the creator can export and return to. A successful provider response alone does not establish that the result meets the creator's request. Authoring assistance is a useful capability; its competitive advantage must be demonstrated rather than declared.

[ADR-0024](docs/adr/0024-creation-has-no-required-order.md) records this change to the product direction. The [workflow assessment and proposed build order](docs/design/2026-10-09-product-and-workflow-reset.md) distinguishes observed problems from recommendations. The exact workspace design, project storage model, buyer positioning, and pricing are not settled by this direction.

## Specified redesign: history and state

The [workflow state contract](docs/design/workflow/workflow-state-contract.md) specifies the proposed redesign's actions, history, transitions, recovery and acceptance cases. [ADR-0025](docs/adr/0025-conversations-requests-and-media-versions-have-separate-history.md) records the trade-off. These are implementation targets for review, not descriptions of completed behavior.

The [implementation plan](docs/design/workflow/implementation-plan.md) defines work packages, dependencies, small commits and activation gates. Its [state coverage ledger](docs/design/workflow/implementation-coverage.md) assigns every declared state/transition/rejection to an owner and test boundary; the [acceptance-test plan](docs/design/workflow/implementation-tests.md) names the required application tests. All implementation statuses remain planned until actual evidence closes them.

| Term                | Meaning in the redesign                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project             | Related conversations, source media, versions, video edits and exports.                                                                            |
| Conversation        | Chronological accepted requests, questions, answers and results. Editing an old request appends a revision; it does not erase later work.          |
| Draft               | Independently saved unfinished instructions, action, explicit inputs, settings, context and destination. A project can retain more than one.       |
| Request             | An immutable accepted snapshot of one submitted action, with its receipt and fixed output slots.                                                   |
| Media version       | One immutable image/clip/file with exact source versions and producing request. An edit creates a child; another attempt uses the original inputs. |
| Video edit revision | One saved arrangement of specific media versions, timing, text and audio.                                                                          |
| Export              | A stored file produced from one captured video edit revision. Later editing does not change it.                                                    |

Looking at a version does not select it as the input for an edit. A new request uses explicit branch context rather than all later messages. Undo changes unfinished text or video editing; it does not cancel generation or reverse spending. Background completion can resolve its own explicitly waiting draft input, but cannot replace unrelated work. The linked specification defines the precise exceptions, conflicting edits, missing history and recovery behavior.

## UI redesign — 2026-10-10

The proposed replacement UI is on [Page 25 — complete workflows](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-85295), with fresh components on [Page 24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=883-84247). The [design handoff](docs/design/workflow/design-handoff.md) and [machine-readable evidence](docs/design/workflow/ui-state-evidence.json) map every declared workflow state and acceptance case to the new designs. These replace earlier design studies as the proposed review target; existing application code and Page 21 remain descriptions of the current implementation.

Start review from the [workflow index](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=914-103761). It includes complete creation, exact-input selection, assembly/export and mobile journeys. Closing a progress panel preserves access to the same upload/export; completed generation never selects the result or submits a follow-up automatically. The desktop eleven-second and mobile twelve-second export studies are separate saved-edit fixtures, as recorded in the handoff.

The complete product also includes [Page 26 — public site and account](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=956-84247). Start with the [whole-product index](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=976-95137) and [handoff](docs/design/product/design-handoff.md). Its [screen catalog](docs/design/product/screen-catalog.json) and [route coverage](docs/design/product/route-coverage.json) cover landing/product pages, authentication and account recovery, documentation, account settings, support, legal content, first-use/route failures, email content and mobile layouts. Workspace-only coverage is not whole-product completion.

Visually inspect the relevant source before each new design family or substantial layout change in Figma. Open the source visibly in the current chat, inspect the actual screen and interaction, then compare the new design at a comparable viewport. A prior visit, text documentation, or inspection of an unrelated screen does not satisfy this requirement. If the needed source or component is missing, identify the gap and stop that design work rather than inventing a match. The replacement uses new masters, variables, styles and layouts, following the approved media-focused direction. Do not reintroduce legacy components or the mandatory image-to-video sequence. Finish and review the whole screen set before implementing the replacement application UI. The public `/` and workspace `/app` split is a proposed route change, not implemented behavior. Figma coverage does not close runtime, provider, rendering or commercial acceptance gates.

Pages 24, 25 and 26 are preserved as requested on 2026-10-10. Model-dependent creation studies are isolated on [Page 27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1026-84247). Its [source review](docs/design/model-dependent/source-review.md), [capability contract](docs/design/model-dependent/capability-contract.md), and [state catalog](docs/design/model-dependent/state-catalog.json) record the correction and remaining gaps. Generation controls follow the exact model, mode and supported adapter. Generated sound, reference audio inputs, delivered file streams and optional editor tracks are separate facts. Page 27 is an unfinished review study, not implementation approval or proof that the current adapters support its proposed ready states.

The user subsequently accepted the existing timeline design and requested collapsible/expandable states, a deferred image editor, and redesigned prompt highlights/replacements after code review. This additive work is on [Page 28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1091-101275); Pages 24–27 remain preserved. The [review guide](docs/design/prompt-editing/README.md), [interaction contract](docs/design/prompt-editing/interaction-contract.md), [state catalog](docs/design/prompt-editing/state-catalog.json) and [implementation notes](docs/design/prompt-editing/implementation-notes.md) cover the continuing sidebar/asset workspace, repeated requests, phrase changes and timeline visibility. The sidebar must remain useful beside generated assets throughout ongoing work; an empty draft does not imply an empty viewer. Timeline visibility is a view preference, not an edit revision. The dedicated image editor is explicitly to do later.

## Current implementation

Implementation began on 2026-10-10. Additive workflow schemas now separate drafts, explicit input roles, immutable request snapshots, stable output slots, media facts and resolved capability profiles. The new authenticated project/conversation/draft routes use owner checks and revisioned writes with retained conflicts; restoring a draft appends a revision. Branch context and the receipt authority have initial application boundary tests against a real local Firestore emulator. These are partial foundations, not completion of the 26 packages or acceptance coverage. The replacement UI, canonical executors, media delivery, editor/export and product/account cutover are still being implemented. Page 27 review and external qualification remain open; the dedicated image editor stays deferred.

The main workspace still routes a request without an armed starting image through expansion and picture generation before video. That is existing behavior to replace, not the intended product workflow. Studio currently provides standalone conversational image work; Sketch provides live drawing-conditioned output. Their existing handoffs admit pictures into sessions.

Images, individual clips, downloads, clip sharing, saved sessions, and recovery have active implementations. Finished-video assembly, trimming, text/caption and audio editing, and a composition export flow are implementation gaps; the broader product direction does not claim those capabilities already exist. Retained historical continuity fields do not establish an active video editor.

Testing remains free under [ADR-0023](docs/adr/0023-bounded-free-validation-proposal.md). Existing Studio/Sketch spending bounds remain. Paid launch, new provider spending, and background schedules are separate from this documentation change.

## Current implementation vocabulary

| Term                    | Contract                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Span labeling           | Categorizes phrases for semantic highlights without rewriting.                                           |
| Enhancement/suggestions | Alternatives for a selected phrase, applied through an explicit edit.                                    |
| Optimization            | Structured rewriting and model-specific compilation, finished by intent validation and prompt lint.      |
| Session                 | Persisted authoring work: words versions and takes with destination/ancestry.                            |
| Working words           | Current editable direction/settings. Browsing preserves them.                                            |
| Take                    | Durable artifact with a server-assigned id: an admission id for pictures, the accepted job id for clips. |
| Associated words        | Words version named at admission. Explicit **Reuse setup** restores setup.                               |
| Production provenance   | Known inputs/instructions that made the artifact. Unknown upload provenance stays unknown.               |
| Origin                  | Closed admission set: generated, upload, sketchpad, studio.                                              |
| Space                   | Session media in chronological dispatch rows, with ancestry persisted.                                   |
| Draft/render tier       | Model cost/quality choice, not lifecycle. Generated takes are persisted.                                 |
| Studio project          | Standalone persisted conversation/images with explicit one-image handoffs.                               |
| Sketchpad/live output   | Drawing surface and ephemeral generated image; **Use this** admits the exact displayed output.           |

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

[Page 21 migration](docs/design/page21-component-migration.md) and [tokens](docs/design/page21-tokens.json) record the implemented design. They remain the source for existing components; they do not make the old creation order a requirement for the redesign. This document does not approve an unseen replacement layout. [Cross-mode contracts](docs/architecture/cross-mode-golden-path.md), [replay](docs/architecture/replay-mode.md) and [media lifecycle](docs/architecture/admission-media-lifecycle.md) define recovery and proof limits. Replay does not qualify live provider quality. Current decisions live in [ADRs](docs/adr/); retired plans/studies/handoffs are recoverable from Git history.

ADRs are preserved project records, including superseded decisions. Their dated implementation descriptions remain historical evidence; current ownership is defined above and verified against source.
