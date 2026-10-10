import { describe, expect, it } from "vitest";

import { getCacheStorage } from "@features/span-highlighting/services/storageAdapter";

describe("storageAdapter", () => {
  it("falls back to sessionStorage when localStorage throws", () => {
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("denied");
      },
      configurable: true,
    });

    const storage = getCacheStorage();

    expect(storage).toBe(window.sessionStorage);

    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("returns null when no storage is available", () => {
    const originalLocalStorage = window.localStorage;
    const originalSessionStorage = window.sessionStorage;

    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("denied");
      },
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      get: () => {
        throw new Error("denied");
      },
      configurable: true,
    });

    expect(getCacheStorage()).toBeNull();

    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: originalSessionStorage,
      configurable: true,
    });
  });
});
