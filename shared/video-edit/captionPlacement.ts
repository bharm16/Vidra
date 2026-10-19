import type { VideoCaptionPlacement, VideoPreset, VideoText } from "../schemas/workflow/video-edit.schemas";

export const LANDSCAPE_BOTTOM_CENTER_CAPTION = { x: .056816, y: .868692, width: .886364, height: .12 } as const;
type CaptionGeometry = Pick<VideoText, "x" | "y" | "width" | "height" | "align">;

/** Explicit placement follows the saved output format; legacy custom coordinates stay independent. */
export function captionPlacement(preset: VideoPreset, placement: VideoCaptionPlacement): CaptionGeometry {
  if (placement === "bottom-center") {
    // Retained portrait E12/E13 places its logical caption at452.65/520.
    // Center its source-relative263.169/292.644 width in the true9:16 output.
    const width = 263.169 / 292.644;
    return preset === "portrait" ? { x: (1 - width) / 2, y: 452.65 / 520, width, height: .12, align: "center" } : { ...LANDSCAPE_BOTTOM_CENTER_CAPTION, align: "center" };
  }
  const align: VideoText["align"] = placement.endsWith("-left") ? "left" : placement.endsWith("-right") ? "right" : "center";
  return { x: align === "left" ? .05 : align === "right" ? .35 : .08, y: placement.startsWith("top-") ? .05 : placement.startsWith("centre-") ? .44 : .83, width: align === "center" ? .84 : .6, height: .12, align };
}
