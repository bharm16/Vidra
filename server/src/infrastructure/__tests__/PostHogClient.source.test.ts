import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureSpy = vi.fn();
const shutdownSpy = vi.fn(async () => {});

vi.mock("posthog-node", () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: captureSpy,
      shutdown: shutdownSpy,
    })),
  };
});

import { createPostHogClient } from "../PostHogClient";
import { runWithRequestContext } from "../requestContext";

describe("PostHogClient source stamping", () => {
  const originalKey = process.env.POSTHOG_API_KEY;
  beforeEach(() => {
    captureSpy.mockClear();
    process.env.POSTHOG_API_KEY = "phc_test_key";
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
  });

  it("stamps source from ALS onto captured properties", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { foo: "bar" },
      });
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0]![0]!.properties).toEqual({
      source: "user",
      foo: "bar",
      harnessVersion: expect.any(String),
    });
  });

  it("defaults source to 'unknown' when no request context", () => {
    const client = createPostHogClient();
    client.capture({
      distinctId: "d1",
      event: "test.event",
      properties: { foo: "bar" },
    });
    expect(captureSpy.mock.calls[0]![0]!.properties).toEqual({
      source: "unknown",
      foo: "bar",
      harnessVersion: expect.any(String),
    });
  });

  it("explicit properties.source wins over ALS source", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { source: "synthetic", foo: "bar" },
      });
    });
    expect(captureSpy.mock.calls[0]![0]!.properties).toEqual({
      source: "synthetic",
      foo: "bar",
      harnessVersion: expect.any(String),
    });
  });

  it("handles missing properties object", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "ci" }, () => {
      client.capture({ distinctId: "d1", event: "test.event" });
    });
    expect(captureSpy.mock.calls[0]![0]!.properties).toEqual({
      source: "ci",
      harnessVersion: expect.any(String),
    });
  });
});

describe("PostHogClient harnessVersion stamping (F5)", () => {
  const originalKey = process.env.POSTHOG_API_KEY;
  const originalHarnessVersion = process.env.HARNESS_VERSION;

  beforeEach(() => {
    captureSpy.mockClear();
    process.env.POSTHOG_API_KEY = "phc_test_key";
    process.env.HARNESS_VERSION = "test-harness-abc123";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
    if (originalHarnessVersion === undefined)
      delete process.env.HARNESS_VERSION;
    else process.env.HARNESS_VERSION = originalHarnessVersion;
  });

  it("stamps harnessVersion onto captured properties", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { foo: "bar" },
      });
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const properties = captureSpy.mock.calls[0]![0]!.properties as Record<
      string,
      unknown
    >;
    expect(properties.harnessVersion).toBe("test-harness-abc123");
    expect(properties.source).toBe("user");
    expect(properties.foo).toBe("bar");
  });

  it("explicit properties.harnessVersion wins over env (override channel)", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { harnessVersion: "override-xyz" },
      });
    });
    const properties = captureSpy.mock.calls[0]![0]!.properties as Record<
      string,
      unknown
    >;
    expect(properties.harnessVersion).toBe("override-xyz");
  });
});
