# Reference-first admission

Issue #119 implements the owner direction recorded in the 2026-09-18 review
and annotated in [ADR-0022](../adr/0022-takes-can-enter-a-session-from-an-upload-the-sketchpad-or-the-studio.md).
Owner sign-off and the current browser acceptance walkthrough remain open.

## Creator workflow

Uploading a valid picture without saved associated words saves reference bytes
through the authenticated `POST /api/preview/upload` boundary, with source
`pending-first-frame`. The request carries the chooser's creator ID as metadata;
a changed sign-in is refused before storing the selected file under another
creator. The workspace shows the whole reference as pending input.
It does not set `domain.startFrame`, create a generation identity, or invent
associated words. A session with no resolving words-version also uses this
pending state; it never silently arms the legacy reference upload.

An in-flight reference upload is an explicit workspace state. The input
expansion button is disabled until it settles; the shared optimization entry
also refuses keyboard, reoptimization and image-mode shortcuts while the
originating upload is in flight. A selection reserves this guard before file
hashing, including selection after a retained failed admission. A different
selection whose creator/session changes during that read is cancelled before
dispatch; a same-file retry may keep its original destination after navigation,
while an account change always cancels it. Expansion therefore cannot persist a new
session or generate a replacement before the reference handle exists. Conversely,
reference selection is disabled while ordinary words expansion is already in
flight; the file-change handler also refuses selection during that state.

The creator writes and expands words using the ordinary workspace path. While a
reference is pending, its optimization continuation preserves that reference
instead of generating a replacement picture. With an older frame already armed,
the input action still expands the visible words while the new reference is
pending; it cannot silently render that hidden older frame. Only that same workspace's normal
persistence callback may bind its originating draft reference to its newly saved
session. Merely browsing another session performs no transfer.

The creator then presses **Use with these words**. A resolving session and
words-version are both required. Before a new acceptance is minted or dispatched,
the existing history writer flushes and awaits that exact version
(`flushVersionWrites`). It preserves the order of any already-running write and
requires repository success against the named session, without UUID fallback.
Failed words persistence keeps the reference fresh and pending; navigation,
account or selection changes during the await cancel dispatch. A retained
admission receipt skips this new-version readiness step and keeps its original
acceptance identity. The server verifies the destination is owned
and that its version already contains nonempty words. An unresolved or partially
resolved target stays pending and reports what must be saved. The admission
endpoint never creates a session or words-version.

## Existing boundaries

`useFirstFrameAdmission` chooses complete immediate admission or pending input.
`usePendingFirstFrame` owns the pending handle, explicit association and browser
recovery. Its feature API validates the existing shared upload response schema.

`POST /api/preview/upload/admit-reference` accepts exactly:

```json
{
  "storagePath": "users/<creator>/previews/images/<reference>",
  "sessionId": "<existing owned session>",
  "promptVersionId": "<existing version with words>",
  "admissionKey": "<one immutable acceptance key>"
}
```

Before a new admission it proves source path ownership, destination ownership
and saved words. It reads bytes through a newly signed owned URL, applies the
existing remote-media bounds and image-byte validation, then calls the same
`admitPictureTake` boundary as immediate upload. The original pending-reference
path is recorded as a source input alongside the admission's own durable media
copy. Origin is `upload`; production provenance stays explicitly unknown.

The response is the shared `UploadPreviewImageResponse`: the take's durable
handles, refreshed URL and attachment outcome. A `generationId` is returned and
armed only for an attached take. No provider is invoked.

## Recovery and authority

Browser localStorage holds only a Zod-validated bounded handle, immutable session
scope, and an optional attempt containing the destination version and admission
key plus a small unresolved-attachment status hint. Keys include the authenticated creator and original session/draft. Signed
URLs and file bytes are not persisted there. Reload signs a new reference URL;
a failed preview does not erase its recovery handle. Quota/storage failures
retain the valid reference in memory and explain that reload recovery is
unavailable. Browser storage is a recovery hint, never an ownership authority.

New association persists its attempt before dispatch. A disconnected request or
failed attachment retains its original destination and key across retries and
reload; current editor selection cannot retarget it. A retained attempt exposes
**Retry saving**, uses its original associated words, and stays retryable even
when the current composer is cleared. A known attachment failure says **Made,
but not saved**. Late upload responses save
to their originating scope, and late admission responses cannot arm another
session or creator's workspace. A newer upload supersedes older responses in
that same pending slot.

Server recovery reads the existing admission receipt. `resumePendingUpload`
checks its origin, original reference source and exact destination before
resuming it. The admitted media copy cannot masquerade as that original source.
A settled acceptance does not need its staging bytes or current words-version
revalidated: its receipt already contains the authoritative media and take
record. Unresolved attachment resumes the same take; successful attachment
replays it. The existing owned-picture resolver refreshes the returned URL.

Nothing clears or deletes the uploaded source as part of association. Admission
keeps an independent media copy. Retention remains governed by
[Admission media lifecycle](admission-media-lifecycle.md); this work does not
authorize cleanup or choose a retention window.

## Deterministic evidence

- First-frame hook regressions cover complete admission, missing and partial
  targets, wordless input, retry identity and late session responses.
- Pending hook regressions cover wordless upload, reload/signature refresh,
  ordinary draft promotion followed by explicit admission, absent version,
  retry/reload, creator/session switching, late upload/admission responses,
  and storage failure without dropping the valid input.
- Real Express handler plus SessionService regressions cover owned association,
  duplicate acceptance, foreign creator source/destination refusal, missing and
  empty words, receipt recovery without staging media, original-source and
  destination conflicts, and refusing the admitted copy as a new source.
- The shared admission regression rejects blank associated upload words before
  storing any media.

These offline checks do not replace the live upload/storage walkthrough or
owner sign-off on Decisions A and B.

Local Chromium checks on 2026-10-03 used the real frontend with API-contract
doubles: wordless upload, the explicit words guard, reload recovery, ordinary
words expansion and session persistence without a replacement image, and one
explicit association request that armed the attached picture. The action was
clickable at 1280×720 and 800×600; the pending image stayed unarmed. The words
writer is awaited before a new association, rather than racing its 500 ms
debounce. No provider generation call was dispatched. This is targeted browser
evidence, not #141's cross-mode walkthrough or deployed-storage qualification.
