import { blocksStep, hasFoundation, materialCost, materialShortMessage } from './build';
import {
  BUILD_ENERGY,
  CHOP_ENERGY,
  GATHER_ENERGY,
  PLAYER_START,
  REST_ENERGY_PER_SECOND,
  START_ENERGY,
  START_MINUTES,
  START_WARMTH,
  STRIKE_ENERGY,
  TRIPOD_CORDAGE,
  TRIPOD_REST_BONUS,
  TRIPOD_REST_REACH,
  TRIPOD_WOOD,
} from './constants';
import { CORD_FIBER, fiberFromPlant, isFiberCut, regrowFiber } from './fiber';
import { OPENING_TIP } from './copy';
import { clamp, tileToWorld } from './iso';
import { inReach } from './move';
import { propAt, propById } from './map';
import { CORE_KNAPS, flakesFromKnap, ROCK_HITS, stoneFromStrike } from './stone';
import { TREE_HITS, isFelled, regrowTrees, woodFromTree } from './trees';
import type { ActionResult, EdgeName, GameState, Inventory, Material, Piece, PieceKind } from './types';

export function emptyInventory(): Inventory {
  return { wood: 0, stone: 0, flakes: 0, rocks: 0, hammerstone: false, fiber: 0, cordage: 0 };
}

export function initialState(): GameState {
  return {
    version: 5,
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
    rocks: {},
    cores: {},
    plants: {},
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
  const plants = regrowFiber(state.plants, minutes);
  return { ...state, warmth, minutes, trees, plants, outcome: 'playing' };
}

/** Stamina coming back. A tripod under his shoulder adds a little. */
export function restEnergyPerSecond(state: GameState): number {
  const bonus = besideTripod(state) ? 1 + TRIPOD_REST_BONUS : 1;
  return REST_ENERGY_PER_SECOND * bonus;
}

export function besideTripod(state: GameState): boolean {
  for (const piece of state.pieces) {
    if (piece.kind !== 'tripod') continue;
    const at = tileToWorld(piece.tx, piece.ty);
    if (Math.hypot(at.x - state.x, at.y - state.y) <= TRIPOD_REST_REACH) return true;
  }
  return false;
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

export function gather(state: GameState, id: string, free = false): ActionResult {
  const node = propById(id);
  if (!node?.gather) return fail(state, 'Nothing to pick up there.');
  if (state.picked[id]) return fail(state, 'Nothing left there.');
  if (!free && !inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to it.');
  if (!free && state.energy < GATHER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const picked = { ...state.picked, [id]: true as const };
  const energy = free ? state.energy : state.energy - GATHER_ENERGY;
  if (node.gather === 'sticks') {
    const wood = state.inventory.wood + 1;
    return ok(
      {
        ...state,
        inventory: { ...state.inventory, wood },
        energy,
        picked,
      },
      '+1 wood (stick). Trees give more.',
      '+1 Wood',
    );
  }
  if (node.gather === 'fiber') {
    if (isFiberCut(state.plants, id, state.minutes)) return fail(state, 'Only stubble. It will come back.');
    const gained = fiberFromPlant(id);
    return ok(
      {
        ...state,
        energy,
        inventory: { ...state.inventory, fiber: state.inventory.fiber + gained },
        plants: { ...state.plants, [id]: state.minutes },
      },
      'The stems give up their fiber.',
      `+${gained} fiber`,
    );
  }
  if (node.gather === 'cobble') {
    if (state.inventory.hammerstone) {
      return ok({ ...state, energy, picked }, 'You already carry a hammerstone.');
    }
    return ok(
      {
        ...state,
        tool: 'hammerstone',
        inventory: { ...state.inventory, hammerstone: true },
        energy,
        picked,
      },
      'A hard, round cobble. Good hammerstone.',
    );
  }
  return ok(
    { ...state, energy, picked },
    'Set that aside. The hatchet wants a trunk.',
    node.gather === 'stones' ? 'Stone' : undefined,
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
      inventory: { ...state.inventory, wood },
      trees: { ...state.trees, [id]: { hits, felledAt: state.minutes } },
    },
    'Down it comes. The stump can wait.',
    `+${gained} wood`,
  );
}

/** Spends the fiber. The cord itself arrives when the twist finishes. */
export function beginCordage(state: GameState): ActionResult {
  if (state.inventory.fiber < CORD_FIBER) {
    const short = CORD_FIBER - state.inventory.fiber;
    return fail(state, `Need ${short} more fiber.`);
  }
  return ok(
    {
      ...state,
      inventory: { ...state.inventory, fiber: state.inventory.fiber - CORD_FIBER },
    },
    'Reverse-wrapping the fibers…',
  );
}

export function finishCordage(state: GameState): GameState {
  return {
    ...state,
    inventory: { ...state.inventory, cordage: state.inventory.cordage + 1 },
    tip: 'You reverse-wrap the fibers into cord.',
  };
}

export function placePiece(
  state: GameState,
  kind: PieceKind,
  tx: number,
  ty: number,
  edge: EdgeName,
  material: Material = 'twig',
): ActionResult {
  if (kind === 'tripod') {
    if (state.inventory.wood < TRIPOD_WOOD) {
      return fail(state, `Need ${TRIPOD_WOOD - state.inventory.wood} more wood`);
    }
    if (state.inventory.cordage < TRIPOD_CORDAGE) {
      return fail(state, `Need ${TRIPOD_CORDAGE - state.inventory.cordage} more cordage`);
    }
    const piece: Piece = { kind, tx, ty, edge };
    return ok(
      {
        ...state,
        energy: Math.max(0, state.energy - BUILD_ENERGY),
        inventory: {
          ...state.inventory,
          wood: state.inventory.wood - TRIPOD_WOOD,
          cordage: state.inventory.cordage - TRIPOD_CORDAGE,
        },
        pieces: [...state.pieces, piece],
      },
      'Lashed tight. It will take some weight.',
    );
  }
  const cost = materialCost(kind, material);
  const have = material === 'stone' ? state.inventory.stone : state.inventory.wood;
  if (have < cost) return fail(state, materialShortMessage(kind, have, material));
  const piece: Piece = { kind, tx, ty, edge, material };
  const inventory =
    material === 'stone'
      ? { ...state.inventory, stone: state.inventory.stone - cost }
      : { ...state.inventory, wood: state.inventory.wood - cost };
  return ok(
    {
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory,
      pieces: [...state.pieces, piece],
    },
    'Up it goes.',
  );
}

export function strikeRock(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || node.kind !== 'rock_node') return fail(state, 'That is not a rock worth striking.');
  if (!state.inventory.hammerstone || state.tool !== 'hammerstone') {
    return fail(state, 'Put the hammerstone in your hand.');
  }
  const prev = state.rocks[id] ?? 0;
  if (prev >= ROCK_HITS) return fail(state, 'Nothing left but rubble.');
  if (!inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to the rock.');
  if (state.energy < STRIKE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const hits = prev + 1;
  const gained = stoneFromStrike(hits);
  const done = hits >= ROCK_HITS;
  return ok(
    {
      ...state,
      energy: state.energy - STRIKE_ENERGY,
      inventory: { ...state.inventory, stone: state.inventory.stone + gained },
      rocks: { ...state.rocks, [id]: hits },
    },
    done ? 'Nothing left but rubble.' : 'The rock chips.',
    `+${gained} stone`,
  );
}

/** Knapping a flint core in place. Two strikes, two or three flakes, then it is spent. */
export function knapFlint(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || node.kind !== 'flint_core') return fail(state, 'That is not a flint core.');
  if (!state.inventory.hammerstone || state.tool !== 'hammerstone') {
    return fail(state, 'Put the hammerstone in your hand.');
  }
  const prev = state.cores[id] ?? 0;
  if (prev >= CORE_KNAPS) return fail(state, 'The core is spent.');
  if (!inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to the core.');
  if (state.energy < STRIKE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const hits = prev + 1;
  const gained = flakesFromKnap(id, hits);
  const word = gained === 1 ? 'flake' : 'flakes';
  return ok(
    {
      ...state,
      energy: state.energy - STRIKE_ENERGY,
      inventory: { ...state.inventory, flakes: state.inventory.flakes + gained },
      cores: { ...state.cores, [id]: hits },
    },
    hits >= CORE_KNAPS ? 'The core is spent.' : 'Flakes spit off the core.',
    `+${gained} ${word}`,
  );
}

export function upgradePiece(state: GameState, piece: Piece): ActionResult {
  if (!state.inventory.hammerstone || state.tool !== 'hammerstone') {
    return fail(state, 'Put the hammerstone in your hand.');
  }
  if (piece.kind === 'tripod') return fail(state, 'The lashing stays as it is.');
  if ((piece.material ?? 'twig') === 'stone') return fail(state, 'Already stone.');
  const cost = materialCost(piece.kind, 'stone');
  if (state.inventory.stone < cost) return fail(state, materialShortMessage(piece.kind, state.inventory.stone, 'stone'));
  const pieces = state.pieces.map((item) =>
    item.kind === piece.kind && item.tx === piece.tx && item.ty === piece.ty && item.edge === piece.edge
      ? { ...item, material: 'stone' as const }
      : item,
  );
  return ok(
    {
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory: { ...state.inventory, stone: state.inventory.stone - cost },
      pieces,
    },
    'Upgraded to stone.',
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
