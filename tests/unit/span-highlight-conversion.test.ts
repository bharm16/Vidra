import { describe, expect, it } from "vitest";

import { convertLabeledSpansToHighlights } from "@features/span-highlighting/utils/highlightConversion";
import { TAXONOMY } from "@shared/taxonomy";

describe("highlightConversion", () => {
  it("trusts the server-normalized category and drops spans without one", () => {
    // Public span category contract: normalization happens once, server-side
    // (toPublicSpan). The client trusts `category`; role-only spans are
    // structurally invalid.
    const text = "Subject";
    const result = convertLabeledSpansToHighlights({
      spans: [
        { start: 0, end: 7, category: TAXONOMY.SUBJECT.id },
        { start: 0, end: 7, role: "Subject" },
      ],
      text,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe(TAXONOMY.SUBJECT.id);
  });

  it("merges adjacent spans with same parent category", () => {
    const text = "Park\nscene";
    const spans = [
      { start: 0, end: 4, category: TAXONOMY.ENVIRONMENT.attributes.LOCATION },
      { start: 5, end: 10, category: TAXONOMY.ENVIRONMENT.attributes.CONTEXT },
    ];

    const result = convertLabeledSpansToHighlights({ spans, text });

    expect(result).toHaveLength(1);
    expect(result[0]?.start).toBe(0);
    expect(result[0]?.end).toBe(10);
    expect(result[0]?.quote).toBe("Park\nscene");
  });
});
