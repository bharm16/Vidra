import { describe, expect, it } from "vitest";
import { relocateQuote } from "../textQuoteRelocator";

describe("textQuoteRelocator", () => {
  it("returns exact match range when quote appears verbatim once", () => {
    const text = "A cinematic slow pan across the skyline.";
    const quote = "slow pan";

    const result = relocateQuote({ text, quote });

    expect(result).toEqual({
      start: text.indexOf(quote),
      end: text.indexOf(quote) + quote.length,
      exact: true,
    });
  });

  it("finds fuzzy match when quote whitespace differs", () => {
    const text = "The camera moves in a slow\n  pan to reveal the city.";
    const quote = "slow pan";

    const result = relocateQuote({ text, quote });

    expect(result).toMatchObject({
      start: text.indexOf("slow"),
      exact: false,
    });
    expect(text.slice(result!.start, result!.end)).toBe("slow\n  pan");
  });

  it("uses context scoring to pick the correct occurrence among duplicates", () => {
    const text = "intro alpha beta gamma outro alpha beta gamma end";
    const quote = "alpha beta gamma";

    const firstStart = text.indexOf(quote);
    const secondStart = text.lastIndexOf(quote);

    const result = relocateQuote({
      text,
      quote,
      leftCtx: "outro",
      rightCtx: "end",
    });

    expect(result).toEqual({
      start: secondStart,
      end: secondStart + quote.length,
      exact: true,
    });
    expect(result?.start).not.toBe(firstStart);
  });

  it("uses preferIndex distance penalty as tie-breaker", () => {
    const text = "repeat phrase and then repeat phrase again";
    const quote = "repeat phrase";
    const secondStart = text.lastIndexOf(quote);

    const result = relocateQuote({
      text,
      quote,
      preferIndex: secondStart,
    });

    expect(result?.start).toBe(secondStart);
    expect(result?.exact).toBe(true);
  });

  it("returns null when quote cannot be found or inputs are empty", () => {
    expect(relocateQuote({ text: "hello world", quote: "missing" })).toBeNull();
    expect(relocateQuote({ text: "", quote: "x" })).toBeNull();
    expect(relocateQuote({ text: "x", quote: "" })).toBeNull();
  });
});
