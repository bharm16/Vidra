---
tags: [vault, ux, open-question]
---

# Browsing Versus Restoring

**Status: unresolved.** Two authoritative documents give opposite instructions for the same click. No code change has been made; the code currently follows the ADRs.

## The contradiction

`CLAUDE.md:371`, UX behavioural rule 1:

> Browsing is read-only. Editing is explicit. Viewing past state never mutates the current working prompt or settings. Any state restoration requires a deliberate, labeled action. If clicking something can lose the user's work, the design is wrong.

`CONTEXT.md:97`, the definition of a **Take**:

> selecting it makes it live — the camera moves to it and its paired words return to the input. **Nothing is displaced or lost by moving between takes, so no separate browse/restore step exists.**

One says restoration must be a deliberate labeled action. The other says no separate restore step exists. Not a matter of emphasis — the second sentence denies exactly what the first requires.

## Why both are reasonable

The take-restore contract descends from [[adr/0010-one-visible-text-one-loop-subscription-at-keep|ADR-0010]]'s truth contract (one visible text), through [[adr/0012-the-space-lineage-network|ADR-0012]] (selection semantics), amended by [[adr/0015-prompt-weight-tracks-the-working-step|ADR-0015]] (the composer collapses when a take has focus). Under its own premise it is coherent and good: a take is _permanently paired_ with the text that produced it, so selecting one and seeing different text would be the lie ADR-0010 exists to prevent.

The premise is that browsing happens **between** generations. The rule breaks only in the case the premise omits: the creator has typed something they have not submitted. Then "nothing is lost" is false.

## The reconciliation worth trying

> Restore the paired words **only when the input is clean**. With unsubmitted text present, selecting a take moves the camera and makes it live, but leaves the text alone.

This satisfies both documents rather than picking a winner. "Nothing is displaced or lost" stays true — nothing is lost when there is nothing to lose. "Clicking must not destroy your work" stays true. And it adds no rule for the creator to learn, because the difference is only observable in the case where the old behaviour would have annoyed them.

## Why the obvious narrow fix was rejected

Suppressing the fill for media takes while keeping it for words nodes closes the reported case but leaves a subtler one: with a clip as hero the composer is open only while a words node is focused, so selecting a take collapses it, and the only way back in is the chip — whose click refills, overwriting the edits. It also trades a documented inconsistency for an undocumented one: _clicking a words node refills, clicking a clip does not_ is harder to explain than either whole rule.

## Deciding it

This is a design call, not a defect, and it belongs to a design session rather than a bugfix batch. Whichever way it goes, the losing document has to change in the same commit — an ADR amendment if the rule wins, a `CLAUDE.md` amendment if the contract wins. Leaving both texts standing is what produced this note.

Note that [[The Verification Oracle]] cannot help here: both behaviours type-check and pass, because the disagreement is between two prose specifications.

## Related

- [[audits/2026-08-09-deep-module-audit|The 2026-08-09 deep-module audit]] — tier 1, item 7
- [[adr/0010-one-visible-text-one-loop-subscription-at-keep|ADR-0010]] · [[adr/0012-the-space-lineage-network|ADR-0012]] · [[adr/0015-prompt-weight-tracks-the-working-step|ADR-0015]]
