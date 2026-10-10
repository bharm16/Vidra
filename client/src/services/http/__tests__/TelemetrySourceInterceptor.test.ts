import { describe, it, expect } from "vitest";
import { TELEMETRY_SOURCE_HEADER } from "#shared/types/telemetry";
import { applyTelemetrySourceHeader } from "../TelemetrySourceInterceptor";

describe("applyTelemetrySourceHeader", () => {
  it("sets telemetry-source: user in production builds", () => {
    const built = applyTelemetrySourceHeader(
      {
        url: "/api/optimize",
        init: {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer xyz",
          },
        },
      },
      "production",
    );
    expect(built.init.headers).toMatchObject({
      [TELEMETRY_SOURCE_HEADER]: "user",
      "Content-Type": "application/json",
      Authorization: "Bearer xyz",
    });
  });

  it("omits the header in non-production builds", () => {
    const built = applyTelemetrySourceHeader(
      {
        url: "/api/optimize",
        init: { headers: { "Content-Type": "application/json" } },
      },
      "development",
    );
    expect(built.init.headers).not.toHaveProperty(TELEMETRY_SOURCE_HEADER);
  });
});
