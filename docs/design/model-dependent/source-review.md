# Page 27 source review

Reference-source review: 2026-10-10. Current layout reconciliation: 2026-10-14. The model-dependent study is on [Page 27 — Model-dependent creation](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1026-84247). Follow-up corrections also updated shared components and dependent screens on Pages 24–26.

## Current layout — 2026-10-14

The [critique remediation](../design-critique-remediation-2026-10-14.json) replaces the separate labeled navigation, large model heading, wide model composer and icon-only submit presentation. The three retained screens and 31 reusable composer states now use the canonical 56px rail, Inter typography and the 336px-wide composer. Generate is named and full-width. Explicit inputs remain above the prompt; extra input rows have the height they need. Model, shape, duration, resolution and sound appear in a consistent order. The migration preserved the original model, input and setting values and their blocked/derived states.

G13 (audio reference input) and G14 (its file limits) were deleted on 2026-10-16: the Wan 2.5 adapter drops audio references, so no current profile can produce them. The [model-state family](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-141490), [input combinations](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-141643), and [capability limits](https://www.figma.com/design/hVtzoSXhV2rQmxc6pOYC8c/Untitled?node-id=1440-141820) retain the parameterized cases.

The earlier October 10 pass used the inspected Page 14 two-tier composition and `419:415` chips as references. Its 35-frame, 198px-high composer and round-submit descriptions are historical. The saved [Veo](veo-composer-review.png) and [Wan](wan-composer-review.png) renders also predate the current correction. They are not current visual-parity evidence.

The current layout preserves qualified controls rather than importing capabilities from a reference product. Errors remain beside the relevant work. Fixed and derived values have no fake menu action. This visual migration does not qualify a provider or adapter.

## Sources actually seen

| Source                                                                               | Visual evidence                                                                                                               | Application and limit                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Live Krea Video](https://www.krea.ai/video)                                         | Desktop Veo 3.1 and Wan 2.2, narrow composer, model selector and desktop model gallery; MiniMax H3 attachments were also seen | Primary reference for density, heading, prompt surface, icon chips, attachment placement and Generate control. Models visibly expose different controls. No generation was run.                                                |
| [Krea Video documentation](https://www.krea.ai/docs/user-guide/features/video)       | Expanded Hailuo 2.3 Fast composer and compact model menu screenshots                                                          | Reference for a smaller control set and compact selector. The live desktop catalog is now a larger gallery; the small Vidra selector intentionally follows the documented list because the proposed catalog has three entries. |
| [Krea Seedance Studio](https://www.krea.ai/docs/user-guide/features/seedance-studio) | Composer reference with references above the prompt and output settings beneath                                               | Shows another input arrangement. Its direction presets and model features are not automatically added to Vidra.                                                                                                                |
| [Krea Edit documentation](https://www.krea.ai/docs/user-guide/features/edit)         | Expanded image history and adjustment inspector                                                                               | Image editing reference only. It does not verify a video assembly timeline.                                                                                                                                                    |
| [Live Krea Edit](https://www.krea.ai/edit)                                           | Empty image editor and asset admission screen                                                                                 | Confirms this source is an image editor. No source image was uploaded or generated.                                                                                                                                            |

The live source reports Suisse Intl. That font was unavailable in the connected Figma font list; the study retains the available Inter family. Layout alignment is not a claim of exact typeface parity. Vidra navigation retains its own project and conversation contract; Krea-specific services are not copied into the product.

Krea's visible audio toggle is not authority for Vidra's provider parameters. The current Vidra Veo path does not send an audio toggle. Provider, adapter and release constraints are recorded separately in the [capability contract](capability-contract.md).

## Validation and remaining work

- The historical October 10 structural inspection covered 35 generation frames: no control-row overflow, wrapped chip labels, or visible top-level content outside the frame.
- Representative composition screenshots were inspected for G02, G07, G12, G25 and G22 across the initial and corrected passes. A chip wrapping defect was repaired before propagation.
- R01–R10 and E01–E12 remain existing Page 27 studies. They have not received the same source-alignment approval. Their earlier creation is not evidence that a matching Krea video editor was inspected.
- The video assembly timeline had no visually verified counterpart in the Krea sources opened during this correction. The user subsequently accepted the existing timeline as-is on 2026-10-10 and requested additive visibility states. [Page 28](../prompt-editing/README.md) uses that inspected existing design as its source. This does not relabel Krea's image editor as a video-timeline reference.
- Page 27's interaction wiring, mobile layouts, complete result/editor visual review, and full journey review remain open. A collection of state frames does not close these checks.
- No application implementation or provider qualification was performed. Ready-state examples are proposed validated profiles, not a claim that today's adapters pass those profiles.

Open the relevant source visibly again before continuing a different family. Record the inspected screen and compare a representative frame before expanding its variants.
