# Live editor surface — design

**Date:** 2026-07-09 · **Status:** approved pending owner review · **Branch:** `spike/realtime-sketch`
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) — _Live editor_ (new), _realtime sketch_, _sketchpad_, _live output_. **Not** the space; "node editor" stays a forbidden synonym.
**Relations:** realtime-sketch spike spec (same day), ADR-0012 (the space's plane semantics), ADR-0016 (frame relay).

## What this is

The realtime sketch gets its own first-class page — the **Live editor** — reachable from
the rail directly under Library, with the editor pair (sketchpad | live output) sitting
on an **infinite pannable/zoomable plane** exactly like the workspace's viewport. The
floating chrome (icon bar + composer, design_handoff_live_editor) stays fixed to the
screen. The generation loop is untouched.

Note on status: putting the surface in primary nav promotes the spike from
route-you-have-to-know to persistent product surface (ADR-0017 records this and the
own-plane-not-the-space boundary).

## Decisions locked during grilling (2026-07-09)

| #   | Decision      | Choice                                                                                                                                                                                                             |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Plane content | The editor pair as ONE fixed-size object on the plane; chrome screen-fixed. Accumulating-board and multi-pair readings deferred                                                                                    |
| 2   | Camera engine | **Promote** `SpaceViewport` + `spaceCamera` (+ tests) from `features/space/` to `client/src/components/canvas/`; both features consume the shared engine                                                           |
| 3   | Route & rail  | Route renamed `/sketch` → **`/live-editor`**, no alias (pre-launch). Rail item **"Live editor"** directly under Library (lucide `Paintbrush`, 18px/1.8), `RailActive` gains `"live-editor"`                        |
| 4   | Interaction   | Select tool = pan the plane (drags anywhere, including over the sketchpad). Brush/eraser strokes `stopPropagation` — drawing never pans. Wheel/pinch always belongs to the plane. Camera ephemeral; zoom pill kept |

## Architecture

```
LiveEditorPage (/live-editor)
├── NavRail active="live-editor"          (mounted per-page, CanvasWorkspace pattern)
└── stage (le-stage, minus its own scroll)
    ├── CanvasViewport (promoted SpaceViewport)      ← camera: pan/zoom/click-discrimination
    │   └── editor pair — fixed logical size, centered at mount via the
    │       viewport's existing data-live recenter mechanism
    │       ├── sketch panel (#e9e9e6, radius 16) → Sketchpad (stopPropagation while drawing)
    │       └── output panel (#0f1013, radius 16) → live output img
    └── floating stack (screen-fixed, NOT inside the camera transform)
        ├── ToolBar (select/brush/eraser/undo/clear + brush popover)
        └── Composer (prompt + mode/strength/steps/seed chips)
```

- **Panel geometry:** each panel gets a fixed logical size on the plane (≈700×860, 12px
  gap — the handoff's proportions at 1440×900); the pair is one flex row marked
  `data-live` so the camera centers it once on mount at scale 1.
- **Pointer contract:** `Sketchpad` keeps its tool-gating; when the active tool draws,
  its pointer handlers call `stopPropagation()` so `CanvasViewport` never pans. With
  select active the sketchpad ignores the pointer entirely and the plane pans — the
  handoff's "Select/pan" made literal.
- **Coordinate safety:** `toCanvasPoint` already maps through `getBoundingClientRect`, so
  drawing stays accurate at any zoom.
- **Camera engine promotion:** mechanical move of `SpaceViewport.tsx` + `spaceCamera.ts`
  (+ their test files) to `client/src/components/canvas/`, renamed at the new home to
  `CanvasViewport` / `canvasCamera` (a shared component must not say "Space"); the
  space's imports and the moved tests update; no behavior change, no re-exports.
- **The workspace is untouched** beyond import paths.

## Rail & route

- `NavRail`: one `RailItem` after Library — `to="/live-editor" label="Live editor"`,
  `Paintbrush` icon at the rail's standard sizing; `RailActive` union gains
  `"live-editor"`.
- `App.tsx`: `/sketch` route replaced by `/live-editor` (same lazy import,
  `FeatureErrorBoundary` kept). No redirect.
- Auth posture unchanged (no route gate, same as siblings; relay 401s surface through
  the loop's error path).

## Tests (spike-grade)

1. **Promotion is behavior-preserving** — the moved SpaceViewport suite passes unchanged
   from its new home (import-path updates only).
2. **Drawing never pans** — with brush active, a drag on the sketchpad emits snapshots
   and the viewport transform stays put; with select active, the same drag pans and no
   snapshot fires.
3. **Rail** — "Live editor" renders directly under Library, navigates to
   `/live-editor`, active state highlights.
4. **Page smoke** — /live-editor renders rail + plane + editor pair + floating chrome.

## Out of scope

Accumulating board (renders dropping onto the plane), multiple editor pairs, camera
persistence, any space/lineage integration, mobile.

## Shipped (2026-07-09)

`95c4554a` (promotion, 232 tests green from the new home) + `fe401ec6` (page, rail,
route, pointer contract — 92 tests) + `8d23bbc8` (floating chrome pointer-events fix,
found live: the stack's empty flex box ate strokes). Chrome-verified end to end:
rail navigation, select-pan over the sketchpad, zoom to 70%, brush strokes that draw
without panning, and a tracked render on the plane.
