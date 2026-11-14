import { WOOD_DOOR, WOOD_FLOOR, WOOD_FOUNDATION, WOOD_WALL } from './constants';
import { tileToWorld } from './iso';
import { groundAt, inBounds, propAt } from './map';
import { BUILD_REACH, bodiesFor, canStand, inReachOf, segmentsFor } from './move';
import { isFelled, type TreeMark } from './trees';
import type { EdgeName, GameState, Material, Piece, PieceKind, Tile } from './types';

export type SocketEdge = 'se' | 'sw';

export const EDGES: EdgeName[] = ['se', 'sw', 'ne', 'nw'];

export const WOOD_COST: Record<PieceKind, number> = {
  foundation: WOOD_FOUNDATION,
  wall: WOOD_WALL,
  doorway: WOOD_DOOR,
  floor: WOOD_FLOOR,
};

/** Same counts as twig. The extra effort is in the mining, not a longer shopping list. */
export const STONE_COST: Record<PieceKind, number> = {
  foundation: WOOD_FOUNDATION,
  wall: WOOD_WALL,
  doorway: WOOD_DOOR,
  floor: WOOD_FLOOR,
};

export function materialCost(kind: PieceKind, material: Material = 'twig'): number {
  return material === 'stone' ? STONE_COST[kind] : WOOD_COST[kind];
}

export interface Spot {
  ok: boolean;
  reason: string;
}

export function pieceKey(piece: Piece): string {
  if (piece.kind === 'wall' || piece.kind === 'doorway') {
    const socket = canonicalEdge(piece.tx, piece.ty, piece.edge);
    return `${piece.kind}:${socket.tx},${socket.ty},${socket.edge}`;
  }
  return `${piece.kind}:${piece.tx},${piece.ty}`;
}

/** The shared edge, stored from the northwest tile so a wall is only counted once. */
export function canonicalEdge(tx: number, ty: number, edge: EdgeName): { tx: number; ty: number; edge: SocketEdge } {
  if (edge === 'se') return { tx, ty, edge: 'se' };
  if (edge === 'sw') return { tx, ty, edge: 'sw' };
  if (edge === 'ne') return { tx, ty: ty - 1, edge: 'sw' };
  return { tx: tx - 1, ty, edge: 'se' };
}

export function socketKey(tx: number, ty: number, edge: EdgeName): string {
  const socket = canonicalEdge(tx, ty, edge);
  return `${socket.tx},${socket.ty},${socket.edge}`;
}

export function across(tx: number, ty: number, edge: EdgeName): Tile {
  if (edge === 'se') return { tx: tx + 1, ty };
  if (edge === 'nw') return { tx: tx - 1, ty };
  if (edge === 'sw') return { tx, ty: ty + 1 };
  return { tx, ty: ty - 1 };
}

export function oppositeEdge(edge: EdgeName): EdgeName {
  if (edge === 'se') return 'nw';
  if (edge === 'nw') return 'se';
  if (edge === 'sw') return 'ne';
  return 'sw';
}

function foundationBase(pieces: Piece[], tile: Tile, edge: EdgeName): { tile: Tile; edge: EdgeName } {
  if (hasFoundation(pieces, tile.tx, tile.ty)) return { tile, edge };
  const other = across(tile.tx, tile.ty, edge);
  if (hasFoundation(pieces, other.tx, other.ty)) return { tile: other, edge: oppositeEdge(edge) };
  return { tile, edge };
}

function openEdges(pieces: Piece[], tile: Tile, edge: EdgeName): EdgeName[] {
  const start = EDGES.indexOf(edge);
  const from = start < 0 ? 0 : start;
  const open: EdgeName[] = [];
  for (let step = 1; step <= EDGES.length; step++) {
    const candidate = EDGES[(from + step) % EDGES.length];
    if (!socketTaken(pieces, tile.tx, tile.ty, candidate)) open.push(candidate);
  }
  return open;
}

function edgeInReach(tile: Tile, edge: EdgeName, feet: { x: number; y: number }): boolean {
  return inReachOf(feet.x, feet.y, pieceAnchor('wall', tile, edge), BUILD_REACH);
}

/**
 * Next edge around the foundation under this ghost.
 * Built edges are skipped. When he can reach any open edge, the others are skipped too.
 * `reachable` is false only when every open edge is out of reach (Confirm walks him closer).
 * `open` is false only when every edge of that foundation is taken.
 */
export function rotateWall(
  pieces: Piece[],
  tile: Tile,
  edge: EdgeName,
  feet?: { x: number; y: number },
): { tile: Tile; edge: EdgeName; open: boolean; reachable: boolean } {
  const base = foundationBase(pieces, tile, edge);
  const open = openEdges(pieces, base.tile, base.edge);
  if (open.length === 0) {
    const start = EDGES.indexOf(base.edge);
    const from = start < 0 ? 0 : start;
    return {
      tile: base.tile,
      edge: EDGES[(from + 1) % EDGES.length],
      open: false,
      reachable: false,
    };
  }
  const near = feet ? open.filter((candidate) => edgeInReach(base.tile, candidate, feet)) : open;
  const pool = near.length > 0 ? near : open;
  const start = EDGES.indexOf(base.edge);
  const from = start < 0 ? 0 : start;
  let next = pool[0];
  for (let step = 1; step <= EDGES.length; step++) {
    const candidate = EDGES[(from + step) % EDGES.length];
    if (pool.includes(candidate)) {
      next = candidate;
      break;
    }
  }
  return { tile: base.tile, edge: next, open: true, reachable: !feet || near.length > 0 };
}

/** The open edge a small drag is heading toward, before it is close enough to snap. */
export function edgeAhead(
  pieces: Piece[],
  tile: Tile,
  edge: EdgeName,
  aimX: number,
  aimY: number,
): { tile: Tile; edge: EdgeName } | null {
  const here = pieceAnchor('wall', tile, edge);
  const dx = aimX - here.x;
  const dy = aimY - here.y;
  const aim = Math.hypot(dx, dy);
  if (aim < 0.8) return null;
  let best: { tile: Tile; edge: EdgeName } | null = null;
  let bestScore = 0.3;
  for (const piece of pieces) {
    if (piece.kind !== 'foundation') continue;
    const base = { tx: piece.tx, ty: piece.ty };
    for (const candidate of EDGES) {
      if (base.tx === tile.tx && base.ty === tile.ty && candidate === edge) continue;
      if (socketTaken(pieces, base.tx, base.ty, candidate)) continue;
      const at = pieceAnchor('wall', base, candidate);
      const vx = at.x - here.x;
      const vy = at.y - here.y;
      const len = Math.hypot(vx, vy);
      if (len < 4 || len > 40) continue;
      const dot = (dx * vx + dy * vy) / (aim * len);
      if (dot > bestScore) {
        bestScore = dot;
        best = { tile: base, edge: candidate };
      }
    }
  }
  return best;
}

/** A stand within build reach of an anchor, biased toward where he already is. */
export function approachBuild(
  anchor: { x: number; y: number },
  feet: { x: number; y: number },
  state: Pick<GameState, 'trees' | 'pieces'>,
): { x: number; y: number } | null {
  if (inReachOf(feet.x, feet.y, anchor, BUILD_REACH)) return { x: feet.x, y: feet.y };
  const bodies = bodiesFor(state);
  const walls = segmentsFor(state.pieces);
  const base = Math.atan2(feet.y - anchor.y, feet.x - anchor.x);
  for (const dist of [32, 46, 60, 72]) {
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const angle = base + side * Math.ceil(i / 2) * (Math.PI / 16);
      const x = anchor.x + Math.cos(angle) * dist;
      const y = anchor.y + Math.sin(angle) * dist;
      if (!inReachOf(x, y, anchor, BUILD_REACH - 6)) continue;
      if (canStand(x, y, bodies, walls)) return { x, y };
    }
  }
  return null;
}

/** Closest foundation edge to a world point, ignoring edges farther than maxDist. */
export function nearestSocket(
  pieces: Piece[],
  x: number,
  y: number,
  maxDist: number,
): { tile: Tile; edge: EdgeName; dist: number } | null {
  let best: { tile: Tile; edge: EdgeName; dist: number } | null = null;
  for (const piece of pieces) {
    if (piece.kind !== 'foundation') continue;
    const tile = { tx: piece.tx, ty: piece.ty };
    for (const edge of EDGES) {
      const at = pieceAnchor('wall', tile, edge);
      const dist = Math.hypot(at.x - x, at.y - y);
      if (dist > maxDist) continue;
      if (!best || dist < best.dist) best = { tile, edge, dist };
    }
  }
  return best;
}

/** Scale a drag delta down and cap it, so one flick cannot cross the block. */
export function dampStep(dx: number, dy: number, gain: number, maxStep: number): { x: number; y: number } {
  let x = dx * gain;
  let y = dy * gain;
  const mag = Math.hypot(x, y);
  if (mag > maxStep && mag > 0) {
    x = (x / mag) * maxStep;
    y = (y / mag) * maxStep;
  }
  return { x, y };
}

export function hasFoundation(pieces: Piece[], tx: number, ty: number): boolean {
  return pieces.some((piece) => piece.kind === 'foundation' && piece.tx === tx && piece.ty === ty);
}

export function hasFloor(pieces: Piece[], tx: number, ty: number): boolean {
  return pieces.some((piece) => piece.kind === 'floor' && piece.tx === tx && piece.ty === ty);
}

function socketTaken(pieces: Piece[], tx: number, ty: number, edge: EdgeName): Piece | undefined {
  const key = socketKey(tx, ty, edge);
  return pieces.find((piece) => (piece.kind === 'wall' || piece.kind === 'doorway') && socketKey(piece.tx, piece.ty, piece.edge) === key);
}

export function supports(pieces: Piece[], tx: number, ty: number): number {
  return EDGES.filter((edge) => socketTaken(pieces, tx, ty, edge)).length;
}

export function edgeOffset(edge: EdgeName): { x: number; y: number } {
  if (edge === 'se') return { x: 8, y: 4 };
  if (edge === 'nw') return { x: -8, y: -4 };
  if (edge === 'sw') return { x: -8, y: 4 };
  return { x: 8, y: -4 };
}

/**
 * Atlas frame for a piece. Walls and doors share a drawing across parallel edges:
 * ne/sw use the ne face, nw/se use the nw face. Ghost frames are already tinted.
 */
export function pieceFrame(
  kind: PieceKind,
  edge: EdgeName,
  ghost: 'ok' | 'bad' | null = null,
  material: Material = 'twig',
): string {
  const suffix = ghost === 'ok' ? '_ghost_ok' : ghost === 'bad' ? '_ghost_bad' : '';
  const family = material === 'stone' ? 'stone' : 'twig';
  if (kind === 'foundation') return `${family}_foundation${suffix}`;
  if (kind === 'floor') return `${family}_floor${suffix}`;
  const face = edge === 'sw' || edge === 'ne' ? 'ne' : 'nw';
  const part = kind === 'doorway' ? 'door' : 'wall';
  return `${family}_${part}_${face}${suffix}`;
}

/** Screen art for an edge. The two diagonals use different drawings. */
export function edgeArt(kind: 'wall' | 'doorway', edge: EdgeName): { key: string; flip: boolean } {
  return { key: pieceFrame(kind, edge), flip: false };
}

function clearGround(tile: Tile, state: GameState): string | null {
  if (!inBounds(tile.tx, tile.ty) || !groundAt(tile.tx, tile.ty)) return 'That hangs off the edge of the woods.';
  if (groundAt(tile.tx, tile.ty) === 'creek_water') return 'The creek runs through there.';
  const prop = propAt(tile.tx, tile.ty);
  if (prop?.blocks && !isFelled(state.trees, prop.id)) {
    if (prop.kind === 'rock') return 'A rock is in the way.';
    if (prop.kind === 'bush_fiber') return 'A bush is in the way.';
    return 'A tree is in the way. Chop it down first.';
  }
  if (tile.tx === state.tx && tile.ty === state.ty) return 'You’re standing there.';
  return null;
}

function touchesFoundation(pieces: Piece[], tx: number, ty: number): boolean {
  return (
    hasFoundation(pieces, tx + 1, ty) ||
    hasFoundation(pieces, tx - 1, ty) ||
    hasFoundation(pieces, tx, ty + 1) ||
    hasFoundation(pieces, tx, ty - 1)
  );
}

export function foundationSpot(tile: Tile, state: GameState): Spot {
  const ground = clearGround(tile, state);
  if (ground) return { ok: false, reason: ground };
  if (hasFoundation(state.pieces, tile.tx, tile.ty)) return { ok: false, reason: 'A foundation is already there.' };
  const any = state.pieces.some((piece) => piece.kind === 'foundation');
  if (any && !touchesFoundation(state.pieces, tile.tx, tile.ty)) {
    return { ok: false, reason: 'Snap it to a foundation already down.' };
  }
  return { ok: true, reason: 'Clear ground. Tap Confirm to lay the foundation.' };
}

export function wallSpot(tile: Tile, edge: EdgeName, kind: 'wall' | 'doorway', state: GameState): Spot {
  const other = across(tile.tx, tile.ty, edge);
  const on =
    hasFoundation(state.pieces, tile.tx, tile.ty) || hasFoundation(state.pieces, other.tx, other.ty);
  if (!on) return { ok: false, reason: 'Walls sit on the edge of a foundation.' };
  if (socketTaken(state.pieces, tile.tx, tile.ty, edge)) return { ok: false, reason: 'That edge is already built.' };
  const name = kind === 'doorway' ? 'doorway' : 'wall';
  return { ok: true, reason: `Clear. Tap Confirm to raise the ${name}.` };
}

export function floorSpot(tile: Tile, state: GameState): Spot {
  if (!hasFoundation(state.pieces, tile.tx, tile.ty)) return { ok: false, reason: 'A floor needs a foundation under it.' };
  if (hasFloor(state.pieces, tile.tx, tile.ty)) return { ok: false, reason: 'That roof is already on.' };
  if (supports(state.pieces, tile.tx, tile.ty) < 1) return { ok: false, reason: 'Raise a wall first. The floor sits on the walls.' };
  return { ok: true, reason: 'The walls will hold it. Tap Confirm to lay the floor.' };
}

export function pieceSpot(kind: PieceKind, tile: Tile, edge: EdgeName, state: GameState): Spot {
  if (kind === 'foundation') return foundationSpot(tile, state);
  if (kind === 'floor') return floorSpot(tile, state);
  return wallSpot(tile, edge, kind, state);
}

/** Where the sprite sits, which is the point Confirm measures reach from. */
export function pieceAnchor(kind: PieceKind, tile: Tile, edge: EdgeName): { x: number; y: number } {
  const pos = tileToWorld(tile.tx, tile.ty);
  if (kind === 'wall' || kind === 'doorway') {
    const off = edgeOffset(edge);
    return { x: pos.x + off.x, y: pos.y + off.y };
  }
  return pos;
}

export function woodShortfall(kind: PieceKind, wood: number): number {
  return Math.max(0, WOOD_COST[kind] - wood);
}

export function woodShortMessage(kind: PieceKind, wood: number): string {
  return materialShortMessage(kind, wood, 'twig');
}

export function materialShortMessage(kind: PieceKind, have: number, material: Material = 'twig'): string {
  const n = Math.max(0, materialCost(kind, material) - have);
  const name = material === 'stone' ? 'stone' : 'wood';
  return `Need ${n} more ${name}`;
}

/**
 * Ghost and Confirm share this. A green ghost places.
 * Being able to walk there is not required. Out of reach is red, with one message.
 */
export function placementVerdict(
  kind: PieceKind,
  tile: Tile,
  edge: EdgeName,
  state: GameState,
  feet: { x: number; y: number },
  material: Material = 'twig',
): Spot {
  const spot = pieceSpot(kind, tile, edge, state);
  if (!spot.ok) return spot;
  const have = material === 'stone' ? state.inventory.stone : state.inventory.wood;
  if (materialCost(kind, material) > have) {
    return { ok: false, reason: materialShortMessage(kind, have, material) };
  }
  if (!inReachOf(feet.x, feet.y, pieceAnchor(kind, tile, edge), BUILD_REACH)) {
    return { ok: false, reason: "Can't reach that spot" };
  }
  return spot;
}

export function suggestPiece(
  state: GameState,
  kind: PieceKind,
  feet?: { x: number; y: number },
  material: Material = 'twig',
): { tile: Tile; edge: EdgeName } {
  const acceptable = (tile: Tile, edge: EdgeName): boolean => {
    if (!pieceSpot(kind, tile, edge, state).ok) return false;
    if (!feet) return true;
    return placementVerdict(kind, tile, edge, state, feet, material).ok;
  };
  if (kind === 'wall' || kind === 'doorway') {
    const bases = state.pieces.filter((piece) => piece.kind === 'foundation');
    for (const base of bases) {
      for (const edge of EDGES) {
        if (acceptable(base, edge)) return { tile: { tx: base.tx, ty: base.ty }, edge };
      }
    }
    if (feet) {
      for (const base of bases) {
        for (const edge of EDGES) {
          if (wallSpot(base, edge, kind, state).ok) return { tile: { tx: base.tx, ty: base.ty }, edge };
        }
      }
    }
  }
  const scan = (requireReach: boolean): { tile: Tile; edge: EdgeName } | null => {
    for (let radius = 1; radius <= 5; radius++) {
      for (let ty = state.ty - radius; ty <= state.ty + radius; ty++) {
        for (let tx = state.tx - radius; tx <= state.tx + radius; tx++) {
          if (Math.max(Math.abs(tx - state.tx), Math.abs(ty - state.ty)) !== radius) continue;
          const tile = { tx, ty };
          const edge: EdgeName = 'se';
          if (!pieceSpot(kind, tile, edge, state).ok) continue;
          if (requireReach && feet && !placementVerdict(kind, tile, edge, state, feet, material).ok) continue;
          return { tile, edge };
        }
      }
    }
    return null;
  };
  return scan(Boolean(feet)) ?? scan(false) ?? { tile: { tx: state.tx + 1, ty: state.ty }, edge: 'se' };
}

/** A solid wall stops the step. A doorway is a gap. */
export function blocksStep(pieces: Piece[], from: Tile, to: Tile): boolean {
  const dtx = to.tx - from.tx;
  const dty = to.ty - from.ty;
  let edge: EdgeName | null = null;
  if (dtx === 1 && dty === 0) edge = 'se';
  else if (dtx === -1 && dty === 0) edge = 'nw';
  else if (dtx === 0 && dty === 1) edge = 'sw';
  else if (dtx === 0 && dty === -1) edge = 'ne';
  if (!edge) return false;
  const there = socketTaken(pieces, from.tx, from.ty, edge);
  return there?.kind === 'wall';
}

export function canAfford(state: GameState, kind: PieceKind, material: Material = 'twig'): boolean {
  const have = material === 'stone' ? state.inventory.stone : state.inventory.wood;
  return have >= materialCost(kind, material);
}

export function woodNeed(kind: PieceKind): number {
  return WOOD_COST[kind];
}

/** True when a foundation covers the tile a felled tree used to stand on. */
export function foundationCoversTree(pieces: Piece[], trees: Record<string, TreeMark>, id: string, tx: number, ty: number): boolean {
  if (!isFelled(trees, id)) return false;
  return hasFoundation(pieces, tx, ty);
}
