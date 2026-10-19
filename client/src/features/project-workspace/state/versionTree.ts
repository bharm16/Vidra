import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export interface VersionTreeRow {
  version: MediaVersion;
  number: number;
  depth: number;
  hasChildren: boolean;
  nextSibling: boolean;
  ancestorRails: boolean[];
}

/** Only an explicit same-kind edit input establishes a version parent. References never do. */
export function mediaVersionParent(version: MediaVersion, versions: Map<string, MediaVersion>): string | undefined {
  const input = version.sourceInputs.find(candidate => (candidate.role === "primary" || candidate.role === "clip") && versions.get(candidate.versionId)?.kind === version.kind && candidate.versionId !== version.id);
  return input?.versionId;
}

export function versionTree(versions: MediaVersion[], selectedVersionId: string | undefined): VersionTreeRow[] {
  const byId = new Map<string, MediaVersion>(versions.map(version => [version.id, version]));
  const rootOf = (version: MediaVersion): string => {
    let current = version;
    const visited = new Set<string>([current.id]);
    for (;;) {
      const parentId = mediaVersionParent(current, byId);
      if (!parentId) return current.id;
      if (visited.has(parentId)) return [...visited].sort()[0] ?? current.id;
      const parent = byId.get(parentId);
      if (!parent) return current.id;
      visited.add(parentId); current = parent;
    }
  };
  const selected = selectedVersionId ? byId.get(selectedVersionId) : undefined;
  const rootId = selected ? rootOf(selected) : undefined;
  const family = versions.filter(version => !rootId || rootOf(version) === rootId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numbers = new Map<string, number>(family.map((version, index) => [version.id, index + 1]));
  const familyIds = new Set<string>(family.map(version => version.id));
  const children = new Map<string, MediaVersion[]>();
  const roots: MediaVersion[] = [];
  for (const version of family) {
    const parent = mediaVersionParent(version, byId);
    if (parent && familyIds.has(parent)) children.set(parent, [...(children.get(parent) ?? []), version]);
    else roots.push(version);
  }
  const rows: VersionTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (version: MediaVersion, depth: number, nextSibling: boolean, ancestorRails: boolean[]): void => {
    if (visited.has(version.id)) return;
    visited.add(version.id);
    const descendants = children.get(version.id) ?? [];
    rows.push({ version, number: numbers.get(version.id) ?? 1, depth, nextSibling, ancestorRails, hasChildren: descendants.length > 0 });
    descendants.forEach((child, index) => visit(child, depth + 1, index < descendants.length - 1, depth ? [...ancestorRails, nextSibling] : []));
  };
  roots.forEach((version, index) => visit(version, 0, index < roots.length - 1, []));
  // Broken historical cycles remain inspectable without a fabricated ancestry.
  family.forEach(version => { if (!visited.has(version.id)) visit(version, 0, false, []); });
  return rows;
}
