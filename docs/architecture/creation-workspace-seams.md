# Creation and workspace seams

The creation lifecycle owns acceptance and delivery. The workspace authoring module owns working words, retention and intent admission. Their subfolders are private; named root entry points are enforced by dependency-cruiser, including for type-only imports and external tests. Internal implementation and its own tests may compose freely.

## Confirmed output and delivery

A native invocation returns either text or a `provider-media` descriptor. The lifecycle checkpoints that descriptor under the permanent execution attempt before media download, upload or publication. Delivery uses a deterministic, owner-scoped destination with immutable request/slot/snapshot provenance. An uncertain upload response is reconciled by inspecting that destination. Delivery failures never authorize another provider invocation or another spend reservation.

Historical image/audio storage paths and video asset IDs remain readable. The new `provider-media` attempt-output variant requires the updated reader: drain unfinished deliveries or retain that reader when rolling back. No historical records are migrated or deleted.

Pictures/audio and provider-video downloads use the owned-media transport. It owns validated DNS connections, redirects, cancellation and actual streamed-byte limits; storage owns content verification and immutable destination identity.

## Complete lists

Project, folder, conversation, draft, media and request reads accept `page=true`, an optional `limit` (1–200), and an opaque `cursor`. Responses contain `items` and an optional `nextCursor`. Traversal orders by document ID; cursors are bound to owner, list, project/conversation and applicable filters. Display ordering is applied after traversal.

Updated client modules traverse every page through the owned-request module. Previous-server array responses remain readable during rollout. Older clients retain the complete-array response when they omit `page=true`; these reads traverse bounded database batches instead of silently truncating. Identity-based conversation reads are independent of browsing.

## Authoring and transport

The view consumes authoring read models: current content, local edit identity, retention facts/errors, blocking reasons and typed resource state. It does not inspect checkpoint/server-acknowledgment arithmetic or prepared snapshot hashes. Setup reuse, word reuse and area completion are authoring intents; late completion cannot replace independently edited words or attach a mask to another draft.

`OwnedRequest` owns checks before authentication, after token minting and after response decoding, canonical response envelopes, error status, uncached requests and page traversal. It never automatically replays a mutation after authentication failure. Feature modules retain exact-record/schema checks and typed domain error decoding. Public reads and the legacy interactive authentication client keep their separate policies.

## Audit coverage

| Finding | Owning implementation | Behavioral evidence |
| --- | --- | --- |
| F01 | Native executor, execution store and workflow delivery | Confirmed provider output survives staging failure and restart without regeneration; lost upload response reuses identical bytes. |
| F02 | Workflow lists, project routes and owned client traversal | More than 200 records, tied timestamps, cursor ownership, HTTP continuation, old-client arrays and direct conversation access. |
| F03 | Workspace authoring intents and read models | Existing selection/retention journeys plus stale setup and area completion tests; browser journeys preserve the existing presentation. |
| F04 | Creation lifecycle and its admission implementation | Prepare/accept/dispatch route tests; durable receipt races and cross-kind identity exclusions stay covered. |
| F05 | Owned-request transport | Account switch during response decoding, authentication refusal without replay and cache policy. |
| F06 | Owned-media transport and delivery | Invalid redirects/types, streamed limits, ownership and deterministic storage recovery. |
| F07 | Named root entry points and dependency rules | Positive entry-point imports and rejected private imports, including external type-only tests. |
| F08 | Shared pure media lineage | Client tree and server preferred-version operations use the same parent/family definition; display layout remains client-owned. |
| F09 | Injected session/job/dead-letter persistence | Isolated database adapters, existing legacy recovery tests and prompt tests through existing constructor seams. |

These checks establish local behavior with controlled providers and persistence emulators. They do not establish live provider quality or authorize new spending.
