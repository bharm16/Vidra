import { describe, expect, it } from "vitest";
import { getCategoryColor } from "../categoryStyles";
import { DEFAULT_CATEGORY_COLOR } from "@/features/prompt-optimizer/config/categoryColors";

describe("PromptContext categoryStyles", () => {
  it("returns fallback color for invalid categories", () => {
    expect(getCategoryColor("not-a-category")).toEqual(DEFAULT_CATEGORY_COLOR);
    expect(getCategoryColor("subject.")).toEqual(DEFAULT_CATEGORY_COLOR);
  });
});
