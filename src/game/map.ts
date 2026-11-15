import { COLS, ROWS } from './constants';
import { isFiberCut } from './fiber';
import { isFelled } from './trees';
import type { GameState, GroundId, Prop, PropKind, GatherKind } from './types';

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
  prop('bush_fiber', 9, 2, true, 'fiber'),
  prop('bush_fiber', 1, 3, true, 'fiber'),
  prop('bush_fiber', 10, 3, true, 'fiber'),
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
  prop('bush_fiber', 4, 7, true, 'fiber'),
  prop('bush_fiber', 8, 7, true, 'fiber'),
  prop('berry_bush', 8, 2, true, 'berries'),
  prop('berry_bush', 3, 4, true, 'berries'),
  prop('berry_bush', 5, 6, true, 'berries'),
  prop('cattails', 3, 8, false, 'cattail'),
  prop('cattails', 9, 8, false, 'cattail'),
  prop('cattails', 5, 9, false, 'cattail'),
  prop('cattails', 7, 9, false, 'cattail'),
  prop('bark_cup', 6, 7, false, 'cup'),
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

  // Rock nodes on the creek stones. Five strikes with a hammerstone empty one.
  prop('rock_node', 1, 8, false),
  prop('rock_node', 10, 8, false),
  prop('rock_node', 2, 9, false),
  prop('rock_node', 9, 9, false),
  prop('rock_node', 4, 10, false),
  prop('rock_node', 7, 10, false),
  prop('rock_node', 8, 10, false),

  // Rounded river cobbles. The first one you pick up is the hammerstone.
  prop('river_cobbles', 2, 8, false, 'cobble'),
  prop('river_cobbles', 3, 9, false, 'cobble'),
  prop('river_cobbles', 6, 10, false, 'cobble'),

  // Rare flint nodules. Knap them in place with the hammerstone.
  prop('flint_core', 4, 9, false),
  prop('flint_core', 9, 7, false),
  prop('flint_core', 6, 8, false),

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

export function isBlocked(
  tx: number,
  ty: number,
  state: Pick<GameState, 'trees'> & { plants?: Record<string, number>; minutes?: number },
): boolean {
  if (!inBounds(tx, ty)) return true;
  if (groundAt(tx, ty) === 'creek_water') return true;
  const propHere = propAt(tx, ty);
  if (!propHere?.blocks) return false;
  if (isFelled(state.trees, propHere.id)) return false;
  if (
    (propHere.kind === 'bush_fiber' || propHere.kind === 'berry_bush') &&
    isFiberCut(state.plants ?? {}, propHere.id, state.minutes ?? 0)
  ) {
    return false;
  }
  return true;
}

export function blockedFor(state: Pick<GameState, 'trees'>): (tx: number, ty: number) => boolean {
  return (tx, ty) => isBlocked(tx, ty, state);
}
