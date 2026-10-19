import { WorkflowApi } from "@/features/project-workspace/api/workflowApi";
import { importCommand, transferImport } from "./importTransfer";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };

/**
 * Saves a picture made outside /app (Studio, Live editor) into the owner's
 * library as an upload, and returns the /app address that offers it as an input.
 */
export async function sendPictureToLibrary(ownerId: string, source: string, name: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error("Could not read this picture");
  const blob = await response.blob();
  const file = new File([blob], `${name}.${EXTENSIONS[blob.type] ?? "png"}`, { type: blob.type });
  const api = new WorkflowApi(undefined, ownerId);
  const library = await api.ensureLibrary(signal);
  const command = await importCommand(file);
  const session = await api.beginImport(library.id, command, signal);
  if (session.record.state === "rejected" || session.record.state === "cancelled") throw new Error(session.record.reason ?? "This picture isn't supported");
  if (session.offset < command.bytes) {
    if (!session.uploadUrl) throw new Error("Upload interrupted");
    await transferImport(ownerId, session.uploadUrl, file, session.offset, signal, () => undefined, command.contentType);
  }
  const version = await api.finishImport(library.id, command.id, signal);
  return `/app?view=media&savedImport=${encodeURIComponent(version.id)}`;
}
