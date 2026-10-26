import { shelterFootprint } from './footprint';
import { groundAt, inBounds, propAt } from './map';
import type { GameState, Tile } from './types';

export interface Spot {
  ok: boolean;
  reason: string;
}

/**
 * The lean-to painting is 64 pixels wide, which is exactly two ground tiles
 * side by side on screen. Turning it onto the other diagonal would not match
 * the art, so placement only flips which side the second tile sits on.
 */
export function shelterSpot(anchor: Tile, flip: boolean, state: GameState): Spot {
  const tiles = shelterFootprint(anchor, flip);
  for (const tile of tiles) {
    const reason = tileReason(tile, state, 'shelter');
    if (reason) return { ok: false, reason };
  }
  return { ok: true, reason: 'Clear ground. Tap Confirm to build here.' };
}

export function fireSpot(anchor: Tile, state: GameState): Spot {
  const reason = tileReason(anchor, state, 'fire');
  if (reason) return { ok: false, reason };
  return { ok: true, reason: 'Clear ground. Tap Confirm to lay the ring here.' };
}

function tileReason(tile: Tile, state: GameState, kind: 'shelter' | 'fire'): string | null {
  if (!inBounds(tile.tx, tile.ty) || !groundAt(tile.tx, tile.ty)) return 'That hangs off the edge of the woods.';
  if (groundAt(tile.tx, tile.ty) === 'creek_water') return 'The creek runs through there.';
  const prop = propAt(tile.tx, tile.ty);
  if (prop?.blocks) {
    if (prop.kind === 'rock') return 'A rock is in the way.';
    if (prop.kind === 'bush_fiber') return 'A bush is in the way.';
    return 'A tree is in the way.';
  }
  if (
    prop &&
    !state.picked[prop.id] &&
    (prop.kind === 'item_sticks' || prop.kind === 'item_stone' || prop.kind === 'leaf_pile')
  ) {
    return 'Pick that up first.';
  }
  if (tile.tx === state.tx && tile.ty === state.ty) return 'You’re standing there.';
  if (state.fire.ring && state.fireTile && state.fireTile.tx === tile.tx && state.fireTile.ty === tile.ty) {
    return 'The fire is there.';
  }
  if (kind === 'fire' && state.shelter >= 1 && state.shelterAnchor) {
    const foot = shelterFootprint(state.shelterAnchor, state.shelterFlip);
    if (foot.some((part) => part.tx === tile.tx && part.ty === tile.ty)) return 'The lean-to is there.';
  }
  return null;
}

/** A nearby clear tile, so the ghost starts somewhere useful. */
export function suggestAnchor(state: GameState, kind: 'shelter' | 'fire'): { anchor: Tile; flip: boolean } {
  for (let radius = 1; radius <= 5; radius++) {
    for (let ty = state.ty - radius; ty <= state.ty + radius; ty++) {
      for (let tx = state.tx - radius; tx <= state.tx + radius; tx++) {
        if (Math.max(Math.abs(tx - state.tx), Math.abs(ty - state.ty)) !== radius) continue;
        const anchor = { tx, ty };
        if (kind === 'fire') {
          if (fireSpot(anchor, state).ok) return { anchor, flip: false };
          continue;
        }
        if (shelterSpot(anchor, false, state).ok) return { anchor, flip: false };
        if (shelterSpot(anchor, true, state).ok) return { anchor, flip: true };
      }
    }
  }
  return { anchor: { tx: state.tx + 1, ty: state.ty }, flip: false };
}
