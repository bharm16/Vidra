import { describe, expect, it } from "vitest";
import { bindPhrase, applyPhraseChange, reviewPhraseChange } from "../state/phraseChange";

describe("Page 28 guarded phrase application", () => {
  const draft = { id: "draft_words", sequence: 3, contextKey: "image:input-a", instructions: "Cool lights. Keep the cool lights.", writable: true };

  it("PE-A07 changes the selected occurrence and preserves all surrounding bytes", () => {
    const binding = bindPhrase(draft, 22, 33);
    expect(applyPhraseChange(draft, binding, "warm lights")).toEqual({ state: "applied", instructions: "Cool lights. Keep the warm lights." });
    expect(draft.instructions).toBe("Cool lights. Keep the cool lights.");
  });

  it("PE-A08 rejects a frozen target even when identity and revision still match", () => {
    const binding = bindPhrase(draft, 22, 33);
    expect(applyPhraseChange({ ...draft, writable: false }, binding, "warm lights")).toMatchObject({ state: "rejected", reason: "read-only" });
    expect(applyPhraseChange({ ...draft, contextKey: "image:input-b" }, binding, "warm lights")).toMatchObject({ state: "rejected", reason: "context-changed" });
  });

  it("PE-A09 explicitly reviews an identifiable stale target and retains a separate edit", () => {
    const binding = bindPhrase(draft, 22, 33);
    const current = { ...draft, sequence: 4, instructions: "Bright lamps. Keep the cool lights." };
    expect(applyPhraseChange(current, binding, "warm lights")).toMatchObject({ state: "rejected", reason: "stale" });
    const reviewed = reviewPhraseChange(current, binding);
    expect(reviewed.state).toBe("reviewable");
    if (reviewed.state !== "reviewable") throw new Error("Expected an explicit current-draft review");
    expect(applyPhraseChange(current, reviewed.binding, "warm lights")).toEqual({ state: "applied", instructions: "Bright lamps. Keep the warm lights." });
  });
});
