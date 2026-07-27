import { describe, expect, it, vi } from "vitest";

import {
  getSelectionOffsets,
  restoreSelectionFromOffsets,
  selectRange,
} from "@features/prompt-optimizer/utils/textSelection";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({ error: vi.fn(), warn: vi.fn() }),
  },
}));

describe("textSelection utils", () => {
  it("computes selection offsets within an element", () => {
    const root = document.createElement("div");
    root.textContent = "Hello world";
    document.body.appendChild(root);

    const range = document.createRange();
    const textNode = root.firstChild as Text;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const offsets = getSelectionOffsets(root, range);

    expect(offsets).toEqual({ start: 0, end: 5 });
  });

  it("restores selection from offsets", () => {
    const root = document.createElement("div");
    root.textContent = "Hello world";
    document.body.appendChild(root);

    restoreSelectionFromOffsets(root, 6, 11);

    const selection = window.getSelection();
    expect(selection?.toString()).toBe("world");
  });

  it("selects a range in the window selection", () => {
    const root = document.createElement("div");
    root.textContent = "Hello world";
    document.body.appendChild(root);

    const range = document.createRange();
    const textNode = root.firstChild as Text;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    selectRange(range);

    const selection = window.getSelection();
    expect(selection?.toString()).toBe("Hello");
  });
});
