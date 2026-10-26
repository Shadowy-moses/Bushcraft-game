import type { Tile } from './types';

export const DIRS: Tile[] = [
  { tx: 1, ty: 0 },
  { tx: -1, ty: 0 },
  { tx: 0, ty: 1 },
  { tx: 0, ty: -1 },
];

const APPROACH: Tile[] = [
  ...DIRS,
  { tx: 1, ty: 1 },
  { tx: 1, ty: -1 },
  { tx: -1, ty: 1 },
  { tx: -1, ty: -1 },
  { tx: 0, ty: 0 },
];

function key(t: Tile): string {
  return `${t.tx},${t.ty}`;
}

/** Steps from start to goal, not including start. Null when no path exists. Empty when already there. */
export function findPath(
  start: Tile,
  goal: Tile,
  blocked: (tx: number, ty: number) => boolean,
  blockedEdge: (from: Tile, to: Tile) => boolean = () => false,
): Tile[] | null {
  if (start.tx === goal.tx && start.ty === goal.ty) return [];
  if (blocked(goal.tx, goal.ty)) return null;

  const open: Tile[] = [start];
  const openSet = new Set<string>([key(start)]);
  const came = new Map<string, string>();
  const g = new Map<string, number>([[key(start), 0]]);
  const f = new Map<string, number>([[key(start), Math.abs(goal.tx - start.tx) + Math.abs(goal.ty - start.ty)]]);

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if ((f.get(key(open[i])) ?? 0) < (f.get(key(open[best])) ?? 0)) best = i;
    }
    const current = open.splice(best, 1)[0];
    const ck = key(current);
    openSet.delete(ck);
    if (current.tx === goal.tx && current.ty === goal.ty) {
      const path: Tile[] = [];
      let cursor = ck;
      while (came.has(cursor)) {
        const [tx, ty] = cursor.split(',').map(Number);
        path.push({ tx, ty });
        cursor = came.get(cursor)!;
      }
      path.reverse();
      return path;
    }
    for (const d of DIRS) {
      const next = { tx: current.tx + d.tx, ty: current.ty + d.ty };
      if (blocked(next.tx, next.ty) || blockedEdge(current, next)) continue;
      const nk = key(next);
      const tentative = (g.get(ck) ?? 0) + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, ck);
        g.set(nk, tentative);
        f.set(nk, tentative + Math.abs(goal.tx - next.tx) + Math.abs(goal.ty - next.ty));
        if (!openSet.has(nk)) {
          open.push(next);
          openSet.add(nk);
        }
      }
    }
  }
  return null;
}

export function planRoute(
  from: Tile,
  tx: number,
  ty: number,
  blocked: (tx: number, ty: number) => boolean,
  blockedEdge: (from: Tile, to: Tile) => boolean = () => false,
): { path: Tile[]; stand: Tile } | null {
  let best: { path: Tile[]; stand: Tile } | null = null;
  for (const d of APPROACH) {
    const stand = { tx: tx + d.tx, ty: ty + d.ty };
    if (blocked(stand.tx, stand.ty)) continue;
    const path = findPath(from, stand, blocked, blockedEdge);
    if (path === null) continue;
    if (!best || path.length < best.path.length) best = { path, stand };
  }
  return best;
}
