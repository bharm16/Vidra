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
export async function transferImport(ownerId: string, url: string, file: Blob, offset: number, signal: AbortSignal, onProgress: (percent: number) => void, options: { contentType?: ImportCommand["contentType"]; reconcileOffset?: () => Promise<number> } = {}): Promise<void> {
  const chunkSize = 8 * 1024 * 1024; // GCS chunks are multiples of 256 KiB.
  onProgress(Math.round(offset / file.size * 100));
  while (offset < file.size) {
    if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("Sign in to the original account to resume this upload.");
    signal.throwIfAborted();
    const end = Math.min(offset + chunkSize, file.size);
    const response = await fetch(url, { method: "PUT", body: file.slice(offset, end), headers: { "Content-Type": options.contentType ?? (canonicalImportContentType(file.type) || "application/octet-stream"), "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` }, signal });
    if (!response.ok && response.status !== 308) throw new Error("Upload interrupted");
    if (response.status === 308) {
      const acknowledged = /^bytes=0-(\d+)$/.exec(response.headers.get("range") ?? "");
      const next = acknowledged?.[1] === undefined ? await options.reconcileOffset?.() ?? 0 : Number(acknowledged[1]) + 1;
      if (!Number.isSafeInteger(next) || next <= offset || next > end) throw new Error("The upload position could not be confirmed. Retry to resume the same file.");
      offset = next;
    } else {
      if (end !== file.size) throw new Error("The upload completed at an unexpected position.");
      offset = file.size;
    }
    onProgress(Math.round(offset / file.size * 100));
  }
}
