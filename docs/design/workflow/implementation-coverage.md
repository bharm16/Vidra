# Implementation coverage for every workflow state

Generated from `implementation-plan.json` and checked against `state-model.json`. Every status here is **planned**, not implemented or tested in the application.

**126 states · 348 declared transitions · 1032 rejected pairs · 5 action adapters.** No state/pair may disappear from this ledger when the behavior model changes; the checker fails until the plan is amended.

KEEP preserves a proven lower-level boundary and retests its new use. EXTEND retains its owner while adding behavior. REPLACE changes contradictory behavior. NEW has no active implementation. See [source evidence](implementation-source-inventory.md) and [package dependencies](implementation-plan.md).

## Project

**Whole-group application conformance is ready after:** WP-03, WP-18. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `local` | WP-03 | NEW | `server/src/services/projects/` | STATE::project::local; STATE-project | New project envelope and read adapters; existing session/Studio objects remain intact. |
| `creating` | WP-03 | NEW | `server/src/services/projects/` | STATE::project::creating; STATE-project | New project envelope and read adapters; existing session/Studio objects remain intact. |
| `ready` | WP-03 | NEW | `server/src/services/projects/` | STATE::project::ready; STATE-project | New project envelope and read adapters; existing session/Studio objects remain intact. |
| `load_failed` | WP-03 | NEW | `server/src/services/projects/` | STATE::project::load_failed; STATE-project | New project envelope and read adapters; existing session/Studio objects remain intact. |
| `inaccessible` | WP-03 | NEW | `server/src/services/projects/` | STATE::project::inaccessible; STATE-project | New project envelope and read adapters; existing session/Studio objects remain intact. |
| `trashing` | WP-18 | NEW | `server/src/services/projects/lifecycle/` | STATE::project::trashing; ACCEPT-WP-18 | New authoritative archive/trash/restore semantics and public access denial. |
| `trashed` | WP-18 | NEW | `server/src/services/projects/lifecycle/` | STATE::project::trashed; ACCEPT-WP-18 | New authoritative archive/trash/restore semantics and public access denial. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| local / create → creating | WP-03 | H01 | EDGE::project::local::create; STATE-project |
| creating / created → ready | WP-03 | H01 | EDGE::project::creating::created; STATE-project |
| creating / response_lost → creating | WP-03 | J02 | EDGE::project::creating::response_lost; STATE-project |
| creating / create_rejected → local | WP-03 | J03 | EDGE::project::creating::create_rejected; STATE-project |
| ready / load_failed → load_failed | WP-03 | R07 | EDGE::project::ready::load_failed; STATE-project |
| load_failed / loaded → ready | WP-03 | R07 | EDGE::project::load_failed::loaded; STATE-project |
| ready / access_denied → inaccessible | WP-03 | R07 | EDGE::project::ready::access_denied; STATE-project |
| load_failed / access_denied → inaccessible | WP-03 | R07 | EDGE::project::load_failed::access_denied; STATE-project |
| inaccessible / access_restored → ready | WP-03 | R05 | EDGE::project::inaccessible::access_restored; STATE-project |
| ready / trash → trashing | WP-18 | L04 | EDGE::project::ready::trash; ACCEPT-WP-18 |
| trashing / trash_confirmed → trashed | WP-18 | L04 | EDGE::project::trashing::trash_confirmed; ACCEPT-WP-18 |
| trashing / rejected → ready | WP-18 | L04 | EDGE::project::trashing::rejected; ACCEPT-WP-18 |
| trashing / response_lost → trashing | WP-18 | J02 | EDGE::project::trashing::response_lost; ACCEPT-WP-18 |
| trashed / restored → ready | WP-18 | L04 | EDGE::project::trashed::restored; ACCEPT-WP-18 |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| local | WP-03 / STATE-project | access_denied, access_restored, create_rejected, created, load_failed, loaded, rejected, response_lost, restored, trash, trash_confirmed |
| creating | WP-03 / STATE-project | access_denied, access_restored, create, load_failed, loaded, rejected, restored, trash, trash_confirmed |
| ready | WP-03 / STATE-project | access_restored, create, create_rejected, created, loaded, rejected, response_lost, restored, trash_confirmed |
| load_failed | WP-03 / STATE-project | access_restored, create, create_rejected, created, load_failed, rejected, response_lost, restored, trash, trash_confirmed |
| inaccessible | WP-03 / STATE-project | access_denied, create, create_rejected, created, load_failed, loaded, rejected, response_lost, restored, trash, trash_confirmed |
| trashing | WP-18 / ACCEPT-WP-18 | access_denied, access_restored, create, create_rejected, created, load_failed, loaded, restored, trash |
| trashed | WP-18 / ACCEPT-WP-18 | access_denied, access_restored, create, create_rejected, created, load_failed, loaded, rejected, response_lost, trash, trash_confirmed |

## Conversation

**Whole-group application conformance is ready after:** WP-03, WP-18. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `active` | WP-03 | NEW | `server/src/services/projects/` | STATE::conversation::active; STATE-conversation | New ordered conversation identity; legacy turn history is read through adapters. |
| `archiving` | WP-18 | NEW | `server/src/services/projects/lifecycle/` | STATE::conversation::archiving; ACCEPT-WP-18 | New authoritative archive/trash/restore semantics and public access denial. |
| `archived` | WP-18 | NEW | `server/src/services/projects/lifecycle/` | STATE::conversation::archived; ACCEPT-WP-18 | New authoritative archive/trash/restore semantics and public access denial. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| active / archive → archiving | WP-18 | L03 | EDGE::conversation::active::archive; ACCEPT-WP-18 |
| archiving / confirmed → archived | WP-18 | L03 | EDGE::conversation::archiving::confirmed; ACCEPT-WP-18 |
| archiving / response_lost → archiving | WP-18 | J02 | EDGE::conversation::archiving::response_lost; ACCEPT-WP-18 |
| archiving / rejected → active | WP-18 | L03 | EDGE::conversation::archiving::rejected; ACCEPT-WP-18 |
| archived / restore → active | WP-18 | L03 | EDGE::conversation::archived::restore; ACCEPT-WP-18 |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| active | WP-03 / STATE-conversation | confirmed, rejected, response_lost, restore |
| archiving | WP-18 / ACCEPT-WP-18 | archive, restore |
| archived | WP-18 / ACCEPT-WP-18 | archive, confirmed, rejected, response_lost |

## Connection

**Whole-group application conformance is ready after:** WP-05. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `online` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::connection::online; STATE-connection | Replace browser observation-as-execution failure and add safe reconnect. |
| `offline` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::connection::offline; STATE-connection | Replace browser observation-as-execution failure and add safe reconnect. |
| `reconnecting` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::connection::reconnecting; STATE-connection | Replace browser observation-as-execution failure and add safe reconnect. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| online / lost → offline | WP-05 | R02 | EDGE::connection::online::lost; STATE-connection |
| offline / network_available → reconnecting | WP-05 | R02 | EDGE::connection::offline::network_available; STATE-connection |
| reconnecting / reconciled → online | WP-05 | R01 | EDGE::connection::reconnecting::reconciled; STATE-connection |
| reconnecting / lost → offline | WP-05 | R02 | EDGE::connection::reconnecting::lost; STATE-connection |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| online | WP-05 / STATE-connection | network_available, reconciled |
| offline | WP-05 / STATE-connection | lost, reconciled |
| reconnecting | WP-05 / STATE-connection | network_available |

## Authentication

**Whole-group application conformance is ready after:** WP-05. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `guest` | WP-05 | EXTEND | `client/src/repositories/workflow/` | STATE::authentication::guest; STATE-authentication | Keep Firebase auth; replace unsafe replay/cache ownership and add scoped recovery. |
| `signed_in` | WP-05 | EXTEND | `client/src/repositories/workflow/` | STATE::authentication::signed_in; STATE-authentication | Keep Firebase auth; replace unsafe replay/cache ownership and add scoped recovery. |
| `reauth_required` | WP-05 | EXTEND | `client/src/repositories/workflow/` | STATE::authentication::reauth_required; STATE-authentication | Keep Firebase auth; replace unsafe replay/cache ownership and add scoped recovery. |
| `signed_out` | WP-05 | EXTEND | `client/src/repositories/workflow/` | STATE::authentication::signed_out; STATE-authentication | Keep Firebase auth; replace unsafe replay/cache ownership and add scoped recovery. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| guest / sign_in → signed_in | WP-05 | R05 | EDGE::authentication::guest::sign_in; STATE-authentication |
| signed_in / expired → reauth_required | WP-05 | R05 | EDGE::authentication::signed_in::expired; STATE-authentication |
| reauth_required / same_owner_sign_in → signed_in | WP-05 | R05 | EDGE::authentication::reauth_required::same_owner_sign_in; STATE-authentication |
| signed_in / sign_out → signed_out | WP-05 | R06 | EDGE::authentication::signed_in::sign_out; STATE-authentication |
| reauth_required / sign_out → signed_out | WP-05 | R06 | EDGE::authentication::reauth_required::sign_out; STATE-authentication |
| signed_out / same_owner_sign_in → signed_in | WP-05 | R05 | EDGE::authentication::signed_out::same_owner_sign_in; STATE-authentication |
| signed_out / different_owner_sign_in → signed_in | WP-05 | R05 | EDGE::authentication::signed_out::different_owner_sign_in; STATE-authentication |
| reauth_required / different_owner_sign_in → signed_in | WP-05 | R05 | EDGE::authentication::reauth_required::different_owner_sign_in; STATE-authentication |
| signed_out / start_anonymous → guest | WP-05 | R05 | EDGE::authentication::signed_out::start_anonymous; STATE-authentication |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| guest | WP-05 / STATE-authentication | different_owner_sign_in, expired, same_owner_sign_in, sign_out, start_anonymous |
| signed_in | WP-05 / STATE-authentication | different_owner_sign_in, same_owner_sign_in, sign_in, start_anonymous |
| reauth_required | WP-05 / STATE-authentication | expired, sign_in, start_anonymous |
| signed_out | WP-05 / STATE-authentication | expired, sign_in, sign_out |

## Draft

**Whole-group application conformance is ready after:** WP-04. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `open` | WP-04 | NEW | `server/src/services/creation-drafts/` | STATE::draft::open; STATE-draft | Independent draft lifecycle does not exist in current session records. |
| `parked` | WP-04 | NEW | `server/src/services/creation-drafts/` | STATE::draft::parked; STATE-draft | Independent draft lifecycle does not exist in current session records. |
| `submitted` | WP-04 | NEW | `server/src/services/creation-drafts/` | STATE::draft::submitted; STATE-draft | Independent draft lifecycle does not exist in current session records. |
| `discarded` | WP-04 | NEW | `server/src/services/creation-drafts/` | STATE::draft::discarded; STATE-draft | Independent draft lifecycle does not exist in current session records. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| open / park → parked | WP-04 | D01 | EDGE::draft::open::park; STATE-draft |
| parked / reopen → open | WP-04 | D01 | EDGE::draft::parked::reopen; STATE-draft |
| open / accepted → submitted | WP-04 | D03 | EDGE::draft::open::accepted; STATE-draft |
| open / discard → discarded | WP-04 | D01 | EDGE::draft::open::discard; STATE-draft |
| parked / discard → discarded | WP-04 | D01 | EDGE::draft::parked::discard; STATE-draft |
| submitted / view_history → submitted | WP-04 | H07 | EDGE::draft::submitted::view_history; STATE-draft |
| submitted / reuse_setup → submitted | WP-04 | H07 | EDGE::draft::submitted::reuse_setup; STATE-draft |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| open | WP-04 / STATE-draft | reopen, reuse_setup, view_history |
| parked | WP-04 / STATE-draft | accepted, park, reuse_setup, view_history |
| submitted | WP-04 / STATE-draft | accepted, discard, park, reopen |
| discarded | WP-04 / STATE-draft | accepted, discard, park, reopen, reuse_setup, view_history |

## Draft save

**Whole-group application conformance is ready after:** WP-05. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `local` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::local; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |
| `saving` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::saving; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |
| `saved` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::saved; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |
| `failed` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::failed; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |
| `conflict` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::conflict; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |
| `local_failed` | WP-05 | REPLACE | `client/src/features/creation-drafts/` | STATE::draft_save::local_failed; STATE-draft_save | Replace fragmented/job-gated saving with independent local/server revisions and conflicts. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| local / edit_checkpointed → local | WP-05 | D08 | EDGE::draft_save::local::edit_checkpointed; STATE-draft_save |
| saved / edit_checkpointed → local | WP-05 | D08 | EDGE::draft_save::saved::edit_checkpointed; STATE-draft_save |
| failed / edit_checkpointed → local | WP-05 | D08 | EDGE::draft_save::failed::edit_checkpointed; STATE-draft_save |
| local / save → saving | WP-05 | D08 | EDGE::draft_save::local::save; STATE-draft_save |
| failed / save → saving | WP-05 | D08 | EDGE::draft_save::failed::save; STATE-draft_save |
| saving / ack_current → saved | WP-05 | D08 | EDGE::draft_save::saving::ack_current; STATE-draft_save |
| saving / ack_stale → local | WP-05 | D08 | EDGE::draft_save::saving::ack_stale; STATE-draft_save |
| saving / edit_checkpointed → local | WP-05 | D08 | EDGE::draft_save::saving::edit_checkpointed; STATE-draft_save |
| saving / remote_failure → failed | WP-05 | D08 | EDGE::draft_save::saving::remote_failure; STATE-draft_save |
| saving / revision_conflict → conflict | WP-05 | R03 | EDGE::draft_save::saving::revision_conflict; STATE-draft_save |
| conflict / keep_local_as_new → local | WP-05 | R03 | EDGE::draft_save::conflict::keep_local_as_new; STATE-draft_save |
| conflict / use_server → saved | WP-05 | R03 | EDGE::draft_save::conflict::use_server; STATE-draft_save |
| conflict / combine → local | WP-05 | R03 | EDGE::draft_save::conflict::combine; STATE-draft_save |
| local / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::local::local_checkpoint_failure_unprotected; STATE-draft_save |
| saving / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::saving::local_checkpoint_failure_unprotected; STATE-draft_save |
| saved / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::saved::local_checkpoint_failure_unprotected; STATE-draft_save |
| failed / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::failed::local_checkpoint_failure_unprotected; STATE-draft_save |
| conflict / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::conflict::local_checkpoint_failure_unprotected; STATE-draft_save |
| local_failed / local_checkpoint_failure_unprotected → local_failed | WP-05 | D08 | EDGE::draft_save::local_failed::local_checkpoint_failure_unprotected; STATE-draft_save |
| local_failed / checkpoint_recovered → local | WP-05 | D08 | EDGE::draft_save::local_failed::checkpoint_recovered; STATE-draft_save |
| local_failed / draft_exported → local_failed | WP-05 | D10 | EDGE::draft_save::local_failed::draft_exported; STATE-draft_save |
| saved / local_checkpoint_failure_protected → saved | WP-05 | D08 | EDGE::draft_save::saved::local_checkpoint_failure_protected; STATE-draft_save |
| local_failed / ack_current → saved | WP-05 | D08 | EDGE::draft_save::local_failed::ack_current; STATE-draft_save |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| local | WP-05 / STATE-draft_save | ack_current, ack_stale, checkpoint_recovered, combine, draft_exported, keep_local_as_new, local_checkpoint_failure_protected, remote_failure, revision_conflict, use_server |
| saving | WP-05 / STATE-draft_save | checkpoint_recovered, combine, draft_exported, keep_local_as_new, local_checkpoint_failure_protected, save, use_server |
| saved | WP-05 / STATE-draft_save | ack_current, ack_stale, checkpoint_recovered, combine, draft_exported, keep_local_as_new, remote_failure, revision_conflict, save, use_server |
| failed | WP-05 / STATE-draft_save | ack_current, ack_stale, checkpoint_recovered, combine, draft_exported, keep_local_as_new, local_checkpoint_failure_protected, remote_failure, revision_conflict, use_server |
| conflict | WP-05 / STATE-draft_save | ack_current, ack_stale, checkpoint_recovered, draft_exported, edit_checkpointed, local_checkpoint_failure_protected, remote_failure, revision_conflict, save |
| local_failed | WP-05 / STATE-draft_save | ack_stale, combine, edit_checkpointed, keep_local_as_new, local_checkpoint_failure_protected, remote_failure, revision_conflict, save, use_server |

## Input target

**Whole-group application conformance is ready after:** WP-13. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `none` | WP-13 | REPLACE | `client/src/features/project-workspace/` | STATE::input_target::none; STATE-input_target | Replace viewer selection/starting-frame inference with explicit version or pending-slot binding. |
| `version` | WP-13 | REPLACE | `client/src/features/project-workspace/` | STATE::input_target::version; STATE-input_target | Replace viewer selection/starting-frame inference with explicit version or pending-slot binding. |
| `pending` | WP-13 | REPLACE | `client/src/features/project-workspace/` | STATE::input_target::pending; STATE-input_target | Replace viewer selection/starting-frame inference with explicit version or pending-slot binding. |
| `choice_required` | WP-13 | REPLACE | `client/src/features/project-workspace/` | STATE::input_target::choice_required; STATE-input_target | Replace viewer selection/starting-frame inference with explicit version or pending-slot binding. |
| `unavailable` | WP-13 | REPLACE | `client/src/features/project-workspace/` | STATE::input_target::unavailable; STATE-input_target | Replace viewer selection/starting-frame inference with explicit version or pending-slot binding. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| none / bind_available → version | WP-13 | C02 | EDGE::input_target::none::bind_available; STATE-input_target |
| version / bind_available → version | WP-13 | C02 | EDGE::input_target::version::bind_available; STATE-input_target |
| choice_required / bind_available → version | WP-13 | C02 | EDGE::input_target::choice_required::bind_available; STATE-input_target |
| unavailable / bind_available → version | WP-13 | C02 | EDGE::input_target::unavailable::bind_available; STATE-input_target |
| none / bind_pending → pending | WP-13 | D04 | EDGE::input_target::none::bind_pending; STATE-input_target |
| version / bind_pending → pending | WP-13 | D04 | EDGE::input_target::version::bind_pending; STATE-input_target |
| choice_required / bind_pending → pending | WP-13 | D04 | EDGE::input_target::choice_required::bind_pending; STATE-input_target |
| none / require_choice → choice_required | WP-13 | D05 | EDGE::input_target::none::require_choice; STATE-input_target |
| version / require_choice → choice_required | WP-13 | D05 | EDGE::input_target::version::require_choice; STATE-input_target |
| pending / require_choice → choice_required | WP-13 | D05 | EDGE::input_target::pending::require_choice; STATE-input_target |
| pending / output_deliverable → version | WP-13 | D04 | EDGE::input_target::pending::output_deliverable; STATE-input_target |
| pending / output_failed → unavailable | WP-13 | D04 | EDGE::input_target::pending::output_failed; STATE-input_target |
| version / access_lost → unavailable | WP-13 | M04 | EDGE::input_target::version::access_lost; STATE-input_target |
| unavailable / same_source_recovered → version | WP-13 | M04 | EDGE::input_target::unavailable::same_source_recovered; STATE-input_target |
| none / clear → none | WP-13 | C05 | EDGE::input_target::none::clear; STATE-input_target |
| version / clear → none | WP-13 | C05 | EDGE::input_target::version::clear; STATE-input_target |
| pending / clear → none | WP-13 | C05 | EDGE::input_target::pending::clear; STATE-input_target |
| choice_required / clear → none | WP-13 | C05 | EDGE::input_target::choice_required::clear; STATE-input_target |
| unavailable / clear → none | WP-13 | C05 | EDGE::input_target::unavailable::clear; STATE-input_target |
| none / inspect → none | WP-13 | I01 | EDGE::input_target::none::inspect; STATE-input_target |
| version / inspect → version | WP-13 | I01 | EDGE::input_target::version::inspect; STATE-input_target |
| pending / inspect → pending | WP-13 | I01 | EDGE::input_target::pending::inspect; STATE-input_target |
| choice_required / inspect → choice_required | WP-13 | I01 | EDGE::input_target::choice_required::inspect; STATE-input_target |
| unavailable / inspect → unavailable | WP-13 | I01 | EDGE::input_target::unavailable::inspect; STATE-input_target |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| none | WP-13 / STATE-input_target | access_lost, output_deliverable, output_failed, same_source_recovered |
| version | WP-13 / STATE-input_target | output_deliverable, output_failed, same_source_recovered |
| pending | WP-13 / STATE-input_target | access_lost, bind_available, bind_pending, same_source_recovered |
| choice_required | WP-13 / STATE-input_target | access_lost, output_deliverable, output_failed, require_choice, same_source_recovered |
| unavailable | WP-13 / STATE-input_target | access_lost, bind_pending, output_deliverable, output_failed, require_choice |

## Submission

**Whole-group application conformance is ready after:** WP-08. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `idle` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::idle; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |
| `sending` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::sending; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |
| `unknown` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::unknown; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |
| `accepted` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::accepted; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |
| `rejected` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::rejected; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |
| `needs_attention` | WP-08 | EXTEND | `server/src/services/creation-requests/admission/` | STATE::submission::needs_attention; STATE-submission | Extend existing receipt authority for execution-draft uniqueness and unknown outcome retention. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| idle / submit_valid → sending | WP-08 | D03 | EDGE::submission::idle::submit_valid; STATE-submission |
| sending / accepted → accepted | WP-08 | J01 | EDGE::submission::sending::accepted; STATE-submission |
| sending / response_uncertain → unknown | WP-08 | J02 | EDGE::submission::sending::response_uncertain; STATE-submission |
| sending / rejected → rejected | WP-08 | J03 | EDGE::submission::sending::rejected; STATE-submission |
| unknown / receipt_found → accepted | WP-08 | J02 | EDGE::submission::unknown::receipt_found; STATE-submission |
| unknown / definitely_absent → sending | WP-08 | J02 | EDGE::submission::unknown::definitely_absent; STATE-submission |
| unknown / rejected → rejected | WP-08 | J03 | EDGE::submission::unknown::rejected; STATE-submission |
| unknown / check_again → unknown | WP-08 | J02 | EDGE::submission::unknown::check_again; STATE-submission |
| accepted / duplicate_response → accepted | WP-08 | J01 | EDGE::submission::accepted::duplicate_response; STATE-submission |
| rejected / corrected_new_revision → idle | WP-08 | J03 | EDGE::submission::rejected::corrected_new_revision; STATE-submission |
| unknown / recovery_deadline → needs_attention | WP-08 | J15 | EDGE::submission::unknown::recovery_deadline; STATE-submission |
| needs_attention / check_again → unknown | WP-08 | J15 | EDGE::submission::needs_attention::check_again; STATE-submission |
| needs_attention / receipt_found → accepted | WP-08 | J15 | EDGE::submission::needs_attention::receipt_found; STATE-submission |
| needs_attention / definitely_absent → sending | WP-08 | J15 | EDGE::submission::needs_attention::definitely_absent; STATE-submission |
| needs_attention / rejected → rejected | WP-08 | J15 | EDGE::submission::needs_attention::rejected; STATE-submission |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| idle | WP-08 / STATE-submission | accepted, check_again, corrected_new_revision, definitely_absent, duplicate_response, receipt_found, recovery_deadline, rejected, response_uncertain |
| sending | WP-08 / STATE-submission | check_again, corrected_new_revision, definitely_absent, duplicate_response, receipt_found, recovery_deadline, submit_valid |
| unknown | WP-08 / STATE-submission | accepted, corrected_new_revision, duplicate_response, response_uncertain, submit_valid |
| accepted | WP-08 / STATE-submission | accepted, check_again, corrected_new_revision, definitely_absent, receipt_found, recovery_deadline, rejected, response_uncertain, submit_valid |
| rejected | WP-08 / STATE-submission | accepted, check_again, definitely_absent, duplicate_response, receipt_found, recovery_deadline, rejected, response_uncertain, submit_valid |
| needs_attention | WP-08 / STATE-submission | accepted, corrected_new_revision, duplicate_response, recovery_deadline, response_uncertain, submit_valid |

## Request

**Whole-group application conformance is ready after:** WP-09, WP-11. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `queued` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::queued; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `running` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::running; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `settling` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::settling; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `reconciling` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::request::reconciling; ACCEPT-WP-11 | New evidence-based unknown/cancel/deadline behavior; native timeout/abort states are insufficient. |
| `succeeded` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::succeeded; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `partial` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::partial; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `failed` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::request::failed; STATE-request | Keep native executors; new aggregate request facts come from stable slot/attempt observations. |
| `cancelled` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::request::cancelled; ACCEPT-WP-11 | New evidence-based unknown/cancel/deadline behavior; native timeout/abort states are insufficient. |
| `needs_attention` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::request::needs_attention; ACCEPT-WP-11 | New evidence-based unknown/cancel/deadline behavior; native timeout/abort states are insufficient. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| queued / start → running | WP-11 | J04 | EDGE::request::queued::start; ACCEPT-WP-11 |
| queued / no_slots_dispatched_cancelled → cancelled | WP-11 | J10 | EDGE::request::queued::no_slots_dispatched_cancelled; ACCEPT-WP-11 |
| queued / proven_failure → failed | WP-09 | P01 | EDGE::request::queued::proven_failure; STATE-request |
| running / output_received → settling | WP-09 | J06 | EDGE::request::running::output_received; STATE-request |
| running / outcome_unknown → reconciling | WP-11 | J04 | EDGE::request::running::outcome_unknown; ACCEPT-WP-11 |
| settling / outcome_unknown → reconciling | WP-11 | J04 | EDGE::request::settling::outcome_unknown; ACCEPT-WP-11 |
| running / all_deliverable → succeeded | WP-09 | J07 | EDGE::request::running::all_deliverable; STATE-request |
| settling / all_deliverable → succeeded | WP-09 | J07 | EDGE::request::settling::all_deliverable; STATE-request |
| reconciling / all_deliverable → succeeded | WP-09 | J07 | EDGE::request::reconciling::all_deliverable; STATE-request |
| running / some_deliverable_rest_terminal → partial | WP-09 | J07 | EDGE::request::running::some_deliverable_rest_terminal; STATE-request |
| settling / some_deliverable_rest_terminal → partial | WP-09 | J07 | EDGE::request::settling::some_deliverable_rest_terminal; STATE-request |
| reconciling / some_deliverable_rest_terminal → partial | WP-09 | J07 | EDGE::request::reconciling::some_deliverable_rest_terminal; STATE-request |
| running / none_deliverable_all_failed → failed | WP-09 | J07 | EDGE::request::running::none_deliverable_all_failed; STATE-request |
| settling / none_deliverable_all_failed → failed | WP-09 | J07 | EDGE::request::settling::none_deliverable_all_failed; STATE-request |
| reconciling / none_deliverable_all_failed → failed | WP-09 | J07 | EDGE::request::reconciling::none_deliverable_all_failed; STATE-request |
| running / all_cancelled → cancelled | WP-11 | J12 | EDGE::request::running::all_cancelled; ACCEPT-WP-11 |
| settling / all_cancelled → cancelled | WP-11 | J12 | EDGE::request::settling::all_cancelled; ACCEPT-WP-11 |
| reconciling / all_cancelled → cancelled | WP-11 | J12 | EDGE::request::reconciling::all_cancelled; ACCEPT-WP-11 |
| reconciling / verified_running → running | WP-11 | J04 | EDGE::request::reconciling::verified_running; ACCEPT-WP-11 |
| reconciling / verified_saving → settling | WP-09 | J06 | EDGE::request::reconciling::verified_saving; STATE-request |
| succeeded / contradictory_terminal → reconciling | WP-11 | J09 | EDGE::request::succeeded::contradictory_terminal; ACCEPT-WP-11 |
| partial / contradictory_terminal → reconciling | WP-11 | J09 | EDGE::request::partial::contradictory_terminal; ACCEPT-WP-11 |
| failed / contradictory_terminal → reconciling | WP-11 | J09 | EDGE::request::failed::contradictory_terminal; ACCEPT-WP-11 |
| cancelled / contradictory_terminal → reconciling | WP-11 | J09 | EDGE::request::cancelled::contradictory_terminal; ACCEPT-WP-11 |
| queued / duplicate_or_old_event → queued | WP-11 | J09 | EDGE::request::queued::duplicate_or_old_event; ACCEPT-WP-11 |
| running / duplicate_or_old_event → running | WP-11 | J09 | EDGE::request::running::duplicate_or_old_event; ACCEPT-WP-11 |
| settling / duplicate_or_old_event → settling | WP-11 | J09 | EDGE::request::settling::duplicate_or_old_event; ACCEPT-WP-11 |
| reconciling / duplicate_or_old_event → reconciling | WP-11 | J09 | EDGE::request::reconciling::duplicate_or_old_event; ACCEPT-WP-11 |
| succeeded / duplicate_or_old_event → succeeded | WP-11 | J09 | EDGE::request::succeeded::duplicate_or_old_event; ACCEPT-WP-11 |
| partial / duplicate_or_old_event → partial | WP-11 | J09 | EDGE::request::partial::duplicate_or_old_event; ACCEPT-WP-11 |
| failed / duplicate_or_old_event → failed | WP-11 | J09 | EDGE::request::failed::duplicate_or_old_event; ACCEPT-WP-11 |
| cancelled / duplicate_or_old_event → cancelled | WP-11 | J09 | EDGE::request::cancelled::duplicate_or_old_event; ACCEPT-WP-11 |
| queued / recovery_deadline → needs_attention | WP-11 | J13 | EDGE::request::queued::recovery_deadline; ACCEPT-WP-11 |
| running / recovery_deadline → needs_attention | WP-11 | J13 | EDGE::request::running::recovery_deadline; ACCEPT-WP-11 |
| settling / recovery_deadline → needs_attention | WP-11 | J13 | EDGE::request::settling::recovery_deadline; ACCEPT-WP-11 |
| reconciling / recovery_deadline → needs_attention | WP-11 | J13 | EDGE::request::reconciling::recovery_deadline; ACCEPT-WP-11 |
| needs_attention / check_status → reconciling | WP-11 | J13 | EDGE::request::needs_attention::check_status; ACCEPT-WP-11 |
| needs_attention / all_deliverable → succeeded | WP-11 | J13 | EDGE::request::needs_attention::all_deliverable; ACCEPT-WP-11 |
| needs_attention / some_deliverable_rest_terminal → partial | WP-11 | J13 | EDGE::request::needs_attention::some_deliverable_rest_terminal; ACCEPT-WP-11 |
| needs_attention / none_deliverable_all_failed → failed | WP-11 | J13 | EDGE::request::needs_attention::none_deliverable_all_failed; ACCEPT-WP-11 |
| needs_attention / all_cancelled → cancelled | WP-11 | J13 | EDGE::request::needs_attention::all_cancelled; ACCEPT-WP-11 |
| needs_attention / duplicate_or_old_event → needs_attention | WP-11 | J09 | EDGE::request::needs_attention::duplicate_or_old_event; ACCEPT-WP-11 |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| queued | WP-09 / STATE-request | all_cancelled, all_deliverable, check_status, contradictory_terminal, none_deliverable_all_failed, outcome_unknown, output_received, some_deliverable_rest_terminal, verified_running, verified_saving |
| running | WP-09 / STATE-request | check_status, contradictory_terminal, no_slots_dispatched_cancelled, proven_failure, start, verified_running, verified_saving |
| settling | WP-09 / STATE-request | check_status, contradictory_terminal, no_slots_dispatched_cancelled, output_received, proven_failure, start, verified_running, verified_saving |
| reconciling | WP-11 / ACCEPT-WP-11 | check_status, contradictory_terminal, no_slots_dispatched_cancelled, outcome_unknown, output_received, proven_failure, start |
| succeeded | WP-09 / STATE-request | all_cancelled, all_deliverable, check_status, no_slots_dispatched_cancelled, none_deliverable_all_failed, outcome_unknown, output_received, proven_failure, recovery_deadline, some_deliverable_rest_terminal, start, verified_running, verified_saving |
| partial | WP-09 / STATE-request | all_cancelled, all_deliverable, check_status, no_slots_dispatched_cancelled, none_deliverable_all_failed, outcome_unknown, output_received, proven_failure, recovery_deadline, some_deliverable_rest_terminal, start, verified_running, verified_saving |
| failed | WP-09 / STATE-request | all_cancelled, all_deliverable, check_status, no_slots_dispatched_cancelled, none_deliverable_all_failed, outcome_unknown, output_received, proven_failure, recovery_deadline, some_deliverable_rest_terminal, start, verified_running, verified_saving |
| cancelled | WP-11 / ACCEPT-WP-11 | all_cancelled, all_deliverable, check_status, no_slots_dispatched_cancelled, none_deliverable_all_failed, outcome_unknown, output_received, proven_failure, recovery_deadline, some_deliverable_rest_terminal, start, verified_running, verified_saving |
| needs_attention | WP-11 / ACCEPT-WP-11 | contradictory_terminal, no_slots_dispatched_cancelled, outcome_unknown, output_received, proven_failure, recovery_deadline, start, verified_running, verified_saving |

## Output slot

**Whole-group application conformance is ready after:** WP-09, WP-10, WP-11, WP-17. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `waiting` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::output_slot::waiting; STATE-output_slot | Keep Studio slot ordering and native media identity; add uniform attempt/storage distinction. |
| `running` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::output_slot::running; STATE-output_slot | Keep Studio slot ordering and native media identity; add uniform attempt/storage distinction. |
| `unknown` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::output_slot::unknown; ACCEPT-WP-11 | New evidence-based unknown/cancel/deadline behavior; native timeout/abort states are insufficient. |
| `received` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::output_slot::received; STATE-output_slot | Keep Studio slot ordering and native media identity; add uniform attempt/storage distinction. |
| `saving` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::output_slot::saving; ACCEPT-WP-10 | Extend existing durable copy/repair with stable slot version and truthful output-loss handling. |
| `save_failed` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::output_slot::save_failed; ACCEPT-WP-10 | Extend existing durable copy/repair with stable slot version and truthful output-loss handling. |
| `stored` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::output_slot::stored; ACCEPT-WP-10 | Extend existing durable copy/repair with stable slot version and truthful output-loss handling. |
| `failed` | WP-09 | EXTEND | `server/src/services/creation-requests/execution/` | STATE::output_slot::failed; STATE-output_slot | Keep Studio slot ordering and native media identity; add uniform attempt/storage distinction. |
| `output_lost` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::output_slot::output_lost; ACCEPT-WP-10 | Extend existing durable copy/repair with stable slot version and truthful output-loss handling. |
| `cancelled` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::output_slot::cancelled; ACCEPT-WP-11 | New evidence-based unknown/cancel/deadline behavior; native timeout/abort states are insufficient. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| waiting / dispatch → running | WP-11 | J04 | EDGE::output_slot::waiting::dispatch; ACCEPT-WP-11 |
| waiting / cancel_confirmed → cancelled | WP-11 | J10 | EDGE::output_slot::waiting::cancel_confirmed; ACCEPT-WP-11 |
| running / response_uncertain → unknown | WP-11 | J04 | EDGE::output_slot::running::response_uncertain; ACCEPT-WP-11 |
| running / provider_output → received | WP-09 | J06 | EDGE::output_slot::running::provider_output; STATE-output_slot |
| unknown / provider_output → received | WP-09 | J06 | EDGE::output_slot::unknown::provider_output; STATE-output_slot |
| running / proven_provider_failure → failed | WP-09 | J07 | EDGE::output_slot::running::proven_provider_failure; STATE-output_slot |
| unknown / proven_provider_failure → failed | WP-09 | J07 | EDGE::output_slot::unknown::proven_provider_failure; STATE-output_slot |
| running / cancel_confirmed → cancelled | WP-11 | J10 | EDGE::output_slot::running::cancel_confirmed; ACCEPT-WP-11 |
| unknown / cancel_confirmed → cancelled | WP-11 | J10 | EDGE::output_slot::unknown::cancel_confirmed; ACCEPT-WP-11 |
| received / begin_copy → saving | WP-10 | J06 | EDGE::output_slot::received::begin_copy; ACCEPT-WP-10 |
| saving / copied → stored | WP-10 | J06 | EDGE::output_slot::saving::copied; ACCEPT-WP-10 |
| saving / copy_failed → save_failed | WP-10 | J06 | EDGE::output_slot::saving::copy_failed; ACCEPT-WP-10 |
| save_failed / retry_same_output → saving | WP-10 | J08 | EDGE::output_slot::save_failed::retry_same_output; ACCEPT-WP-10 |
| received / output_expired_unrecoverable → output_lost | WP-10 | J08 | EDGE::output_slot::received::output_expired_unrecoverable; ACCEPT-WP-10 |
| saving / output_expired_unrecoverable → output_lost | WP-10 | J08 | EDGE::output_slot::saving::output_expired_unrecoverable; ACCEPT-WP-10 |
| save_failed / output_expired_unrecoverable → output_lost | WP-10 | J08 | EDGE::output_slot::save_failed::output_expired_unrecoverable; ACCEPT-WP-10 |
| unknown / status_check → unknown | WP-11 | J04 | EDGE::output_slot::unknown::status_check; ACCEPT-WP-11 |
| cancelled / late_output → received | WP-11 | J11 | EDGE::output_slot::cancelled::late_output; ACCEPT-WP-11 |
| stored / duplicate_output → stored | WP-11 | J09 | EDGE::output_slot::stored::duplicate_output; ACCEPT-WP-11 |
| waiting / admit_existing_output → received | WP-17 | M07 | EDGE::output_slot::waiting::admit_existing_output; ACCEPT-WP-17 |
| waiting / pre_dispatch_refused → failed | WP-09 | P01 | EDGE::output_slot::waiting::pre_dispatch_refused; STATE-output_slot |
| running / proven_not_accepted_retry_allowed → waiting | WP-09 | J05 | EDGE::output_slot::running::proven_not_accepted_retry_allowed; STATE-output_slot |
| unknown / proven_not_accepted_retry_allowed → waiting | WP-09 | J05 | EDGE::output_slot::unknown::proven_not_accepted_retry_allowed; STATE-output_slot |
| failed / verified_late_output → received | WP-11 | J09 | EDGE::output_slot::failed::verified_late_output; ACCEPT-WP-11 |
| output_lost / verified_late_output → received | WP-11 | J09 | EDGE::output_slot::output_lost::verified_late_output; ACCEPT-WP-11 |
| stored / conflicting_extra_output → stored | WP-11 | J09 | EDGE::output_slot::stored::conflicting_extra_output; ACCEPT-WP-11 |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| waiting | WP-09 / STATE-output_slot | begin_copy, conflicting_extra_output, copied, copy_failed, duplicate_output, late_output, output_expired_unrecoverable, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check, verified_late_output |
| running | WP-09 / STATE-output_slot | admit_existing_output, begin_copy, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, output_expired_unrecoverable, pre_dispatch_refused, retry_same_output, status_check, verified_late_output |
| unknown | WP-11 / ACCEPT-WP-11 | admit_existing_output, begin_copy, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, output_expired_unrecoverable, pre_dispatch_refused, response_uncertain, retry_same_output, verified_late_output |
| received | WP-09 / STATE-output_slot | admit_existing_output, cancel_confirmed, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check, verified_late_output |
| saving | WP-10 / ACCEPT-WP-10 | admit_existing_output, begin_copy, cancel_confirmed, conflicting_extra_output, dispatch, duplicate_output, late_output, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check, verified_late_output |
| save_failed | WP-10 / ACCEPT-WP-10 | admit_existing_output, begin_copy, cancel_confirmed, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, status_check, verified_late_output |
| stored | WP-10 / ACCEPT-WP-10 | admit_existing_output, begin_copy, cancel_confirmed, copied, copy_failed, dispatch, late_output, output_expired_unrecoverable, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check, verified_late_output |
| failed | WP-09 / STATE-output_slot | admit_existing_output, begin_copy, cancel_confirmed, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, output_expired_unrecoverable, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check |
| output_lost | WP-10 / ACCEPT-WP-10 | admit_existing_output, begin_copy, cancel_confirmed, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, late_output, output_expired_unrecoverable, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check |
| cancelled | WP-11 / ACCEPT-WP-11 | admit_existing_output, begin_copy, cancel_confirmed, conflicting_extra_output, copied, copy_failed, dispatch, duplicate_output, output_expired_unrecoverable, pre_dispatch_refused, proven_not_accepted_retry_allowed, proven_provider_failure, provider_output, response_uncertain, retry_same_output, status_check, verified_late_output |

## Attachment

**Whole-group application conformance is ready after:** WP-10. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `pending` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::attachment::pending; STATE-attachment | Keep owed-attachment/media repair; add project and recovery-inbox destinations. |
| `attached` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::attachment::attached; STATE-attachment | Keep owed-attachment/media repair; add project and recovery-inbox destinations. |
| `failed` | WP-10 | EXTEND | `server/src/services/media-delivery/` | STATE::attachment::failed; STATE-attachment | Keep owed-attachment/media repair; add project and recovery-inbox destinations. |
| `destination_missing` | WP-10 | NEW | `server/src/services/media-delivery/` | STATE::attachment::destination_missing; STATE-attachment | Owner recovery inbox and generic missing-project association are new; media/receipt identity is retained. |
| `recovery_attached` | WP-10 | NEW | `server/src/services/media-delivery/` | STATE::attachment::recovery_attached; STATE-attachment | Owner recovery inbox and generic missing-project association are new; media/receipt identity is retained. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| pending / linked → attached | WP-10 | J06 | EDGE::attachment::pending::linked; STATE-attachment |
| pending / link_failed → failed | WP-10 | J06 | EDGE::attachment::pending::link_failed; STATE-attachment |
| pending / destination_unavailable → destination_missing | WP-10 | R07 | EDGE::attachment::pending::destination_unavailable; STATE-attachment |
| failed / destination_unavailable → destination_missing | WP-10 | R07 | EDGE::attachment::failed::destination_unavailable; STATE-attachment |
| failed / retry → pending | WP-10 | J08 | EDGE::attachment::failed::retry; STATE-attachment |
| destination_missing / project_restored → pending | WP-10 | R07 | EDGE::attachment::destination_missing::project_restored; STATE-attachment |
| attached / duplicate_ack → attached | WP-10 | J09 | EDGE::attachment::attached::duplicate_ack; STATE-attachment |
| pending / recovery_linked → recovery_attached | WP-10 | J06 | EDGE::attachment::pending::recovery_linked; STATE-attachment |
| failed / recovery_linked → recovery_attached | WP-10 | J06 | EDGE::attachment::failed::recovery_linked; STATE-attachment |
| destination_missing / recovery_linked → recovery_attached | WP-10 | J06 | EDGE::attachment::destination_missing::recovery_linked; STATE-attachment |
| recovery_attached / restore_original_project → pending | WP-10 | R09 | EDGE::attachment::recovery_attached::restore_original_project; STATE-attachment |
| recovery_attached / copy_to_chosen_project → recovery_attached | WP-10 | R09 | EDGE::attachment::recovery_attached::copy_to_chosen_project; STATE-attachment |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| pending | WP-10 / STATE-attachment | copy_to_chosen_project, duplicate_ack, project_restored, restore_original_project, retry |
| attached | WP-10 / STATE-attachment | copy_to_chosen_project, destination_unavailable, link_failed, linked, project_restored, recovery_linked, restore_original_project, retry |
| failed | WP-10 / STATE-attachment | copy_to_chosen_project, duplicate_ack, link_failed, linked, project_restored, restore_original_project |
| destination_missing | WP-10 / STATE-attachment | copy_to_chosen_project, destination_unavailable, duplicate_ack, link_failed, linked, restore_original_project, retry |
| recovery_attached | WP-10 / STATE-attachment | destination_unavailable, duplicate_ack, link_failed, linked, project_restored, recovery_linked, retry |

## Cancellation

**Whole-group application conformance is ready after:** WP-11. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `none` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::cancellation::none; STATE-cancellation | Durable provider evidence and cancellation facts are new; existing abort is insufficient. |
| `requested` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::cancellation::requested; STATE-cancellation | Durable provider evidence and cancellation facts are new; existing abort is insufficient. |
| `confirmed` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::cancellation::confirmed; STATE-cancellation | Durable provider evidence and cancellation facts are new; existing abort is insufficient. |
| `unable` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::cancellation::unable; STATE-cancellation | Durable provider evidence and cancellation facts are new; existing abort is insufficient. |
| `reconciling` | WP-11 | NEW | `server/src/services/creation-recovery/` | STATE::cancellation::reconciling; STATE-cancellation | Durable provider evidence and cancellation facts are new; existing abort is insufficient. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| none / request_cancel → requested | WP-11 | J10 | EDGE::cancellation::none::request_cancel; STATE-cancellation |
| requested / before_dispatch_confirmed → confirmed | WP-11 | J10 | EDGE::cancellation::requested::before_dispatch_confirmed; STATE-cancellation |
| requested / provider_confirmed → confirmed | WP-11 | J10 | EDGE::cancellation::requested::provider_confirmed; STATE-cancellation |
| requested / unsupported → unable | WP-11 | J10 | EDGE::cancellation::requested::unsupported; STATE-cancellation |
| requested / completion_won → unable | WP-11 | J11 | EDGE::cancellation::requested::completion_won; STATE-cancellation |
| requested / response_uncertain → requested | WP-11 | J11 | EDGE::cancellation::requested::response_uncertain; STATE-cancellation |
| confirmed / late_output → reconciling | WP-11 | J11 | EDGE::cancellation::confirmed::late_output; STATE-cancellation |
| reconciling / cancellation_still_valid → confirmed | WP-11 | J11 | EDGE::cancellation::reconciling::cancellation_still_valid; STATE-cancellation |
| reconciling / completion_verified → unable | WP-11 | J11 | EDGE::cancellation::reconciling::completion_verified; STATE-cancellation |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| none | WP-11 / STATE-cancellation | before_dispatch_confirmed, cancellation_still_valid, completion_verified, completion_won, late_output, provider_confirmed, response_uncertain, unsupported |
| requested | WP-11 / STATE-cancellation | cancellation_still_valid, completion_verified, late_output, request_cancel |
| confirmed | WP-11 / STATE-cancellation | before_dispatch_confirmed, cancellation_still_valid, completion_verified, completion_won, provider_confirmed, request_cancel, response_uncertain, unsupported |
| unable | WP-11 / STATE-cancellation | before_dispatch_confirmed, cancellation_still_valid, completion_verified, completion_won, late_output, provider_confirmed, request_cancel, response_uncertain, unsupported |
| reconciling | WP-11 / STATE-cancellation | before_dispatch_confirmed, completion_won, late_output, provider_confirmed, request_cancel, response_uncertain, unsupported |

## Upload

**Whole-group application conformance is ready after:** WP-15. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `staged` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::staged; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `uploading` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::uploading; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `verifying` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::verifying; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `ready` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::ready; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `failed` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::failed; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `rejected` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::rejected; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `missing_bytes` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::missing_bytes; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |
| `cancelled` | WP-15 | EXTEND | `client/src/features/project-imports/` | STATE::upload::cancelled; STATE-upload | Keep owned admission; add durable staging, role/fingerprint/reselection and shared-upload semantics. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| staged / start → uploading | WP-15 | M01 | EDGE::upload::staged::start; STATE-upload |
| uploading / transferred → verifying | WP-15 | M01 | EDGE::upload::uploading::transferred; STATE-upload |
| verifying / validated → ready | WP-15 | M01 | EDGE::upload::verifying::validated; STATE-upload |
| uploading / transport_failed → failed | WP-15 | M01 | EDGE::upload::uploading::transport_failed; STATE-upload |
| verifying / transport_failed → failed | WP-15 | M01 | EDGE::upload::verifying::transport_failed; STATE-upload |
| staged / invalid → rejected | WP-15 | M01 | EDGE::upload::staged::invalid; STATE-upload |
| verifying / invalid → rejected | WP-15 | M01 | EDGE::upload::verifying::invalid; STATE-upload |
| failed / retry → uploading | WP-15 | M01 | EDGE::upload::failed::retry; STATE-upload |
| staged / bytes_missing → missing_bytes | WP-15 | M02 | EDGE::upload::staged::bytes_missing; STATE-upload |
| failed / bytes_missing → missing_bytes | WP-15 | M02 | EDGE::upload::failed::bytes_missing; STATE-upload |
| missing_bytes / matching_file_reselected → staged | WP-15 | M02 | EDGE::upload::missing_bytes::matching_file_reselected; STATE-upload |
| missing_bytes / choose_different_file → staged | WP-15 | M02 | EDGE::upload::missing_bytes::choose_different_file; STATE-upload |
| rejected / choose_different_file → staged | WP-15 | M02 | EDGE::upload::rejected::choose_different_file; STATE-upload |
| staged / cancel → cancelled | WP-15 | M03 | EDGE::upload::staged::cancel; STATE-upload |
| uploading / cancel → cancelled | WP-15 | M03 | EDGE::upload::uploading::cancel; STATE-upload |
| verifying / cancel → cancelled | WP-15 | M03 | EDGE::upload::verifying::cancel; STATE-upload |
| failed / cancel → cancelled | WP-15 | M03 | EDGE::upload::failed::cancel; STATE-upload |
| cancelled / late_upload_ready → ready | WP-15 | M03 | EDGE::upload::cancelled::late_upload_ready; STATE-upload |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| staged | WP-15 / STATE-upload | choose_different_file, late_upload_ready, matching_file_reselected, retry, transferred, transport_failed, validated |
| uploading | WP-15 / STATE-upload | bytes_missing, choose_different_file, invalid, late_upload_ready, matching_file_reselected, retry, start, validated |
| verifying | WP-15 / STATE-upload | bytes_missing, choose_different_file, late_upload_ready, matching_file_reselected, retry, start, transferred |
| ready | WP-15 / STATE-upload | bytes_missing, cancel, choose_different_file, invalid, late_upload_ready, matching_file_reselected, retry, start, transferred, transport_failed, validated |
| failed | WP-15 / STATE-upload | choose_different_file, invalid, late_upload_ready, matching_file_reselected, start, transferred, transport_failed, validated |
| rejected | WP-15 / STATE-upload | bytes_missing, cancel, invalid, late_upload_ready, matching_file_reselected, retry, start, transferred, transport_failed, validated |
| missing_bytes | WP-15 / STATE-upload | bytes_missing, cancel, invalid, late_upload_ready, retry, start, transferred, transport_failed, validated |
| cancelled | WP-15 / STATE-upload | bytes_missing, cancel, choose_different_file, invalid, matching_file_reselected, retry, start, transferred, transport_failed, validated |

## Media access

**Whole-group application conformance is ready after:** WP-16. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `unloaded` | WP-16 | KEEP | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::unloaded; STATE-media_access | Retain owned-handle refresh/access boundary; bind it to exact version and expose errors separately. |
| `loading` | WP-16 | KEEP | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::loading; STATE-media_access | Retain owned-handle refresh/access boundary; bind it to exact version and expose errors separately. |
| `ready` | WP-16 | KEEP | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::ready; STATE-media_access | Retain owned-handle refresh/access boundary; bind it to exact version and expose errors separately. |
| `refreshing` | WP-16 | KEEP | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::refreshing; STATE-media_access | Retain owned-handle refresh/access boundary; bind it to exact version and expose errors separately. |
| `unavailable` | WP-16 | EXTEND | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::unavailable; STATE-media_access | Retain actual authorization failure while adding accurate version/history presentation and recovery actions. |
| `denied` | WP-16 | EXTEND | `client/src/services/media/MediaUrlResolver.ts` | STATE::media_access::denied; STATE-media_access | Retain actual authorization failure while adding accurate version/history presentation and recovery actions. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| unloaded / open → loading | WP-16 | M04 | EDGE::media_access::unloaded::open; STATE-media_access |
| loading / loaded → ready | WP-16 | M04 | EDGE::media_access::loading::loaded; STATE-media_access |
| loading / denied → denied | WP-16 | M04 | EDGE::media_access::loading::denied; STATE-media_access |
| ready / denied → denied | WP-16 | M04 | EDGE::media_access::ready::denied; STATE-media_access |
| refreshing / denied → denied | WP-16 | M04 | EDGE::media_access::refreshing::denied; STATE-media_access |
| loading / fetch_failed → unavailable | WP-16 | M04 | EDGE::media_access::loading::fetch_failed; STATE-media_access |
| refreshing / fetch_failed → unavailable | WP-16 | M04 | EDGE::media_access::refreshing::fetch_failed; STATE-media_access |
| ready / url_expired → refreshing | WP-16 | M04 | EDGE::media_access::ready::url_expired; STATE-media_access |
| refreshing / refreshed → ready | WP-16 | M04 | EDGE::media_access::refreshing::refreshed; STATE-media_access |
| unavailable / retry → loading | WP-16 | M04 | EDGE::media_access::unavailable::retry; STATE-media_access |
| denied / access_restored → loading | WP-16 | M04 | EDGE::media_access::denied::access_restored; STATE-media_access |
| unloaded / close → unloaded | WP-16 | M04 | EDGE::media_access::unloaded::close; STATE-media_access |
| loading / close → unloaded | WP-16 | M04 | EDGE::media_access::loading::close; STATE-media_access |
| ready / close → unloaded | WP-16 | M04 | EDGE::media_access::ready::close; STATE-media_access |
| refreshing / close → unloaded | WP-16 | M04 | EDGE::media_access::refreshing::close; STATE-media_access |
| unavailable / close → unloaded | WP-16 | M04 | EDGE::media_access::unavailable::close; STATE-media_access |
| denied / close → unloaded | WP-16 | M04 | EDGE::media_access::denied::close; STATE-media_access |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| unloaded | WP-16 / STATE-media_access | access_restored, denied, fetch_failed, loaded, refreshed, retry, url_expired |
| loading | WP-16 / STATE-media_access | access_restored, open, refreshed, retry, url_expired |
| ready | WP-16 / STATE-media_access | access_restored, fetch_failed, loaded, open, refreshed, retry |
| refreshing | WP-16 / STATE-media_access | access_restored, loaded, open, retry, url_expired |
| unavailable | WP-16 / STATE-media_access | access_restored, denied, fetch_failed, loaded, open, refreshed, url_expired |
| denied | WP-16 / STATE-media_access | denied, fetch_failed, loaded, open, refreshed, retry, url_expired |

## Playback

**Whole-group application conformance is ready after:** WP-16. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `stopped` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::stopped; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |
| `playing` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::playing; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |
| `paused` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::paused; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |
| `buffering` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::buffering; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |
| `ended` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::ended; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |
| `error` | WP-16 | KEEP | `client/src/features/workspace-shell/components/SelectedResult.tsx` | STATE::playback::error; STATE-playback | Retain decoded player/fullscreen/seek behavior; prove independent viewer state. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| stopped / play_decoded → playing | WP-16 | M05 | EDGE::playback::stopped::play_decoded; STATE-playback |
| paused / play_decoded → playing | WP-16 | M05 | EDGE::playback::paused::play_decoded; STATE-playback |
| ended / play_decoded → playing | WP-16 | M05 | EDGE::playback::ended::play_decoded; STATE-playback |
| playing / pause → paused | WP-16 | M05 | EDGE::playback::playing::pause; STATE-playback |
| playing / buffering → buffering | WP-16 | M05 | EDGE::playback::playing::buffering; STATE-playback |
| buffering / resumed → playing | WP-16 | M05 | EDGE::playback::buffering::resumed; STATE-playback |
| buffering / pause → paused | WP-16 | M05 | EDGE::playback::buffering::pause; STATE-playback |
| playing / ended → ended | WP-16 | M05 | EDGE::playback::playing::ended; STATE-playback |
| stopped / autoplay_refused → paused | WP-16 | M05 | EDGE::playback::stopped::autoplay_refused; STATE-playback |
| stopped / decode_failed → error | WP-16 | M05 | EDGE::playback::stopped::decode_failed; STATE-playback |
| playing / decode_failed → error | WP-16 | M05 | EDGE::playback::playing::decode_failed; STATE-playback |
| paused / decode_failed → error | WP-16 | M05 | EDGE::playback::paused::decode_failed; STATE-playback |
| buffering / decode_failed → error | WP-16 | M05 | EDGE::playback::buffering::decode_failed; STATE-playback |
| error / retry → stopped | WP-16 | M05 | EDGE::playback::error::retry; STATE-playback |
| stopped / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::stopped::change_viewed_version; STATE-playback |
| playing / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::playing::change_viewed_version; STATE-playback |
| paused / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::paused::change_viewed_version; STATE-playback |
| buffering / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::buffering::change_viewed_version; STATE-playback |
| ended / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::ended::change_viewed_version; STATE-playback |
| error / change_viewed_version → stopped | WP-16 | M05 | EDGE::playback::error::change_viewed_version; STATE-playback |
| playing / fullscreen_change → playing | WP-16 | M05 | EDGE::playback::playing::fullscreen_change; STATE-playback |
| paused / fullscreen_change → paused | WP-16 | M05 | EDGE::playback::paused::fullscreen_change; STATE-playback |
| buffering / fullscreen_change → buffering | WP-16 | M05 | EDGE::playback::buffering::fullscreen_change; STATE-playback |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| stopped | WP-16 / STATE-playback | buffering, ended, fullscreen_change, pause, resumed, retry |
| playing | WP-16 / STATE-playback | autoplay_refused, play_decoded, resumed, retry |
| paused | WP-16 / STATE-playback | autoplay_refused, buffering, ended, pause, resumed, retry |
| buffering | WP-16 / STATE-playback | autoplay_refused, buffering, ended, play_decoded, retry |
| ended | WP-16 / STATE-playback | autoplay_refused, buffering, decode_failed, ended, fullscreen_change, pause, resumed, retry |
| error | WP-16 / STATE-playback | autoplay_refused, buffering, decode_failed, ended, fullscreen_change, pause, play_decoded, resumed |

## Sketch

**Whole-group application conformance is ready after:** WP-17. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `off` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::off; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |
| `connecting` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::connecting; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |
| `live` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::live; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |
| `paused` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::paused; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |
| `error` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::error; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |
| `limit_reached` | WP-17 | EXTEND | `client/src/features/realtime-sketch/` | STATE::sketch::limit_reached; STATE-sketch | Keep bounded loop/output snapshots; add persistent drawing/action identity and new handoff semantics. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| off / resume → connecting | WP-17 | M06 | EDGE::sketch::off::resume; STATE-sketch |
| connecting / connected → live | WP-17 | M06 | EDGE::sketch::connecting::connected; STATE-sketch |
| connecting / preview_failed → error | WP-17 | M06 | EDGE::sketch::connecting::preview_failed; STATE-sketch |
| live / preview_failed → error | WP-17 | M06 | EDGE::sketch::live::preview_failed; STATE-sketch |
| error / retry → connecting | WP-17 | M06 | EDGE::sketch::error::retry; STATE-sketch |
| live / pause → paused | WP-17 | M06 | EDGE::sketch::live::pause; STATE-sketch |
| error / pause → paused | WP-17 | M06 | EDGE::sketch::error::pause; STATE-sketch |
| paused / resume → connecting | WP-17 | M06 | EDGE::sketch::paused::resume; STATE-sketch |
| connecting / allowance_exhausted → limit_reached | WP-17 | M08 | EDGE::sketch::connecting::allowance_exhausted; STATE-sketch |
| live / allowance_exhausted → limit_reached | WP-17 | M08 | EDGE::sketch::live::allowance_exhausted; STATE-sketch |
| limit_reached / allowance_reset → paused | WP-17 | M08 | EDGE::sketch::limit_reached::allowance_reset; STATE-sketch |
| live / accept_displayed → live | WP-17 | M07 | EDGE::sketch::live::accept_displayed; STATE-sketch |
| paused / accept_displayed → paused | WP-17 | M07 | EDGE::sketch::paused::accept_displayed; STATE-sketch |
| error / accept_displayed → error | WP-17 | M07 | EDGE::sketch::error::accept_displayed; STATE-sketch |
| off / leave → off | WP-17 | M06 | EDGE::sketch::off::leave; STATE-sketch |
| connecting / leave → off | WP-17 | M06 | EDGE::sketch::connecting::leave; STATE-sketch |
| live / leave → off | WP-17 | M06 | EDGE::sketch::live::leave; STATE-sketch |
| paused / leave → off | WP-17 | M06 | EDGE::sketch::paused::leave; STATE-sketch |
| error / leave → off | WP-17 | M06 | EDGE::sketch::error::leave; STATE-sketch |
| limit_reached / leave → off | WP-17 | M06 | EDGE::sketch::limit_reached::leave; STATE-sketch |
| limit_reached / accept_displayed → limit_reached | WP-17 | M07 | EDGE::sketch::limit_reached::accept_displayed; STATE-sketch |
| connecting / accept_displayed → connecting | WP-17 | M07 | EDGE::sketch::connecting::accept_displayed; STATE-sketch |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| off | WP-17 / STATE-sketch | accept_displayed, allowance_exhausted, allowance_reset, connected, pause, preview_failed, retry |
| connecting | WP-17 / STATE-sketch | allowance_reset, pause, resume, retry |
| live | WP-17 / STATE-sketch | allowance_reset, connected, resume, retry |
| paused | WP-17 / STATE-sketch | allowance_exhausted, allowance_reset, connected, pause, preview_failed, retry |
| error | WP-17 / STATE-sketch | allowance_exhausted, allowance_reset, connected, preview_failed, resume |
| limit_reached | WP-17 / STATE-sketch | allowance_exhausted, connected, pause, preview_failed, resume, retry |

## Video edit

**Whole-group application conformance is ready after:** WP-19. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `empty` | WP-19 | NEW | `shared/video-edit/` | STATE::video_edit::empty; STATE-video_edit | No active composition engine or final-video editor exists. |
| `valid` | WP-19 | NEW | `shared/video-edit/` | STATE::video_edit::valid; STATE-video_edit | No active composition engine or final-video editor exists. |
| `invalid` | WP-19 | NEW | `shared/video-edit/` | STATE::video_edit::invalid; STATE-video_edit | No active composition engine or final-video editor exists. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| empty / valid_change → valid | WP-19 | E02 | EDGE::video_edit::empty::valid_change; STATE-video_edit |
| valid / valid_change → valid | WP-19 | E02 | EDGE::video_edit::valid::valid_change; STATE-video_edit |
| invalid / valid_change → valid | WP-19 | E02 | EDGE::video_edit::invalid::valid_change; STATE-video_edit |
| empty / invalid_change → invalid | WP-19 | E02 | EDGE::video_edit::empty::invalid_change; STATE-video_edit |
| valid / invalid_change → invalid | WP-19 | E02 | EDGE::video_edit::valid::invalid_change; STATE-video_edit |
| invalid / invalid_change → invalid | WP-19 | E02 | EDGE::video_edit::invalid::invalid_change; STATE-video_edit |
| valid / remove_all → empty | WP-19 | E02 | EDGE::video_edit::valid::remove_all; STATE-video_edit |
| invalid / remove_all → empty | WP-19 | E02 | EDGE::video_edit::invalid::remove_all; STATE-video_edit |
| valid / source_unavailable → invalid | WP-19 | E07 | EDGE::video_edit::valid::source_unavailable; STATE-video_edit |
| valid / restore_valid_revision → valid | WP-19 | D09 | EDGE::video_edit::valid::restore_valid_revision; STATE-video_edit |
| invalid / restore_valid_revision → valid | WP-19 | D09 | EDGE::video_edit::invalid::restore_valid_revision; STATE-video_edit |
| valid / restore_invalid_revision → invalid | WP-19 | D09 | EDGE::video_edit::valid::restore_invalid_revision; STATE-video_edit |
| invalid / restore_invalid_revision → invalid | WP-19 | D09 | EDGE::video_edit::invalid::restore_invalid_revision; STATE-video_edit |
| valid / export_snapshot → valid | WP-19 | E04 | EDGE::video_edit::valid::export_snapshot; STATE-video_edit |
| valid / undo_to_empty → empty | WP-19 | D07 | EDGE::video_edit::valid::undo_to_empty; STATE-video_edit |
| invalid / undo_to_empty → empty | WP-19 | D07 | EDGE::video_edit::invalid::undo_to_empty; STATE-video_edit |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| empty | WP-19 / STATE-video_edit | export_snapshot, remove_all, restore_invalid_revision, restore_valid_revision, source_unavailable, undo_to_empty |
| valid | WP-19 / STATE-video_edit | None in declared vocabulary; unknown events still reject. |
| invalid | WP-19 / STATE-video_edit | export_snapshot, source_unavailable |

## Sharing

**Whole-group application conformance is ready after:** WP-18. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `private` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::private; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `publishing` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::publishing; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `publication_unknown` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::publication_unknown; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `published` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::published; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `revoking` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::revoking; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `revocation_unknown` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::revocation_unknown; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |
| `revoked` | WP-18 | REPLACE | `server/src/services/share/` | STATE::sharing::revoked; STATE-sharing | Keep immutable legacy media records; replace uncontrolled publication lifecycle and add revocation receipts. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| private / publish → publishing | WP-18 | L06 | EDGE::sharing::private::publish; STATE-sharing |
| publishing / confirmed → published | WP-18 | L06 | EDGE::sharing::publishing::confirmed; STATE-sharing |
| publishing / response_lost → publication_unknown | WP-18 | L07 | EDGE::sharing::publishing::response_lost; STATE-sharing |
| publishing / rejected → private | WP-18 | L06 | EDGE::sharing::publishing::rejected; STATE-sharing |
| publication_unknown / receipt_found → published | WP-18 | L07 | EDGE::sharing::publication_unknown::receipt_found; STATE-sharing |
| publication_unknown / definitely_absent → publishing | WP-18 | L07 | EDGE::sharing::publication_unknown::definitely_absent; STATE-sharing |
| published / revoke → revoking | WP-18 | L06 | EDGE::sharing::published::revoke; STATE-sharing |
| revoking / confirmed → revoked | WP-18 | L06 | EDGE::sharing::revoking::confirmed; STATE-sharing |
| revoking / response_lost → revocation_unknown | WP-18 | L07 | EDGE::sharing::revoking::response_lost; STATE-sharing |
| revocation_unknown / confirmed_revoked → revoked | WP-18 | L07 | EDGE::sharing::revocation_unknown::confirmed_revoked; STATE-sharing |
| revocation_unknown / still_active → revoking | WP-18 | L07 | EDGE::sharing::revocation_unknown::still_active; STATE-sharing |
| published / project_trashed → revoked | WP-18 | L07 | EDGE::sharing::published::project_trashed; STATE-sharing |
| publishing / project_trashed → revoked | WP-18 | L07 | EDGE::sharing::publishing::project_trashed; STATE-sharing |
| publication_unknown / project_trashed → revoked | WP-18 | L07 | EDGE::sharing::publication_unknown::project_trashed; STATE-sharing |
| revoking / project_trashed → revoked | WP-18 | L07 | EDGE::sharing::revoking::project_trashed; STATE-sharing |
| revocation_unknown / project_trashed → revoked | WP-18 | L07 | EDGE::sharing::revocation_unknown::project_trashed; STATE-sharing |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| private | WP-18 / STATE-sharing | confirmed, confirmed_revoked, definitely_absent, project_trashed, receipt_found, rejected, response_lost, revoke, still_active |
| publishing | WP-18 / STATE-sharing | confirmed_revoked, definitely_absent, publish, receipt_found, revoke, still_active |
| publication_unknown | WP-18 / STATE-sharing | confirmed, confirmed_revoked, publish, rejected, response_lost, revoke, still_active |
| published | WP-18 / STATE-sharing | confirmed, confirmed_revoked, definitely_absent, publish, receipt_found, rejected, response_lost, still_active |
| revoking | WP-18 / STATE-sharing | confirmed_revoked, definitely_absent, publish, receipt_found, rejected, revoke, still_active |
| revocation_unknown | WP-18 / STATE-sharing | confirmed, definitely_absent, publish, receipt_found, rejected, response_lost, revoke |
| revoked | WP-18 / STATE-sharing | confirmed, confirmed_revoked, definitely_absent, project_trashed, publish, receipt_found, rejected, response_lost, revoke, still_active |

## Usage

**Whole-group application conformance is ready after:** WP-22. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `not_required` | WP-22 | KEEP | `server/src/services/usage/` | STATE::usage::not_required; STATE-usage | Keep current zero-customer-credit mode; prove it through the new authorization port without reviving legacy charge paths. |
| `quoted` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::quoted; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `quote_invalid` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::quote_invalid; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `reserving` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::reserving; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `reserved` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::reserved; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `reconciling` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::reconciling; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `settled` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::settled; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `released` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::released; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |
| `unavailable` | WP-22 | NEW | `server/src/services/usage/` | STATE::usage::unavailable; STATE-usage | Customer usage ledger is new; existing provider caps/refunds have different authority. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| not_required / paid_mode_enabled → quoted | WP-22 | P01 | EDGE::usage::not_required::paid_mode_enabled; STATE-usage |
| quoted / quote_expired → quote_invalid | WP-22 | P01 | EDGE::usage::quoted::quote_expired; STATE-usage |
| quoted / draft_changed → quote_invalid | WP-22 | P01 | EDGE::usage::quoted::draft_changed; STATE-usage |
| quote_invalid / reviewed_new_quote → quoted | WP-22 | P01 | EDGE::usage::quote_invalid::reviewed_new_quote; STATE-usage |
| quoted / accept → reserving | WP-22 | P02 | EDGE::usage::quoted::accept; STATE-usage |
| reserving / reserved → reserved | WP-22 | P02 | EDGE::usage::reserving::reserved; STATE-usage |
| reserving / denied → unavailable | WP-22 | P02 | EDGE::usage::reserving::denied; STATE-usage |
| reserving / response_uncertain → reconciling | WP-22 | P02 | EDGE::usage::reserving::response_uncertain; STATE-usage |
| reserved / delivered_settlement → settled | WP-22 | P03 | EDGE::usage::reserved::delivered_settlement; STATE-usage |
| reserved / no_deliverable_release → released | WP-22 | P03 | EDGE::usage::reserved::no_deliverable_release; STATE-usage |
| reserved / settlement_uncertain → reconciling | WP-22 | P04 | EDGE::usage::reserved::settlement_uncertain; STATE-usage |
| reconciling / verified_reserved → reserved | WP-22 | P02 | EDGE::usage::reconciling::verified_reserved; STATE-usage |
| reconciling / verified_settled → settled | WP-22 | P04 | EDGE::usage::reconciling::verified_settled; STATE-usage |
| reconciling / verified_released → released | WP-22 | P04 | EDGE::usage::reconciling::verified_released; STATE-usage |
| unavailable / refreshed_entitlement → quoted | WP-22 | P01 | EDGE::usage::unavailable::refreshed_entitlement; STATE-usage |
| settled / duplicate_settlement → settled | WP-22 | P02 | EDGE::usage::settled::duplicate_settlement; STATE-usage |
| released / duplicate_release → released | WP-22 | P02 | EDGE::usage::released::duplicate_release; STATE-usage |
| reserved / recovery_deadline_release → released | WP-22 | J13 | EDGE::usage::reserved::recovery_deadline_release; STATE-usage |
| reconciling / recovery_deadline_release → released | WP-22 | J13 | EDGE::usage::reconciling::recovery_deadline_release; STATE-usage |
| released / late_output → released | WP-22 | J11 | EDGE::usage::released::late_output; STATE-usage |
| reserved / confirmed_cancel_release → released | WP-22 | J11 | EDGE::usage::reserved::confirmed_cancel_release; STATE-usage |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| not_required | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, quote_expired, recovery_deadline_release, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| quoted | WP-22 / STATE-usage | confirmed_cancel_release, delivered_settlement, denied, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, paid_mode_enabled, recovery_deadline_release, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| quote_invalid | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, paid_mode_enabled, quote_expired, recovery_deadline_release, refreshed_entitlement, reserved, response_uncertain, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| reserving | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, draft_changed, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, paid_mode_enabled, quote_expired, recovery_deadline_release, refreshed_entitlement, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| reserved | WP-22 / STATE-usage | accept, denied, draft_changed, duplicate_release, duplicate_settlement, late_output, paid_mode_enabled, quote_expired, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, verified_released, verified_reserved, verified_settled |
| reconciling | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, paid_mode_enabled, quote_expired, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain |
| settled | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_release, late_output, no_deliverable_release, paid_mode_enabled, quote_expired, recovery_deadline_release, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| released | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_settlement, no_deliverable_release, paid_mode_enabled, quote_expired, recovery_deadline_release, refreshed_entitlement, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |
| unavailable | WP-22 / STATE-usage | accept, confirmed_cancel_release, delivered_settlement, denied, draft_changed, duplicate_release, duplicate_settlement, late_output, no_deliverable_release, paid_mode_enabled, quote_expired, recovery_deadline_release, reserved, response_uncertain, reviewed_new_quote, settlement_uncertain, verified_released, verified_reserved, verified_settled |

## Clarification

**Whole-group application conformance is ready after:** WP-14. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `waiting` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::waiting; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |
| `answering` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::answering; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |
| `proposal_ready` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::proposal_ready; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |
| `stale_proposal` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::stale_proposal; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |
| `applied` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::applied; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |
| `dismissed` | WP-14 | NEW | `server/src/services/creation-assistance/` | STATE::clarification::dismissed; STATE-clarification | Persist exact question/target/proposal identity and handle stale/frozen targets. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| waiting / answer → answering | WP-14 | C09 | EDGE::clarification::waiting::answer; STATE-clarification |
| answering / saved_current → proposal_ready | WP-14 | C09 | EDGE::clarification::answering::saved_current; STATE-clarification |
| answering / saved_stale → stale_proposal | WP-14 | C09 | EDGE::clarification::answering::saved_stale; STATE-clarification |
| answering / response_uncertain → answering | WP-14 | J02 | EDGE::clarification::answering::response_uncertain; STATE-clarification |
| proposal_ready / draft_changed → stale_proposal | WP-14 | C09 | EDGE::clarification::proposal_ready::draft_changed; STATE-clarification |
| proposal_ready / apply → applied | WP-14 | C09 | EDGE::clarification::proposal_ready::apply; STATE-clarification |
| stale_proposal / apply_as_new_draft → applied | WP-14 | C09 | EDGE::clarification::stale_proposal::apply_as_new_draft; STATE-clarification |
| waiting / dismiss → dismissed | WP-14 | C09 | EDGE::clarification::waiting::dismiss; STATE-clarification |
| proposal_ready / dismiss → dismissed | WP-14 | C09 | EDGE::clarification::proposal_ready::dismiss; STATE-clarification |
| stale_proposal / dismiss → dismissed | WP-14 | C09 | EDGE::clarification::stale_proposal::dismiss; STATE-clarification |
| dismissed / reopen → waiting | WP-14 | C09 | EDGE::clarification::dismissed::reopen; STATE-clarification |
| proposal_ready / target_not_editable → stale_proposal | WP-14 | C08 | EDGE::clarification::proposal_ready::target_not_editable; STATE-clarification |
| answering / saved_target_locked → stale_proposal | WP-14 | C08 | EDGE::clarification::answering::saved_target_locked; STATE-clarification |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| waiting | WP-14 / STATE-clarification | apply, apply_as_new_draft, draft_changed, reopen, response_uncertain, saved_current, saved_stale, saved_target_locked, target_not_editable |
| answering | WP-14 / STATE-clarification | answer, apply, apply_as_new_draft, dismiss, draft_changed, reopen, target_not_editable |
| proposal_ready | WP-14 / STATE-clarification | answer, apply_as_new_draft, reopen, response_uncertain, saved_current, saved_stale, saved_target_locked |
| stale_proposal | WP-14 / STATE-clarification | answer, apply, draft_changed, reopen, response_uncertain, saved_current, saved_stale, saved_target_locked, target_not_editable |
| applied | WP-14 / STATE-clarification | answer, apply, apply_as_new_draft, dismiss, draft_changed, reopen, response_uncertain, saved_current, saved_stale, saved_target_locked, target_not_editable |
| dismissed | WP-14 / STATE-clarification | answer, apply, apply_as_new_draft, dismiss, draft_changed, response_uncertain, saved_current, saved_stale, saved_target_locked, target_not_editable |

## Download

**Whole-group application conformance is ready after:** WP-16. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `idle` | WP-16 | EXTEND | `client/src/features/project-workspace/media/` | STATE::download::idle; STATE-download | Keep exact-file transfer; distinguish resolving/started/failed without claiming disk completion. |
| `resolving` | WP-16 | EXTEND | `client/src/features/project-workspace/media/` | STATE::download::resolving; STATE-download | Keep exact-file transfer; distinguish resolving/started/failed without claiming disk completion. |
| `started` | WP-16 | EXTEND | `client/src/features/project-workspace/media/` | STATE::download::started; STATE-download | Keep exact-file transfer; distinguish resolving/started/failed without claiming disk completion. |
| `failed` | WP-16 | EXTEND | `client/src/features/project-workspace/media/` | STATE::download::failed; STATE-download | Keep exact-file transfer; distinguish resolving/started/failed without claiming disk completion. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| idle / download → resolving | WP-16 | L08 | EDGE::download::idle::download; STATE-download |
| resolving / transfer_started → started | WP-16 | L08 | EDGE::download::resolving::transfer_started; STATE-download |
| resolving / transfer_failed → failed | WP-16 | L08 | EDGE::download::resolving::transfer_failed; STATE-download |
| started / transfer_failed → failed | WP-16 | L08 | EDGE::download::started::transfer_failed; STATE-download |
| failed / retry_same_version → resolving | WP-16 | L08 | EDGE::download::failed::retry_same_version; STATE-download |
| started / download_again → resolving | WP-16 | L08 | EDGE::download::started::download_again; STATE-download |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| idle | WP-16 / STATE-download | download_again, retry_same_version, transfer_failed, transfer_started |
| resolving | WP-16 / STATE-download | download, download_again, retry_same_version |
| started | WP-16 / STATE-download | download, retry_same_version, transfer_started |
| failed | WP-16 / STATE-download | download, download_again, transfer_failed, transfer_started |

## Assistant response

**Whole-group application conformance is ready after:** WP-14. Their transitive prerequisites apply. Earlier local state tests do not close the full group before its later handlers exist.

<!-- prettier-ignore -->
| State | Owner | Disposition | Implementation boundary | Required test | Rationale |
| --- | --- | --- | --- | --- | --- |
| `streaming` | WP-14 | EXTEND | `server/src/services/creation-assistance/` | STATE::assistant_response::streaming; STATE-assistant_response | Keep aiService and NDJSON transport; add durable response/proposal recovery. |
| `interrupted` | WP-14 | EXTEND | `server/src/services/creation-assistance/` | STATE::assistant_response::interrupted; STATE-assistant_response | Keep aiService and NDJSON transport; add durable response/proposal recovery. |
| `saved` | WP-14 | EXTEND | `server/src/services/creation-assistance/` | STATE::assistant_response::saved; STATE-assistant_response | Keep aiService and NDJSON transport; add durable response/proposal recovery. |
| `failed` | WP-14 | EXTEND | `server/src/services/creation-assistance/` | STATE::assistant_response::failed; STATE-assistant_response | Keep aiService and NDJSON transport; add durable response/proposal recovery. |

<!-- prettier-ignore -->
| From / event → to | Owner | Rule | Test ID / suite |
| --- | --- | --- | --- |
| streaming / final_saved → saved | WP-14 | J14 | EDGE::assistant_response::streaming::final_saved; STATE-assistant_response |
| streaming / response_uncertain → interrupted | WP-14 | J14 | EDGE::assistant_response::streaming::response_uncertain; STATE-assistant_response |
| interrupted / resume_stream → streaming | WP-14 | J14 | EDGE::assistant_response::interrupted::resume_stream; STATE-assistant_response |
| interrupted / final_found → saved | WP-14 | J14 | EDGE::assistant_response::interrupted::final_found; STATE-assistant_response |
| streaming / definitive_failure → failed | WP-14 | J14 | EDGE::assistant_response::streaming::definitive_failure; STATE-assistant_response |
| interrupted / definitive_failure → failed | WP-14 | J14 | EDGE::assistant_response::interrupted::definitive_failure; STATE-assistant_response |

**Every rejected pair, by starting state.** Each event below requires a rejected no-op with unchanged state/content/inputs, zero provider/process/media dispatch and zero usage mutation. Test IDs are `REJECT::<model>::<state>::<event>`.

<!-- prettier-ignore -->
| State | Owner / suite | Events that must reject |
| --- | --- | --- |
| streaming | WP-14 / STATE-assistant_response | final_found, resume_stream |
| interrupted | WP-14 / STATE-assistant_response | final_saved, response_uncertain |
| saved | WP-14 / STATE-assistant_response | definitive_failure, final_found, final_saved, response_uncertain, resume_stream |
| failed | WP-14 / STATE-assistant_response | definitive_failure, final_found, final_saved, response_uncertain, resume_stream |

## Shared state groups used by different actions

Test each real adapter, including its inapplicable-event rejections and side effects. A generic state reducer passing once is insufficient for export, Sketch, assistance and video generation.

<!-- prettier-ignore -->
| Action adapter | Owner | State groups | Required suite |
| --- | --- | --- | --- |
| image_or_video_generation | WP-09 | submission, request, output_slot, attachment, cancellation, usage | ACTOR-image_or_video_generation |
| export | WP-21 | submission, request, output_slot, attachment, cancellation, usage | ACTOR-export |
| text_assistance | WP-14 | submission, assistant_response, clarification | ACTOR-text_assistance |
| sketch_acceptance | WP-17 | submission, output_slot, attachment | ACTOR-sketch_acceptance |
| video_edit_save | WP-19 | video_edit, draft_save | ACTOR-video_edit_save |
