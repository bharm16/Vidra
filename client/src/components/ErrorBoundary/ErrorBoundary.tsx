import React, { type ReactNode } from "react";
import { logger } from "@/services/LoggingService";

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (props: { resetError: () => void }) => ReactNode;
  /** Changing this while the fallback shows clears it, e.g. on navigation. */
  resetKey?: unknown;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error("Error caught by boundary", error, {
      component: "ErrorBoundary",
      componentStack: errorInfo.componentStack,
    });
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.handleReset();
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback({ resetError: this.handleReset });
    }

    return this.props.children;
  }
}
