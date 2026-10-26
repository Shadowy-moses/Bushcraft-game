export interface TreeMark {
  hits: number;
  /** Game minute the trunk came down. Null while it is still standing. */
  felledAt: number | null;
}

/** Swings to fell a pine or a birch. */
export const TREE_HITS = 3;
/** Wood a felled tree drops into the pack. */
export const WOOD_PER_TREE = 10;
/** Game minutes before a stump can be a tree again, if nothing was built there. */
export const REGROW_MINUTES = 90;

export function isFelled(trees: Record<string, TreeMark>, id: string): boolean {
  return trees[id]?.felledAt != null;
}

export function regrowTrees(
  trees: Record<string, TreeMark>,
  minutes: number,
  hold: (id: string) => boolean,
): Record<string, TreeMark> {
  let next: Record<string, TreeMark> | null = null;
  for (const [id, mark] of Object.entries(trees)) {
    if (mark.felledAt == null) continue;
    if (minutes - mark.felledAt < REGROW_MINUTES) continue;
    if (hold(id)) continue;
    next ??= { ...trees };
    delete next[id];
  }
  return next ?? trees;
}
