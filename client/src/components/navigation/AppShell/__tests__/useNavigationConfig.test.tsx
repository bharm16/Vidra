import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useNavigationConfig } from "../hooks/useNavigationConfig";

const wrapWithRouter =
  (path: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );

describe("useNavigationConfig", () => {
  describe("error handling", () => {
    it("returns none variant for auth routes", () => {
      const { result } = renderHook(() => useNavigationConfig(), {
        wrapper: wrapWithRouter("/signin"),
      });

      expect(result.current.variant).toBe("none");
      expect(result.current.currentPath).toBe("/signin");
    });
  });

  describe("edge cases", () => {
    it("returns sidebar variant for workspace exact routes", () => {
      const { result } = renderHook(() => useNavigationConfig(), {
        wrapper: wrapWithRouter("/assets"),
      });

      expect(result.current.variant).toBe("sidebar");
    });

    it("returns sidebar variant for workspace route prefixes", () => {
      const { result } = renderHook(() => useNavigationConfig(), {
        wrapper: wrapWithRouter("/prompt/abc123"),
      });

      expect(result.current.variant).toBe("sidebar");
    });
  });

  describe("core behavior", () => {
    it("defaults to topnav for non-workspace routes", () => {
      const { result } = renderHook(() => useNavigationConfig(), {
        wrapper: wrapWithRouter("/pricing"),
      });

      expect(result.current.variant).toBe("topnav");
    });
  });
});
