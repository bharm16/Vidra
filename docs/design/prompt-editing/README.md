# Prompt editing and ongoing creation

**Design specification. Current visual remediation: 2026-10-14. Application acceptance remains separate.**

Start at [Page 28's review index](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1091-101275). The [state catalog](state-catalog.json) and [interaction contract](interaction-contract.md) describe the complete declared scope, including data and interactions that do not require a visually different screen. The [implementation notes](implementation-notes.md) distinguish existing code from required changes.

After the October 14 consolidation and removals, Page 28 has **23 retained product review surfaces**: 18 desktop and five mobile. Reusable state components and preserved prototype fixtures carry the detailed cases. The earlier 116-screen count describes the October 10 snapshot, not the active review surface. The [remediation record](../design-critique-remediation-2026-10-14.json) records the current sources and verification. Repeated values use the same state contract; they do not require separate full-screen drawings.

## Review entry points

| Journey | Entry |
| --- | --- |
| Sidebar, viewed clip and timeline together | [W32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1074-93752) |
| Phrase replacement while viewing an asset and retaining the timeline | [W32 surface](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1074-93752) and [W48 state](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-183328) |
| Phrase suggestions in the compact composer | [S07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1056-84868) |
| Independent requests finishing out of order | [W07 surface](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1071-91916) and [W55 state](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-184764) |
| Empty new draft with the prior asset and request retained | [W01 surface](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1071-89958) and [W59 state](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-185457) |
| Timeline collapsed | [W33](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1074-94305) |
| Narrow conversation, asset and replacements | [S35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1070-89372) |
| Image editor — explicitly deferred | [TODO](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1091-101743) |

## Sources visually inspected before this work

- The user-supplied C57 screenshot and [its full Figma screen](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785).
- [Page 21 phrase suggestions](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=703-299554), the corresponding React surface and CSS.
- [Populated image workspace C42](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105803), the populated video-viewer component, and [partial-batch C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160).
- [Mobile conversation B02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=906-100241), mobile editor B03/B09, and mobile asset inspection B10.

The follow-up correction updated the shared Composer and media-tile components on Page 24, their dependent screens on Pages 25–26, the Page 27 editor dock, and Page 28. Highlights are automatic with no off switch. The primary composer button names and submits the selected action; the adjacent chevron changes it. Editor controls sit in a viewport-fixed dock, playback controls are compact and centered, and thumbnail metadata captions are removed. Routine Saved/Saving and replacement-success bars are absent; only actionable save warnings remain. The user expressly accepted the existing timeline design on 2026-10-10; the dedicated image editor remains deferred.

## Deliberate boundary

The dedicated image editor is **to do later**, as requested. Its tools, screen set, state contract and implementation need their own pass. No canvas, masking, crop or adjustment interface is marked complete by the prompt-wording work here.

The Figma connections are review examples with fixed fixture data. They do not execute providers, implement arbitrary text input or prove backend persistence. Acceptance requires the application tests in the linked contract. Existing model-capability, account, billing and project-recovery contracts remain in force; this page does not authorize a provider offering or paid launch.

## Current visual sources

The canonical composer remains `1175:109219`, with the touch controls variant `1482:89559`. The full media toolbar is `1379:84830`, with transport `1347:84311`. The rail variants are `1487:91133`; mobile navigation remains `906:85756`. Request and slot failures use `1494:125628`. Review guides use header `1521:90056` and link `1524:90056`. Preserve the approved 640 × 360px desktop preview limit and the deferred image editor.

## Review evidence

The October 14 [remediation record](../design-critique-remediation-2026-10-14.json) is the current geometry and visual-review record for Pages 24–29. It separates retained product surfaces, source reviews, intentional scrolling, archived fixtures and application acceptance.


The original canvas check found no overlapping state/transition frames and no invalid prototype destinations across 610 checked node actions. Browser checks at that point exercised timeline hide/show and exact second-option replacement/undo while retaining the viewed clip. Those checks preceded the follow-up correction. The current Figma pass visually inspected the fixed dock, compact composer, and caption-free history, and audited the removed controls and labels; application and browser acceptance for the revised behavior remains open. [The earlier workspace render](workspace-review.png) predates these corrections.
