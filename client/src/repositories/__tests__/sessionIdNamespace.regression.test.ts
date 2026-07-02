import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { isRemoteSessionId } from "../sessionIdNamespace";
import { LocalStoragePromptRepository } from "../LocalStoragePromptRepository";

/**
 * LocalStoragePromptRepository generates ids as String(Date.now()), but the
 * (formerly duplicated) isRemoteSessionId classifiers treated every
 * non-"draft-" id as remote. An anonymous creator's own saved session then
 * routed to the server loader, hit the signed-out guard, and rendered an
 * infinite "Loading prompt…" spinner at /session/<id>.
 */
describe("regression: local session ids never classify as remote", () => {
  it("classifies any digit-only id as local", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        expect(isRemoteSessionId(String(n))).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("classifies ids produced by LocalStoragePromptRepository.save as local", async () => {
    const repository = new LocalStoragePromptRepository();
    const result = await repository.save("anonymous", {
      uuid: "3f1d2c4b-5a6e-4f7d-8a9b-0c1d2e3f4a5b",
      title: "Cozy coffee shop",
      input: "a cozy coffee shop on a rainy morning",
      output: "an expanded cozy coffee shop prompt",
      mode: "video",
    });

    expect(result.id).toBeTruthy();
    expect(isRemoteSessionId(result.id)).toBe(false);
  });

  it("keeps draft ids local and server-shaped ids remote", () => {
    expect(isRemoteSessionId("draft-1782958312971")).toBe(false);
    expect(isRemoteSessionId("aB3dE5fG7hI9kL1mN0pQ")).toBe(true);
    expect(isRemoteSessionId("")).toBe(false);
    expect(isRemoteSessionId(null)).toBe(false);
    expect(isRemoteSessionId(undefined)).toBe(false);
  });
});
