# Creation has no required order; images, clips, and finished videos are intended outputs

**Status:** Accepted product direction — 2026-10-09. Implementation pending. The owner explicitly chose all three outputs, rejected the sequence itself, and requested amendments to `CONTEXT.md`. This records that direction; the detailed redesign, storage changes, commercial offer, and implementation are still to be worked out.

Vidra's earlier decisions made one path—expand words, make a picture, animate it—the governing workflow. The current implementation consequently decides what “Generate” means from whether a starting image exists. That does not express what the creator asked to make. It also cannot describe someone editing an image, generating a clip, and preparing a finished video in the same body of work.

## Decision

1. **Support all three outputs.** Images, individual video clips, and finished videos, including ads, belong in the product direction. An image is a complete output in its own right. A finished video requires editing and export capabilities beyond making a clip; those are currently missing.
2. **Remove the mandatory sequence.** Starting from text, an image, a sketch, or existing footage must not force the creator through unrelated generation steps. Description expansion and starting-image generation remain available when wanted. A provider may require a particular input; the interface must explain that requirement for the chosen action.
3. **Make the action explicit.** The creator must be able to understand what will run and what it will act on. One global text field and one overall workspace stage are no longer universal product constraints. Looking at a result, preparing a request, waiting for a job, saving a result, and exporting work need independent treatment.
4. **Preserve existing work.** Explicit setup reuse, recorded inputs, durable media identity, ownership checks, dispatch snapshots, and recovery without duplicate generation remain requirements. Changing the product direction does not rewrite saved records or require replacing functioning services.
5. **Use plain language.** Product explanations should name the work: make an image, edit this picture, generate a clip, trim a video, add text, export. A new abstract label must not conceal the same forced sequence.

## Earlier decisions amended

| ADR  | Change                                                                                                                                  | Retained                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0002 | A single clip and expansion-first are no longer the entire product. Authoring intelligence is not an established competitive advantage. | The existing implementation boundaries and saved-record compatibility remain until concrete replacement work changes them.                                            |
| 0009 | Exactly three resident elements and one prescribed next action no longer constrain the redesign.                                        | Avoid meaningless empty players; expose controls when they help the actual work.                                                                                      |
| 0010 | S0–S6 and one global visible prose field no longer define every workflow.                                                               | Explicit inputs, understandable actions, snapshots at dispatch, preserved work, and failure recovery. The historical paid Keep offer remains inactive under ADR-0023. |
| 0011 | D1 and D2 remain descriptions of legacy session storage and stage derivation, not requirements for every new action or output.          | Preserve old input/output records, version history, persisted takes, and compatibility.                                                                               |
| 0015 | Focus and composer visibility must not be governed by a mandatory creation step.                                                        | Current draft and inspection independence; background work must not steal focus.                                                                                      |

The separate Studio/session records and handoffs in ADR-0019/0022 are current implementation facts. Whether to present them within a common project is a design question reopened by this direction, not a storage migration authorized by this ADR. ADR-0022's restriction on new operation records should be reconsidered if a concrete design needs durable requests across media types; no replacement collection or shared scheduler is decided here.

## Consequences

The old sequence may remain in source while it is replaced, but it must not be cited as a reason to reject a coherent alternative. `CONTEXT.md` now separates intended behavior from shipped behavior. Page 21 remains the implemented component reference; no new layout is approved by this text.

The proposed workflow, state separation, evidence, and build order are in [the assessment](../design/2026-10-09-product-and-workflow-reset.md). They require detailed design and implementation before the new product behavior can be claimed. ADR-0023's free testing policy, existing allowances, provider exclusions, and preservation of legacy refund recovery remain unchanged.

## Considered alternatives

- **Patch the fixed sequence.** This can fix individual bugs but keeps the wrong action-selection rule and does not cover the requested outputs.
- **Choose just one output.** The owner explicitly chose images, clips, and finished videos. Delivery can be staged without defining the other outputs out of the product.
- **Immediately rewrite every mode and storage record.** The evidence does not justify discarding durable media, admission receipts, job recovery, image editing, or existing data. Define the common behavior and adapt working services before choosing migrations.
