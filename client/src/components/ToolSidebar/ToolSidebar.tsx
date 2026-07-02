import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from "react";
import { FEATURES } from "@/config/features.config";
import { dispatchPromptFocusIntent } from "@features/workspace-shell";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { ToolRail } from "./components/ToolRail";
import { ToolPanel } from "./components/ToolPanel";
import { SessionsPanel } from "./components/panels/SessionsPanel";
import { LoadingDots } from "@/components/LoadingDots";

const GenerationControlsPanel = lazy(() =>
  import("./components/panels/GenerationControlsPanel").then((m) => ({
    default: m.GenerationControlsPanel,
  })),
);
const CharactersPanel = lazy(() =>
  import("./components/panels/CharactersPanel").then((m) => ({
    default: m.CharactersPanel,
  })),
);
const StylesPanel = lazy(() =>
  import("./components/panels/StylesPanel").then((m) => ({
    default: m.StylesPanel,
  })),
);
import { useToolSidebarState } from "./hooks/useToolSidebarState";
import type { ToolPanelType, ToolSidebarProps } from "./types";
import { useSidebarSessionsDomain } from "./context";

/**
 * ToolSidebar - Main orchestrator for the Runway-style sidebar
 *
 * Layout: 60px rail + 400px panel (always visible side-by-side)
 *
 * Data flows through SidebarDataContext, set by SidebarDataProvider
 * in the prompt-optimizer workspace tree.
 *
 * Requirement 16.1-16.4: Tool panel integration with Create and Studio tools
 */
export function ToolSidebar(props: ToolSidebarProps): ReactElement {
  const { user, forceDefaultPanel } = props;
  const sessions = useSidebarSessionsDomain();
  const onSessionCreateNew = sessions?.onCreateNew;
  const onSessionLoadFromHistory = sessions?.onLoadFromHistory;

  const stateOptions = useMemo(
    () => ({ forceDefault: forceDefaultPanel }),
    [forceDefaultPanel],
  );
  const { activePanel, setActivePanel } = useToolSidebarState(
    "studio",
    stateOptions,
  );
  const isCanvasFirstLayout = FEATURES.CANVAS_FIRST_LAYOUT;
  const activePanelRef = useRef(activePanel);
  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  const handlePanelChange = useCallback(
    (panel: ToolPanelType): void => {
      const previousPanel = activePanelRef.current;
      // In canvas-first layout, re-clicking the active overlay panel collapses
      // it by returning to "studio" (which hides the overlay). Users expect the
      // same button to toggle the panel open/closed.
      if (
        isCanvasFirstLayout &&
        previousPanel === panel &&
        panel !== "studio"
      ) {
        setActivePanel("studio");
        return;
      }
      setActivePanel(panel);

      if (
        isCanvasFirstLayout &&
        panel === "studio" &&
        previousPanel !== "studio"
      ) {
        dispatchPromptFocusIntent({ source: "tool-rail" });
      }
    },
    [isCanvasFirstLayout, setActivePanel],
  );
  const handleStudioBack = useCallback((): void => {
    setActivePanel("sessions");
  }, [setActivePanel]);
  const handleSessionsActionComplete = useCallback((): void => {
    setActivePanel("studio");
    if (isCanvasFirstLayout) {
      dispatchPromptFocusIntent({ source: "tool-rail" });
    }
  }, [isCanvasFirstLayout, setActivePanel]);
  const handleSessionCreateNew = useCallback((): void => {
    onSessionCreateNew?.();
    handleSessionsActionComplete();
  }, [handleSessionsActionComplete, onSessionCreateNew]);
  const handleSessionLoad = useCallback(
    (entry: PromptHistoryEntry): void => {
      onSessionLoadFromHistory?.(entry);
      handleSessionsActionComplete();
    },
    [handleSessionsActionComplete, onSessionLoadFromHistory],
  );

  const renderPanelContent = (panel: ToolPanelType): ReactElement | null => {
    if (panel === "sessions") {
      return (
        <SessionsPanel
          onCreateNew={handleSessionCreateNew}
          onLoadFromHistory={handleSessionLoad}
        />
      );
    }

    if (panel === "studio") {
      return (
        <Suspense fallback={<LoadingDots />}>
          <GenerationControlsPanel onBack={handleStudioBack} />
        </Suspense>
      );
    }

    if (panel === "characters") {
      return (
        <Suspense fallback={<LoadingDots />}>
          <CharactersPanel />
        </Suspense>
      );
    }

    if (panel === "styles") {
      return (
        <Suspense fallback={<LoadingDots />}>
          <StylesPanel />
        </Suspense>
      );
    }

    return null;
  };

  const isOverlayPanelActive = isCanvasFirstLayout && activePanel !== "studio";
  const overlayPanelContent = isOverlayPanelActive
    ? renderPanelContent(activePanel)
    : null;

  return (
    <div className="relative flex h-full overflow-visible">
      <ToolRail
        activePanel={activePanel}
        onPanelChange={handlePanelChange}
        user={user}
      />
      {isCanvasFirstLayout ? (
        overlayPanelContent ? (
          <div
            // Starts below the workspace top bar so the breadcrumb
            // (project / session title) stays visible while a panel is open.
            className="border-tool-rail-border absolute left-full top-[var(--workspace-topbar-h)] z-20 h-[calc(100%-var(--workspace-topbar-h))] w-[400px] border-r bg-[var(--tool-surface-deep)] text-white shadow-[8px_0_24px_rgba(0,0,0,0.3)]"
            data-testid="tool-sidebar-overlay-panel"
          >
            <div className="flex h-full flex-col">
              <div
                key={activePanel}
                className="motion-presence-panel ps-animate-fade-in h-full"
                data-motion-state="entered"
              >
                {overlayPanelContent}
              </div>
            </div>
          </div>
        ) : null
      ) : (
        <ToolPanel activePanel={activePanel}>
          <div
            key={activePanel}
            className="motion-presence-panel ps-animate-fade-in h-full"
            data-motion-state="entered"
          >
            {renderPanelContent(activePanel)}
          </div>
        </ToolPanel>
      )}
    </div>
  );
}
