import React, { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";

import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { NavRail } from "@components/navigation/NavRail";

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
 *
 * One project, named by the route: /studio/:projectId opens that project,
 * /studio/new opens projectless and lets the first send create the record.
 * Listing lives on the project index at /studio.
 */

export function StudioPage(): React.ReactElement {
  const params = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  // "new" is a literal route segment, not an id — React Router ranks static
  // segments above dynamic ones, so /studio/new never reaches :projectId.
  const routeProjectId = params.projectId ?? null;

  const studio = useStudioProject(routeProjectId, {
    // The lazily-created project takes over the address bar. replace: true
    // so Back leaves the workspace for the index rather than returning to a
    // /studio/new that would now open a second, empty project.
    onProjectCreated: useCallback(
      (project: { id: string }) =>
        navigate(`/studio/${project.id}`, { replace: true }),
      [navigate],
    ),
    // Deleted elsewhere, or never this creator's — the server reads both as
    // absence. Send them to the index rather than showing an empty thread.
    onProjectMissing: useCallback(
      () => navigate("/studio", { replace: true }),
      [navigate],
    ),
  });
  const { state } = studio;
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
          <div className="st-topbar-right" />
        </div>

        <div className="st-body">
          <div className="st-panel">
            <div className="st-panel-header">
              {/* Back to the project index. This was a toggle that opened an
                  overlay list; the index is a page now, so the affordance is
                  navigation and says so. */}
              <Link
                to="/studio"
                className="st-icon-btn"
                title="All projects"
                aria-label="All projects"
              >
                <ArrowLeft size={15} strokeWidth={1.75} />
              </Link>
              <input
                className="st-panel-title"
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
              {/* Routes rather than writing — the record is born on the first
                  send, so an abandoned new project leaves nothing behind. */}
              <Link
                to="/studio/new"
                className="st-icon-btn"
                title="New project"
                aria-label="New project"
              >
                <Plus size={16} strokeWidth={1.75} />
              </Link>
            </div>

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
            {/* No canvas tool rail. It held two buttons — one of which
                duplicated the composer's attach 120px away — and a two-item
                rail floating mid-canvas reads as a stray fragment rather than
                a toolbar. Studio has no canvas tools yet: the plane is
                deliberately non-interactive (ADR-0019 §4), so select, pan and
                frame have nothing to drive, and there is no history for undo
                and redo to walk. The .st-float / .st-tool-rail recipe stays in
                studio.css; the rail returns when there are tools for it.
                Fit-to-view moved to the zoom control, where camera actions
                belong. */}
            <CanvasViewport liveNodeId={liveTurnId}>
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
