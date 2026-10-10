import { describe, expect, it } from "vitest";

import { ApiErrorFactory } from "../ApiErrorFactory";

describe("ApiErrorFactory", () => {
  it("createNetwork uses error.message when available", () => {
    const factory = new ApiErrorFactory();

    const error = factory.createNetwork(new Error("ECONNRESET"));

    expect(error.message).toBe("ECONNRESET");
  });

  it("createNetwork falls back to generic network message", () => {
    const factory = new ApiErrorFactory();

    const error = factory.createNetwork({ code: 10 });

    expect(error.message).toBe("Network error");
  });
});
