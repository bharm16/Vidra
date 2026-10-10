# Conversations, requests, and media versions have separate history

**Status:** Proposed implementation contract — 2026-10-09. The owner requested an exhaustive workflow/state definition after accepting ADR-0024's direction. The behavior below is specified for review; it is not a claim that the implementation or a migration is complete.

A chronological conversation cannot also serve as the current draft, a mutable record of everything the model should infer, and the version history of every image/video. Those responsibilities already disagree between the main session and Studio. The redesign separates them while preserving existing data and recovery identities.

## Decision specified for the redesign

- **Conversation entries record accepted requests and responses.** Revising a submitted message creates a new request linked to the original. Later messages and outputs are not truncated or rewritten.
- **Media history records actual versions and sources.** Editing a version creates a child; rerunning its producing request creates an alternative from the same inputs. Versions never follow a mutable latest/preferred pointer.
- **Drafts persist independently.** Each draft has its own revision, target, context, settings and destination. Several drafts may be retained. Inspection and background jobs do not mutate them.
- **Requests are immutable at acceptance.** Idempotency binds both submission identity/hash and the submitted draft revision. Uncertain outcomes are reconciled before any duplicate execution can occur.
- **Context follows the chosen branch.** A request stores the exact ancestor/context IDs and project-instructions revision it used. Older-result edits do not receive later or sibling instructions implicitly. Clarifications and suggestions target an exact draft revision.
- **Output, recovery and usage have distinct state.** Making a file, storing it, attaching it, charging for it, and downloading it are not interchangeable completion signals.
- **A video edit has revision history of its own.** An export captures one exact edit revision and its source versions. Revising that edit does not regenerate or overwrite previous output.

The exhaustive behavior and event rules live in [the workflow state contract](../design/workflow/workflow-state-contract.md), with a machine-readable state model and acceptance cases. That specification, rather than an implementer's reading of the short bullets here, controls edge cases and races.

The [implementation plan](../design/workflow/implementation-plan.md) assigns concrete owners, dependencies, retained/replaced/new code boundaries and acceptance tests. Its proposed storage/execution and cutover choices remain planning decisions until implemented and verified; a coverage assignment does not establish shipped behavior.

## Consequences and earlier decisions

This extends ADR-0024 and, if adopted, supersedes the universal one-living-text/session-stage assumptions in ADR-0011. It preserves ADR-0013's exact recorded ancestry and the media/receipt safeguards in ADR-0022. ADR-0019/0022's separate-surface and no-new-operation-record constraints cannot be used to omit required draft/request identities; the physical storage design remains a separate implementation decision. This does not mandate a new shared scheduler or one database collection per state group.

Legacy sessions, Studio turns and take IDs require explicit adapters. Unknown older inputs or context must remain unknown; exact replay is unavailable without a complete snapshot. Destructive merging, rewriting stored media, and synthesizing missing history are not authorized by this design.

The rejected alternative is a single mutable conversation prompt or a latest-result pointer that silently determines the next operation. Another rejected alternative is editing an earlier message by deleting all later conversation work. Both lose the creator's ability to understand which instructions made which result.

The paid-mode state rules specify customer-visible behavior only. Current free testing, existing Studio/Sketch bounds, retired providers, and legacy refund handling remain in force. Visual layout, pricing amounts, actual capabilities, and migration execution are not implied by this ADR.
