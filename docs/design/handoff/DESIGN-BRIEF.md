# Vidra workspace — design brief for Claude Design

This brief is self-contained: everything needed to design the workspace's states without
access to the codebase or prior conversations. Ship alongside `tokens.css` (the real,
production token file — the only styling vocabulary allowed).

## The product, in three sentences

Vidra turns a non-expert's thin sentence ("a lighthouse keeper at dusk") into a finished
video clip. The creator types a few words; Vidra **writes the full shot description for
them, visibly, in the same text box**; a picture is made automatically; they approve it
with one button; motion is added; they keep the clip. The creator is someone who does NOT
know prompt-writing, camera vocabulary, or model names — the product's entire bet is that
the app authors _for_ them.

## The page contract (non-negotiable)

The workspace has **exactly three residents** plus a quiet top bar:

1. **The input** — ONE text box, always. The typed one-liner becomes the full description
   in place. There is never a second text surface anywhere.
2. **The player** — one rectangle where results appear: waiting state → picture → video,
   same spot. It does NOT exist before the first submission (no empty player, ever).
3. **The next-step button** — only the action that advances the work right now.

Top bar: wordmark › session title (left) · Library link + account avatar (right).
No side rails, no panels, no settings strip, no model picker, no credits anywhere.
Settings (aspect + duration only) live behind one small summon (⚙) as a popover.

**The honesty rule that shapes the visuals:** the text the creator sees is the only thing
that runs. Motion-bearing phrases in the description render **dimmed** with a small note
("Not in the picture — this drives the video") because the picture is made without them —
the dimming is a visible receipt, not decoration.

## Design language (binding)

- Dark, monochrome chrome. **No brand accent color.** Color always means span category,
  never brand (see palette below). Use `tokens.css` variables exclusively — fonts
  (Geist body, Plus Jakarta Sans display), the dense type scale (11/13/14/16), spacing,
  radii, surfaces, hairline borders.
- Span highlights are the ONE place color appears, on phrases inside the input:

| Category    | Hex     | Category  | Hex     | Category | Hex     |
| ----------- | ------- | --------- | ------- | -------- | ------- |
| shot        | #3b82f6 | camera    | #0ea5e9 | lighting | #06b6d4 |
| subject     | #f59e0b | action    | #f97316 | style    | #ec4899 |
| environment | #6b8a6b | technical | #8b8baa | audio    | #a78bfa |

Highlights render the hex at 15% opacity background, 35% border.

- Buttons: one primary treatment (light-on-dark solid), one quiet secondary. Failure
  copy is inline text near the input — no red alert boxes, no toasts for loop failures.
- Feel references (market, not to copy): Runway's density, Sora's calm, but Vidra's
  identity is the _visible writing_ — the moment text streams into the box is the
  signature moment of the product. Design it like it matters.

## The states to design (all of them — this is the deliverable)

Each state defines the three residents. Copy below is final-candidate — keep it verbatim
unless you flag a better line.

| #   | State                            | Player                                                      | Input                                                                                                                                                                   | Button(s)                                                                                                                                             |
| --- | -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **S0 Empty**                     | absent                                                      | placeholder "Describe your shot in a few words" + 4 fill-only chips (A product hero shot / A character in a scene / An abstract loop / B-roll establishing) + ⚙ summon | **Go** (disabled until text)                                                                                                                          |
| 2   | S0 + settings                    | absent                                                      | as above                                                                                                                                                                | popover: Aspect 16:9 ▾ · Length 8s ▾ · nudge: "Set aspect before your first picture — changing it later remakes it."                                  |
| 3   | S0 + auth dialog (logged-out Go) | —                                                           | their sentence visible, dimmed behind dialog                                                                                                                            | dialog: "See it made" / "Sign in and we'll pick up right where you left off." / Continue with Google / email+password / "New here? Create an account" |
| 4   | **S1 Writing**                   | mounts with quiet shimmer                                   | one-liner streams into full description; a small "Your words · <original>" restore chip appears above                                                                   | **Writing…** (disabled)                                                                                                                               |
| 5   | S1 failed                        | unmounts                                                    | one-liner restored untouched; inline: "Couldn't write that — Go again?"                                                                                                 | **Go**                                                                                                                                                |
| 6   | **S2 Painting**                  | "Making your picture…" working state                        | full description, editable; span highlights LIVE and clickable during the wait; motion phrases dimmed + receipt note                                                    | **Writing…** → clears                                                                                                                                 |
| 7   | S2 + phrase clicked              | working state                                               | suggestion popover under the clicked phrase: 3 alternatives + "Your own words work too — just type."                                                                    | —                                                                                                                                                     |
| 8   | S2 failed                        | unmounts                                                    | description intact; inline: "The picture didn't come out — Try again. You weren't charged."                                                                             | **Try again**                                                                                                                                         |
| 9   | **S3 Picture (the gate)**        | the still                                                   | description, phrases live; camera phrases offer named moves as alternatives                                                                                             | **Make it move** (primary) · Try again (quiet)                                                                                                        |
| 10  | S3 + takes strip                 | the still                                                   | as above; thin strip of prior takes under the player (appears from first re-roll)                                                                                       | as above                                                                                                                                              |
| 11  | S3, text edited                  | the still (from the older words)                            | edited description                                                                                                                                                      | **Remake picture** (primary) · Make it move (quiet)                                                                                                   |
| 12  | **S4 Moving**                    | the approved still under a progress veil: "Making it move…" | editable                                                                                                                                                                | **Moving…** (disabled)                                                                                                                                |
| 13  | S4 failed                        | veil clears, still stays                                    | inline: "The motion didn't take — Make it move again. You weren't charged."                                                                                             | **Make it move**                                                                                                                                      |
| 14  | **S5 Clip**                      | the clip, autoplay/loop/muted; takes strip beneath          | description                                                                                                                                                             | **Keep in HD, no watermark — $10/mo** (free user) / **Keep** (subscriber) · Try again (quiet)                                                         |
| 15  | S5, browsing a take              | older take plays, read-only                                 | that take's paired words, read-only                                                                                                                                     | **Use this take** · Back                                                                                                                              |
| 16  | **S6 Kept**                      | the kept clip                                               | description, quieted, still editable                                                                                                                                    | **Download** · Share (quiet) · New clip (quiet)                                                                                                       |
| 17  | Soft cap                         | current work stays                                          | inline: "You've hit today's free limit — back tomorrow, or subscribe for more."                                                                                         | **Subscribe** · Try again (disabled)                                                                                                                  |

## Viewports

Design 1280×800 (laptop) as primary; show S0, S3, and S5 additionally at ~1512 and
ultrawide (~2000): the player caps around 1200px and centers; the page is only as large
as its content — never a floating element in a void.

## Motion notes (annotate, don't animate)

Three transitions carry the product's feel — annotate intended behavior on the mockups:
(1) S0→S1: the one-liner grows into the description in place, streaming; the player
fades in above. (2) S2→S3: the picture lands inside the existing rectangle — no layout
shift. (3) S4→S5: the clip replaces the still in place and autoplays.

## Hard no's

No second text box. No empty player before the first Go. No model names/pickers. No
credits, prices (except the Keep button copy), or dot meters. No side panels or rails.
No red error banners or toasts for loop failures. No new resident elements — if a design
wants a fourth resident, flag it as a question instead of drawing it.

## Deliverable format

HTML preferred (one file per state, using `tokens.css` variables/classes) — these become
the coded prototype directly. Images acceptable for exploration rounds. Flag every place
you deviate from the copy or the contract, with one line of reasoning.

## Provisional defaults awaiting owner sign-off (design them as stated, flagged)

(A) takes strip appears from the first re-roll (S3+), (B) dirty text demotes—not
hides—"Make it move", (C) Share exists at S6 only, (D) the description stays present and
quiet in S6.
