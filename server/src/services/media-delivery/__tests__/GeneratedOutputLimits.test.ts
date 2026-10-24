import { expect, it } from "vitest";
import { GENERATED_PICTURE_MAX_BYTES, GeneratedOutputCommandSchema, ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";

it("lets generated pictures exceed the 10 MB upload limit while uploads keep it", () => {
  const command = { id: "import_large", filename: "Picture.png", contentType: "image/png", bytes: 11 * 1024 * 1024, sha256: "a".repeat(64) };
  expect(ImportCommandSchema.safeParse(command).success).toBe(false);
  expect(GeneratedOutputCommandSchema.safeParse(command).success).toBe(true);
  expect(GeneratedOutputCommandSchema.safeParse({ ...command, bytes: GENERATED_PICTURE_MAX_BYTES + 1 }).success).toBe(false);
});
