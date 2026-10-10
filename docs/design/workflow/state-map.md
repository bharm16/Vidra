# Workflow state map

Generated from `state-model.json`. Edit that file, then run `python3 docs/design/workflow/validate_contract.py --write`.

**22 state groups · 126 named states · 348 declared transitions · 1380 state/event pairs.**

Every pair without a declared transition is an explicit rejected no-op. Unknown events also reject without mutation. User commands show a reason; stale/system observations preserve state and are logged. Guards and cross-group effects are defined by the referenced rules in [the contract](workflow-state-contract.md).

These groups are independent and can coexist. Export uses the submission/request/output/attachment/cancellation/usage groups with a captured video-edit revision. There is no global project stage.

The checker establishes finite-model structure and trace behavior. Cross-group acceptance cases remain specifications until application tests implement them.

## Project

Initial state: `local`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `local` | New work exists only on this device; generation is unavailable. |
| `creating` | An idempotent project-creation request is being reconciled. |
| `ready` | The owner can work in this project. |
| `load_failed` | Project loading failed; retry the same identity. |
| `inaccessible` | Authorization is missing; cached private content is hidden. |
| `trashing` | Trash is requested; new work is blocked while the server decides. |
| `trashed` | Project and work are retained but read-only; public links are denied. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `local` | `create` | `creating` | H01 |
| `creating` | `created` | `ready` | H01 |
| `creating` | `response_lost` | `creating` | J02 |
| `creating` | `create_rejected` | `local` | J03 |
| `ready` | `load_failed` | `load_failed` | R07 |
| `load_failed` | `loaded` | `ready` | R07 |
| `ready` | `access_denied` | `inaccessible` | R07 |
| `load_failed` | `access_denied` | `inaccessible` | R07 |
| `inaccessible` | `access_restored` | `ready` | R05 |
| `ready` | `trash` | `trashing` | L04 |
| `trashing` | `trash_confirmed` | `trashed` | L04 |
| `trashing` | `rejected` | `ready` | L04 |
| `trashing` | `response_lost` | `trashing` | J02 |
| `trashed` | `restored` | `ready` | L04 |

## Conversation

Initial state: `active`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `active` | Requests and drafts can be added. |
| `archiving` | Archive write is pending; local draft is retained. |
| `archived` | History is readable; new submissions require restore. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `active` | `archive` | `archiving` | L03 |
| `archiving` | `confirmed` | `archived` | L03 |
| `archiving` | `response_lost` | `archiving` | J02 |
| `archiving` | `rejected` | `active` | L03 |
| `archived` | `restore` | `active` | L03 |

## Connection

Initial state: `online`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `online` | Protected reads/writes can be attempted subject to authorization. |
| `offline` | Only cached reading and local editing are available. |
| `reconnecting` | Reconcile saved writes, receipts and jobs before enabling new dispatch. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `online` | `lost` | `offline` | R02 |
| `offline` | `network_available` | `reconnecting` | R02 |
| `reconnecting` | `reconciled` | `online` | R01 |
| `reconnecting` | `lost` | `offline` | R02 |

## Authentication

Initial state: `guest`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `guest` | Anonymous text draft only; protected work requires sign-in. |
| `signed_in` | The current authenticated owner can access their work. |
| `reauth_required` | Protected operations paused; same-owner local work retained. |
| `signed_out` | Private content hidden and owner-scoped local drafts locked. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `guest` | `sign_in` | `signed_in` | R05 |
| `signed_in` | `expired` | `reauth_required` | R05 |
| `reauth_required` | `same_owner_sign_in` | `signed_in` | R05 |
| `signed_in` | `sign_out` | `signed_out` | R06 |
| `reauth_required` | `sign_out` | `signed_out` | R06 |
| `signed_out` | `same_owner_sign_in` | `signed_in` | R05 |
| `signed_out` | `different_owner_sign_in` | `signed_in` | R05 |
| `reauth_required` | `different_owner_sign_in` | `signed_in` | R05 |
| `signed_out` | `start_anonymous` | `guest` | R05 |

## Draft

Initial state: `open`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `open` | Editable, with readiness and saving tracked separately. |
| `parked` | Retained unfinished work outside the current composer. |
| `submitted` | Frozen revision belongs to an accepted request. |
| `discarded` | Explicitly discarded draft; submitted history is unaffected. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `open` | `park` | `parked` | D01 |
| `parked` | `reopen` | `open` | D01 |
| `open` | `accepted` | `submitted` | D03 |
| `open` | `discard` | `discarded` | D01 |
| `parked` | `discard` | `discarded` | D01 |
| `submitted` | `view_history` | `submitted` | H07 |
| `submitted` | `reuse_setup` | `submitted` | H07 |

## Draft save

Initial state: `local`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `local` | Newest revision is locally checkpointed, not server-acknowledged. |
| `saving` | Saving a captured revision; newer edits may exist. |
| `saved` | The current revision is acknowledged by the server. |
| `failed` | Server save failed; the local revision remains recoverable. |
| `conflict` | Both server and local revisions are retained; submit blocked. |
| `local_failed` | Local checkpoint failed; leaving requires export or explicit discard. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `local` | `edit_checkpointed` | `local` | D08 |
| `saved` | `edit_checkpointed` | `local` | D08 |
| `failed` | `edit_checkpointed` | `local` | D08 |
| `local` | `save` | `saving` | D08 |
| `failed` | `save` | `saving` | D08 |
| `saving` | `ack_current` | `saved` | D08 |
| `saving` | `ack_stale` | `local` | D08 |
| `saving` | `edit_checkpointed` | `local` | D08 |
| `saving` | `remote_failure` | `failed` | D08 |
| `saving` | `revision_conflict` | `conflict` | R03 |
| `conflict` | `keep_local_as_new` | `local` | R03 |
| `conflict` | `use_server` | `saved` | R03 |
| `conflict` | `combine` | `local` | R03 |
| `local` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `saving` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `saved` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `failed` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `conflict` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `local_failed` | `local_checkpoint_failure_unprotected` | `local_failed` | D08 |
| `local_failed` | `checkpoint_recovered` | `local` | D08 |
| `local_failed` | `draft_exported` | `local_failed` | D10 |
| `saved` | `local_checkpoint_failure_protected` | `saved` | D08 |
| `local_failed` | `ack_current` | `saved` | D08 |

## Input target

Initial state: `none`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `none` | No media target; only actions not requiring media may submit. |
| `version` | One explicitly bound, available version or validated input set. |
| `pending` | This draft explicitly waits for one named request slot. |
| `choice_required` | An output, primary input or context change must be chosen explicitly before submission. |
| `unavailable` | Bound source is failed, lost, unlinked or unauthorized. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `none` | `bind_available` | `version` | C02 |
| `version` | `bind_available` | `version` | C02 |
| `choice_required` | `bind_available` | `version` | C02 |
| `unavailable` | `bind_available` | `version` | C02 |
| `none` | `bind_pending` | `pending` | D04 |
| `version` | `bind_pending` | `pending` | D04 |
| `choice_required` | `bind_pending` | `pending` | D04 |
| `none` | `require_choice` | `choice_required` | D05 |
| `version` | `require_choice` | `choice_required` | D05 |
| `pending` | `require_choice` | `choice_required` | D05 |
| `pending` | `output_deliverable` | `version` | D04 |
| `pending` | `output_failed` | `unavailable` | D04 |
| `version` | `access_lost` | `unavailable` | M04 |
| `unavailable` | `same_source_recovered` | `version` | M04 |
| `none` | `clear` | `none` | C05 |
| `version` | `clear` | `none` | C05 |
| `pending` | `clear` | `none` | C05 |
| `choice_required` | `clear` | `none` | C05 |
| `unavailable` | `clear` | `none` | C05 |
| `none` | `inspect` | `none` | I01 |
| `version` | `inspect` | `version` | I01 |
| `pending` | `inspect` | `pending` | I01 |
| `choice_required` | `inspect` | `choice_required` | I01 |
| `unavailable` | `inspect` | `unavailable` | I01 |

## Submission

Initial state: `idle`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `idle` | No request envelope is in transit for this draft revision. |
| `sending` | Frozen envelope and submission identity are stored and being sent. |
| `unknown` | Acceptance is unknown; reconcile this exact identity. |
| `accepted` | Authoritative receipt recovered; accepted request is immutable. |
| `rejected` | Authoritative pre-acceptance rejection; original draft retained. |
| `needs_attention` | Acceptance deadline expired without authoritative outcome; frozen envelope retained for manual reconciliation. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `idle` | `submit_valid` | `sending` | D03 |
| `sending` | `accepted` | `accepted` | J01 |
| `sending` | `response_uncertain` | `unknown` | J02 |
| `sending` | `rejected` | `rejected` | J03 |
| `unknown` | `receipt_found` | `accepted` | J02 |
| `unknown` | `definitely_absent` | `sending` | J02 |
| `unknown` | `rejected` | `rejected` | J03 |
| `unknown` | `check_again` | `unknown` | J02 |
| `accepted` | `duplicate_response` | `accepted` | J01 |
| `rejected` | `corrected_new_revision` | `idle` | J03 |
| `unknown` | `recovery_deadline` | `needs_attention` | J15 |
| `needs_attention` | `check_again` | `unknown` | J15 |
| `needs_attention` | `receipt_found` | `accepted` | J15 |
| `needs_attention` | `definitely_absent` | `sending` | J15 |
| `needs_attention` | `rejected` | `rejected` | J15 |

## Request

Initial state: `queued`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `queued` | Accepted and queued; no outcome assumed. |
| `running` | At least one required output slot is executing. |
| `settling` | Execution produced outputs; saving/linking or remaining slots are unresolved. |
| `reconciling` | External execution/terminal status is uncertain. |
| `succeeded` | All required output slots are durable and deliverable. |
| `partial` | At least one deliverable slot; remaining slots are terminal failures/cancellations. |
| `failed` | No deliverable slots and all slots definitively failed/lost. |
| `cancelled` | All required slots cancelled before producing a deliverable. |
| `needs_attention` | Automatic recovery expired; evidence retained and unsettled usage released. Manual status/storage recovery remains available. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `queued` | `start` | `running` | J04 |
| `queued` | `no_slots_dispatched_cancelled` | `cancelled` | J10 |
| `queued` | `proven_failure` | `failed` | P01 |
| `running` | `output_received` | `settling` | J06 |
| `running` | `outcome_unknown` | `reconciling` | J04 |
| `settling` | `outcome_unknown` | `reconciling` | J04 |
| `running` | `all_deliverable` | `succeeded` | J07 |
| `settling` | `all_deliverable` | `succeeded` | J07 |
| `reconciling` | `all_deliverable` | `succeeded` | J07 |
| `running` | `some_deliverable_rest_terminal` | `partial` | J07 |
| `settling` | `some_deliverable_rest_terminal` | `partial` | J07 |
| `reconciling` | `some_deliverable_rest_terminal` | `partial` | J07 |
| `running` | `none_deliverable_all_failed` | `failed` | J07 |
| `settling` | `none_deliverable_all_failed` | `failed` | J07 |
| `reconciling` | `none_deliverable_all_failed` | `failed` | J07 |
| `running` | `all_cancelled` | `cancelled` | J12 |
| `settling` | `all_cancelled` | `cancelled` | J12 |
| `reconciling` | `all_cancelled` | `cancelled` | J12 |
| `reconciling` | `verified_running` | `running` | J04 |
| `reconciling` | `verified_saving` | `settling` | J06 |
| `succeeded` | `contradictory_terminal` | `reconciling` | J09 |
| `partial` | `contradictory_terminal` | `reconciling` | J09 |
| `failed` | `contradictory_terminal` | `reconciling` | J09 |
| `cancelled` | `contradictory_terminal` | `reconciling` | J09 |
| `queued` | `duplicate_or_old_event` | `queued` | J09 |
| `running` | `duplicate_or_old_event` | `running` | J09 |
| `settling` | `duplicate_or_old_event` | `settling` | J09 |
| `reconciling` | `duplicate_or_old_event` | `reconciling` | J09 |
| `succeeded` | `duplicate_or_old_event` | `succeeded` | J09 |
| `partial` | `duplicate_or_old_event` | `partial` | J09 |
| `failed` | `duplicate_or_old_event` | `failed` | J09 |
| `cancelled` | `duplicate_or_old_event` | `cancelled` | J09 |
| `queued` | `recovery_deadline` | `needs_attention` | J13 |
| `running` | `recovery_deadline` | `needs_attention` | J13 |
| `settling` | `recovery_deadline` | `needs_attention` | J13 |
| `reconciling` | `recovery_deadline` | `needs_attention` | J13 |
| `needs_attention` | `check_status` | `reconciling` | J13 |
| `needs_attention` | `all_deliverable` | `succeeded` | J13 |
| `needs_attention` | `some_deliverable_rest_terminal` | `partial` | J13 |
| `needs_attention` | `none_deliverable_all_failed` | `failed` | J13 |
| `needs_attention` | `all_cancelled` | `cancelled` | J13 |
| `needs_attention` | `duplicate_or_old_event` | `needs_attention` | J09 |

## Output slot

Initial state: `waiting`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `waiting` | Stable slot accepted; no provider dispatch yet. |
| `running` | Provider attempt may be executing. |
| `unknown` | Provider outcome cannot yet be established. |
| `received` | Provider output exists; durable copy still required. |
| `saving` | Copying or validating the same output into owned storage. |
| `save_failed` | Output existed; retry storing that same output. |
| `stored` | Durable output version exists; attachment is tracked separately. |
| `failed` | Definitive provider failure, without usable output. |
| `output_lost` | Provider output cannot be recovered into durable storage. |
| `cancelled` | Cancellation confirmed without a delivered output. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `waiting` | `dispatch` | `running` | J04 |
| `waiting` | `cancel_confirmed` | `cancelled` | J10 |
| `running` | `response_uncertain` | `unknown` | J04 |
| `running` | `provider_output` | `received` | J06 |
| `unknown` | `provider_output` | `received` | J06 |
| `running` | `proven_provider_failure` | `failed` | J07 |
| `unknown` | `proven_provider_failure` | `failed` | J07 |
| `running` | `cancel_confirmed` | `cancelled` | J10 |
| `unknown` | `cancel_confirmed` | `cancelled` | J10 |
| `received` | `begin_copy` | `saving` | J06 |
| `saving` | `copied` | `stored` | J06 |
| `saving` | `copy_failed` | `save_failed` | J06 |
| `save_failed` | `retry_same_output` | `saving` | J08 |
| `received` | `output_expired_unrecoverable` | `output_lost` | J08 |
| `saving` | `output_expired_unrecoverable` | `output_lost` | J08 |
| `save_failed` | `output_expired_unrecoverable` | `output_lost` | J08 |
| `unknown` | `status_check` | `unknown` | J04 |
| `cancelled` | `late_output` | `received` | J11 |
| `stored` | `duplicate_output` | `stored` | J09 |
| `waiting` | `admit_existing_output` | `received` | M07 |
| `waiting` | `pre_dispatch_refused` | `failed` | P01 |
| `running` | `proven_not_accepted_retry_allowed` | `waiting` | J05 |
| `unknown` | `proven_not_accepted_retry_allowed` | `waiting` | J05 |
| `failed` | `verified_late_output` | `received` | J09 |
| `output_lost` | `verified_late_output` | `received` | J09 |
| `stored` | `conflicting_extra_output` | `stored` | J09 |

## Attachment

Initial state: `pending`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `pending` | Owned durable output still needs a project association. |
| `attached` | Original output is linked to its recorded project. |
| `failed` | Association failed; repair reuses media and identity. |
| `destination_missing` | The recorded destination is unavailable or trashed; retain recovery ownership. |
| `recovery_attached` | Durable output is linked to the owner recovery inbox; original project target remains recorded. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `pending` | `linked` | `attached` | J06 |
| `pending` | `link_failed` | `failed` | J06 |
| `pending` | `destination_unavailable` | `destination_missing` | R07 |
| `failed` | `destination_unavailable` | `destination_missing` | R07 |
| `failed` | `retry` | `pending` | J08 |
| `destination_missing` | `project_restored` | `pending` | R07 |
| `attached` | `duplicate_ack` | `attached` | J09 |
| `pending` | `recovery_linked` | `recovery_attached` | J06 |
| `failed` | `recovery_linked` | `recovery_attached` | J06 |
| `destination_missing` | `recovery_linked` | `recovery_attached` | J06 |
| `recovery_attached` | `restore_original_project` | `pending` | R09 |
| `recovery_attached` | `copy_to_chosen_project` | `recovery_attached` | R09 |

## Cancellation

Initial state: `none`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `none` | No cancellation intent has been recorded. |
| `requested` | Cancellation requested; completion and charges remain possible. |
| `confirmed` | Cancellation has authoritative confirmation. |
| `unable` | Cancellation could not stop the work; its outcome remains tracked. |
| `reconciling` | Late or contradictory output requires reconciliation. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `none` | `request_cancel` | `requested` | J10 |
| `requested` | `before_dispatch_confirmed` | `confirmed` | J10 |
| `requested` | `provider_confirmed` | `confirmed` | J10 |
| `requested` | `unsupported` | `unable` | J10 |
| `requested` | `completion_won` | `unable` | J11 |
| `requested` | `response_uncertain` | `requested` | J11 |
| `confirmed` | `late_output` | `reconciling` | J11 |
| `reconciling` | `cancellation_still_valid` | `confirmed` | J11 |
| `reconciling` | `completion_verified` | `unable` | J11 |

## Upload

Initial state: `staged`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `staged` | File and intended input role selected locally. |
| `uploading` | Upload in progress using one import identity. |
| `verifying` | Server validates content and durable ownership. |
| `ready` | Owned file is available as an input. |
| `failed` | Recoverable transport/storage failure. |
| `rejected` | File is incompatible or invalid; choose/fix a file. |
| `missing_bytes` | Local file bytes unavailable after reload. |
| `cancelled` | Draft upload was cancelled; no late reattachment. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `staged` | `start` | `uploading` | M01 |
| `uploading` | `transferred` | `verifying` | M01 |
| `verifying` | `validated` | `ready` | M01 |
| `uploading` | `transport_failed` | `failed` | M01 |
| `verifying` | `transport_failed` | `failed` | M01 |
| `staged` | `invalid` | `rejected` | M01 |
| `verifying` | `invalid` | `rejected` | M01 |
| `failed` | `retry` | `uploading` | M01 |
| `staged` | `bytes_missing` | `missing_bytes` | M02 |
| `failed` | `bytes_missing` | `missing_bytes` | M02 |
| `missing_bytes` | `matching_file_reselected` | `staged` | M02 |
| `missing_bytes` | `choose_different_file` | `staged` | M02 |
| `rejected` | `choose_different_file` | `staged` | M02 |
| `staged` | `cancel` | `cancelled` | M03 |
| `uploading` | `cancel` | `cancelled` | M03 |
| `verifying` | `cancel` | `cancelled` | M03 |
| `failed` | `cancel` | `cancelled` | M03 |
| `cancelled` | `late_upload_ready` | `ready` | M03 |

## Media access

Initial state: `unloaded`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `unloaded` | Version has not been requested by the viewer. |
| `loading` | Resolving/loading the named version. |
| `ready` | The named version is accessible; decoding may be separate. |
| `refreshing` | Refreshing an expired URL for the same version. |
| `unavailable` | Media cannot currently be retrieved; history remains. |
| `denied` | Owner/access check failed; no alternate URL bypass. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `unloaded` | `open` | `loading` | M04 |
| `loading` | `loaded` | `ready` | M04 |
| `loading` | `denied` | `denied` | M04 |
| `ready` | `denied` | `denied` | M04 |
| `refreshing` | `denied` | `denied` | M04 |
| `loading` | `fetch_failed` | `unavailable` | M04 |
| `refreshing` | `fetch_failed` | `unavailable` | M04 |
| `ready` | `url_expired` | `refreshing` | M04 |
| `refreshing` | `refreshed` | `ready` | M04 |
| `unavailable` | `retry` | `loading` | M04 |
| `denied` | `access_restored` | `loading` | M04 |
| `unloaded` | `close` | `unloaded` | M04 |
| `loading` | `close` | `unloaded` | M04 |
| `ready` | `close` | `unloaded` | M04 |
| `refreshing` | `close` | `unloaded` | M04 |
| `unavailable` | `close` | `unloaded` | M04 |
| `denied` | `close` | `unloaded` | M04 |

## Playback

Initial state: `stopped`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `stopped` | No playback; selected clip starts at zero unless restoring fullscreen. |
| `playing` | Decoded selected clip is playing. |
| `paused` | Selected clip paused at its current time. |
| `buffering` | Selected clip is waiting for media data. |
| `ended` | Selected clip reached its end. |
| `error` | Playback/decode failed; generation status is unchanged. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `stopped` | `play_decoded` | `playing` | M05 |
| `paused` | `play_decoded` | `playing` | M05 |
| `ended` | `play_decoded` | `playing` | M05 |
| `playing` | `pause` | `paused` | M05 |
| `playing` | `buffering` | `buffering` | M05 |
| `buffering` | `resumed` | `playing` | M05 |
| `buffering` | `pause` | `paused` | M05 |
| `playing` | `ended` | `ended` | M05 |
| `stopped` | `autoplay_refused` | `paused` | M05 |
| `stopped` | `decode_failed` | `error` | M05 |
| `playing` | `decode_failed` | `error` | M05 |
| `paused` | `decode_failed` | `error` | M05 |
| `buffering` | `decode_failed` | `error` | M05 |
| `error` | `retry` | `stopped` | M05 |
| `stopped` | `change_viewed_version` | `stopped` | M05 |
| `playing` | `change_viewed_version` | `stopped` | M05 |
| `paused` | `change_viewed_version` | `stopped` | M05 |
| `buffering` | `change_viewed_version` | `stopped` | M05 |
| `ended` | `change_viewed_version` | `stopped` | M05 |
| `error` | `change_viewed_version` | `stopped` | M05 |
| `playing` | `fullscreen_change` | `playing` | M05 |
| `paused` | `fullscreen_change` | `paused` | M05 |
| `buffering` | `fullscreen_change` | `buffering` | M05 |

## Sketch

Initial state: `off`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `off` | No live preview dispatch; accepted images remain in project history. |
| `connecting` | Starting the bounded live preview session. |
| `live` | Live preview input can dispatch within its allowance. |
| `paused` | Drawing and last output retained; no further dispatch. |
| `error` | Preview failed; retain the last successful displayed output. |
| `limit_reached` | Allowance prevents additional frames until reset. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `off` | `resume` | `connecting` | M06 |
| `connecting` | `connected` | `live` | M06 |
| `connecting` | `preview_failed` | `error` | M06 |
| `live` | `preview_failed` | `error` | M06 |
| `error` | `retry` | `connecting` | M06 |
| `live` | `pause` | `paused` | M06 |
| `error` | `pause` | `paused` | M06 |
| `paused` | `resume` | `connecting` | M06 |
| `connecting` | `allowance_exhausted` | `limit_reached` | M08 |
| `live` | `allowance_exhausted` | `limit_reached` | M08 |
| `limit_reached` | `allowance_reset` | `paused` | M08 |
| `live` | `accept_displayed` | `live` | M07 |
| `paused` | `accept_displayed` | `paused` | M07 |
| `error` | `accept_displayed` | `error` | M07 |
| `off` | `leave` | `off` | M06 |
| `connecting` | `leave` | `off` | M06 |
| `live` | `leave` | `off` | M06 |
| `paused` | `leave` | `off` | M06 |
| `error` | `leave` | `off` | M06 |
| `limit_reached` | `leave` | `off` | M06 |
| `limit_reached` | `accept_displayed` | `limit_reached` | M07 |
| `connecting` | `accept_displayed` | `connecting` | M07 |

## Video edit

Initial state: `empty`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `empty` | No positive-duration content yet; editing allowed, export unavailable. |
| `valid` | All current edit inputs/settings/timing pass validation. |
| `invalid` | Saved editable work has identified source/timing/format conflicts. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `empty` | `valid_change` | `valid` | E02 |
| `valid` | `valid_change` | `valid` | E02 |
| `invalid` | `valid_change` | `valid` | E02 |
| `empty` | `invalid_change` | `invalid` | E02 |
| `valid` | `invalid_change` | `invalid` | E02 |
| `invalid` | `invalid_change` | `invalid` | E02 |
| `valid` | `remove_all` | `empty` | E02 |
| `invalid` | `remove_all` | `empty` | E02 |
| `valid` | `source_unavailable` | `invalid` | E07 |
| `valid` | `restore_valid_revision` | `valid` | D09 |
| `invalid` | `restore_valid_revision` | `valid` | D09 |
| `valid` | `restore_invalid_revision` | `invalid` | D09 |
| `invalid` | `restore_invalid_revision` | `invalid` | D09 |
| `valid` | `export_snapshot` | `valid` | E04 |
| `valid` | `undo_to_empty` | `empty` | D07 |
| `invalid` | `undo_to_empty` | `empty` | D07 |

## Sharing

Initial state: `private`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `private` | No public link exists for this immutable version. |
| `publishing` | Idempotent publication request is pending. |
| `publication_unknown` | Publication outcome must be reconciled. |
| `published` | Confirmed active link points to one immutable version. |
| `revoking` | Revocation requested; do not claim it is already complete. |
| `revocation_unknown` | Revocation outcome is uncertain. |
| `revoked` | Link permanently denied; a future publication requires a new link. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `private` | `publish` | `publishing` | L06 |
| `publishing` | `confirmed` | `published` | L06 |
| `publishing` | `response_lost` | `publication_unknown` | L07 |
| `publishing` | `rejected` | `private` | L06 |
| `publication_unknown` | `receipt_found` | `published` | L07 |
| `publication_unknown` | `definitely_absent` | `publishing` | L07 |
| `published` | `revoke` | `revoking` | L06 |
| `revoking` | `confirmed` | `revoked` | L06 |
| `revoking` | `response_lost` | `revocation_unknown` | L07 |
| `revocation_unknown` | `confirmed_revoked` | `revoked` | L07 |
| `revocation_unknown` | `still_active` | `revoking` | L07 |
| `published` | `project_trashed` | `revoked` | L07 |
| `publishing` | `project_trashed` | `revoked` | L07 |
| `publication_unknown` | `project_trashed` | `revoked` | L07 |
| `revoking` | `project_trashed` | `revoked` | L07 |
| `revocation_unknown` | `project_trashed` | `revoked` | L07 |

## Usage

Initial state: `not_required`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `not_required` | Free mode; customer billing absent, provider expense still recorded. |
| `quoted` | Current quote matches the reviewed request and expiry. |
| `quote_invalid` | Quote expired/changed or request changed; submit blocked. |
| `reserving` | Atomic acceptance and usage reservation in progress. |
| `reserved` | Accepted maximum held; no duplicate reservation allowed. |
| `reconciling` | Reservation/settlement outcome unknown. |
| `settled` | Successful delivered slots settled once under the accepted policy. |
| `released` | Unused/failed slots released or refunded without erasing provider expense. |
| `unavailable` | Allowance/entitlement/payment prevents new dispatch. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `not_required` | `paid_mode_enabled` | `quoted` | P01 |
| `quoted` | `quote_expired` | `quote_invalid` | P01 |
| `quoted` | `draft_changed` | `quote_invalid` | P01 |
| `quote_invalid` | `reviewed_new_quote` | `quoted` | P01 |
| `quoted` | `accept` | `reserving` | P02 |
| `reserving` | `reserved` | `reserved` | P02 |
| `reserving` | `denied` | `unavailable` | P02 |
| `reserving` | `response_uncertain` | `reconciling` | P02 |
| `reserved` | `delivered_settlement` | `settled` | P03 |
| `reserved` | `no_deliverable_release` | `released` | P03 |
| `reserved` | `settlement_uncertain` | `reconciling` | P04 |
| `reconciling` | `verified_reserved` | `reserved` | P02 |
| `reconciling` | `verified_settled` | `settled` | P04 |
| `reconciling` | `verified_released` | `released` | P04 |
| `unavailable` | `refreshed_entitlement` | `quoted` | P01 |
| `settled` | `duplicate_settlement` | `settled` | P02 |
| `released` | `duplicate_release` | `released` | P02 |
| `reserved` | `recovery_deadline_release` | `released` | J13 |
| `reconciling` | `recovery_deadline_release` | `released` | J13 |
| `released` | `late_output` | `released` | J11 |
| `reserved` | `confirmed_cancel_release` | `released` | J11 |

## Clarification

Initial state: `waiting`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `waiting` | Persisted question targets an exact draft revision; answer required. |
| `answering` | Answer submission is being saved under that question identity. |
| `proposal_ready` | Answer saved and proposal based on the same current draft revision. |
| `stale_proposal` | Target changed or became noneditable; retain proposal and require an authorized writable new draft or explicit resolution. |
| `applied` | Proposal explicitly applied; no media dispatched. |
| `dismissed` | Question/proposal closed; required missing information still blocks submission. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `waiting` | `answer` | `answering` | C09 |
| `answering` | `saved_current` | `proposal_ready` | C09 |
| `answering` | `saved_stale` | `stale_proposal` | C09 |
| `answering` | `response_uncertain` | `answering` | J02 |
| `proposal_ready` | `draft_changed` | `stale_proposal` | C09 |
| `proposal_ready` | `apply` | `applied` | C09 |
| `stale_proposal` | `apply_as_new_draft` | `applied` | C09 |
| `waiting` | `dismiss` | `dismissed` | C09 |
| `proposal_ready` | `dismiss` | `dismissed` | C09 |
| `stale_proposal` | `dismiss` | `dismissed` | C09 |
| `dismissed` | `reopen` | `waiting` | C09 |
| `proposal_ready` | `target_not_editable` | `stale_proposal` | C08 |
| `answering` | `saved_target_locked` | `stale_proposal` | C08 |

## Download

Initial state: `idle`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `idle` | No current file transfer requested. |
| `resolving` | Resolving an authorized URL for this stored version. |
| `started` | Browser file transfer has started; no claim about writing to disk. |
| `failed` | Resolve/transfer failed; original file/job remain intact. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `idle` | `download` | `resolving` | L08 |
| `resolving` | `transfer_started` | `started` | L08 |
| `resolving` | `transfer_failed` | `failed` | L08 |
| `started` | `transfer_failed` | `failed` | L08 |
| `failed` | `retry_same_version` | `resolving` | L08 |
| `started` | `download_again` | `resolving` | L08 |

## Assistant response

Initial state: `streaming`.

<!-- prettier-ignore -->
| State | Meaning |
| --- | --- |
| `streaming` | Provisional text is arriving for a captured request/context. |
| `interrupted` | Text stream stopped; reconcile the same request. |
| `saved` | Final response/proposal is durable and available for explicit Apply. |
| `failed` | Text request definitively failed; user can deliberately request again. |

<!-- prettier-ignore -->
| From | Event | To | Contract rule |
| --- | --- | --- | --- |
| `streaming` | `final_saved` | `saved` | J14 |
| `streaming` | `response_uncertain` | `interrupted` | J14 |
| `interrupted` | `resume_stream` | `streaming` | J14 |
| `interrupted` | `final_found` | `saved` | J14 |
| `streaming` | `definitive_failure` | `failed` | J14 |
| `interrupted` | `definitive_failure` | `failed` | J14 |
