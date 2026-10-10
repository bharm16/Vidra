# Vidra: product and workflow reset

**Detailed follow-up:** The [workflow state contract](workflow/workflow-state-contract.md) now specifies conversation history, version branches, drafts, actions, recovery, and acceptance cases. Use it for the exact redesign behavior; this assessment remains the evidence and build-order rationale.

**Date:** 2026-10-09, America/Chicago. **Source baseline:** `0f541e60`. This is a source-backed assessment and proposed design, not an implementation or live creative-quality evaluation. The owner's confirmed direction—all three outputs, no required creation order—is recorded in [CONTEXT.md](../../CONTEXT.md) and [ADR-0024](../adr/0024-creation-has-no-required-order.md). The workspace, storage, commercial, and delivery proposals below are recommendations.

## The problem

Vidra currently makes the presence of a starting image decide what the creator means. In the main workspace, “Generate” runs expansion and picture generation when a starting image is absent; with a starting image, it submits video. The label and video settings do not explain that change of meaning. This is explicit in [CanvasSettingsRow.tsx](../../client/src/features/workspace-shell/components/CanvasSettingsRow.tsx#L150).

The product then divides related work among a video session, an image Studio project, and a temporary Sketch output. The bridges preserve valuable data, but the creator still has to understand the boundaries to move their work. The code is implementing the old decisions faithfully in several places. More local fixes will not resolve decisions that force the wrong workflow.

The replacement should let someone say what they want to make or change, work directly with existing media, and finish with usable files. Making an image, making a clip, and editing a finished video need different actions. They can share the same work without sharing a prescribed order.

## What the source establishes

| Finding                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                            | Consequence                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The main button infers the task from `startFrame` and pending-reference state.                                                                                                          | [CanvasSettingsRow](../../client/src/features/workspace-shell/components/CanvasSettingsRow.tsx#L150), including `runGenerate` at line 156.                                                                                                                                                          | A creator cannot rely on the button label to distinguish making a picture from making a video. Make the action part of the request.                                                                                                                                             |
| Expansion automatically continues into picture generation and arms that picture as the starting frame.                                                                                  | [useIdeaBox](../../client/src/features/idea-box/hooks/useIdeaBox.ts#L144), `continueAfterOptimization` at line 208.                                                                                                                                                                                 | Writing help, image creation, and choosing a video input are coupled. Separate these actions.                                                                                                                                                                                   |
| One workspace stage is computed from all the session's result tiles. Any failed tile can supply the failure, and failure wins over completed clips.                                     | [Workspace call site](../../client/src/features/workspace-shell/CanvasWorkspace.tsx#L224), [artifact reduction](../../client/src/features/workspace-shell/utils/computeWorkspaceArtifacts.ts#L64), [stage derivation](../../client/src/features/workspace-shell/utils/deriveWorkspaceStage.ts#L56). | Old failures and current work need separate status. A direct execution of these pure functions with one failed and one completed clip returned `stage: moving, failure: video` despite `hasClip: true`. This proves the derivation, not that every workspace action is blocked. |
| Main-session media is nested under words versions; Studio images are nested under turns in a separate project record.                                                                   | [Session schema](../../shared/schemas/session.schemas.ts#L221), [Studio records](../../server/src/services/studio/types.ts#L94), [handoff schema](../../shared/schemas/studio.schemas.ts#L29).                                                                                                      | A common project must preserve these identities and histories. Renaming both records “project” does not by itself unify their behavior.                                                                                                                                         |
| Inspection already preserves the main workspace's draft, and media actions have explicit handlers.                                                                                      | [Selection and actions](../../client/src/features/workspace-shell/CanvasWorkspace.tsx#L325).                                                                                                                                                                                                        | Keep this behavior. Extend actions from it instead of making selection silently switch the current request.                                                                                                                                                                     |
| The active routes cover generation, sessions, Studio, Sketch and sharing. No active finished-video composition/export contract was found in the reviewed route map or product contract. | [Route map](../architecture/ROUTE_MAP.md), [current implementation](../../CONTEXT.md#current-implementation).                                                                                                                                                                                       | Ordering clips, trimming, text, audio and composition export are substantial missing capabilities. Historical continuity fields and a generation-history timeline do not supply them.                                                                                           |
| New video intake deliberately reserves zero customer credits and rejects a nonzero reservation in its atomic creation path.                                                             | [Intake](../../server/src/routes/preview/handlers/video-generate/intake.ts#L158), [VideoJobStore](../../server/src/services/video-generation/runtime/VideoJobStore.ts#L118), [ADR-0023](../adr/0023-bounded-free-validation-proposal.md).                                                           | The current product cannot become a paid service by adding a checkout screen. Entitlements, usage accounting and spending enforcement require implementation.                                                                                                                   |

These are an assessment of the central workflows, not an exhaustive defect inventory. Provider quality and live competitor workflows were not exercised.

## The proposed product

**Vidra is a place to make and edit images and videos, keep the versions that work, and finish the work for delivery.** A creator can bring their own material, generate missing material, revise a selected result, or assemble work they already have.

My initial buyer recommendation is independent creators and small creative teams producing recurring content for themselves or clients. One customer can need images, separate shots, and finished promotional videos. Supporting those outputs does not require aiming the first offer at every type of customer. This buyer choice is a proposal, not a settled fact or evidence of demand.

The paid reason to use Vidra would be less work between an idea or supplied material and a usable delivery, especially when a revision is requested. That advantage still has to be demonstrated. “Better prompts,” a model picker, and a chat interface are not enough: [Higgsfield](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio), [Runway](https://runway.com/product/agent), and [Krea](https://www.krea.ai/docs/user-guide/agent/overview) already advertise substantial authoring and revision assistance. See the [source comparison](../research/2026-10-09-competitive-workflows.md). Their advertising is not proof that they execute every task well.

## How someone should work

The project holds the relevant material and finished outputs. The creator can describe a request or choose an action on an image or clip. The interface shows the intended action and the selected inputs. It asks for missing information only when that information is necessary.

| What the creator wants                                           | What Vidra should do                                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Make an image for this post.”                                   | Create an image. Offer writing help when useful; do not require expanding the text first. The image can be downloaded or edited.                                                             |
| “Change the background in this picture.”                         | Prepare an image edit with that picture as the input. Preserve the original and show the new version alongside it.                                                                           |
| “Make this picture move.”                                        | Prepare a video request using that picture. Show the motion instruction, duration and other relevant settings.                                                                               |
| “Make a video from this description.”                            | Use an eligible text-to-video offer. If the selected model needs an image, explain the input requirement and offer a supported choice. Do not quietly change the task into making a picture. |
| “Use these clips to make a fifteen-second vertical video.”       | Open an editable arrangement of those clips. Let the creator trim, reorder, add text/audio, and export. Existing footage does not require new generation.                                    |
| “Make a post image and a short promo from these product photos.” | Prepare the requested outputs in the same project. Show the proposed work and its cost before dispatching paid generation. Let the creator revise either output independently.               |

The direct action should remain available when the creator already knows what they want. More involved requests can show an editable plan, but a plan must not introduce mandatory script, image, or storyboard approvals for every task.

For example, a creator might upload a product photo, make an edited still, download it, then combine an existing clip with a generated shot for a promo. Later they may change only the closing text. That last change should be an ordinary edit and export; it should not rerun video generation or replace the accepted still.

## State that must remain separate

These are proposed responsibilities, not instructions to create five new database collections.

| Responsibility        | What it owns                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project               | The work's identity, media, saved requests and outputs. Existing session and Studio identities must remain recoverable.                         |
| Current request       | The action being prepared, its instructions, explicit source media, settings and destination. It is editable until submitted.                   |
| Submitted job         | An immutable snapshot of the submitted request, its receipt, progress, results, failure and recovery. Later edits do not alter it.              |
| Media and versions    | Uploaded or generated files, recorded inputs, and the versions the creator chose. Inspection is separate from using something as an input.      |
| Video edit and export | Clip order, trims, text/audio, output settings and a particular exported revision. Changing the edit does not rewrite an already exported file. |

One project can have a finished image, a running clip, a failed alternative, and a video ready to export at the same time. Each should be understandable without assigning the entire project a single stage.

| Situation                                                     | Required behavior                                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The creator views image B while preparing an edit of image A. | The request remains attached to A. An explicit Edit/Use action changes the input and preserves unfinished work.                                          |
| A generation finishes while the creator works elsewhere.      | Save it to the submitted destination and show its status without replacing the current request or taking focus.                                          |
| One of several requested results fails.                       | Keep the successful results. Explain the failed part and the cost of deliberately trying it again.                                                       |
| The submit response is lost.                                  | Recover the accepted job using its receipt; do not submit a second generation.                                                                           |
| Generation succeeds but linking it to the project fails.      | Repair the link using the stored media and identity. Do not regenerate.                                                                                  |
| A model or action changes.                                    | Preserve the previous draft and inputs. Show incompatible inputs or settings and require an explicit resolution before dispatch.                         |
| The app closes during work.                                   | Restore the draft separately from submitted jobs and finished media. Reconnect to known jobs rather than treating a missing browser response as failure. |
| Export fails.                                                 | Retry export from the same saved edit revision. Do not rerun the source generations.                                                                     |
| The creator changes an edit after an export begins.           | The running export keeps its captured revision. The newer edit can be exported separately.                                                               |
| Another tab has changed the same draft.                       | Detect the revision conflict; preserve both versions and offer a choice instead of silently overwriting.                                                 |

## What to retain and change

Retain authentication, media ownership, durable handles, admission receipts, attachment repair, job recovery, generation adapters, Studio image editing, Sketch output acceptance, semantic editing and recorded input history. They are useful implementation assets, even though they do not establish a market advantage by themselves.

Replace the main workspace's inference of task from starting-frame state. Make writing help an explicit optional action. Replace the workspace-wide stage with status belonging to the request/job it describes. Present image work and clip work in a consistent project experience; keep Sketch available when the creator wants to draw.

Studio's typed action handling is a useful starting point for this design, but it is currently image-specific. Expanding it requires explicit video/edit/export contracts and tests. Simply teaching its language model more verbs would leave execution and persistence undefined.

Introduce a common project view over existing records before choosing a destructive migration. Jobs and Studio turns already have identities and statuses; adapt them into a consistent contract before inventing another ledger or a general scheduler. Any eventual write model must have one authoritative owner for each action, result and charge.

The smallest finished-video editor still needs clip ordering, trims, output aspect ratio, text placement/timing, basic audio handling and reliable export. Captions can start with creator-supplied text; automatic transcription and voice generation are separate capabilities. Features such as arbitrary character consistency or exact product preservation during generated motion should not be promised without evidence. Ordinary text layers can preserve approved copy without asking a video model to draw it.

## Revenue

Recommend a subscription with a clearly bounded generation allowance and optional additional usage. Charge for a usable creation/editing service with reliable project storage and delivery. Specify which generation, editing and export actions consume the allowance and show the amount before the creator commits. The allowance's name, denomination, price and exact inclusions remain undecided; the current free-testing policy remains in force.

The old “free attempts, pay at Keep” offer is not ready to reuse. Most generation cost has already occurred by the time someone likes a result. Exporting an accepted result must not secretly request a different generation. Treat generation, upscaling and ordinary export as separate actions, with explicit pricing if applicable.

Before setting a price, record provider and language-model costs for every attempt, including retries and technical failures; export compute; storage/delivery; and payment fees. Calculate cost per **accepted delivered output**, not just cost per successful API response. Track the number of attempts and time required to make a requested revision. Use these measurements to set an allowance that remains affordable when customers use it fully.

The customer failure policy also needs precise distinctions: a technical generation failure, a successfully generated result the creator dislikes, a missing project attachment, and a failed export are not the same event. Recovery must not duplicate customer charges. A subjective reroll can consume a disclosed allowance; attachment repair must not become another generation purchase.

There is no evidence here that a particular price will convert or that this direction will generate revenue. The work makes a commercial offer definable and testable. A generic promise to compete with every feature in Higgsfield would still be weak positioning.

## Build order and acceptance

This is the order of engineering dependencies, not a sequence imposed on the creator.

1. **Define the actions and state.** Specify image generation/editing, direct video generation, image animation, clip editing and export. Write down their required inputs, result identity, cost behavior and recovery. Walk through the mixed-state cases above before drawing a new layout.
2. **Replace the inferred main action.** Connect explicit image and video requests to the existing services. Make writing assistance optional. Prove that viewing a result, changing a model and receiving a background result preserve unfinished work.
3. **Make the project consistent.** Connect existing image and video histories through one understandable project view. Preserve existing IDs and links. Support reliable reopen and explicit source selection. Revisit ADR-0019/0022's separate-surface and operation-record restrictions against this concrete design.
4. **Finish videos.** Implement import, ordering, trimming, text/audio and export. Prove an exported revision can be revised without regenerating unaffected media. A public promise covering all three outputs remains incomplete until this works.
5. **Make payment and costs real.** Add server-enforced entitlements, bounded allowances, idempotent usage settlement, defined failure policies and measured costs. Spending enforcement must precede unsupervised public generation. Choose pricing from completion costs and the value of the finished service.

Before presenting the product as ready to charge for all three outputs, demonstrate three complete jobs: an edited still exported at its intended size; a usable clip created from text or supplied media and recovered after reopen; and a finished video assembled from selected material with text/audio and a reproducible export. Also demonstrate lost responses, partial failure, expired media links and export retry. Controlled-provider tests establish behavior; separate real-output review is needed to establish creative usefulness.

## Documentation changes in this assessment

`CONTEXT.md` now separates intended product behavior from current code. ADR-0024 removes the required order and amends the earlier single-loop rules; dated notices link back from ADR-0002, 0009, 0010, 0011 and 0015 without deleting their history. Studio/project consolidation, a composition model and the paid offer remain proposed work. No production code, provider policy or billing behavior is changed by these documents.

## Verification of this documentation change

- `npm run verify` passed type checking, quiet lint, architecture, all 3,674 unit tests, and the replay gate.
- `npm run lint:all` passed with 55 warnings in unchanged source/test files; the production build passed with existing tooling/bundling warnings.
- Formatting, changed-line whitespace, and local link targets in the four principal documents were checked.
- The cross-mode browser suite was attempted but could not start because its fixed port, 58141, was already occupied. The existing process was left running; no browser-pass claim is made for this turn.
- The mixed-success/failure stage derivation above was executed directly. No paid generation or creative-quality evaluation was performed. Passing existing checks does not demonstrate the proposed workflow, which is not implemented yet.
