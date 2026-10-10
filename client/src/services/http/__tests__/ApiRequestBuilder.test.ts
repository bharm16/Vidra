import { describe, it, expect, vi } from "vitest";
import { ApiRequestBuilder } from "../ApiRequestBuilder";
import { HttpClientConfig } from "../HttpClientConfig";

describe("ApiRequestBuilder", () => {
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
    const config = HttpClientConfig.fromApiConfig({
      baseURL: "https://api.test",
      timeout: { default: 5000 },
    });

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/resource", {
      method: "POST",
      body: { name: "Ada", active: true },
    });

    expect(result.init.method).toBe("POST");
    expect(result.url).toBe("https://api.test/resource");
    expect(new Headers(result.init.headers).get("Content-Type")).toBe(
      "application/json",
    );
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

  it("skips the automatic timeout signal for streaming requests", () => {
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/stream"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/stream", {
      method: "POST",
      body: "{}",
      stream: true,
    });

    // A timeout would abort a long-lived NDJSON stream mid-flight.
    expect(config.createSignal).not.toHaveBeenCalled();
    expect(result.init.signal).toBeUndefined();
  });

  it("still honors an explicit signal on a streaming request", () => {
    const providedSignal = new AbortController().signal;
    const config = {
      buildUrl: vi.fn().mockReturnValue("https://api.test/stream"),
      mergeHeaders: vi.fn().mockReturnValue({}),
      createSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as HttpClientConfig;

    const builder = new ApiRequestBuilder(config);
    const result = builder.build("/stream", {
      method: "POST",
      stream: true,
      signal: providedSignal,
    });

    expect(config.createSignal).not.toHaveBeenCalled();
    expect(result.init.signal).toBe(providedSignal);
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
