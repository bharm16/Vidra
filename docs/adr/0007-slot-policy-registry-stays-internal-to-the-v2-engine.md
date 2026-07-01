# The SlotPolicyRegistry stays internal to the Enhancement V2 engine, not injected

**Status:** accepted (2026-07-01)

`EnhancementV2Engine` constructs its own `SlotPolicyRegistry` from a
`policyVersion` string (`server/src/services/enhancement/v2/EnhancementV2Engine.ts`,
constructor). At a glance this reads as a **hidden dependency** — callers pass a
version string but behaviour is determined by whatever the internally-built
registry resolves — and an architecture review will recur to the suggestion:
_"inject a `policies: Map<string, SlotPolicy>` plus a `fallbackPolicy` at the DI
seam so tests can substitute individual policies and unknown categories have a
declared error mode."_ We considered that injection and are **keeping the
registry internal**.

The premise of the suggestion is weaker than it looks:

- **The registry is a static pure table, not a collaborator.**
  `SlotPolicyRegistry` (`v2/SlotPolicyRegistry.ts`) is a deterministic lookup
  over the compile-time `SLOT_POLICIES` array plus a custom-request policy. It
  performs no I/O, holds no mutable state, and resolves in three steps (exact →
  parent category → fallback). It is closer to a configuration constant than to
  a dependency worth a seam.
- **The "missing fallback" claim is wrong.** `resolve()` already returns an
  explicit, documented `fallbackPolicy` for `null`, unknown, and unparseable
  category ids. Unknown categories are a handled input, not an undeclared error
  mode.
- **The deletion test fails.** Injecting the map does not delete complexity; it
  relocates the version→policies assembly into a DI config file, adds a new
  contract (`Map` shape + fallback parameter) to every construction site, and
  leaves the engine no simpler. One adapter would sit behind the new seam —
  a hypothetical seam.
- **Policy evolution is eval-driven, not test-driven.** Suggestion-quality
  changes on this surface are validated against measured baselines (see the
  Optimize/Enhancement eval work), not by unit-swapping a single policy.
  Tests that need a specific policy's behaviour can already select it via its
  category id through the public `execute()` interface.

## What would reopen this

- A second policy source (e.g. per-user or remotely-configured policies) —
  two real adapters would justify the seam.
- Policies gaining I/O (fetched, cached, or A/B-assigned at runtime).
- A concrete test that cannot be written through `execute()` + category-id
  selection.
