import type { EdgeName, GameState, Piece } from './types';
import { tileToWorld, worldToTile } from './iso';
import { groundAt, inBounds, PROPS } from './map';
import { isFelled } from './trees';

/** Feet stay about this far from a solid. */
export const PLAYER_RADIUS = 3.5;
/** Trunks block a circle, not the whole tile, so he can stand beside one. */
export const TRUNK_RADIUS = 6;
export const STUMP_RADIUS = 3.5;
export const ROCK_RADIUS = 7;
/** World pixels per second at a full stick or key press. */
export const MOVE_SPEED = 62;
/** Close enough to chop or pick something up. Covers the tile he is standing beside. */
export const REACH = 42;

export interface Body {
  x: number;
  y: number;
  r: number;
  id: string;
}

export interface WallSeg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  gap: boolean;
}

const EDGE_ENDS: Record<EdgeName, [{ x: number; y: number }, { x: number; y: number }]> = {
  se: [
    { x: 16, y: 0 },
    { x: 0, y: 8 },
  ],
  sw: [
    { x: -16, y: 0 },
    { x: 0, y: 8 },
  ],
  ne: [
    { x: 16, y: 0 },
    { x: 0, y: -8 },
  ],
  nw: [
    { x: -16, y: 0 },
    { x: 0, y: -8 },
  ],
};

export function blockedGround(x: number, y: number): boolean {
  const tile = worldToTile(x, y);
  if (!inBounds(tile.tx, tile.ty)) return true;
  return groundAt(tile.tx, tile.ty) === 'creek_water';
}

export function bodiesFor(state: Pick<GameState, 'trees'>, skipId?: string): Body[] {
  const bodies: Body[] = [];
  for (const prop of PROPS) {
    if (prop.id === skipId) continue;
    const at = tileToWorld(prop.tx, prop.ty);
    if (prop.kind === 'pine_tree' || prop.kind === 'birch_tree') {
      bodies.push({
        x: at.x,
        y: at.y,
        r: isFelled(state.trees, prop.id) ? STUMP_RADIUS : TRUNK_RADIUS,
        id: prop.id,
      });
      continue;
    }
    if (prop.kind === 'rock' || prop.kind === 'bush_fiber') {
      bodies.push({ x: at.x, y: at.y, r: ROCK_RADIUS, id: prop.id });
    }
  }
  return bodies;
}

export function segmentsFor(pieces: Piece[]): WallSeg[] {
  const segs: WallSeg[] = [];
  for (const piece of pieces) {
    if (piece.kind !== 'wall' && piece.kind !== 'doorway') continue;
    const center = tileToWorld(piece.tx, piece.ty);
    const [a, b] = EDGE_ENDS[piece.edge];
    segs.push({
      ax: center.x + a.x,
      ay: center.y + a.y,
      bx: center.x + b.x,
      by: center.y + b.y,
      gap: piece.kind === 'doorway',
    });
  }
  return segs;
}

function hitsCircle(x: number, y: number, body: Body): boolean {
  const dx = x - body.x;
  const dy = y - body.y;
  return dx * dx + dy * dy < body.r * body.r;
}

function distToSpan(px: number, py: number, seg: WallSeg, t0: number, t1: number): number {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Infinity;
  let t = ((px - seg.ax) * dx + (py - seg.ay) * dy) / len2;
  t = Math.max(t0, Math.min(t1, t));
  const cx = seg.ax + dx * t;
  const cy = seg.ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function hitsWall(x: number, y: number, seg: WallSeg, radius: number): boolean {
  if (!seg.gap) return distToSpan(x, y, seg, 0, 1) < radius;
  return distToSpan(x, y, seg, 0, 0.18) < radius || distToSpan(x, y, seg, 0.82, 1) < radius;
}

export function pointBlocked(x: number, y: number, bodies: Body[], walls: WallSeg[]): boolean {
  if (blockedGround(x, y)) return true;
  for (const body of bodies) {
    if (hitsCircle(x, y, body)) return true;
  }
  for (const wall of walls) {
    if (hitsWall(x, y, wall, 0.8)) return true;
  }
  return false;
}

/** True when his whole foot-circle is clear. */
export function canStand(x: number, y: number, bodies: Body[], walls: WallSeg[]): boolean {
  if (pointBlocked(x, y, bodies, walls)) return false;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(angle) * PLAYER_RADIUS;
    const sy = y + Math.sin(angle) * PLAYER_RADIUS;
    if (pointBlocked(sx, sy, bodies, walls)) return false;
  }
  return true;
}

export function resolveMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  bodies: Body[],
  walls: WallSeg[],
): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x, y };
  const steps = Math.max(1, Math.ceil(dist / 1.5));
  let cx = x;
  let cy = y;
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (canStand(cx + sx, cy + sy, bodies, walls)) {
      cx += sx;
      cy += sy;
      continue;
    }
    if (canStand(cx + sx, cy, bodies, walls)) {
      cx += sx;
      continue;
    }
    if (canStand(cx, cy + sy, bodies, walls)) {
      cy += sy;
      continue;
    }
    break;
  }
  return { x: cx, y: cy };
}

export function inReach(x: number, y: number, tx: number, ty: number): boolean {
  const at = tileToWorld(tx, ty);
  return Math.hypot(x - at.x, y - at.y) <= REACH;
}

/** A clear place to stand and swing at this trunk. Null when the tree is walled in. */
export function approachPoint(
  prop: { id: string; tx: number; ty: number },
  state: Pick<GameState, 'trees' | 'pieces'>,
): { x: number; y: number } | null {
  const at = tileToWorld(prop.tx, prop.ty);
  const bodies = bodiesFor(state, prop.id);
  const walls = segmentsFor(state.pieces);
  for (const extra of [1.5, 4, 7]) {
    const dist = TRUNK_RADIUS + PLAYER_RADIUS + extra;
    if (dist > REACH) break;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const x = at.x + Math.cos(angle) * dist;
      const y = at.y + Math.sin(angle) * dist;
      if (canStand(x, y, bodies, walls)) return { x, y };
    }
  }
  return null;
}
