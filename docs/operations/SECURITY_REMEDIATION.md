# Security remediation operations

The security remediation branch closes the application paths identified in the
October 23, 2026 source audit. It does not establish that a deployed service,
stored data or previously distributed image has been updated.

## API-key identity and credential rotation

New API-key requests use a versioned nonsecret owner identifier. They do not
automatically inherit records whose owner was the former raw-key identifier.
The server refuses raw-key owner data before it can become a new grant, content
token, log identity or provider dispatch.

Rotate any API key that was previously present in a shared object URL, token,
ordinary application log or distributed artifact. Remove the old key from the
accepted server key configuration; merely adding another key leaves the exposed
credential usable. Review retained logs and object names using restricted
operator access, without copying the credential into reports or tickets.

Historical API-key records require a deliberate migration if they must remain
usable. Establish the old-to-new owner mapping privately, dry-run the proposed
record/object changes, verify expected counts and sample identities, and obtain
execution authorization before changing stored data. Do not add a compatibility
alias that reissues a key-bearing URL or exposes an old owner field. No live
migration or key rotation is performed by this code change.

## Legacy public links

Earlier legacy share records contain no trustworthy issuer/resource proof.
Those records now return unavailable. Their owner can create a new share from
an owned clip; the new record stores its authorization evidence. Current
workflow exact-version links retain their revocation-checked streaming path.
Normal owner-authorized media reads and attachment recovery remain separate.

## Legacy video spending

Legacy jobs remain zero customer credits. Before every provider attempt, the
server verifies the persisted job/lease/request identity and reserves its
reviewed maximum provider cost against the shared Studio allowance. Reservations
remain consumed after an uncertain outcome. A retry needs a distinct, bounded
attempt and a new covered reservation.

Only existing reviewed Wan 2.2 text-to-video and Wan 2.5 image-to-video settings
qualify. Unsupported legacy settings or providers must not be enabled by
guessing a price or converting customer credits into provider cents. Review
the native profile envelope and cost policy first. Stored holds and policy
expiry continue to block dispatch on every instance.

## Build and model artifacts

Production images use selective runtime copies and exclude local credential
files and secret directories from their Docker context. Rebuild any deployed
image after this change. If an older image was built from a credential-bearing
checkout and given to a less-trusted reader, rotate the copied cloud credential;
deleting the file in a later image cannot revoke a copied key.

The SDK model downloader checks every object destination before creating
directories or downloading bytes. Model-prefix writers must still be trusted
to supply valid model data. Neither the source audit nor local mocked tests
establish current bucket IAM, provider prices or deployment configuration.
