import { useEffect, useState } from "react";
import type { PublicClipDto } from "@shared/schemas/share.schemas";
import { fetchPublicClip } from "../api/publicClipApi";

export interface SharedClipState {
  clip: PublicClipDto | null;
  loading: boolean;
  notFound: boolean;
  error: boolean;
}

const INITIAL: SharedClipState = {
  clip: null,
  loading: true,
  notFound: false,
  error: false,
};

export function useSharedClip(shareId: string | undefined): SharedClipState {
  const [state, setState] = useState<SharedClipState>(INITIAL);

  useEffect(() => {
    let active = true;
    if (!shareId) {
      setState({ clip: null, loading: false, notFound: true, error: false });
      return;
    }
    setState(INITIAL);
    fetchPublicClip(shareId)
      .then((clip) => {
        if (!active) return;
        setState(
          clip
            ? { clip, loading: false, notFound: false, error: false }
            : { clip: null, loading: false, notFound: true, error: false },
        );
      })
      .catch(() => {
        if (!active) return;
        setState({ clip: null, loading: false, notFound: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [shareId]);

  return state;
}
