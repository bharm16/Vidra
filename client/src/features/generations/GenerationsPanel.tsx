import React, { memo } from "react";
import { cn } from "@/utils/cn";
import type { GenerationsPanelProps, GenerationsPanelRuntime } from "./types";
import { GenerationCard } from "./components/GenerationCard";
import { VersionDivider } from "./components/VersionDivider";
import { KeyframeStep } from "./components/KeyframeStep";
import { useGenerationsRuntime } from "./hooks/useGenerationsRuntime";

interface GenerationsPanelViewProps {
  runtime: GenerationsPanelRuntime;
  presentation: "timeline" | "hero";
  prompt: string;
  aspectRatio: string;
  className?: string | undefined;
  onRestoreVersion: (versionId: string) => void;
}

function GenerationsPanelView({
  runtime,
  presentation,
  prompt,
  aspectRatio,
  className,
  onRestoreVersion,
}: GenerationsPanelViewProps): React.ReactElement {
  const isSequenceContext =
    runtime.isSequenceMode || runtime.hasActiveContinuityShot;

  if (presentation === "hero") {
    return (
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden bg-tool-panel-inner",
          className,
        )}
      >
        {runtime.keyframeStep.isActive && runtime.keyframeStep.character ? (
          <KeyframeStep
            prompt={prompt}
            character={runtime.keyframeStep.character}
            aspectRatio={aspectRatio}
            onApprove={runtime.handleApproveKeyframe}
            onSkip={runtime.handleSkipKeyframe}
          />
        ) : null}

        <div className="flex flex-1 flex-col overflow-y-auto bg-tool-surface-deep p-3">
          {runtime.heroGeneration ? (
            <GenerationCard
              generation={runtime.heroGeneration}
              onRetry={runtime.handleRetry}
              onDelete={runtime.handleDelete}
              onDownload={runtime.handleDownload}
              onExtend={runtime.handleExtendGeneration}
              canExtend={runtime.canExtendGenerations}
              onCancel={runtime.handleCancel}
              onContinueSequence={runtime.handleContinueSequence}
              isSequenceMode={isSequenceContext}
              isStartingSequence={runtime.isStartingSequence}
              onSelectFrame={runtime.handleSelectFrame}
              onClearSelectedFrame={runtime.handleClearSelectedFrame}
              selectedFrameUrl={runtime.selectedFrameUrl}
              isActive
              className="h-full"
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-tool-panel-inner",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-tool-rail-border px-4 py-3.5">
        <span className="text-ui font-semibold text-foreground">
          Generations
        </span>
        <span className="text-meta text-tool-text-label">
          {runtime.totalVisibleGenerations > 0
            ? `${runtime.totalVisibleGenerations} output${runtime.totalVisibleGenerations !== 1 ? "s" : ""}`
            : ""}
        </span>
      </div>

      {runtime.keyframeStep.isActive && runtime.keyframeStep.character ? (
        <KeyframeStep
          prompt={prompt}
          character={runtime.keyframeStep.character}
          aspectRatio={aspectRatio}
          onApprove={runtime.handleApproveKeyframe}
          onSkip={runtime.handleSkipKeyframe}
        />
      ) : null}

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-3 py-2.5">
        {runtime.timeline.length === 0
          ? null
          : runtime.timeline.map((item, index) => {
              if (item.type === "divider") {
                return (
                  <VersionDivider
                    key={`divider-${item.versionId}-${index}`}
                    versionLabel={item.versionLabel}
                    promptChanged={item.promptChanged}
                  />
                );
              }

              return (
                <GenerationCard
                  key={item.generation.id}
                  generation={item.generation}
                  isActive={item.generation.id === runtime.activeGenerationId}
                  onRetry={runtime.handleRetry}
                  onDelete={runtime.handleDelete}
                  onDownload={runtime.handleDownload}
                  onExtend={runtime.handleExtendGeneration}
                  canExtend={runtime.canExtendGenerations}
                  onCancel={runtime.handleCancel}
                  onContinueSequence={runtime.handleContinueSequence}
                  isSequenceMode={isSequenceContext}
                  isStartingSequence={runtime.isStartingSequence}
                  onSelectFrame={runtime.handleSelectFrame}
                  onClearSelectedFrame={runtime.handleClearSelectedFrame}
                  selectedFrameUrl={runtime.selectedFrameUrl}
                  onClick={() => onRestoreVersion(item.generation._versionId)}
                />
              );
            })}
      </div>
    </div>
  );
}

type GenerationsPanelWithInternalRuntimeProps = Omit<
  GenerationsPanelProps,
  "runtime"
>;

function GenerationsPanelWithInternalRuntime({
  className,
  onRestoreVersion,
  prompt,
  aspectRatio,
  presentation = "timeline",
  ...runtimeOptions
}: GenerationsPanelWithInternalRuntimeProps): React.ReactElement {
  const runtime = useGenerationsRuntime({
    prompt,
    aspectRatio,
    ...runtimeOptions,
    presentation,
  });

  return (
    <GenerationsPanelView
      runtime={runtime}
      presentation={presentation}
      prompt={prompt}
      aspectRatio={aspectRatio}
      className={className}
      onRestoreVersion={onRestoreVersion}
    />
  );
}

export const GenerationsPanel = memo(function GenerationsPanel({
  runtime,
  className,
  prompt,
  aspectRatio,
  onRestoreVersion,
  presentation = "timeline",
  ...props
}: GenerationsPanelProps): React.ReactElement {
  if (runtime) {
    return (
      <GenerationsPanelView
        runtime={runtime}
        presentation={presentation}
        prompt={prompt}
        aspectRatio={aspectRatio}
        className={className}
        onRestoreVersion={onRestoreVersion}
      />
    );
  }

  return (
    <GenerationsPanelWithInternalRuntime
      {...props}
      prompt={prompt}
      aspectRatio={aspectRatio}
      presentation={presentation}
      onRestoreVersion={onRestoreVersion}
      {...(className !== undefined ? { className } : {})}
    />
  );
});

GenerationsPanel.displayName = "GenerationsPanel";
