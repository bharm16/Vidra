import type { MediaVersion } from "../schemas/workflow/media.schemas";

/** Only same-kind primary/clip edits establish ancestry; references and copies do not. */
export function mediaVersionParent(version: MediaVersion, versions: ReadonlyMap<string, MediaVersion>): string | undefined {
  return version.sourceInputs.find(input => (input.role === "primary" || input.role === "clip") && input.versionId !== version.id && versions.get(input.versionId)?.kind === version.kind)?.versionId;
}
export function mediaVersionRoot(version: MediaVersion, versions: ReadonlyMap<string, MediaVersion>): string {
  let current = version;
  const seen = new Set<string>([current.id]);
  for (;;) {
    const parent = mediaVersionParent(current, versions);
    if (!parent) return current.id;
    if (seen.has(parent)) return [...seen].sort()[0] ?? current.id;
    const next = versions.get(parent);
    if (!next) return current.id;
    seen.add(parent); current = next;
  }
}
export function relatedMediaVersions(versions: MediaVersion[], selectedId: string): MediaVersion[] {
  const byId = new Map<string, MediaVersion>(versions.map(version => [version.id, version]));
  const selected = byId.get(selectedId);
  if (!selected) return [];
  const root = mediaVersionRoot(selected, byId);
  return versions.filter(version => mediaVersionRoot(version, byId) === root);
}
