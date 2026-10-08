import { useReducer, useRef } from "react";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
} from "@/utils/storageUrl";
import { useToast } from "@components/Toast";
import type { GalleryGeneration } from "../types/result";

interface ResultUiState {
  details: boolean;
  fullscreen: boolean;
  playing: boolean;
  position: number;
  duration: number;
}
type ResultUiAction =
  | {
      type: "view";
      field: "details" | "fullscreen" | "playing";
      value: boolean;
    }
  | { type: "clock"; field: "position" | "duration"; value: number };
const INITIAL_STATE: ResultUiState = {
  details: false,
  fullscreen: false,
  playing: false,
  position: 0,
  duration: 0,
};
function resultUiReducer(
  state: ResultUiState,
  action: ResultUiAction,
): ResultUiState {
  return { ...state, [action.field]: action.value };
}
interface SelectedResultMedia extends ResultUiState {
  videoRef: React.RefObject<HTMLVideoElement>;
  video: ReturnType<typeof useResolvedMediaUrl>;
  image: ReturnType<typeof useResolvedMediaUrl>;
  playable: boolean;
  mediaUrl: string | null;
  setDetails: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
  setPlaying: (value: boolean) => void;
  setPosition: (value: number) => void;
  setDuration: (value: number) => void;
  togglePlayback: () => void;
  copyPrompt: () => Promise<void>;
  share: () => Promise<void>;
}

/** Owns URL recovery, browser media state and explicit clipboard/share actions. */
export function useSelectedResultMedia(
  generation: GalleryGeneration,
  onShare?: (() => void) | undefined,
): SelectedResultMedia {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, dispatch] = useReducer(resultUiReducer, INITIAL_STATE);
  const { details, fullscreen, playing, position, duration } = state;
  const setDetails = (value: boolean): void =>
    dispatch({ type: "view", field: "details", value });
  const setFullscreen = (value: boolean): void =>
    dispatch({ type: "view", field: "fullscreen", value });
  const setPlaying = (value: boolean): void =>
    dispatch({ type: "view", field: "playing", value });
  const setPosition = (value: number): void =>
    dispatch({ type: "clock", field: "position", value });
  const setDuration = (value: number): void =>
    dispatch({ type: "clock", field: "duration", value });
  const videoPath = generation.mediaUrl
    ? extractStorageObjectPath(generation.mediaUrl)
    : null;
  const video = useResolvedMediaUrl({
    kind: "video",
    url: generation.mediaType === "video" ? generation.mediaUrl : null,
    storagePath: videoPath,
    assetId:
      generation.mediaAssetId ??
      (generation.mediaUrl
        ? extractVideoContentAssetId(generation.mediaUrl)
        : null),
    enabled: generation.mediaType === "video",
    deferUntilResolved: true,
  });
  const imageUrl =
    generation.mediaType === "video"
      ? generation.thumbnailUrl
      : (generation.mediaUrl ?? generation.thumbnailUrl);
  const image = useResolvedMediaUrl({
    kind: "image",
    url: imageUrl,
    storagePath: imageUrl ? extractStorageObjectPath(imageUrl) : null,
    assetId:
      (generation.mediaType === "video"
        ? generation.thumbnailAssetId
        : (generation.mediaAssetId ?? generation.thumbnailAssetId)) ?? null,
    enabled: Boolean(
      imageUrl ||
        generation.thumbnailAssetId ||
        (generation.mediaType !== "video" && generation.mediaAssetId),
    ),
    deferUntilResolved: true,
  });
  const playable = generation.mediaType === "video" && Boolean(video.url);
  const mediaUrl = playable ? video.url : image.url;

  const togglePlayback = (): void => {
    const media = videoRef.current;
    if (!media) return;
    if (media.paused) {
      void media
        .play()
        .catch(() => toast.error("Couldn't play this video. Try again."));
    } else {
      media.pause();
    }
  };
  const copyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(generation.prompt);
      toast.success("Prompt copied");
    } catch {
      toast.error("Couldn't copy the prompt");
    }
  };
  const share = async (): Promise<void> => {
    if (onShare) {
      onShare();
      return;
    }
    if (!mediaUrl) return;
    try {
      if (navigator.share) await navigator.share({ url: mediaUrl });
      else {
        await navigator.clipboard.writeText(mediaUrl);
        toast.success("Media link copied");
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error("Couldn't share this result");
    }
  };
  return {
    ...state,
    videoRef,
    video,
    image,
    playable,
    mediaUrl,
    setDetails,
    setFullscreen,
    setPlaying,
    setPosition,
    setDuration,
    togglePlayback,
    copyPrompt,
    share,
  };
}
