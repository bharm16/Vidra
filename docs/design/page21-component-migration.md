# Page 21 component migration and #177 retirement

Source: [Page 21 - Vidra design system](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c?node-id=699-23), read 2026-10-08.
Implementation baseline: `5bdcae305ac7577433ad0e84675fef6497713021`. Page 21 supersedes the earlier visual handoff for these components; #177, ADR-0002 and ADR-0022 retain the functional and backend boundaries. This change adopts component styling and supported actions; Pages 22/23 do not authorize a new draft ownership model. At 01:51 CDT on 2026-10-08 the owner explicitly replaced the visible lineage diagram: media assets form dispatch rows appended top down in the existing pannable/scrollable space, while conversation outputs and the working composer live in a side panel. Underlying ancestry records remain unchanged.

## Complete inventory

[page21-component-migration.json](page21-component-migration.json) records every one of the 963 component/set nodes by exact Figma ID, name, parent, disposition, family, implementation paths and verification method. This includes 29 variant sets. All 963 IDs were rechecked against the live page; there are no missing or duplicate IDs or unresolved implementation paths. Repeated capture definitions and Radix internals are tracked individually but use their actual shared React primitive. The 52 Krea reference nodes remain reference material; they do not add unsupported providers, audio or effects tasks.

[page21-tokens.json](page21-tokens.json) preserves the resolved design values. The shared system applies Inter, #101010 canvas, black rail, #171717 panels, translucent input/control surfaces, 40px actions, 48px form controls, 36px pills/playback, 28px compact targets, 42px menu rows, and the role-specific radii. Semantic span colors and the sketch bitmap/ink stay meaningful. Inter is self-hosted with its OFL license.

| Family                                                           | Implementation                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons, fields, switch, status, menus, dialogs and sheets       | `packages/promptstudio-system/src/`: shared tokens, utilities and accessible Radix primitives                                                  |
| Navigation, brand, desktop and compact layout                    | `client/src/components/navigation/NavRail.tsx`, `client/src/components/brand/VidraMark.tsx`                                                    |
| New and active composer, reference action, model/settings pills  | `features/workspace-shell/components/VideoComposer.tsx`, `video-composer.css`, `CanvasSettingsRow.tsx`, `VideoModelSelect.tsx`                                          |
| First frame, failure and recovery                                | `FrameStage.tsx`, `FailureNotice.tsx`; existing attachment/arming recovery remains                                                             |
| Selected image/video, playback, details and fullscreen           | `SelectedResult.tsx`; selection preserves the working draft, Reuse setup is explicit                                                           |
| Asset rows                                                       | `features/space/components/TheSpace.tsx`, `space.css`; no visible connections or prompt nodes; ancestry records and relationships are retained |
| Phrase replacement, custom requests and Copy Debug | `PromptEditorSurface.tsx`; real selection/API/keyboard wiring is preserved; named-asset autocomplete is retired                                                                  |
| Account identity and recovery                                    | `pages/AccountPage.tsx`, `account/AccountSettingsNav.tsx`; no fabricated totals or purchase actions                                            |
| Authentication, recovery and contextual gate                     | `pages/auth/`, sign-in/up/reset/verification pages, `features/auth-gate/AuthGateDialog.tsx`                                                    |
| Studio project/chat/canvas/composer and returns                  | `features/studio/studio.css`, existing Studio components and durable handoff APIs                                                              |
| Live editor tools, brush/strength controls and composer          | `features/realtime-sketch/live-editor.css`; existing sketch/acceptance contract                                                                |
| Library cards, filters and empty states                          | `pages/HistoryPage.tsx`, `pages/library/`                                                                                                      |
| Support, public clip, Settings and Shortcuts                     | Existing routes/components inherit shared system styling and retain their real actions                                                         |

Exact local Figma assets replace the brand mark and selected-result/reference icons. Example generated imagery in Figma remains dynamic media supplied by the actual result; the design screenshot is never an application asset.

## Final disposition of all twenty #177 review groups

| Group                               | Final disposition and retained behavior                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Details/Name Sheet               | Catalog-only fixture retired; shared Sheet and real fields retained                                                                                                 |
| 02 Confirm action dialog            | Catalog-only fixture retired; shared Dialog and real confirmations retained                                                                                         |
| 03 Primitive showcase/sample card   | Catalog-only fabricated composition retired; reusable controls and meaningful tests retained                                                                        |
| 04 Prompt diff                      | Comparison modal/opener and legacy editor removed                                                                                                                   |
| 05 Versions/drawers                 | Old renderer, drawer and migration state removed; prompt versions, identity, persistence and explicit reuse retained                                                |
| 06 Generations panel                | Old panel, cards, thumbnail/keyframe/Kontext presentations and exclusive tests removed; generation runtime, jobs, attachment and history retained                   |
| 07 Gallery panel/demo               | Unmounted renderer removed; still-used result types relocated to `workspace-shell/types/result.ts`; Library and landing remain                                      |
| 08 Suggestions sidebar              | Legacy sidebar removed; inline suggestions, custom requests, keyboard selection and active Copy Debug retained; dormant named-asset autocomplete removed                                        |
| 09 Credit UI                        | Approved unused banner/balance/step presentations removed; server budget enforcement and frozen economics stack retained                                            |
| 10 Floating debug                   | Disabled floating button and exclusive props removed; active Copy Debug retained                                                                                    |
| 11 Account subscription             | Fake section, unwired purchase buttons and navigation removed                                                                                                       |
| 12 Account usage                    | Fake charts, balances and activity totals removed                                                                                                                   |
| 13 Account profile placeholders     | Only actual identity, verification, password recovery and sign out remain on desktop/mobile                                                                         |
| 14 Standalone viewer                | Replaced with inline selected result, read-only details and fullscreen media; preview, decoded playback, favorite, download/share, copy and explicit reuse retained |
| 15 Older Studio controls/image pair | Design-only supersession; Studio and its durable return/download behavior preserved                                                                                 |
| 16 Alternative model choosers       | Design-only supersession; real capability-backed model selection preserved                                                                                          |
| 17 Auth archive                     | Design-only supersession; all actual auth/recovery and session-return behavior preserved                                                                            |
| 18 Older Live editor components     | Design-only supersession; supported tool functionality retained with shared styling                                                                                 |
| 19 Older Library components         | Design-only supersession; actual Library/navigation retained                                                                                                        |
| 20 Older Account components         | Design supersession and the explicitly approved placeholder cleanup; real account controls retained                                                                 |

[177-retired-files.json](177-retired-files.json) is the exact removal list. The migration flag, old connector layout/drawing helpers, composer-collapse controller and all legacy JSX mounts are gone; its old environment override cannot reopen the retired layout. Shared runtime type names containing `GenerationsPanel` remain compatibility names for the retained generation runtime, not mounted panels. No server, persistence schema, user data, billing activation or provider dispatch contract is changed.

## Verification

Focused component and browser checks protect account success/failure paths, actual result selection, camera-word preservation, explicit setup reuse, media resolution, decoding/playback, details, fullscreen return, Studio/sketch acceptance and durable reopen. Mobile result controls render outside the scaled plane so their touch targets stay usable. The final gate results and review findings are recorded below after completion.

## Owner-directed dormant frontend cleanup

The final owner direction removes registered frontend routes, controls and producers for frozen or dormant workflows. [dormant-frontend-retirement.md](dormant-frontend-retirement.md) and its [machine-readable ledger](dormant-frontend-retirement.json) list the eight workflows, ten route patterns, frontend registrations and backend counterparts. Backend status is `dormant_registered`; server registrations, gates, schemas and stored records are unchanged. The exact combined deletion list is [177-retired-files.json](177-retired-files.json).

This retires named-asset authoring/detection/autocomplete, camera/depth controls and FrameAnimator, continuity/sequence state and writers, storyboard and character/face-swap preview, model intelligence/showroom, coherence and old improver/accordion presentation, and all billing/credit UI subscriptions. Shared downloads, recovery, ordinary references, manual supported model selection, image/video generation, inline refinement, live sketch and Studio handoffs remain active. Historical metadata stays readable. Generic authoring sessions load without importing a continuity wire client, and continuity-only records do not become fabricated editable drafts in the Library.

## Direct component reconstruction

The earlier token-only pass was rejected and replaced with actual component compositions. The inventory distinguishes canonical compositions, shared primitive instances, library assets/internals, source-only references, retired frontends and the owner-superseded graph. It does not assert that old captured labels/layouts are identical to their canonical replacements.

| Family | Direct source and verified presentation |
| --- | --- |
| Video setup | 702:838: 896×280 before the first generation; 702:890: current 400×748 side editor after it; 702:923: 297×356 mobile. Uploading a reference or starting/ failing expansion does not itself switch to the side editor. One mounted editor preserves the draft, inputs and settings. |
| Selected results | 703:299354/366: media, 36px playback and result-owned actions; 703:299319: Prompt heading with sibling Copy/Close and real metadata. Inspection is read-only; reuse is explicit. Fullscreen returns to a working decoded player and seek control. |
| Normal media assets | 703:2036: 352×220 preview, 8px caption gap and 20px caption. Dispatch groups append rows below. No visible word nodes or connector paths. |
| Studio | 703:301517/300987/2329: 344×912 chat, 312×160 composer, 280px bubbles, 105×36 Thinking, stacked suggestions, 352×201.143 canvas media and 152×86.857 thread media. Mobile chat 297px and composer265px; recovery receipts can grow without overlap. |
| Live editor | 703:299711/299836/300319: 536×556 desktop panels with embedded204×36 tools and512×512 bodies; mobile297×244 panels with208×208 bodies. Composers640×136/297×192. Bitmap/pointer mapping remains512 pixels; displayed mobile geometry is tested. |
| Auth/recovery/gates | 703:301942/301972/302088/302111: visible labels,48px fields/actions,24px Google/eye glyphs, recovery/legal rows and actual return/gate reasons. All auth routes and delivery failures remain meaningful. |
| Settings | 703:302624: 640px panel/p24/r24,20px section gaps,228×32 segmented selectors,40×24 switch, actual reset/clear confirmations and Done. |
| Navigation/Library | 702:298062 and703:300519/300507: 256/64px rail,304×229 desktop cards with171px cover,36px filters; phone cards fit the remaining viewport. Menus use42px rows,12px text and right18px indicators/12px check. |
| Phrase suggestions | 703:299554 and its six states:336px panel/p16/r14; Replace/selection header,28px Close, vertical40px options and Custom request below them with72px Suggest. Real keyboard/API/debug behavior stays. |
| Support/Public/First frame | 703:2224/2248,703:308269 and active frame/recovery captures: reconstructed actual compounds, preserving drafting/copy, clip reads/auth and attachment/arming retries. |

Applied screen examples provide page placement. Canonical component geometry/material takes precedence when an applied example carries an older specimen. Dynamic titles, prompts, media, capabilities and recoveries are real application state; static sample media is not presented as a generated result.

## Recorded source discrepancies

Some Page21 stored/rendered paints disagree with bound aliases emitted by `get_design_context`. Matching the displayed component uses scoped paint overrides rather than changing every global token. Phrase suggestions render#333333 with a#292929 custom box and opaque white hairline; result details render#292929 with white hairline/labels; selected result surfaces render#121212 with#fafafa stroke. Relevant public/frame/dialog/message roots use their own exact paints. The foundation variable inventory remains preserved in page21-tokens.json.

The standalone primary-button specimen, selected Library filter, active brush and some public Sign-in captures contain white labels or glyphs on white surfaces. Production primary/filter labels and the active brush glyph remain readable black; the specified public supporting Sign-in treatment remains gray. This is a documented defective specimen, not an invented workflow. Native half-pixel outlines are represented without changing layout; Chrome at device scale1 may round physical borders to one pixel.

## Final acceptance record

Canonical desktop/mobile bounds, local SVG intrinsic sizes and actual state journeys were inspected in a real browser. Focused verification covers account/auth failures, reference removal and recovery, stable editor lifetime, result inspection/reuse/archive, downloads/share, decoded transport after fullscreen, Studio/sketch acceptance and durable reopen. Frozen route tests supply all old VITE feature variables as true and still reach404. Mandatory repository gates and the final review outcome are recorded here after the stable source check.

The [verification record](page21-verification.json) links the exact node/state evidence and gate results. The Support header uses the page-instance14px brand/36px supporting action; standalone shared-header specimens use their own18px brand. SharedClip has one72px header and bypasses the global public shell. Generic unmounted Popover/Sheet definitions remain library code; active popover/dialog callers own their verified Page21 compounds.

Final stable gates: full TypeScript and quiet ESLint, CSSlint, architecture, production build,7175 unit tests (one existing skip),36 replay integration tests and9 cross-mode browser journeys all pass. Final standards review passes after the focused-option keyboard regression was fixed and proved in browser. Source/header/controller corrections are included; server/shared remain byte-identical to the baseline. Test media transport now honors Range/206 so the fullscreen-to-inline seek proof exercises a real seekable resource; that harness change is committed separately from production implementation.

Final Spec review also passes: no remaining actionable findings. The active Docs guide and header inventory mappings were corrected, and the focused-option Arrow/Enter interaction has regression and real-browser evidence.
