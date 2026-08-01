import React from "react";

interface SceneProxyCamera {
  yaw?: number;
  pitch?: number;
  roll?: number;
  dolly?: number;
}

interface SceneProxyPreviewPanelProps {
  previewImageUrl: string | null;
  onPreviewImageError: () => void;
  isSceneProxyReady: boolean;
  isPreviewingSceneProxy: boolean;
  onPreviewSceneProxy: () => void;
  previewCamera: SceneProxyCamera | null;
}

const formatCameraValue = (value: number | undefined): string =>
  `${Number.isFinite(value) ? Number(value).toFixed(2) : "0.00"}`;

export function SceneProxyPreviewPanel({
  previewImageUrl,
  onPreviewImageError,
  isSceneProxyReady,
  isPreviewingSceneProxy,
  onPreviewSceneProxy,
  previewCamera,
}: SceneProxyPreviewPanelProps): React.ReactElement {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-surface-2"
      data-testid="scene-proxy-preview-panel"
    >
      <header className="flex items-center justify-between border-b border-border bg-black/20 px-3 py-2">
        <span className="text-meta font-semibold uppercase tracking-wide text-muted">
          Scene proxy preview
        </span>
        <span className="text-meta text-muted">
          {isSceneProxyReady ? "Ready" : "Build proxy first"}
        </span>
      </header>

      <div className="relative h-[110px] w-full">
        {previewImageUrl ? (
          <img
            src={previewImageUrl}
            alt="Scene proxy preview"
            className="h-full w-full object-cover"
            onError={onPreviewImageError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-tool-surface-card">
            <span className="text-xs text-muted">No proxy preview yet</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button
          type="button"
          onClick={onPreviewSceneProxy}
          disabled={!isSceneProxyReady || isPreviewingSceneProxy}
          className="absolute bottom-2 right-2 rounded border border-border bg-black/55 px-2 py-1 text-meta font-medium text-foreground backdrop-blur-sm disabled:opacity-50"
          data-testid="preview-scene-proxy-button"
        >
          {isPreviewingSceneProxy ? "Rendering..." : "Preview angle"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-border px-3 py-2 text-meta text-muted">
        <span>Yaw: {formatCameraValue(previewCamera?.yaw)}</span>
        <span>Pitch: {formatCameraValue(previewCamera?.pitch)}</span>
        <span>Roll: {formatCameraValue(previewCamera?.roll)}</span>
        <span>Dolly: {formatCameraValue(previewCamera?.dolly)}</span>
      </div>
    </section>
  );
}

export default SceneProxyPreviewPanel;
