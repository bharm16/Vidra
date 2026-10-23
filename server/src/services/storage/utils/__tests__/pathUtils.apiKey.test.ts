import { expect, it } from "vitest";
import { apiKeyUid } from "@utils/apiKeyUser";
import { generateStoragePath, storagePathForBasename, validatePathOwnership } from "../pathUtils";

it("builds owned paths from nonsecret API-key principals", () => {
  const credential = "configured-test-secret";
  const owner = apiKeyUid(credential);
  const path = generateStoragePath(owner, "generation");
  expect(path).toContain(`users/${owner}/generations/`);
  expect(path).not.toContain(credential);
  expect(validatePathOwnership(path, owner)).toBe(true);
});

it.each(["api-key:retired-test-secret", `api-key:v1:${"a".repeat(64)}`, "api-key-v1:not-a-principal"])("never aliases or rebuilds unsafe API-key owner paths", old => {
  expect(() => generateStoragePath(old, "generation")).toThrow("This media is unavailable.");
  expect(() => storagePathForBasename(old, "preview-video", "clip.mp4")).toThrow("This media is unavailable.");
  expect(validatePathOwnership(`users/${old}/generations/clip.mp4`, old)).toBe(false);
  expect(validatePathOwnership(`users/${old}/generations/clip.mp4`, apiKeyUid(old.slice("api-key:".length)))).toBe(false);
});
