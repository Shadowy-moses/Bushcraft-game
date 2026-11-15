import { blocksStep, hasFoundation, materialCost, materialShortMessage } from './build';
import {
  BARK_CORDAGE,
  BARK_WOOD,
  BOUGH_FIBER,
  BERRIES_PER_BUSH,
  BUILD_ENERGY,
  DIRE_HEALTH_PER_HOUR,
  EMBER_WARMTH_PER_HOUR,
  FIRE_WARMTH_PER_HOUR,
  HUNGER_PER_HOUR,
  NEED_DIRE,
  NEED_LOW,
  BARK_STRIPS,
  LOG_STRIPS,
  POT_BOILS,
  SICK_ENERGY_PER_HOUR,
  SICK_HEALTH_PER_HOUR,
  SICK_MINUTES,
  START_HEALTH,
  START_HUNGER,
  START_THIRST,
  THIRST_PER_HOUR,
  AXE_BITE,
  AXE_CORDAGE,
  AXE_WOOD,
  BOWL_WOOD,
  CHOP_ENERGY,
  GATHER_ENERGY,
  HATCHET_BITE,
  PLAY_MINUTES_PER_SECOND,
  PLAYER_START,
  REPAIR_HEALTH,
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
import { nearEmberFire, nearLitFire, placeFire, tendFires } from './fire';
import { OPENING_TIP } from './copy';
import { clamp, tileToWorld } from './iso';
import { CHOP_REACH, escapeEnclosure, inReach, reachFor } from './move';
import { propAt, propById } from './map';
import { CORE_KNAPS, flakesFromKnap, ROCK_HITS, stoneFromStrike } from './stone';
import { TREE_HITS, isFelled, regrowTrees, woodFromTree } from './trees';
import type { ActionResult, EdgeName, GameState, Inventory, Material, Piece, PieceKind } from './types';
import { regrowRocks, washCobbles } from './food';
import { decayPerHour, exposurePerHour, nextDamp, pieceHealth } from './weather';

export function emptyInventory(): Inventory {
  return {
    wood: 0,
    stone: 0,
    flakes: 0,
    rocks: 0,
    hammerstone: false,
    fiber: 0,
    cordage: 0,
    tinder: 0,
    kindling: 0,
    coal: 0,
    bowdrill: false,
    berries: 0,
    roots: 0,
    bark: 0,
    pot: 0,
    axe: false,
    bowl: false,
    wetCobble: 0,
  };
}

export function initialState(): GameState {
  return {
    version: 6,
    minutes: START_MINUTES,
    warmth: START_WARMTH,
    energy: START_ENERGY,
    health: START_HEALTH,
    hunger: START_HUNGER,
    thirst: START_THIRST,
    sick: 0,
    sickAt: 0,
    sips: 0,
    cupWater: 'empty',
    bowlWater: 'empty',
    hotStone: 'none',
    tx: PLAYER_START.tx,
    ty: PLAYER_START.ty,
    ...tileToWorld(PLAYER_START.tx, PLAYER_START.ty),
    facing: 'se',
    tool: 'hatchet',
    inventory: emptyInventory(),
    pieces: [],
    trees: {},
    rocks: {},
    rockGone: {},
    logStrips: {},
    cores: {},
    plants: {},
    picked: {},
    outcome: 'playing',
    tip: OPENING_TIP,
    damp: 0,
    potSeat: null,
  };
}

/** Game minutes that pass in this slice of real time. Held movement does not change it. */
export function minutesThisFrame(dtSeconds: number): number {
  return dtSeconds * PLAY_MINUTES_PER_SECOND;
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

/** The hour's drift, plus weather, wet clothes, and a fire when he is close. */
export function warmthPerGameHour(state: GameState): number {
  let rate = ambientPerHour(state.minutes) + exposurePerHour(state);
  if (nearLitFire(state)) rate += FIRE_WARMTH_PER_HOUR;
  else if (nearEmberFire(state)) rate += EMBER_WARMTH_PER_HOUR;
  return rate;
}

export function needRegen(state: GameState): number {
  const hungerLow = state.hunger < NEED_LOW;
  const thirstLow = state.thirst < NEED_LOW;
  if (hungerLow && thirstLow) return 0.45;
  if (hungerLow || thirstLow) return 0.7;
  return 1;
}

export function tick(state: GameState, gameMinutes: number): GameState {
  if (gameMinutes <= 0) return state;
  let warmth = state.warmth;
  let energy = state.energy;
  let health = state.health;
  let hunger = state.hunger;
  let thirst = state.thirst;
  let sick = state.sick ?? 0;
  let sickAt = state.sickAt ?? 0;
  let minutes = state.minutes;
  let turned = false;
  let left = gameMinutes;
  let cursor = state;
  while (left > 0.0001) {
    const step = Math.min(left, 0.5);
    cursor = { ...cursor, minutes, hunger, thirst };
    warmth = clamp(warmth + (ambientPerHour(minutes) + exposurePerHour(cursor)) * (step / 60), 0, 100);
    hunger = clamp(hunger - HUNGER_PER_HOUR * (step / 60), 0, 100);
    thirst = clamp(thirst - THIRST_PER_HOUR * (step / 60), 0, 100);
    const dire = (hunger < NEED_DIRE ? DIRE_HEALTH_PER_HOUR : 0) + (thirst < NEED_DIRE ? DIRE_HEALTH_PER_HOUR : 0);
    health = clamp(health - dire * (step / 60), 0, 100);
    if (sickAt > 0 && sick <= 0 && minutes + step >= sickAt) {
      sick = SICK_MINUTES;
      sickAt = 0;
      turned = true;
    }
    if (sick > 0) {
      const sickStep = Math.min(sick, step);
      energy = clamp(energy - SICK_ENERGY_PER_HOUR * (sickStep / 60), 0, 100);
      health = clamp(health - SICK_HEALTH_PER_HOUR * (sickStep / 60), 0, 100);
      sick -= sickStep;
    }
    minutes += step;
    left -= step;
  }
  const trees = regrowTrees(state.trees, minutes, (id) => {
    const prop = propById(id);
    return Boolean(prop && hasFoundation(state.pieces, prop.tx, prop.ty));
  });
  const plants = regrowFiber(state.plants, minutes);
  const rocksBack = regrowRocks(state.rocks, state.rockGone ?? {}, state.minutes, minutes);
  const picked = washCobbles(state.picked, state.minutes, minutes);
  const tended = tendFires(
    {
      ...state,
      warmth,
      energy,
      health,
      hunger,
      thirst,
      sick,
      sickAt,
      minutes,
      trees,
      plants,
      rocks: rocksBack.rocks,
      rockGone: rocksBack.gone,
      picked,
      tip: turned ? 'Your stomach turns.' : state.tip,
      outcome: 'playing',
    },
    gameMinutes,
  );
  const damp = nextDamp(tended, gameMinutes, nearLitFire(tended) || nearEmberFire(tended));
  return decayBuildings({ ...tended, damp }, gameMinutes);
}

export function decayBuildings(state: GameState, gameMinutes: number): GameState {
  if (gameMinutes <= 0) return state;
  let fell = false;
  const pieces: Piece[] = [];
  for (const piece of state.pieces) {
    const rate = decayPerHour(piece, state.minutes, state.pieces);
    if (rate <= 0) {
      pieces.push(piece);
      continue;
    }
    const health = pieceHealth(piece) - rate * (gameMinutes / 60);
    if (health <= 0) {
      fell = true;
      continue;
    }
    pieces.push({ ...piece, health });
  }
  if (!fell && pieces.every((piece, index) => piece === state.pieces[index])) return state;
  return { ...state, pieces, tip: fell ? 'A twig piece gave way.' : state.tip };
}

export function repairPiece(state: GameState, piece: Piece): ActionResult {
  if (piece.kind === 'tripod' || piece.kind === 'fire') return fail(state, 'That does not take a patch.');
  if ((piece.material ?? 'twig') === 'stone') return fail(state, 'Stone does not need a patch.');
  if (pieceHealth(piece) >= 100) return fail(state, 'It is sound.');
  if (state.inventory.wood < 1) return fail(state, 'Need 1 more wood.');
  const pieces = state.pieces.map((item) =>
    samePiece(item, piece) ? { ...item, health: Math.min(100, pieceHealth(item) + REPAIR_HEALTH) } : item,
  );
  return ok(
    { ...state, inventory: { ...state.inventory, wood: state.inventory.wood - 1 }, pieces },
    'Patched with a length of wood.',
  );
}

export function coverTripod(state: GameState, piece: Piece, cover: 'boughs' | 'bark'): ActionResult {
  if (piece.kind !== 'tripod') return fail(state, 'Lash a tripod first.');
  if (piece.cover === cover) return fail(state, 'That cover is already on it.');
  const replaced = piece.cover != null;
  if (cover === 'boughs') {
    if (state.inventory.fiber < BOUGH_FIBER) return fail(state, `Need ${BOUGH_FIBER - state.inventory.fiber} more fiber.`);
    return ok(
      {
        ...state,
        inventory: { ...state.inventory, fiber: state.inventory.fiber - BOUGH_FIBER },
        pieces: state.pieces.map((item) => (samePiece(item, piece) ? { ...item, cover } : item)),
      },
      replaced ? 'The new cover replaces the old one. Nothing comes back.' : 'Boughs across the frame. They leak a little.',
    );
  }
  if (state.inventory.wood < BARK_WOOD) return fail(state, `Need ${BARK_WOOD - state.inventory.wood} more wood.`);
  if (state.inventory.cordage < BARK_CORDAGE) {
    return fail(state, `Need ${BARK_CORDAGE - state.inventory.cordage} more cordage.`);
  }
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        wood: state.inventory.wood - BARK_WOOD,
        cordage: state.inventory.cordage - BARK_CORDAGE,
      },
      pieces: state.pieces.map((item) => (samePiece(item, piece) ? { ...item, cover } : item)),
    },
    replaced ? 'The new cover replaces the old one. Nothing comes back.' : 'Bark strips, lashed tight. The rain stays out.',
  );
}

export function nearestBareTripod(state: GameState): Piece | null {
  let best: Piece | null = null;
  let bestD = Infinity;
  for (const piece of state.pieces) {
    if (piece.kind !== 'tripod') continue;
    const at = tileToWorld(piece.tx, piece.ty);
    const d = Math.hypot(at.x - state.x, at.y - state.y);
    if (d < bestD) {
      best = piece;
      bestD = d;
    }
  }
  return best;
}

function samePiece(item: Piece, piece: Piece): boolean {
  return item.kind === piece.kind && item.tx === piece.tx && item.ty === piece.ty && item.edge === piece.edge;
}

/** Stamina coming back. A tripod under his shoulder adds a little. */
export function restEnergyPerSecond(state: GameState): number {
  const bonus = besideTripod(state) ? 1 + TRIPOD_REST_BONUS : 1;
  return REST_ENERGY_PER_SECOND * bonus * needRegen(state);
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
  if (node.gather !== 'fiber' && state.picked[id]) return fail(state, 'Nothing left there.');
  if (!free && !inReach(state.x, state.y, node.tx, node.ty, reachFor(node))) return fail(state, 'Walk up to it.');
  if (!free && state.energy < GATHER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  if (!free && state.tool !== 'hands') return fail(state, 'Empty your hands to pick that up.');
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
  if (node.gather === 'bark') {
    const have = state.logStrips[id] ?? 0;
    const take = Math.min(BARK_STRIPS, LOG_STRIPS - have);
    const taken = have + take;
    const done = taken >= LOG_STRIPS;
    return ok(
      {
        ...state,
        energy,
        inventory: { ...state.inventory, bark: state.inventory.bark + take },
        logStrips: { ...state.logStrips, [id]: taken },
        picked: done ? picked : state.picked,
      },
      done ? 'The last strips. The log is spent.' : 'Two strips of birch bark.',
      `+${take} Bark`,
    );
  }
  if (node.gather === 'berries' || node.gather === 'cattail') {
    if (isFiberCut(state.plants, id, state.minutes)) {
      return fail(state, node.gather === 'berries' ? 'The berries are gone. They will come back.' : 'The cattail is pulled. It will come back.');
    }
    const berries = node.gather === 'berries';
    const gained = berries ? BERRIES_PER_BUSH : 1;
    const fiber = berries ? 0 : fiberFromPlant(id);
    const inventory = berries
      ? { ...state.inventory, berries: state.inventory.berries + gained }
      : { ...state.inventory, roots: state.inventory.roots + gained, fiber: state.inventory.fiber + fiber };
    return ok(
      { ...state, energy, inventory, plants: { ...state.plants, [id]: state.minutes } },
      berries ? 'A handful of berries.' : 'A cattail root, and fiber from the stems.',
      berries ? `+${gained} berries` : '+1 root',
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
      if ((state.inventory.wetCobble ?? 0) >= 1) return { state, ok: false, message: '' };
      return ok(
        {
          ...state,
          inventory: { ...state.inventory, wetCobble: 1 },
          energy,
          picked,
        },
        'A wet creek cobble. It can heat water, but it may crack in a fire.',
      );
    }
    return ok(
      {
        ...state,
        inventory: { ...state.inventory, hammerstone: true },
        energy,
        picked,
      },
      'A hard, round cobble. Good hammerstone.',
    );
  }
  return ok(
    { ...state, energy, picked },
    'Set that aside.',
    node.gather === 'stones' ? 'Stone' : undefined,
  );
}

/** Two strips from a living birch. It stays peeled for a day. */
export function peelBirch(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || node.kind !== 'birch_tree') return fail(state, 'That is not a birch.');
  if (state.tool !== 'hands') return fail(state, 'Empty your hands to peel bark.');
  if (isFelled(state.trees, id)) return fail(state, 'Only a stump left.');
  if (!inReach(state.x, state.y, node.tx, node.ty)) return fail(state, 'Walk up to the birch.');
  if (state.energy < GATHER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  if (isFiberCut(state.plants, id, state.minutes)) return fail(state, 'This birch is peeled. The bark needs a day.');
  return ok(
    {
      ...state,
      energy: state.energy - GATHER_ENERGY,
      inventory: { ...state.inventory, bark: state.inventory.bark + BARK_STRIPS },
      plants: { ...state.plants, [id]: state.minutes },
    },
    'Two strips of birch bark.',
    `+${BARK_STRIPS} Bark`,
  );
}

/** One bark and one cord. Three boils, then the pot is gone. */
export function craftPot(state: GameState): ActionResult {
  if (state.inventory.pot > 0) return fail(state, 'You already have a bark pot.');
  if (state.inventory.bark < 1) return fail(state, 'Need 1 more bark.');
  if (state.inventory.cordage < 1) return fail(state, 'Need 1 more cordage.');
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        bark: state.inventory.bark - 1,
        cordage: state.inventory.cordage - 1,
        pot: POT_BOILS,
      },
    },
    'A bark pot. It will take three boils.',
  );
}

/** One cobble, two wood, one cord. The axe stays in the pack until he taps it. */
export function craftAxe(state: GameState): ActionResult {
  if (state.inventory.axe) return fail(state, 'You already have a stone axe.');
  if ((state.inventory.wetCobble ?? 0) < 1) return fail(state, 'Need 1 more cobble.');
  if (state.inventory.wood < AXE_WOOD) return fail(state, 'Need 2 more wood.');
  if (state.inventory.cordage < AXE_CORDAGE) return fail(state, 'Need 1 more cordage.');
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        wetCobble: state.inventory.wetCobble - 1,
        wood: state.inventory.wood - AXE_WOOD,
        cordage: state.inventory.cordage - AXE_CORDAGE,
        axe: true,
      },
    },
    'A hafted stone axe. The cobble is knapped and pecked into a thick wedge.',
  );
}

/** Burn and scrape: a lit fire, a flake that is not used up, and two wood. */
export function craftBowl(state: GameState): ActionResult {
  if (state.inventory.bowl) return fail(state, 'You already have a wood bowl.');
  if (state.inventory.wood < BOWL_WOOD) return fail(state, 'Need 2 more wood.');
  if (state.inventory.flakes < 1) return fail(state, 'A flint flake scrapes out the hollow.');
  if (!nearLitFire(state)) return fail(state, 'The bowl needs a lit fire nearby. A coal chars the hollow.');
  return ok(
    {
      ...state,
      inventory: { ...state.inventory, wood: state.inventory.wood - BOWL_WOOD, bowl: true },
    },
    'A wood bowl. The coal charred the hollow, and the flake scraped it clean.',
  );
}

export function chopTree(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || (node.kind !== 'pine_tree' && node.kind !== 'birch_tree')) {
    return fail(state, 'That will not take an axe.');
  }
  if (state.tool !== 'hatchet' && state.tool !== 'axe') return fail(state, 'Put a hatchet or a stone axe in your hand.');
  if (isFelled(state.trees, id)) return fail(state, 'Only a stump left.');
  if (!inReach(state.x, state.y, node.tx, node.ty, CHOP_REACH)) return fail(state, 'Walk up to the trunk.');
  if (state.energy < CHOP_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  const prev = state.trees[id]?.hits ?? 0;
  const bite = state.tool === 'axe' ? AXE_BITE : HATCHET_BITE;
  const hits = Math.round((prev + bite) * 10) / 10;
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
  if (kind === 'fire') return placeFire(state, tx, ty);
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
    freed({
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory,
      pieces: [...state.pieces, piece],
    }),
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
      rockGone: done ? { ...(state.rockGone ?? {}), [id]: state.minutes } : (state.rockGone ?? {}),
    },
    done ? 'Nothing left but rubble.' : 'The rock chips.',
    `+${gained} stone`,
  );
}

/** Knapping a flint core in place. Two strikes, two or three flakes, then it is spent. */
export function knapFlint(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node || node.kind !== 'flint_core') return fail(state, 'That is not a flint core.');
  if (!state.inventory.hammerstone) return fail(state, 'You need a hammerstone.');
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
  if (piece.kind === 'tripod' || piece.kind === 'fire') return fail(state, 'The lashing stays as it is.');
  if ((piece.material ?? 'twig') === 'stone') return fail(state, 'Already stone.');
  const cost = materialCost(piece.kind, 'stone');
  if (state.inventory.stone < cost) return fail(state, materialShortMessage(piece.kind, state.inventory.stone, 'stone'));
  const pieces = state.pieces.map((item) =>
    item.kind === piece.kind && item.tx === piece.tx && item.ty === piece.ty && item.edge === piece.edge
      ? { ...item, material: 'stone' as const }
      : item,
  );
  return ok(
    freed({
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory: { ...state.inventory, stone: state.inventory.stone - cost },
      pieces,
    }),
    'Upgraded to stone.',
  );
}

function freed(state: GameState): GameState {
  const spot = escapeEnclosure(state);
  if (spot.x === state.x && spot.y === state.y) return state;
  return { ...state, x: spot.x, y: spot.y };
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
