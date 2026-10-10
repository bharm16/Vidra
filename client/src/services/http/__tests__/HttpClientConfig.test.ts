/**
 * Unit tests for HttpClientConfig
 *
 * Tests URL building, header merging, and factory construction.
 */

import { describe, expect, it } from "vitest";
import { HttpClientConfig } from "../HttpClientConfig";

// ---------------------------------------------------------------------------
// buildUrl - URL joining edge cases
// ---------------------------------------------------------------------------
describe("HttpClientConfig.buildUrl", () => {
  it("joins baseURL and endpoint with slash when neither has one", () => {
    const config = new HttpClientConfig({ baseURL: "http://api.test" });
    expect(config.buildUrl("users")).toBe("http://api.test/users");
  });

  it("avoids double slash when both base and endpoint have slashes", () => {
    const config = new HttpClientConfig({ baseURL: "http://api.test/" });
    expect(config.buildUrl("/users")).toBe("http://api.test/users");
  });

  it("joins correctly when only endpoint has leading slash", () => {
    const config = new HttpClientConfig({ baseURL: "http://api.test" });
    expect(config.buildUrl("/users")).toBe("http://api.test/users");
  });
});

// ---------------------------------------------------------------------------
// mergeHeaders
// ---------------------------------------------------------------------------
describe("HttpClientConfig.mergeHeaders", () => {
  it("overrides default headers with provided headers", () => {
    const config = new HttpClientConfig({
      baseURL: "http://api.test",
      defaultHeaders: { "Content-Type": "application/json" },
    });
    const merged = config.mergeHeaders({ "Content-Type": "text/plain" });
    expect(merged["Content-Type"]).toBe("text/plain");
  });

  it("adds new headers alongside defaults", () => {
    const config = new HttpClientConfig({
      baseURL: "http://api.test",
      defaultHeaders: { "Content-Type": "application/json" },
    });
    const merged = config.mergeHeaders({ Authorization: "Bearer token" });
    expect(merged["Content-Type"]).toBe("application/json");
    expect(merged.Authorization).toBe("Bearer token");
  });
});

// ---------------------------------------------------------------------------
// fromApiConfig factory
// ---------------------------------------------------------------------------
