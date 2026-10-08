import React, { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import projectBackIcon from "./assets/project-back.svg";
import projectNewIcon from "./assets/project-new.svg";
import selectActiveIcon from "@/assets/design-system/studio-select-active.svg";
import selectIcon from "@/assets/design-system/studio-select.svg";
import panIcon from "@/assets/design-system/studio-pan.svg";
import panActiveIcon from "@/assets/design-system/studio-pan-active.svg";
import addReferenceIcon from "@/assets/design-system/studio-reference.svg";

import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { NavRail } from "@components/navigation/NavRail";

import { StudioComposer } from "./components/StudioComposer";
import {
  StudioPlane,
  STUDIO_EMPTY_FOCUS_ID,
  STUDIO_ORIGIN_GROUP_ID,
} from "./components/StudioPlane";
import { StudioThread } from "./components/StudioThread";
import { UseInSessionAction } from "./components/UseInSessionAction";
import { UnsavedReturnNotice } from "./components/UnsavedReturnNotice";
import { DownloadSelectedImage } from "./components/DownloadSelectedImage";
import { useStudioProject } from "./hooks/useStudioProject";
import { isTurnInFlight } from "./hooks/studioReducer";
import "./studio.css";

/**
 * The Studio (ADR-0019): a project strip and floating conversation above the
 * shared canvas. Page 21's canonical Studio components own the chrome;
 * selection-scoped download and session handoff actions remain available.
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
  const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
  const attachmentPicker = useRef<HTMLInputElement>(null);

  // A project born from a session picture (ADR-0022 decision 4) opens on that
  // picture: it is the project's subject and its selection, so it has to be on
  // the plane or the selection is invisible. Both halves are required — the
  // durable record says WHICH image, the per-read URL is how it renders.
  const origin = state.project?.origin;
  const originImageUrl = state.project?.originImageUrl;
  const originImage =
    origin && originImageUrl
      ? {
          id: origin.bridgedImageId,
          viewUrl: originImageUrl,
          label: "The picture you brought from the session",
        }
      : undefined;

  // The newest group is the camera target; recenter as new groups land.
  const liveTurnId =
    [...state.turns]
      .reverse()
      .find((turn) =>
        turn.calls.some((call) => call.status === "succeeded" && call.image),
      )?.id ?? (originImage ? STUDIO_ORIGIN_GROUP_ID : STUDIO_EMPTY_FOCUS_ID);

  // One source of "a turn is in flight" for both bands — the thread's pills
  // and the composer must agree, or the pills stay clickable through the
  // whole streaming window and start a second turn.
  const busy = isTurnInFlight(state);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <NavRail active="studio" />
      <div
        className="st-frame min-w-0 flex-1"
        data-has-images={Boolean(
          originImage ||
            state.unresolvedReturns.length > 0 ||
            state.turns.some((turn) =>
              turn.calls.some(
                (call) => call.status === "succeeded" && call.image,
              ),
            ),
        )}
      >
        <div className="st-topbar">
          {/* Selection-scoped actions, right-anchored as a group. Both act on
              the project's selection, not on a cell — a control nested inside a
              plane cell would be a button inside a button. Download SVG appears
              only when the selection is a vector (issue #118); the return door
              is ADR-0022 decision 4. Unsaved returns are receipts the server
              still owes (decision 6, issue #135), shown regardless of what is
              selected so a reload cannot bury them. */}
          <div className="st-selection-actions">
            <UnsavedReturnNotice
              returns={state.unresolvedReturns}
              onRetry={studio.retryReturnAttachment}
            />
            <DownloadSelectedImage
              turns={state.turns}
              selectedImageId={state.selectedImageId}
            />
            <UseInSessionAction
              // The return attempt belongs to the project it was pressed under
              // (issue #129): a response landing after the creator opened
              // another project must not light up the new project's action
              // bar. Keying by the route's project remounts the action with
              // the project, so a late outcome has nowhere to render — and
              // returning to the project offers the press again, which the
              // server replays to the same take.
              key={routeProjectId ?? "new"}
              selectedImageId={state.selectedImageId}
              onUse={studio.returnImageToSession}
              onRetryAttachment={studio.retryReturnAttachment}
              onRetryArming={studio.retryReturnArming}
            />
          </div>
        </div>

        <div className="st-body">
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
              <img src={projectBackIcon} alt="" />
            </Link>
            <input
              className="st-panel-title"
              aria-label="Project title"
              placeholder="New project"
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
              <img src={projectNewIcon} alt="" />
            </Link>
          </div>
          <div className="st-panel">
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
              attachmentPickerRef={attachmentPicker}
              onPin={(slug) => void studio.pinModel(slug)}
              onSend={(message) => void studio.sendMessage(message)}
              onAttachFile={(file) => void studio.attachFile(file)}
              onRemoveAttachment={(attachmentId) =>
                studio.removeAttachment(attachmentId)
              }
            />
          </div>

          <div className="st-stage">
            <div
              role="toolbar"
              aria-label="Studio canvas tools"
              className="st-canvas-tools"
            >
              <Button
                type="button"
                variant={canvasTool === "select" ? "default" : "ghost"}
                size="icon-lg"
                className="st-tool-button"
                aria-label="Select"
                aria-pressed={canvasTool === "select"}
                onClick={() => setCanvasTool("select")}
              >
                <img
                  src={canvasTool === "select" ? selectActiveIcon : selectIcon}
                  alt=""
                />
              </Button>
              <Button
                type="button"
                variant={canvasTool === "pan" ? "default" : "ghost"}
                size="icon-lg"
                className="st-tool-button"
                aria-label="Pan"
                aria-pressed={canvasTool === "pan"}
                onClick={() => setCanvasTool("pan")}
              >
                <img
                  src={canvasTool === "pan" ? panActiveIcon : panIcon}
                  alt=""
                />
              </Button>
              <span aria-hidden="true" className="st-tool-divider" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="st-tool-reference"
                disabled={busy}
                onClick={() => attachmentPicker.current?.click()}
              >
                <img src={addReferenceIcon} alt="" />
                Add reference
              </Button>
            </div>
            <CanvasViewport
              liveNodeId={liveTurnId}
              interactionMode={canvasTool}
            >
              <StudioPlane
                turns={state.turns}
                selectedImageId={state.selectedImageId}
                originImage={originImage}
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
