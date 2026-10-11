# Model-dependent creation contract

Status: proposed design and implementation requirements, 2026-10-10. See the [source review](source-review.md) for visual evidence and remaining design gates. This supplements the [workflow state contract](../workflow/workflow-state-contract.md); existing history and request ownership rules still apply.

## Authority

Resolve the exact provider endpoint/version and operation mode before presenting executable controls. The effective profile is the intersection of documented provider support, implemented and tested adapter mappings, release policy, authorization and entitlement, and constraints from the selected inputs. A marketing model name or provider feature alone is insufficient.

The profile records its identity/revision, supported input roles and limits, output policies, parameter domains, fixed values, derived values, defaults explicitly supported by the adapter, and constraints between settings. Do not guess defaults from the first enum, minimum range or false boolean. Unknown profiles block submission. A recommendation catalog is not execution authority.

## Independent facts

| Fact | States / meaning |
| --- | --- |
| Generated sound | unsupported, always included, optionally enabled, or unknown for the resolved profile |
| Audio reference | a supported input role with its own file constraints; never implicitly a music track |
| Delivered file sound | metadata pending, present, absent, or probe failed; a model promise cannot substitute for probing the file |
| Preview audio | playback mute/volume only; changing it does not alter the saved media or export mix |
| Editor source audio | an actual stream whose export gain may be changed by an edit revision |
| Added audio | music/voiceover explicitly added by the creator; independent of whether the model generates sound |
| Captions | explicitly created/imported elements; no empty caption lane by default |

An editor begins with the selected playable media. An audio lane exists only for a verified stream or explicitly added audio. A pending waveform is not evidence of absent audio. Native source sound and added music may coexist. Removing a sound-bearing clip removes its source sound with it; it does not silently delete unrelated music or captions.

## Parameter and profile states

| State | UI behavior | Submission / transition |
| --- | --- | --- |
| Profile loading | Keep draft words/inputs; show checking state | Block until a resolved profile arrives |
| Profile failed | Preserve draft and named model; offer retry | Retry lookup, not generation |
| Profile unknown/unverified | No generic fallback controls | Block; choose another qualified model |
| Profile unavailable | Historical model remains readable | Existing results remain; new generation requires another model |
| Editable parameter | Offer exactly the valid enum/range for this profile and input state | Validate again at acceptance |
| Fixed parameter | Read-only value; no fake dropdown or toggle | Capture the effective value |
| Input-derived parameter | Show the derived value only after input metadata is known | Changing input recomputes it in a new draft revision |
| Derived value pending/invalid | Show checking or missing input, not an assumed value | Block until valid |
| Unsupported parameter/input | Omit unused controls; explicitly reject retained or dropped incompatible input | No silent dropping or provider fallback |
| Coupled change | Explain consequential changes together, such as resolution requiring duration | Apply only the confirmed set of changes |
| Compatible profile refresh | Preserve effective draft values | Use the current profile revision at the next acceptance |
| Incompatible/stale profile | Retain old values as unresolved and explain the conflict | Review before new acceptance |
| Historical setup reused | Create a new draft from captured values, then check current capabilities | Never rewrite the old request; never bypass new limits |
| Acceptance unconfirmed | Show the immutable captured request and status recovery | Same receipt/snapshot; no second creative request |

Changing models preserves compatible inputs and words. Any removed input, changed meaning or changed value is reviewed together before it is applied. The prior draft revision remains recoverable. Inspecting a model or result alone does not change the active draft. Background completion cannot steal selection or replace unrelated work.

## Verified provider facts and current adapter gaps

Facts were checked against primary documentation/public schemas on 2026-10-10. These are specific endpoints, not universal claims about a provider's other products.

| Profile / source | Relevant provider contract | Current Vidra gap |
| --- | --- | --- |
| [Google Veo 3.1](https://ai.google.dev/gemini-api/docs/veo?hl=en) | Native audio is always included on the documented Gemini path; supported duration, aspect and resolution combinations vary by input mode. Higher resolution/reference modes constrain length. Native extension has its own source eligibility. | `veoProvider.ts` targets `veo-3.1-generate-preview` and sends no audio toggle. Generic registry assumptions must not manufacture one. Qualification must bind the exact endpoint and operation. |
| [Wan 2.5 image to video](https://replicate.com/wan-video/wan-2.5-i2v/api/schema) | Image and prompt required; duration 5 or 10 seconds; 480p/720p/1080p; optional WAV/MP3 audio reference, 3–30 seconds and at most 15MB. No aspect parameter is exposed in this schema. | Current adapter drops audio reference; generic duration values include unsupported 8 seconds. Do not expose executable audio-reference support until mapping and tests exist. G13 is a proposed qualified-profile fixture; G35 represents the current missing-mapping condition. |
| [Wan 2.2 text to video](https://replicate.com/wan-video/wan-2.2-t2v-fast/api/schema) | Frame count 81–121 and generation frame rate 5–30 determine intended length; default 81/16; resolution and aspect fields exist; no reference-audio field. Output interpolation is separate from generation frame rate. | Current payload uses old keys and can change operation based on an image. Resolve mode first and align the payload; never switch provider operation invisibly after dispatch. |

`shared/videoModels.ts` release-defers Sora 2, Luma Ray 3 and Kling 2.1. Historical data remains readable. An old model ID, configured credential or recommendation entry does not establish a currently offered, qualified operation.

Actual file metadata controls playback, source sound and edit admission. A saved file may remain downloadable even when metadata checking fails. Unexpected missing sound or geometry is a needs-attention result, not a silent claim that the requested output was delivered. A saved file alone also does not establish provider-native extension eligibility.

## Dependencies and acceptance

These requirements extend existing work packages. All runtime tests below are planned, not executed.

| Order / dependency | Keep, replace, build | Acceptance evidence required |
| --- | --- | --- |
| 1. WP-07 capability contract; before executable composer | Keep historical IDs and release availability. Replace generic/manual capability assumptions. Build versioned resolved profiles with fixed/derived/unknown policies. | Each parameter/input policy has positive, negative and boundary cases; unknown profile never enables submission; unqualified adapter features stay unavailable. |
| 2. WP-07 + provider adapter ownership; after 1 | Keep supported operation implementations. Replace stale payload keys and silent operation fallback. Build exact input-to-provider mapping. | Provider-free payload tests match the pinned schema; unsupported fields and invalid duration/resolution combinations reject before dispatch. Live provider qualification remains a separate gate. |
| 3. WP-05 / WP-13 draft revisions; after 1 | Keep explicit input binding and independent drafts. Replace silent setting resets. Build model-change and coupled-change review. | Switching Wan to Veo identifies lost audio input and changed length; cancellation preserves every old field; confirming makes one new draft revision. Refresh and reuse do not mutate historical requests. |
| 4. WP-08 acceptance; after 1–3 | Keep receipts and immutable snapshots. Extend snapshot with exact profile revision/mode and effective parameters. | A stale profile rejects before execution. Lost response reuses receipt and original snapshot. Concurrent acceptance does not duplicate provider work or change input/model. |
| 5. WP-10 / WP-15 / WP-16 media; after exact output contract | Keep durable media and selection ownership. Build verified duration/dimensions/audio-stream metadata and separate waveform state. | Silent, sound-bearing, unknown, failed-probe and mismatched outputs remain distinct. Metadata failure does not relabel a clip silent. Late completion leaves unrelated work unchanged. |
| 6. WP-19 / WP-20 / WP-21 editing/export; after 5 | Build optional track admission and source-audio gain. Keep immutable media/version references. Replace fixed prepopulated track assumptions. | Silent clip starts with one visual lane; sound-bearing clip admits real source audio; music/captions appear only after explicit add; replacement preserves unrelated elements; preview mute differs from export mute. |
| 7. Visual and interaction review; before replacement UI implementation | Keep Pages 24–26 unchanged. Review Page 27 and repair its remaining source/mobile/prototype gaps. | Visually inspect relevant source, compare representative screens, walk complete model/input/recovery/result/edit journeys, then verify every declared state and rejection has a reachable interaction. |

Generation duration/shape limits do not restrict ordinary editor trimming, canvas framing or export choices. Those use media and renderer constraints. Generation does not automatically place a result into a timeline, and direct download does not require opening an editor.
