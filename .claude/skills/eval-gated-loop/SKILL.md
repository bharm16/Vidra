---
name: eval-gated-loop
description: Run an autonomous spec → implement → verify loop gated by Vidra's deterministic verification oracle (npm run verify). Use when running long or unattended agentic loops, autonomous refactors, or any change that should self-verify against the project's real commit gates before handoff.
allowed-tools:
  - read_file
  - write_file
  - bash
  - grep
  - edit
---

## Eval-Gated Loop

The pass/fail oracle for autonomous loops on Vidra. A loop is only as safe as its
verification gate — this skill defines that gate and the cost tiers around it.

### The oracle: `npm run verify`

`verify` **is** the mandatory Commit Protocol collapsed into one command:
`tsc --noEmit` → `eslint --quiet` → `test:unit`. Offline, deterministic, no API keys,
no network. Run it after every change. Non-zero exit means the iteration **failed** —
do not commit; fix and re-run. If you believe something is "done" but `verify` is red,
it is not done.

This command is kept byte-for-byte identical to the Commit Protocol on purpose: the
loop's oracle must never pass something that would fail at commit time.

### The tiers — run by cost, not all every iteration

| Tier          | Command                | Cost                                                  | When                                                                                                                               |
| ------------- | ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1 — oracle    | `npm run verify`       | free · offline · deterministic                        | EVERY iteration, before every commit                                                                                               |
| 2 — drift     | `npm run verify:drift` | free · offline · deterministic                        | before handoff/PR; **mandatory** if you touched routes, feature flags, or services (checks route-map, flag-docs, architecture-map) |
| 3 — eval      | `npm run verify:eval`  | **$$ LLM calls · non-deterministic · needs API keys** | before MERGING span-labeling or enhancement changes; **never** per-iteration                                                       |
| all (offline) | `npm run verify:all`   | free · offline                                        | = tier 1 + tier 2; the full pre-handoff gate                                                                                       |

`verify:drift` only checks that generated docs match code. If it fails, run the matching
writer (`routemap:write`, `flagdocs:generate`, `architecture:map:write`), review the
regenerated artifact, then re-run the check.

`verify:eval` runs the relaxed-F1 golden-set gate. A drop is a real regression in label
quality — see CLAUDE.md → "Span Labeling Evaluation". Bless a new baseline
(`eval:golden-set:bless`) only as a deliberate, reviewed act.

### The loop

1. **Spec** — state the change as a concrete, testable goal. Reuse the existing process
   skills for shape: `bugfix` (invariant-first regression test) for fixes,
   `cross-layer-change` for shared-contract edits, `new-feature` for scaffolding. A spec
   is done when success reads as: "`npm run verify` passes **and** <explicit behavior assertion>".
2. **Implement** — the smallest change that satisfies the spec. Surgical; match surrounding style.
3. **Verify** — `npm run verify`. Red → return to step 2. Green → continue.
4. **Pre-handoff** — `npm run verify:all`; add `verify:eval` if span/enhancement was
   touched; add `npm run test:e2e` if UI or route behavior changed (main checkout only).
5. **Commit** — only when gates are green **and** the user has asked to commit. Respect
   the Commit Scope Rules in CLAUDE.md (≤10 files; never mix dependency bumps with code).

### Oversight posture

Grant the loop high autonomy up front, then **monitor and interrupt** — do not approve
action-by-action. The gate, not per-action approval, is what makes a long unattended run
safe. This mirrors how mature agentic usage has trended: longer autonomous turns held
safe by a verification oracle plus active monitoring, not micro-approval.

### Worktree caveat

In a git worktree (`git rev-parse --git-common-dir` ≠ `.git`): tiers 1–2 are safe (no
ports, no server boot). Skip `test:e2e` and any server-booting step — defer those to the
main checkout or CI. See CLAUDE.md → "Operating in a Worktree".
