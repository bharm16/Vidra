# Proposed release policy: bounded free validation (#120)

**Status:** Proposed — owner sign-off pending. Not an authorization to spend,
change generation intake, or enable billing. Owner: Bryce Harmon.

## Why a decision is needed

The interface offers picture and clip generation without showing credits, while
those HTTP routes still reserve credits and can refuse with HTTP 402. Removing
that refusal means Vidra pays the provider. Leaving it means the visible product
promise and the server disagree. This is a release-policy choice, not a code
style choice.

## Recommendation for owner review

Ship an invite-only free validation release before implementing a paid Keep
workflow. Creators can generate, download and share their own outputs within
server-enforced dollar limits; no credit balance or checkout appears.

Proposed initial limits (these are recommendations, not approved configuration):

- $5 per creator per UTC day, aggregated across every active paid boundary.
- $25 for the application per UTC day, as a backstop across invited creators.
- $1 total provider spend per supervised live-validation run. A clip whose
  conservative upper bound exceeds the remaining allowance is refused before
  dispatch; no implicit authorization to raise the bound.

Every dispatch reserves its conservative worst-case cost before spending. Nested
LLM/image calls and allowed fallbacks consume the same aggregate allowance;
replayed admissions and attachment-only repairs do not spend again. Unknown costs
or unavailable budget storage refuse new paid dispatch. Existing burst limits
and timeouts remain independent protections. These numbers can be changed by the
owner before approval; code does not adopt them merely because this draft exists.

This would authorize #123 to implement the agreed budget contract and #124 to
remove credit-based gating only on the active picture and clip intake. Their
changes must explicitly supplement the frozen boundary in ADR-0002 and ADR-0022;
the old credit UI, payment stack, resilience workers and paid Keep contract stay
outside that authorization.

## Approval and next steps

Owner approval must record the chosen mode, dollar limits and sign-off on this
status line. Until then #120, #123 and #124 remain unresolved; their dependent
browser/live acceptance tickets cannot be represented as complete. The
alternative is a separately specified paid Keep workflow with kept state,
entitlements, checkout/cancellation/failure, reopen, download and share access.
