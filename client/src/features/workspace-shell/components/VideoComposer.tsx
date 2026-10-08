import React from "react";
import { cn } from "@/utils/cn";
import "./video-composer.css";

export interface VideoComposerSlots {
  media: React.ReactNode;
  settings: React.ReactNode;
  generate: React.ReactNode;
}
interface VideoComposerProps extends VideoComposerSlots {
  writing: React.ReactNode;
  layout: "new" | "ongoing" | "mobile";
}

/** Direct Page 21 composition: 702:838 / 702:890 / 702:923. */
export function VideoComposer({
  media,
  writing,
  settings,
  generate,
  layout,
}: VideoComposerProps): React.ReactElement {
  return (
    <section
      aria-label="Video composer"
      data-figma-component="702:837"
      className={cn("vidra-video-composer", "vidra-video-composer--" + layout)}
    >
      <div className="vidra-video-composer__media">{media}</div>
      <div className="vidra-video-composer__body">
        <div className="vidra-video-composer__writing">{writing}</div>
        <div className="vidra-video-composer__settings">{settings}</div>
        <div className="vidra-video-composer__generate">{generate}</div>
      </div>
    </section>
  );
}
