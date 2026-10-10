import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIContainer } from "../DIContainer";

describe("DIContainer", () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  describe("error handling", () => {
    it("detects circular dependencies", () => {
      container.register("a", () => ({ name: "a" }), ["b"]);
      container.register("b", () => ({ name: "b" }), ["a"]);

      expect(() => container.resolve("a")).toThrow(
        "Circular dependency detected",
      );
    });

    it("wraps dependency resolution errors with context", () => {
      container.register("service", () => ({ ok: true }), ["missing"]);

      expect(() => container.resolve("service")).toThrow(
        "Failed to resolve dependency 'missing' for service 'service'",
      );
    });
  });

  describe("core behavior", () => {
    it("resolves dependencies and caches singleton instances", () => {
      const factory = vi.fn((value: string) => ({ value }));
      container.registerValue("config", "ready");
      container.register("service", factory, ["config"]);

      const first = container.resolve<{ value: string }>("service");
      const second = container.resolve<{ value: string }>("service");

      expect(first.value).toBe("ready");
      expect(second).toBe(first);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });
});
