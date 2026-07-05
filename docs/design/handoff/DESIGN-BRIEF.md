# Vidra workspace — design brief

Self-contained: no codebase or conversation access needed. `tokens.css` (the production
token file) ships alongside as a starting vocabulary.

## The product

Vidra turns a non-expert's thin sentence ("a lighthouse keeper at dusk") into a finished
video clip. The creator types a few words; Vidra **writes the full shot description for
them, visibly**; a picture is made automatically; they approve it; motion is added; they
keep the clip. The creator doesn't know prompt-writing, camera vocabulary, or model
names — the product authors _for_ them. The signature moment of the whole product is
watching your thin sentence become a real shot description. Design it like the identity
it is.

## Fixed truths (product decisions, not aesthetics — challenge by flagging, not drawing)

1. **One text surface.** The creator's sentence and the description it becomes live in
   the same, single text box. Never two.
2. **The result has one home.** Waiting state, picture, then video appear in one place —
   and that place doesn't exist before the first submission. No empty player.
3. **One advancing action at a time.** Whatever else is on screen, there is always one
   obvious next step: submit → approve/retry → add motion → keep.
4. **What you see is what runs.** The visible text is exactly what the models receive.
   Corollary: the description contains motion phrases that the _picture_ is made without —
   the interface should make that legible somehow (how is yours to design).
5. **Highlighted phrases are the depth layer.** Phrases in the description are clickable
   and offer alternatives — this is the product's differentiator and must be discoverable
   and reachable at every moment after writing begins, including during waits.
6. **Failures never punish.** Every failure keeps the work, names a retry, and never
   shows a charge, a dead end, or blame. Nothing is ever billed per-use; the only offer
   in the product is a subscription at the moment of keeping a clip.
7. **No credits, prices, model names, or configuration as furniture.** Settings exist
   (aspect ratio, clip length) but are summoned, not resident. The model is chosen for
   the user.
8. **Color carries meaning.** Chrome stays neutral; color in the workspace means span
   category (the nine category hues are in the palette below). This is a standing
   product decision (span meaning must never compete with brand color) — everything
   else about mood, depth, and surface treatment is open.

## The workflow — moments, each with a job

Design every moment, including the unhappy ones. The copy shown is candidate raw
material — improve it freely; keep the meaning.

| Moment                             | The job of the screen                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty**                          | A stranger or returning creator types a few words and submits. Zero learning curve; the page must not feel broken or bare. Starter examples help the blank-page problem. Works identically logged out.                                                                          |
| **Sign-in at submit** (logged-out) | Identity happens exactly once, at the moment of intent. Their typed words must visibly survive; after auth the work continues without re-doing anything.                                                                                                                        |
| **Writing**                        | The sentence grows into the full description before their eyes. They should feel authorship transferring to them (their original words remain reachable).                                                                                                                       |
| **Making the picture**             | Starts by itself. The wait is an invitation: the description is ready to read, phrases are ready to explore. Waiting should feel like refinement time, not a spinner.                                                                                                           |
| **The picture**                    | The one approval gate. Judge the picture against the words; re-roll it (same words), change the words (which makes the picture stale — show that), or move forward. Prior attempts shouldn't vanish.                                                                            |
| **Making it move / the clip**      | Motion applied to the approved picture; the clip plays where the picture stood. Free results are watermarked drafts; keeping is where the subscription offer lives. Prior takes (each permanently paired with the words that made it) are browsable; restoring one is explicit. |
| **Kept**                           | The finish: saved to their library, downloadable, shareable, and a clean start for the next clip.                                                                                                                                                                               |
| **Limits**                         | A generous daily free cap can be hit. Work is never lost; the moment is honest and calm.                                                                                                                                                                                        |
| **Failures**                       | Writing, picture, motion, or render can each fail. Keep the work, name the retry, reassure about cost.                                                                                                                                                                          |

## Palette anchor

Span-category hues (the one place color means something):

| Category    | Hex     | Category  | Hex     | Category | Hex     |
| ----------- | ------- | --------- | ------- | -------- | ------- |
| shot        | #3b82f6 | camera    | #0ea5e9 | lighting | #06b6d4 |
| subject     | #f59e0b | action    | #f97316 | style    | #ec4899 |
| environment | #6b8a6b | technical | #8b8baa | audio    | #a78bfa |

`tokens.css` is the current system (dark, dense, Geist/Plus Jakarta Sans). Start there;
if the design wants to evolve the tokens, propose the evolution explicitly rather than
silently diverging.

## Open canvas — genuinely yours

Layout and composition. Hierarchy between the text and the result. How the writing
moment is staged and how streaming feels. What waiting looks like. How phrase
exploration presents (popover, tray, inline — anything that honors truth #5). How prior
takes are browsed. How the mismatch between edited words and an older picture is shown.
The personality of the empty page. Type scale, spacing, surfaces, motion design,
viewport behavior from laptop to ultrawide. Where the library and account live in the
chrome. Every label and line of copy.

## Deliverable

Explore first — key moments as full-page designs at whatever fidelity moves fastest,
then the full set of moments once a direction lands. HTML using the tokens is ideal
(it becomes the coded prototype directly) but images are fine for exploration. Flag any
place a design wants to bend a fixed truth, with one line on why — a flagged challenge
is welcome; a silent one isn't.
