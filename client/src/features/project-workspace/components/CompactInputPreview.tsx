import { useEffect, useRef, useState, type ReactElement } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { MediaThumbnail } from "./MediaThumbnail";

/** The area tint uses the selected mask bytes, never an invented preview region. */
export function CompactInputPreview({ version, mask, unavailable, uploading, access }: { version: MediaVersion | undefined; mask: MediaVersion | undefined; unavailable: boolean; uploading: boolean; access(versionId: string): Promise<{ url: string }> }): ReactElement {
  const [area, setArea] = useState<{ id: string; url: string }>();
  const accessRef = useRef(access);
  accessRef.current = access;
  const maskId = mask?.id;
  useEffect(() => {
    let current = true;
    if (maskId) void accessRef.current(maskId).then(result => { if (current) setArea({ id: maskId, url: result.url }); }).catch(() => { if (current) setArea(undefined); });
    return () => { current = false; };
  }, [maskId]);
  return <span className="vf-input-picture" data-unavailable={unavailable || undefined}>{unavailable ? <span role="img" aria-label={version?.kind === "audio" ? "Audio unavailable" : "Picture unavailable"}><img src="/design-assets/fidelity-model-error.svg" alt="" /></span> : version ? <MediaThumbnail version={version} access={access} /> : <img className="vf-thumbnail-loader" src="/design-assets/prompt-history/batch-loader.svg" alt={uploading ? "Uploading" : "Picture is being made"} />}{!unavailable && mask && area?.id === mask.id ? <span className="vf-input-area" style={{ maskImage: `url(${JSON.stringify(area.url)})` }} aria-label="Selected area" role="img" /> : null}</span>;
}
