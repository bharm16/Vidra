---
tags: [vault, architecture]
---

# The Adoption Problem

Vidra does not have a depth problem. It has an adoption problem.

The deep modules are built, and most are built well. What recurs — found in cluster after cluster during the 2026-08-09 audit — is a correct module whose docblock declares the consolidation complete while adoption stopped partway. Most defects live in the gap between _the deep module exists_ and _everything goes through it_.

## The signature

| Module                             | Its own claim                                     | Actual adoption                                                      |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `server/src/middleware/respond.ts` | "the one place an HTTP response body is built"    | 2 route files import it; 24 hand-build `success: false`              |
| `client/src/services/ApiClient.ts` | 401→sign-in "ONLY place"; retry; telemetry header | 14 modules use it; 9 `api/` modules bare-`fetch` around it           |
| `AIExecutionPort.execute`          | failover, circuit breaker, telemetry              | `.stream`, the path the product actually uses, had none of the three |
| `CANVAS_FIRST_LAYOUT`              | `migrationFlag: true`, default `true`             | the flag-off branch still owns 55 of 76 props                        |

## Why it stays invisible

The stalled half is almost always **type-correct**. Hand-built envelopes carry `satisfies ApiResponse<T>`; flag defaults are `as const`. So `tsc` reports nothing, and the invariant rots precisely where the compiler cannot see it. See [[The Verification Oracle]] for the general form of this blind spot.

That is also why the docblock is untrustworthy evidence here: it describes the intended end state, and it was accurate when written.

## What follows from it

**Finishing a migration beats designing a new interface.** The correct interface usually already exists, is already tested, and has adopters to copy. Reaching for a redesign when the real problem is adoption adds a third thing for callers to choose between.

**Count adopters before believing a claim.** `grep -c` on the module's importers against the count of hand-rolled equivalents is a two-minute check that decides whether a consolidation is real.

**Prefer a gate to a docblock.** Where a consolidation matters, something has to enforce it — a branded type the compiler can refuse, or an `arch:check` fence. A comment saying "the one place" is not a mechanism. Note that a fence can be wrong too, and silently: see [[The Verification Oracle]].

## Related

- [[audits/2026-08-09-deep-module-audit|The 2026-08-09 deep-module audit]] — the enumerated findings, tiered, with the full inventory
- [[The Verification Oracle]] — why `tsc` green does not mean the contract holds
- [[graph/services/aiService|aiService]] — the routing layer whose `stream` half carried the gap
