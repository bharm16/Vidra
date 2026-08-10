---
tags: [vault, testing, gates]
---

# The Verification Oracle

`npm run verify` is the commit gate — five checks, in order, each catching a class the others cannot:

| Gate             | Catches what nothing else does                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`   | type-level contracts, and **erased modifiers** — `private` vanishes at runtime, so this is the only gate that sees an access change |
| `eslint --quiet` | lint-level defects                                                                                                                  |
| `arch:check`     | import cycles and cross-layer imports — `tsc` accepts a type-only cycle                                                             |
| `test:unit`      | behaviour                                                                                                                           |
| `test:replay`    | the authoring loop end to end, offline, against recorded fixtures                                                                   |

The replay suite is the real merge gate: if it is red, the product is broken regardless of how green the unit suite is. See [[architecture/replay-mode|replay mode]].

`arch:check` is in the list because two type-only import cycles reached `main` on 2026-08-08 with every other gate green.

## What the oracle cannot see

**1. A gate that is itself wrong.** Two shipped in this state and both reported success:

- the ToolSidebar fence grepped one alias spelling while `@components/*` and `@/components/*` both resolve to the same directory — green on a live production violation;
- `check-regression-test-quality.sh` matched its worktree exclusion as an unanchored substring, so run from inside a worktree it scanned **zero files** and exited 0.

A gate's own verdict can never be the assertion in its test. Re-derive the violation set independently, and give the test a derivation guard so it cannot pass vacuously.

**2. Anything the compiler is satisfied by.** Hand-rolled equivalents of a consolidated module type-check perfectly — the whole mechanism behind [[The Adoption Problem]].

**3. Live providers and network.** Every gate is offline by design, which is what makes them fast and deterministic. Local green says nothing about credentials, quotas, or CI configuration.

**4. Test-suite load flakiness.** Failures in `test:unit` are frequently load roulette: the failing set changes between runs and each file passes in isolation. Re-run the file alone before believing it.

## CI is a separate oracle

Verified 2026-08-10. Seven workflows fire on a push to `main`; five are green and two fail on **every** push from missing secrets — `Deploy Application` (~16s, no AWS credentials; it targets ECS infrastructure this project does not use) and `Performance Testing` (~2m18s, `ALLOWED_ORIGINS`/`FRONTEND_URL` unset).

Both have a constant duration signature. Before blaming a commit, check whether the previous runs failed at the same duration.

## Related

- [[The Adoption Problem]] — the class of defect gate 1 is structurally blind to
- [[architecture/replay-mode|replay mode]] — how the offline golden path works
- [[Frozen Stacks]] — frozen domains run zero tests in any gate, by policy
