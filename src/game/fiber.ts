/**
 * Bast fiber from the standing plants, and the cord twisted from it.
 * A plant gives two or three handfuls, then sits as stubble for about a day.
 */

/** Game minutes before cut stubble is a plant again. One full day on the clock. */
export const FIBER_REGROW_MINUTES = 1440;
/** Fiber twisted into one length of cord. */
export const CORD_FIBER = 3;
/** Real seconds the reverse-wrap takes. Short, and you do it twice for a tripod. */
export const CORD_SECONDS = 8;

export function fiberFromPlant(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 2 + ((hash >>> 0) % 2);
}

export function isFiberCut(plants: Record<string, number>, id: string, minutes: number): boolean {
  const at = plants[id];
  return at != null && minutes - at < FIBER_REGROW_MINUTES;
}

export function regrowFiber(plants: Record<string, number>, minutes: number): Record<string, number> {
  let next: Record<string, number> | null = null;
  for (const [id, at] of Object.entries(plants)) {
    if (minutes - at < FIBER_REGROW_MINUTES) continue;
    next ??= { ...plants };
    delete next[id];
  }
  return next ?? plants;
}

export function fiberFrame(plants: Record<string, number>, id: string, minutes: number): string {
  return isFiberCut(plants, id, minutes) ? 'bush_fiber_cut' : 'bush_fiber';
}
