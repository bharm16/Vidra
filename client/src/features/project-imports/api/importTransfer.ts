import { canonicalImportContentType, ImportCommandSchema, type ImportCommand } from "@shared/schemas/workflow/import.schemas";
import { getAuthRepository } from "@/repositories/index";

export async function fingerprint(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
export async function importCommand(file: File): Promise<ImportCommand> {
  // Validate before buffering the file for its fingerprint.
  const candidate = ImportCommandSchema.parse({ id: `import_${crypto.randomUUID()}`, filename: file.name, bytes: file.size, contentType: canonicalImportContentType(file.type), sha256: "0".repeat(64) });
  return { ...candidate, sha256: await fingerprint(file) };
}
export async function transferImport(ownerId: string, url: string, file: Blob, offset: number, signal: AbortSignal, onProgress: (percent: number) => void, contentType?: ImportCommand["contentType"]): Promise<void> {
  const chunkSize = 8 * 1024 * 1024; // GCS chunks are multiples of 256 KiB.
  onProgress(Math.round(offset / file.size * 100));
  while (offset < file.size) {
    if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("Sign in to the original account to resume this upload.");
    signal.throwIfAborted();
    const end = Math.min(offset + chunkSize, file.size);
    const response = await fetch(url, { method: "PUT", body: file.slice(offset, end), headers: { "Content-Type": contentType ?? (canonicalImportContentType(file.type) || "application/octet-stream"), "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` }, signal });
    if (!response.ok && response.status !== 308) throw new Error("Upload interrupted");
    offset = end;
    onProgress(Math.round(offset / file.size * 100));
  }
}
