# The live editor's page is the generation frame — same shape and same size, derived not chosen

**Status:** accepted (2026-07-24) · relates to [ADR-0016](0016-realtime-sketch-frames-flow-browser-to-fal-directly.md), [ADR-0017](0017-live-editor-is-its-own-plane-not-the-space.md), [ADR-0014](0014-the-design-handoff-is-the-authoritative-visual-spec.md)

The sketchpad's bitmap is what the model actually sees. Its size is not a layout
choice: `fal-ai/z-image/turbo/image-to-image` is only fast at 512², and only on
square frames. The page the creator draws on is a separate thing that CSS sizes.
When those two numbers disagree, the browser stretches the bitmap across the page —
silently, because a canvas never reports that it was scaled.

That happened. Making the page drawable edge-to-edge pinned both panels to a
hardcoded `700px` while the bitmap stayed 512², a 1.37× stretch. Nothing in the
payload changed — seed, strength, steps and the model stayed identical, and the
original probe still reproduced its exact render — but the drawing reaching the
model did:

- strokes drew **37% fatter** on screen than their weight in the frame;
- a drawing made at unchanged hand-scale covered **27% less** of the frame;
- the square output panel also dropped the previous 700×860 `object-fit: cover`
  crop, which had been silently zooming every render **~23%**.

Compounded, subjects landed roughly **45% smaller in frame** and came back weak and
washed out. It presented as a model-quality regression and was investigated as one.
Layout stretched the input; nothing about generation had moved.

**The decision.** The page is sized **by** the frame. `LiveEditor` sets
`--le-frame` from `SNAPSHOT_SIZE` and the panels consume it, so the page and the
bitmap are one source of truth and cannot drift apart. At 1:1 a stroke's weight and
position on screen **are** its weight and position in the frame — what the creator
sees is what the model gets. The drawable-edge-to-edge property is preserved: the
panel equals the canvas exactly, with no dead margin where strokes vanish.

**A bigger drawing surface is the plane's zoom, not a bigger page.** Zoom scales
strokes along with the page, so frame-relative composition is preserved at any zoom
level — which is precisely what a fixed larger page destroys.

## Why 512²

Measured 2026-07-24, same sketch and settings, round-trip through `fal.run`:

| Frame | Round-trip |
| ----- | ---------- |
| 512²  | 826 ms     |
| 640²  | 1752 ms    |
| 704²  | 3477 ms    |
| 768²  | 4417 ms    |

Non-square is worse still (512×624 and 576×704 measured 3–6× the square path on
2026-07-09). Raising the frame to win a larger page would cost the realtime feel
the surface exists to deliver.

## Considered options

- **Restore a zoomed output framing** (re-crop the render so subjects fill the panel
  again) — rejected: it treats a mechanical defect as a display preference. It would
  have masked the stretched input while leaving the sketch still misaligned with the
  frame, and it makes the output a lie about what was generated.
- **Raise the frame to match a comfortable page** (704² or 768²) — rejected on the
  measurements above; 4× the latency for a larger canvas is the wrong trade on a
  surface whose whole premise is sub-second feedback.
- **Keep the large page and letterbox the canvas inside it** — rejected: this is the
  original defect, where the dead margin swallowed strokes silently.
- **Auto-fit the sketch** (crop the drawn bounding box to fill the frame before
  sending) — deferred, not rejected. It would make composition independent of how
  large the creator draws, but the crop would shift as strokes are added, so the
  render would jump between frames. Revisit only with a stable framing rule.

## Consequences

- **Never pin the sketch page to a fixed pixel size.** Any change to the drawing
  surface's dimensions must flow from the generation frame constant. A regression
  test asserts the panels resolve to `var(--le-frame)`; it fails on a hardcoded value.
- Changing `SNAPSHOT_SIZE` now resizes the visible page. That is intended — it keeps
  the two honest — but it means a frame change is also a visual change, and the
  latency table above governs whether it is affordable.
- This class of bug is invisible to types, tests, and the console: the app is
  working, the payload is well-formed, and only the composition degrades. Diagnosing
  it requires comparing a live render against an archived one at identical settings.
  Keep known-good probe renders around for exactly this.
- Related, from the same investigation: **error state is not a stat.** ADR-0014 makes
  the handoff authoritative, and the handoff deliberately removed the stats readout
  (rate / round-trip / frames) from this surface. That removal does not extend to
  failures — with the fal balance exhausted, every frame returned 403 while the
  editor kept showing its idle invitation, making a dead relay indistinguishable from
  an untouched sketchpad. The editor now renders the reason frames stopped. Do not
  remove it to comply with a literal reading of the handoff.
