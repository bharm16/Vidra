import { formatLabel } from "../index";

describe("formatLabel", () => {
  it("normalizes Unicode and whitespace", () => {
    expect(formatLabel("  Ｈello\n\t world  ")).toBe("Hello world");
  });

  it("provides a label for blank text", () => {
    expect(formatLabel(" \n\t ")).toBe("Untitled");
  });

  it("preserves an already formatted label", () => {
    expect(formatLabel("My label")).toBe("My label");
  });
});
