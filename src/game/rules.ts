import { blocksStep, hasFoundation, WOOD_COST } from './build';
import {
  BUILD_ENERGY,
  CHOP_ENERGY,
  GATHER_ENERGY,
  PLAYER_START,
  START_ENERGY,
  START_MINUTES,
  START_WARMTH,
} from './constants';
import { OPENING_TIP } from './copy';
import { clamp, tileToWorld } from './iso';
import { inReach } from './move';
import { propAt, propById } from './map';
import { TREE_HITS, isFelled, regrowTrees, woodFromTree } from './trees';
import type { ActionResult, EdgeName, GameState, Inventory, PieceKind } from './types';

export function emptyInventory(): Inventory {
  return { wood: 0 };
}

export function initialState(): GameState {
  return {
    version: 3,
    minutes: START_MINUTES,
    warmth: START_WARMTH,
    energy: START_ENERGY,
    tx: PLAYER_START.tx,
    ty: PLAYER_START.ty,
    ...tileToWorld(PLAYER_START.tx, PLAYER_START.ty),
    facing: 'se',
    tool: 'hatchet',
    inventory: emptyInventory(),
    pieces: [],
    trees: {},
    picked: {},
    outcome: 'playing',
    tip: OPENING_TIP,
  };
}

export function ambientPerHour(minutes: number): number {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 16.5 && h < 18) return 2;
  if (h >= 18 && h < 19.5) return -6;
  if (h >= 19.5 && h < 22) return -16;
  if (h >= 22 || h < 5) return -34;
  if (h >= 5 && h < 6) return -14;
  return 0;
}

/** Warmth still drifts with the hour. It is only a reading now. */
export function warmthPerGameHour(state: GameState): number {
  return ambientPerHour(state.minutes);
}

export function tick(state: GameState, gameMinutes: number): GameState {
  if (gameMinutes <= 0) return state;
  let warmth = state.warmth;
  let minutes = state.minutes;
  let left = gameMinutes;
  while (left > 0.0001) {
    const step = Math.min(left, 0.5);
    warmth = clamp(warmth + ambientPerHour(minutes) * (step / 60), 0, 100);
    minutes += step;
    left -= step;
  }
  const trees = regrowTrees(state.trees, minutes, (id) => {
    const prop = propById(id);
    return Boolean(prop && hasFoundation(state.pieces, prop.tx, prop.ty));
  });
  return { ...state, warmth, minutes, trees, outcome: 'playing' };
}

export function gainEnergy(state: GameState, amount: number): GameState {
  if (amount <= 0) return state;
  return { ...state, energy: clamp(state.energy + amount, 0, 100) };
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message };
}

function ok(state: GameState, message: string, popup?: string): ActionResult {
  return { state: { ...state, tip: message }, ok: true, message, popup };
}

export function gather(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node?.gather) return fail(state, 'Nothing to pick up there.');
  if (state.picked[id]) return fail(state, 'Nothing left there.');
  if (!inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to it.');
  if (state.energy < GATHER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const picked = { ...state.picked, [id]: true as const };
  if (node.gather === 'sticks') {
    const wood = state.inventory.wood + 1;
    return ok(
      {
        ...state,
        inventory: { wood },
        energy: state.energy - GATHER_ENERGY,
        picked,
      },
      'A stick. Real timber comes from a tree.',
      '+1 Wood',
    );
  }
  return ok(
    { ...state, energy: state.energy - GATHER_ENERGY, picked },
    'Set that aside. The hatchet wants a trunk.',
  );
}

export function chopTree(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || (node.kind !== 'pine_tree' && node.kind !== 'birch_tree')) {
    return fail(state, 'That will not take a hatchet.');
  }
  if (state.tool !== 'hatchet') return fail(state, 'Put the hatchet in your hand.');
  if (isFelled(state.trees, id)) return fail(state, 'Only a stump left.');
  if (!inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to the trunk.');
  if (state.energy < CHOP_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const prev = state.trees[id]?.hits ?? 0;
  const hits = prev + 1;
  const energy = state.energy - CHOP_ENERGY;
  if (hits < TREE_HITS) {
    const left = TREE_HITS - hits;
    return ok(
      { ...state, energy, trees: { ...state.trees, [id]: { hits, felledAt: null } } },
      left === 1 ? 'The trunk cracks. One more swing.' : 'Chips fly. Keep swinging.',
    );
  }
  const gained = woodFromTree(id, state.minutes);
  const wood = state.inventory.wood + gained;
  return ok(
    {
      ...state,
      energy,
      inventory: { wood },
      trees: { ...state.trees, [id]: { hits, felledAt: state.minutes } },
    },
    'Down it comes. The stump can wait.',
    `+${gained} Wood`,
  );
}

export function placePiece(state: GameState, kind: PieceKind, tx: number, ty: number, edge: EdgeName): ActionResult {
  if (state.inventory.wood < WOOD_COST[kind]) {
    return fail(state, `Needs ${WOOD_COST[kind]} wood. You have ${state.inventory.wood}.`);
  }
  const piece = { kind, tx, ty, edge };
  return ok(
    {
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory: { wood: state.inventory.wood - WOOD_COST[kind] },
      pieces: [...state.pieces, piece],
    },
    'Up it goes.',
  );
}

export function wallInTheWay(state: GameState, from: { tx: number; ty: number }, to: { tx: number; ty: number }): boolean {
  return blocksStep(state.pieces, from, to);
}

export function treeAt(tx: number, ty: number): string | null {
  const prop = propAt(tx, ty);
  if (!prop) return null;
  if (prop.kind !== 'pine_tree' && prop.kind !== 'birch_tree') return null;
  return prop.id;
}
