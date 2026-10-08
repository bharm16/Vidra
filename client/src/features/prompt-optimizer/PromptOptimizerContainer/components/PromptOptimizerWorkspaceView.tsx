import React from "react";
import { PromptModals } from "@features/prompt-optimizer/components/PromptModals";
import { AppShell } from "@components/navigation/AppShell";
import { PromptResultsLayout } from "@features/prompt-optimizer/layouts/PromptResultsLayout";

interface PromptOptimizerWorkspaceViewProps {
  shouldShowLoading: boolean;
}

export function PromptOptimizerWorkspaceView({
  shouldShowLoading,
}: PromptOptimizerWorkspaceViewProps): React.ReactElement {
  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col overflow-hidden font-sans text-foreground">
        <a href="#main-content" className="ps-skip-link">
          Skip to main content
        </a>

        <PromptModals />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {shouldShowLoading ? (
            <main
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
              id="main-content"
            >
              <div className="flex flex-1 items-center justify-center px-6 py-9 sm:px-8 sm:py-10">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-border-strong" />
                  <p className="text-body-sm text-muted">Loading prompt...</p>
                </div>
              </div>
            </main>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PromptResultsLayout />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
