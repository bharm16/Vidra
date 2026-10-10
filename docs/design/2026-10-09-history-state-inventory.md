# History and workflow: current implementation inventory

**Date:** 2026-10-09, America/Chicago. **Source baseline:** `0f541e60`, with the preceding workflow documentation changes present. This is a static source inventory for the workflow contract. It does not implement the redesign or prove behavior in a running browser. No provider calls or tests were run for this inventory. “Missing” below means the inspected owner does not supply that behavior; it is not a claim that every file in the repository was exhaustively searched.

## The history problem

The current product has several different histories, with different identities and persistence rules. None is a complete conversation/session state model:

| Existing record           | What the source records                                                                                                                                                                                                                                                                                                                                             | What it does not establish                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio thread             | Chronological turns, user message, policy decision, image calls, consumed image identities, spend reservation and outcomes. [Turn record](../../server/src/services/studio/types.ts#L138).                                                                                                                                                                          | A conversation branch, edited-message revision, context cutoff, request proposal/approval, or explicit mapping from a conversation branch to an active media version. |
| Session words versions    | Text snapshots with `rewordedFromVersionId`; generated media live inside each version. [Version schema](../../shared/schemas/session.schemas.ts#L221).                                                                                                                                                                                                              | A full request snapshot including action, inputs and settings, or a history of every unsent draft edit.                                                               |
| Media ancestry            | One display ancestor plus a list of all known contributing inputs and production provenance. [Take schema](../../shared/schemas/session.schemas.ts#L188).                                                                                                                                                                                                           | A conversation branch. A media ancestor and the preceding chat turn are different relationships.                                                                      |
| Text undo/redo            | Local stacks of text/highlight snapshots, typing grouped by a 400 ms pause, direction changes and larger edits. New divergence clears redo. [Undo/redo](../../client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/useUndoRedo.ts#L81), [divergence](../../client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/useUndoRedo.ts#L277). | Undo of submitted jobs, image versions, model/settings changes, saved video edits, shares, deletion or spending.                                                      |
| Span edit context         | A module-level list of the last 50 applied substitutions; last 10 are returned by default. It resets on reload. [Span history](../../client/src/features/prompt-optimizer/hooks/useEditHistory.ts#L7).                                                                                                                                                              | A persisted, project-scoped conversation memory. The module has no session/user key; `clearSpanEditHistory` is described as a test seam.                              |
| Draft and history storage | Local initial words, local draft entries, cloud session records, debounced output/version writes and remote-history/local-draft merging. [Initial words storage](../../client/src/features/workspace-shell/utils/anchorDraft.ts#L10), [history merge](../../client/src/hooks/usePromptHistory/hooks/useHistoryPersistence.ts#L434).                                 | One explicit draft revision, cross-tab conflict resolution, or a single reliable “saved” fact for all these stores.                                                   |

The new contract should name these separately. Reusing the word “history” for all of them would preserve the ambiguity.

## Evidence and decisions the contract must settle

### 1. Viewing an image and editing it are coupled in Studio

**Observed:** Studio's selected image is both the visible selection and the next edit source. Selection is persisted; submission captures that selection. A finished edit/transform finds its last successful image and automatically selects it. The main session instead opens a read-only viewer, and Animate explicitly changes the starting image. [Studio state](../../client/src/features/studio/hooks/studioReducer.ts#L31), [submission capture](../../client/src/features/studio/hooks/useStudioProject.ts#L291), [selection write](../../client/src/features/studio/hooks/useStudioProject.ts#L367), [automatic selection advance](../../client/src/features/studio/hooks/useStudioProject.ts#L261), [session view and Animate](../../client/src/features/workspace-shell/CanvasWorkspace.tsx#L325).

**Consequence:** Browsing B while editing A has different meaning in the two surfaces. The automatic edit completion has no check that the user left the original edit source selected; it can overwrite a newer selection.

**Must settle:** Viewer selection; explicit edit input; currently prepared request; default continuation after a result; whether a completion may change any of those; and what happens when a newer request or selection exists. A successful edit may become a suggested next input without replacing the user's newer work.

### 2. Studio carries chronological conversation context across every edit

**Observed:** The policy receives the full chronological turn list, the latest generate decision's base prompt, the most recent 12 generated-image inventory entries, all registered attachments and the current selected image. Source prompts accompany image ids; the description path shown here is text. The system prompt asks the model to infer references such as “the navy one,” “the original” and “the latest.” It forbids clarification after the project's first message and rewrites each generation prompt from accumulated decisions. [Context construction](../../server/src/services/studio/StudioPolicyEngine.ts#L330), [project state](../../server/src/services/studio/StudioPolicyEngine.ts#L400), [inventory bound](../../server/src/services/studio/StudioPolicyEngine.ts#L115), [policy rules](../../server/src/services/studio/templates/studio-turn-system.md#L30).

**Gap:** There is no branch identity, explicit context cutoff or per-media revision's instruction set in the turn record. Selecting an older image does not remove later instructions from the policy's conversation context.

**Must settle:** Editing an earlier version; branching from an earlier message; amending a sent message; changing one's mind; what “undo that,” “same again,” “the other one,” “start over” and “keep everything else” mean; whether instructions apply to one result, one branch or the project; excluded/rejected instructions; ambiguous references; how long conversations are summarized without inventing decisions; and provenance of any carried-forward instruction. The selected pixels, the applicable instructions and the chat transcript cannot be interchangeable.

### 3. Studio history is a turn list, not a mutable chat log

**Observed:** Each stored turn contains its user message and decision/results; the reducer explicitly uses turns as the thread. Routes offer create/list/get turns; the client API exposes no edit-message or branch operation. Turns are ordered by `createdAtMs`. Projects are capped at 500 turns before policy/model work; the service uses that same bound on reopen. [Reducer](../../client/src/features/studio/hooks/studioReducer.ts#L1), [API](../../client/src/features/studio/api/studioApi.ts#L124), [routes](../../server/src/routes/studio.routes.ts#L272), [ordering](../../server/src/services/studio/storage/FirestoreStudioProjectStore.ts#L155), [cap](../../server/src/services/studio/StudioService.ts#L301), [cap enforcement](../../server/src/services/studio/StudioService.ts#L1034).

**Must settle:** Whether sent content is immutable; how corrections create new revisions; whether a branched conversation shares old outputs by reference; whether later turns remain visible after branching; stable ordering for simultaneous turns; pagination/limits; and what happens at a limit. “Edit message” must state whether it merely changes a displayed annotation, prepares a new request, or creates a branch; it cannot silently rewrite the instructions credited with producing existing media.

### 4. Unsent Studio work has weak recovery

**Observed:** Composer text is component-local `useState` and is cleared before `onSend`. The send hook creates a fresh `submissionId`, captures selection/pin/attachments and clears staged attachments. An error clears the optimistic message. The hook retains no persisted submission envelope. Attachments are uploaded and registered before being staged; removing a chip only removes it from local pending attachments. [Composer](../../client/src/features/studio/components/StudioComposer.tsx#L50), [send](../../client/src/features/studio/hooks/useStudioProject.ts#L291), [failure reducer](../../client/src/features/studio/hooks/studioReducer.ts#L241), [attachment upload](../../client/src/features/studio/api/studioApi.ts#L168), [unstage](../../client/src/features/studio/hooks/useStudioProject.ts#L401).

**Consequence:** A fresh deliberate resend creates a different submission identity. The transport can replay the original body during its own retry, but the UI does not establish durable reload/manual-retry recovery for the unsent/uncertain turn. Registered attachments also remain part of the project inventory after local unstaging.

**Must settle:** Draft save scope and durability; send failure before/after server acceptance; recoverable text and staged inputs; same-attempt retry; explicit new attempt; unsent references versus reusable project assets; attachment removal; upload-complete/register-failed; and leaving the project during upload or authentication.

### 5. Studio's local busy flag is not an authoritative job state

**Observed:** The client considers a turn active only if `pendingTurnId` or `optimisticMessage` is set. Opening a project resets both even when loaded turns contain a running turn. Poll failures clear both. Polls run only while `pendingTurnId` exists. The server reconciles a running turn after ten minutes without updates when it is next read. [Busy flag](../../client/src/features/studio/hooks/studioReducer.ts#L84), [project open](../../client/src/features/studio/hooks/studioReducer.ts#L178), [failure reset](../../client/src/features/studio/hooks/studioReducer.ts#L241), [poll loop](../../client/src/features/studio/hooks/useStudioProject.ts#L245), [interrupted-turn recovery](../../server/src/services/studio/StudioService.ts#L919), [grace window](../../server/src/services/studio/StudioService.ts#L312).

**Inferred gap:** Reloading a currently running project or one polling error can leave the UI no longer watching that turn and permit another send. This is a static trace, not a browser reproduction.

**Must settle:** Accepted/running work independently of observation; reconnecting; stale progress; polling failures; timeout versus known failure; recovery after server death; concurrency across tabs; and UI access while a job runs. A lost connection must not become a completed failure or an implicit cancellation.

### 6. Stable submission ids are present, but the claim boundary needs scrutiny

**Observed:** Studio hashes project id plus submission id to derive a turn id. It looks up an existing turn before policy work. `reserveTurn` transacts the daily reservation and turn write, but reads only the usage document before writing the turn; it does not atomically refuse an already-created turn. The lookup does not compare an original payload hash. [Lookup](../../server/src/services/studio/StudioService.ts#L1007), [reservation transaction](../../server/src/services/studio/storage/FirestoreStudioProjectStore.ts#L200). General picture admission has a separate request-idempotency owner. [Idempotency service](../../server/src/services/admission/idempotency/RequestIdempotencyService.ts).

**Inferred gap:** Two concurrent Studio POSTs with the same new id can pass the lookup and both reserve/execute; a later different payload with the same id simply resolves the existing record. Existing same-id sequential replay is useful, but does not prove atomic concurrent acceptance.

**Must settle:** Id scope; request-payload binding; create/claim atomicity; duplicate in-flight submission; same id/different content conflict; accepted-response loss; batch child identities; and idempotent accounting. Transport retries reuse identity. Deliberate alternative generation receives a new identity and records which earlier request it repeats.

### 7. Session text versions provide ancestry, but not every kind of revision

**Observed:** A words version has text/signature/time and an optional reword parent. Creating a version compares text with the last array entry; it records the active version as parent when it mints a new one. Changes to model/inputs/settings do not form part of that comparison. Persisted edit metadata is an edit count and up to 50 timestamp/delta/source entries, not the old/new text content. [Version creation](../../client/src/features/prompt-optimizer/PromptCanvas/hooks/useVersionManagement.ts#L267), [automatic creation](../../client/src/features/prompt-optimizer/PromptCanvas/hooks/useVersionManagement.ts#L319), [edit metadata](../../client/src/features/prompt-optimizer/context/hooks/useVersionEditTracking.ts#L28), [schema](../../shared/schemas/session.schemas.ts#L221).

**Must settle:** Text revision versus full request revision; whether changing only settings produces a new saved setup; changing instructions back to identical text on a different branch; numbering; branch parent; content identity versus record identity; and how legacy versions with unknown ancestry display. Never infer a missing parent from array order.

### 8. Editing during generation is not independently persisted today

**Observed:** Output autosave waits one second and refuses a write while generation is active; session draft sync also skips entries with active generations. The stated reason is protecting the active generation's identity from prompt edits. A before-unload handler calls an asynchronous flush. [Autosave guard](../../client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/useAutoSave.ts#L77), [draft guard](../../client/src/features/prompt-optimizer/context/hooks/useDraftHistorySync.ts#L105), [caller and unload](../../client/src/features/prompt-optimizer/context/PromptResultsActionsContext.tsx#L174).

**Gap:** These guards do not establish durable saving of a newer independent draft while an accepted request runs. An asynchronous unload call alone is not proof that the browser will finish the write.

**Must settle:** Durable draft save/acknowledgment; edits while jobs run; navigation before debounce; reload/crash/offline; local-storage failure; cloud save failure; exact saved revision; and retry after a newer edit. The accepted request must own its snapshot so saving the next draft cannot corrupt it.

### 9. Reuse setup is explicit but incomplete as a full-request restore

**Observed:** Session browsing leaves the draft alone. Reuse copies prompt, model, tier, aspect ratio, duration, FPS and saved generation parameters. Its function has no source-media/start-frame setter and does not restore source inputs. Animate separately arms a source picture. [Read-only viewing](../../client/src/features/workspace-shell/CanvasWorkspace.tsx#L325), [reuse implementation](../../client/src/features/prompt-optimizer/PromptCanvas/utils/reuseGeneration.ts#L16), [Animate](../../client/src/features/workspace-shell/CanvasWorkspace.tsx#L377).

**Must settle:** Exactly which values each action restores; preserve/swap/duplicate the unfinished draft; one-click use of an earlier media version; unavailable or deleted input; retired model; unsupported setting; and whether missing fields remain unknown or receive disclosed defaults. “Use these settings,” “Edit this image,” “Animate this image” and “Repeat this request” need distinct contracts.

### 10. Session navigation can label accepted video work as failed locally

**Observed:** The generation hook tracks browser abort controllers. When the active session/version differs, it aborts the local controller and marks a pending/generating entry failed with “Prompt version changed,” clearing `jobId`. Resume exists only for entries still pending/generating with a job id; a polling error on resume marks failed and clears the id. [Scope abort](../../client/src/features/generations/hooks/useGenerationActions.ts#L285), [resume](../../client/src/features/generations/hooks/useGenerationActions.ts#L502).

**Gap:** The inspected client path performs no provider cancellation; browser observation and durable server execution can disagree. Server job statuses are only queued/processing/completed/failed. [Server job contract](../../server/src/services/video-generation/runtime/types.ts#L4).

**Must settle:** User cancel versus stop watching; cancel requested/acknowledged/too late/unsupported; cancellation before and after provider acceptance; completion arriving after cancel; server terminal truth; and continuing other work without abandoning recovery for existing jobs.

### 11. Completion, durable storage, attachment and active input are already distinct

**Observed:** Video jobs carry attachment status independently from generation status. The worker completes/stores before attaching and keeps the same result identity for repair. Studio/Sketch handoffs also report attachment and arming separately. [Job attachment](../../server/src/services/video-generation/runtime/types.ts#L91), [completion and attachment](../../server/src/services/video-generation/runtime/processVideoJob.ts#L314), [Studio result](../../shared/schemas/studio.schemas.ts#L96), [Sketch result](../../shared/schemas/sketch.schemas.ts#L99).

**Must retain:** Successful media must survive partial failure. Repair of project membership must not regenerate media, create another result or repeat a charge. Explicitly distinguish generation not completed, provider produced bytes but persistence failed, stored result without project membership, attached result not set as input, and temporary inability to view stored media.

**Must settle:** Whether missing membership blocks further edits/downloads; recovery discoverability after reopen; deleted destination; final failure/expiry of recovery debt; and ownership of every repair action. A new unified project must preserve existing receipts and source ids rather than introduce a second contradictory ledger.

### 12. Studio batches and spending already have partial outcomes

**Observed:** Turn status is running/complete/partial/failed. Each stable call index is running/succeeded/failed. `providerSpent` distinguishes a failed storage outcome after provider output from an ordinary failed call. Checkpointing preserves sibling call results; settlement atomically records the terminal turn and refund. [Call and turn types](../../server/src/services/studio/types.ts#L115), [checkpoints and settlement](../../server/src/services/studio/storage/FirestoreStudioProjectStore.ts#L251).

**Must settle:** A partial batch's retry scope; retry failed slots versus generate more; keeping successful siblings; original versus retry output order; exact per-attempt cost; technical failure versus disliked result; and whether a later successful repair changes attempt status or creates a new event. Do not hide a failed attempt by overwriting it with the retry.

### 13. Sketch has exact-output acceptance but ephemeral drawing history

**Observed:** The loop permits one frame in flight plus a newest-wins pending frame. Live output binds image, exact drawing snapshot and dispatch settings. Failure permits one bounded retry, retaining the previous output; allowance exhaustion clears in-flight/pending work until reset. “Use this” receives the displayed output object as an argument and binds an idempotency key to that object, not later screen state. Its key is mount-scoped, and late navigation/auth responses are guarded. [Loop](../../client/src/features/realtime-sketch/hooks/generationReducer.ts#L7), [exact output](../../client/src/features/realtime-sketch/hooks/generationReducer.ts#L34), [failure and allowance](../../client/src/features/realtime-sketch/hooks/generationReducer.ts#L209), [acceptance](../../client/src/features/realtime-sketch/hooks/useAcceptLiveOutput.ts#L14), [scope/key](../../client/src/features/realtime-sketch/hooks/useAcceptLiveOutput.ts#L75).

**Must settle:** Whether a future drawing document persists; local stroke undo versus accepted generated versions; multiple acceptances; accepting the displayed older result while a newer frame is pending; changed settings; leaving before acceptance returns; which destination owns an accepted output; and recovering a successful acceptance after the editor's ephemeral state has gone. Keep the exact-output rule.

### 14. Authentication and persistence have several separate scopes

**Observed:** The HTTP transport offers sign-in on an unauthenticated 401 and retries the same request once; cancellation returns the original 401. Version writes carry user identity and are ordered per session, rejecting if identity changes before write. Initial words and generation preferences use global browser keys; cloud-history loading merges local drafts and falls back to local history on error. Sign-out explicitly clears the local prompt repository and stored logs. [Auth retry](../../client/src/services/http/AuthRetryTransport.ts#L14), [write ordering](../../client/src/hooks/usePromptHistory/hooks/useHistoryPersistence.ts#L276), [initial words key](../../client/src/features/workspace-shell/utils/anchorDraft.ts#L10), [preference keys](../../client/src/features/prompt-optimizer/context/promptStateStorage.ts#L4), [load/fallback](../../client/src/hooks/usePromptHistory/hooks/useHistoryPersistence.ts#L434), [sign-out](../../client/src/repositories/AuthRepository.ts#L32).

**Gap:** These owners do not define a unified draft revision/conflict protocol for multiple tabs, devices or accounts. Session hydration is keyed by session id with a short cache and guards route/request identity; it has no user key in that cache. [Hydration](../../client/src/features/prompt-optimizer/context/WorkspaceSessionContext.tsx#L24).

**Must settle:** Guest draft adoption; auth cancellation; token expiry; account switch; sign-out with unsaved work; per-user/per-project/per-tab draft scope; stale tab writes; conflict resolution preserving both drafts; offline read-only versus writable mode; disconnected job tracking; and which caches must be cleared or partitioned by identity. Cached/local data cannot be described as an acknowledged cloud save.

### 15. Archive, delete and public sharing have different consequences

**Observed:** Session media archive retains the record and only allows removal when no live take names it as display ancestor. It does not check every `sourceInputs` relationship or an active request input. Whole-session deletion attempts job cancellation then deletes the session, proceeding even if cascade fails. Studio project deletion removes project/turn records. Public sharing copies a storage path, description and model to a separate share record; resolve reads that record without re-reading the session. The reviewed share API offers mint/resolve, without a revoke/update operation. [Archive](../../server/src/services/sessions/SessionService.ts#L625), [session delete](../../server/src/services/sessions/SessionService.ts#L692), [Studio deletion](../../server/src/services/studio/StudioService.ts#L860), [share](../../server/src/services/share/ShareService.ts#L30), [share routes](../../server/src/routes/share.routes.ts).

**Consequence:** Removing a session or changing its text does not by itself revoke or update an already minted share. This independence must be explicit to the creator.

**Must settle:** Hide/archive versus trash/delete; restoration window; ancestors still needed by descendants/compositions; running jobs; staged drafts referencing removed media; storage retention; shares after archive/delete; revocation and expired links; owner versus public descriptions; sharing a specific immutable revision; export files already downloaded; and intentional deletion of original uploads. Do not treat a hidden tile as erased data.

### 16. Export and finished-video revision history remain new work

**Observed:** Current contracts identify image/clip downloads and clip sharing, while finished-video assembly, trims, text/audio editing and composition export are absent from the active product implementation. The reset document explicitly records those as gaps. [Current implementation](../../CONTEXT.md#current-implementation), [workflow assessment](2026-10-09-product-and-workflow-reset.md#what-the-source-establishes).

**Must settle:** A persistent video-edit document; immutable edit revisions; media dependency versions; ordinary edit undo/redo; replace clip versus revise underlying source; missing media; text/font/audio assets; export snapshot and settings; export progress/failure/retry; edits during export; outdated exports; more than one format; and whether a replacement propagates to existing compositions. No generation-history UI proves these capabilities.

## Minimum transition coverage for the normative contract

The contract needs explicit allowed transitions and forbidden side effects for each of these event families. This is an inventory of obligations, not a replacement transition table:

1. Open new work, reopen existing work, missing/deleted work, permission denied, malformed legacy record, loading error and offline cached open.
2. Type, attach, remove attachment, choose action/model/settings/destination, save success/failure, clear draft, switch draft, leave/reload and recover.
3. Inspect media, explicitly use as input, edit an old version, branch, repeat request, correct a sent message, undo/redo and resolve an ambiguous reference.
4. Submit, auth-required/cancelled/changed, validation rejected, quota denied, same-tick double press, acceptance unknown, same-id replay/conflict and new intentional attempt.
5. Queue, begin provider work, progress, partial output, provider/storage/record/link/view failure, known cancellation, uncertain cancellation, completion race and reconnect.
6. Finish while user is viewing another result, editing a newer draft, in another project/tab/account, offline or no longer in the app.
7. Repair durable result membership/input activation, recover after a restart, deleted destination, expired media URL and missing underlying bytes.
8. Assemble, edit, snapshot/export, edit while exporting, failed export, retry, replace source media and inspect an older export.
9. Archive/restore/delete a result, parent, conversation, project or upload; all corresponding active-job, draft, composition and sharing dependencies.
10. Share/revoke/share again, old/new revision, permission change, stale public link and downloaded-file independence.
11. Resolve same-draft cross-tab/device conflicts, account transition, insufficient local storage and partial cloud/local persistence.
12. Reach history/attachment/output/request limits; migrate/read old records without fabricating missing prompts, ancestry, costs or settings.

Every transition should declare its actor, preconditions, captured identities, durable writes, output events, visible state, allowed next actions, failure/retry behavior and actions that must remain untouched. Product-level completeness needs a named contract for these combinations; enumerating a few top-level screens would leave the important gaps intact.
