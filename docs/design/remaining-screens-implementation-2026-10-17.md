> Superseded for visual acceptance by [the Figma fidelity reconciliation](figma-fidelity-implementation-2026-10-17.md). This initial implementation census did not establish visual fidelity. C28 is the existing phrase-suggestion Words tools popover, not a native text-generation capability blocked by the cost policy.

# Retained Figma screens: implementation evidence

2026-10-17 · Main checkout; no commit or deployment implied.

This audit reconciles **485 distinct live frames across 14 application pages**, including **161 mobile frames**. The 504 catalog rows contain two duplicate node references and 17 retired null-node rows. Every live node is listed below.

**This is not a claim that all 485 frames were verified end to end.** Source implementation, relevant tests, controlled browser captures and external acceptance remain separate. All five repository gates, full lint, build and drift checks pass. Provider-free integrated browser and native workflow checks pass; external qualification remains separate.

[Aggregate gallery](../../output/playwright/all-screens/index.html) · [Per-frame JSON](remaining-screens-implementation-2026-10-17.json)

## Dispositions

| Disposition | Live frames |
| --- | ---: |
| implemented-source | 428 |
| shared-state-example | 39 |
| capability-unavailable | 12 |
| external-owned | 2 |
| no-runtime-dependency | 4 |

`implemented-source` means feature and host source present, with no exact-frame runtime claim. `shared-state-example` means an Applied/Return prototype using the same phrase-change implementation. Capability-unavailable, external-owned and no-runtime-dependency rows carry explicit reasons.

## Feature map and evidence

### public

Guest/member landing, product menus, responsive navigation, free-testing pricing and expandable questions.

Route: `/; /product/:product; /pricing`.

Sources: [PublicPages.tsx](../../client/src/features/public-site/PublicPages.tsx), [SiteShell.tsx](../../client/src/features/public-site/SiteShell.tsx).

Relevant test definitions: [PublicScreens.behavior.test.tsx](../../client/src/features/public-site/__tests__/PublicScreens.behavior.test.tsx).

### legal

Retained legal text and date; desktop and mobile contents.

Route: `/privacy-policy; /terms-of-service`.

Sources: [LegalPageLayout.tsx](../../client/src/features/public-site/LegalPageLayout.tsx), [PrivacyPolicyPage.tsx](../../client/src/pages/PrivacyPolicyPage.tsx), [TermsOfServicePage.tsx](../../client/src/pages/TermsOfServicePage.tsx).

Relevant test definitions: [PublicScreens.behavior.test.tsx](../../client/src/features/public-site/__tests__/PublicScreens.behavior.test.tsx).

### docs

Fourteen bundled guides and local search/results/no match/missing article; responsive navigation and contents. No remote article/search dependency.

Route: `/docs; /docs/:article?q=...`.

Sources: [DocsPage.tsx](../../client/src/features/public-site/docs/DocsPage.tsx), [articles.ts](../../client/src/features/public-site/docs/articles.ts).

Relevant test definitions: [PublicScreens.behavior.test.tsx](../../client/src/features/public-site/__tests__/PublicScreens.behavior.test.tsx).

### auth

Single ambient auth card, password Show, validation, busy/errors, resend cooldown and Firebase repository handoffs.

Route: `/signin; /signup; /forgot-password; /reset-password; /email-verification`.

Sources: [SignInPage.tsx](../../client/src/pages/SignInPage.tsx), [SignUpPage.tsx](../../client/src/pages/SignUpPage.tsx), [ForgotPasswordPage.tsx](../../client/src/pages/ForgotPasswordPage.tsx), [PasswordResetPage.tsx](../../client/src/pages/PasswordResetPage.tsx), [EmailVerificationPage.tsx](../../client/src/pages/EmailVerificationPage.tsx), [AuthRepository.ts](../../client/src/repositories/AuthRepository.ts).

Relevant test definitions: [AuthPages.behavior.test.tsx](../../client/src/pages/__tests__/AuthPages.behavior.test.tsx), [AuthPages.hard-bugs.regression.test.tsx](../../client/src/pages/__tests__/AuthPages.hard-bugs.regression.test.tsx).

### account

Owner-scoped identity/profile updates, provider settings, usage facts, privacy handoffs and retention-aware signout.

Route: `/account?section=profile|security|usage|privacy`.

Sources: [AccountPage.tsx](../../client/src/pages/AccountPage.tsx), [accountApi.ts](../../client/src/pages/account/api/accountApi.ts), [WorkspaceRetention.ts](../../client/src/repositories/workflow/WorkspaceRetention.ts), [account.routes.ts](../../server/src/routes/account.routes.ts), [AccountUsageService.ts](../../server/src/services/account/AccountUsageService.ts).

Relevant test definitions: [AccountPage.behavior.test.tsx](../../client/src/pages/__tests__/AccountPage.behavior.test.tsx), [accountApi.test.ts](../../client/src/pages/account/api/__tests__/accountApi.test.ts), [AccountUsageService.test.ts](../../server/src/services/account/__tests__/AccountUsageService.test.ts), [sharing-account.spec.ts](../../tests/e2e/workflow/sharing-account.spec.ts).

### support

Validated email handoff, topic selection, no-app/copy/manual-address fallback. No sent-ticket or completed-deletion claim.

Route: `/contact?topic=...`.

Sources: [support.ts](../../client/src/features/public-site/support.ts), [ContactSupportPage.tsx](../../client/src/pages/ContactSupportPage.tsx).

Relevant test definitions: [ContactSupportPage.behavior.test.tsx](../../client/src/pages/__tests__/ContactSupportPage.behavior.test.tsx).

### system

Reusable loading/load-error/offline/unavailable/denied/not-found presentation. Mounted failure boundaries remain separately auditable.

Route: `Route/dependency failure boundaries; unmatched routes`.

Sources: [SystemPage.tsx](../../client/src/features/public-site/SystemPage.tsx), [App.tsx](../../client/src/App.tsx), [NotFoundPage.tsx](../../client/src/pages/NotFoundPage.tsx).

Relevant test definitions: [PublicScreens.behavior.test.tsx](../../client/src/features/public-site/__tests__/PublicScreens.behavior.test.tsx).

### projects

Project browser/search/empty/loading/trash/restore, stable create identity, options and conversation CAS rename/archive/restore.

Route: `/app; /app/project/:projectId`.

Sources: [ProjectBrowser.tsx](../../client/src/features/project-management/ProjectBrowser.tsx), [ProjectManagementPanel.tsx](../../client/src/features/project-management/ProjectManagementPanel.tsx), [useProjectBrowser.ts](../../client/src/features/project-management/hooks/useProjectBrowser.ts), [projects.routes.ts](../../server/src/routes/projects.routes.ts), [workflow-management.routes.ts](../../server/src/routes/workflow-management.routes.ts), [ProjectStore.ts](../../server/src/services/projects/ProjectStore.ts), [ConversationStore.ts](../../server/src/services/projects/ConversationStore.ts).

Relevant test definitions: [ProjectBrowser.test.tsx](../../client/src/features/project-management/__tests__/ProjectBrowser.test.tsx), [ProjectManagementPanel.test.tsx](../../client/src/features/project-management/__tests__/ProjectManagementPanel.test.tsx), [ProjectManagementPanel.owner.test.tsx](../../client/src/features/project-management/__tests__/ProjectManagementPanel.owner.test.tsx), [project.integration.test.ts](../../tests/integration/workflow/project.integration.test.ts), [management.integration.test.ts](../../tests/integration/workflow/management.integration.test.ts), [integrated.spec.ts](../../tests/e2e/workflow/integrated.spec.ts), [ConversationDraftMenu.test.tsx](../../client/src/features/project-management/__tests__/ConversationDraftMenu.test.tsx).

### workspace

Independent draft/viewer/request state, direct Make/Edit, automatic labels, exact phrase/custom alternatives/undo, deliberate reuse, durable result/text history and recovery. Embedded editor supports composer/history coexistence and timeline view preference; per-conversation owned draft menus replace the generic draft manager.

Route: `/app/project/:projectId?conversation=:conversationId`.

Sources: [ProjectWorkspace.tsx](../../client/src/features/project-workspace/ProjectWorkspace.tsx), [useProjectWorkspace.ts](../../client/src/features/project-workspace/hooks/useProjectWorkspace.ts), [PromptComposer.tsx](../../client/src/features/project-workspace/components/PromptComposer.tsx), [ConversationHistory.tsx](../../client/src/features/project-workspace/components/ConversationHistory.tsx), [phraseChange.ts](../../client/src/features/project-workspace/state/phraseChange.ts), [creation-requests.routes.ts](../../server/src/routes/creation-requests.routes.ts), [WorkflowExecutionService.ts](../../server/src/services/creation-requests/execution/WorkflowExecutionService.ts), [WorkflowExecutionStore.ts](../../server/src/services/creation-requests/execution/WorkflowExecutionStore.ts), [NativeWorkflowExecutor.ts](../../server/src/services/creation-requests/execution/NativeWorkflowExecutor.ts).

Relevant test definitions: [PromptComposer.behavior.test.tsx](../../client/src/features/project-workspace/__tests__/PromptComposer.behavior.test.tsx), [useProjectWorkspace.test.ts](../../client/src/features/project-workspace/__tests__/useProjectWorkspace.test.ts), [phraseChange.test.ts](../../client/src/features/project-workspace/__tests__/phraseChange.test.ts), [execution.integration.test.ts](../../tests/integration/workflow/execution.integration.test.ts), [admission.integration.test.ts](../../tests/integration/workflow/admission.integration.test.ts), [draft.integration.test.ts](../../tests/integration/workflow/draft.integration.test.ts), [workspace.spec.ts](../../tests/e2e/workflow/workspace.spec.ts), [playback-recovery.spec.ts](../../tests/e2e/workflow/playback-recovery.spec.ts).

### versions-viewer

Exact-version access, docked playback/Use/download/fullscreen, preferred/favourite distinction, actual lineage and pinned source frame extraction.

Route: `/app/project/:projectId`.

Sources: [MediaViewer.tsx](../../client/src/features/project-workspace/components/MediaViewer.tsx), [VersionsPanel.tsx](../../client/src/features/project-workspace/components/VersionsPanel.tsx), [versionTree.ts](../../client/src/features/project-workspace/state/versionTree.ts), [mediaActionsApi.ts](../../client/src/features/project-workspace/api/mediaActionsApi.ts), [WorkflowManagementService.ts](../../server/src/services/workflow-sharing/WorkflowManagementService.ts), [NativeFrameDeriver.ts](../../server/src/services/workflow-sharing/NativeFrameDeriver.ts).

Relevant test definitions: [workspaceScreens.test.tsx](../../client/src/features/project-workspace/__tests__/workspaceScreens.test.tsx), [management.integration.test.ts](../../tests/integration/workflow/management.integration.test.ts), [frame-derivation.integration.test.ts](../../tests/integration/workflow/frame-derivation.integration.test.ts).

### capabilities

Profile-driven editable/fixed/derived values; unavailable/error states and strict admission. Configured adapter presence is not output-quality qualification. Four mapped media profiles have pinned default cost ceilings against the existing Studio cap; native workflow text is unavailable unless a reviewed provider policy is supplied.

Route: `/app/project/:projectId`.

Sources: [CapabilitySettings.tsx](../../client/src/features/project-workspace/components/CapabilitySettings.tsx), [capabilitySettings.ts](../../client/src/features/project-workspace/state/capabilitySettings.ts), [WorkflowCapabilityCatalog.ts](../../server/src/services/creation-requests/preparation/WorkflowCapabilityCatalog.ts), [ActionPreparationService.ts](../../server/src/services/creation-requests/preparation/ActionPreparationService.ts), [StudioWorkflowSpendGuard.ts](../../server/src/services/creation-requests/execution/StudioWorkflowSpendGuard.ts), [workflowSpendPolicy.ts](../../server/src/services/creation-requests/execution/workflowSpendPolicy.ts).

Relevant test definitions: [workspaceScreens.test.tsx](../../client/src/features/project-workspace/__tests__/workspaceScreens.test.tsx), [preparation.integration.test.ts](../../tests/integration/workflow/preparation.integration.test.ts).

### media-import

Fluid grid/search/filter/sort, empty/no match, hide/restore/copy, immediate fingerprint-bound resumable imports and matching-file recovery. Checking stays Uploading; success/cancel closes panel.

Route: `/app/project/:projectId?view=media; composer/editor pickers`.

Sources: [ProjectMediaLibrary.tsx](../../client/src/features/project-media/ProjectMediaLibrary.tsx), [ProjectMediaPicker.tsx](../../client/src/features/project-media/ProjectMediaPicker.tsx), [useProjectImports.ts](../../client/src/features/project-imports/hooks/useProjectImports.ts), [ImportPanel.tsx](../../client/src/features/project-imports/components/ImportPanel.tsx), [ProjectMediaService.ts](../../server/src/services/project-media/ProjectMediaService.ts), [ProjectMediaStorage.ts](../../server/src/services/project-media/ProjectMediaStorage.ts), [projects.routes.ts](../../server/src/routes/projects.routes.ts).

Relevant test definitions: [useProjectImports.test.tsx](../../client/src/features/project-imports/__tests__/useProjectImports.test.tsx), [importTransfer.test.ts](../../client/src/features/project-imports/__tests__/importTransfer.test.ts), [MediaCard.test.tsx](../../client/src/features/project-media/__tests__/MediaCard.test.tsx), [media-import.integration.test.ts](../../tests/integration/workflow/media-import.integration.test.ts), [audio-import-native.integration.test.ts](../../tests/integration/workflow/audio-import-native.integration.test.ts), [integrated.spec.ts](../../tests/e2e/workflow/integrated.spec.ts).

### video-editor

CAS edit revisions; normalized exact-source 30fps preview; ordered clips/stills, trim/replace/reorder/remove/undo, framing, captions, separate audio, history and captured native FFmpeg export.

Route: `/app/project/:projectId?view=video|video-workspace&edit=:editId`.

Sources: [VideoEditor.tsx](../../client/src/features/video-editor/VideoEditor.tsx), [useVideoEditor.ts](../../client/src/features/video-editor/hooks/useVideoEditor.ts), [EditorPreview.tsx](../../client/src/features/video-editor/components/EditorPreview.tsx), [EditorTimeline.tsx](../../client/src/features/video-editor/components/EditorTimeline.tsx), [EditorPanels.tsx](../../client/src/features/video-editor/components/EditorPanels.tsx), [ExportPanel.tsx](../../client/src/features/video-editor/components/ExportPanel.tsx), [useInitialEditorMedia.ts](../../client/src/features/video-editor/hooks/useInitialEditorMedia.ts), [video-edits.routes.ts](../../server/src/routes/video-edits.routes.ts), [VideoEditStore.ts](../../server/src/services/video-editing/VideoEditStore.ts), [VideoPreviewService.ts](../../server/src/services/video-editing/VideoPreviewService.ts), [VideoExportService.ts](../../server/src/services/video-export/VideoExportService.ts), [NativeVideoRenderer.ts](../../server/src/services/video-export/NativeVideoRenderer.ts).

Relevant test definitions: [VideoEditor.behavior.test.tsx](../../client/src/features/video-editor/__tests__/VideoEditor.behavior.test.tsx), [useVideoEditor.test.ts](../../client/src/features/video-editor/__tests__/useVideoEditor.test.ts), [EditorPreview.test.tsx](../../client/src/features/video-editor/__tests__/EditorPreview.test.tsx), [video-edit-export.integration.test.ts](../../tests/integration/workflow/video-edit-export.integration.test.ts), [video-render-native.integration.test.ts](../../tests/integration/workflow/video-render-native.integration.test.ts), [video-preview.integration.test.ts](../../tests/integration/workflow/video-preview.integration.test.ts), [integrated.spec.ts](../../tests/e2e/workflow/integrated.spec.ts).

### sketch

Drawing/erase/shapes/import, checkpoint restore, explicit start/pause/resume/retry/limit and exact displayed-output capture with deliberate use.

Route: `/app/project/:projectId?view=sketch`.

Sources: [ProjectSketch.tsx](../../client/src/features/project-sketch/ProjectSketch.tsx), [DrawingCanvas.tsx](../../client/src/features/project-sketch/components/DrawingCanvas.tsx), [useProjectSketchPreview.ts](../../client/src/features/project-sketch/hooks/useProjectSketchPreview.ts), [useProjectSketchCapture.ts](../../client/src/features/project-sketch/hooks/useProjectSketchCapture.ts), [project-sketch.routes.ts](../../server/src/routes/project-sketch.routes.ts), [ProjectSketchService.ts](../../server/src/services/project-sketch/ProjectSketchService.ts), [ProjectSketchStorage.ts](../../server/src/services/project-sketch/ProjectSketchStorage.ts).

Relevant test definitions: [useProjectSketchPreview.test.tsx](../../client/src/features/project-sketch/__tests__/useProjectSketchPreview.test.tsx), [useProjectSketchCapture.test.tsx](../../client/src/features/project-sketch/__tests__/useProjectSketchCapture.test.tsx), [project-sketch.integration.test.ts](../../tests/integration/workflow/project-sketch.integration.test.ts), [integrated.spec.ts](../../tests/e2e/workflow/integrated.spec.ts).

### area-edit

Source/geometry-bound masks with drawing/erase/undo/redo/clear and Done. Current qualified models cannot submit area edits.

Route: `/app/project/:projectId; viewer tools`.

Sources: [AreaEditPanel.tsx](../../client/src/features/project-sketch/AreaEditPanel.tsx), [ProjectWorkspace.tsx](../../client/src/features/project-workspace/ProjectWorkspace.tsx).

Relevant test definitions: [AreaEditPanel.test.tsx](../../client/src/features/project-sketch/__tests__/AreaEditPanel.test.tsx).

### share

Exact-version publication/revoke, uncertain acceptance recovery, minimal public metadata and per-content-request ownership/project/epoch checks with HTTP Range.

Route: `/app/project/:projectId; /share/media/:id`.

Sources: [ShareVersionPanel.tsx](../../client/src/features/workflow-sharing/ShareVersionPanel.tsx), [WorkflowSharePage.tsx](../../client/src/features/workflow-sharing/WorkflowSharePage.tsx), [useVersionSharing.ts](../../client/src/features/workflow-sharing/hooks/useVersionSharing.ts), [usePublicVersion.ts](../../client/src/features/workflow-sharing/hooks/usePublicVersion.ts), [workflow-management.routes.ts](../../server/src/routes/workflow-management.routes.ts), [public-workflow-sharing.routes.ts](../../server/src/routes/public-workflow-sharing.routes.ts), [WorkflowManagementService.ts](../../server/src/services/workflow-sharing/WorkflowManagementService.ts).

Relevant test definitions: [sharing.behavior.test.tsx](../../client/src/features/workflow-sharing/__tests__/sharing.behavior.test.tsx), [management.integration.test.ts](../../tests/integration/workflow/management.integration.test.ts), [sharing-account.spec.ts](../../tests/e2e/workflow/sharing-account.spec.ts).

### email-external

Verification/reset mail is provider-owned outside the SPA; application states do not establish delivered email or console template parity.

Route: `Firebase outbound action email`.

Sources: [AuthRepository.ts](../../client/src/repositories/AuthRepository.ts).

Relevant test definitions: [AuthPages.behavior.test.tsx](../../client/src/pages/__tests__/AuthPages.behavior.test.tsx).

## Integration audit resolution

- **AUDIT-TIMELINE** (resolved-source): Full and embedded editor views coexist with composer/history. Alternate asset inspection renders the actual editor timeline and Timeline control through viewer slots; playback pauses while edit state stays mounted. Exact source insertion retains its operation receipt.
- **AUDIT-SYSTEM** (resolved-source): App mounts loading/load-error/offline; initial project errors map 401/403 to denied, 503 to unavailable, and offline transport to offline. Partial resource errors remain inline.
- **AUDIT-LEGACY-SHARE** (resolved-source): App retains SharedClip at /share/:uuid and routes new WorkflowSharePage at /share/media/:id; public lane captured the new namespace.
- **AUDIT-RETIRED-CHROME** (resolved-source): Generic remote-draft manager removed; owned per-conversation Drafts menu opens exact parked/open record with current retention guards. Host no longer supplies onCancel, so Stop is absent; native cancellation stays contract-only.

All earlier source integration gaps now have implementations. Exact frame presentation and final integrated browser acceptance remain separate evidence.

## Integrated browser captures

[Main integrated gallery](../../output/playwright/integrated-workflow/index.html) contains 54 captures, and [embedded editor gallery](../../output/playwright/integrated-workflow/inline-editor/index.html) contains 4 captures. The combined 15-case browser run passed in 2.4 minutes, including both capture cases. All 58 captured documents fit their viewport width. All final repository gates now pass; their exact confirmed logs are listed below. These use real host routes, isolated Firestore services and actual native content verification/FFmpeg rendering. Provider output bytes and immutable storage are controlled; auth uses the established MockAuthRepository hook. A final three-case refresh/regression run also passed in 1.2 minutes after visual corrections; the JSON records refreshed manifests, per-image hashes and related design keys. No capture establishes production/provider quality or exact parity for every retained frame.

## Final validation

All final source changes are frozen and uncommitted. Earlier failed logs remain preserved diagnostics; these confirmed logs are the current result.

| Check | Final result | Log |
| --- | --- | --- |
| `npm run verify` | All five gates pass; 769 unit files / 3,912 tests | [Confirmed verify](../../.scratch/all-screens/verify-final-readonly.log) |
| `npm run lint:all` | Pass; 0 errors / 72 warnings | [Confirmed lint](../../.scratch/all-screens/lint-final-readonly.log) |
| `npm run build` | Pass | [Confirmed build](../../.scratch/all-screens/build-final-readonly.log) |
| `npm run verify:drift` | Pass | [Confirmed drift](../../.scratch/all-screens/drift-confirmed.log) |
| Bootstrap/DI | 4 pass, 1 skipped | [Confirmed bootstrap](../../.scratch/all-screens/bootstrap-confirmed.log) |
| Workflow integration | 106 / 106 pass across 18 files | [Final integration](../../.scratch/all-screens/workflow-integration-after-management-fixture.log) |
| Existing PR UI compatibility | 21 / 21 pass | [Compatibility](../../.scratch/all-screens/pr-ui-final-compat.log) |
| Integrated browser journeys | 15 / 15 pass | `/tmp/vidra-workflow-final15.log` |
| Final capture/import refresh | 3 / 3 pass; 58 stable captures, no viewport overflow | `/tmp/vidra-workflow-final-import-refresh.log` |
| Design route/reference consistency | 35 App paths pass; 427 refs / 382 distinct active nodes | [Route coverage](product/route-coverage.json) |
| `git diff --check` | Pass | Root final check and reconciliation rerun |

The final narrow client read-only correction adds three negative tests: draft edits are refused for trashed/read-only projects, archived conversations and submitted drafts, and viewer Use is disabled in read-only context. The final full verify run contains 3,912 tests; unchanged backend/route/integration/browser checks retain their prior evidence.

The passing application tests are current implementation proof. The separate historical `design-evidence.json` remains a design-only snapshot with application tests 0 and implementation/owner approval false.

## Route and reference validation

[Current route coverage](product/route-coverage.json) matches all 35 App paths. The validator passes with 183 product catalog frames, 16 historical design journeys and 1,745 prototype transitions. Active route references resolve to 427 retained references / 382 distinct live nodes. The prior 28-route snapshot, 5 proposed routes and all retirement notes are preserved. Historical design-only application qualification remains 0/false/false; these checks do not establish runtime acceptance.

## External boundaries

- Live generation provider availability/output quality/spend qualification not exercised.
- Firebase outbound mail delivery and provider-console template application remain external-owned.
- Production Firestore index deployment, cloud FFmpeg environment/IAM/resource qualification and deployment not performed.
- Current workflow adapters do not support area masks, end frames, reference-picture video or native extension; those offers are not faked.
- Native workflow text actions (ask/expand-description/improve-words) fail closed without a reviewed provider/model spend policy; this is distinct from existing phrase suggestions.

## Every retained live frame

Source and test references are specified by feature above and repeated per frame in JSON. No row asserts a screenshot for that exact state.

### 03 · New request & settings

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [888:85153](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=888-85153) | C01 · New request | workspace | implemented-source |
| [890:85349](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-85349) | C02 · Choose what to make | workspace | implemented-source |
| [890:85488](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-85488) | C03 · Choose how many images | capabilities | implemented-source |
| [890:85596](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-85596) | C04 · Start with a video | workspace | implemented-source |
| [891:86903](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=891-86903) | C14 · Keep settings when a model becomes unavailable | capabilities | implemented-source |
| [904:98166](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=904-98166) | C23 · Generate video with explicit settings | capabilities | implemented-source |
| [930:105076](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105076) | C37 · Image action chosen before writing | workspace | implemented-source |
| [930:105161](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105161) | C38 · Image request ready to generate | workspace | implemented-source |
| [930:105420](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105420) | C39 · Choose an eligible image model | capabilities | implemented-source |
| [930:105248](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105248) | C46 · Video action chosen before writing | workspace | implemented-source |
| [930:105333](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105333) | C47 · Video request ready to generate | workspace | implemented-source |
| [930:106489](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-106489) | C48 · Choose an eligible video model | capabilities | implemented-source |

### 04 · Conversation & results

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1071:89958](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-89958) | W01 · Ongoing workspace · latest generated clip selected | workspace | implemented-source |
| [1071:90343](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-90343) | W02 · Inspect an older result without replacing the working draft | workspace | implemented-source |
| [1071:90656](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-90656) | W03 · Generated image and video composer remain visible together | workspace | implemented-source |
| [1071:90960](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-90960) | W04 · Reuse setup creates a separate working draft | workspace | implemented-source |
| [1071:91277](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-91277) | W05 · Use an explicit frame as the next input | workspace | implemented-source |
| [1071:91916](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-91916) | W07 · Generation running with the prior asset still visible | workspace | implemented-source |
| [1071:92560](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-92560) | W09 · Work on a new draft while the previous generation runs | workspace | implemented-source |
| [1071:92880](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1071-92880) | W10 · Background completion leaves draft and viewer untouched | workspace | implemented-source |
| [1072:91102](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1072-91102) | W11 · View the new result explicitly; retain the working draft | workspace | implemented-source |
| [1072:91494](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1072-91494) | W12 · Background failure leaves current work intact | workspace | implemented-source |
| [1073:93357](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1073-93357) | W24 · Missing draft input blocks generation but keeps words editable | workspace | implemented-source |
| [1073:95202](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1073-95202) | W30 · A historical request is immutable; start a new draft to edit | workspace | implemented-source |
| [1074:93752](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1074-93752) | W32 · Conversation, generated media and expanded timeline together | workspace | implemented-source |
| [1074:94305](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1074-94305) | W33 · Conversation and generated media with timeline collapsed | workspace | implemented-source |
| [1074:95792](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1074-95792) | W37 · Inspect the exact setup that produced a selected result | workspace | implemented-source |
| [1074:96443](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1074-96443) | W39 · An input upload is pending; generation waits | workspace | implemented-source |
| [1081:97192](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1081-97192) | W57 · Inspect another asset with the timeline shown | workspace | implemented-source |
| [1081:97568](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1081-97568) | W58 · Inspect another asset with the timeline hidden | workspace | implemented-source |
| [1083:97427](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1083-97427) | W59 · A new empty draft keeps the viewed asset and prior request | workspace | implemented-source |
| [1083:97804](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1083-97804) | W60 · Explicitly use the viewed image as the next starting image | workspace | implemented-source |
| [1105:102955](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1105-102955) | X03 · New draft from a historical request | workspace | shared-state-example |
| [888:85240](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=888-85240) | C05 · Inspect one image while editing another | workspace | implemented-source |
| [890:85685](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-85685) | C06 · Start an edit and keep the previous draft | workspace | implemented-source |
| [890:85854](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-85854) | C07 · Write while an image is being made | workspace | implemented-source |
| [890:86160](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=890-86160) | C09 · Choose a result from an unfinished batch | workspace | implemented-source |
| [891:87918](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=891-87918) | C20 · Archived conversation | workspace | implemented-source |
| [904:99322](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=904-99322) | C30 · Use one ready image from an unfinished batch | workspace | implemented-source |
| [904:99497](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=904-99497) | C31 · Start another draft while a prior image runs | workspace | implemented-source |
| [911:325784](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=911-325784) | C34 · Image utilities respect available capabilities | versions-viewer | implemented-source |
| [911:325961](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=911-325961) | C35 · Actions on an earlier request | workspace | implemented-source |
| [916:103895](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=916-103895) | C36 · Favourite and preferred are separate choices | versions-viewer | implemented-source |
| [930:105665](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105665) | C41 · Image running with its own follow-up draft | workspace | implemented-source |
| [930:105803](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105803) | C42 · Image ready with its own follow-up draft | workspace | implemented-source |
| [930:106732](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-106732) | C50 · Video running keeps a new empty draft | workspace | implemented-source |
| [930:106857](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-106857) | C51 · Video ready keeps a new empty draft | workspace | implemented-source |
| [936:110785](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-110785) | C57 · Ready image does not change the viewer | workspace | implemented-source |
| [936:110934](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-110934) | C58 · Ready video does not change the viewer | workspace | implemented-source |

### 05 · Inputs, reuse & versions

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [891:86691](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=891-86691) | C13 · Follow the actual version branch | versions-viewer | implemented-source |
| [891:88253](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=891-88253) | C22 · Input failed while follow-up words were kept | workspace | implemented-source |
| [904:98635](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=904-98635) | C26 · Variation uses the original inputs and a fresh seed | workspace | implemented-source |
| [930:105952](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-105952) | C43 · Browse inputs without changing the current draft | media-import | implemented-source |
| [930:106340](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-106340) | C45 · Apply Desk version 2 while keeping the viewer | workspace | implemented-source |
| [930:107018](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-107018) | C52 · Input search has no matches | media-import | implemented-source |
| [930:107196](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=930-107196) | C53 · Selected input became unavailable | workspace | implemented-source |
| [936:110399](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-110399) | C54 · Change an input with a draft already in progress | media-import | implemented-source |
| [1004:118403](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1004-118403) | C59 · Use the exact accepted Sketch image as input | workspace | implemented-source |

### 06 · Prompt editing

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1065:85631](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-85631) | S01 · Empty prompt | workspace | implemented-source |
| [1065:85871](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-85871) | S02 · Highlighting a new draft | workspace | implemented-source |
| [1056:84591](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1056-84591) | S03 · Highlighted phrases in the compact composer | workspace | implemented-source |
| [1065:86442](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-86442) | S05 · Phrase hover shows its meaning | workspace | implemented-source |
| [1065:86757](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-86757) | S06 · Finding replacements | workspace | implemented-source |
| [1056:84868](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1056-84868) | S07 · Choose one replacement | workspace | implemented-source |
| [1065:87084](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-87084) | S08 · Pointer over another replacement | workspace | implemented-source |
| [1065:87418](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-87418) | S09 · Keyboard focus in replacements | workspace | implemented-source |
| [1056:85089](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1056-85089) | S10 · Ask for a different direction | workspace | implemented-source |
| [1065:87752](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-87752) | S11 · Custom request pending; existing options remain usable | workspace | implemented-source |
| [1065:88087](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-88087) | S12 · New alternatives returned | workspace | implemented-source |
| [1065:88420](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1065-88420) | S13 · Suggestion request failed | workspace | implemented-source |
| [1066:86856](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1066-86856) | S14 · No alternatives found | workspace | implemented-source |
| [1066:87256](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1066-87256) | S15 · Custom request failed; wording retained | workspace | implemented-source |
| [1066:87592](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1066-87592) | S16 · Replacement applied once; undo available | workspace | implemented-source |
| [1066:87912](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1066-87912) | S17 · Undo restores only the draft wording | workspace | implemented-source |
| [1066:88232](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1066-88232) | S18 · Redo restores the replacement | workspace | implemented-source |
| [1067:88515](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-88515) | S26 · Highlighting failed; normal writing still works | workspace | implemented-source |
| [1067:89137](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-89137) | S28 · Manual text selection without semantic labels | workspace | implemented-source |
| [1067:89467](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-89467) | S29 · Long prompt keeps a visible scroll affordance | workspace | implemented-source |
| [1067:89782](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-89782) | S30 · The selected phrase wraps across lines | workspace | implemented-source |
| [1067:90751](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-90751) | S33 · Motion wording is distinct from image appearance | workspace | implemented-source |
| [1067:91084](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1067-91084) | S34 · A repeated phrase replaces only the selected occurrence | workspace | implemented-source |
| [1070:90164](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1070-90164) | S37 · Highlight focus is visible without color alone | workspace | implemented-source |
| [1070:90477](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1070-90477) | S38 · Only the second occurrence changes | workspace | implemented-source |
| [1070:91100](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1070-91100) | S40 · No phrases identified; manual selection remains available | workspace | implemented-source |
| [1078:97489](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-97489) | S41 · Long custom request at the character limit | workspace | implemented-source |
| [1078:97718](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-97718) | S42 · Long custom request pending | workspace | implemented-source |
| [1087:97632](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-97632) | Applied · S07 · 1 | workspace | shared-state-example |
| [1087:97810](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-97810) | Applied · S07 · 2 | workspace | shared-state-example |
| [1087:97988](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-97988) | Applied · S07 · 3 | workspace | shared-state-example |
| [1087:98166](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-98166) | Applied · S12 · 1 | workspace | shared-state-example |
| [1087:98344](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-98344) | Applied · S12 · 2 | workspace | shared-state-example |
| [1087:98522](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-98522) | Applied · S12 · 3 | workspace | shared-state-example |
| [1087:98700](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-98700) | Applied · S28 · 1 | workspace | shared-state-example |
| [1087:98878](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-98878) | Applied · S28 · 2 | workspace | shared-state-example |
| [1087:99056](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-99056) | Applied · S28 · 3 | workspace | shared-state-example |
| [1087:99377](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-99377) | Applied · S30 · 1 | workspace | shared-state-example |
| [1087:99554](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-99554) | Applied · S30 · 2 | workspace | shared-state-example |
| [1087:99731](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-99731) | Applied · S30 · 3 | workspace | shared-state-example |
| [1088:99298](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99298) | Applied · S33 · 1 | workspace | shared-state-example |
| [1088:99476](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99476) | Applied · S33 · 2 | workspace | shared-state-example |
| [1088:99654](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99654) | Applied · S33 · 3 | workspace | shared-state-example |
| [1088:99969](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99969) | Applied · S34 · 1 | workspace | shared-state-example |
| [1088:100140](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100140) | Applied · S34 · 2 | workspace | shared-state-example |
| [1088:100311](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100311) | Applied · S34 · 3 | workspace | shared-state-example |
| [1089:100222](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1089-100222) | Applied · W48 · 1 | workspace | shared-state-example |
| [1089:100588](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1089-100588) | Applied · W48 · 2 | workspace | shared-state-example |
| [1089:100954](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1089-100954) | Applied · W48 · 3 | workspace | shared-state-example |
| [1090:100570](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-100570) | Applied · W49 · 1 | workspace | shared-state-example |
| [1090:100936](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-100936) | Applied · W49 · 2 | workspace | shared-state-example |
| [1090:101302](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-101302) | Applied · W49 · 3 | workspace | shared-state-example |
| [1090:101668](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-101668) | Applied · W52 · 1 | workspace | shared-state-example |
| [1090:101851](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-101851) | Applied · W52 · 2 | workspace | shared-state-example |
| [1090:102034](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1090-102034) | Applied · W52 · 3 | workspace | shared-state-example |
| [1097:102803](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1097-102803) | Return · S28 | workspace | shared-state-example |
| [1087:99234](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1087-99234) | Return · S30 | workspace | shared-state-example |
| [1088:99154](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99154) | Return · S33 | workspace | shared-state-example |
| [1088:99832](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-99832) | Return · S34 | workspace | shared-state-example |
| [1097:103332](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1097-103332) | Return · S41 | workspace | shared-state-example |
| [1097:103531](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1097-103531) | Return · S42 | workspace | shared-state-example |
| [1075:97020](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1075-97020) | W48 · Phrase editing with the timeline expanded | workspace | implemented-source |
| [1076:95631](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1076-95631) | W49 · Phrase editing with the timeline collapsed | workspace | implemented-source |
| [1076:97610](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1076-97610) | W53 · A replacement changes only the new draft while generation continues | workspace | implemented-source |
| [904:98981](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=904-98981) | C28 · Improve wording without making media | workspace | capability-unavailable |

### 07 · Model settings

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1030:84332](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84332) | G01 · Model settings loading | capabilities | implemented-source |
| [1030:84410](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84410) | G02 · Veo has sound built in | capabilities | capability-unavailable |
| [1030:84502](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84502) | G03 · Only supported durations are offered | capabilities | implemented-source |
| [1030:84608](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84608) | G04 · Aspect ratios come from the selected model | capabilities | implemented-source |
| [1030:84713](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84713) | G05 · Resolution shows its duration requirement | capabilities | capability-unavailable |
| [1030:84929](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-84929) | G07 · Duration fixed by the selected resolution | capabilities | capability-unavailable |
| [1030:85023](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-85023) | G08 · An end frame still requires a start frame | capabilities | capability-unavailable |
| [1030:85126](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-85126) | G09 · Start and end images are explicit inputs | capabilities | capability-unavailable |
| [1030:85225](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1030-85225) | G10 · Reference images fix the duration | capabilities | capability-unavailable |
| [1032:85077](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-85077) | G12 · Image-derived shape with model-specific duration | capabilities | implemented-source |
| [1032:85658](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-85658) | G18 · Capability lookup failed | capabilities | implemented-source |
| [1032:85991](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-85991) | G22 · Choose a model by its actual capabilities | capabilities | implemented-source |
| [1032:86212](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86212) | G24 · A different source image changes the derived shape | capabilities | implemented-source |
| [1032:86305](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86305) | G25 · Frame-based generation has a derived length and no sound control | capabilities | implemented-source |
| [1032:86392](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86392) | G26 · An unsupported dropped input remains visibly unresolved | capabilities | implemented-source |
| [1032:86492](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86492) | G27 · Frame count and generation rate determine length | capabilities | implemented-source |
| [1032:86590](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86590) | G28 · A range change updates the derived length | capabilities | implemented-source |
| [1032:86682](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86682) | G29 · Native extension inherits the source shape and fixed extension length | capabilities | capability-unavailable |
| [1032:86770](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1032-86770) | G30 · A stored clip can be ineligible for native extension | capabilities | capability-unavailable |
| [1037:87424](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1037-87424) | G31 · A start image does not require an end image | capabilities | implemented-source |
| [1037:87524](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1037-87524) | G32 · Making a new clip from a frame is an explicit alternative to extension | capabilities | implemented-source |

### 08 · Media & import

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [897:91827](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-91827) | M01 · Browse project media | media-import | implemented-source |
| [897:92094](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-92094) | M03 · Upload media to the library | media-import | implemented-source |
| [897:92210](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-92210) | M04 · Upload while the draft remains available | media-import | implemented-source |
| [897:92383](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-92383) | M05 · Resume an interrupted upload | media-import | implemented-source |
| [897:92723](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-92723) | M08 · Copy media to an explicitly chosen project | media-import | implemented-source |
| [971:94758](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94758) | X10 · New video edit with no project media | video-editor | implemented-source |
| [971:94945](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94945) | X11 · First project media library | media-import | implemented-source |
| [971:95103](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-95103) | X13 · Media search has no matches | media-import | implemented-source |
| [999:97241](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=999-97241) | X17 · First file uploading | video-editor | implemented-source |
| [999:97545](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=999-97545) | X19 · First file ready in project media | video-editor | implemented-source |
| [999:98306](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=999-98306) | X20 · First imported clip added explicitly | video-editor | implemented-source |
| [999:97696](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=999-97696) | X21 · First upload failed | video-editor | implemented-source |
| [999:97850](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=999-97850) | X22 · First upload needs its file again | video-editor | implemented-source |

### 09 · Sketch & area edits

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [897:92954](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-92954) | M10 · Paint an area of the exact source image | area-edit | capability-unavailable |
| [897:93132](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=897-93132) | M12 · Submit an image edit with a reviewed mask | area-edit | capability-unavailable |
| [898:92992](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-92992) | M13 · Sketch before live preview starts | sketch | implemented-source |
| [898:93121](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93121) | M14 · Sketch live preview | sketch | implemented-source |
| [898:93250](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93250) | M15 · Keep the last good preview after an error | sketch | implemented-source |
| [898:93519](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93519) | M17 · Allowance reached with an image still available | sketch | implemented-source |
| [898:93648](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93648) | M18 · Accept exactly the displayed Sketch image | sketch | implemented-source |
| [898:93795](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93795) | M19 · Connecting to Sketch | sketch | implemented-source |
| [898:93924](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=898-93924) | M20 · Accepted image with explicit use as input | sketch | implemented-source |

### 10 · Video editor & export

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1055:84528](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1055-84528) | T01 · Timeline shown · clip with sound | video-editor | implemented-source |
| [1055:84811](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1055-84811) | T02 · Timeline hidden · clip with sound | video-editor | implemented-source |
| [1055:85079](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1055-85079) | T03 · Timeline shown · silent clip | video-editor | implemented-source |
| [1055:85175](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1055-85175) | T04 · Timeline hidden · silent clip | video-editor | implemented-source |
| [1063:85167](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1063-85167) | T05 · Timeline shown · mixed clips | video-editor | implemented-source |
| [1063:85356](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1063-85356) | T06 · Timeline hidden · mixed clips | video-editor | implemented-source |
| [1064:85399](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1064-85399) | T09 · Timeline shown · music and captions | video-editor | implemented-source |
| [1064:85611](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1064-85611) | T10 · Timeline hidden · music and captions | video-editor | implemented-source |
| [1078:96929](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-96929) | T15 · Square output · timeline shown | video-editor | implemented-source |
| [1078:97209](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-97209) | T16 · Square output · timeline hidden | video-editor | implemented-source |
| [894:88355](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=894-88355) | E01 · Assemble and trim a video | video-editor | implemented-source |
| [894:88582](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=894-88582) | E02 · Empty video edit | video-editor | implemented-source |
| [895:313197](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-313197) | E03 · Review a shorter replacement | video-editor | implemented-source |
| [895:313416](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-313416) | E04 · Keep timing that needs repair | video-editor | implemented-source |
| [895:313652](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-313652) | E05 · Shorter clip with corrected timing | video-editor | implemented-source |
| [895:314097](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-314097) | E07 · Continue editing while export runs | video-editor | implemented-source |
| [895:314315](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-314315) | E08 · Earlier export is ready | video-editor | implemented-source |
| [895:314535](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-314535) | E09 · Missing source keeps the edit | video-editor | implemented-source |
| [895:314757](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-314757) | E10 · Edit background audio in place | video-editor | implemented-source |
| [895:314981](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-314981) | E11 · Source audio cannot occupy a second music track | video-editor | implemented-source |
| [895:315205](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-315205) | E12 · Choose framing for a new format | video-editor | implemented-source |
| [895:315433](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-315433) | E13 · Portrait framing applied | video-editor | implemented-source |
| [895:315643](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-315643) | E14 · Write and place a caption | video-editor | implemented-source |
| [895:315870](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-315870) | E15 · Restore an earlier arrangement | video-editor | implemented-source |
| [895:316114](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=895-316114) | E16 · Retry a failed render from its saved edit | video-editor | implemented-source |
| [912:326292](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=912-326292) | E20 · Identify text that cannot be exported | video-editor | implemented-source |
| [932:108086](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-108086) | E22 · Choose the first clip | video-editor | implemented-source |
| [932:108518](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-108518) | E24 · First clip added with its source audio | video-editor | implemented-source |
| [932:108973](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-108973) | E26 · Still inserted after the first clip | video-editor | implemented-source |
| [932:109428](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-109428) | E28 · Three visual items make an eleven-second cut | video-editor | implemented-source |
| [932:109639](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-109639) | E29 · Write a caption attached to the selected clip | video-editor | implemented-source |
| [932:109881](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-109881) | E30 · Caption saved on clip one | video-editor | implemented-source |
| [932:110092](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-110092) | E31 · Choose background audio without changing clip audio | video-editor | implemented-source |
| [932:110340](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-110340) | E32 · Complete cut with caption and background audio | video-editor | implemented-source |
| [932:110991](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-110991) | E35 · Render the captured eleven-second cut | video-editor | implemented-source |
| [932:111210](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-111210) | E36 · The exact saved export is ready | video-editor | implemented-source |
| [932:111657](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-111657) | E38 · Share the captured export privately | video-editor | implemented-source |
| [932:112097](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=932-112097) | E40 · Public viewer shows only the shared export | video-editor | implemented-source |
| [942:112617](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=942-112617) | E41 · Browse media while keeping the first clip | video-editor | implemented-source |
| [942:112861](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=942-112861) | E42 · Browse media while keeping the seven-second cut | video-editor | implemented-source |
| [993:114544](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-114544) | E45 · Preview exported edit 7 | video-editor | implemented-source |
| [993:114774](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-114774) | E46 · Preview earlier edit 3 | video-editor | implemented-source |
| [993:115240](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-115240) | E48 · Earlier arrangement restored as a new edit | video-editor | implemented-source |
| [993:115912](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-115912) | E51 · Move the selected clip after the still | video-editor | implemented-source |
| [993:116134](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-116134) | E52 · Confirm removal of a clip and its attached elements | video-editor | implemented-source |
| [993:116359](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-116359) | E53 · Clip removed with undo available | video-editor | implemented-source |
| [993:116592](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-116592) | E54 · Selected clip actions | video-editor | implemented-source |
| [993:116824](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-116824) | E55 · Preview volume controls | video-editor | implemented-source |
| [993:117052](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-117052) | E56 · Preview muted | video-editor | implemented-source |
| [993:117276](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-117276) | E57 · Full-screen video preview | video-editor | implemented-source |
| [993:117498](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-117498) | E58 · Caption text style choices | video-editor | implemented-source |
| [993:117704](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-117704) | E59 · Caption colour choices | video-editor | implemented-source |
| [993:117915](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=993-117915) | E60 · Caption placement choices | video-editor | implemented-source |

### 11 · Sharing & downloads

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [903:96851](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=903-96851) | D01 · Create a share link for one version | share | implemented-source |
| [903:97643](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=903-97643) | D06 · Public viewer contains only the shared version | share | implemented-source |
| [903:97648](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=903-97648) | D07 · Revoked or unavailable public link | share | implemented-source |
| [1004:118866](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1004-118866) | D15 · Public link loading | share | implemented-source |
| [1004:118876](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1004-118876) | D16 · Public link failed to load | share | implemented-source |

### 12 · Projects

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1872:51710](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1872-51710) | P02 · Project conversations | projects | implemented-source |
| [965:93659](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93659) | X08 · Return to an existing project | projects | implemented-source |
| [971:95026](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-95026) | X12 · First project browser | projects | implemented-source |
| [971:95182](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-95182) | X14 · Project search has no matches | projects | implemented-source |
| [971:95259](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-95259) | X15 · Project browser loading | projects | implemented-source |

### 13 · Recovery & offline

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [900:94660](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=900-94660) | R01 · Keep drafting offline without queuing generation | workspace | implemented-source |
| [900:95138](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=900-95138) | R04 · Protect work that has no saved copy | workspace | implemented-source |
| [901:320648](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=901-320648) | R16 · Capacity refusal preserves the unsubmitted draft | workspace | implemented-source |

### 14 · Account, sign-in & support

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [964:91361](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-91361) | K01 · Profile | account | implemented-source |
| [964:91459](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-91459) | K02 · Profile awaiting email verification | account | implemented-source |
| [964:91646](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-91646) | K04 · Edit display name | account | implemented-source |
| [964:92055](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92055) | K08 · Password and sign-in settings | account | implemented-source |
| [964:92150](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92150) | K09 · Google sign-in settings | account | implemented-source |
| [964:92245](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92245) | K10 · Password reset requested from account | account | implemented-source |
| [964:92345](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92345) | K11 · Free testing allowance | account | implemented-source |
| [964:92446](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92446) | K12 · Testing allowance exhausted | account | implemented-source |
| [964:92549](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92549) | K13 · Usage loading | account | implemented-source |
| [964:92635](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92635) | K14 · Usage unavailable | account | implemented-source |
| [964:92829](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92829) | K16 · No usage history yet | account | implemented-source |
| [964:92913](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-92913) | K17 · Data and privacy requests | account | implemented-source |
| [964:93011](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=964-93011) | K18 · Sign out with unsaved work | account | implemented-source |
| [990:95405](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=990-95405) | K22 · Display name validation | account | implemented-source |
| [990:95589](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=990-95589) | K24 · Request password reset | account | implemented-source |
| [990:95674](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=990-95674) | K25 · Password reset request failed | account | implemented-source |
| [990:95844](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=990-95844) | K27 · Verification resend cooldown | account | implemented-source |
| [971:94732](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94732) | T01 · Verification email | email-external | external-owned |
| [971:94745](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94745) | T02 · Password reset email | email-external | external-owned |
| [980:95286](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95286) | O09 · Support email handoff | support | implemented-source |
| [980:95294](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95294) | O10 · No email app handoff | support | implemented-source |
| [980:95302](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95302) | O11 · Email address copied | support | implemented-source |
| [965:93412](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93412) | X01 · Page not found | system | implemented-source |
| [965:93440](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93440) | X02 · Page loading | system | implemented-source |
| [965:93462](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93462) | X03 · Page failed to load | system | implemented-source |
| [965:93490](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93490) | X04 · Offline page | system | implemented-source |
| [965:93518](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93518) | X05 · Service temporarily unavailable | system | implemented-source |
| [965:93546](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93546) | X06 · Access denied | system | implemented-source |
| [965:93574](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93574) | X07 · First signed-in workspace visit | projects | implemented-source |
| [960:88814](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=960-88814) | A01 · Sign in | auth | implemented-source |
| [960:88890](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=960-88890) | A03 · Sign in validation | auth | implemented-source |
| [960:88936](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=960-88936) | A04 · Incorrect credentials | auth | implemented-source |
| [960:88982](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=960-88982) | A05 · Signing in | auth | implemented-source |
| [960:89392](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=960-89392) | A14 · Create an account | auth | implemented-source |
| [962:89442](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89442) | A21 · Check your email | auth | implemented-source |
| [962:89490](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89490) | A23 · Verification email resent | auth | implemented-source |
| [962:89512](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89512) | A24 · Checking verification link | auth | implemented-source |
| [962:89530](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89530) | A25 · Email verified | auth | implemented-source |
| [962:89550](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89550) | A26 · Verification link expired | auth | implemented-source |
| [962:89666](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89666) | A31 · Forgot password | auth | implemented-source |
| [962:89741](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89741) | A34 · Check your inbox for reset instructions | auth | implemented-source |
| [962:89812](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89812) | A37 · Choose a new password | auth | implemented-source |
| [962:89963](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89963) | A41 · Password changed | auth | implemented-source |
| [962:89983](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=962-89983) | A42 · Password reset link expired | auth | implemented-source |
| [965:92848](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-92848) | S01 · Contact support | support | implemented-source |
| [965:92901](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-92901) | S02 · Support details ready | support | implemented-source |
| [965:92954](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-92954) | S03 · Support form validation | support | implemented-source |
| [965:93014](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93014) | S04 · Choose a support topic | support | implemented-source |
| [965:93074](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93074) | S05 · Continue in your email app | support | implemented-source |
| [965:93136](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93136) | S06 · No email app available | support | implemented-source |
| [965:93198](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93198) | S07 · Support address copied | support | implemented-source |
| [965:93251](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93251) | S08 · Clipboard permission failed | support | implemented-source |
| [965:93305](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93305) | S09 · Security report | support | implemented-source |
| [965:93359](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=965-93359) | S10 · Request account data or deletion | support | implemented-source |
| [980:95180](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95180) | S11 · Product feedback | support | implemented-source |
| [980:95234](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95234) | S12 · Account deletion request | support | implemented-source |

### 15 · Public site & help

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [963:91185](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91185) | H01 · Documentation home | docs | implemented-source |
| [963:89912](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-89912) | H02 · Get started | docs | implemented-source |
| [963:90023](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90023) | H03 · Create and edit images | docs | implemented-source |
| [963:90134](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90134) | H04 · Generate a video clip | docs | implemented-source |
| [963:90245](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90245) | H05 · Assemble and export a video | docs | implemented-source |
| [963:90401](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90401) | H06 · Import and organize media | docs | implemented-source |
| [963:90512](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90512) | H07 · Conversations, drafts and versions | docs | implemented-source |
| [963:90630](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90630) | H08 · Draw with Sketch | docs | implemented-source |
| [963:90741](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90741) | H09 · Choose models and settings | docs | implemented-source |
| [963:90852](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90852) | H10 · Share and download your work | docs | implemented-source |
| [963:90963](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-90963) | H11 · Recover interrupted work | docs | implemented-source |
| [963:91074](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91074) | H12 · Understand your testing allowance | docs | implemented-source |
| [963:91320](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91320) | H13 · Search documentation | docs | implemented-source |
| [963:91471](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91471) | H14 · Documentation search results | docs | implemented-source |
| [963:91630](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91630) | H15 · Documentation search has no matches | docs | implemented-source |
| [963:91783](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91783) | H16 · Documentation search unavailable | docs | no-runtime-dependency |
| [963:91936](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91936) | H17 · Documentation article missing | docs | implemented-source |
| [963:91997](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=963-91997) | H18 · Documentation could not load | docs | no-runtime-dependency |
| [971:94418](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94418) | H19 · Improve words without generating media | docs | implemented-source |
| [971:94529](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=971-94529) | H20 · Select an area to edit | docs | implemented-source |
| [976:94966](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-94966) | O01 · Docs search overlay | docs | implemented-source |
| [976:94989](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-94989) | O02 · Docs results overlay | docs | implemented-source |
| [976:95014](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95014) | O03 · Docs no-results overlay | docs | implemented-source |
| [976:95033](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95033) | O04 · Docs unavailable overlay | docs | no-runtime-dependency |
| [976:95097](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95097) | O08 · Product navigation overlay | public | implemented-source |
| [959:87947](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-87947) | W01 · Landing page | public | implemented-source |
| [959:88089](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88089) | W02 · Product navigation open | public | implemented-source |
| [959:88269](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88269) | W03 · Landing page for a returning creator | public | implemented-source |
| [959:88411](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88411) | W04 · Image creation product page | public | implemented-source |
| [959:88495](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88495) | W05 · Video generation product page | public | implemented-source |
| [959:88576](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88576) | W06 · Video editing product page | public | implemented-source |
| [959:88732](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88732) | W07 · Sketch product page | public | implemented-source |
| [959:88816](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88816) | W08 · Pricing during free testing | public | implemented-source |
| [959:88920](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-88920) | W09 · Pricing questions expanded | public | implemented-source |
| [959:89028](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-89028) | W10 · Privacy policy | legal | implemented-source |
| [959:89112](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=959-89112) | W11 · Terms of service | legal | implemented-source |

### 16 · Mobile

| Node | Frame/state | Feature | Disposition |
| --- | --- | --- | --- |
| [1078:97951](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-97951) | M01 · Inspect the clip and return to the same draft | versions-viewer | implemented-source |
| [1070:89372](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1070-89372) | S35 · Highlights and replacement on a narrow screen | workspace | implemented-source |
| [1070:89804](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1070-89804) | S36 · Custom replacement on a narrow screen | workspace | implemented-source |
| [1088:100582](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100582) | Applied · S35 · 1 | workspace | shared-state-example |
| [1088:100710](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100710) | Applied · S35 · 2 | workspace | shared-state-example |
| [1088:100838](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100838) | Applied · S35 · 3 | workspace | shared-state-example |
| [1088:100482](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1088-100482) | Return · S35 | workspace | shared-state-example |
| [1097:103198](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1097-103198) | Return · S36 | workspace | shared-state-example |
| [1078:96613](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-96613) | T13 · Mobile timeline shown | video-editor | implemented-source |
| [1078:96794](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1078-96794) | T14 · Mobile timeline hidden | video-editor | implemented-source |
| [906:100187](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=906-100187) | B01 · Mobile new request | workspace | implemented-source |
| [906:100241](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=906-100241) | B02 · Mobile conversation and draft | workspace | implemented-source |
| [906:100327](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=906-100327) | B03 · Mobile editor with horizontal timeline | video-editor | implemented-source |
| [906:100486](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=906-100486) | B04 · Mobile media library | media-import | implemented-source |
| [906:100606](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=906-100606) | B06 · Mobile region selection | area-edit | capability-unavailable |
| [912:327096](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=912-327096) | B08 · Mobile Sketch with explicit acceptance | sketch | implemented-source |
| [913:327157](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=913-327157) | B09 · Mobile editor | video-editor | implemented-source |
| [936:111095](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111095) | B10 · Mobile image inspection keeps the draft | versions-viewer | implemented-source |
| [936:111179](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111179) | B11 · Mobile independent media actions | versions-viewer | implemented-source |
| [936:111304](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111304) | B12 · Mobile version history is inspection | versions-viewer | implemented-source |
| [936:111425](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111425) | B13 · Mobile request settings | capabilities | implemented-source |
| [936:111589](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111589) | B15 · Mobile import in progress | media-import | implemented-source |
| [936:111661](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111661) | B16 · Mobile import saved before choosing its use | media-import | implemented-source |
| [936:111914](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-111914) | B18 · Mobile export rendering | video-editor | implemented-source |
| [936:112092](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112092) | B19 · Mobile export ready | video-editor | implemented-source |
| [936:112272](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112272) | B20 · Mobile sharing private | share | implemented-source |
| [936:112450](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112450) | B21 · Mobile sharing published | share | implemented-source |
| [936:112630](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112630) | B22 · Mobile project actions | projects | implemented-source |
| [936:112731](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112731) | B23 · Mobile image request ready | workspace | implemented-source |
| [936:112785](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112785) | B24 · Mobile imported image starts a separate edit | workspace | implemented-source |
| [936:112857](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112857) | B25 · Mobile image running keeps the follow-up empty | workspace | implemented-source |
| [936:112937](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-112937) | B26 · Mobile image ready keeps the follow-up empty | workspace | implemented-source |
| [936:113009](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-113009) | B27 · Mobile action selection | workspace | implemented-source |
| [936:113122](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-113122) | B28 · Mobile image action chosen before writing | workspace | implemented-source |
| [936:113177](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=936-113177) | B29 · Mobile inspect a generated image explicitly | workspace | implemented-source |
| [940:113028](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=940-113028) | B30 · Mobile zoomed timeline can return to the whole edit | video-editor | implemented-source |
| [942:113105](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=942-113105) | B31 · Mobile library includes the completed import | media-import | implemented-source |
| [942:113156](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=942-113156) | B32 · Mobile inspect version two without changing the draft | versions-viewer | implemented-source |
| [945:113510](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=945-113510) | B33 · Mobile upload continues in the library | media-import | implemented-source |
| [1001:117540](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-117540) | B36 · Mobile edit history | video-editor | implemented-source |
| [1001:117612](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-117612) | B37 · Mobile earlier edit preview | video-editor | implemented-source |
| [1001:117783](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-117783) | B38 · Mobile restored arrangement | video-editor | implemented-source |
| [1001:117938](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-117938) | B39 · Mobile clip removal confirmation | video-editor | implemented-source |
| [1001:118008](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-118008) | B40 · Mobile clip removed with undo | video-editor | implemented-source |
| [1001:118161](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-118161) | B41 · Mobile editor actions | video-editor | implemented-source |
| [1001:118234](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-118234) | B42 · Mobile unsaved work blocks leaving | workspace | implemented-source |
| [1001:118528](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-118528) | B45 · Mobile preview volume | video-editor | implemented-source |
| [1001:118602](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1001-118602) | B46 · Mobile caption controls | video-editor | implemented-source |
| [1010:118852](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1010-118852) | B47 · Mobile preview muted | video-editor | implemented-source |
| [976:95052](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95052) | O05 · Mobile public navigation | public | implemented-source |
| [976:95067](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95067) | O06 · Mobile docs navigation | docs | implemented-source |
| [976:95086](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=976-95086) | O07 · Mobile account navigation | account | implemented-source |
| [980:95311](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=980-95311) | O12 · Mobile email handoff | support | implemented-source |
| [994:96661](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96661) | O13 · No email app opened | support | implemented-source |
| [994:96681](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96681) | O14 · Email address copied | support | implemented-source |
| [994:96697](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96697) | O15 · Copy the address manually | support | implemented-source |
| [994:96715](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96715) | O16 · Copy the address manually | support | implemented-source |
| [994:96733](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96733) | O17 · Support topic | support | implemented-source |
| [994:96752](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96752) | O18 · On this page | docs | implemented-source |
| [994:96773](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96773) | O19 · On this page | docs | implemented-source |
| [994:96806](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96806) | O20 · On this page | docs | implemented-source |
| [994:96843](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96843) | O21 · On this page | docs | implemented-source |
| [994:96864](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96864) | O22 · On this page | docs | implemented-source |
| [994:96885](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96885) | O23 · On this page | docs | implemented-source |
| [994:96906](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96906) | O24 · On this page | docs | implemented-source |
| [994:96927](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96927) | O25 · On this page | docs | implemented-source |
| [994:96948](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96948) | O26 · On this page | docs | implemented-source |
| [994:96969](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96969) | O27 · On this page | docs | implemented-source |
| [994:96990](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-96990) | O28 · On this page | docs | implemented-source |
| [994:97011](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97011) | O29 · On this page | docs | implemented-source |
| [994:97032](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97032) | O30 · On this page | docs | implemented-source |
| [994:97053](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97053) | O31 · On this page | docs | implemented-source |
| [994:97074](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97074) | O32 · On this page | docs | implemented-source |
| [1019:98785](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1019-98785) | O35 · Mobile navigation while signed in | public | implemented-source |
| [966:93576](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93576) | N01 · Mobile Landing page | public | implemented-source |
| [966:93657](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93657) | N02 · Mobile Public navigation | public | implemented-source |
| [966:93768](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93768) | N03 · Mobile Image product page | public | implemented-source |
| [966:93799](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93799) | N04 · Mobile Video product page | public | implemented-source |
| [966:93830](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93830) | N05 · Mobile Editor product page | public | implemented-source |
| [966:93861](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93861) | N06 · Mobile Sketch product page | public | implemented-source |
| [966:93892](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93892) | N07 · Mobile Pricing | public | implemented-source |
| [966:93935](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93935) | N08 · Mobile Sign in | auth | implemented-source |
| [966:93967](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-93967) | N09 · Mobile Sign in error | auth | implemented-source |
| [966:94001](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94001) | N10 · Mobile Sign up | auth | implemented-source |
| [966:94075](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94075) | N12 · Mobile Verify email | auth | implemented-source |
| [966:94099](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94099) | N13 · Mobile Verification error | auth | implemented-source |
| [966:94123](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94123) | N14 · Mobile Forgot password | auth | implemented-source |
| [966:94145](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94145) | N15 · Mobile Reset email sent | auth | implemented-source |
| [966:94169](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94169) | N16 · Mobile New password | auth | implemented-source |
| [966:94197](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=966-94197) | N17 · Mobile Password changed | auth | implemented-source |
| [968:93826](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-93826) | N18 · Mobile Docs home | docs | implemented-source |
| [968:93867](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-93867) | N19 · Mobile Documentation article | docs | implemented-source |
| [968:93906](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-93906) | N20 · Mobile Docs navigation | docs | implemented-source |
| [968:93983](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-93983) | N21 · Mobile Docs search | docs | implemented-source |
| [968:94016](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94016) | N22 · Mobile Docs no results | docs | implemented-source |
| [968:94043](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94043) | N23 · Mobile Profile | account | implemented-source |
| [968:94063](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94063) | N24 · Mobile Security | account | implemented-source |
| [968:94079](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94079) | N25 · Mobile Allowance | account | implemented-source |
| [968:94120](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94120) | N27 · Mobile Data and privacy | account | implemented-source |
| [968:94139](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94139) | N28 · Mobile Contact support | support | implemented-source |
| [968:94164](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94164) | N29 · Mobile Email handoff | support | implemented-source |
| [968:94206](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94206) | N30 · Mobile Privacy policy | legal | implemented-source |
| [968:94254](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94254) | N31 · Mobile Terms of service | legal | implemented-source |
| [968:94308](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94308) | N32 · Mobile Page not found | system | implemented-source |
| [968:94320](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94320) | N33 · Mobile Offline | system | implemented-source |
| [968:94332](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94332) | N34 · Mobile Account navigation | account | implemented-source |
| [968:94374](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94374) | N35 · Mobile Document table of contents | docs | implemented-source |
| [968:94433](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=968-94433) | N36 · Mobile Sign-out confirmation | account | implemented-source |
| [969:94033](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=969-94033) | N38 · Mobile First workspace visit | projects | implemented-source |
| [969:94083](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=969-94083) | N39 · Mobile Return to a project | projects | implemented-source |
| [969:94231](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=969-94231) | N44 · Mobile Signing in | auth | implemented-source |
| [969:94419](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=969-94419) | N50 · Mobile Verification checking | auth | implemented-source |
| [969:94437](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=969-94437) | N51 · Mobile Email verified | auth | implemented-source |
| [970:94310](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94310) | N54 · Mobile Get started guide | docs | implemented-source |
| [970:94349](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94349) | N55 · Mobile Image guide | docs | implemented-source |
| [970:94388](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94388) | N56 · Mobile Video guide | docs | implemented-source |
| [970:94427](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94427) | N57 · Mobile Import guide | docs | implemented-source |
| [970:94466](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94466) | N58 · Mobile History guide | docs | implemented-source |
| [970:94505](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94505) | N59 · Mobile Sketch guide | docs | implemented-source |
| [970:94544](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94544) | N60 · Mobile Model guide | docs | implemented-source |
| [970:94583](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94583) | N61 · Mobile Sharing guide | docs | implemented-source |
| [970:94622](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94622) | N62 · Mobile Recovery guide | docs | implemented-source |
| [970:94661](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94661) | N63 · Mobile Allowance guide | docs | implemented-source |
| [970:94700](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94700) | N64 · Mobile Wording guide | docs | implemented-source |
| [970:94739](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=970-94739) | N65 · Mobile Region guide | docs | implemented-source |
| [981:95300](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=981-95300) | N66 · Mobile documentation search entry | docs | implemented-source |
| [981:95320](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=981-95320) | N67 · Mobile documentation search unavailable | docs | no-runtime-dependency |
| [982:95272](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=982-95272) | N68 · Mobile account data request | support | implemented-source |
| [982:95300](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=982-95300) | N69 · Mobile account deletion request | support | implemented-source |
| [991:95933](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-95933) | N70 · Mobile Sign in validation | auth | implemented-source |
| [991:96297](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96297) | N81 · Mobile Verification email resent | auth | implemented-source |
| [991:96499](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96499) | N90 · Mobile Password reset link expired | auth | implemented-source |
| [991:96649](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96649) | N98 · Mobile Profile awaiting email verification | account | implemented-source |
| [991:96684](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96684) | N100 · Mobile Edit display name | account | implemented-source |
| [991:96761](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96761) | N104 · Mobile Google sign-in settings | account | implemented-source |
| [991:96779](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96779) | N105 · Mobile Password reset requested from account | account | implemented-source |
| [991:96798](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96798) | N106 · Mobile Testing allowance exhausted | account | implemented-source |
| [991:96813](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96813) | N107 · Mobile Usage loading | account | implemented-source |
| [991:96828](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96828) | N108 · Mobile Usage unavailable | account | implemented-source |
| [991:96861](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-96861) | N110 · Mobile No usage history yet | account | implemented-source |
| [991:97144](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-97144) | N122 · Mobile Display name validation | account | implemented-source |
| [991:97200](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-97200) | N124 · Mobile Request password reset | account | implemented-source |
| [991:97221](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-97221) | N125 · Mobile Password reset request failed | account | implemented-source |
| [991:97263](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=991-97263) | N127 · Mobile Verification resend cooldown | account | implemented-source |
| [994:97095](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97095) | N130 · Mobile support message ready | support | implemented-source |
| [994:97116](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97116) | N131 · Mobile support email invalid | support | implemented-source |
| [994:97138](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97138) | N132 · Mobile security report | support | implemented-source |
| [994:97159](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97159) | N133 · Mobile feedback | support | implemented-source |
| [994:97180](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97180) | N134 · Mobile media library empty | media-import | implemented-source |
| [994:97256](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97256) | N139 · Mobile first video edit is empty | video-editor | implemented-source |
| [994:97277](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97277) | N140 · Mobile route loading | system | implemented-source |
| [994:97287](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97287) | N141 · Mobile route failed | system | implemented-source |
| [994:97299](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97299) | N142 · Mobile service unavailable | system | implemented-source |
| [994:97311](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=994-97311) | N143 · Mobile access denied | system | implemented-source |
| [1003:98432](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1003-98432) | N146 · Mobile public shared image | share | implemented-source |
| [1003:98442](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1003-98442) | N147 · Mobile public shared export | share | implemented-source |
| [1003:98481](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1003-98481) | N148 · Mobile public link loading | share | implemented-source |
| [1003:98488](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1003-98488) | N149 · Mobile public link unavailable | share | implemented-source |
| [1003:98495](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1003-98495) | N150 · Mobile public link network failure | share | implemented-source |
| [1019:98516](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1019-98516) | N152 · Mobile pricing questions expanded | public | implemented-source |
| [1019:98732](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Vidra?node-id=1019-98732) | N153 · Mobile landing while signed in | public | implemented-source |

## Retired catalog references

These 17 null-node rows are absent from the retained census. Underlying ownership, retention, idempotency and recovery contracts survive.

| Key | Prior frame |
| --- | --- |
| workflow:C16 | C16 · Answer a specific question |
| workflow:C17 | C17 · See every reason a request cannot run |
| workflow:C24 | C24 · Use references without importing their conversation history |
| workflow:C44 | C44 · Review the exact input version |
| workflow:E23 | E23 · Review Stadium version 1 before adding |
| workflow:E25 | E25 · Add a still at its three-second default |
| workflow:E27 | E27 · Add an exact second clip version |
| workflow:P01 | P01 · Choose projects by identity |
| workflow:P03 | P03 · Project is being created |
| workflow:P04 | P04 · Retry the same project after a load error |
| workflow:P05 | P05 · Access denied without displaying private media |
| workflow:P06 | P06 · Move a project to Trash |
| workflow:P07 | P07 · Restore without restarting jobs or public links |
| workflow:P08 | P08 · Hide a version without deleting it |
| workflow:P09 | P09 · Rename without changing the work |
| workflow:P10 | P10 · Project and conversation organization |
| workflow:P11 | P11 · Conversation organization |
