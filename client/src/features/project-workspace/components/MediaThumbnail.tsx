import { useEffect, useRef, useState, type ReactElement } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export function MediaThumbnail({ version, access, className = "" }: { version: MediaVersion; access(versionId: string): Promise<{ url: string }>; className?: string }): ReactElement {
  const accessRef = useRef(access);
  accessRef.current = access;
  const [resource, setResource] = useState<{ id: string; url: string }>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    let current = true;
    setFailed(undefined);
    void accessRef.current(version.id).then(result => { if (current) setResource({ id: version.id, url: result.url }); }).catch(() => { if (current) setFailed(version.id); });
    return () => { current = false; };
  }, [version.id]);
  if (failed === version.id) return <span className={`vf-thumbnail-fallback ${className}`} role="img" aria-label="Preview unavailable">!</span>;
  if (resource?.id !== version.id) return <span className={`vf-thumbnail-fallback ${className}`} role="status" aria-label="Opening preview"><img src="/design-assets/media-loader.svg" alt="" className="vf-thumbnail-loader" /></span>;
  if (version.kind === "audio") return <span className={`vf-thumbnail-fallback ${className}`}>Audio</span>;
  return version.kind === "image" ? <img className={className} src={resource.url} alt="" onError={() => setFailed(version.id)} /> : <video className={className} src={resource.url} muted playsInline preload="metadata" aria-label={`${version.label} preview`} onLoadedMetadata={event => {
    const video = event.currentTarget;
    // Request an actual decoded opening frame without downloading or playing the whole clip.
    if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(1 / 30, video.duration / 2);
  }} onError={() => setFailed(version.id)} />;
}
