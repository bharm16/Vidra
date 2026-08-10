---
tags: [vault, architecture, adr-0002]
---

# Frozen Stacks

[[adr/0002-vidra-is-an-authoring-tool-for-non-experts|ADR-0002]] froze two stacks as dormant: **generation economics** (credits, payment, video-job resilience) and the **multi-shot / consistency** stack ([[graph/domains/continuity|continuity]], convergence). The active product is the authoring loop.

Frozen is not deleted. It is _not load-bearing when planning work_ — and per the test policy, frozen domains carry no tests in any gate; their suites were removed 2026-07-25 and git history is the archive.

## The freeze holds on the import graph

Frozen → active imports: **0**. Verified across every layering fence. The direction that would be fatal is clean.

## It leaks in the other direction

The interesting failures are all **active code depending on frozen code**, which no import-direction check catches.

**1. Credits gates an active path.** `preview/handlers/imageGenerate.ts` returns 503 when `userCreditService` is absent — a fail-closed gate on first-frame generation, the product's core action. That `fal-i2i.routes.ts` and all of `studio/` are credit-free proves it is chronology, not architecture: Studio built its own spend ledger rather than use this one.

**2. Frozen warmup spent real money.** `falWarmupEnabled` defaulted on whenever `NODE_ENV !== "production"`, arming a 120-second `fal.subscribe` interval for the life of every dev and test boot — on the same `FAL_KEY` the live editor spends. Production was the one environment that did not pay for it. Fixed in `abf96391`; the general lesson is that a frozen stack with a timer is not dormant.

**3. The frozen model _is_ the active model.** `WorkspaceSessionContext` wraps every workspace route and makes 9 ungated `continuityApi` calls; the single-shot path fabricates a `ContinuityShot`. 29 active→frozen import sites, with frozen constants baked into a localStorage schema. This one cannot be closed by flag-gating, because the active tier has no session vocabulary of its own.

## How to contain rather than delete

A frozen dependency on an active path wants a **port with two adapters** — an unmetered default for the pre-launch reality and the frozen implementation behind its flag. Two adapters make it a real seam; one would be indirection.

Watch for these three shapes when auditing:

- a **flag that gates registration but not mounting** — the service resolves to `null` while its routes still answer
- a **timer or warmup** armed at boot, which no request-path audit will find
- a **shared credential** between a frozen stack and an active one, which turns dormancy into spend

## Related

- [[The Adoption Problem]] — the other recurring shape in this codebase
- [[audits/2026-08-09-deep-module-audit|The 2026-08-09 deep-module audit]] — the containment section, with counts
- [[graph/domains/continuity|continuity]] · [[graph/domains/credit|credit]] · [[graph/domains/payment|payment]]
