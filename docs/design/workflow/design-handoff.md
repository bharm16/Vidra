# Vidra UI redesign handoff

2026-10-10. Workspace workflow design coverage; owner review and application implementation remain open. The [whole-product handoff](../product/design-handoff.md) additionally covers the public site, authentication, docs, account, support, legal and mobile surfaces. Workspace coverage alone is not a complete product design.

[Start with the workflow index](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=914-103761). [Fresh component library](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=883-84247).

## What is delivered

209 desktop/mobile scenes, 81 fresh component families, 54 icon masters, 70 new variables and seven interface text styles. The UI is native editable Figma content. No instance or text style on the workflow page references a legacy design page. The two sample photos remain content assets. States share components and layouts from this fresh system; legacy designs are not reused.

The [evidence ledger](ui-state-evidence.json) maps all **126 declared states**, **137 workflow cases**, and **33 supplemental implementation cases**. Each state has an exact component variant or screen presentation. Each behavioral case retains its original given/when/then assertion. Components compose independent facts; Figma scenario variants must not become one combined application status enum.

The completion pass added exact media/version and model selection, complete creation and assembly paths, mobile inspection/import/settings/export, and persistent access to work after its panel closes. It also repaired overlapping content in caption, wording, timing-repair, support, rename, project/conversation-menu and sign-up components. All shared component containers now pass the stacking and bounds checks.

## Complete review paths

The index links 14 starting points. These eight journeys cover the main actions; the state and acceptance indexes below cover recovery and alternate outcomes. A project fixture remains the same throughout each path.

| Journey | Main path | Additional states |
| --- | --- | --- |
| Image creation | C01 → C02 → C37 → C38 → C40 → C41 → C57 → C42 | C39 model picker; C55 settings. C57 resolves the pending input and keeps the viewer empty until the result is clicked. |
| Video creation | C46 → C47 → C49 → C50 → C58 → C51 | C48 model picker; C56 settings. Completion leaves the new draft empty. |
| Exact input selection | C54 → C43 → C44 → C45 | C52 empty search; C53 unavailable candidate. Cancel keeps the original words/input/viewer. |
| Video assembly and export | E02 → E22 → E23 → E24 → E41 → E25 → E26 → E42 → E27 → E28 → E29 → E30 → E31 → E32 → E33 → E34 → E35 → E36 → E38 → E39 | E37 download started; E40 public viewer; E43 ready export with its panel closed; E44 background rendering. |
| Mobile creation | B01 → B27 → B28 → B23 → B25 → B26 → B29 | B13 settings. The ready result is opened explicitly. |
| Mobile media inspection | B04 → B10 → B12 → B32 | B11 independent media flags; B22 project actions. Version inspection keeps the draft. |
| Mobile import | B04 → B14 → B15 → B16 → B24 | B33 progress after closing the sheet; B31 library after upload. Saving a file and using it as input are separate actions. |
| Mobile export | B09 → B17 → B18 → B19 → B20 → B21 | B03 timing; B30 zoom; B34/B35 background rendering and ready output. |

The desktop assembly fixture is **edit 5, Export 1, 11 seconds**: two four-second clips and a newly inserted three-second still. Its caption spans 1.0–3.5 seconds inside clip 1; its background audio starts at video time zero. The mobile export fixture is the separate **edit 7, Export 2, 12 seconds** used by the earlier timing studies. Keep their saved identities separate in implementation and tests.

## Review journeys

| Area | Start | Key review points |
| --- | --- | --- |
| Creation and history | [C05 — Inspect one image while editing another](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) | Explicit action and input; inspecting keeps the draft; exact branch history. |
| Drafts and conflicts | [C11 — Compare conflicting draft copies](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86329) | Both copies survive; submitting an old revision never consumes another draft. |
| Inputs and context | [C24 — Use references without importing their conversation history](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282) | Primary image, reference and mask have distinct roles; directions are reviewed. |
| Video editing | [E01 — Assemble and trim a video](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355) | Ordered visual track, attached captions/audio, independent background audio. |
| Timing changes | [E03 — Review a shorter replacement](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313197) | A 2-second replacement names the changed version and previews affected timing. |
| Export | [E06 — Review a saved video export](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313877) | Saved edit and preset are captured; current editing and file delivery are separate. |
| Media and import | [M01 — Browse project media](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-91827) | Explicit copy/use, stable upload identity and unavailable-input recovery. |
| Region editing | [M10 — Paint an area of the exact source image](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92954) | Selection is bound to the exact image; changed pixels invalidate it. |
| Sketch | [M13 — Sketch before live preview starts](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-92992) | No automatic dispatch on entry/reopen; exact displayed output is accepted. |
| Projects | [P01 — Choose projects by identity](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-93950) | Identity survives rename, archive and trash; restore does not republish. |
| Recovery | [R01 — Keep drafting offline without queuing generation](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94660) | Offline drafts, saving, authentication, jobs and usage remain independent. |
| Cancellation races | [R14 — A result finished during cancellation](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320324) | Completion before cancellation follows the accepted usage policy; R27 shows late output after confirmed cancellation without re-debit. |
| Sharing and download | [D01 — Create a share link for one version](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-96851) | Links pin one version; unknown publication/revocation stays unknown; transfer started is not file saved. |
| Future paid mode | [D09 — Review future paid work before submission](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) | Explicit maximum, delivered-slot settlement, no new allowance from an unverified payment return. |
| Mobile | [B02 — Mobile conversation and draft](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=906-100241) | Dedicated navigation, scrollable timeline, sheets and stacked comparison. |

## Interaction contract

- Generate requires an explicit action, exact eligible inputs, valid settings/context, and the current server-acknowledged draft revision. Unknown acceptance has Check status, with its frozen controls disabled.
- Opening an edit parks meaningful work. A new edit with no words shows a placeholder and disabled Generate. Reuse setup copies the original request snapshot; a variation keeps its original inputs and makes its seed policy explicit.
- An eligible single-image follow-up waits for that exact output. A video submission opens a new empty draft. Background completion never substitutes an unrelated input or moves the viewer.
- Draft conflicts retain both copies. Suggestions and answers remain proposals until explicitly applied to a writable target. Authentication loss clears rendered private work.
- Output storage and attachment are separate. Retry saving/adding uses the existing output. Lost output cannot offer impossible file repair.
- Copy audio preserves the clip’s audio settings and requires an empty background track. Muting remains a separate explicit action. This is the precise UI label for the older contract/test term “detach”.
- Add audio also requires an empty background track. Once occupied, the existing waveform/timing controls own edits to that track; an add action must not silently overwrite it.
- Closing a sheet or panel does not cancel or forget an upload/export. Library progress and the editor’s export entry reopen the same work. A ready result updates that entry without reopening its panel or moving the viewer.
- Timing examples use the initial 30 fps render profile. Newly inserted stills default to 3 seconds / 90 frames. The shorter replacement uses Stadium v3; later visual items shift, its caption/source-audio intervals remain visible until repaired, and background audio stays anchored to video time.
- Viewer playback, editor preview recovery, source availability and generation outcome are different states. Figma media is illustrative; exact frame/audio/font/render parity remains an application qualification requirement.
- Favorite, preferred and hidden are independent media flags. Naming and organization never change captured requests or exact edit sources.
- Mobile uses the same state/guard contract. Compact layouts, horizontal timeline scrolling and sheets change presentation, not ownership or request semantics.

## Verification and limits

Visual references were inspected before construction: the Krea guest agent, public video-editor/conversation demonstrations, public library illustration, live guest realtime workspace, and image-editing examples. Authenticated Krea screens that required sign-in were not treated as observed.

Representative complete scenes were rendered and checked, including the main workspace, conflict comparison, editor, corrected timing, media browser, Sketch, frozen request, and mobile editing/comparison. Every master is also checked for text bounds. Fonts, variable aliases, native node types, legacy dependencies and authentication-gate media are audited in the evidence ledger.

The prototype contains 232 click, keyboard, navigation and illustrative response transitions, including 14 index entries. All destinations resolve and all hotspots are inside their screens. Shared component containers have no detected stacking or bounds errors; visible text stays inside scene viewports, with intentional scroll areas excluded. All 9,939 component instances reference the fresh library, and the three authentication-clearing scenes contain no private image nodes.

The prototype links selected deliberate actions. Clicking an empty prompt in a creation journey advances to fixed example words; it is not functional text entry. Timed transitions show one explicit response fixture. Model and setting alternatives are defined by components and state contracts rather than a simulation of every parameter combination. It does not implement media playback, real generation, backend responses, persistence, account operations, file transfer or spending. A demonstrated successful response does not turn an unknown outcome into guaranteed success. Creation examples assume a signed-in creator; the separate authentication scenes specify guest adoption and reauthentication.

Future paid-mode amounts are example quote values, not pricing or activation. Application tests, live-provider qualification, render-parity qualification, commercial readiness and owner approval remain open. Code Connect mappings must wait for the new application components rather than pointing at incompatible legacy code.

## State index

| State | Exact component presentation | Composition examples |
| --- | --- | --- |
| `project.local` | [Project card / State=local](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85543) | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153) |
| `project.creating` | [Project card / State=creating](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85544) | [P03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94129) |
| `project.ready` | [Project card / State=ready](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85545) | [P01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-93950), [P02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94034) |
| `project.load_failed` | [Project card / State=load_failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85546) | [P04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94222) |
| `project.inaccessible` | [Project card / State=inaccessible](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85547) | [P05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94295) |
| `project.trashing` | [Project card / State=trashing](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85548) | [P06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94368) |
| `project.trashed` | [Project card / State=trashed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85549) | [P07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94461) |
| `conversation.active` | [Conversation row / State=active](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85585) | [P02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94034), [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `conversation.archiving` | [Conversation row / State=archiving](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85586) | [P11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=917-329489) |
| `conversation.archived` | [Conversation row / State=archived](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85587) | [C20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87918) |
| `connection.online` | [Connection status / State=online](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85251) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `connection.offline` | [Connection status / State=offline](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85252) | [R01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94660) |
| `connection.reconnecting` | [Connection status / State=reconnecting](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85253) | [R02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94814) |
| `authentication.guest` | [Account gate / State=guest](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=899-85574) | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153), [R09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95495) |
| `authentication.signed_in` | [Account gate / State=signed_in](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=899-85575) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `authentication.reauth_required` | [Account gate / State=reauth_required](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=899-85576) | [R06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95462) |
| `authentication.signed_out` | [Account gate / State=signed_out](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=899-85577) | [R07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95474), [R08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95486) |
| `draft.open` | [Composer / Layout=Compact, State=With input](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84462) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240), [C37](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105076), [C46](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105248), [C45](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106340), [B24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112785) |
| `draft.parked` | [Drafts menu](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=886-84904) | [C06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85685), [C21](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88070) |
| `draft.submitted` | [Submission status / State=accepted](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85188) | [R10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95566) |
| `draft.discarded` | [Notice / Tone=Warning](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-85262) | [C33](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324220) |
| `draft_save.local` | [Save indicator / State=Local](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85108) | [R01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94660) |
| `draft_save.saving` | [Save indicator / State=Saving](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85109) | [R19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321121) |
| `draft_save.saved` | [Save indicator / State=Saved](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85110) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `draft_save.failed` | [Save indicator / State=Failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85111) | [R03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94975) |
| `draft_save.conflict` | [Save indicator / State=Conflict](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85112) | [C11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86329) |
| `draft_save.local_failed` | [Save indicator / State=Browser unavailable](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=899-85615); [Save indicator / State=At risk](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85113) | [R05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95301), [R04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95138) |
| `input_target.none` | [Composer / Layout=Wide, State=Empty](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84447) | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153), [C37](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105076), [C46](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105248), [C51](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106857) |
| `input_target.version` | [Input / State=Ready](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84368) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240), [C24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282), [M12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-93132), [C45](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106340), [C57](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785), [B24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112785), [B26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112937) |
| `input_target.pending` | [Input / State=Waiting](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84369) | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854), [C08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86010), [C40](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105527), [C41](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105665), [B25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112857) |
| `input_target.choice_required` | [Input / State=Choose](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84370) | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [C30](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99322) |
| `input_target.unavailable` | [Input / State=Unavailable](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-84371) | [C22](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88253) |
| `submission.idle` | [Submission status / State=idle](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85185) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `submission.sending` | [Submission status / State=sending](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85186) | [C10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86355) |
| `submission.unknown` | [Submission status / State=unknown](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85187) | [C10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86355) |
| `submission.accepted` | [Submission status / State=accepted](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85188) | [R10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95566), [C40](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105527), [C49](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106607) |
| `submission.rejected` | [Submission status / State=rejected](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85189) | [R16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320648) |
| `submission.needs_attention` | [Submission status / State=needs_attention](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85190) | [R17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320810) |
| `request.queued` | [Request status / State=queued](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85091) | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854), [C40](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105527), [C49](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106607), [E34](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-110772) |
| `request.running` | [Request status / State=running](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85092) | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [R20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321283), [C41](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105665), [C50](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106732), [E35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-110991), [E44](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113297), [B18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-111914), [B34](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113566) |
| `request.settling` | [Request status / State=settling](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85093) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| `request.reconciling` | [Request status / State=reconciling](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85094) | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531) |
| `request.succeeded` | [Request status / State=succeeded](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85095) | [C08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86010), [C57](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785), [C58](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110934), [E36](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-111210), [E43](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113084), [B19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112092), [B35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113619) |
| `request.partial` | [Request status / State=partial](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85096) | [D10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98009) |
| `request.failed` | [Request status / State=failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85097) | [R12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320075) |
| `request.cancelled` | [Request status / State=cancelled](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85098) | [R24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324371) |
| `request.needs_attention` | [Request status / State=needs_attention](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85099) | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531) |
| `output_slot.waiting` | [Output / State=Waiting](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85023) | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854), [C40](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105527), [C49](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106607) |
| `output_slot.running` | [Output / State=Running](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85024) | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [C41](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105665), [C50](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-106732), [B25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112857) |
| `output_slot.unknown` | [Output / State=Unknown](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85025) | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531) |
| `output_slot.received` | [Output / State=Received](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85026) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| `output_slot.saving` | [Output / State=Saving](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85027) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| `output_slot.save_failed` | [Output / State=Save failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85028) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| `output_slot.stored` | [Output / State=Stored](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85029) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910), [C57](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785), [C58](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110934), [E36](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-111210), [B26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112937) |
| `output_slot.failed` | [Output / State=Failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85030) | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [C22](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88253) |
| `output_slot.output_lost` | [Output / State=Lost](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85031) | [R12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320075) |
| `output_slot.cancelled` | [Output / State=Cancelled](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=885-85032) | [R24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324371) |
| `attachment.pending` | [Attachment status / State=pending](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85137) | [M18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93648) |
| `attachment.attached` | [Attachment status / State=attached](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85138) | [M20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93924), [C57](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785), [C58](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110934), [B16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-111661) |
| `attachment.failed` | [Attachment status / State=failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85139) | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| `attachment.destination_missing` | [Attachment status / State=destination_missing](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85140) | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| `attachment.recovery_attached` | [Attachment status / State=recovery_attached](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85141) | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| `cancellation.none` | [Cancellation status / State=none](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85163) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `cancellation.requested` | [Cancellation status / State=requested](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85164) | [R20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321283) |
| `cancellation.confirmed` | [Cancellation status / State=confirmed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85165) | [R24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324371) |
| `cancellation.unable` | [Cancellation status / State=unable](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85166) | [R14](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320324) |
| `cancellation.reconciling` | [Cancellation status / State=reconciling](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85167) | [R27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=915-327905) |
| `upload.staged` | [Upload status / State=staged](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85210) | [M03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92094) |
| `upload.uploading` | [Upload status / State=uploading](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85211) | [M04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92210), [B15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-111589), [B33](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113510) |
| `upload.verifying` | [Upload status / State=verifying](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85212) | [M04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92210) |
| `upload.ready` | [Upload status / State=ready](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85213) | [M09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92839), [B16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-111661), [B31](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=942-113105) |
| `upload.failed` | [Upload status / State=failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85214) | [M05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92383) |
| `upload.rejected` | [Upload status / State=rejected](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85215) | [M03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92094) |
| `upload.missing_bytes` | [Upload status / State=missing_bytes](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85216) | [M06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92499) |
| `upload.cancelled` | [Upload status / State=cancelled](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85217) | [M07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92616) |
| `media_access.unloaded` | [Access status / State=unloaded](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85814) | [M01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-91827) |
| `media_access.loading` | [Access status / State=loading](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85815) | [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475) |
| `media_access.ready` | [Access status / State=ready](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85816) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240), [B10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-111095), [B32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=942-113156) |
| `media_access.refreshing` | [Access status / State=refreshing](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85817) | [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475) |
| `media_access.unavailable` | [Access status / State=unavailable](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85818) | [E09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314535) |
| `media_access.denied` | [Access status / State=denied](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-85819) | [P05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94295) |
| `playback.stopped` | [Playback / State=Stopped](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84912) | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [B09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=913-327157) |
| `playback.playing` | [Playback / State=Playing](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84913) | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [B09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=913-327157) |
| `playback.paused` | [Playback / State=Paused](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84914) | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [B09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=913-327157) |
| `playback.buffering` | [Playback / State=Buffering](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84915) | [E19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=912-326072) |
| `playback.ended` | [Playback / State=Ended](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84916) | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [B09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=913-327157) |
| `playback.error` | [Playback / State=Error](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=887-84917) | [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475) |
| `sketch.off` | [Sketch status / State=off](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85670) | [M13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-92992) |
| `sketch.connecting` | [Sketch status / State=connecting](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85671) | [M19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93795) |
| `sketch.live` | [Sketch status / State=live](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85672) | [M14](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93121) |
| `sketch.paused` | [Sketch status / State=paused](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85673) | [M16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93379) |
| `sketch.error` | [Sketch status / State=error](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85674) | [M15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93250) |
| `sketch.limit_reached` | [Sketch status / State=limit_reached](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85675) | [M17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93519) |
| `video_edit.empty` | [Timeline / State=Empty](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85236) | [E02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88582), [E22](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-108086), [E23](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-108302) |
| `video_edit.valid` | [Timeline / State=Valid](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85235) | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [E05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313652), [E24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-108518), [E26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-108973), [E28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-109428), [E30](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-109881), [E32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-110340), [E43](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=945-113084), [B09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=913-327157), [B30](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=940-113028) |
| `video_edit.invalid` | [Timeline / State=Invalid](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85237) | [E04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313416), [E09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314535), [E12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315205), [E20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=912-326292) |
| `sharing.private` | [Share panel / State=private](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85611) | [D01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-96851), [E38](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-111657), [B20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112272) |
| `sharing.publishing` | [Share panel / State=publishing](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85612) | [D01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-96851) |
| `sharing.publication_unknown` | [Share panel / State=publication_unknown](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85613) | [D03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97169) |
| `sharing.published` | [Share panel / State=published](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85614) | [D02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97009), [E39](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-111876), [B21](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-112450) |
| `sharing.revoking` | [Share panel / State=revoking](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85615) | [D04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97327) |
| `sharing.revocation_unknown` | [Share panel / State=revocation_unknown](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85616) | [D04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97327) |
| `sharing.revoked` | [Share panel / State=revoked](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=893-85617) | [D05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97485), [D07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97648) |
| `usage.not_required` | [Usage status / State=not_required](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85282) | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153) |
| `usage.quoted` | [Usage status / State=quoted](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85283) | [D09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) |
| `usage.quote_invalid` | [Usage status / State=quote_invalid](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85284) | [D12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98334) |
| `usage.reserving` | [Usage status / State=reserving](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85285) | [D09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) |
| `usage.reserved` | [Usage status / State=reserved](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85286) | [D09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) |
| `usage.reconciling` | [Usage status / State=reconciling](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85287) | [D10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98009) |
| `usage.settled` | [Usage status / State=settled](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85288) | [D10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98009) |
| `usage.released` | [Usage status / State=released](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85289) | [R27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=915-327905) |
| `usage.unavailable` | [Usage status / State=unavailable](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85290) | [D11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98174) |
| `clarification.waiting` | [Clarification / State=waiting](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85345) | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| `clarification.answering` | [Clarification / State=answering](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85346) | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| `clarification.proposal_ready` | [Clarification / State=proposal_ready](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85347) | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| `clarification.stale_proposal` | [Clarification / State=stale_proposal](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85348) | [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055) |
| `clarification.applied` | [Clarification / State=applied](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85349) | [C24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282) |
| `clarification.dismissed` | [Clarification / State=dismissed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85350) | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| `download.idle` | [Download status / State=idle](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85263) | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| `download.resolving` | [Download status / State=resolving](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85264) | [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658) |
| `download.started` | [Download status / State=started](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85265) | [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658), [E37](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=932-111431) |
| `download.failed` | [Download status / State=failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85266) | [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658) |
| `assistant_response.streaming` | [Assistant response / State=streaming](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85324) | [C28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98981) |
| `assistant_response.interrupted` | [Assistant response / State=interrupted](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85325) | [R18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320964) |
| `assistant_response.saved` | [Assistant response / State=saved](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85326) | [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055) |
| `assistant_response.failed` | [Assistant response / State=failed](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=889-85327) | [R18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320964) |

## Acceptance-case index

Case links identify the design surfaces for review. The application assertions remain those in [acceptance-cases.json](acceptance-cases.json) and the [implementation test plan](implementation-tests.md); visual coverage is not a passing test.

| Case | Design scenes |
| --- | --- |
| HISTORY-01 | [P01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-93950) |
| HISTORY-02 | [C13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86691) |
| HISTORY-03 | [C13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86691), [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355) |
| HISTORY-04 | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [C30](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99322) |
| HISTORY-05 | [C36](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-103895), [C13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86691) |
| HISTORY-06 | [C35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=911-325961), [C12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86518) |
| HISTORY-07 | [C31](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99497), [C32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99640) |
| HISTORY-08 | [P02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94034), [C24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282) |
| HISTORY-09 | [P09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-104105), [P10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-104277), [P11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=917-329489) |
| HISTORY-10 | [M01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-91827), [C06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85685) |
| HISTORY-11 | [M08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92723), [M09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92839) |
| HISTORY-12 | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| HISTORY-13 | [C26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98635) |
| CONTEXT-01 | [C13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86691), [C12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86518) |
| CONTEXT-02 | [C24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282) |
| CONTEXT-03 | [C12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86518), [C27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98811) |
| CONTEXT-04 | [C05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85240) |
| CONTEXT-05 | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| CONTEXT-06 | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153), [C06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85685) |
| CONTEXT-07 | [C19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87746) |
| CONTEXT-08 | [C19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87746) |
| CONTEXT-09 | [C27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98811) |
| CONTEXT-10 | [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055) |
| CONTEXT-11 | [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055), [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| CONTEXT-12 | [C16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87226) |
| CONTEXT-13 | [C18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87575) |
| CONTEXT-14 | [C25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98467) |
| CONTEXT-15 | [M10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92954), [M11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-93043) |
| DRAFT-01 | [C06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85685), [C21](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88070) |
| DRAFT-02 | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153) |
| DRAFT-03 | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854), [C08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86010) |
| DRAFT-04 | [R10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95566) |
| DRAFT-05 | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854) |
| DRAFT-06 | [C08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86010) |
| DRAFT-07 | [C22](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88253) |
| DRAFT-08 | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160), [C30](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99322) |
| DRAFT-09 | [C31](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99497), [C32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99640) |
| DRAFT-10 | [C28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98981) |
| DRAFT-11 | [R19](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321121) |
| DRAFT-12 | [R05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95301) |
| DRAFT-13 | [E15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315870) |
| DRAFT-14 | [R04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95138) |
| DRAFT-15 | [C31](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99497), [E07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314097), [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658) |
| ACTION-01 | [C34](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=911-325784), [R16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320648) |
| ACTION-02 | [P05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94295), [C17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87396) |
| ACTION-03 | [C17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87396) |
| ACTION-04 | [C14](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86903) |
| ACTION-05 | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160) |
| ACTION-06 | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854) |
| ACTION-07 | [C28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98981), [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055) |
| JOB-01 | [C10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86355), [R10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95566) |
| JOB-02 | [C11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86329), [C10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86355) |
| JOB-03 | [C10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86355) |
| JOB-04 | [R06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95462), [R21](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99780) |
| JOB-05 | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531) |
| JOB-06 | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531), [C35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=911-325961) |
| JOB-07 | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531), [R17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320810) |
| JOB-08 | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910) |
| JOB-09 | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| JOB-10 | [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160) |
| JOB-11 | [D10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98009) |
| JOB-12 | [R24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324371) |
| JOB-13 | [C22](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88253), [R24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324371) |
| JOB-14 | [R12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320075) |
| JOB-15 | [C08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86010) |
| JOB-16 | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531) |
| JOB-17 | [R20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321283) |
| JOB-18 | [R14](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320324) |
| JOB-19 | [R27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=915-327905) |
| JOB-20 | [R20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-321283), [C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160) |
| JOB-21 | [R25](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=905-324531), [R26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=909-324984) |
| JOB-22 | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244), [R27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=915-327905) |
| JOB-23 | [R18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320964) |
| MEDIA-01 | [M03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92094) |
| MEDIA-02 | [M05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92383) |
| MEDIA-03 | [M06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92499) |
| MEDIA-04 | [M04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92210), [C24](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98282) |
| MEDIA-05 | [M07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92616) |
| MEDIA-06 | [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658), [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475) |
| MEDIA-07 | [P05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94295), [D07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97648) |
| MEDIA-08 | [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475), [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355) |
| MEDIA-09 | [R15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320475) |
| MEDIA-10 | [M15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93250), [M16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93379) |
| MEDIA-11 | [M18](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93648), [M20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93924) |
| MEDIA-12 | [M16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93379) |
| MEDIA-13 | [M17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93519) |
| EDIT-01 | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [C13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86691) |
| EDIT-02 | [E04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313416), [E09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314535), [E20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=912-326292) |
| EDIT-03 | [E12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315205), [E13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315433) |
| EDIT-04 | [E14](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315643), [C34](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=911-325784) |
| EDIT-05 | [E07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314097), [E08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314315) |
| EDIT-06 | [E16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-316114) |
| EDIT-07 | [E17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-316332) |
| EDIT-08 | [E03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313197) |
| EDIT-09 | [E09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314535) |
| EDIT-10 | [E03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313197), [E04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313416), [E10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314757) |
| EDIT-11 | [E04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313416), [E05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313652) |
| EDIT-12 | [E01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=894-88355), [E15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-315870) |
| EDIT-13 | [E11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314981) |
| RESTORE-01 | [R02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94814), [C21](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-88070) |
| RESTORE-02 | [R01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94660), [R02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94814) |
| RESTORE-03 | [C11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86329) |
| RESTORE-04 | [C11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-86329), [C29](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-99142), [B05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=906-100546) |
| RESTORE-05 | [R10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95566) |
| RESTORE-06 | [R06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95462), [R08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95486) |
| RESTORE-07 | [R09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95495) |
| RESTORE-08 | [R04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95138), [R07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95474) |
| RESTORE-09 | [P04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94222), [P05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94295), [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| RESTORE-10 | [R16](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320648) |
| LIFECYCLE-01 | [M02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-91925), [P09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-104105), [C36](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-103895) |
| LIFECYCLE-02 | [P08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94546) |
| LIFECYCLE-03 | [C20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87918), [P11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=917-329489) |
| LIFECYCLE-04 | [P06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94368), [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| LIFECYCLE-05 | [P07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94461) |
| LIFECYCLE-06 | [P08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-94546), [P10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=916-104277), [P11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=917-329489) |
| LIFECYCLE-07 | [D02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97009), [E08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-314315) |
| LIFECYCLE-08 | [D03](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97169) |
| LIFECYCLE-09 | [D04](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97327), [D05](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97485) |
| LIFECYCLE-10 | [D07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97648) |
| LIFECYCLE-11 | [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658) |
| USAGE-01 | [D12](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98334) |
| USAGE-02 | [D09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) |
| USAGE-03 | [D11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98174) |
| USAGE-04 | [D10](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98009) |
| USAGE-05 | [C26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98635), [D09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97849) |
| USAGE-06 | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910), [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244) |
| USAGE-07 | [R11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-319910), [D08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-97658) |
| USAGE-08 | [D11](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=903-98174) |
| JOB-24 | [R17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320810) |
| RESTORE-11 | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244), [M08](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92723), [M09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=897-92839) |
| HISTORY-14 | [C28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98981), [E06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=895-313877) |
| ACTION-08 | [C01](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=888-85153), [C02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85349), [C23](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98166), [C37](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105076), [C38](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105161), [C46](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105248), [C47](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105333), [B28](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-113122) |
| ACTION-09 | [C26](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=904-98635) |
| JOB-25 | [C07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-85854) |
| JOB-26 | [R13](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=901-320244), [R27](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=915-327905) |
| MEDIA-14 | [M17](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93519), [M20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=898-93924) |
| CONTEXT-16 | [C20](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87918), [C15](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=891-87055), [R06](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=900-95462) |

Supplemental cases are mapped in the JSON ledger. SUP-02 and SUP-03 concern the test harness and outbound-call guard and have no product UI. The remaining supplemental cases retain their runtime/hosted qualification requirements.

## Implementation handoff

Keep the dependency order in [implementation-plan.md](implementation-plan.md). Treat the new token names as proposed CSS names, not existing implementation. Preserve the server authority, revision, receipt and recovery contracts while replacing the old UI. Do not close WP-12/G-UI until the complete design has been reviewed, or any application work package from Figma coverage alone.
