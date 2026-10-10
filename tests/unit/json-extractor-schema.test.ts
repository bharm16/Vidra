import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractAndParse } from "@utils/JsonExtractor";

describe("extractAndParse with schema validation", () => {
  const ItemSchema = z.object({
    id: z.number(),
    name: z.string(),
  });

  type Item = z.infer<typeof ItemSchema>;

  it("validates and returns typed result when schema is provided", () => {
    const result = extractAndParse(
      '{"id": 1, "name": "test"}',
      false,
      ItemSchema,
    );

    expect(result).toEqual({ id: 1, name: "test" });
  });

  it("throws ZodError when schema validation fails", () => {
    expect(() =>
      extractAndParse(
        '{"id": "not-a-number", "name": "test"}',
        false,
        ItemSchema,
      ),
    ).toThrow();
  });

  it("strips extra properties via Zod strict schema", () => {
    const StrictSchema = z.object({ id: z.number() }).strict();

    expect(() =>
      extractAndParse('{"id": 1, "extra": true}', false, StrictSchema),
    ).toThrow();
  });

  it("works with array schemas", () => {
    const ArraySchema = z.array(ItemSchema);

    const result = extractAndParse(
      '[{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]',
      true,
      ArraySchema,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, name: "a" });
  });

  it("handles markdown-wrapped JSON with schema validation", () => {
    const input = '```json\n{"id": 42, "name": "wrapped"}\n```';

    const result = extractAndParse(input, false, ItemSchema);

    expect(result).toEqual({ id: 42, name: "wrapped" });
  });
});
