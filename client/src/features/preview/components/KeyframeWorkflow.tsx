import React from "react";
import { Check } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { VisualPreview } from "./VisualPreview";
import { VideoPreview } from "./VideoPreview";

interface KeyframeWorkflowProps {
  prompt: string;
  aspectRatio?: string | null | undefined;
  targetModel?: string;
  modelCapabilities?: Record<string, { supportsImageInput: boolean }>;
}

type WorkflowStage = "selecting" | "generating";

export function KeyframeWorkflow({
  prompt,
  aspectRatio,
  targetModel,
  modelCapabilities,
}: KeyframeWorkflowProps): React.ReactElement {
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [stage, setStage] = React.useState<WorkflowStage>("selecting");
  const [frameRequestId, setFrameRequestId] = React.useState(0);
  const [videoRequestId, setVideoRequestId] = React.useState(0);

  const targetSupportsI2v = targetModel
    ? (modelCapabilities?.[targetModel]?.supportsImageInput ?? false)
    : false;
  const i2vModel = targetSupportsI2v ? targetModel : "sora-2";
  const usingFallback = Boolean(targetModel && !targetSupportsI2v);

  React.useEffect(() => {
    setSelectedImage(null);
    setSelectedIndex(null);
    setStage("selecting");
    if (prompt.trim()) {
      setFrameRequestId((current) => current + 1);
    }
  }, [prompt, aspectRatio, targetModel]);

  const handleImageSelect = (imageUrl: string, index: number) => {
    setSelectedImage(imageUrl);
    setSelectedIndex(index);
  };

  const handleGenerateVideo = () => {
    if (!selectedImage) return;
    setStage("generating");
    setVideoRequestId((current) => current + 1);
  };

  const handleBack = () => {
    setStage("selecting");
  };

  if (stage === "generating" && selectedImage) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={handleBack} type="button">
          Back to frame selection
        </Button>

        <VideoPreview
          prompt={prompt}
          aspectRatio={aspectRatio}
          model={i2vModel}
          startImage={selectedImage}
          isVisible
          generateRequestId={videoRequestId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VisualPreview
        prompt={prompt}
        aspectRatio={aspectRatio}
        isVisible
        generateRequestId={frameRequestId}
        onImageSelected={handleImageSelect}
        selectedImageIndex={selectedIndex}
      />

      {selectedImage && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <Check className="h-4 w-4 text-accent" />
          <span className="text-xs text-foreground">
            Frame {(selectedIndex ?? 0) + 1} selected
          </span>

          <div className="ml-auto flex items-center gap-2">
            {usingFallback && targetModel && (
              <span className="text-meta text-muted">
                {targetModel} does not support i2v. Using Sora 2.
              </span>
            )}

            <Button size="sm" onClick={handleGenerateVideo} type="button">
              Generate video from this frame
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
