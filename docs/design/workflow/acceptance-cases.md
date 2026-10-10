# Workflow acceptance cases

Generated from `acceptance-cases.json`; these are required behaviors, not claims of passing application tests.

**137 interaction cases and 22 executable model traces.** Every named rule in [the contract](workflow-state-contract.md) is referenced by at least one case.

## History

### HISTORY-01 — H01, I04

**Given:** Two projects and media items have identical names and timestamps.

**When:** Open or reference one by its ID.

**Then:** Only that ID is addressed; no title/time-based merge occurs.

### HISTORY-02 — H02, H04

**Given:** Image A produced edit B; B produced edit C.

**When:** Edit A to produce D.

**Then:** D has A as primary parent; B and C remain with their original source IDs.

### HISTORY-03 — H02, H05, I11

**Given:** Image C is used to generate clip V.

**When:** Mark image D preferred afterward.

**Then:** V still records and displays C as its source.

### HISTORY-04 — H03, J07

**Given:** A four-output request has slots 1 through 4.

**When:** Outputs arrive 4, 2, then failure 1, then 3.

**Then:** Cards retain slot numbers; failure 1 remains visible; results do not renumber.

### HISTORY-05 — H06, I09

**Given:** An item has preferred version A and unfavorited result B.

**When:** B completes, then the creator favorites B.

**Then:** Completion does not change preference; favorite changes only B's marker.

### HISTORY-06 — H07, C03, I02

**Given:** Request Q1 produced A; later Q2 and Q3 produced other results.

**When:** Edit and run Q1 again with changed words.

**Then:** New Q4 records revisesRequestId Q1 and Q1's original parent context; Q1-Q3 and their outputs remain.

### HISTORY-07 — H08, I03

**Given:** Q1 is accepted before Q2 but finishes afterward.

**When:** Observe both results and a duplicate Q1 completion event.

**Then:** History stays Q1 then Q2; each output appears once under its originating request.

### HISTORY-08 — H09, I04

**Given:** Image A is owned in project P and referenced in conversations X and Y.

**When:** Submit one edit from each conversation.

**Then:** Both requests reference exact A; histories remain distinct and no storage duplicate is required.

### HISTORY-09 — H10, I02

**Given:** Request Q and media A are accepted/stored.

**When:** Rename project, conversation and media title.

**Then:** Request hash, original words, media bytes and ancestry are unchanged.

### HISTORY-10 — H11, D01

**Given:** A project gallery is open with no active conversation.

**When:** Choose Edit on A twice during destination creation.

**Then:** One idempotent destination conversation/draft is created; no generation occurs.

### HISTORY-11 — H11, C11

**Given:** Library image A belongs to project P while Q is active.

**When:** Choose Copy to Q.

**Then:** Create an owned Q copy, preserve P's original, and do not copy private conversation instructions or alter Q's active draft.

### HISTORY-12 — H05, I01

**Given:** Draft X edits A; viewer shows B.

**When:** Open B fullscreen and close it.

**Then:** Draft X's source, instructions, model, context and destination remain unchanged.

### HISTORY-13 — H07, C03

**Given:** Result B was an edit of A under request Q.

**When:** Choose Make another variation on B.

**Then:** New draft copies Q's original A input; next result is an alternative from A, not an edit of B.

## Context

### CONTEXT-01 — C01, I08

**Given:** A-to-B-to-C edits exist; another branch from A requested blue lighting.

**When:** Edit B with warmer lighting.

**Then:** Context contains B's ancestor path and new instruction; C's later edits and the blue sibling instruction are excluded.

### CONTEXT-02 — C02, H04

**Given:** A is primary base and B is a visual reference with unrelated history.

**When:** Submit an image edit.

**Then:** Record both inputs and roles; B's conversation instructions are excluded unless explicitly selected as context.

### CONTEXT-03 — C03, C07

**Given:** An old request used project instruction revision N; project is now N+1.

**When:** Reuse the old request.

**Then:** Draft retains N and shows the available update; N+1 is applied only explicitly.

### CONTEXT-04 — C04, I01

**Given:** Composer targets A while the viewer shows B.

**When:** Send Make it darker with Edit image selected.

**Then:** The visible bound input A is used; viewing B supplies no target change.

### CONTEXT-05 — C04, I10

**Given:** No unique media input is bound and several result batches exist.

**When:** Enter Use the second one.

**Then:** A persisted clarification asks which request/slot; no media dispatch occurs.

### CONTEXT-06 — C05, D01

**Given:** A meaningful draft edits A with branch context.

**When:** Choose New request.

**Then:** Old draft is parked; new draft has no media target or conversation-specific context and retains the chosen project-instruction revision.

### CONTEXT-07 — C06, I08

**Given:** A branch context exceeds the selected model's catalog limit.

**When:** Try to submit.

**Then:** Submission is context_limit blocked; no hidden truncation or automatic summary occurs.

### CONTEXT-08 — C06, C08

**Given:** A proposed summary covers context requests Q1-Q9.

**When:** Apply the reviewed summary.

**Then:** New draft revision records summary text and covered IDs; original history remains; no generation runs.

### CONTEXT-09 — C07, I02

**Given:** One draft and one accepted request use project instructions N.

**When:** Save project instructions N+1.

**Then:** Existing draft shows update availability but keeps N; accepted request remains immutable.

### CONTEXT-10 — C08, D07

**Given:** Wording assistance was requested for draft revision 4; revision 5 now exists.

**When:** The suggestion arrives.

**Then:** Show a diff tied to revision 4; do not overwrite revision 5; deliberate Apply creates one undoable revision.

### CONTEXT-11 — C09, I02

**Given:** A clarification targets draft D revision 4.

**When:** Answer after D advanced to revision 5.

**Then:** Save the answer as an immutable entry and stale proposal; only Apply as new draft or explicit resolution may use it.

### CONTEXT-12 — C09, I10

**Given:** Two questions in the same conversation await answers.

**When:** Send an answer without a unique question reference.

**Then:** Ask which question; neither target draft changes and neither request runs.

### CONTEXT-13 — C10, I08

**Given:** Draft uses A's history and pixels.

**When:** Replace its primary image with unrelated B inside the draft.

**Then:** Show input/context difference and block submit until the creator chooses B's directions or explicitly keeps A's directions.

### CONTEXT-14 — C11, H04

**Given:** An owned legacy image has no producing-request/settings snapshot.

**When:** Choose View, then attempt exact Reuse, then choose Edit.

**Then:** View works; exact Reuse is unavailable; Edit opens with unknown/empty historical context and requires new instructions.

### CONTEXT-15 — C12, I11

**Given:** A mask is bound to image A at dimensions and transform T.

**When:** Replace A with B or crop/rotate/resize A.

**Then:** The mask is invalid until explicitly redrawn/remapped; it cannot silently apply to different pixels.

## Draft

### DRAFT-01 — D01, I05

**Given:** An active draft contains custom text and settings.

**When:** Choose Edit another result.

**Then:** Park the old draft and open a new explicit-target draft; reopening the old draft restores its content.

### DRAFT-02 — D01

**Given:** Active draft has only untouched defaults.

**When:** Choose New request.

**Then:** Replace the empty draft without creating a parked empty entry.

### DRAFT-03 — D02, I05

**Given:** Request Q runs from draft D revision 3.

**When:** Type a new follow-up and change settings.

**Then:** Save a separate draft/revision while Q's accepted snapshot remains revision 3.

### DRAFT-04 — D03, J01, I03

**Given:** Two tabs display the same saved draft ID/revision.

**When:** Both submit simultaneously with different client submission IDs.

**Then:** Atomic draft-revision uniqueness produces one receipt, reservation and execution; mismatching hashes conflict.

### DRAFT-05 — D04, H05

**Given:** A single supported image edit is running.

**When:** Type another edit in the visibly waiting follow-up draft.

**Then:** Pending input is Q's exact slot; submit stays disabled until its original-project durable result exists.

### DRAFT-06 — D04, I06

**Given:** A follow-up draft waits on Q's slot and already contains text.

**When:** Q completes successfully and attaches to its original project.

**Then:** Resolve only the declared input; preserve words/settings; do not auto-submit or move the viewer.

### DRAFT-07 — D04, I12

**Given:** A follow-up draft waits on Q.

**When:** Q definitively fails or its output is lost.

**Then:** Keep follow-up words and failed dependency; offer choose input/reuse setup; never substitute Q's original source automatically.

### DRAFT-08 — D05, H03

**Given:** A batch produces four images; slot 2 is ready while others run.

**When:** Choose slot 2 for editing.

**Then:** Bind slot 2 exactly and permit an otherwise valid request; other slots keep their identities/statuses.

### DRAFT-09 — D06, I06

**Given:** Draft X waits on Q, then the creator starts independent draft Y.

**When:** Q completes.

**Then:** Update parked X's declared dependency and Q's history only; active Y/viewer/navigation remain unchanged.

### DRAFT-10 — D07, I09

**Given:** Text has undo history; a generation has already completed.

**When:** Press Undo in the text field, then type a new edit.

**Then:** Undo affects text only; result and charge remain; new text clears only that draft's redo path.

### DRAFT-11 — D08, I05

**Given:** Revision 8 is being saved; revision 9 is typed.

**When:** Acknowledgment for revision 8 arrives.

**Then:** Revision 9 remains unsaved/remotely pending; the old ack cannot label it Saved.

### DRAFT-12 — D08, D10

**Given:** Local checkpointing fails but current revision 9 is acknowledged on the server.

**When:** Navigate or sign out.

**Then:** Navigation is allowed with accurate storage status; no forced export/discard of remotely safe work.

### DRAFT-13 — D09, E04

**Given:** A video edit at revision 7 has an export in progress.

**When:** Restore edit revision 3.

**Then:** Create revision 8 with revision 3's contents; export continues rendering revision 7.

### DRAFT-14 — D10, R06

**Given:** Newest draft revision is neither locally checkpointed nor server-acknowledged.

**When:** Try to leave through app navigation/sign-out.

**Then:** Offer retry, explicit draft export/continue, or discard; do not claim work is saved.

### DRAFT-15 — D11, I06

**Given:** A video request, export, download, or text-assistance request completes.

**When:** Continue working.

**Then:** No implicit next image/video edit target is created; export keeps source editor; download keeps draft; text produces an explicit proposal.

## Action

### ACTION-01 — A01, I15

**Given:** A catalog entry lacks a capability, cost bound or mandatory recovery deadline.

**When:** Try to run the affected action.

**Then:** Action is unavailable with the missing-policy/capability reason; no permissive fallback occurs.

### ACTION-02 — A02, I13

**Given:** Client shows a source as valid but ownership changed before submit.

**When:** Submit.

**Then:** Server denies before accepting executable work and preserves the draft; stale UI grants nothing.

### ACTION-03 — A03, I10

**Given:** A draft has no authorization, a conflict and a missing input.

**When:** Inspect readiness.

**Then:** Show all three reasons with authorization primary; submit remains disabled.

### ACTION-04 — A04, I11

**Given:** A valid image-animation draft has model-specific duration and inputs.

**When:** Switch to an incompatible model.

**Then:** Preserve old revision and show unresolved values; no silent clamp/removal; require explicit resolution.

### ACTION-05 — A05, H03

**Given:** A reviewed request asks for two outputs.

**When:** Assistant or provider proposes four after acceptance.

**Then:** Do not increase accepted slots/spend; additional work requires a new reviewed request.

### ACTION-06 — A05, H05

**Given:** A proposed multi-step request still needs an uncreated intermediate image.

**When:** Try to run the later step.

**Then:** Keep that step a draft until an exact valid input exists; no hidden dependency scheduling occurs.

### ACTION-07 — A01, C08

**Given:** The creator selects Ask or Improve wording.

**When:** Submit a description of desired media.

**Then:** Return text/proposal only; no image/video generation occurs until the explicit media action is run.

## Job

### JOB-01 — J01, I03

**Given:** A frozen request was accepted under submission S and hash H.

**When:** Replay S/H repeatedly and concurrently.

**Then:** Return its same receipt; no second reservation, queue item or provider execution.

### JOB-02 — J01, I02

**Given:** Submission S is bound to hash H.

**When:** Send S with different instruction/input hash K.

**Then:** Reject identity conflict; neither original snapshot nor job is overwritten.

### JOB-03 — J02, I12

**Given:** Submit request timed out without a receipt.

**When:** Reload, reconnect and press Check status.

**Then:** Restore envelope/S; query acceptance; recover existing receipt or resend identical S only after proven absence.

### JOB-04 — J03, R05

**Given:** Server definitively rejects before acceptance because authentication expired.

**When:** Sign in again.

**Then:** Preserve draft; no automatic generation; creator submits the restored valid revision deliberately.

### JOB-05 — J04, I12

**Given:** A worker lease expires after a provider may have accepted.

**When:** Replacement worker claims recovery.

**Then:** Reconcile original attempt; do not make a second external generation call solely because the lease expired.

### JOB-06 — J05, I07

**Given:** A generation failed before provider acceptance with proof and retry budget remaining.

**When:** Apply allowed automatic retry policy.

**Then:** Retain original reviewed inputs/model and maximum usage; record attempt; never silently switch provider or creative settings.

### JOB-07 — J05, I07

**Given:** Provider may have accepted, or another provider would be required.

**When:** Automatic retry is considered.

**Then:** Do not regenerate; reconcile or offer a new explicit reviewed request.

### JOB-08 — J06, I14

**Given:** Provider returned an image but durable storage failed.

**When:** Observe and retry saving.

**Then:** Show Made; saving needs attention; retry the same output; no Ready claim or duplicate generation/charge.

### JOB-09 — J06, P04

**Given:** Stored output cannot attach to a trashed/missing original project.

**When:** Attach to owner recovery inbox.

**Then:** Show Ready in recovery; preserve original destination; allow owned download/copy; no silently created project.

### JOB-10 — J07

**Given:** Two of four slots are ready and one failed while one is running.

**When:** Compute request status.

**Then:** Keep in progress with counts; do not mark partial terminal until the last slot resolves.

### JOB-11 — J07

**Given:** Two slots are ready, one failed and one cancelled.

**When:** Compute request status.

**Then:** Mark partial and keep both ready outputs and both terminal slot records.

### JOB-12 — J07

**Given:** No output is ready and every slot is cancelled.

**When:** Compute request status.

**Then:** Mark cancelled; retain slot IDs and cancellation evidence.

### JOB-13 — J07

**Given:** No output is ready; some slots failed and others cancelled.

**When:** Compute request status.

**Then:** Mark failed with per-slot details; do not claim a fully cancelled request.

### JOB-14 — J08, I07

**Given:** Saving failed and the provider output has now expired irrecoverably.

**When:** User requests recovery.

**Then:** Record output_lost; disable impossible same-output repair; new generation is a new explicit request.

### JOB-15 — J09, I04

**Given:** Slot is stored at server revision 12.

**When:** Receive revision 10 Running, then duplicate revision 12.

**Then:** Do not revert or duplicate it; ignore/log stale observations.

### JOB-16 — J09, I12

**Given:** Two authoritative events claim contradictory terminal outcomes.

**When:** Observe the conflict.

**Then:** Keep evidence/media and enter reconciliation; callback timestamp cannot choose truth.

### JOB-17 — J10, P03

**Given:** A queued job has not dispatched externally.

**When:** Cancel races with worker start.

**Then:** Server atomic order decides: confirmed pre-dispatch cancellation releases usage, otherwise request provider cancellation and retain execution status.

### JOB-18 — J11, I14

**Given:** Cancellation was requested but not confirmed.

**When:** The job finishes first.

**Then:** Keep result; label completion-before-cancel; apply accepted usage policy; do not change active draft/selection.

### JOB-19 — J11, P04

**Given:** Cancellation was confirmed and customer usage released.

**When:** A late provider result arrives.

**Then:** Store/reconcile the result and provider expense; never re-debit released customer usage.

### JOB-20 — J12

**Given:** A batch has ready, running and unstarted slots.

**When:** Cancel remaining work or close the browser.

**Then:** Explicit cancel affects named remaining slots; ready results stay; closing alone cancels nothing.

### JOB-21 — J13, I12

**Given:** An accepted request reaches its captured recovery deadline with uncertain provider outcome.

**When:** Automatic recovery stops.

**Then:** Show Needs attention, retain evidence and release unsettled customer reservation; do not label provider failure or automatically regenerate.

### JOB-22 — J13, P04

**Given:** A request's usage was released after recovery expiry.

**When:** Its result is later recovered.

**Then:** Deliver the owned result without re-debit; preserve recovery history and provider expense.

### JOB-23 — J14, C08

**Given:** Assistant response is streaming against draft revision 4.

**When:** Connection breaks midway.

**Then:** Show incomplete text and reconcile the same text request; partial text cannot be Applied as a final proposal.

## Media

### MEDIA-01 — M01, A02

**Given:** A local file has a familiar extension but unsupported actual content.

**When:** Upload and verify.

**Then:** Reject content before it becomes a usable input; preserve draft role and explain the reason.

### MEDIA-02 — M01, I03

**Given:** An upload response is lost.

**When:** Retry with the same import identity.

**Then:** Recover/resume one logical item; do not create another media item from a transport retry.

### MEDIA-03 — M02

**Given:** A draft references staged bytes that were not recoverable after reload.

**When:** Reselect a file of the same name with different bytes.

**Then:** Do not resume old identity as if identical; create a new input revision or require matching bytes.

### MEDIA-04 — M03

**Given:** Two drafts reference one in-progress upload.

**When:** Remove it from only draft A.

**Then:** Draft B and the upload continue; A's removed role does not return on completion.

### MEDIA-05 — M03

**Given:** A shared upload is still running.

**When:** Explicitly cancel after reviewing affected drafts; output arrives late.

**Then:** Affected references remain unavailable/removed; late file is a project item with no automatic draft reattachment.

### MEDIA-06 — M04, I11

**Given:** A stored version's signed URL expires.

**When:** View or download it.

**Then:** Resolve the same durable handle to a fresh authorized URL; do not regenerate or change version identity.

### MEDIA-07 — M04, I13

**Given:** Media access is denied.

**When:** Try an old cached URL or a related viewer action.

**Then:** Do not bypass authorization; show unavailable reference while preserving history.

### MEDIA-08 — M05

**Given:** A decoded clip is paused at 3 seconds.

**When:** Enter fullscreen and return.

**Then:** Same clip/time/pause state remains; choosing another version starts that version at zero.

### MEDIA-09 — M05

**Given:** Autoplay is refused or video buffering/decode fails.

**When:** Observe the player.

**Then:** Expose Play/retry playback; generation remains successful; images do not show active clip playback.

### MEDIA-10 — M06

**Given:** Sketch has a last successful preview and a newer pending drawing.

**When:** A new frame fails and then creator leaves Sketch.

**Then:** Retain labeled last output; pause dispatch on leave; current project request is unchanged.

### MEDIA-11 — M07, I03

**Given:** Sketch displays output O1 while O2 is arriving.

**When:** Press Accept twice and lose the response.

**Then:** One acceptance records O1's exact drawing/settings/destination; recover same receipt; O2 cannot substitute.

### MEDIA-12 — M08

**Given:** Sketch has an unaccepted drawing and preview at close.

**When:** Reopen.

**Then:** Offer locally saved drawing/settings; do not claim preview history saved or restart generation automatically; accepted outputs remain durable.

### MEDIA-13 — M09, P05

**Given:** Sketch reaches its existing server allowance.

**When:** Try more frames or accept an already displayed output.

**Then:** Disable new frame dispatch until authorized reset; preserve drawing/output; acceptance does not create retroactive customer charges.

## Edit

### EDIT-01 — E01, I11

**Given:** Video edit uses exact clip versions A1 and B1.

**When:** A2 and B2 are later generated/preferred.

**Then:** The edit still uses A1/B1 until an explicit replacement revision.

### EDIT-02 — E02

**Given:** Edit contains invalid trim bounds, zero length or inaccessible input.

**When:** Export.

**Then:** Block export with each offending element identified; keep editable saved work.

### EDIT-03 — E02

**Given:** Output aspect ratio changes from landscape to portrait.

**When:** Apply the change.

**Then:** Require visible fit/fill/crop choices; no silent stretching or off-screen text.

### EDIT-04 — E03, I15

**Given:** Creator requests generated music, automatic captions or unsupported effect.

**When:** Inspect available actions.

**Then:** Show capability unavailable; manual captions/imported audio remain supported; do not simulate unavailable features.

### EDIT-05 — E04, I02

**Given:** Saved edit revision 7 begins export.

**When:** Change text and trim to revision 8 while export runs.

**Then:** Export captures revision 7; show newer edit exists; revision 8 can have a separate export.

### EDIT-06 — E05, I07

**Given:** An export render definitively failed.

**When:** Choose Retry export.

**Then:** Create new request retryOf original with same edit/source versions and reviewed cost; never regenerate source clips.

### EDIT-07 — E05, J06

**Given:** Export rendered successfully but storage/attachment response failed.

**When:** Retry saving/check status.

**Then:** Recover same export/media ID; do not start a new render.

### EDIT-08 — E06, E09

**Given:** A 5-second timeline item is replaced by a 3-second clip.

**When:** Choose replacement.

**Then:** Keep pending change invalid until explicit Change duration or Cancel; preview timing effects before applying.

### EDIT-09 — E07

**Given:** An export's pinned source becomes inaccessible.

**When:** Run recovery.

**Then:** Pause/reconcile then fail with missing source if not recoverable; keep edit and never use an unauthorized stale URL.

### EDIT-10 — E08

**Given:** Clip A has 5 seconds followed by clip B; caption is attached to B.

**When:** Trim A to 3 seconds.

**Then:** B and its attached caption shift earlier by 2 seconds; background audio's composition-time anchor does not shift.

### EDIT-11 — E08

**Given:** Text attached to a clip extends past a newly shortened clip interval.

**When:** Apply trim.

**Then:** Keep text element, mark edit invalid and require explicit timing change/removal; do not silently delete it.

### EDIT-12 — E08, D07

**Given:** A clip is inserted, removed or reordered.

**When:** Undo the command.

**Then:** Restore that single edit action as a new saved revision; media/history/jobs remain unchanged.

### EDIT-13 — E09

**Given:** A clip has source audio and the background track is occupied.

**When:** Attempt detach audio.

**Then:** Explain track-capacity conflict and make detach unavailable; mute/volume remain explicit supported changes.

## Restore

### RESTORE-01 — R01, I05

**Given:** A project has saved draft changes, running jobs and an unrelated viewed image.

**When:** Reload.

**Then:** Restore each independently; reconstruct nonterminal jobs from server receipts rather than a local polling flag.

### RESTORE-02 — R02, I07

**Given:** The app is offline with an editable cached draft.

**When:** Press Generate, then reconnect.

**Then:** No silent queued dispatch; replay safe saves/reconcile accepted work only; a never-accepted generation needs visible submit.

### RESTORE-03 — R03, D08

**Given:** Two tabs edit draft base revision 5.

**When:** Both save different content.

**Then:** First accepted write wins revision; second is a retained conflict copy; preserve both and block submit from conflict.

### RESTORE-04 — R03

**Given:** A conflict shows local and server content.

**When:** Choose Keep mine as separate draft or Use server version.

**Then:** Keep the losing content as a recoverable copy; never last-write-win silently.

### RESTORE-05 — R04, J01

**Given:** One tab accepts draft revision 5 while another still shows it.

**When:** Second tab learns the receipt or tries to edit/submit.

**Then:** Mark frozen revision submitted; create/open another draft before further edits; intentional rerun requires copied draft.

### RESTORE-06 — R05, I13

**Given:** Account A has an unknown submission and local work.

**When:** Session expires, then account B signs in.

**Then:** Do not expose/adopt A's private data in B; A's server job can continue and reconciles only under A.

### RESTORE-07 — R05

**Given:** An anonymous draft exists and the signed-in account has another draft.

**When:** Adopt the anonymous draft.

**Then:** Keep both; do not overwrite either based on recency.

### RESTORE-08 — R06

**Given:** Local-only drafts exist before sign-out.

**When:** Sign out after checkpoint status is shown.

**Then:** Lock same-owner drafts and clear rendered private content; no encryption claim and no cross-account adoption.

### RESTORE-09 — R07

**Given:** Project loading transiently fails or known destination is gone.

**When:** Retry/load recovery.

**Then:** Retry same ID for transient errors; offer restore/copy for missing destination; never silently create a replacement project.

### RESTORE-10 — R08, A02

**Given:** Queue capacity/provider service is unavailable before acceptance.

**When:** Submit.

**Then:** Refuse without publishing executable work; preserve draft and show cause; existing accepted receipts remain tracked.

## Lifecycle

### LIFECYCLE-01 — L01, I01

**Given:** An input is bound in the composer.

**When:** Filter, sort, rename or favorite items so it leaves the visible gallery.

**Then:** Input remains explicitly bound and visible in composer; request order/history is unchanged.

### LIFECYCLE-02 — L02, H05

**Given:** Version A has children and is used by a draft/export/share.

**When:** Hide A.

**Then:** Gallery hides it; dependencies/history and existing share still reference A; Show hidden/Restore can reveal it.

### LIFECYCLE-03 — L03

**Given:** A conversation has draft text and a running job.

**When:** Archive it.

**Then:** Keep work/history/jobs; conversation is read-only until restore; no implicit job cancellation.

### LIFECYCLE-04 — L04, J10

**Given:** Project has pending and running jobs plus public shares.

**When:** Trash project.

**Then:** Block new writes and deny public links; cancel unstarted work. Outputs already attached stay in retained trash; outputs finishing after trash deliver through owner recovery with original target preserved.

### LIFECYCLE-05 — L04, L06

**Given:** A trashed project had cancelled jobs and revoked shares.

**When:** Restore project.

**Then:** Restore identities/work; do not restart jobs or reactivate old links.

### LIFECYCLE-06 — L05, I15

**Given:** Creator opens historical-message or asset removal actions.

**When:** Look for permanent purge/delete-history.

**Then:** Those destructive actions are unavailable; offered Hide/Archive/Trash accurately describe their behavior.

### LIFECYCLE-07 — L06, I11

**Given:** A public link points at immutable export E7.

**When:** Export E8 and mark it preferred.

**Then:** Old link still targets E7; publishing E8 requires another link.

### LIFECYCLE-08 — L07, I03

**Given:** A share publication response is lost.

**When:** Retry or reload.

**Then:** Recover publication by operation ID; do not create duplicate links.

### LIFECYCLE-09 — L07

**Given:** Link revocation times out.

**When:** Display link management and retry.

**Then:** Show Revocation pending/unknown; do not claim revoked until authoritative denial; retry same revocation.

### LIFECYCLE-10 — L07, I13

**Given:** Project trash commits while individual link cleanup is retrying.

**When:** Open a previously published link.

**Then:** Authoritative access denies it even before cleanup completes.

### LIFECYCLE-11 — L08, I14

**Given:** Stored output is ready.

**When:** Download fails or browser transfer starts.

**Then:** Report transfer state only; no generation/export failure or additional charge; no claim of a completed disk write.

## Usage

### USAGE-01 — P01

**Given:** Reviewed quote expires before server acceptance.

**When:** Submit.

**Then:** Reject/requote before dispatch; preserve draft and require review of the new amount.

### USAGE-02 — P01, I02

**Given:** Quote is accepted/reserved, then expires while queued.

**When:** Execute later.

**Then:** Honor captured maximum; no silent reprice; incompatible provider cost requires failure/release or a new explicit request.

### USAGE-03 — P02, I03

**Given:** Two different requests compete for the last allowance.

**When:** Accept concurrently.

**Then:** Atomic reservation permits only the affordable work; duplicate settlements/reservations remain impossible.

### USAGE-04 — P03, J07

**Given:** Four slots have distinct usage allocations; two deliver, one fails, one cancels.

**When:** Settle the request.

**Then:** Charge only deliverable policy-eligible slots and release failed/cancelled allocations; record all actual provider expense separately.

### USAGE-05 — P03, I14

**Given:** A technically delivered result is disliked by its creator.

**When:** Choose a new variation.

**Then:** Show new attempt/cost; original successful delivery remains settled and preserved.

### USAGE-06 — P04, J06

**Given:** Output is durable but neither project nor recovery inbox association is confirmed.

**When:** Observe and later repair attachment.

**Then:** Hold unsettled reservation while within deadline; settle only after authoritative owned delivery; no regeneration.

### USAGE-07 — P05, I07

**Given:** A delivered result needs status, attachment or transfer recovery.

**When:** Perform recovery repeatedly.

**Then:** No new generation reservation or customer charge is created.

### USAGE-08 — P05, I10

**Given:** Allowance is exhausted while ready outputs and drafts exist.

**When:** Browse/download existing output and edit text.

**Then:** Permit existing access/drafting; block only new billable work with the exact allowance reason.

## Job

### JOB-24 — J15, I12

**Given:** Submission acceptance remains unknown at its captured deadline.

**When:** Automatic reconciliation expires and the creator checks later.

**Then:** Keep the frozen envelope in Needs attention; check the same ID; only authoritative absence permits resend; no rejection/failure is invented.

## Restore

### RESTORE-11 — R09, I04

**Given:** An owned result is in recovery because original project attachment failed.

**When:** Copy it to project Q, then repair its original project P link.

**Then:** Copy admission in Q and repaired original in P have distinct explicit associations; original request target stays P; neither recovery path creates another provider generation.

## History

### HISTORY-14 — H12, D03

**Given:** Media draft D revision 4 is unchanged after asking for wording advice; video edit E revision 7 is saved.

**When:** Generate from D and export E in two different presets using separate action drafts.

**Then:** Assistance does not consume D; exports consume their own settings drafts, not E. Same execution draft submitted from two tabs still converges to one receipt.

## Action

### ACTION-08 — A06

**Given:** Creator opens a new request without selecting inputs.

**When:** Inspect the composer and then choose an action.

**Then:** One output, no implicit media selection, and visible captured catalog defaults apply; Run is unavailable until an action and all required inputs exist.

### ACTION-09 — A07, I02

**Given:** Result B was generated from A with a known seed.

**When:** Choose Make another variation and then retry its transport.

**Then:** The new draft visibly uses a fresh seed policy with the original A input; frozen per-slot seeds stay identical through transport retries. No exact-pixel replay guarantee is made.

## Job

### JOB-25 — J05

**Given:** Provider nonacceptance and nonbilling are proven within accepted retry budget.

**When:** Automatic retry is allowed.

**Then:** The same slot returns to waiting with a new attempt record, not a new request or increased cost bound; an unknown external outcome never enters this transition.

### JOB-26 — J09, I11

**Given:** A slot was classified failed/lost, or already holds a stored version.

**When:** A newly verified late provider output arrives.

**Then:** Failed/lost slots can recover the verified output; a stored slot never replaces its bytes. Different extra bytes are retained separately in recovery without new slot or charge.

## Media

### MEDIA-14 — M07, M09

**Given:** Sketch allowance is exhausted but a valid successful output remains displayed.

**When:** Press Accept displayed output.

**Then:** Accept that exact existing output through admission; do not dispatch another preview or charge for historical frames.

## Context

### CONTEXT-16 — C08, C09, H12, I02

**Given:** An assistance question targets draft D revision 4, which is submitted unchanged before its answer arrives.

**When:** The answer arrives and the creator tries Apply.

**Then:** Treat the proposal as non-applicable despite matching revision; never mutate accepted D. Offer a separate authorized writable draft or retain/discard the proposal.

## Executable model traces

These traces execute only the design model, not the application.

<!-- prettier-ignore -->
| Trace | State group | Events | Expected state |
| --- | --- | --- | --- |
| TRACE-SUBMIT-RECOVERY | `submission` | submit_valid → response_uncertain → receipt_found → duplicate_response | `accepted` |
| TRACE-OLD-IMAGE-BRANCH | `input_target` | bind_available → inspect → bind_pending → output_deliverable → inspect | `version` |
| TRACE-SAVE-NEWER-EDIT | `draft_save` | save → edit_checkpointed | `local` |
| TRACE-SAVE-CONFLICT | `draft_save` | save → revision_conflict → keep_local_as_new → save → ack_current | `saved` |
| TRACE-LOCAL-FAILURE-SERVER-SAFE | `draft_save` | save → ack_current → local_checkpoint_failure_protected | `saved` |
| TRACE-PARTIAL-BATCH | `request` | start → output_received → some_deliverable_rest_terminal | `partial` |
| TRACE-UNKNOWN-RECOVERY-DEADLINE | `request` | start → outcome_unknown → recovery_deadline → check_status → all_deliverable | `succeeded` |
| TRACE-CANCEL-LATE-RESULT | `output_slot` | dispatch → cancel_confirmed → late_output → begin_copy → copied | `stored` |
| TRACE-REPAIR-SAME-OUTPUT | `output_slot` | dispatch → provider_output → begin_copy → copy_failed → retry_same_output → copied | `stored` |
| TRACE-RECOVERY-INBOX | `attachment` | destination_unavailable → recovery_linked → copy_to_chosen_project → restore_original_project → linked | `attached` |
| TRACE-STALE-ANSWER | `clarification` | answer → saved_current → draft_changed → apply_as_new_draft | `applied` |
| TRACE-SHARE-UNKNOWN-REVOKE | `sharing` | publish → response_lost → receipt_found → revoke → response_lost → confirmed_revoked | `revoked` |
| TRACE-NO-LATE-REDEBIT | `usage` | paid_mode_enabled → accept → reserved → confirmed_cancel_release → late_output | `released` |
| TRACE-SKETCH-CAP | `sketch` | resume → connected → allowance_exhausted → allowance_reset | `paused` |
| TRACE-TEXT-STREAM-RESTORE | `assistant_response` | response_uncertain → final_found | `saved` |
| TRACE-DOWNLOAD-RETRY | `download` | download → transfer_failed → retry_same_version → transfer_started | `started` |
| TRACE-PROJECT-TRASH-RESTORE | `project` | create → created → trash → trash_confirmed → restored | `ready` |
| TRACE-ACCEPTANCE-DEADLINE | `submission` | submit_valid → response_uncertain → recovery_deadline → check_again → receipt_found | `accepted` |
| TRACE-BOUNDED-PROVIDER-RETRY | `output_slot` | dispatch → proven_not_accepted_retry_allowed → dispatch → provider_output → begin_copy → copied | `stored` |
| TRACE-LATE-FAILED-OUTPUT | `output_slot` | dispatch → proven_provider_failure → verified_late_output → begin_copy → copied | `stored` |
| TRACE-ACCEPT-AFTER-SKETCH-CAP | `sketch` | resume → connected → allowance_exhausted → accept_displayed | `limit_reached` |
| TRACE-ASSISTANCE-FROZEN-TARGET | `clarification` | answer → saved_current → target_not_editable → apply_as_new_draft | `applied` |
