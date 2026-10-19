# Interaction contract and acceptance coverage

Status: proposed implementation requirements. The [state catalog](state-catalog.json) maps visual examples; the [main workflow contract](../workflow/workflow-state-contract.md) remains authoritative for history, authority, receipts and admission. Tests below are planned unless the implementation notes explicitly identify existing executed coverage.

## Independent state

Keep separate identities for the active draft/revision, viewed media version, selected phrase and its baseline, accepted request/slots, video-edit revision/selection, and timeline visibility. A change to one is not a transition of all the others.

Normal ongoing creation always retains the sidebar and a viewed asset where one is available. Only a genuinely empty workspace, unavailable/denied media, or an intentionally different narrow-screen view may omit it. An empty new draft does not clear a previously viewed asset.

After creation acceptance, D03/D11 open the specified new draft; the execution snapshot is immutable. W06/W07 illustrate inspection of that immutable snapshot, not a requirement to lock the entire workspace while work runs. Video follow-ups start without an implicit input or edit operation. Image and multi-output follow-ups retain D04/D05's distinct rules; the deferred dedicated image editor does not rewrite those rules.

## Phrase editing

| State / event                            | Required transition and preserved data                                                                                                                                                                       | Examples                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Empty draft                              | No invented labels; generation eligibility follows the selected action/profile.                                                                                                                              | S01, W59                                      |
| Typing / labeling                        | Keep typing and submission independent of label work. Clear incompatible old painting; admit results only for the matching text signature.                                                                   | S02, S27                                      |
| Matching cached labels refreshing        | Keep matching labels while refreshing; a different text signature cannot inherit them.                                                                                                                       | S39                                           |
| Success / no spans / unavailable labels  | Normal writing remains usable. No-spans success is not an error; manual selection remains available.                                                                                                         | S03, S26, S28, S40                            |
| Hide/show highlights                     | Presentation only. Preserve words, inputs, settings, selection ownership and history; the toggle alone does not submit work.                                                                                 | S03–S04                                       |
| Hover / focus / select                   | Identify the exact phrase. A readable label and focus treatment supplement color. Selection fetches alternatives, not media.                                                                                 | S05–S09, S37                                  |
| Initial loading                          | Selected words remain visible. Do not display another phrase's old list as current.                                                                                                                          | S06, S22                                      |
| Ready / pointer / keyboard option        | Only the explicitly chosen option may be applied. Merely focusing or hovering changes no words.                                                                                                              | S07–S09                                       |
| Custom request                           | Suggest fetches alternatives only. Whitespace-only requests cannot submit; limit is 500 characters. Long input scrolls within the field.                                                                     | S10, S41                                      |
| Custom loading                           | Retain typed wording and the previous valid options. Applying a prior option invalidates the pending response.                                                                                               | S11, S42                                      |
| Custom response / failure / empty        | Replace only the bound suggestion set. No automatic application. Preserve custom wording on failure and through dismissal/reopening of that draft/target.                                                    | S12–S15                                       |
| Apply                                    | Check draft ID, revision, target range/context, action/model/input context and present write eligibility. Change one exact occurrence in one undoable draft revision; preserve everything outside the range. | S16, S28, S30, S34, S38; exact outcome frames |
| Changed draft, target still identifiable | Show the proposed change against the current draft. Apply only after deliberate review and revalidation; retain other edits.                                                                                 | S19–S20                                       |
| Missing/ambiguous target                 | Do not guess another occurrence or rebuild the old full prompt. Ask for a new selection while retaining the current words.                                                                                   | S21                                           |
| Target accepted/frozen or inaccessible   | No application even if a revision number still matches. A new draft requires an explicit action in a writable destination.                                                                                   | S24–S25, W30–W31                              |
| Another selection/draft/input/model      | Cancel or ignore the old request. Cache admission and application remain tied to the original binding; never populate the new target with an old reply.                                                      | S22–S23, W24, W29, W34, W38–W39               |
| Apply failed                             | Keep original words and do not report success.                                                                                                                                                               | S31                                           |
| Applied but save pending/failed          | Keep the local change and honest acknowledgment state; retry saving the same revision.                                                                                                                       | S16, S32, W27–W28                             |
| Close / Escape                           | Close the panel without changing draft/media/viewer. Late responses cannot reopen it or steal focus. Retain unsent custom wording by its draft/target.                                                       | Return frames                                 |
| Undo / redo                              | Affect only unsubmitted work in the focused editor. A new edit clears that editor's redo branch; accepted requests and generated media remain.                                                               | S16–S18, S38                                  |

A second or later phrase edit uses the same state machine with the new draft revision and exact new range. It must preserve earlier edits outside that range. Duplicate words, Unicode/grapheme boundaries, punctuation, whitespace, long replacements and response-list changes are parameterized acceptance cases, not permission to use a fuzzy first match.

Enter on a focused option applies it once. Arrow keys navigate the option list with visible focus and keep the focused option in view. Escape closes without applying. Enter in the custom textarea inserts a line break; Suggest submits that text request. Tab reaches close, options, custom text and Suggest without a keyboard trap. Ordinary undo belongs to the focused text field; timeline undo applies only when the timeline editor owns that command. Opening or receiving a panel response does not move focus to an unrelated control.

## Asset, generation and history interactions

| Event / outcome                      | Required behavior                                                                                                                                                                           | Examples                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| View another result                  | Change the viewer only; retain current draft, bound input and model/settings.                                                                                                               | W01–W03, W11, W45, W57–W58                |
| Reuse setup                          | Copy the exact captured setup into a new draft; park meaningful work. Historical requests stay unchanged; validate against current capabilities.                                            | W04, W29–W30, W34, W37                    |
| Use image/frame as input             | Explicitly bind the chosen immutable version/frame to the indicated draft. Preserve unrelated fields and review incompatible capabilities.                                                  | W05, W60                                  |
| Generate                             | Validate and persist the execution revision; acceptance snapshots words, inputs, effective model/settings and destination. Open the specified follow-up draft, without clearing the viewer. | W06–W09, W59; D03/D11                     |
| Acceptance unknown                   | Check/reconcile the same identity. No second creative request or guessed failure.                                                                                                           | W08, W19, X01                             |
| Several requests                     | Each has its own captured snapshot and status. Arrival order does not reorder accepted requests or merge slots.                                                                             | W09–W12, W54–W56                          |
| Background completion/failure        | Update only its own history/result. Preserve active draft, selected inputs, viewer, edit and navigation.                                                                                    | W10–W12, W17, W23, W55–W56                |
| Partial batch                        | Keep original slot numbers, including failed/cancelled slots. Ready slots may be inspected without pretending the whole request finished.                                                   | W13, W41–W45                              |
| Cancellation                         | Explicit request, pending confirmation and terminal outcome remain distinct. Completed media is retained if completion wins.                                                                | W14–W17, W42                              |
| Retry failed work                    | Review a new execution identity with the original exact inputs/settings. A failed-slot retry is separate from the original batch.                                                           | W18, W43–W44                              |
| Provider finished, storing/attaching | No Ready claim before durability. Repair the same output/destination; no generation or new usage charge.                                                                                    | W20–W23, W46                              |
| Lost output                          | Explain that the original output is unrecoverable. A new attempt is explicit, not a storage retry.                                                                                          | W47                                       |
| Missing input/media, denied access   | Distinguish input eligibility from viewer availability and authorization. Preserve history/owned draft data without inventing a substitute.                                                 | W24–W25, W31, W38–W39                     |
| Playback failure                     | Generation can remain successful. Retry playback/download the owned original; unavailable decoding cannot supply a new frame.                                                               | W26                                       |
| Offline/save conflict                | Preserve local revisions, distinguish local from server acknowledgment, and require deliberate conflict resolution.                                                                         | S32, W27–W28                              |
| Capability/admission rejection       | Retain the draft; no accepted execution is invented. Display the actual reason and appropriate recovery.                                                                                    | W29, W34–W35; Page 27 capability contract |
| Reopen                               | Restore the correct draft, viewed version and view preference. Never auto-submit or repeat provider work.                                                                                   | W40                                       |

Eligibility reasons retain the main contract's priority/order. Missing input offers replacement/removal; stale parameters offer review; unavailable models offer another model; denied access requires restored access; rate/allowance limits offer the server's allowed recheck/reset path. Do not replace these with one generic retry or invent a purchase action during bounded free validation. Destination/project loss continues through the existing owned-result recovery flow, not an automatically created project.

## Timeline visibility

Visibility is a view preference, stored per user/browser/workspace/video-edit identity. It does not create an edit revision or dirty state. Collapse and expansion preserve exact media versions, track presence, timing, gains, captions, playhead, playing/paused state, selected elements, zoom and scroll. The preview fits the available area without changing fit/crop policy or output aspect ratio. Square/portrait fitting must use both width and height constraints.

The toggle stays reachable when collapsed. Keyboard focus remains on the toggle; hidden controls are not focusable. A modal retains command ownership, and an unfinished drag must complete/cancel before collapse is applied. Explicit operations that require the timeline reveal it before focusing the relevant control. Inspecting another asset retains the edit and chosen visibility and provides Back to edit. Playback ownership transfers deliberately between the inspected source and edit preview; closing the timeline alone does not pause it.

No editor is implicitly created just because a video was generated. A silent file has no source-audio lane. Music/captions appear only when added, and waveform loading does not imply missing audio. The rich mobile example is a separate twelve-second edit fixture with deliberately added tracks; the desktop fixtures include silent 5.1-second, sound-bearing 8-second and mixed 13.1-second edits.

## Required acceptance tests

| ID     | Test boundary and observable assertion                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| PE-A01 | Label lifecycle: direct typed drafts work without expansion; stale signatures never paint current words.                     |
| PE-A02 | Hidden/cached/error/no-spans labels: word bytes and media dispatch eligibility are unchanged.                                |
| PE-A03 | Selection: mouse, keyboard and manual ranges identify the exact occurrence, including repeated phrases and Unicode.          |
| PE-A04 | Suggestion request switching: an old main/custom response cannot populate another draft, phrase, input or model context.     |
| PE-A05 | Client cache: identical custom wording against different bindings cannot collide.                                            |
| PE-A06 | Custom input: whitespace disabled, 500-character boundary, overflow and failed retry preserve the entered value.             |
| PE-A07 | Apply: one chosen value changes one range; all other words, input IDs, settings, viewer and accepted jobs remain identical.  |
| PE-A08 | Apply rejection: frozen, stale, removed, ambiguous and denied targets never overwrite current text.                          |
| PE-A09 | Reviewed stale application: another edit elsewhere in the prompt survives; application rechecks eligibility at commit.       |
| PE-A10 | Repeated edits: at least three replacements, undo twice, redo and a new edit produce correct revision/redo behavior.         |
| PE-A11 | Feedback/save: failure never flashes success; pending, local-only and server-acknowledged revisions are distinguishable.     |
| PE-A12 | Close/switch/reopen: draft and custom wording are retained by scope; cancelled or late requests do not reopen UI.            |
| PE-A13 | Keyboard: arrows/Enter/Escape/Tab and custom-field undo are owned by the correct surface; no accidental generation.          |
| PE-A14 | Long text/options: full replacement text is accessible, focused rows scroll into view and narrow viewports remain usable.    |
| PE-W01 | Existing assets remain visible beside empty, edited, blocked and generating draft states where access permits.               |
| PE-W02 | Browse older/newer media, explicit input binding and setup reuse have distinct effects and preserve unrelated work.          |
| PE-W03 | Submission/double submit/lost response: exact execution snapshot and one receipt; follow-up draft and viewer follow D03/D11. |
| PE-W04 | Three accepted requests complete out of order; records and slots retain dispatch identity/order.                             |
| PE-W05 | Partial results, failed-slot retry and cancellation races retain all terminal evidence and ready media.                      |
| PE-W06 | Storage/attachment repair makes no provider call, new charge or duplicate artifact.                                          |
| PE-W07 | Missing, denied, offline, conflict, decode failure and unrecoverable output take their specific recovery paths.              |
| PE-W08 | Model/input changes and historical setup reuse revalidate current qualified capabilities without rewriting history.          |
| PE-T01 | Toggle visibility with silent, native-sound, user-music, captioned and mixed edits; saved edit data is byte-equivalent.      |
| PE-T02 | Toggle during playback/paused state: same playhead, playback state, selection, gains, zoom and scroll.                       |
| PE-T03 | Square/portrait/landscape previews retain output geometry and fit/crop; no visibility-induced clipping or stretch.           |
| PE-T04 | Focus, hidden tab targets, active drag and modal ownership behave as specified.                                              |
| PE-T05 | Inspect another asset and return while expanded/collapsed: active edit and draft remain unchanged.                           |
| PE-T06 | Reload/restoration and separate edits restore the appropriate view preference without media work.                            |

Run these across applicable desktop and narrow layouts and across model profiles with fixed, editable, derived and unavailable capabilities. Do not enumerate an infinite cross-product as independent workflows: preserve each independent state axis and test their combinations. The catalog names the visible examples; the rules above define the carried data and rejected transitions.
