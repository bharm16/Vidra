import sharp from "sharp";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";
import { verifySketchPicture, type VerifiedSketchPicture } from "./ProjectSketchStorage";

const MISMATCH = "This area belongs to a different picture or size. Redraw it on this exact version.";

/**
 * A painted area is tied to the exact picture and geometry it was drawn on (CONTEXT: area drawing).
 * Its bytes must decode to that geometry with a real alpha channel and at least one painted pixel,
 * because an opaque or empty mask would turn into a whole-picture edit.
 */
export async function verifyAreaMask(command: ProjectAreaMask, source: MediaVersion | undefined): Promise<VerifiedSketchPicture> {
  if (!source || source.kind !== "image" || source.association !== "linked") throw new WorkflowError("input_unavailable", "The picture for this area is unavailable.");
  const metadata = source.metadata.state === "verified" ? source.metadata : undefined;
  if (!metadata || metadata.width !== command.width || metadata.height !== command.height) throw new WorkflowError("invalid_settings", MISMATCH);
  const picture = await verifySketchPicture(command.dataUri);
  if (picture.mime !== "image/png" || picture.width !== command.width || picture.height !== command.height) throw new WorkflowError("invalid_settings", MISMATCH);
  const decoded = sharp(picture.bytes, { limitInputPixels: 40_000_000 });
  const [{ hasAlpha }, stats] = await Promise.all([decoded.metadata(), decoded.stats()]);
  if (!hasAlpha || (stats.channels[3]?.max ?? 0) === 0) throw new WorkflowError("invalid_settings", "Paint an area on the picture first.");
  return picture;
}
