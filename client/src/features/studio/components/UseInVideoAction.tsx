import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { useSendPictureToLibrary } from "@/features/project-imports/hooks/useSendPictureToLibrary";
import type { StudioTurn } from "../api/schemas";

interface UseInVideoActionProps {
  turns: StudioTurn[];
  /** Null when nothing is selected — the action has no subject then. */
  selectedImageId: string | null;
}

/** The selected picture, if the studio produced it. */
function findSelectedImage(turns: StudioTurn[], selectedImageId: string): StudioTurn["calls"][number]["image"] | undefined {
  for (const turn of turns) for (const call of turn.calls) if (call.status === "succeeded" && call.image?.id === selectedImageId) return call.image;
  return undefined;
}

/** Sends the selected picture to the /app library, where it can start a video. */
export function UseInVideoAction({ turns, selectedImageId }: UseInVideoActionProps): React.ReactElement | null {
  const { status, send } = useSendPictureToLibrary();
  const image = selectedImageId ? findSelectedImage(turns, selectedImageId) : undefined;
  if (!image?.viewUrl) return null;
  const viewUrl = image.viewUrl;
  return (
    <div className="st-topbar-right st-receipt">
      <Button variant="ghost" type="button" disabled={status.state === "sending"} onClick={() => void send(viewUrl, `studio-${image.id}`)}>
        {status.state === "sending" ? "Sending…" : "Use in a video"}
      </Button>
      {status.state === "failed" ? <span className="st-topbar-label" role="alert">{status.message}</span> : null}
    </div>
  );
}
