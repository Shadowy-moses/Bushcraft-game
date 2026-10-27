import { WOOD_DOOR, WOOD_FLOOR, WOOD_FOUNDATION, WOOD_WALL } from './constants';
import { groundAt, inBounds, propAt } from './map';
import { isFelled, type TreeMark } from './trees';
import type { EdgeName, GameState, Piece, PieceKind, Tile } from './types';

export type SocketEdge = 'se' | 'sw';

export const EDGES: EdgeName[] = ['se', 'sw', 'ne', 'nw'];

export const WOOD_COST: Record<PieceKind, number> = {
  foundation: WOOD_FOUNDATION,
  wall: WOOD_WALL,
  doorway: WOOD_DOOR,
  floor: WOOD_FLOOR,
};

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
export function pieceFrame(kind: PieceKind, edge: EdgeName, ghost: 'ok' | 'bad' | null = null): string {
  const suffix = ghost === 'ok' ? '_ghost_ok' : ghost === 'bad' ? '_ghost_bad' : '';
  if (kind === 'foundation') return `twig_foundation${suffix}`;
  if (kind === 'floor') return `twig_floor${suffix}`;
  const face = edge === 'sw' || edge === 'ne' ? 'ne' : 'nw';
  const base = kind === 'doorway' ? 'twig_door' : 'twig_wall';
  return `${base}_${face}${suffix}`;
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

export function suggestPiece(state: GameState, kind: PieceKind): { tile: Tile; edge: EdgeName } {
  if (kind === 'wall' || kind === 'doorway') {
    const bases = state.pieces.filter((piece) => piece.kind === 'foundation');
    for (const base of bases) {
      for (const edge of EDGES) {
        if (wallSpot(base, edge, kind, state).ok) return { tile: { tx: base.tx, ty: base.ty }, edge };
      }
    }
  }
  for (let radius = 1; radius <= 5; radius++) {
    for (let ty = state.ty - radius; ty <= state.ty + radius; ty++) {
      for (let tx = state.tx - radius; tx <= state.tx + radius; tx++) {
        if (Math.max(Math.abs(tx - state.tx), Math.abs(ty - state.ty)) !== radius) continue;
        const tile = { tx, ty };
        if (pieceSpot(kind, tile, 'se', state).ok) return { tile, edge: 'se' };
      }
    }
  }
  return { tile: { tx: state.tx + 1, ty: state.ty }, edge: 'se' };
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

export function canAfford(state: GameState, kind: PieceKind): boolean {
  return state.inventory.wood >= WOOD_COST[kind];
}

export function woodNeed(kind: PieceKind): number {
  return WOOD_COST[kind];
}

/** True when a foundation covers the tile a felled tree used to stand on. */
export function foundationCoversTree(pieces: Piece[], trees: Record<string, TreeMark>, id: string, tx: number, ty: number): boolean {
  if (!isFelled(trees, id)) return false;
  return hasFoundation(pieces, tx, ty);
}
