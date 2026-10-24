import { mediaVersionParent, mediaVersionRoot } from "@shared/workflow/mediaLineage";
export { mediaVersionParent } from "@shared/workflow/mediaLineage";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export interface VersionTreeRow {
  version: MediaVersion;
  number: number;
  depth: number;
  hasChildren: boolean;
  nextSibling: boolean;
  ancestorRails: boolean[];
}

export function versionTree(versions: MediaVersion[], selectedVersionId: string | undefined): VersionTreeRow[] {
  const byId = new Map<string, MediaVersion>(versions.map(version => [version.id, version]));
  const selected = selectedVersionId ? byId.get(selectedVersionId) : undefined;
  const rootId = selected ? mediaVersionRoot(selected, byId) : undefined;
  const family = versions.filter(version => !rootId || mediaVersionRoot(version, byId) === rootId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
