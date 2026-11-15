import type { EdgeName, GameState, Piece, Prop } from './types';
import { COBBLE_REACH, COLS, TILE_H, TILE_W } from './constants';
import { isFiberCut } from './fiber';
import { tileToWorld, worldToTile } from './iso';
import { groundAt, inBounds, PROPS } from './map';
import { isFelled } from './trees';

/** Feet stay about this far from a solid. */
export const PLAYER_RADIUS = 3.5;
/** Trunks block a circle, not the whole tile, so he can stand beside one. */
export const TRUNK_RADIUS = 6;
export const STUMP_RADIUS = 3.5;
export const ROCK_RADIUS = 7;
/** The lashed legs. Wide enough to stop a walk-through, narrow enough to rest beside. */
export const TRIPOD_RADIUS = 9;
/** World pixels per second while the stick is only part way out. */
export const WALK_SPEED = 52;
/** Full deflection. About twice a walk, so a hard push reads as a run. */
export const RUN_SPEED = 104;
export const RUN_STICK = 0.85;
/** Kept for anything that still wants a single pace. A full push uses RUN_SPEED. */
export const MOVE_SPEED = WALK_SPEED;
/**
 * Close enough to chop or pick something up.
 * Wide enough that the tree you are standing against — the one the ring is on — is the one Use hits.
 */
export const REACH = 54;
/** A trunk is tall. Standing beside the one in front of him is close enough to chop. */
export const CHOP_REACH = 96;
/** A ghost this close can be confirmed. Same test the preview uses. */
export const BUILD_REACH = 78;
/** Sticks and stones inside this radius are picked up by walking over them. */
export const PICKUP_RADIUS = 16;
/**
 * Fractional-tile inset from the void.
 * The outer ring of tiles is the rim; standing on it left his body in the black.
 */
export const ISLAND_MARGIN = 1.05;

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

/** True when this point is off the island or his body would hang into the void. */
export function offIsland(x: number, y: number): boolean {
  const tile = worldToTile(x, y);
  if (!inBounds(tile.tx, tile.ty)) return true;
  if (groundAt(tile.tx, tile.ty) === 'creek_gravel') return false;
  const ftx = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
  const fty = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
  const max = COLS - 1 - ISLAND_MARGIN;
  if (ftx < ISLAND_MARGIN || fty < ISLAND_MARGIN || ftx > max || fty > max) return true;
  return false;
}

/** Below this the stick is still. A short lean stays slow; the rim still runs. */
export const STICK_DEAD = 0.16;

/**
 * Direction only. Speed comes from the raw tilt, so a small lean does not
 * become a full step.
 */
export function stickDirection(x: number, y: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag < STICK_DEAD) return { x: 0, y: 0 };
  return { x: x / mag, y: y / mag };
}

/**
 * Partial stick walks. Just past the dead zone he creeps. A push at the rim
 * still runs at RUN_SPEED. Magnitude is the raw stick tilt, 0–1.
 */
export function travelSpeed(magnitude: number): { speed: number; running: boolean } {
  const mag = Math.min(1, Math.max(0, magnitude));
  if (mag < STICK_DEAD) return { speed: 0, running: false };
  if (mag >= RUN_STICK) return { speed: RUN_SPEED, running: true };
  const t = (mag - STICK_DEAD) / (RUN_STICK - STICK_DEAD);
  const eased = t * t * (3 - 2 * t);
  return { speed: WALK_SPEED * (0.18 + 0.82 * eased), running: false };
}

export function bodiesFor(
  state: Pick<GameState, 'trees'> & { pieces?: Piece[]; plants?: Record<string, number>; minutes?: number },
  skipId?: string,
): Body[] {
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
    if (prop.kind === 'bush_fiber' || prop.kind === 'berry_bush') {
      if (isFiberCut(state.plants ?? {}, prop.id, state.minutes ?? 0)) continue;
      bodies.push({ x: at.x, y: at.y, r: ROCK_RADIUS, id: prop.id });
      continue;
    }
    if (prop.kind === 'rock') {
      bodies.push({ x: at.x, y: at.y, r: ROCK_RADIUS, id: prop.id });
    }
  }
  for (const piece of state.pieces ?? []) {
    if (piece.kind !== 'tripod') continue;
    const at = tileToWorld(piece.tx, piece.ty);
    bodies.push({ x: at.x, y: at.y, r: TRIPOD_RADIUS, id: `tripod-${piece.tx}-${piece.ty}` });
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

/** True when his whole foot-circle is clear and still on the island. */
export function canStand(x: number, y: number, bodies: Body[], walls: WallSeg[]): boolean {
  if (offIsland(x, y)) return false;
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
    const px = -sy;
    const py = sx;
    if (canStand(cx + px, cy + py, bodies, walls)) {
      cx += px;
      cy += py;
      continue;
    }
    if (canStand(cx - px, cy - py, bodies, walls)) {
      cx -= px;
      cy -= py;
      continue;
    }
    break;
  }
  if (!canStand(cx, cy, bodies, walls)) {
    const free = nearestFree(cx, cy, bodies, walls);
    if (free) return free;
  }
  return { x: cx, y: cy };
}

function nearestFree(x: number, y: number, bodies: Body[], walls: WallSeg[]): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let ring = 2; ring <= 14; ring += 2) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const nx = x + Math.cos(angle) * ring;
      const ny = y + Math.sin(angle) * ring;
      if (!canStand(nx, ny, bodies, walls)) continue;
      const d = Math.hypot(nx - x, ny - y);
      if (d < bestD) {
        best = { x: nx, y: ny };
        bestD = d;
      }
    }
    if (best) return best;
  }
  return null;
}

export function reachFor(node: { kind: string }): number {
  return node.kind === 'river_cobbles' ? COBBLE_REACH : REACH;
}

/**
 * If he loaded or upgraded into a walled tile, or the doorway is the only gap,
 * stand him just outside that gap. Stone and twig share the same edge collider.
 */
export function escapeEnclosure(state: Pick<GameState, 'x' | 'y' | 'pieces' | 'trees'>): { x: number; y: number } {
  const bodies = bodiesFor(state);
  const walls = segmentsFor(state.pieces);
  if (canExit(state.x, state.y, bodies, walls, state.pieces)) return { x: state.x, y: state.y };
  for (const piece of state.pieces) {
    if (piece.kind !== 'doorway') continue;
    const spot = outsideDoor(piece);
    if (canStand(spot.x, spot.y, bodies, walls)) return spot;
  }
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = state.y - 48; y <= state.y + 48; y += 4) {
    for (let x = state.x - 48; x <= state.x + 48; x += 4) {
      if (!canStand(x, y, bodies, walls)) continue;
      const d = Math.hypot(x - state.x, y - state.y);
      if (d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best ?? { x: state.x, y: state.y };
}

function outsideDoor(piece: Piece): { x: number; y: number } {
  const center = tileToWorld(piece.tx, piece.ty);
  const at = pieceAnchorDoor(piece);
  const dx = at.x - center.x;
  const dy = at.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: at.x + (dx / len) * 16, y: at.y + (dy / len) * 16 };
}

function pieceAnchorDoor(piece: Piece): { x: number; y: number } {
  const center = tileToWorld(piece.tx, piece.ty);
  const off = EDGE_ENDS[piece.edge];
  return {
    x: center.x + (off[0].x + off[1].x) / 2,
    y: center.y + (off[0].y + off[1].y) / 2,
  };
}

function edgesBuilt(pieces: Piece[], tx: number, ty: number): number {
  return (['se', 'sw', 'ne', 'nw'] as EdgeName[]).filter((edge) =>
    pieces.some((piece) => (piece.kind === 'wall' || piece.kind === 'doorway') && piece.tx === tx && piece.ty === ty && piece.edge === edge),
  ).length;
}

function canExit(
  x: number,
  y: number,
  bodies: Body[],
  walls: WallSeg[],
  pieces: Piece[],
): boolean {
  if (!canStand(x, y, bodies, walls)) return false;
  const tile = worldToTile(x, y);
  if (edgesBuilt(pieces, tile.tx, tile.ty) < 3) return true;
  const door = pieces.find(
    (piece) => piece.kind === 'doorway' && piece.tx === tile.tx && piece.ty === tile.ty,
  );
  if (!door) return false;
  const out = outsideDoor(door);
  const dx = out.x - x;
  const dy = out.y - y;
  const moved = resolveMove(x, y, dx, dy, bodies, walls);
  return Math.hypot(moved.x - x, moved.y - y) > 8;
}

export function inReach(x: number, y: number, tx: number, ty: number, reach = REACH): boolean {
  const at = tileToWorld(tx, ty);
  return Math.hypot(x - at.x, y - at.y) <= reach;
}

/** A place he can stand and still reach this pickup, including a cobble from the bank. */
export function gatherStand(
  prop: Prop,
  state: Pick<GameState, 'trees' | 'pieces'> & { plants?: Record<string, number>; minutes?: number },
): { x: number; y: number } | null {
  const at = tileToWorld(prop.tx, prop.ty);
  const reach = reachFor(prop);
  const bodies = bodiesFor(state);
  const walls = segmentsFor(state.pieces ?? []);
  const tryAt = (x: number, y: number) =>
    Math.hypot(x - at.x, y - at.y) <= reach && canStand(x, y, bodies, walls);
  if (tryAt(at.x, at.y)) return { x: at.x, y: at.y };
  for (const dist of [12, 20, 32, 44, 56, 72, 84]) {
    if (dist > reach) break;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = at.x + Math.cos(angle) * dist;
      const y = at.y + Math.sin(angle) * dist;
      if (tryAt(x, y)) return { x, y };
    }
  }
  return null;
}

export function inReachOf(x: number, y: number, at: { x: number; y: number }, reach = REACH): boolean {
  return Math.hypot(x - at.x, y - at.y) <= reach;
}

/** A clear place to stand and swing at this trunk. Null when the tree is walled in. */
export function approachPoint(
  prop: { id: string; tx: number; ty: number },
  state: Pick<GameState, 'trees' | 'pieces'>,
): { x: number; y: number } | null {
  const at = tileToWorld(prop.tx, prop.ty);
  const bodies = bodiesFor(state, prop.id);
  const walls = segmentsFor(state.pieces);
  for (const extra of [1.5, 4, 7, 14, 22, 32]) {
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
