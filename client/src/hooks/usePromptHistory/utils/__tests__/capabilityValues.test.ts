import { describe, expect, it } from "vitest";
import { toCapabilityValues } from "../capabilityValues";

describe("toCapabilityValues", () => {
  it("keeps string, number and boolean values", () => {
    expect(
      toCapabilityValues({
        aspect_ratio: "16:9",
        duration_s: 8,
        audio: true,
      }),
    ).toEqual({ aspect_ratio: "16:9", duration_s: 8, audio: true });
  });

  // A stored entry predates any given capability set, so it can carry shapes the
  // current one has no room for. Those are dropped, not smuggled through.
  it("drops values that are not capability values", () => {
    expect(
      toCapabilityValues({
        aspect_ratio: "16:9",
        nested: { not: "flat" },
        list: [1, 2],
        missing: null,
        absent: undefined,
      }),
    ).toEqual({ aspect_ratio: "16:9" });
  });

  it("reports null when nothing usable survives", () => {
    expect(toCapabilityValues({ nested: { a: 1 } })).toBeNull();
    expect(toCapabilityValues({})).toBeNull();
  });

  it("reports null for non-objects", () => {
    expect(toCapabilityValues(null)).toBeNull();
    expect(toCapabilityValues(undefined)).toBeNull();
    expect(toCapabilityValues("16:9")).toBeNull();
    expect(toCapabilityValues(42)).toBeNull();
  });

  // Arrays are objects; a params bag never is one.
  it("reports null for an array", () => {
    expect(toCapabilityValues(["16:9"])).toBeNull();
  });
});
