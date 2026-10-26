import { tileToWorld } from './iso';
import type { GameState, Tile } from './types';

/** Tiles a placed lean-to stands on. The art is 64 wide, so the pair is screen-horizontal. */
export function shelterFootprint(anchor: Tile, flip: boolean): [Tile, Tile] {
  const other = flip
    ? { tx: anchor.tx - 1, ty: anchor.ty + 1 }
    : { tx: anchor.tx + 1, ty: anchor.ty - 1 };
  return [anchor, other];
}

/** World position of the lean-to sprite: the midpoint of its two tiles. */
export function shelterWorld(anchor: Tile, flip: boolean): { x: number; y: number } {
  const [a, b] = shelterFootprint(anchor, flip);
  const wa = tileToWorld(a.tx, a.ty);
  const wb = tileToWorld(b.tx, b.ty);
  return { x: (wa.x + wb.x) / 2, y: (wa.y + wb.y) / 2 };
}

export interface Occupied {
  shelter: number;
  shelterAnchor: Tile | null;
  shelterFlip: boolean;
  fireTile: Tile | null;
  fireRing: boolean;
}

export function occupiedFrom(
  state: Pick<GameState, 'shelter' | 'shelterAnchor' | 'shelterFlip' | 'fireTile' | 'fire'>,
): Occupied {
  return {
    shelter: state.shelter,
    shelterAnchor: state.shelterAnchor,
    shelterFlip: state.shelterFlip,
    fireTile: state.fireTile,
    fireRing: state.fire.ring,
  };
}
