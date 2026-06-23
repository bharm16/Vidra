import { describe, expect, it } from "vitest";

import { escapeHTMLForMLHighlighting } from "@features/prompt-optimizer/utils/textFormatting";

describe("textFormatting", () => {
  it("escapes HTML and strips inline event handlers", () => {
    const result = escapeHTMLForMLHighlighting(
      '<div onclick="alert(1)">Hello & bye</div>',
    );

    expect(result).toContain("&lt;div");
    expect(result).toContain("Hello &amp; bye");
    expect(result).not.toContain("onclick");
  });

  it("wraps escaped text in ML highlighting container", () => {
    const result = escapeHTMLForMLHighlighting("Test");

    expect(result).toContain("whitespace-pre-wrap");
    expect(result).toContain("Test");
  });
});
