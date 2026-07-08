import type { RefObject } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAnchorDraft,
  readAnchorDraft,
  writeAnchorDraft,
} from "../../utils/anchorDraft";
import { useAnchorDraft } from "../useAnchorDraft";

function makeEditor(text = ""): {
  ref: RefObject<HTMLElement>;
  el: HTMLElement;
} {
  const el = document.createElement("div");
  el.textContent = text;
  document.body.appendChild(el);
  return { ref: { current: el }, el };
}

describe("useAnchorDraft", () => {
  afterEach(() => {
    clearAnchorDraft();
    document.body.innerHTML = "";
  });

  it("persists the pre-work prompt", () => {
    const { ref } = makeEditor();
    renderHook(() =>
      useAnchorDraft({
        isPreWork: true,
        prompt: "a lighthouse",
        editorRef: ref,
      }),
    );
    expect(readAnchorDraft()).toBe("a lighthouse");
  });

  it("clears the draft once work starts (not pre-work)", () => {
    writeAnchorDraft("stale");
    const { ref } = makeEditor();
    renderHook(() =>
      useAnchorDraft({ isPreWork: false, prompt: "", editorRef: ref }),
    );
    expect(readAnchorDraft()).toBe("");
  });

  it("does not wipe the stored draft on a momentarily empty pre-work prompt", () => {
    writeAnchorDraft("keep");
    const { ref } = makeEditor("keep");
    renderHook(() =>
      useAnchorDraft({ isPreWork: true, prompt: "", editorRef: ref }),
    );
    expect(readAnchorDraft()).toBe("keep");
  });

  it("restores a stored draft into an empty editor via an input event", async () => {
    writeAnchorDraft("restore me");
    const { ref, el } = makeEditor("");
    const inputSpy = vi.fn();
    el.addEventListener("input", inputSpy);
    renderHook(() =>
      useAnchorDraft({ isPreWork: true, prompt: "", editorRef: ref }),
    );
    await vi.waitFor(() => expect(el.textContent).toBe("restore me"), {
      timeout: 1000,
    });
    expect(inputSpy).toHaveBeenCalled();
  });

  it("never clobbers an editor that already holds words", async () => {
    writeAnchorDraft("draft");
    const { el, ref } = makeEditor("user words");
    renderHook(() =>
      useAnchorDraft({ isPreWork: true, prompt: "user words", editorRef: ref }),
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(el.textContent).toBe("user words");
  });
});
