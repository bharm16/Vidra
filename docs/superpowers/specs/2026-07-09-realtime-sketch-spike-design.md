# Realtime sketch spike — design

**Date:** 2026-07-09 · **Status:** approved pending owner review · **Branch:** `spike/realtime-sketch` (off `rebuild/atmosphere-anchor`)
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) — _realtime sketch_, _sketchpad_, _live output_. **Transport decision:** [ADR-0016](../adr/0016-realtime-sketch-frames-flow-browser-to-fal-directly.md).

## The question this spike answers

Does Krea-style realtime sketching — the creator draws on the sketchpad and the live output tracks the strokes at sub-second cadence — feel strong enough in Vidra's context to earn a place as an expansion input for first frames (ADR-0002)? The spike measures feel with instrumentation, on a dedicated `/sketch` route, touching nothing in the workspace.

**Exit:** a drawing session by the owner plus the HUD numbers, recorded as a verdict addendum at the bottom of this file. Promotion (into the expansion flow / the space) is a separate future design; shelving deletes the route.

## Decisions locked during grilling (2026-07-09)

| #   | Decision            | Choice                                                                                            |
| --- | ------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Model               | `fal-ai/fast-lightning-sdxl/image-to-image` — the only approved model; the id is a code constant  |
| 2   | Transport           | Server mints a scoped short-lived JWT; browser opens the WebSocket directly to fal (ADR-0016)     |
| 3   | Vocabulary          | sketchpad / live output / realtime sketch (CONTEXT.md)                                            |
| 4   | Staleness           | 1 in-flight + newest-pending overwrite; no true cancel exists; abandoned in-flight frames bill    |
| 5   | Generation defaults | 4 steps (8 toggle), strength 0.75 snapped to the step grid, 768², pinned seed + reroll, sync_mode |
| 6   | HUD                 | encode / round-trip / model / transport (derived) / rate + skipped / sticky last error            |

## Architecture

```
Browser                                      Express (3001)                     fal
┌──────────────────────────────┐
│ /sketch (RealtimeSketch)     │  POST /api/fal/proxy (mint)    ┌─────────────┐
│  Sketchpad ──snapshot──┐     │ ──────────────────────────────▶│ mint JWT     │──▶ rest.alpha.fal.ai/tokens
│                        ▼     │ ◀───────── JWT (text) ──────── │ (FAL_KEY)    │    {allowed_apps:[MODEL], expiry}
│  useRealtimeSketch ─ send ───┼───────────── wss:// ────────────────────────────▶ fast-lightning-sdxl/image-to-image
│                        ▲     │ ◀──────── result {images, timings, seed} ──────── (realtime runner)
│  LiveOutput + HUD ─────┘     │
└──────────────────────────────┘
```

Frames never transit our server; `FAL_KEY` never leaves it. The token allowlists exactly the approved model and expires in seconds — the "only approved model" rule is enforced cryptographically at the mint, not by a client constant.

## Client — `client/src/features/realtime-sketch/`

Feature shape per `client/CLAUDE.md` (preview pattern): orchestrator + hooks + api + components + config.

```
realtime-sketch/
├── RealtimeSketch.tsx        # orchestrator: two panes + controls; lazy route target
├── components/
│   ├── Sketchpad.tsx         # pointer drawing; owns stroke state
│   ├── LiveOutput.tsx        # last good image + connection status pill
│   ├── LatencyHud.tsx        # renders HudStats
│   └── SketchControls.tsx    # prompt, strength (snapped), steps toggle, seed reroll, clear/undo
├── hooks/
│   └── useRealtimeSketch.ts  # generation reducer + connection + send discipline
├── api/
│   └── falRealtime.ts        # @fal-ai/client config (proxyUrl + X-API-Key middleware), connect wrapper, Zod schemas
└── config/
    └── constants.ts          # MODEL_ID, defaults, MAX_IN_FLIGHT = 1, SNAPSHOT_INTERVAL_MS = 150, PINNED_SEED
```

Route: lazy top-level `/sketch` in `App.tsx`, outside `MarketingShell`, wrapped in `FeatureErrorBoundary` (precedent: `SharedClip`). New client dependency: `@fal-ai/client`.

### State separation (required by the brief)

| State             | Owner                        | Contents                                                                       | Never contains            |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| Sketchpad state   | `Sketchpad` (internal)       | stroke list, tool, color, size; exposes `onSnapshot(dataUri, encodeMs)` upward | anything about generation |
| Generation state  | `useRealtimeSketch` reducer  | connection status + epoch, in-flight?, pending?, settings, HudStats, lastError | stroke data, DOM          |
| Live output state | same reducer, separate slice | last **successful** image (data URI) + the settings/seed that produced it      | in-flight/pending frames  |

The displayed live output changes only on a successful result — errors and reconnects never blank it.

### Send discipline (the loop's core)

States: `idle` →(snapshot)→ `inFlight` →(snapshot while busy)→ `inFlight+pending` →(result)→ sends pending or returns to `idle`.

Invariants:

1. Never more than 1 request outstanding (`MAX_IN_FLIGHT = 1`, a tunable constant — a depth-2 experiment later is a one-line change with the FIFO assumption documented).
2. A new snapshot while busy **overwrites** the single pending slot (`skipped++`). Older unsent snapshots are never sent — that is the whole of "ignore stale."
3. Stroke-end always captures (trailing edge), so the final drawing state always renders.
4. The snapshot timer (150ms) only bounds encode work; **send rate is completion-gated** — the queue is the throttle.
5. Reconnect bumps a connection epoch; anything arriving from a previous epoch is dropped and in-flight state resets.

### Generation payload (per frame)

```ts
{
  prompt,                       // SketchControls
  image_url: dataUri,           // 768×768 JPEG q0.85 sketchpad snapshot
  strength,                     // default 0.75; UI snapped to the 1/steps grid, labeled "→ N/steps"
  num_inference_steps,          // 4 | 8 toggle, default 4
  image_size: { width: 768, height: 768 },
  seed: pinnedSeed,             // constant until reroll — the anti-flicker lever
  sync_mode: true,              // image returns inside the WS message; no CDN round-trip
  enable_safety_checker: true,  // provider default; constant exposed in config
}
```

Result schema (Zod, anti-corruption boundary in `api/falRealtime.ts`): `{ images: [{ url, width, height }], timings?: { inference?: number }, seed?: number }` — unknown fields ignored; malformed results set `lastError` and leave the live output unchanged.

Why strength snaps: image-to-image denoises only the tail of the step schedule — effective steps ≈ `round(steps × strength)`. At 4 steps the slider truly has four positions; a fake-continuous slider would misreport what the model does.

## Server — token mint route (fal proxy dialect)

`server/src/routes/fal-token.routes.ts`, mounted at `/api/fal` behind `apiAuthMiddleware`; stateless — no DI service, nothing in `services.config.ts`.

**Why the shape changed at implementation:** the installed `@fal-ai/client@1.8.4` has no `tokenProvider` option (that's newer-client docs). In 1.8.4 the browser client is configured with `proxyUrl` and **auto-mints its own realtime token through that proxy** (refreshing at 0.9× expiry). So the route speaks fal's proxy dialect — raw body passthrough, not the house `{success,data}` envelope — because fal's own client is the consumer.

| Aspect            | Contract                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint          | `POST /api/fal/proxy` — accepts only requests whose `x-fal-target-url` header is exactly `https://rest.alpha.fal.ai/tokens/`; anything else → `403`                                 |
| Allowlist         | The client-supplied body is **discarded**; the server always sends `{ allowed_apps: ["fal-ai/fast-lightning-sdxl"], token_expiration: 120 }` with `Authorization: Key ${FAL_KEY}`   |
| Success / failure | fal's status and body are mirrored verbatim (the fal client machine handles them, including its `{detail}` unwrap)                                                                  |
| `FAL_KEY` unset   | `503` `{ detail: "FAL_KEY not configured" }` — nothing else breaks                                                                                                                  |
| Env               | Already declared: `FAL_KEY` / `FAL_API_KEY` in `env.ts`; resolved via the existing `@utils/falApiKey` helper, which survives the un-expanded `${FAL_API_KEY}` placeholder in `.env` |

This is deliberately NOT a general fal proxy: one target URL, one forced body — the client-side request is only a trigger. Widening the allowlist is an ADR-0016 revisit. The client attaches `X-API-Key` via the fal client's `requestMiddleware`, so the route stays behind standard API auth. Bonus discovery pinned here: 1.8.4's realtime protocol threads a `request_id` through `send()`/`onResult` — the reducer uses it as a defensive second guard alongside the connection epoch.

## HUD metric definitions

| Stat           | Definition                                             | Display           |
| -------------- | ------------------------------------------------------ | ----------------- |
| encode         | canvas → JPEG → base64 duration, client-measured       | last ms           |
| round-trip     | `t(result arrived) − t(frame sent)`                    | last / median(20) |
| model          | `timings.inference` from the result ("—" if absent)    | last / median(20) |
| transport      | round-trip − model (network + queue + decode), derived | last              |
| rate           | inverse EMA of the last 10 inter-result gaps           | `X.X/s`           |
| sent / skipped | frames sent; pendings overwritten before sending       | counters          |
| last error     | sticky until the next successful frame                 | message + age     |

## Error states

| Failure                      | Surface                                                       | Live output |
| ---------------------------- | ------------------------------------------------------------- | ----------- |
| Token mint 5xx               | pill "server can't reach fal" + lastError                     | unchanged   |
| WS error/close               | pill "reconnecting" (1 auto-retry) → error + manual reconnect | unchanged   |
| Malformed result             | lastError "unexpected result shape"                           | unchanged   |
| Missing/safety-checked image | lastError; frame skipped                                      | unchanged   |

## Tests (spike-grade, unit config)

Brief bucket → concrete test:

1. **Route behavior + proxy request shape** — token route via the loopback supertest helper (macOS port-shadowing gotcha): `200` text token; `503` when `FAL_KEY` unset; mint request body asserts the allowlist equals exactly the approved model (mocked fetch).
2. **Stale response handling** — reducer tests: 1-in-flight invariant, newest-pending overwrite + `skipped++`, trailing-edge send, epoch drop on reconnect.
3. **Latency HUD values** — pure functions: median, EMA rate, transport derivation including missing `timings`, sticky-error semantics.
4. **Error states** — reducer transitions for each row of the error table.
5. **Client route** — `/sketch` renders the feature (router smoke).

Run with `npx vitest run <paths> --config config/test/vitest.unit.config.js` (bare vitest globs foreign worktree copies).

## Smoke gate (before any UI work)

`scripts/spikes/fal-lightning-realtime-smoke.ts` — Node script, `FAL_KEY` from env: (a) mints a scoped token via the REST endpoint, (b) opens the realtime WS to the approved model, (c) sends one 768² gray-with-blob JPEG frame + prompt, (d) asserts an image result and prints `timings` keys and round-trip. **UI work starts only after this passes** — it pins every field name this spec assumes and settles whether the realtime i2i endpoint honors the documented schema.

## Cost & limits

Lightning bills per compute-second and there is no cancel — every sent frame bills. At the expected ~2–3 updates/s a real drawing session spends actual dollars; the HUD `sent` counter is the spend proxy. Check the fal dashboard after the smoke gate and record $/100 frames in the verdict addendum.

## Out of scope (this version)

Flux/Kontext models, upscale/refine pass, a model picker UI, any workspace/space/composer integration, persistence of live outputs (ephemeral by glossary definition), touch/mobile beyond basic pointer events, server-side frame telemetry (an ADR-0016 consequence), auth changes.

## Verdict addendum

_Appended after the owner's drawing session: HUD medians, $/100 frames, feel verdict, promote/shelve decision._
