import { describe, expect, it } from "vitest";
import { apiKeyUid, assertNoLegacyApiKeyData, isApiKeyUid, isLegacyApiKeyUid } from "../apiKeyUser";

const HISTORICAL_VERSIONED_KEY = `v1:${"a".repeat(64)}`;
const HISTORICAL_VERSIONED_UID = `api-key:${HISTORICAL_VERSIONED_KEY}`;

describe("API-key principals", () => {
  it("creates stable, distinct, versioned nonsecret identities while retaining API-key classification", () => {
    const credential = "configured-test-secret";
    const uid = apiKeyUid(credential);
    expect(uid).toMatch(/^api-key-v1:[a-f0-9]{64}$/);
    expect(uid).toBe(apiKeyUid(credential));
    expect(uid).not.toBe(apiKeyUid("another-test-secret"));
    expect(uid).not.toContain(credential);
    expect(isApiKeyUid(uid)).toBe(true);
    expect(isLegacyApiKeyUid(uid)).toBe(false);
    expect(isApiKeyUid("api-key:retired")).toBe(true);
    expect(isLegacyApiKeyUid("api-key:retired")).toBe(true);
    expect(isLegacyApiKeyUid("api-key:v1:not-a-principal")).toBe(true);
    expect(isApiKeyUid("firebase-owner")).toBe(false);
  });

  it("does not grandfather a historical credential shaped like a versioned digest", () => {
    const uid = apiKeyUid(HISTORICAL_VERSIONED_KEY);
    expect(uid).toMatch(/^api-key-v1:[a-f0-9]{64}$/);
    expect(uid).not.toBe(HISTORICAL_VERSIONED_UID);
    expect(uid).not.toContain(HISTORICAL_VERSIONED_KEY);
    expect(isApiKeyUid(HISTORICAL_VERSIONED_UID)).toBe(true);
    expect(isLegacyApiKeyUid(HISTORICAL_VERSIONED_UID)).toBe(true);
    expect(isApiKeyUid(uid)).toBe(true);
    expect(isLegacyApiKeyUid(uid)).toBe(false);
    expect(() => assertNoLegacyApiKeyData(uid)).not.toThrow();
  });

  it.each(["api-key-v1:", "api-key-v1:not-a-principal", `api-key-v1:${"a".repeat(63)}`, `api-key-v1:${"A".repeat(64)}`])("classifies malformed new principals as non-credit-bearing and refuses them", uid => {
    expect(isApiKeyUid(uid)).toBe(true);
    expect(isLegacyApiKeyUid(uid)).toBe(true);
    expect(() => assertNoLegacyApiKeyData(uid)).toThrow("This media is unavailable.");
  });

  it.each(["api-key:retired-test-secret", " api-key:retired-test-secret ", "users/api-key:retired-test-secret/generations/clip.mp4", "image-previews/api-key:retired-test-secret/image.png", "users/api-key%3Aretired-test-secret/generations/clip.mp4", "https://storage.googleapis.com/bucket/users%252Fapi-key%253Aretired-test-secret%252Fgenerations%252Fclip.mp4", "users%2Fapi-key%3Aretired-test-secret%2Fclip%broken", HISTORICAL_VERSIONED_UID, `users/${HISTORICAL_VERSIONED_UID}/generations/clip.mp4`, `https://storage.googleapis.com/bucket/${encodeURIComponent(`users/${HISTORICAL_VERSIONED_UID}/generations/clip.mp4`)}`])("refuses legacy identity data without reflecting it in an error", value => {
    try { assertNoLegacyApiKeyData(value); throw new Error("Expected refusal"); }
    catch (error) {
      expect(error).toMatchObject({ name: "LegacyApiKeyIdentityError", code: "AUTH_REQUIRED" });
      expect(String(error)).not.toContain("retired-test-secret");
      expect(String(error)).not.toContain(HISTORICAL_VERSIONED_KEY);
    }
  });
  it("permits ordinary identities and paths containing a new principal", () => {
    expect(() => assertNoLegacyApiKeyData(`users/${apiKeyUid("test-secret")}/generations/clip.mp4`)).not.toThrow();
    expect(() => assertNoLegacyApiKeyData("users/firebase-owner/generations/clip.mp4")).not.toThrow();
  });
});
