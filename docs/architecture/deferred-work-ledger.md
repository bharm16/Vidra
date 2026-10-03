# Deferred work ledger

**Status:** Explicitly deferred, recorded 2026-10-03 for #146. This ledger is
not a backlog authorization or a release-completion claim. It preserves the
boundaries in [ADR-0022](../adr/0022-takes-can-enter-a-session-from-an-upload-the-sketchpad-or-the-studio.md)
and [ADR-0002](../adr/0002-vidra-is-an-authoring-tool-for-non-experts.md).

| Deferred scope                                                                    | Boundary that remains                                                                                                                                                                                | What must change before work starts                                                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Continuity and multi-shot production                                              | ADR-0022 decisions 7–8 open one illustrative camera preview, not continuity/convergence orchestration. Existing dormant services are not an accepted multi-shot product.                             | An explicit product revisit of ADR-0002 with the production and acceptance contract.                                   |
| Storyboard exposure                                                               | The planner/service implementation does not authorize a storyboard surface or another workspace resident. Decision 6 names only the quick-picture handler and video worker for session attachment.   | Decide the creator-facing flow, writer scope and durable attachment contract.                                          |
| Model-intelligence and catalog consolidation                                      | Provider registries, prompt targets and recommendation services have different contracts. Registration alone does not establish supported quality or justify consolidation.                          | Evidence of the shared contract and a separately scoped consolidation decision; preserve #144 quality gates.           |
| Image-observation provenance                                                      | Decision 2 records known production facts and explicit unknowns. Observation must not fabricate how an uploaded image was produced or silently supply associated words.                              | Decide where observation evidence belongs and its authority/provenance contract.                                       |
| Subject-motion controls                                                           | Decision 7 opens the camera choice as visible words. Subject motion has no corresponding UI writer commitment in this ADR.                                                                           | Decide the visible words writer and its regression/acceptance seam.                                                    |
| Broader generation economics and resilience                                       | Decision 6 opens worker-to-session attachment, retry and resumption only. It does not reopen the whole credit/payment, refund, sweeper or job-resilience stack.                                      | #120 policy and specifically scoped amendments; #123/#124 do not imply a blanket thaw.                                 |
| Universal operation records, shared scheduler or folding the studio into sessions | Decisions 4 and 8 preserve studio projects as separate records, take-owned provenance and mode-specific execution. The [async job plan](ASYNC_JOB_UNIFICATION.md) is a deferred historical proposal. | Explicitly revisit the rejected alternatives and their product/ownership consequences.                                 |
| Legacy-layout retirement                                                          | Media-type columns and derived layout remain the current contract. Old layout implementations cannot be removed solely because a newer surface exists.                                               | Identify remaining consumers and prove current navigation, restore, attachment and all-shells behavior before removal. |
| Session-launched live editor                                                      | The optional destination contract remains; a surface returning to the originating session is deferred under #119. Standalone Use this remains supported.                                             | A separate surface decision and proof that acceptance cannot create an unrelated session.                              |

These deferrals do not include accepted-copy safety, pending-reference preservation,
attachment recovery, browser proof or the supported-provider quality review. Those
are active contracts or open acceptance work, recorded in the
[consistency audit](../audits/2026-10-03-docs-consistency.md).

#137's [media lifecycle](admission-media-lifecycle.md) is a separate owner gate:
inspection is read-only and cleanup stays disabled until retention and deletion
eligibility are decided. A deferred broad retention system does not weaken the
current requirement that separately accepted copies survive source deletion.
