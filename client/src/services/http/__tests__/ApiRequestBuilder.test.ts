import { describe, it, expect, vi } from "vitest";
import { ApiRequestBuilder } from "../ApiRequestBuilder";
import type { HttpClientConfig } from "../HttpClientConfig";

describe("ApiRequestBuilder", () => {
  it("builds a default GET request with merged headers and timeout signal", () => {
    const signal = new AbortController().signal;
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/users"),
      mergeHeaders: vi.fn().mockReturnValue({ "X-Test": "1" }),
      createSignal: vi.fn().mockReturnValue(signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/users");

    expect(config.buildUrl).toHaveBeenCalledWith("/users");
    expect(config.mergeHeaders).toHaveBeenCalledWith(undefined);
    expect(config.createSignal).toHaveBeenCalledWith(undefined);
    expect(result.url).toBe("https://api.test/users");
    expect(result.init.method).toBe("GET");
    expect(result.init.headers).toEqual({ "X-Test": "1" });
    expect(result.init.signal).toBe(signal);
    expect(result.init.body).toBeUndefined();
  });

  it("prefers provided signal over generated timeout signal", () => {
    const fallbackSignal = new AbortController().signal;
    const providedSignal = new AbortController().signal;
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/resource"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(fallbackSignal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/resource", {
      signal: providedSignal,
      timeout: 999,
    });

    expect(config.createSignal).not.toHaveBeenCalled();
    expect(result.init.signal).toBe(providedSignal);
  });

  it("serializes object body for non-GET methods", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/resource"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/resource", {
      method: "POST",
      body: { name: "Ada", active: true },
    });

    expect(result.init.method).toBe("POST");
    expect(result.init.body).toBe(
      JSON.stringify({ name: "Ada", active: true }),
    );
  });

  it("does not include body for GET and HEAD requests", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/resource"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const getReq = builder.build("/resource", {
      method: "GET",
      body: { ignored: true },
    });
    const headReq = builder.build("/resource", {
      method: "HEAD",
      body: "ignored",
    });

    expect(getReq.init.body).toBeUndefined();
    expect(headReq.init.body).toBeUndefined();
  });

  it("passes through FormData, string, and Blob bodies unchanged", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/resource"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);

    const formData = new FormData();
    formData.append("file", new Blob(["x"]), "x.txt");
    const formReq = builder.build("/resource", {
      method: "POST",
      body: formData,
    });
    expect(formReq.init.body).toBe(formData);

    const textReq = builder.build("/resource", {
      method: "PUT",
      body: "raw-text",
    });
    expect(textReq.init.body).toBe("raw-text");

    const blob = new Blob(["content"], { type: "text/plain" });
    const blobReq = builder.build("/resource", { method: "PATCH", body: blob });
    expect(blobReq.init.body).toBe(blob);
  });

  it("strips the default Content-Type for FormData so the browser sets the multipart boundary", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/upload"),
      mergeHeaders: vi.fn().mockReturnValue({
        "Content-Type": "application/json",
        Authorization: "Bearer x",
      }),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const formData = new FormData();
    formData.append("file", new Blob(["x"]), "x.txt");
    const result = builder.build("/upload", { method: "POST", body: formData });

    expect(result.init.body).toBe(formData);
    // Content-Type gone (browser adds multipart/form-data; boundary), auth kept.
    expect(result.init.headers).toEqual({ Authorization: "Bearer x" });
  });

  it("merges fetchOptions into request init", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/resource"),
      mergeHeaders: vi
        .fn()
        .mockReturnValue({ "Content-Type": "application/json" }),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/resource", {
      method: "POST",
      body: { ok: true },
      fetchOptions: {
        mode: "cors",
        credentials: "include",
        cache: "no-store",
      },
    });

    expect(result.init.mode).toBe("cors");
    expect(result.init.credentials).toBe("include");
    expect(result.init.cache).toBe("no-store");
    expect(result.init.headers).toEqual({ "Content-Type": "application/json" });
  });
});
