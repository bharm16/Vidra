# Cross-mode controls and free generation, 2026-10-03

This audit accompanies #124/#141/#143 and the owner's testing policy in
[ADR-0023](../adr/0023-bounded-free-validation-proposal.md). Test the working app
and one real completion per provider; do not require creative-quality scoring.
Keep saved projects until explicit deletion and leave automatic cleanup off.

## What the browser uncovered

The isolated browser runs use real React controls and application HTTP routes.
The first failed runs and traces are retained under `/tmp/vidra141-*`.

| Failure                                                                                                   | Correction                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client progress established a clip take before the worker could attach its completed record.              | Keep pending/job-backed clip progress local; read back the authoritative saved take into local history after attachment.                                                  |
| A late live-editor acceptance redirected the creator after Library navigation.                            | Guard starts/completions by creator, source URL, navigation key and attempt; retain the saved receipt for recovery.                                                       |
| Reloading a session hid an accepted sketch picture whose attachment failed.                               | Query existing unresolved receipts read-only; expose explicit Save it for the same take and verify its owned saved record.                                                |
| Admitted-picture URL refresh went through a users-only storage signer.                                    | Route image-asset handles through the existing owner-checked picture resolver; deny foreign handles before signing.                                                       |
| Server-created sessions could have no legacy prompt UUID.                                                 | Map a missing UUID to that session's own id so version updates have a stable, distinct local identity.                                                                    |
| Moving to the words version just created by Generate cancelled its unaccepted request during preparation. | Capture the request's session/version independently of gallery membership; cancel only requests for a different destination and flush the selected words before dispatch. |
| A hidden runtime credit check could block a free request even when the button was enabled.                | Apply the existing frozen-billing policy to that check; verify dispatch at zero credits.                                                                                  |

Two fixture defects were corrected without weakening production checks: the
mock auth repository ignored its injected creator id, and general-memory storage
lacked its owner-checked view-url port. Distinct creator ids and store namespaces
now obey the actual contracts. An available-depth fixture substitutes only the
Fal HTTP transport; the real depth SDK, route and picker still execute.

## Proof boundaries

The browser suite exercises live-editor acceptance, studio edits and return,
associated words, camera choices, actual free video intake, attachment, playback,
navigation and reopening. Provider outputs, storage and auth are controlled
ports. This spends nothing and does not establish production storage or live
provider availability. Commands and exact boundaries are in
[the browser test guide](../../tests/e2e/cross-mode/README.md).

The separate live-provider runner has completed fal picture generation,
Replicate Wan video, Google Veo video and OpenAI text. A corrected fal credential
selection preserves the first failed authentication attempt. Groq's repaired
fast default separately completed once through aiService. The shared conservative
reserved cost bound is **$1.99**, below the owner's $10 allowance; provider
invoices have not been reconciled.

Wan used the real HTTP intake, worker and session services, then reopened and
downloaded its decoded clip. Persistence and the selected source picture were
controlled, and identical selected-picture bytes were submitted to Replicate.
The browser camera tests and this live completion are separate observations.
See [provider completion evidence](../architecture/provider-quality.md) and
[the Groq repair audit](2026-10-03-groq-model-selection.md).

## Final verification

The clean Chromium run passed all 10 browser cases in 45.1 seconds after
removing temporary debug probes. Logs: `/tmp/vidra141-clean-ten.log`; existing
cross-mode/outbound-guard suites also passed 29 integration tests. The main
case verifies selected Veo model/payload parity, pending state, actual playback,
reopening and exact associated words.

Fit-to-view and keyboard activation were needed for nodes partly covered by
header/sidebar chrome. Those visibility problems remain #65 design findings;
no forced clicks or hidden application-state changes made the tests pass.

All five commit checks passed: 7,448 unit tests (one skipped), replay,
root/server typechecks, ESLint and architecture checks. Bootstrap/DI passed
seven tests with one skip; the build passed.

The unchanged original Idea Box Tier 1 suite passed all three cases against
real providers and Firestore/GCS, using the declared test-auth seam and a
known-price Qwen 3.8 override. See [native evidence](2026-10-03-original-golden-native.json).
The cumulative conservative live-test reservation is $4.9491648, below $10;
it includes retries and twelve preserved, recovered HTTP 429 responses.
No creative scoring or benchmark rerun was performed. The owner's overall design rejection keeps #65 open;
this audit is functional evidence and does not approve that design. Local
verification does not establish a deployed rollback or cross-creator acceptance
for #145. #146 therefore retains its release-completion boundary.
