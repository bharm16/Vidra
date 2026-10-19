# Prompt editing and ongoing creation

**Design specification, 2026-10-10. Application implementation remains planned.**

Start at [Page 28's review index](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1091-101275). The [state catalog](state-catalog.json) and [interaction contract](interaction-contract.md) describe the complete declared scope, including data and interactions that do not require a visually different screen. The [implementation notes](implementation-notes.md) distinguish existing code from required changes.

The page contains 119 primary state screens: 42 prompt-editing states, 60 ongoing-workspace states, 16 timeline-visibility states, and one narrow-screen asset inspector. Additional frames show exact replacement results, dismissal without mutation, and recovery transitions. Repeated data values use the same state contract; this is not a claim that every possible prompt or combination of media has its own drawing.

## Review entry points

| Journey                                                              | Entry                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Sidebar, viewed clip and timeline together                           | [W32](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1074-93752)   |
| Phrase replacement while viewing an asset and retaining the timeline | [W48](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1075-97020)   |
| Phrase suggestions in the compact composer                           | [S07](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1056-84868)   |
| Independent requests finishing out of order                          | [W55](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1076-98261)   |
| Empty new draft with the prior asset and request retained            | [W59](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1083-97427)   |
| Timeline collapsed                                                   | [T02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1055-84811)   |
| Narrow conversation, asset and replacements                          | [S35](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1070-89372)   |
| Image editor — explicitly deferred                                   | [TODO](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1091-101743) |

## Sources visually inspected before this work

- The user-supplied C57 screenshot and [its full Figma screen](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=936-110785).
- [Page 21 phrase suggestions](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=703-299554), the corresponding React surface and CSS.
- [Populated image workspace C42](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=930-105803), the populated video-viewer component, and [partial-batch C09](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=890-86160).
- [Page 27 timeline E02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1034-86849). The user accepted its existing design; visibility states preserve it.
- [Mobile conversation B02](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=906-100241), mobile editor B03/B09, and mobile asset inspection B10.

Pages 24–27 and their masters were not edited. Page 28 uses those inspected views as context and creates the new phrase and visibility components locally. The previously recorded lack of a Krea timeline reference is no longer a blocker for this additive work: the user expressly accepted the existing timeline on 2026-10-10.

## Deliberate boundary

The dedicated image editor is **to do later**, as requested. Its tools, screen set, state contract and implementation need their own pass. No canvas, masking, crop or adjustment interface is marked complete by the prompt-wording work here.

The Figma connections are review examples with fixed fixture data. They do not execute providers, implement arbitrary text input or prove backend persistence. Acceptance requires the application tests in the linked contract. Existing model-capability, account, billing and project-recovery contracts remain in force; this page does not authorize a provider offering or paid launch.

## Review evidence

The final canvas check found no overlapping state/transition frames and no invalid prototype destinations across 610 checked node actions. Main-screen bounds passed structural inspection. Browser checks exercised timeline hide/show and exact second-option replacement/undo while retaining the viewed clip. [The workspace render](workspace-review.png) shows the combined conversation, generated asset, phrase editor and timeline.
