import type { DeviceWorkCheck } from "@/repositories/workflow/WorkspaceRetention";
import { ImportCheckpointStore } from "@/features/project-imports/api/ImportCheckpointStore";
import { SketchCheckpointStore } from "@/features/project-sketch/api/SketchCheckpointStore";
import { hasUnconfirmedVideoEdits } from "@/features/video-editor/hooks/useVideoEditor";

/** Feature work that outlives its closed tab; sign-out checks it beside drafts. */
export const DEVICE_WORK: readonly DeviceWorkCheck[] = [
  { label: "an upload", unfinished: ownerId => new ImportCheckpointStore().hasUnfinished(ownerId) },
  { label: "a video edit", unfinished: async ownerId => hasUnconfirmedVideoEdits(ownerId) },
  { label: "a Sketch picture", unfinished: ownerId => new SketchCheckpointStore().hasUnsaved(ownerId) },
];
