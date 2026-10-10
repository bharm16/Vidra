import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@shared/capabilities", () => ({
  getDefaultValue: vi.fn((field: { default?: unknown }) => field.default),
  resolveFieldState: vi.fn((field: { values?: unknown[] }) => ({
    available: true,
    disabled: false,
    ...(field.values ? { allowedValues: field.values } : {}),
  })),
}));

import { validateCapabilityValues } from "../validation";
import { resolveFieldState } from "@shared/capabilities";
import type { CapabilitiesSchema, CapabilityField } from "@shared/capabilities";

type SchemaFields = Record<string, CapabilityField>;

const makeSchema = (
  fields: SchemaFields,
  unknownFields?: string[],
): CapabilitiesSchema => ({
  provider: "test",
  model: "test-model",
  version: "1.0",
  fields,
  ...(unknownFields ? { unknown_fields: unknownFields } : {}),
});

describe("validateCapabilityValues", () => {
  beforeEach(() => {
    vi.mocked(resolveFieldState).mockImplementation(
      (field: CapabilityField) => ({
        available: true,
        disabled: false,
        ...(field.values ? { allowedValues: field.values } : {}),
      }),
    );
  });

  describe("error handling — invalid field values", () => {
    it("reports error for invalid enum value", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora", "veo3", "kling"] },
      });
      const result = validateCapabilityValues(schema, {
        model: "invalid-model",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid value for model");
    });

    it("reports error for non-boolean bool field", () => {
      const schema = makeSchema({
        enabled: { type: "bool" },
      });
      const result = validateCapabilityValues(schema, { enabled: "yes" });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must be a boolean");
    });

    it("reports error for non-string string field", () => {
      const schema = makeSchema({
        label: { type: "string" },
      });
      const result = validateCapabilityValues(schema, { label: 42 });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must be a string");
    });

    it("reports error for non-integer int field", () => {
      const schema = makeSchema({
        width: { type: "int", constraints: { min: 0, max: 1920 } },
      });
      const result = validateCapabilityValues(schema, { width: 3.14 });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must be an integer");
    });

    it("reports error for int below min", () => {
      const schema = makeSchema({
        width: { type: "int", constraints: { min: 100, max: 1920 } },
      });
      const result = validateCapabilityValues(schema, { width: 50 });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must be >= 100");
    });

    it("reports error for int above max", () => {
      const schema = makeSchema({
        width: { type: "int", constraints: { min: 100, max: 1920 } },
      });
      const result = validateCapabilityValues(schema, { width: 2000 });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must be <= 1920");
    });

    it("reports error for int not aligned to step", () => {
      const schema = makeSchema({
        width: { type: "int", constraints: { min: 0, max: 1920, step: 16 } },
      });
      const result = validateCapabilityValues(schema, { width: 17 });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("must align to step 16");
    });
  });

  describe("edge cases", () => {
    it("populates default values for missing fields", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora", "veo3"], default: "sora" },
      });
      const result = validateCapabilityValues(schema, {});
      expect(result.ok).toBe(true);
      expect(result.values.model).toBe("sora");
    });

    it("preserves user-provided values over defaults", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora", "veo3"], default: "sora" },
      });
      const result = validateCapabilityValues(schema, { model: "veo3" });
      expect(result.ok).toBe(true);
      expect(result.values.model).toBe("veo3");
    });

    it("removes field when state is not available", () => {
      vi.mocked(resolveFieldState).mockReturnValue({
        available: false,
        disabled: false,
      } as never);

      const schema = makeSchema({
        model: { type: "enum", values: ["sora"] },
      });
      const result = validateCapabilityValues(schema, { model: "sora" });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("not available");
      expect(result.values.model).toBeUndefined();
    });

    it("removes field when state is disabled", () => {
      vi.mocked(resolveFieldState).mockReturnValue({
        available: true,
        disabled: true,
      } as never);

      const schema = makeSchema({
        model: { type: "enum", values: ["sora"] },
      });
      const result = validateCapabilityValues(schema, { model: "sora" });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("disabled");
    });
  });

  describe("unknown fields handling", () => {
    it("preserves camera_motion_id as allowed unknown field", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora"], default: "sora" },
      });
      const result = validateCapabilityValues(schema, {
        model: "sora",
        camera_motion_id: "pan-left",
      });
      expect(result.ok).toBe(true);
      expect(result.values.camera_motion_id).toBe("pan-left");
    });

    it("preserves subject_motion as allowed unknown field", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora"], default: "sora" },
      });
      const result = validateCapabilityValues(schema, {
        model: "sora",
        subject_motion: "walking forward",
      });
      expect(result.ok).toBe(true);
      expect(result.values.subject_motion).toBe("walking forward");
    });

    it("preserves schema-declared unknown fields", () => {
      const schema = makeSchema(
        { model: { type: "enum", values: ["sora"], default: "sora" } },
        ["custom_field"],
      );
      const result = validateCapabilityValues(schema, {
        model: "sora",
        custom_field: "custom-value",
      });
      expect(result.ok).toBe(true);
      expect(result.values.custom_field).toBe("custom-value");
    });

    it("ignores undeclared unknown fields", () => {
      const schema = makeSchema({
        model: { type: "enum", values: ["sora"], default: "sora" },
      });
      const result = validateCapabilityValues(schema, {
        model: "sora",
        random_field: "should-be-ignored",
      });
      expect(result.ok).toBe(true);
      expect(result.values.random_field).toBeUndefined();
    });
  });

  describe("core behavior — valid inputs", () => {
    it("validates int aligned to step with min offset", () => {
      const schema = makeSchema({
        frames: { type: "int", constraints: { min: 1, max: 100, step: 5 } },
      });
      // 1 + 5*3 = 16 → aligned
      const result = validateCapabilityValues(schema, { frames: 16 });
      expect(result.ok).toBe(true);
    });
  });
});
