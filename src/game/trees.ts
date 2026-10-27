export interface TreeMark {
  hits: number;
  /** Game minute the trunk came down. Null while it is still standing. */
  felledAt: number | null;
}

/** Swings to fell a pine or a birch. */
export const TREE_HITS = 3;
/** Wood a felled tree drops into the pack. Each trunk rolls in this range. */
export const WOOD_MIN = 3;
export const WOOD_MAX = 5;
/**
 * Game minutes before a stump can be a tree again, if nothing was built there.
 * At the working clock this is a few real minutes.
 */
export const REGROW_MINUTES = 150;

/** Stable 3–5 roll for this trunk at the minute it falls. */
export function woodFromTree(id: string, minutes: number): number {
  let hash = 2166136261;
  const text = `${id}:${Math.floor(minutes)}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return WOOD_MIN + ((hash >>> 0) % (WOOD_MAX - WOOD_MIN + 1));
}

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
