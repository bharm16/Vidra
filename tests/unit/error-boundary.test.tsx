import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  ErrorBoundary,
  FeatureErrorBoundary,
} from "@/components/ErrorBoundary";
import { logger } from "@/services/LoggingService";
import * as Sentry from "@sentry/react";

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(() => "event-id"),
  showReportDialog: vi.fn(),
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("ErrorBoundary", () => {
  const mockLogger = vi.mocked(logger);
  const mockSentry = vi.mocked(Sentry);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("renders default fallback UI and reports errors", () => {
      const Thrower = () => {
        throw new Error("boom");
      };

      render(
        <ErrorBoundary title="Oops" message="Try again">
          <Thrower />
        </ErrorBoundary>,
      );

      expect(screen.getByText("Oops")).toBeInTheDocument();
      expect(screen.getByText("Try again")).toBeInTheDocument();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error caught by boundary",
        expect.any(Error),
        expect.objectContaining({ component: "ErrorBoundary" }),
      );
      expect(mockSentry.captureException).toHaveBeenCalled();
    });

    it("resets after a custom fallback reset handler", () => {
      let shouldThrow = true;
      const Thrower = () => {
        if (shouldThrow) {
          throw new Error("boom");
        }
        return <div>Recovered</div>;
      };

      render(
        <ErrorBoundary
          fallback={({ resetError }) => (
            <button
              onClick={() => {
                shouldThrow = false;
                resetError();
              }}
            >
              Reset
            </button>
          )}
        >
          <Thrower />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByText("Reset"));

      expect(screen.getByText("Recovered")).toBeInTheDocument();
    });

    it("renders feature fallback and allows retry", () => {
      let shouldThrow = true;
      const Thrower = () => {
        if (shouldThrow) {
          throw new Error("feature boom");
        }
        return <div>Feature content</div>;
      };

      render(
        <FeatureErrorBoundary featureName="Sharing">
          <Thrower />
        </FeatureErrorBoundary>,
      );

      expect(screen.getByText("Sharing Error")).toBeInTheDocument();

      shouldThrow = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(screen.getByText("Feature content")).toBeInTheDocument();
    });
  });

  describe("core behavior", () => {
    it("opens Sentry report dialog for captured errors", () => {
      const Thrower = () => {
        throw new Error("boom");
      };

      render(
        <ErrorBoundary>
          <Thrower />
        </ErrorBoundary>,
      );

      const reportButton = screen.getByRole("button", {
        name: "Report Feedback",
      });
      fireEvent.click(reportButton);

      expect(mockSentry.showReportDialog).toHaveBeenCalledWith({
        eventId: "event-id",
      });
    });
  });
});
