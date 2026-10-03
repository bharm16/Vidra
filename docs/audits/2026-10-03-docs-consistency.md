# Documentation consistency and remaining acceptance (#146)

**Status:** Partial consistency sweep; #146 remains open. Recorded 2026-10-03
against local `main` at `e6049b709f6899af567a03a09852ad886a5040e7` and the current
working changes. The previous October 3 implementation commits are local; this
record does not claim they were pushed or merged on GitHub. No paid call,
production inventory, browser walkthrough or deployment acceptance was executed
for this documentation sweep.

## Contracts checked

| Concern                              | Current source and correction                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-turn studio edits              | `StudioService.allowedActionsFor` enables edit/transform when a source image exists, including bridge/upload attachments before any turn. Only clarify depends on turn history. #110's rule is preserved; historical studio plans are annotated.                                                                                                   |
| Studio LLM configuration             | `ModelConfig.studio_turn` defaults to OpenAI / `gpt-5.6-luna`, temperature 1, maxTokens 8000 and timeout 60000 ms. `STUDIO_TURN_PROVIDER` / `STUDIO_TURN_MODEL` override it. Smoke/recorder provenance follows effective config, not a historical mini-model name.                                                                                 |
| Storage namespaces                   | The general storage token, dedicated convergence adapter and image-asset store are separate implementations. The table below records actual defaults, not ownership inferred from feature names.                                                                                                                                                   |
| Offline replay limits                | The cross-mode test uses HTTP admission/studio routes, `writeCameraDirection` for words and `processVideoJob` directly for video. It does not operate browser controls, depth or credit-bearing HTTP intake. The committed cross-mode cassette has 12 authored entries without capture provenance; its date stamp is not evidence of live capture. |
| Live smoke limits                    | #140's implemented runner derives bounds and validates provider responses; default-branch nightly plus manual dispatch are configured. A green offline test does not certify a successful live smoke or creative quality. The cassette recorder's response-count budget is not a dollar ceiling.                                                   |
| Frozen boundaries and product claims | README removes obsolete credit plans, preview/final lifecycle promises, four-panel anatomy and production-ready claims. The historical scheduler proposal is marked deferred. Earlier plans/handoffs retain their observed evidence with a current-status annotation.                                                                              |
| Deferred scope                       | The [explicit ledger](../architecture/deferred-work-ledger.md) names every scope from the remaining-work review, its preserved boundary and the decision needed to reopen it.                                                                                                                                                                      |

This is a targeted consistency sweep, not a claim to have audited every historical
document. Coverage: README; cross-mode and replay architecture documents; media
lifecycle; the studio ADR/July plan/handoff; async-job proposal; ADR-0022 and the
root glossary reviewed for coordinated corrections. Generated maps/tables and
#119/#144's new contract documents are updated by their owning work in this batch.

## Actual storage defaults

| Writer / adapter                                                                       | Namespace or record path                                                                                                                | Source                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| General `storageService`: studio raster output, uploaded attachments and bridge copies | `users/{userId}/previews/images/{timestamp}-{hash}.{extension}`; the path template's `.webp` is replaced with the actual MIME extension | `services/storage/config/storageConfig.ts`, `services/storage/services/UploadService.ts`                              |
| General `storageService`: studio SVG output                                            | `users/{userId}/previews/vectors/{timestamp}-{hash}.svg`; executable content is served as an attachment                                 | Same config; `StudioService.runImageCall` selects `preview-vector`                                                    |
| GCS image-asset store: generated/admitted pictures and sketch snapshots                | `{IMAGE_STORAGE_BASE_PATH}/{owner}/{assetId}`, default base `image-previews`                                                            | `GcsImageAssetStore.objectPath`, `config/env.ts`; `acceptLiveOutput` tags snapshots `admissionSource=sketch-snapshot` |
| Local image-asset fallback                                                             | Reported path `{owner}/{filename}` below the configured local root; no GCS lifecycle metadata                                           | `LocalImageAssetStore`                                                                                                |
| Dedicated `convergenceStorageService`                                                  | `convergence/{owner}/{purpose}/{uuid}.{extension}`                                                                                      | `services/convergence/storage/StorageService.ts`                                                                      |
| Studio persistence                                                                     | `studio_projects/{projectId}/turns/{turnId}` and `studio_usage`                                                                         | `FirestoreStudioProjectStore`                                                                                         |

`config/services/storage.services.ts` registers the general class as
`storageService` and the dedicated convergence adapter as
`convergenceStorageService`. A URL or prefix identifies storage; it does not
authorize deletion. Actual configured base paths and buckets override defaults.

## Live tracker and proof gates

GitHub issue states and #146's live `dependencies/blocked_by` edges were
read on 2026-10-03. Closed issues are not a replacement for their scoped evidence.

| Ticket                                                                  | Observed state                               | Remaining implication                                                                                                                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#118](https://github.com/bharm16/Vidra/issues/118) vector storage      | Closed                                       | Raster-only first-frame admission and explicit SVG refusal stay intact.                                                                                                                    |
| [#142](https://github.com/bharm16/Vidra/issues/142) real adapters       | Closed                                       | Local Firestore/Auth emulator and controlled conformance-bucket proof is recorded in the [media lifecycle](../architecture/admission-media-lifecycle.md); this is not deployed acceptance. |
| [#120](https://github.com/bharm16/Vidra/issues/120) operating policy    | Open; owner decision                         | Free-validation versus paid Keep and dollar bounds remain unapproved. Skipping this ticket does not select a mode.                                                                         |
| [#124](https://github.com/bharm16/Vidra/issues/124) HTTP intake         | Open; depends on #120/#123                   | The active picture/clip intake still reserves credits. Replay bypassing intake does not demonstrate this acceptance.                                                                       |
| [#141](https://github.com/bharm16/Vidra/issues/141) browser walkthrough | Open; includes #124 dependency               | Actual controls, submitted payload, navigation and listed recovery failures still need browser proof.                                                                                      |
| [#143](https://github.com/bharm16/Vidra/issues/143) real clip and depth | Open; depends on #124/#136/#141/#142/#140    | A playable live clip, durable reopen/download, both picker depth states and authorized spend remain required.                                                                              |
| [#144](https://github.com/bharm16/Vidra/issues/144) quality             | Open; depends on #140/#143                   | Harness/task preparation does not provide owner-reviewed creative results. Groq selection remains a separate #106 gate.                                                                    |
| [#65](https://github.com/bharm16/Vidra/issues/65) all-shells review     | Open; current pass depends on #134/#135/#141 | The July walkthrough stays historical; current studio/editor/bridge/recovery/camera inspection and owner sign-off remain required.                                                         |
| [#137](https://github.com/bharm16/Vidra/issues/137) lifecycle           | Open; retention decision remains             | Copy-isolation tests and dry-run tools exist. No production inventory or authorized cleanup is claimed.                                                                                    |
| [#145](https://github.com/bharm16/Vidra/issues/145) deployment/recovery | Open                                         | Production access denial, deployment configuration, rollback and recovery evidence require the deployed version.                                                                           |

#146's live recorded blockers are #118/#124/#120/#141/#142/#143/#144/#65.
The two closed prerequisites narrow the remaining gates; they do not remove
the open policy, browser, live, quality or owner acceptance. This document does
not close #146 or authorize paid recording/smoke execution.
