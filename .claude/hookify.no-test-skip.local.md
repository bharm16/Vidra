---
name: no-test-skip
enabled: true
event: file
pattern: \.(skip|only|fixme)\s*\(
action: warn
---

Do not skip or isolate tests. Fix failing tests instead of skipping them.

- `.skip()` hides regressions
- `.only()` silently skips the rest of the suite
- `.fixme()` is Playwright's quarantine — this repo's stale-quarantine history
  (a spec whose fixme cited a component deleted months earlier) is why it warns

Legitimate env-gated cost skips (e.g. golden-path's GOLDEN_PATH_FULL legs) may
keep `.skip` — the warning is a prompt to justify, not a ban.

If a test needs to be disabled temporarily, add a TODO comment explaining why and create a tracking issue.
