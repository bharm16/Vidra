# Realtime sketch frames flow browser→fal directly, authorized by server-minted scoped tokens

**Status:** accepted (2026-07-09) · scope: the realtime-sketch spike (`/sketch`) only · spec: [2026-07-09-realtime-sketch-spike-design.md](../superpowers/specs/2026-07-09-realtime-sketch-spike-design.md)

Vidra's standing pattern routes every provider call through the Express server — no
browser ever talks to OpenAI, Groq, Replicate, or any provider directly. The realtime
sketch loop strains that norm: it sends ~100KB sketchpad frames at up to ~3/s over a
persistent WebSocket, and fal's documented browser pattern for realtime endpoints is a
`tokenProvider` — the backend mints a short-lived JWT and the browser opens the socket
straight to fal.

**The decision.** The server exposes `POST /api/fal/realtime-token`, which mints a JWT
via fal's token REST API, allowlisted to exactly the one approved model
(`fal-ai/fast-lightning-sdxl`) with a ~120-second expiry. The browser connects
`wss://` directly to fal using that token. `FAL_KEY` never leaves the server.

## Considered options

- **True relay through Express** — preserves the all-traffic-through-server norm and
  adds a server-side measurement point. Rejected: we would own two WebSocket
  lifecycles (client↔server, server↔fal) plus reconnect and backpressure for both —
  roughly 200 LOC of the hardest-to-debug kind, in a spike — and every frame transits
  the wire twice.
- **HTTP per frame via the server** — simplest code. Rejected: ~1s+ cadence cannot
  answer the realtime-feel question the spike exists to ask.
- **`FAL_KEY` in the client** — rejected outright: it would be the first
  browser-exposed provider key in the codebase.

## Consequences

- This is the first and only browser→provider connection in the codebase, bounded to
  `/sketch`. **Promoting the realtime sketch beyond the spike must revisit this ADR** —
  the exception does not silently generalize.
- The model allowlist is enforced cryptographically at the mint: a client-side edit
  cannot widen which models the token can reach.
- There is no server-side observability of frames — no relay point exists to log or
  meter. The client latency HUD is the instrumentation, and spend control is token
  expiry + scope (abandoned in-flight frames still bill per compute-second).
