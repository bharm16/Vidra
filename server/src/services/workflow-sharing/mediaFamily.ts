import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

/** Matches the version panel: references, animation inputs and copies never imply an edit parent. */
export function relatedMediaVersions(versions: MediaVersion[], selectedId: string): MediaVersion[] {
  const byId = new Map<string, MediaVersion>(versions.map(version => [version.id, version]));
  const root = (version: MediaVersion): string => {
    let current = version;
    const seen = new Set<string>([current.id]);
    for (;;) {
      const parent = current.sourceInputs.find(input => (input.role === "primary" || input.role === "clip") && input.versionId !== current.id && byId.get(input.versionId)?.kind === current.kind);
      if (!parent) return current.id;
      if (seen.has(parent.versionId)) return [...seen].sort()[0] ?? current.id;
      const next = byId.get(parent.versionId); if (!next) return current.id;
      seen.add(next.id); current = next;
    }
  };
  const selected = byId.get(selectedId); if (!selected) return [];
  const selectedRoot = root(selected);
  return versions.filter(version => root(version) === selectedRoot);
}
