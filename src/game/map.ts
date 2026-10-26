import { COLS, ROWS, SHELTER_TILES } from './constants';
import type { GroundId, Prop, PropKind, GatherKind } from './types';

/**
 * Each row is one ty, left to right in tx.
 * f forest floor, g grass, d dirt clearing, w creek, e creek-edge stones.
 */
export const GROUND_ROWS = [
  'ffffffffffff',
  'fggggggggggf',
  'fgggddddgggf',
  'fggddddddggf',
  'fggddddddggf',
  'fgggddddgggf',
  'ffgggddgggff',
  'efffggggfffe',
  'wefffgggffew',
  'wweffggffeww',
  'wwwweffeewww',
  'wwwwweeeewww',
];

const GROUND_CHAR: Record<string, GroundId> = {
  f: 'forest_floor',
  g: 'grass',
  d: 'dirt',
  w: 'creek_water',
  e: 'creek_edge_stones',
};

export function inBounds(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
}

export function groundAt(tx: number, ty: number): GroundId | null {
  if (!inBounds(tx, ty)) return null;
  return GROUND_CHAR[GROUND_ROWS[ty][tx]] ?? null;
}

function prop(
  kind: PropKind,
  tx: number,
  ty: number,
  blocks: boolean,
  gather?: GatherKind,
  amount = 1,
): Prop {
  return { id: `${kind}-${tx}-${ty}`, kind, tx, ty, blocks, gather, amount };
}

export const PROPS: Prop[] = [
  // Back wall of pines and birch, plus a few close enough to see from camp.
  prop('pine_tree', 1, 0, true),
  prop('birch_tree', 3, 0, true, 'tinder'),
  prop('pine_tree', 5, 0, true),
  prop('pine_tree', 8, 0, true),
  prop('birch_tree', 9, 0, true, 'tinder'),
  prop('pine_tree', 11, 0, true),
  prop('birch_tree', 4, 1, true, 'tinder'),
  prop('pine_tree', 6, 1, true),
  prop('birch_tree', 11, 1, true, 'tinder'),
  prop('pine_tree', 0, 2, true),
  prop('rock', 2, 2, true),
  prop('rock', 10, 2, true),
  prop('pine_tree', 11, 2, true),
  prop('bush_fiber', 1, 3, true, 'fiber'),
  prop('pine_tree', 0, 4, true),
  prop('pine_tree', 2, 4, true),
  prop('pine_tree', 11, 4, true),
  prop('birch_tree', 0, 5, true, 'tinder'),
  prop('bush_fiber', 2, 5, true, 'fiber'),
  prop('bush_fiber', 9, 5, true, 'fiber'),
  prop('birch_tree', 10, 5, true, 'tinder'),
  prop('pine_tree', 0, 6, true),
  prop('rock', 3, 6, true),
  prop('pine_tree', 11, 6, true),
  prop('pine_tree', 2, 7, true),
  prop('bush_fiber', 8, 7, true, 'fiber'),
  prop('pine_tree', 11, 7, true),
  prop('pine_tree', 4, 8, true),
  prop('rock', 8, 8, true),
  prop('pine_tree', 6, 9, true),
  prop('pine_tree', 8, 9, true),

  // Loose sticks. A few sit in the first view so the tap is obvious.
  prop('item_sticks', 5, 2, false, 'sticks'),
  prop('item_sticks', 2, 3, false, 'sticks'),
  prop('item_sticks', 4, 3, false, 'sticks'),
  prop('item_sticks', 6, 3, false, 'sticks'),
  prop('item_sticks', 8, 3, false, 'sticks'),
  prop('item_sticks', 5, 4, false, 'sticks'),
  prop('item_sticks', 10, 4, false, 'sticks'),
  prop('item_sticks', 3, 5, false, 'sticks'),
  prop('item_sticks', 4, 5, false, 'sticks'),
  prop('item_sticks', 6, 5, false, 'sticks'),
  prop('item_sticks', 8, 5, false, 'sticks'),
  prop('item_sticks', 8, 6, false, 'sticks'),
  prop('item_sticks', 7, 6, false, 'sticks'),
  prop('item_sticks', 5, 7, false, 'sticks'),

  prop('item_stone', 6, 4, false, 'stones'),
  prop('item_stone', 4, 4, false, 'stones'),
  prop('item_stone', 8, 4, false, 'stones'),
  prop('item_stone', 5, 5, false, 'stones'),
  prop('item_stone', 7, 7, false, 'stones'),

  prop('leaf_pile', 4, 6, false, 'leaves'),
  prop('leaf_pile', 6, 6, false, 'leaves'),
  prop('leaf_pile', 9, 4, false, 'leaves'),
  prop('leaf_pile', 3, 7, false, 'leaves'),
  prop('leaf_pile', 5, 8, false, 'leaves'),
];

const BY_ID = new Map(PROPS.map((p) => [p.id, p]));
const BY_TILE = new Map(PROPS.map((p) => [`${p.tx},${p.ty}`, p]));

export function propById(id: string): Prop | undefined {
  return BY_ID.get(id);
}

export function propAt(tx: number, ty: number): Prop | undefined {
  return BY_TILE.get(`${tx},${ty}`);
}

export function isBlocked(tx: number, ty: number, shelterStage: number): boolean {
  if (!inBounds(tx, ty)) return true;
  if (groundAt(tx, ty) === 'creek_water') return true;
  if (shelterStage >= 1 && SHELTER_TILES.some((tile) => tile.tx === tx && tile.ty === ty)) return true;
  const propHere = propAt(tx, ty);
  return Boolean(propHere?.blocks);
}
