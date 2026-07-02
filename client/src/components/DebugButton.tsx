import React, { type CSSProperties } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { usePromptDebugger } from "../hooks/usePromptDebugger";
import { logger } from "../services/LoggingService";
import type { PromptDebuggerState } from "../hooks/types";

interface DebugButtonProps {
  inputPrompt: string;
  displayedPrompt?: string;
  optimizedPrompt?: string;
  selectedMode?: string;
  promptContext?: Record<string, unknown> | null;
  style?: CSSProperties;
  className?: string;
}

/**
 * Debug Button Component
 *
 * Add this to PromptOptimizerWorkspace.tsx to enable one-click debugging:
 *
 * import DebugButton from '../components/DebugButton';
 *
 * <DebugButton
 *   inputPrompt={promptOptimizer.inputPrompt}
 *   displayedPrompt={promptOptimizer.displayedPrompt}
 *   optimizedPrompt={promptOptimizer.optimizedPrompt}
 *   selectedMode={selectedMode}
 *   promptContext={promptContext}
 * />
 */
export default function DebugButton({
  inputPrompt,
  displayedPrompt,
  optimizedPrompt,
  selectedMode,
  promptContext,
  style = {},
  className = "",
}: DebugButtonProps): React.ReactElement {
  const state: PromptDebuggerState = {
    inputPrompt,
    ...(typeof displayedPrompt === "string" ? { displayedPrompt } : {}),
    ...(typeof optimizedPrompt === "string" ? { optimizedPrompt } : {}),
    ...(typeof selectedMode === "string" ? { selectedMode } : {}),
    ...(promptContext != null ? { promptContext } : {}),
  };

  const { capturePromptData, exportToFile, isCapturing } =
    usePromptDebugger(state);

  const handleCapture = async (): Promise<void> => {
    try {
      await capturePromptData();
      // Data is automatically logged to console and saved
    } catch (error) {
      logger.error("Failed to capture debug data", error as Error, {
        component: "DebugButton",
        operation: "handleCapture",
      });
      alert("Failed to capture debug data. Check console for details.");
    }
  };

  const handleExport = (): void => {
    try {
      exportToFile();
    } catch (error) {
      logger.error("Failed to export debug data", error as Error, {
        component: "DebugButton",
        operation: "handleExport",
      });
      alert("No debug data to export. Capture data first.");
    }
  };

  return (
    <div
      className={`debug-button-container z-toast ${className}`}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        display: "flex",
        gap: "10px",
        ...style,
      }}
    >
      <Button
        type="button"
        onClick={handleCapture}
        disabled={isCapturing}
        variant="ghost"
        style={{
          padding: "10px 16px",
          backgroundColor: isCapturing ? "#6b7280" : "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!isCapturing) {
            const target = e.currentTarget;
            target.style.backgroundColor = "#2563eb";
            target.style.transform = "translateY(-1px)";
            target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
          }
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!isCapturing) {
            const target = e.currentTarget;
            target.style.backgroundColor = "#3b82f6";
            target.style.transform = "translateY(0)";
            target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          }
        }}
        title="Capture prompt data with all highlights and AI suggestions"
      >
        {isCapturing ? (
          <>
            <span className="ps-spinner">⏳</span>
            <span>Capturing...</span>
          </>
        ) : (
          <>
            <span>🔍</span>
            <span>Debug Capture</span>
          </>
        )}
      </Button>

      <Button
        type="button"
        onClick={handleExport}
        variant="ghost"
        style={{
          padding: "10px 16px",
          backgroundColor: "#10b981",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
          const target = e.currentTarget;
          target.style.backgroundColor = "#059669";
          target.style.transform = "translateY(-1px)";
          target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
          const target = e.currentTarget;
          target.style.backgroundColor = "#10b981";
          target.style.transform = "translateY(0)";
          target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
        }}
        title="Export last capture to JSON file"
      >
        <span>💾</span>
        <span>Export JSON</span>
      </Button>
    </div>
  );
}
