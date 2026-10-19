import { expect, it } from "vitest";
import { DraftInputSchema } from "@shared/schemas/workflow/draft.schemas";
import { bindDraftInput } from "../state/inputBinding";

const first = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_first" });
const second = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_second" });
const third = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_third" });

it("replaces only the chosen reference, preserving the other reference and its order", () => {
  expect(bindDraftInput([first, second], third, 3, first)).toEqual([third, second]);
  expect(bindDraftInput([first, second], third, 3, { ...second })).toEqual([first, third]);
});

it("appends references only while the declared capacity has room", () => {
  const inputs = [first, second];
  expect(bindDraftInput(inputs, third, 3)).toEqual([first, second, third]);
  expect(bindDraftInput(inputs, third, 2)).toBe(inputs);
  expect(bindDraftInput(inputs, { ...first }, 3)).toBe(inputs);
});

it("does not revive a removed input when a delayed file choice completes", () => {
  const inputs = [second];
  const uploading = DraftInputSchema.parse({ state: "importing", role: "reference", importId: "import_replacement" });
  expect(bindDraftInput(inputs, uploading, 3, first)).toBe(inputs);
});

it("changes an exact pending end frame while retaining the start frame", () => {
  const start = DraftInputSchema.parse({ state: "resolved", role: "start-frame", versionId: "version_start" });
  const end = DraftInputSchema.parse({ state: "pending", role: "end-frame", requestId: "request_end", slotId: "slot_end" });
  const uploaded = DraftInputSchema.parse({ state: "importing", role: "end-frame", importId: "import_end" });
  expect(bindDraftInput([start, end], uploaded, 1, end)).toEqual([start, uploaded]);
});
