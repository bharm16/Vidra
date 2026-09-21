# Takes can enter a session from an upload, the sketchpad, or the studio

**Status:** Accepted — 2026-09-17 (owner: Bryce Harmon) · amends [ADR-0002](0002-vidra-is-an-authoring-tool-for-non-experts.md) (two narrow exceptions to the freeze), [ADR-0012](0012-the-space-lineage-network.md) (the three columns stop meaning depth), [ADR-0013](0013-space-lineage-is-persisted-not-derived.md) (a picture's ancestor is no longer always its words-version), [ADR-0017](0017-live-editor-is-its-own-plane-not-the-space.md) (one accept door out of the live editor), [ADR-0019](0019-the-studio-standalone-conversational-image-workspace.md) (the first-frame bridge, in both directions) · amends the [`CONTEXT.md`](../../CONTEXT.md) entries **Take**, **The studio**, and **Live output**, and adds **Origin**, **Production provenance**, **Associated words**, and **Refine edge**

## Context

Vidra grew three places a creator can make a picture — the page's own loop, the
[Live editor](0017-live-editor-is-its-own-plane-not-the-space.md), and
[the studio](0019-the-studio-standalone-conversational-image-workspace.md) — and no
way for a picture to move between them. Each was decided on its own merits, and each
decision was right in isolation; together they produce a product where the only bridge
between modes is the creator's screenshot key. A 2026-09-17 unification audit found the
cost concentrated in one place: the session record can hold a picture only if the
session's own words generated it, so anything a creator brings in loses its identity,
its ancestry, and the words that made it.

The product statement this ADR records, in glossary terms: **Vidra is a visual
direction workspace. A creator starts with words, a sketch, or a reference image;
refines the same session through semantic editing, image editing, and motion controls;
then generates and compares takes without losing their inputs or history.** The
milestone that proves it: a creator starts a session from a sketch or a reference, arms
a [first frame](../../CONTEXT.md#first-frame), refines it through the studio, adjusts
visible direction, makes a clip, and returns after a refresh to the same session with
every input, output, and relationship intact.

The eight decisions below are the product commitments the cross-mode tickets (#82–#90)
would otherwise each have made silently and differently. They are settled here once, so
the implementation tickets can be read against one contract. This ADR amends earlier
decisions; it never deletes or rewrites them, and each amended ADR now carries an
"amended by" note pointing here.

## Decision

### 1. A picture take records its origin

A picture [take](../../CONTEXT.md#take) may enter a session from an **upload**, the
**sketchpad**, or **the studio**, not only from a generation run against the session's
own words. Every take records its **origin** — a closed, wire-validated set
(`generated | upload | sketchpad | studio`), recorded at admission and never inferred
later from which other fields happen to be populated. A clip's origin is always
`generated`. All three admitting paths go through one shared admission boundary rather
than one path per entry point; upload is its first implementation, and the live editor
and the studio reuse it.

This amends [ADR-0013](0013-space-lineage-is-persisted-not-derived.md), whose ancestor
rule reads "a picture → its words-version." That remains the default and the fallback —
an admitted picture still hangs from the words-version it was admitted under when it has
no picture ancestor — but it is no longer the whole truth about where a picture came
from. It also amends the glossary's **Take** entry.

**Trade-off.** A closed origin set is a contract that must be extended, validated, and
round-tripped every time a new door opens; the cheaper alternatives — a free-form string,
or deducing origin from which fields are filled in — make "where did this come from"
un-assertable, and an unrecognized origin then renders as a plausible lie rather than a
rejected record. We take the schema churn.

### 2. Production provenance and associated words are two things, never one

A take carries two distinct texts.

**Production provenance** is what actually produced it: the prompt or edit instruction
plus the source inputs, recorded **when known** and recorded as _unknown_ when it is
not. An upload records unknown provenance rather than an invented one. A studio edit's
provenance is its edit instruction — "remove the chair" — not a full shot description.
An accepted live output's provenance is the snapshot, prompt, seed, strength, and steps
of the exact output that was on screen, not the sketchpad's state at the moment of the
click.

**Associated words** is the [words-version](../../CONTEXT.md#words-node) the take is
filed under — the direction restored into [the input](../../CONTEXT.md#the-input) when
the take is selected. Every take has one.

They frequently coincide (a picture generated from the session's own words) and are
**never presented as identical**. The take-restore contract of
[ADR-0010](0010-one-visible-text-one-loop-subscription-at-keep.md) is unchanged in
behavior — selecting a take restores media and words together, browsing stays
read-only — but what it restores is now named: associated words, not "the text that
produced this." Restoring "remove the chair" into the input would be nonsense, and
restoring an invented shot description for an upload would be a fabrication.

This amends the glossary's **Take** entry ("permanently paired with the exact text that
produced it").

**Trade-off.** Two fields where one used to do, and every take-rendering surface must
now decide which one it means. The alternative — keep one paired text and backfill
something plausible for admitted takes — would have the product assert a production fact
it does not have. ADR-0010's truth contract ("the text you can see is the only thing
that runs") is the same principle one layer down: an honest _unknown_ beats a confident
fabrication.

### 3. Picture → picture ancestry is allowed, and the columns stop meaning depth

Repeated studio edits produce picture → picture → picture chains.
[ADR-0012](0012-the-space-lineage-network.md)'s "depth is bounded by the pipeline; only
breadth grows" did not anticipate them.

Keep [the space](../../CONTEXT.md#the-space)'s three visual columns — words, pictures,
clips — but stop reading the columns as the maximum ancestry depth. **The columns are
media types, not generations.** A refinement relationship between two pictures is legal
and is drawn _within_ the picture column.

The edge kind is named **`refine`**, joining ADR-0013's `spine | roll | reword | move`.
It stays derived, never stored, exactly as ADR-0013 requires: picture → picture is
always `refine`, the same way picture → clip is always `move`.

Multiple source inputs are recorded in full; **one display ancestor** is recorded
alongside them and is what the space draws. The display ancestor is a recorded choice,
not a positional guess: when no source input is a take in this session there is no
display ancestor, the take hangs from its associated words node, and its picture
ancestry reads as explicitly unknown rather than being attached to whichever sibling
happens to be listed first.

**Trade-off.** The layout engine gets harder — a column with internal depth needs row
assignment that a flat three-generation layout never needed — and one display ancestor
is a deliberately lossy drawing of a multi-input truth. Both are accepted over the
alternatives: a fourth column per edit generation destroys the media-type reading of the
space, and drawing every source input turns the space into the operations graph ADR-0012
rejected on the creator's behalf.

### 4. The studio bridge runs in both directions, and is still not a first-frame factory

A session picture can open a **studio project** — recording its origin session,
words-version, and [take identity](../../CONTEXT.md#take-identity) — and a studio image
can return to a session as a picture take through the same admission boundary as every
other origin. Both handoffs are explicit, creator-invoked, and one image at a time.

The returning picture's ancestry derives from the chosen image's **producing turn and
that turn's actual inputs**, never from the project's origin link alone. An unrelated
generation inside an origin-linked project returns with no picture ancestor and gets no
`refine` edge; only an edit that actually consumed the bridged source picture earns one.

> **Generalized 2026-09-18 (owner-approved; issue #132).** The edge no longer
> requires the consumed input to be the project's original bridged picture. A
> turn that consumed an image **already admitted to this destination session**
> resolves that input to the take it became, so an edit → return → edit again →
> return chain draws a `refine` edge at every hop instead of breaking after the
> first — which is where the rule as first written left repeated refinement: the
> second hop's source had a take identity in the session but was recorded as a
> plain studio image. **Ownership of the relationship stays with the session
> take, and the studio keeps no record of it at all.** A returned take's
> production provenance already carries the producing project, turn and image
> identities (decision 2), so that record is the one statement of "studio image
> X became take T in this session": written once by admission, living and dying
> with the session. The return resolves a consumed image by looking its
> identity up in the destination session — the session-side twin of the studio
> store's identity-based produced-image retrieval (#121), never a walk over a
> history page. A studio-side image→take mapping was considered and rejected:
> it would be a second copy of the relationship, free to disagree with the take
> record and able to outlive the session it points at, so deleting a
> destination session could leave a stale mapping that redirected later returns.
> With the session as owner there is nothing to invalidate and nothing to
> reconcile; the mapping write is admission's own, and a replayed or
> interrupted return repairs the recorded relationship from the admission
> receipt rather than minting a rival take (decision 6's resume contract). The
> destination scoping is unchanged: an input is resolved only against the
> session this return is landing in, so an image admitted to a session that has
> since been deleted is recorded as the ordinary studio image it now is.

This amends the glossary's **The studio** entry ("the studio is not a first-frame
factory and feeds nothing downstream") and
[ADR-0019](0019-the-studio-standalone-conversational-image-workspace.md)'s consequence
that "keeping it standalone is deliberate," and it discharges the "first-frame bridge"
follow-up ADR-0019 already names.

It does **not** reverse ADR-0019's decisions 2 and 3. Images remain a deliverable in
their own right — most studio projects will never feed a session, and the studio is not
scoped, measured, or designed as a supplier to the page. A studio project stays a
first-class record in its own collection, never inside a session.
**Optional handoffs, not a fold.**

**Trade-off.** Two surfaces now know about each other, and the studio's freedom to change
its own record shape is bounded by the admission contract it must speak. The alternative
considered and rejected for a second time was folding the studio into the page:
ADR-0019's reasons stand, and a bridge is the smallest thing that lets a creator keep the
picture they already have instead of describing it again somewhere else.

### 5. An accepted live output becomes a picture take; the live editor stays ephemeral

A creator can **accept the shown live output** into a session as a picture take with
origin `sketchpad`, production provenance equal to the inputs of that exact output, and
the sketchpad snapshot recorded as a source input. What is accepted is the output the
creator was looking at, not whatever the relay returns next.

This amends the glossary's **Live output** entry ("nothing is kept or paired durably")
and honors the **Realtime sketch** entry's "a candidate expansion input for first
frames" — acceptance is how a sketch becomes that input.

[ADR-0017](0017-live-editor-is-its-own-plane-not-the-space.md) stands. The
[Live editor](../../CONTEXT.md#live-editor) keeps nothing itself: no lineage, no takes,
one editor object, an ephemeral camera, and the accumulating-board idea still deferred
behind ADR-0012's "nothing spatial is stored." Acceptance is a one-way export at the
creator's press, not a memory.

The action is **"Use this"** or **"accept"** — never **"Keep."** Keep is reserved for
ending the clip loop and carrying the subscription offer (ADR-0010), and a second Keep
elsewhere in the product would blunt the only word that means "I am finished."

**Trade-off.** "Ephemeral by definition" becomes "ephemeral, with one door," which is a
weaker sentence to defend — a future reader could mistake the door for permission to
accumulate results on the live plane. It is not, and ADR-0017's rejection of the board is
untouched. The trade is worth it because the alternative is the creator screenshotting
the live output and uploading it, which is precisely the lose-your-inputs failure this
ADR exists to end, and which destroys the provenance on the way through.

### 6. A narrow freeze exception for session attachment

[ADR-0002](0002-vidra-is-an-authoring-tool-for-non-experts.md) froze the video-job
resilience layer. This ADR opens exactly one boundary inside it and nothing else.

**Opened.** The **worker-to-session attachment boundary** — the step that takes an
already-completed picture or clip and attaches it to its session — together with: the
attachment's persisted state (pending, attached, or failed-and-retryable), its retry, its
resumption after a worker restart, the client polling that treats a job as terminal only
once attachment resolves, the "made but not saved" surface with its retry affordance,
the de-duplicating session append itself, and the regression tests for exactly that
boundary. The writers in scope are exactly two: the quick-picture handler behind
`POST /api/preview/generate`, and the video worker's job processor
(`processVideoJob` / `VideoJobHandler` / `VideoJobWorker`, plus the inline processor that
shares the same append port).

**Kept closed.** Billing, credits, payment, provider retry orchestration, the DLQ
reprocessor, the stale-task sweeper, the reconciler, asset retention, the worker
heartbeat, and request idempotency beyond the per-admission key. They stay frozen and
carry zero tests in any gate, per ADR-0002 as amended 2026-07-25. An attachment retry is
explicitly **not** a generation retry: it reuses the same media and the same take
identity, never reruns generation, never changes the job's generation outcome, and never
invokes refund logic.

**The storyboard writer is outside the exception.** The storyboard generate handler's
session write shares the soft-fail shape exactly — same swallowed catch, same absent take
identity in the response — but it sits on top of the frozen storyboard stack
(`StoryboardPreviewService` over `storyboard-frame-planner`, frozen by ADR-0002 as part
of the expert wall). An active-tier route handler over a frozen service is still frozen
work: leave it exactly as it is, note it in the PR rather than fixing it in passing, and
give it this same treatment on the day the storyboard stack thaws.

**Trade-off.** A narrow exception is harder to police than a clean freeze line — the
opened boundary sits in the neighborhood of frozen code, so every PR that touches it must
quote this decision and say which side of the line it stayed on. That is cheaper than
either alternative: thawing the resilience stack wholesale re-opens the generation
economics ADR-0002 deliberately deferred, and leaving the boundary frozen means a clip can
be durable and simultaneously missing from its session after a refresh — which makes the
milestone's "returns after a refresh with everything intact" unachievable by construction.

### 7. A narrow thaw for the illustrative camera preview

The camera-motion picker and its depth-backed illustrative preview, with their tests, are
authorized as **motion authoring for the active loop**. Motion direction is authoring
intelligence — ADR-0002's moat and explicitly part of what stays active — not the
multi-shot consistency play that ADR-0002 froze.

**Surfaces opened.** The picker's reachability from the armed first frame's controls; the
picker itself; the illustrative preview of each camera path, including its no-depth
fallback; the depth estimate that backs the preview; and the tests for all of the above.
The picker is a summoned setting, not a fourth resident of the page —
[ADR-0009](0009-workspace-is-input-first.md) and ADR-0010's anatomy is untouched — and
the chosen path lands in the input as an editable camera span that replaces rather than
accumulates, per ADR-0010's truth contract. Any provider option a camera choice implies
travels by name and is documented; a camera choice never changes generation behavior the
creator cannot see.

**Kept frozen.** Convergence orchestration: the iterative refinement pipeline, its quality
gates, face embedding, and the CLIP gate. The thaw is **not** performed by widening a
convergence flag. The server's umbrella `ENABLE_CONVERGENCE` keeps its description and
its default; the picker stops depending on the client's `CONVERGENCE_UI` gate and gets a
narrower, picker-specific gate or none at all; and the one depth endpoint that backs the
preview becomes reachable without the umbrella — a single route moved out from under a
frozen mount, never a frozen stack switched on. Flipping the umbrella would thaw the
entire stack by accident, which is the exact failure this clause exists to prevent.

**Illustrative in every case.** The preview is labeled illustrative whether the depth
estimate succeeded or fell back, and the label does not vary with confidence. A
successful depth estimate must never read as a guarantee of the generated trajectory —
and a label that appears only on the fallback teaches the creator that its absence is a
promise. When depth is unavailable the picker still offers the choice.

**Trade-off.** An always-on label undersells the depth-backed case, which is genuinely
better than the fallback, and some creators will discount the preview entirely. Accepted:
the cost of over-trust — a creator picks a move because the preview promised it, then
reads the clip as a product failure — is far higher than the cost of under-trust.

### 8. Explicitly unchanged

- **The page's anatomy.** ADR-0009 and ADR-0010 stand: the workspace is exactly
  [the space](../../CONTEXT.md#the-space), [the input](../../CONTEXT.md#the-input), and
  [the next-step button](../../CONTEXT.md#the-next-step-button). Nothing here adds a
  fourth resident — every new affordance is a node action, a next-step-button moment, or
  a summoned setting.
- **Continuity stays frozen.** Decision 7 thaws one illustrative preview, not the
  multi-shot stack. Continuity and convergence orchestration remain dormant under
  ADR-0002, and this ADR is not the revisit that ADR-0002 anticipates.
- **No credits anywhere in the product** (ADR-0010). The sketch relay's bound is a
  server-side, dollar-denominated daily allowance like the studio's cap — never a credit,
  a balance, or a number the creator watches go down.
- **No new operation collection and no shared execution scheduler.** Each take records
  what produced it, on the existing take record. There is no second "operations" entity
  beside takes and words-versions, and no cross-mode job scheduler; the admission
  boundary is a shared contract, not a shared runtime.

**Trade-off.** Keeping provenance on the take record means every mode's writer has to
populate the same fields correctly, with wire validation as the only enforcement; a
single operations collection would centralize that. Rejected anyway: it is the
operations-graph model ADR-0012 already refused on the creator's behalf, and it would be
the product's first entity that exists for the system rather than for the work.

## Considered alternatives

- **Leave the modes separate; the creator re-uploads between them.** The status quo, and
  free. Rejected: it _is_ the lose-your-inputs failure. Screenshot-and-upload also
  destroys provenance and take identity on the way through, so the space can never draw
  the relationship the creator actually performed.
- **Fold the studio and the live editor into the page.** One surface, one record, no
  bridges. Rejected for the third time — ADR-0017 rejected the embed, ADR-0019 rejected
  the fold, and nothing in the audit weakened either reason. Optional bridges get the
  continuity benefit without coupling two unproven product loops to the page's locked
  anatomy.
- **Backfill an invented paired text for admitted takes**, so the **Take** entry could
  stay as written and no new fields would be needed. Rejected: it makes the product state
  a production fact it does not have, and the fabrication is undetectable downstream.
- **Derive the new relationships instead of persisting them** — infer a refine edge from
  timestamps, sibling order, or image similarity. Rejected: ADR-0013 already settled this
  for the same reason, and the last positional guess in the lineage derivation is being
  removed, not extended.
- **One operation collection plus a shared execution scheduler** across page, sketchpad,
  and studio. Rejected in decision 8.
- **Thaw the video-job resilience stack wholesale** to fix attachment properly. Rejected
  in decision 6: it re-opens generation economics, which ADR-0002 deferred on purpose.

## Consequences

- **The take record grows** by four facts: origin, production provenance (nullable, with
  an explicit unknown), source inputs (a list), and display ancestor. These are wire
  contract changes — `shared/` schemas plus the client's persisted-generation
  normalization, validated at the boundary, not TypeScript-only interfaces. Pre-launch
  with zero users, so this is a schema addition with no migration, the same posture
  ADR-0013 took.
- **ADR-0013's rule survives intact and extended**: the edge set stays persisted, layout
  and edge kind stay derived. `refine` is derived from its endpoints like every other
  kind, so the drawn relationship still cannot lie.
- **The space's layout engine takes real work.** The picture column now needs internal
  depth; "three fixed generations" is no longer a sufficient description of the layout,
  only of the columns.
- **One admission boundary is the only way** a take can be created from media the
  session did not generate. A fourth entry point that invents its own path is a bug, not
  a feature.
- **ADR-0019's first-frame-bridge follow-up is discharged.** Its other near-term
  follow-ups — attach-your-own reference image, vectorize-an-existing-image — are
  untouched and still open there.
- **Two quotable ADR-0002 exceptions now exist.** A PR touching either must cite decision
  6 or decision 7 and state which boundary it stayed inside. Everything else in the
  frozen stacks keeps carrying zero tests in any gate.
- **The vocabulary cost is real**: **Take** no longer fits in one sentence, and
  `CONTEXT.md` gains four entries. The alternative was leaving the product's most
  load-bearing noun quietly false.
- **Riskiest assumption, to be watched in dogfooding:** that a creator reads a chain
  inside the picture column as "my picture got refined" rather than as a diagram to
  decode. This is ADR-0012's recorded risk with internal depth added to it. The fallback
  is the same shape as ADR-0012's: collapse a refine chain to its latest picture with a
  count, which loses no persisted structure because the edges are still recorded.
- **Reversing this** means removing four take fields, the `refine` edge kind, and both
  studio bridges — and then re-answering "where did this picture come from" for every
  take already admitted. Which is why it is written down.

## Follow-ups

The decomposition lives in the unification tickets. Each one carries `needs-triage` until
this ADR lands and is re-checked against the accepted decisions before it becomes
`ready-for-agent`.

- **#83** Session attachment — decision 6 (including the storyboard writer's status).
- **#85** Camera motion as visible words — decision 7.
- **#86** Picture admission boundary, upload first — decisions 1, 2, 3.
- **#87** Live editor "Use this" — decision 5, via #86.
- **#88** Refine in the studio, from a session picture — decision 4.
- **#89** "Use this in the session," studio image back to a session — decisions 2, 3, 4.
- **#90** Cross-mode golden path — the deterministic proof of the milestone above.
- **#84** Sketch relay daily allowance — decision 8's no-credits clause.
- **#82** Retire the stale product claims this ADR contradicts in the repo docs.

Open and deliberately **not** decided here: subject motion still has no UI writer and is
left alone; the reword edge between words-versions is still order-derived (an ADR-0013 M4
gap, noted not fixed — subsequently closed by #116, which persists the reword parent); and
a session-launched live editor that returns to its originating session exists only as an
optional destination in the bridge contract, with no surface.
