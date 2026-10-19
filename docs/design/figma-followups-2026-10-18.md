# Figma follow-ups — October 18, 2026

Status after the 485-frame Figma review (fileKey `hVtzoSXhV2rQmxc6pOYC8c`). The live file still has the 485 frames from the [Oct 17 reconciliation](figma-fidelity-implementation-2026-10-17.md). The only new nodes are four "Output settings overlay" components on page 10. The visual fixes from this pass are in the working tree, uncommitted. This file lists what still needs implementation or a design decision.

## Missing functionality

| #   | Screens           | What is missing                                                                                                                                                                                                                                                                    | Work needed                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | E09               | **Export failed for a missing source.** No "Export failed" popover ("Stadium v1 is unavailable." + **Replace clip**), and Export is not disabled.                                                                                                                                  | The client only knows a source failed to load, which it treats as retryable. Add a permanent "unavailable" state to the media version, or a `source_unavailable` edit issue that carries the element id. Export jobs also need a structured `failedItemId`/`failedVersionId`. Server errors currently give only "Source version_x is unavailable." / `input_unavailable`. Then the editor can name the clip and open Replace source. |
| 2   | P02               | **Media count per conversation** ("Edited today · 4 clips", "· 3 pictures").                                                                                                                                                                                                       | Media versions record `requestId` but not the conversation, and the client loads only the open conversation's requests. Add a per-conversation picture/clip count to the project's conversation listing response, then render it in the row meta.                                                                                                                                                                                    |
| 3   | M10, M12, H20/N65 | **Area (masked) image edits.** Edit image stays disabled while a mask is applied ("Area edits are unavailable for the current models.").                                                                                                                                           | A model or server path that accepts masks, then removal of the guard. Product/provider decision; it stays guarded under the current spending bounds.                                                                                                                                                                                                                                                                                 |
| 4   | E15, E48, B36–B38 | **Edit history "what changed" is inferred.** Revisions store no command, so descriptions are worked out by diffing against the previous revision. A restore is recognised by an exact match with an older arrangement, so an Undo back to that state also reads "Restored edit N". | Store the command kind and `restoredFrom` on each video-edit revision. `revisionDescription` can then read the record instead of guessing.                                                                                                                                                                                                                                                                                           |
| 5   | T01/T02 email     | **Custom HTML email delivery.** Carried over from the Oct 17 record.                                                                                                                                                                                                               | Templates render locally; delivery through the sender is not wired.                                                                                                                                                                                                                                                                                                                                                                  |

### Status (Oct 18, 2026, uncommitted)

- **1 · E09: implemented.** Validation now names each element whose source is missing, unpinned or failed: `source_unavailable` carries the item or music `elementId` and a `versionId`. A pending check is a separate `source_pending` issue. Export records carry `failedItemId`/`failedVersionId` when a source cannot be read (index row gone, object changed, owner mismatch, storage 404 or bytes mismatch). The editor shows "Export failed · <label> is unavailable." with **Replace clip** (or picture/music), which opens Replace source. It lists the same row in the notices and disables Export. Older version-keyed issues and failed exports without the fields still read. Not covered: an edit whose saved issues predate a source going missing still reaches export creation, which refuses it with a plain message.
- **2 · P02: implemented.** `GET /api/projects/:projectId/conversations` returns `ConversationListing` rows with `media: { pictures, clips }`. The counts come from generated and sketch media joined to their requests. Hidden media and other owners' rows are not counted. The row meta reads "Edited today · 4 clips" or "· 1 picture · 1 clip", and only the edit time when there are no counts or nothing has been made.
- **4 · Edit history: implemented.** Each saved revision stores `change: { kind, restoredFrom? }`. `revisionDescription` reads it: a restore is "Restored edit N", and an undo/redo (`replace_composition`) is described by its diff, never as a restore. Revisions saved before this keep the inferred fallback.
- **3 and 5:** still open (product/provider decisions).

## Verification still owed

- **Browser re-capture.** None of this pass's fixes were re-captured against the 485-frame gallery. Agents measured the public/docs pages in headless Chrome and checked composer CSS in a stand-in HTML page. Editor, account and workspace changes have tests only.
- **Applied/Return capture page.** This page renders the conversation without the request-action handlers, so the "···" message menu disappears in 33 captures. The production workspace passes them. Fix the capture harness, not the app.
- **Account security page.** The Account page fixes are CSS only and were not rendered, because the page needs sign-in.

## Design decisions needed (Figma disagrees with itself)

| Topic                                            | Conflict                                                                                                                                                              | App today                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Editor toolbar Add button                        | The master `Toolbar / Editor` (Docked) has Quiet "Add media". About 30 frames override it to Secondary and/or "Add" (E03–E11, E13, E16, E20, E22, E51–E60, T-frames). | Follows the master                        |
| Composer placeholder                             | "Describe a change…" (9 frames) vs "Describe the change…" (5). Video uses "Describe your video…" and "What would you like to make?".                                  | Unchanged                                 |
| "16:9" chip chevron                              | Some frames show a chevron and others don't for the same chip. The production edit model fixes the aspect ratio, and the app shows that case with no chevron.         | Chevron only when the setting is editable |
| Caption size readout                             | Figma shows "32 px". The rendered caption (the user's earlier decision) is about 44 px desktop and 70 px mobile in exported pixels.                                   | Rounded real value                        |
| Docs H06/N57 "Organize without changing history" | Figma's text covers favourite/preferred/rename. The app's covers the shipped library controls (filter, sort, hide, copy). Desktop and mobile Figma also disagree.     | App copy                                  |
| Docs sheets O25/O29/O30                          | Item titles contradict Figma's own guide pages N58/N62/N63.                                                                                                           | Matches the guide pages                   |
| S09 Topic control                                | Shows both Support and Security selected.                                                                                                                             | Single selection                          |
| Success text colour                              | No Fresh success text token exists. N105 uses the literal `#afd6bc`, the success icon's colour.                                                                       | Literal value                             |
| Caption editor placement (E20, E58–E60)          | Frames disagree, and CONTEXT.md keeps the current placement.                                                                                                          | Unchanged                                 |
| Pricing in the mobile menu (N02)                 | Figma still lists Pricing; it was retired by decision.                                                                                                                | Not shown                                 |

## Fixed in this pass

- **Editor:**
  - Undo/redo use Figma's `undo-2`/`redo-2`; the old redo was a vertically flipped undo.
  - Caption size shows a rounded value.
  - Dropdown chevrons sit at the field edge.
  - A muted speaker shows on the transport and the Clip sound track.
  - Restores read "Restored edit N".
  - The music bar is clamped to the edit end.
  - The playhead is kept after a move.
  - "Export latest" is inline with Download and Share.
  - Mobile timeline position, divider, end line and chevron fixed.
  - The Show/Hide caret points up when the timeline is hidden.
  - The empty-stage text has no trailing period.
- **Workspace:**
  - The composer has plain text after highlighting fails.
  - Finer phrase underlines.
  - The replacement field uses Figtree.
  - Offline helper line and "Only on this device" footer.
  - Archived helper moved under the words.
  - Running picture/clip rows match the design.
  - Advanced chip uses the toggles icon.
  - Pointer-opened menus no longer focus their search field.
  - Menu checkmark size and position.
- **Public/account/docs:**
  - "webmail" copy in the support dialogs.
  - Muted security email, legal links and the docs support link.
  - Green success line for a reset request.
  - Google-managed text size.
  - Docs "On this page" spacing, search row spacing and no-results alignment.
  - Security "Contact support" width and helper tracking.
  - Pricing note and icon offsets.
  - "…add it to a video edit."
