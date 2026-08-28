import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

import { ToastProvider, useToast } from "@components/Toast";

// The client setup file stubs @components/Toast globally; this suite
// exercises the real module (mocking only the design-system hook beneath
// it), so opt back out of the global stub.
vi.unmock("@components/Toast");

const { toastSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
}));

vi.mock("@promptstudio/system/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock("@promptstudio/system/components/ui/toaster", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

describe("Toast", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  describe("error handling", () => {
    it("adds destructive variant and duration for error toasts", () => {
      const { result } = renderHook(() => useToast());

      result.current.error("Boom", 1500);

      expect(toastSpy).toHaveBeenCalledWith({
        description: "Boom",
        variant: "destructive",
        duration: 1500,
      });
    });

    it("omits duration when error duration is undefined", () => {
      const { result } = renderHook(() => useToast());

      result.current.error("Missing duration");

      expect(toastSpy).toHaveBeenCalledWith({
        description: "Missing duration",
        variant: "destructive",
      });
    });
  });

  describe("edge cases", () => {
    it("includes duration for success toasts when provided", () => {
      const { result } = renderHook(() => useToast());

      result.current.success("Saved", 800);

      expect(toastSpy).toHaveBeenCalledWith({
        description: "Saved",
        duration: 800,
      });
    });

    it("does not set a variant for warning toasts", () => {
      const { result } = renderHook(() => useToast());

      result.current.warning("Heads up");

      expect(toastSpy).toHaveBeenCalledWith({
        description: "Heads up",
      });
    });
  });

  describe("core behavior", () => {
    it("renders the toaster alongside children", () => {
      render(
        <ToastProvider>
          <div>Child content</div>
        </ToastProvider>,
      );

      expect(screen.getByText("Child content")).toBeInTheDocument();
      expect(screen.getByTestId("toaster")).toBeInTheDocument();
    });
  });
});
