import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepProjectCreationIntent, readProjectCreationIntent, clearProjectCreationIntent } from "../state/projectCreationIntent";
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
describe("Stable project creation intent", () => {
  it("retains identical project/conversation identities and captured name after uncertain retries", () => {
    const first = keepProjectCreationIntent("creator", "Evening campaign");
    expect(keepProjectCreationIntent("creator", "Changed name after response loss")).toEqual(first);
    expect(readProjectCreationIntent("creator")).toEqual(first);
    expect(readProjectCreationIntent("other")).toBeUndefined();
  });
  it("clears only the acknowledged request and leaves other owners alone", () => {
    const first = keepProjectCreationIntent("creator", "Evening campaign");
    const other = keepProjectCreationIntent("other", "Other project");
    clearProjectCreationIntent("creator", "project_wrong");
    expect(readProjectCreationIntent("creator")).toEqual(first);
    clearProjectCreationIntent("creator", first.projectId);
    expect(readProjectCreationIntent("creator")).toBeUndefined();
    expect(readProjectCreationIntent("other")).toEqual(other);
  });
  it("fails before publishing when the durable intent cannot be retained", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked storage"); });
    expect(() => keepProjectCreationIntent("creator", "Evening campaign")).toThrow();
  });
  it("rejects corrupt or foreign stored intent instead of starting a new request", () => {
    sessionStorage.setItem("vidra-project-create-v1:creator", JSON.stringify({ ...keepProjectCreationIntent("other", "Other"), ownerId: "other" }));
    expect(() => keepProjectCreationIntent("creator", "New request")).toThrow();
  });
});
