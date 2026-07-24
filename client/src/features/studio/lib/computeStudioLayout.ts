/**
 * Studio plane layout — pure derivation, nothing spatial is ever stored
 * (ADR-0019 §4, same rule as the space).
 *
 * Turn results in (group sizes 1–4), world-coordinate positions out:
 * one group per turn, stacked chronologically downward. A 4-image generate
 * lays out 2×2; a single-image edit/transform result is a first-class
 * 1-image group, never a grid with blanks.
 */

export interface StudioLayoutGroup {
  turnId: string;
  imageIds: string[];
}

export interface StudioLayoutItem {
  imageId: string;
  turnId: string;
  x: number;
  y: number;
  size: number;
}

export const STUDIO_CELL_SIZE = 220;
export const STUDIO_CELL_GAP = 24;
export const STUDIO_GROUP_GAP = 96;

/** Images per row within a group: 2×2 for a batch of 4, one row otherwise. */
function columnsFor(count: number): number {
  return count === 4 ? 2 : count;
}

export function computeStudioLayout(
  groups: StudioLayoutGroup[],
): StudioLayoutItem[] {
  const items: StudioLayoutItem[] = [];
  let yOffset = 0;

  for (const group of groups) {
    const count = group.imageIds.length;
    if (count === 0) continue;

    const columns = columnsFor(count);
    const rows = Math.ceil(count / columns);
    const groupWidth =
      columns * STUDIO_CELL_SIZE + (columns - 1) * STUDIO_CELL_GAP;

    group.imageIds.forEach((imageId, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      items.push({
        imageId,
        turnId: group.turnId,
        // Groups are centered on x = 0 so mixed sizes align visually.
        x: column * (STUDIO_CELL_SIZE + STUDIO_CELL_GAP) - groupWidth / 2,
        y: yOffset + row * (STUDIO_CELL_SIZE + STUDIO_CELL_GAP),
        size: STUDIO_CELL_SIZE,
      });
    });

    yOffset +=
      rows * STUDIO_CELL_SIZE + (rows - 1) * STUDIO_CELL_GAP + STUDIO_GROUP_GAP;
  }

  return items;
}
