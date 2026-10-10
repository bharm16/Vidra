# Implementation acceptance-test plan

All **137 original cases** are assigned below. **33 additional implementation cases** cover requirements that need concrete renderer/commerce/cutover choices. Every suite/path is planned unless separately backed by execution evidence.

Original Given/When/Then remain in [acceptance-cases.md](acceptance-cases.md). The test title must contain its case ID. TestReadyAfter includes both suite owners and the later production boundaries required by the full scenario; their transitive prerequisites also apply. Local contract proof can land earlier, but the full case stays open until all required suites pass. G-APP is the full application closure gate; hosted/activation cases have their own stated gates.

## Original case ownership

<!-- prettier-ignore -->
| Case | Owner | Suites | TestReadyAfter | Observable acceptance |
| --- | --- | --- | --- | --- |
| HISTORY-01 | WP-03 | ACCEPT-WP-03, ACCEPT-WP-06 | WP-03, WP-06 | Only that ID is addressed; no title/time-based merge occurs. |
| HISTORY-02 | WP-06 | ACCEPT-WP-06 | WP-06 | D has A as primary parent; B and C remain with their original source IDs. |
| HISTORY-03 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-18 | WP-06, WP-18 | V still records and displays C as its source. |
| HISTORY-04 | WP-09 | ACCEPT-WP-09, ACCEPT-WP-10 | WP-09, WP-10 | Cards retain slot numbers; failure 1 remains visible; results do not renumber. |
| HISTORY-05 | WP-18 | ACCEPT-WP-18 | WP-18 | Completion does not change preference; favorite changes only B's marker. |
| HISTORY-06 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-08, ACCEPT-WP-13 | WP-06, WP-08, WP-13 | New Q4 records revisesRequestId Q1 and Q1's original parent context; Q1-Q3 and their outputs remain. |
| HISTORY-07 | WP-08 | ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-10, ACCEPT-WP-11 | WP-08, WP-09, WP-10, WP-11 | History stays Q1 then Q2; each output appears once under its originating request. |
| HISTORY-08 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-08 | WP-06, WP-08 | Both requests reference exact A; histories remain distinct and no storage duplicate is required. |
| HISTORY-09 | WP-18 | ACCEPT-WP-18 | WP-18 | Request hash, original words, media bytes and ancestry are unchanged. |
| HISTORY-10 | WP-13 | ACCEPT-WP-13 | WP-13 | One idempotent destination conversation/draft is created; no generation occurs. |
| HISTORY-11 | WP-15 | ACCEPT-WP-15 | WP-15 | Create an owned Q copy, preserve P's original, and do not copy private conversation instructions or alter Q's active draft. |
| HISTORY-12 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Draft X's source, instructions, model, context and destination remain unchanged. |
| HISTORY-13 | WP-13 | ACCEPT-WP-13 | WP-13 | New draft copies Q's original A input; next result is an alternative from A, not an edit of B. |
| CONTEXT-01 | WP-06 | ACCEPT-WP-06 | WP-06 | Context contains B's ancestor path and new instruction; C's later edits and the blue sibling instruction are excluded. |
| CONTEXT-02 | WP-06 | ACCEPT-WP-06 | WP-06 | Record both inputs and roles; B's conversation instructions are excluded unless explicitly selected as context. |
| CONTEXT-03 | WP-06 | ACCEPT-WP-06 | WP-06 | Draft retains N and shows the available update; N+1 is applied only explicitly. |
| CONTEXT-04 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | The visible bound input A is used; viewing B supplies no target change. |
| CONTEXT-05 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-14 | WP-06, WP-14 | A persisted clarification asks which request/slot; no media dispatch occurs. |
| CONTEXT-06 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-13 | WP-06, WP-13 | Old draft is parked; new draft has no media target or conversation-specific context and retains the chosen project-instruction revision. |
| CONTEXT-07 | WP-14 | ACCEPT-WP-14 | WP-14 | Submission is context_limit blocked; no hidden truncation or automatic summary occurs. |
| CONTEXT-08 | WP-14 | ACCEPT-WP-14 | WP-14 | New draft revision records summary text and covered IDs; original history remains; no generation runs. |
| CONTEXT-09 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-08, ACCEPT-WP-13 | WP-06, WP-08, WP-13 | Existing draft shows update availability but keeps N; accepted request remains immutable. |
| CONTEXT-10 | WP-14 | ACCEPT-WP-14 | WP-14 | Show a diff tied to revision 4; do not overwrite revision 5; deliberate Apply creates one undoable revision. |
| CONTEXT-11 | WP-14 | ACCEPT-WP-14 | WP-14 | Save the answer as an immutable entry and stale proposal; only Apply as new draft or explicit resolution may use it. |
| CONTEXT-12 | WP-14 | ACCEPT-WP-14 | WP-14 | Ask which question; neither target draft changes and neither request runs. |
| CONTEXT-13 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-13 | WP-06, WP-13 | Show input/context difference and block submit until the creator chooses B's directions or explicitly keeps A's directions. |
| CONTEXT-14 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-13, ACCEPT-WP-16 | WP-06, WP-13, WP-16 | View works; exact Reuse is unavailable; Edit opens with unknown/empty historical context and requires new instructions. |
| CONTEXT-15 | WP-06 | ACCEPT-WP-06, ACCEPT-WP-15 | WP-06, WP-15 | The mask is invalid until explicitly redrawn/remapped; it cannot silently apply to different pixels. |
| DRAFT-01 | WP-13 | ACCEPT-WP-13 | WP-13 | Park the old draft and open a new explicit-target draft; reopening the old draft restores its content. |
| DRAFT-02 | WP-13 | ACCEPT-WP-13 | WP-13 | Replace the empty draft without creating a parked empty entry. |
| DRAFT-03 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-13 | WP-05, WP-08, WP-09, WP-13 | Save a separate draft/revision while Q's accepted snapshot remains revision 3. |
| DRAFT-04 | WP-08 | ACCEPT-WP-08, FIRESTORE-RACES | WP-08 | Atomic draft-revision uniqueness produces one receipt, reservation and execution; mismatching hashes conflict. |
| DRAFT-05 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Pending input is Q's exact slot; submit stays disabled until its original-project durable result exists. |
| DRAFT-06 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Resolve only the declared input; preserve words/settings; do not auto-submit or move the viewer. |
| DRAFT-07 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Keep follow-up words and failed dependency; offer choose input/reuse setup; never substitute Q's original source automatically. |
| DRAFT-08 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Bind slot 2 exactly and permit an otherwise valid request; other slots keep their identities/statuses. |
| DRAFT-09 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16 | Update parked X's declared dependency and Q's history only; active Y/viewer/navigation remain unchanged. |
| DRAFT-10 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-13 | WP-05, WP-13 | Undo affects text only; result and charge remain; new text clears only that draft's redo path. |
| DRAFT-11 | WP-05 | ACCEPT-WP-05 | WP-05 | Revision 9 remains unsaved/remotely pending; the old ack cannot label it Saved. |
| DRAFT-12 | WP-05 | ACCEPT-WP-05 | WP-05 | Navigation is allowed with accurate storage status; no forced export/discard of remotely safe work. |
| DRAFT-13 | WP-19 | ACCEPT-WP-19, ACCEPT-WP-21 | WP-19, WP-21 | Create revision 8 with revision 3's contents; export continues rendering revision 7. |
| DRAFT-14 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-13 | WP-05, WP-13 | Offer retry, explicit draft export/continue, or discard; do not claim work is saved. |
| DRAFT-15 | WP-13 | ACCEPT-WP-13, ACCEPT-WP-14, ACCEPT-WP-16, ACCEPT-WP-21 | WP-13, WP-14, WP-16, WP-21 | No implicit next image/video edit target is created; export keeps source editor; download keeps draft; text produces an explicit proposal. |
| ACTION-01 | WP-07 | ACCEPT-WP-07 | WP-07 | Action is unavailable with the missing-policy/capability reason; no permissive fallback occurs. |
| ACTION-02 | WP-08 | ACCEPT-WP-08 | WP-08 | Server denies before accepting executable work and preserves the draft; stale UI grants nothing. |
| ACTION-03 | WP-07 | ACCEPT-WP-07 | WP-07 | Show all three reasons with authorization primary; submit remains disabled. |
| ACTION-04 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-13 | WP-07, WP-13 | Preserve old revision and show unresolved values; no silent clamp/removal; require explicit resolution. |
| ACTION-05 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-10 | WP-07, WP-08, WP-09, WP-10 | Do not increase accepted slots/spend; additional work requires a new reviewed request. |
| ACTION-06 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-08, ACCEPT-WP-13 | WP-07, WP-08, WP-13 | Keep that step a draft until an exact valid input exists; no hidden dependency scheduling occurs. |
| ACTION-07 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-14 | WP-07, WP-14 | Return text/proposal only; no image/video generation occurs until the explicit media action is run. |
| JOB-01 | WP-08 | ACCEPT-WP-08, FIRESTORE-RACES | WP-08 | Return its same receipt; no second reservation, queue item or provider execution. |
| JOB-02 | WP-08 | ACCEPT-WP-08, FIRESTORE-RACES | WP-08 | Reject identity conflict; neither original snapshot nor job is overwritten. |
| JOB-03 | WP-08 | ACCEPT-WP-08, ACCEPT-WP-05, ACCEPT-WP-13 | WP-05, WP-08, WP-13 | Restore envelope/S; query acceptance; recover existing receipt or resend identical S only after proven absence. |
| JOB-04 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-08, ACCEPT-WP-13 | WP-05, WP-08, WP-13 | Preserve draft; no automatic generation; creator submits the restored valid revision deliberately. |
| JOB-05 | WP-11 | ACCEPT-WP-11 | WP-11 | Reconcile original attempt; do not make a second external generation call solely because the lease expired. |
| JOB-06 | WP-09 | ACCEPT-WP-09 | WP-09 | Retain original reviewed inputs/model and maximum usage; record attempt; never silently switch provider or creative settings. |
| JOB-07 | WP-11 | ACCEPT-WP-11 | WP-11 | Do not regenerate; reconcile or offer a new explicit reviewed request. |
| JOB-08 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-09 | WP-09, WP-10 | Show Made; saving needs attention; retry the same output; no Ready claim or duplicate generation/charge. |
| JOB-09 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-18 | WP-10, WP-18 | Show Ready in recovery; preserve original destination; allow owned download/copy; no silently created project. |
| JOB-10 | WP-09 | ACCEPT-WP-09, ACCEPT-WP-10 | WP-09, WP-10 | Keep in progress with counts; do not mark partial terminal until the last slot resolves. |
| JOB-11 | WP-09 | ACCEPT-WP-09, ACCEPT-WP-10, ACCEPT-WP-11 | WP-09, WP-10, WP-11 | Mark partial and keep both ready outputs and both terminal slot records. |
| JOB-12 | WP-11 | ACCEPT-WP-11 | WP-11 | Mark cancelled; retain slot IDs and cancellation evidence. |
| JOB-13 | WP-09 | ACCEPT-WP-09, ACCEPT-WP-11 | WP-09, WP-11 | Mark failed with per-slot details; do not claim a fully cancelled request. |
| JOB-14 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-09 | WP-09, WP-10 | Record output_lost; disable impossible same-output repair; new generation is a new explicit request. |
| JOB-15 | WP-09 | ACCEPT-WP-09, ACCEPT-WP-10, ACCEPT-WP-11 | WP-09, WP-10, WP-11 | Do not revert or duplicate it; ignore/log stale observations. |
| JOB-16 | WP-11 | ACCEPT-WP-11 | WP-11 | Keep evidence/media and enter reconciliation; callback timestamp cannot choose truth. |
| JOB-17 | WP-11 | ACCEPT-WP-11, FIRESTORE-RACES, ACCEPT-WP-22 | WP-08, WP-11, WP-22 | Server atomic order decides: confirmed pre-dispatch cancellation releases usage, otherwise request provider cancellation and retain execution status. |
| JOB-18 | WP-11 | ACCEPT-WP-11, ACCEPT-WP-22 | WP-11, WP-22 | Keep result; label completion-before-cancel; apply accepted usage policy; do not change active draft/selection. |
| JOB-19 | WP-22 | ACCEPT-WP-22 | WP-22 | Store/reconcile the result and provider expense; never re-debit released customer usage. |
| JOB-20 | WP-11 | ACCEPT-WP-11, ACCEPT-WP-13 | WP-11, WP-13 | Explicit cancel affects named remaining slots; ready results stay; closing alone cancels nothing. |
| JOB-21 | WP-11 | ACCEPT-WP-11, ACCEPT-WP-22 | WP-11, WP-22 | Show Needs attention, retain evidence and release unsettled customer reservation; do not label provider failure or automatically regenerate. |
| JOB-22 | WP-22 | ACCEPT-WP-22 | WP-22 | Deliver the owned result without re-debit; preserve recovery history and provider expense. |
| JOB-23 | WP-14 | ACCEPT-WP-14 | WP-14 | Show incomplete text and reconcile the same text request; partial text cannot be Applied as a final proposal. |
| MEDIA-01 | WP-15 | ACCEPT-WP-15 | WP-15 | Reject content before it becomes a usable input; preserve draft role and explain the reason. |
| MEDIA-02 | WP-15 | ACCEPT-WP-15 | WP-15 | Recover/resume one logical item; do not create another media item from a transport retry. |
| MEDIA-03 | WP-15 | ACCEPT-WP-15 | WP-15 | Do not resume old identity as if identical; create a new input revision or require matching bytes. |
| MEDIA-04 | WP-15 | ACCEPT-WP-15 | WP-15 | Draft B and the upload continue; A's removed role does not return on completion. |
| MEDIA-05 | WP-15 | ACCEPT-WP-15 | WP-15 | Affected references remain unavailable/removed; late file is a project item with no automatic draft reattachment. |
| MEDIA-06 | WP-16 | ACCEPT-WP-16 | WP-16 | Resolve the same durable handle to a fresh authorized URL; do not regenerate or change version identity. |
| MEDIA-07 | WP-16 | ACCEPT-WP-16 | WP-16 | Do not bypass authorization; show unavailable reference while preserving history. |
| MEDIA-08 | WP-16 | ACCEPT-WP-16 | WP-16 | Same clip/time/pause state remains; choosing another version starts that version at zero. |
| MEDIA-09 | WP-16 | ACCEPT-WP-16 | WP-16 | Expose Play/retry playback; generation remains successful; images do not show active clip playback. |
| MEDIA-10 | WP-17 | ACCEPT-WP-17 | WP-17 | Retain labeled last output; pause dispatch on leave; current project request is unchanged. |
| MEDIA-11 | WP-17 | ACCEPT-WP-17 | WP-17 | One acceptance records O1's exact drawing/settings/destination; recover same receipt; O2 cannot substitute. |
| MEDIA-12 | WP-17 | ACCEPT-WP-17 | WP-17 | Offer locally saved drawing/settings; do not claim preview history saved or restart generation automatically; accepted outputs remain durable. |
| MEDIA-13 | WP-17 | ACCEPT-WP-17 | WP-17 | Disable new frame dispatch until authorized reset; preserve drawing/output; acceptance does not create retroactive customer charges. |
| EDIT-01 | WP-19 | ACCEPT-WP-19, COMPOSITION-RENDER, ACCEPT-WP-20, ACCEPT-WP-21 | WP-19, WP-20, WP-21 | The edit still uses A1/B1 until an explicit replacement revision. |
| EDIT-02 | WP-19 | ACCEPT-WP-19, COMPOSITION-RENDER, ACCEPT-WP-20, ACCEPT-WP-21 | WP-19, WP-20, WP-21 | Block export with each offending element identified; keep editable saved work. |
| EDIT-03 | WP-20 | ACCEPT-WP-20, RENDER-PARITY, ACCEPT-WP-21 | WP-20, WP-21 | Require visible fit/fill/crop choices; no silent stretching or off-screen text. |
| EDIT-04 | WP-19 | ACCEPT-WP-19, COMPOSITION-RENDER, ACCEPT-WP-20, ACCEPT-WP-21 | WP-19, WP-20, WP-21 | Show capability unavailable; manual captions/imported audio remain supported; do not simulate unavailable features. |
| EDIT-05 | WP-21 | ACCEPT-WP-21, RENDER-PARITY, ACCEPT-WP-20 | WP-20, WP-21 | Export captures revision 7; show newer edit exists; revision 8 can have a separate export. |
| EDIT-06 | WP-21 | ACCEPT-WP-21, COMPOSITION-RENDER, ACCEPT-WP-20 | WP-20, WP-21 | Create new request retryOf original with same edit/source versions and reviewed cost; never regenerate source clips. |
| EDIT-07 | WP-21 | ACCEPT-WP-21, COMPOSITION-RENDER, ACCEPT-WP-20 | WP-20, WP-21 | Recover same export/media ID; do not start a new render. |
| EDIT-08 | WP-19 | ACCEPT-WP-19, COMPOSITION-RENDER, ACCEPT-WP-20, ACCEPT-WP-21 | WP-19, WP-20, WP-21 | Keep pending change invalid until explicit Change duration or Cancel; preview timing effects before applying. |
| EDIT-09 | WP-21 | ACCEPT-WP-21, COMPOSITION-RENDER, ACCEPT-WP-20 | WP-20, WP-21 | Pause/reconcile then fail with missing source if not recoverable; keep edit and never use an unauthorized stale URL. |
| EDIT-10 | WP-20 | ACCEPT-WP-20, RENDER-PARITY, ACCEPT-WP-21 | WP-20, WP-21 | B and its attached caption shift earlier by 2 seconds; background audio's composition-time anchor does not shift. |
| EDIT-11 | WP-20 | ACCEPT-WP-20, RENDER-PARITY, ACCEPT-WP-21 | WP-20, WP-21 | Keep text element, mark edit invalid and require explicit timing change/removal; do not silently delete it. |
| EDIT-12 | WP-20 | ACCEPT-WP-20, COMPOSITION-RENDER, ACCEPT-WP-21 | WP-20, WP-21 | Restore that single edit action as a new saved revision; media/history/jobs remain unchanged. |
| EDIT-13 | WP-20 | ACCEPT-WP-20, COMPOSITION-RENDER, ACCEPT-WP-21 | WP-20, WP-21 | Explain track-capacity conflict and make detach unavailable; mute/volume remain explicit supported changes. |
| RESTORE-01 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-11, ACCEPT-WP-13 | WP-05, WP-08, WP-09, WP-11, WP-13 | Restore each independently; reconstruct nonterminal jobs from server receipts rather than a local polling flag. |
| RESTORE-02 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-11, ACCEPT-WP-13 | WP-05, WP-08, WP-09, WP-11, WP-13 | No silent queued dispatch; replay safe saves/reconcile accepted work only; a never-accepted generation needs visible submit. |
| RESTORE-03 | WP-05 | ACCEPT-WP-05, FIRESTORE-RACES, ACCEPT-WP-13 | WP-05, WP-08, WP-13 | First accepted write wins revision; second is a retained conflict copy; preserve both and block submit from conflict. |
| RESTORE-04 | WP-05 | ACCEPT-WP-05, FIRESTORE-RACES, ACCEPT-WP-13 | WP-05, WP-08, WP-13 | Keep the losing content as a recoverable copy; never last-write-win silently. |
| RESTORE-05 | WP-08 | ACCEPT-WP-08, FIRESTORE-RACES | WP-08 | Mark frozen revision submitted; create/open another draft before further edits; intentional rerun requires copied draft. |
| RESTORE-06 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-11, ACCEPT-WP-13 | WP-05, WP-08, WP-09, WP-11, WP-13 | Do not expose/adopt A's private data in B; A's server job can continue and reconciles only under A. |
| RESTORE-07 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-13 | WP-05, WP-13 | Keep both; do not overwrite either based on recency. |
| RESTORE-08 | WP-05 | ACCEPT-WP-05, ACCEPT-WP-13 | WP-05, WP-13 | Lock same-owner drafts and clear rendered private content; no encryption claim and no cross-account adoption. |
| RESTORE-09 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-18 | WP-10, WP-18 | Retry same ID for transient errors; offer restore/copy for missing destination; never silently create a replacement project. |
| RESTORE-10 | WP-08 | ACCEPT-WP-08 | WP-08 | Refuse without publishing executable work; preserve draft and show cause; existing accepted receipts remain tracked. |
| LIFECYCLE-01 | WP-18 | ACCEPT-WP-18 | WP-18 | Input remains explicitly bound and visible in composer; request order/history is unchanged. |
| LIFECYCLE-02 | WP-18 | ACCEPT-WP-18 | WP-18 | Gallery hides it; dependencies/history and existing share still reference A; Show hidden/Restore can reveal it. |
| LIFECYCLE-03 | WP-18 | ACCEPT-WP-18 | WP-18 | Keep work/history/jobs; conversation is read-only until restore; no implicit job cancellation. |
| LIFECYCLE-04 | WP-18 | ACCEPT-WP-18 | WP-18 | Block new writes and deny public links; cancel unstarted work. Outputs already attached stay in retained trash; outputs finishing after trash deliver through owner recovery with original target preserved. |
| LIFECYCLE-05 | WP-18 | ACCEPT-WP-18 | WP-18 | Restore identities/work; do not restart jobs or reactivate old links. |
| LIFECYCLE-06 | WP-18 | ACCEPT-WP-18 | WP-18 | Those destructive actions are unavailable; offered Hide/Archive/Trash accurately describe their behavior. |
| LIFECYCLE-07 | WP-18 | ACCEPT-WP-18, ACCEPT-WP-21 | WP-18, WP-21 | Old link still targets E7; publishing E8 requires another link. |
| LIFECYCLE-08 | WP-18 | ACCEPT-WP-18 | WP-18 | Recover publication by operation ID; do not create duplicate links. |
| LIFECYCLE-09 | WP-18 | ACCEPT-WP-18 | WP-18 | Show Revocation pending/unknown; do not claim revoked until authoritative denial; retry same revocation. |
| LIFECYCLE-10 | WP-18 | ACCEPT-WP-18 | WP-18 | Authoritative access denies it even before cleanup completes. |
| LIFECYCLE-11 | WP-16 | ACCEPT-WP-16 | WP-16 | Report transfer state only; no generation/export failure or additional charge; no claim of a completed disk write. |
| USAGE-01 | WP-22 | ACCEPT-WP-22 | WP-22 | Reject/requote before dispatch; preserve draft and require review of the new amount. |
| USAGE-02 | WP-22 | ACCEPT-WP-22 | WP-22 | Honor captured maximum; no silent reprice; incompatible provider cost requires failure/release or a new explicit request. |
| USAGE-03 | WP-22 | ACCEPT-WP-22, FIRESTORE-RACES | WP-08, WP-22 | Atomic reservation permits only the affordable work; duplicate settlements/reservations remain impossible. |
| USAGE-04 | WP-22 | ACCEPT-WP-22, FIRESTORE-RACES | WP-08, WP-22 | Charge only deliverable policy-eligible slots and release failed/cancelled allocations; record all actual provider expense separately. |
| USAGE-05 | WP-22 | ACCEPT-WP-22, ACCEPT-WP-13 | WP-13, WP-22 | Show new attempt/cost; original successful delivery remains settled and preserved. |
| USAGE-06 | WP-22 | ACCEPT-WP-22, FIRESTORE-RACES | WP-08, WP-22 | Hold unsettled reservation while within deadline; settle only after authoritative owned delivery; no regeneration. |
| USAGE-07 | WP-22 | ACCEPT-WP-22, ACCEPT-WP-16 | WP-16, WP-22 | No new generation reservation or customer charge is created. |
| USAGE-08 | WP-22 | ACCEPT-WP-22, ACCEPT-WP-13, ACCEPT-WP-16 | WP-13, WP-16, WP-22 | Permit existing access/drafting; block only new billable work with the exact allowance reason. |
| JOB-24 | WP-08 | ACCEPT-WP-08, ACCEPT-WP-11, ACCEPT-WP-13 | WP-08, WP-11, WP-13 | Keep the frozen envelope in Needs attention; check the same ID; only authoritative absence permits resend; no rejection/failure is invented. |
| RESTORE-11 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-15 | WP-10, WP-15 | Copy admission in Q and repaired original in P have distinct explicit associations; original request target stays P; neither recovery path creates another provider generation. |
| HISTORY-14 | WP-08 | ACCEPT-WP-08, ACCEPT-WP-14, ACCEPT-WP-19, ACCEPT-WP-21 | WP-08, WP-14, WP-19, WP-21 | Assistance does not consume D; exports consume their own settings drafts, not E. Same execution draft submitted from two tabs still converges to one receipt. |
| ACTION-08 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-13 | WP-07, WP-13 | One output, no implicit media selection, and visible captured catalog defaults apply; Run is unavailable until an action and all required inputs exist. |
| ACTION-09 | WP-07 | ACCEPT-WP-07, ACCEPT-WP-08, ACCEPT-WP-09, ACCEPT-WP-13 | WP-07, WP-08, WP-09, WP-13 | The new draft visibly uses a fresh seed policy with the original A input; frozen per-slot seeds stay identical through transport retries. No exact-pixel replay guarantee is made. |
| JOB-25 | WP-09 | ACCEPT-WP-09 | WP-09 | The same slot returns to waiting with a new attempt record, not a new request or increased cost bound; an unknown external outcome never enters this transition. |
| JOB-26 | WP-10 | ACCEPT-WP-10, ACCEPT-WP-11 | WP-10, WP-11 | Failed/lost slots can recover the verified output; a stored slot never replaces its bytes. Different extra bytes are retained separately in recovery without new slot or charge. |
| MEDIA-14 | WP-17 | ACCEPT-WP-17 | WP-17 | Accept that exact existing output through admission; do not dispatch another preview or charge for historical frames. |
| CONTEXT-16 | WP-14 | ACCEPT-WP-14 | WP-14 | Treat the proposal as non-applicable despite matching revision; never mutate accepted D. Offer a separate authorized writable draft or retain/discard the proposal. |

## Additional cases

### SUP-01 — WP-01 / ACCEPT-WP-01

**Given:** A malformed new request and a valid legacy saved take exist.

**When:** Validate both through public schemas.

**Then:** Reject unknown/new-write violations while legacy remains readable; unresolved pending input cannot enter accepted request.

**TestReadyAfter:** WP-01. **Closure:** G-APP. Status: planned.

### SUP-02 — WP-02 / ACCEPT-WP-02

**Given:** Another process occupies the default browser test port.

**When:** Start a controlled workflow run.

**Then:** Allocate/configure a separate URL and preserve the existing process; test artifacts remain run-scoped.

**TestReadyAfter:** WP-02. **Closure:** G-APP. Status: planned.

### SUP-03 — WP-02 / ACCEPT-WP-02

**Given:** Controlled fixtures attempt an unexpected external provider request.

**When:** Execute the test.

**Then:** Outbound guard fails the test; no paid call escapes and no replay is mislabeled live proof.

**TestReadyAfter:** WP-02. **Closure:** G-APP. Status: planned.

### SUP-04 — WP-08 / FIRESTORE-RACES

**Given:** Old receipt replay TTL elapsed but the execution draft was already consumed.

**When:** Submit again from a stale tab.

**Then:** Permanent consumed-revision/authoritative request binding returns the original or refuses conflict; it cannot recreate paid work.

**TestReadyAfter:** WP-08. **Closure:** G-APP. Status: planned.

### SUP-05 — WP-09 / ACTOR-image_or_video_generation

**Given:** An adapter lacks restart-safe external status/cancel support.

**When:** Qualify its catalog offering.

**Then:** Unsupported/unknown behavior is shown accurately; no synthetic handle/cancel-success and no automatic uncertain retry.

**TestReadyAfter:** WP-09. **Closure:** G-APP. Status: planned.

### SUP-06 — WP-21 / COMPOSITION-RENDER

**Given:** Input fixtures contain numbered VFR frames, rotation/SAR metadata and audio with a delayed impulse.

**When:** Normalize and render the chosen frame intervals.

**Then:** Use exact normalized boundaries and preserve relative A/V offset; no keyframe stream-copy approximation.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-07 — WP-19 / COMPOSITION-RENDER, RENDER-PARITY

**Given:** A new still is inserted and time entry is halfway between frame boundaries.

**When:** Commit composition command.

**Then:** Default still is 90 frames; snap nearest with ties up visibly; invalid out-of-bounds trim rejects rather than clamps.

**TestReadyAfter:** WP-19, WP-20, WP-21. **Closure:** G-APP. Status: planned.

### SUP-08 — WP-21 / COMPOSITION-RENDER

**Given:** Text contains unsupported glyph, missing font or overflow.

**When:** Validate/export.

**Then:** Identify the affected element and refuse; never silently substitute fonts or clip text.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-09 — WP-20 / RENDER-PARITY

**Given:** A valid caption/crop crosses an exact clip boundary.

**When:** Preview and export the same manifest.

**Then:** Match exact pre-encode overlay pixels and frame anchors; decoded MP4/frame/audio differences stay within the documented tolerance.

**TestReadyAfter:** WP-20. **Closure:** G-APP. Status: planned.

### SUP-10 — WP-21 / COMPOSITION-RENDER

**Given:** Source path/URL/filter syntax is supplied by a hostile client.

**When:** Render admission/compilation runs.

**Then:** Only owned pinned local files and compiled whitelisted operations reach shell-free FFmpeg; no arbitrary command/path/network input.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-11 — WP-21 / COMPOSITION-RENDER

**Given:** GCS object creation succeeds but acknowledgment is lost.

**When:** Redeliver task and repair storage.

**Then:** Reconcile immutable object generation/checksum; no overwrite and no second FFmpeg process for already-rendered bytes.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-12 — WP-21 / ACTOR-export

**Given:** A renderer loses its lease and later attempts publication.

**When:** A new observer reconciles the same attempt.

**Then:** Fencing prevents stale publication; no blind rerender; durable output is recovered or loss is explicit.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-13 — WP-21 / COMPOSITION-RENDER

**Given:** Renderer reaches memory/scratch/time limits or receives shutdown.

**When:** Run the actual pinned container fixture.

**Then:** Stop bounded work, retain evidence, publish no partial file, and enter the specified failure/recovery state.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-14 — WP-21 / ACTOR-export

**Given:** An outbox event/task is delivered twice or a dispatcher dies after enqueue.

**When:** Process the same export.

**Then:** One native export attempt/claim is authoritative; pending outbox/reconciliation remains discoverable and no charge repeats.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-15 — WP-23 / COMMERCE

**Given:** A checkout return URL claims success but no verified invoice/purchase exists.

**When:** Open account and try generation.

**Then:** No allowance is granted; new paid work remains blocked until authoritative entitlement exists.

**TestReadyAfter:** WP-23. **Closure:** G-APP. Status: planned.

### SUP-16 — WP-23 / COMMERCE

**Given:** Same paid invoice arrives in duplicate and different webhook events, out of order.

**When:** Process events concurrently.

**Then:** Exactly one grant per business billing identity; older events cannot reverse newer paid-access facts.

**TestReadyAfter:** WP-23. **Closure:** G-APP. Status: planned.

### SUP-17 — WP-23 / COMMERCE

**Given:** A forged signature or another owner's customer/purchase ID is submitted.

**When:** Process webhook/checkout request.

**Then:** Reject it without altering either owner's entitlement or revealing private billing data.

**TestReadyAfter:** WP-23. **Closure:** G-APP. Status: planned.

### SUP-18 — WP-23 / COMMERCE

**Given:** Hosted checkout is cancelled or payment fails; alternatively the paid period ends.

**When:** Return to the project/account.

**Then:** No false success/grant; old work stays readable and already accepted reservations retain their captured policy.

**TestReadyAfter:** WP-23. **Closure:** G-APP. Status: planned.

### SUP-19 — WP-25 / CUTOVER

**Given:** Legacy sessions/Studio projects have equal names, missing history and saved URLs.

**When:** Run adoption twice on isolated copies.

**Then:** Stable explicit-origin mapping, unchanged original IDs/bytes, no guessed history and no duplicate projects.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-20 — WP-25 / CUTOVER

**Given:** A legacy tab saves after new-writer activation and another v2 edit has landed.

**When:** Submit stale legacy write.

**Then:** Server refuses stale authority; no mixed writer overwrites v2 work.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-21 — WP-25 / CUTOVER

**Given:** A newly adopted project has v2 drafts, jobs and outputs.

**When:** Disable new admission/UI through rollback.

**Then:** All v2 records and recovery remain readable; no lossy reverse migration, duplicate dispatch or revived public share.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-22 — WP-24 / FULL-JOURNEYS

**Given:** Project contains still revisions, a running alternative and an unfinished composition.

**When:** Finish/reopen/edit an image, a usable shot and a final video amid failures.

**Then:** All three deliverables survive, exact old-version edits work and no unrelated draft/focus/inputs are overwritten.

**TestReadyAfter:** WP-24. **Closure:** G-APP. Status: planned.

### SUP-23 — WP-26 / FULL-JOURNEYS

**Given:** Staged release has accepted running requests and active purchases.

**When:** Activate disable-new-admission/purchase controls.

**Then:** New spending stops; receipts, recovery, releases/refunds, existing owned downloads and work access remain available.

**TestReadyAfter:** WP-24, WP-26. **Closure:** G-COMMERCIAL. Status: planned.

### SUP-24 — WP-24 / ACTOR-export

**Given:** The renderer service is private and queue/outbox/IAM permissions are deployed.

**When:** Try unauthenticated/wrong-task invocations and interrupt task delivery.

**Then:** Unauthorized calls fail; authorized exact tasks reconcile correctly; local/emulator success is not substituted for this hosted evidence.

**TestReadyAfter:** WP-21, WP-24. **Closure:** G-LIVE. Status: planned.

### SUP-25 — WP-22 / ACCEPT-WP-22

**Given:** A new canonical request reserves paid customer usage while a charged legacy job still exists.

**When:** Execute, fail/recover and settle both paths.

**Then:** New native executor jobs retain creditsReserved=0 and use only the v2 usage ledger; old positive-credit jobs still require the legacy refunder. Neither ledger charges/refunds the other request.

**TestReadyAfter:** WP-22. **Closure:** G-APP. Status: planned.

### SUP-26 — WP-25 / CUTOVER

**Given:** A legacy queued/running video and a partially running Studio batch were accepted before the adoption writer fence.

**When:** Activate the new writer while both complete; then exercise rollback.

**Then:** Only allowlisted native completion writes continue to their original destinations; every late slot/result projects once into canonical history with the same original receipt/native/source IDs.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-27 — WP-25 / CUTOVER

**Given:** A legacy picture/clip has pending attachment repair and an older charged job has refund debt before adoption.

**When:** Repair/settle across activation and rollback.

**Then:** Keep original media/destination/ledger IDs, permit only the authorized debt operations, project media once and never run another generation or move old refund debt into the v2 ledger.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-28 — WP-25 / CUTOVER

**Given:** A legacy caller races adoption preparation or an in-flight operation has no provable immutable acceptance identity.

**When:** Prepare/activate adoption.

**Then:** Authoring-epoch transaction admits at most one side of the race. Untraceable work blocks activation until resolved; no timestamp guess, silent cancellation or stranded result.

**TestReadyAfter:** WP-25. **Closure:** G-APP. Status: planned.

### SUP-29 — WP-18 / CUTOVER

**Given:** Old links have respectively one, zero and multiple provable source owner/project/version candidates.

**When:** Resolve/bind links, trash/restore the source project, then roll back the new UI.

**Then:** Only the uniquely verified binding can serve; missing/ambiguous links remain unavailable and may be explicitly republished by a proven owner. Trash/revocation denial persists across restore/rollback.

**TestReadyAfter:** WP-18, WP-25. **Closure:** G-APP. Status: planned.

### SUP-30 — WP-21 / RENDER-PARITY

**Given:** VFR source has a normalized proxy keyed to source/normalization fingerprints.

**When:** Preview/export it, then lose/buffer the proxy and resume.

**Then:** Frame anchors match the pinned normalization; media time, captions and audio pause/resume together. A missing proxy has its own recovery state and does not mark source generation failed.

**TestReadyAfter:** WP-20, WP-21. **Closure:** G-APP. Status: planned.

### SUP-31 — WP-21 / ACTOR-export

**Given:** Export X was accepted under renderer image A and normalization N.

**When:** Deploy B before X starts or recovers.

**Then:** Dispatch/recovery selects A/N or reports it unavailable; never silently use B or change the accepted output plan. New exports may explicitly use B.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-32 — WP-21 / ACTOR-export

**Given:** Acceptance/outbox commit succeeds and the API/dispatcher dies before task creation; no browser returns.

**When:** Recover through the durable dispatcher/reconciler.

**Then:** Enqueue/reconcile the original request or reach its captured Needs attention deadline. Execution cannot begin until its recovery obligation is durable.

**TestReadyAfter:** WP-21. **Closure:** G-APP. Status: planned.

### SUP-33 — WP-20 / RENDER-PARITY

**Given:** Fixed lossless fixtures exercise cuts/crops/captions and AAC-aligned audio impulses.

**When:** Run preview/export parity for each supported browser/preset.

**Then:** Pass the numerical renderProfile tolerances including zero frame/crop error and exact pre-encode overlays; no automatic threshold blessing or false container-duration equality.

**TestReadyAfter:** WP-20. **Closure:** G-APP. Status: planned.

## Planned test boundaries and files

<!-- prettier-ignore -->
| Suite | Owner / level | Planned path | Required assertions |
| --- | --- | --- | --- |
| STATE-project | WP-03 / server | `tests/integration/workflow/project.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-conversation | WP-03 / server | `tests/integration/workflow/conversation.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-connection | WP-05 / client | `client/src/features/project-workspace/__tests__/connection.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-authentication | WP-05 / client | `client/src/features/project-workspace/__tests__/authentication.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-draft | WP-04 / server | `tests/integration/workflow/draft.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-draft_save | WP-05 / client | `client/src/features/project-workspace/__tests__/draft-save.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-input_target | WP-13 / client | `client/src/features/project-workspace/__tests__/input-target.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-submission | WP-08 / server | `tests/integration/workflow/submission.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-request | WP-09 / server | `tests/integration/workflow/request.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-output_slot | WP-09 / server | `tests/integration/workflow/output-slot.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-attachment | WP-10 / server | `tests/integration/workflow/attachment.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-cancellation | WP-11 / server | `tests/integration/workflow/cancellation.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-upload | WP-15 / client | `client/src/features/project-workspace/__tests__/upload.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-media_access | WP-16 / client | `client/src/features/project-workspace/__tests__/media-access.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-playback | WP-16 / client | `client/src/features/project-workspace/__tests__/playback.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-sketch | WP-17 / client | `client/src/features/project-workspace/__tests__/sketch.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-video_edit | WP-19 / pure | `shared/video-edit/__tests__/composition.contract.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-sharing | WP-18 / server | `tests/integration/workflow/sharing.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-usage | WP-22 / server | `tests/integration/workflow/usage.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-clarification | WP-14 / server | `tests/integration/workflow/clarification.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-download | WP-16 / client | `client/src/features/project-workspace/__tests__/download.contract.test.tsx` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| STATE-assistant_response | WP-14 / server | `tests/integration/workflow/assistant-response.integration.test.ts` | Drive the real public command/API/reducer boundary using independent specification fixtures. Assert visible/persisted outcome plus provider calls, file mutations and usage effects; do not test a second copy of the production transition table. |
| ACCEPT-WP-01 | WP-01 / unit | `shared/schemas/workflow/__tests__/schemas.contract.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-02 | WP-02 / integration | `tests/integration/workflow/harness.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-03 | WP-03 / integration | `tests/integration/workflow/wp-03.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-05 | WP-05 / browser | `tests/e2e/workflow/wp-05.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-06 | WP-06 / integration | `tests/integration/workflow/wp-06.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-07 | WP-07 / integration | `tests/integration/workflow/wp-07.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-08 | WP-08 / integration | `tests/integration/workflow/wp-08.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-09 | WP-09 / integration | `tests/integration/workflow/wp-09.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-10 | WP-10 / integration | `tests/integration/workflow/wp-10.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-11 | WP-11 / integration | `tests/integration/workflow/wp-11.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-13 | WP-13 / browser | `tests/e2e/workflow/wp-13.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-14 | WP-14 / integration | `tests/integration/workflow/wp-14.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-15 | WP-15 / browser | `tests/e2e/workflow/wp-15.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-16 | WP-16 / browser | `tests/e2e/workflow/wp-16.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-17 | WP-17 / browser | `tests/e2e/workflow/wp-17.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-18 | WP-18 / integration | `tests/integration/workflow/wp-18.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-19 | WP-19 / integration | `tests/integration/workflow/wp-19.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-20 | WP-20 / browser | `tests/e2e/workflow/wp-20.spec.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-21 | WP-21 / integration | `tests/integration/workflow/wp-21.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| ACCEPT-WP-22 | WP-22 / integration | `tests/integration/workflow/wp-22.integration.test.ts` | Each named case title retains its acceptance ID; use the original Given/When/Then and observable effects. Backend concurrency assertions additionally run against the real emulator where specified. |
| FIRESTORE-RACES | WP-08 / emulator | `tests/integration/workflow/atomic-races.integration.test.ts` | Use two independent callers and real emulator transactions with barriers. Assert one acceptance/reservation/native dispatch, preserved CAS loser, exact settlement and no outcome invented after crash. Cannot be satisfied by an in-memory map or skipped profile. |
| COMPOSITION-RENDER | WP-21 / real-process | `tests/integration/workflow/video-export-render.integration.test.ts` | Render pinned tiny local fixtures with the actual FFmpeg image. Probe/decode frames/audio and count process launches; saving/link repair launches no new render. |
| RENDER-PARITY | WP-20 / browser-and-real-process | `tests/e2e/workflow/video-preview-parity.spec.ts` | Compare frame boundaries/crops/overlays/audio timing to server reference frames using explicit tolerances; keep caption overlays byte-exact before encoding. |
| COMMERCE | WP-23 / integration-and-browser | `tests/integration/workflow/billing-entitlement.integration.test.ts` | Synthetic provider-signed events and hosted-checkout redirect boundary; paid invoice/purchase identity, not return URL/event arrival order, owns grants. |
| CUTOVER | WP-25 / integration-and-browser | `tests/integration/workflow/legacy-adoption.integration.test.ts` | Use copied legacy fixtures and stable mapping manifest. Verify no original records/IDs change, one writer after activation, stale requests denied, read-only rollback preserves v2 records and recovery. |
| FULL-JOURNEYS | WP-24 / browser | `tests/e2e/workflow/complete-delivery.spec.ts` | Finish and revise an image, a direct/supplied-media shot and a composed video; interleave old-result edits, jobs, disconnects, export and account changes; assert stored versions/receipts and cost facts as well as visible controls. |
| ACTOR-image_or_video_generation | WP-09 / integration | `tests/integration/workflow/image-or-video-generation.integration.test.ts` | Exercise each applicable state-group contract through this real action adapter. Required role-inapplicable events must reject without dispatch/charge. Shared reducer coverage does not replace actor boundary coverage. |
| ACTOR-export | WP-21 / integration | `tests/integration/workflow/export.integration.test.ts` | Exercise each applicable state-group contract through this real action adapter. Required role-inapplicable events must reject without dispatch/charge. Shared reducer coverage does not replace actor boundary coverage. |
| ACTOR-text_assistance | WP-14 / integration | `tests/integration/workflow/text-assistance.integration.test.ts` | Exercise each applicable state-group contract through this real action adapter. Required role-inapplicable events must reject without dispatch/charge. Shared reducer coverage does not replace actor boundary coverage. |
| ACTOR-sketch_acceptance | WP-17 / integration | `tests/integration/workflow/sketch-acceptance.integration.test.ts` | Exercise each applicable state-group contract through this real action adapter. Required role-inapplicable events must reject without dispatch/charge. Shared reducer coverage does not replace actor boundary coverage. |
| ACTOR-video_edit_save | WP-19 / integration | `tests/integration/workflow/video-edit-save.integration.test.ts` | Exercise each applicable state-group contract through this real action adapter. Required role-inapplicable events must reject without dispatch/charge. Shared reducer coverage does not replace actor boundary coverage. |

## Evidence required to mark a case passed

Record case/state/edge ID, implementation commit, real test path/title, profile (unit/integration/emulator/browser/real-process/hosted), fixture and catalog versions, result, skips, and artifact/log location. The actual test must reach the production command boundary; it must not just execute the design JSON or assert that its labels are present. For rejected/race paths, also assert unchanged owned data and provider/process/financial effect counts.

No current application pass is claimed by this plan checker. Update completion evidence only after running the required tests against the implemented revision.
