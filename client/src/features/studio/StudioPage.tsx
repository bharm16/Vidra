import React, { useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { FolderOpen, Plus } from "lucide-react";

import { Crosshair, Paperclip } from "lucide-react";
import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { NavRail } from "@components/navigation/NavRail";

import { ProjectList } from "./components/ProjectList";
import { StudioComposer } from "./components/StudioComposer";
import { StudioPlane } from "./components/StudioPlane";
import { StudioThread } from "./components/StudioThread";
import { useStudioProject } from "./hooks/useStudioProject";
import { isTurnInFlight } from "./hooks/studioReducer";
import "./studio.css";

/**
 * The studio (ADR-0019): Vidra's conversational image generation and
 * editing workspace on its own rail surface. Left: the chat panel (header,
 * thread, composer). Right: the shared infinite plane with derived batch
 * groups. Layout slots follow the plan's "Layout and control placement"
 * section; one documented deviation — the NavRail is Vidra's app chrome,
 * so the reference's top-bar avatar/menu are omitted (the rail owns them).
 */

export function StudioPage(): React.ReactElement {
  const studio = useStudioProject();
  const { state } = studio;
  const cameraActionsRef = useRef<{ recenter: () => void } | null>(null);
  const railFileInputRef = useRef<HTMLInputElement | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  // The newest group is the camera target; recenter as new groups land.
  const liveTurnId =
    [...state.turns]
      .reverse()
      .find((turn) =>
        turn.calls.some((call) => call.status === "succeeded" && call.image),
      )?.id ?? "studio-empty";

  // One source of "a turn is in flight" for both bands — the thread's pills
  // and the composer must agree, or the pills stay clickable through the
  // whole streaming window and start a second turn.
  const busy = isTurnInFlight(state);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <NavRail active="studio" />
      <div className="st-frame min-w-0 flex-1">
        <div className="st-topbar">
          <span className="st-topbar-label">Studio</span>
          <input
            className="st-topbar-title"
            aria-label="Project title"
            value={titleDraft ?? state.project?.title ?? ""}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              if (titleDraft !== null && titleDraft.trim()) {
                void studio.renameProject(titleDraft);
              }
              setTitleDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
          <div className="st-topbar-right" />
        </div>

        <div className="st-body">
          <div className="st-panel">
            <div className="st-panel-header">
              <Button
                variant="ghost"
                type="button"
                className="st-icon-btn"
                title="Projects"
                aria-label="Projects"
                onClick={() => studio.dispatch({ type: "listToggled" })}
              >
                <FolderOpen size={15} strokeWidth={1.8} />
              </Button>
              <span className="st-panel-title">
                {state.project?.title ?? "…"}
              </span>
              <Button
                variant="ghost"
                type="button"
                className="st-icon-btn"
                title="New project"
                aria-label="New project"
                onClick={() => void studio.newProject()}
              >
                <Plus size={16} strokeWidth={1.9} />
              </Button>
            </div>

            <ProjectList
              projects={state.projects}
              activeProjectId={state.project?.id ?? null}
              open={state.listOpen}
              onOpenProject={(project) => void studio.openProject(project)}
              onDeleteProject={(projectId) =>
                void studio.deleteProject(projectId)
              }
              onClose={() =>
                studio.dispatch({ type: "listToggled", open: false })
              }
            />

            <StudioThread
              turns={state.turns}
              optimisticMessage={state.optimisticMessage}
              streamingThinking={state.streamingThinking}
              pendingTurnId={state.pendingTurnId}
              busy={busy}
              selectedImageId={state.selectedImageId}
              error={state.error}
              onSelectImage={(imageId) =>
                studio.selectImage(
                  state.selectedImageId === imageId ? null : imageId,
                )
              }
              onSendMessage={(message) => void studio.sendMessage(message)}
              onDismissError={() => studio.dispatch({ type: "errorDismissed" })}
            />

            <StudioComposer
              models={state.models}
              pinnedModel={state.project?.pinnedModel ?? null}
              busy={busy}
              pendingAttachments={state.pendingAttachments}
              onPin={(slug) => void studio.pinModel(slug)}
              onSend={(message) => void studio.sendMessage(message)}
              onAttachFile={(file) => void studio.attachFile(file)}
              onRemoveAttachment={(attachmentId) =>
                studio.removeAttachment(attachmentId)
              }
            />
          </div>

          <div className="st-stage">
            {/* Canvas tool rail — floating chrome against the panel edge.
                Carries the affordances that exist: attach an image, and put
                the live group back in view. Select / pan / frame are not here
                because the plane is deliberately non-interactive (ADR-0019
                §4) and there is nothing for them to drive; undo/redo have no
                Studio history to walk. Adding them as dead buttons would be
                worse than the gap. */}
            <div className="st-float st-tool-rail">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ps-btn ps-btn--icon-sm ps-btn--rect ps-btn--quiet"
                title="Attach an image"
                aria-label="Attach an image"
                onClick={() => railFileInputRef.current?.click()}
              >
                <Paperclip />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ps-btn ps-btn--icon-sm ps-btn--rect ps-btn--quiet"
                title="Fit to view"
                aria-label="Fit to view"
                onClick={() => cameraActionsRef.current?.recenter()}
              >
                <Crosshair />
              </Button>
              <input
                ref={railFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                aria-label="Attach image file from the canvas"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void studio.attachFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            <CanvasViewport
              liveNodeId={liveTurnId}
              actionsRef={cameraActionsRef}
            >
              <StudioPlane
                turns={state.turns}
                selectedImageId={state.selectedImageId}
                onSelectImage={(imageId) =>
                  studio.selectImage(
                    state.selectedImageId === imageId ? null : imageId,
                  )
                }
              />
            </CanvasViewport>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioPage;
