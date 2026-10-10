import { describe, expect, it } from "vitest";

import { normalizeOpenAiSchema } from "@server/clients/adapters/openai/normalizeSchema";

function assertObjectNodesAreClosed(schemaNode: unknown): void {
  if (Array.isArray(schemaNode)) {
    for (const entry of schemaNode) {
      assertObjectNodesAreClosed(entry);
    }
    return;
  }

  if (!schemaNode || typeof schemaNode !== "object") {
    return;
  }

  const record = schemaNode as Record<string, unknown>;
  const nodeType = record.type;
  const isObjectType =
    nodeType === "object" ||
    (Array.isArray(nodeType) && nodeType.includes("object"));

  if (isObjectType || record.properties) {
    expect(record.additionalProperties).toBe(false);
  }

  for (const value of Object.values(record)) {
    assertObjectNodesAreClosed(value);
  }
}

describe("normalizeOpenAiSchema", () => {
  it("unwraps wrapper schemas and strips metadata keys", () => {
    const normalized = normalizeOpenAiSchema({
      name: "span_labeling_response",
      strict: true,
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "span-id",
        type: "object",
        properties: {
          spans: {
            type: "array",
            items: {
              type: "object",
              name: "span_item",
              strict: true,
              properties: {
                text: { type: "string", minLength: 1 },
              },
              required: ["text"],
            },
          },
        },
        required: ["spans"],
      },
    });

    expect(normalized.name).toBe("span_labeling_response");
    expect(normalized.schema.$schema).toBeUndefined();
    expect(normalized.schema.$id).toBeUndefined();
    expect(normalized.schema.name).toBeUndefined();
    expect(normalized.schema.strict).toBeUndefined();
    assertObjectNodesAreClosed(normalized.schema);
  });

  it("preserves combiners and scalar constraints while enforcing strict object closure", () => {
    const normalized = normalizeOpenAiSchema({
      name: "judge_response",
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 25 },
        notes: {
          anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
        },
        decision: {
          oneOf: [
            { type: "string", enum: ["pass", "fail"] },
            { type: "number", enum: [1, 0] },
          ],
        },
        meta: {
          allOf: [
            {
              type: "object",
              properties: {
                version: { type: "string" },
              },
              required: ["version"],
            },
          ],
        },
      },
      required: ["score", "decision"],
    });

    expect(normalized.name).toBe("judge_response");
    expect(normalized.schema.required).toEqual(["score", "decision"]);
    expect(
      (normalized.schema.properties as Record<string, unknown>).score,
    ).toEqual(
      expect.objectContaining({
        minimum: 0,
        maximum: 25,
      }),
    );
    expect(
      (normalized.schema.properties as Record<string, unknown>).notes,
    ).toEqual(
      expect.objectContaining({
        anyOf: expect.any(Array),
      }),
    );
    expect(
      (normalized.schema.properties as Record<string, unknown>).decision,
    ).toEqual(
      expect.objectContaining({
        oneOf: expect.any(Array),
      }),
    );
    expect(
      (normalized.schema.properties as Record<string, unknown>).meta,
    ).toEqual(
      expect.objectContaining({
        allOf: expect.any(Array),
      }),
    );
    assertObjectNodesAreClosed(normalized.schema);
  });
});
