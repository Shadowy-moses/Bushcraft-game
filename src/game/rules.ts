import {
  CORDAGE_ENERGY,
  DAWN_MINUTES,
  FIBER_CORD,
  FIRE_ENERGY,
  FIRE_WARMTH,
  GATHER_ENERGY,
  LEAVES_ROOF,
  LIGHT_ENERGY,
  SHELTER_ENERGY,
  SHELTER_WARMTH,
  START_ENERGY,
  START_MINUTES,
  START_WARMTH,
  PLAYER_START,
  STICKS_FUEL,
  STICKS_KINDLING,
  STICKS_RIBS,
  STICKS_RIDGE,
  STONES_RING,
} from './constants';
import { OPENING_TIP, gatherMessage } from './copy';
import { occupiedFrom, shelterFootprint } from './footprint';
import { chebyshev, clamp } from './iso';
import { isBlocked, propById } from './map';
import type { ActionId, ActionResult, GameState, Inventory, Tile } from './types';

export function emptyInventory(): Inventory {
  return { sticks: 0, stones: 0, fiber: 0, cordage: 0, tinder: 0, leaves: 0 };
}

export function initialState(): GameState {
  return {
    version: 2,
    minutes: START_MINUTES,
    warmth: START_WARMTH,
    energy: START_ENERGY,
    tx: PLAYER_START.tx,
    ty: PLAYER_START.ty,
    facing: 'se',
    inventory: emptyInventory(),
    shelter: 0,
    shelterAnchor: null,
    shelterFlip: false,
    fireTile: null,
    cordageTwisted: false,
    fire: { ring: false, tinder: false, kindling: false, lay: 'none', lit: false },
    picked: {},
    outcome: 'playing',
    tip: OPENING_TIP,
  };
}

function nearTiles(tx: number, ty: number, tiles: Tile[]): boolean {
  return tiles.some((tile) => chebyshev(tx, ty, tile.tx, tile.ty) <= 2);
}

/** Finished or unfinished, the lean-to warms and shelters the ground around it. */
export function nearShelter(state: GameState): boolean {
  if (state.shelter < 1 || !state.shelterAnchor) return false;
  return nearTiles(state.tx, state.ty, shelterFootprint(state.shelterAnchor, state.shelterFlip));
}

export function nearFire(state: GameState): boolean {
  if (!state.fire.ring || !state.fireTile) return false;
  return chebyshev(state.tx, state.ty, state.fireTile.tx, state.fireTile.ty) <= 2;
}

/** Close to the shelter or the fire, wherever they were placed. */
export function atCamp(state: GameState): boolean {
  return nearShelter(state) || nearFire(state);
}

function standingOn(state: GameState, tiles: Tile[]): boolean {
  return tiles.some((tile) => tile.tx === state.tx && tile.ty === state.ty);
}

/** True when this step can be done from where the woodsman is standing. */
export function atWorkSite(state: GameState, id: string): boolean {
  if (id === 'shelter-1') {
    if (!state.shelterAnchor) return false;
    return standingOn(state, shelterFootprint(state.shelterAnchor, state.shelterFlip));
  }
  if (id.startsWith('shelter')) return nearShelter(state);
  if (id === 'fire-ring') {
    return Boolean(state.fireTile && state.tx === state.fireTile.tx && state.ty === state.fireTile.ty);
  }
  if (id.startsWith('fire') || id.startsWith('lay')) return nearFire(state);
  return true;
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

export function warmthPerGameHour(state: GameState): number {
  let rate = ambientPerHour(state.minutes);
  if (state.shelter >= 4 && nearShelter(state)) rate += SHELTER_WARMTH;
  if (state.fire.lit && nearFire(state)) rate += FIRE_WARMTH;
  return rate;
}

export function tick(state: GameState, gameMinutes: number): GameState {
  if (state.outcome !== 'playing' || gameMinutes <= 0) return state;
  let warmth = state.warmth;
  let minutes = state.minutes;
  let left = gameMinutes;
  while (left > 0.0001) {
    const step = Math.min(left, 0.5);
    const rate = warmthPerGameHour({ ...state, minutes, warmth });
    warmth = clamp(warmth + rate * (step / 60), 0, 100);
    if (warmth <= 0) {
      return { ...state, warmth: 0, minutes, outcome: 'lost' };
    }
    minutes += step;
    left -= step;
    if (minutes >= DAWN_MINUTES) {
      return { ...state, warmth, minutes: DAWN_MINUTES, outcome: 'won' };
    }
  }
  return { ...state, warmth, minutes };
}

export function gainEnergy(state: GameState, amount: number): GameState {
  if (amount <= 0) return state;
  return { ...state, energy: clamp(state.energy + amount, 0, 100) };
}

export function canWaitForDawn(state: GameState): boolean {
  return state.outcome === 'playing' && state.shelter >= 4 && state.fire.lit && atCamp(state);
}

/** Later build steps happen beside the thing you already placed. */
export function actionNeedsCamp(id: string): boolean {
  if (id === 'shelter-1' || id === 'fire-ring') return false;
  return id.startsWith('shelter') || id.startsWith('fire') || id.startsWith('lay');
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message };
}

function ok(state: GameState, message: string): ActionResult {
  return { state: { ...state, tip: message }, ok: true, message };
}

function spend(state: GameState, cost: Partial<Inventory>, energy: number): GameState {
  const inventory = { ...state.inventory };
  for (const [key, value] of Object.entries(cost) as [keyof Inventory, number][]) {
    inventory[key] -= value;
  }
  return { ...state, inventory, energy: state.energy - energy };
}

function has(state: GameState, cost: Partial<Inventory>): boolean {
  for (const [key, value] of Object.entries(cost) as [keyof Inventory, number][]) {
    if (state.inventory[key] < value) return false;
  }
  return true;
}

function needMessage(state: GameState, cost: Partial<Inventory>): string {
  const parts = Object.entries(cost) as [keyof Inventory, number][];
  const missing = parts.find(([key, value]) => state.inventory[key] < value);
  if (!missing) return 'You have what that takes.';
  const [key, value] = missing;
  const names: Record<keyof Inventory, string> = {
    sticks: 'sticks',
    stones: 'stones',
    fiber: 'fiber',
    cordage: 'cordage',
    tinder: 'tinder',
    leaves: 'leaf litter',
  };
  return `Needs ${value} ${names[key]}. You have ${state.inventory[key]}.`;
}

function offTheFootprint(state: GameState): GameState {
  const blocked = (tx: number, ty: number) => isBlocked(tx, ty, occupiedFrom(state));
  if (!blocked(state.tx, state.ty)) return state;
  const dirs = [
    { tx: 1, ty: 0 },
    { tx: -1, ty: 0 },
    { tx: 0, ty: 1 },
    { tx: 0, ty: -1 },
    { tx: 1, ty: 1 },
    { tx: -1, ty: 1 },
    { tx: 1, ty: -1 },
    { tx: -1, ty: -1 },
  ];
  for (const d of dirs) {
    const tx = state.tx + d.tx;
    const ty = state.ty + d.ty;
    if (!blocked(tx, ty)) return { ...state, tx, ty };
  }
  return state;
}

export function gather(state: GameState, id: string): ActionResult {
  const node = propById(id);
  if (!node?.gather) return fail(state, 'Nothing to pick up there.');
  if (state.outcome !== 'playing') return fail(state, 'The night is over.');
  if (state.picked[id]) {
    if (node.gather === 'tinder') return fail(state, 'This birch is already peeled.');
    if (node.gather === 'fiber') return fail(state, 'This clump is picked clean.');
    return fail(state, 'Nothing left there.');
  }
  if (chebyshev(state.tx, state.ty, node.tx, node.ty) > 1) return fail(state, 'Walk up to it.');
  if (state.energy < GATHER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
  if (node.gather === 'tinder' && state.inventory.tinder >= 1) {
    return fail(state, 'You have enough tinder. Keep it dry.');
  }
  const inventory = { ...state.inventory, [node.gather]: state.inventory[node.gather] + node.amount };
  const first = inventory[node.gather] === node.amount;
  const next: GameState = {
    ...state,
    inventory,
    energy: state.energy - GATHER_ENERGY,
    picked: { ...state.picked, [id]: true },
  };
  return ok(next, gatherMessage(node.gather, inventory[node.gather], first));
}

export function applyAction(state: GameState, id: ActionId): ActionResult {
  if (state.outcome !== 'playing') return fail(state, 'The night is over.');
  if (!atWorkSite(state, id)) {
    if (id.startsWith('shelter')) return fail(state, 'Do that beside the lean-to.');
    return fail(state, 'Do that beside the fire.');
  }

  switch (id) {
    case 'cordage-twist': {
      if (state.cordageTwisted) return fail(state, 'The strands are already twisted. Wrap them.');
      if (state.inventory.cordage >= 1) return fail(state, 'You already have cordage.');
      if (!has(state, { fiber: FIBER_CORD })) return fail(state, needMessage(state, { fiber: FIBER_CORD }));
      if (state.energy < CORDAGE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      const twisted = spend(state, { fiber: FIBER_CORD }, CORDAGE_ENERGY);
      return ok({ ...twisted, cordageTwisted: true }, 'Strands twisted. Now wrap them the other way, so the cord locks.');
    }
    case 'cordage-wrap': {
      if (!state.cordageTwisted) return fail(state, 'Twist the strands first.');
      const wrapped: GameState = {
        ...state,
        cordageTwisted: false,
        inventory: { ...state.inventory, cordage: state.inventory.cordage + 1 },
      };
      return ok(wrapped, 'The cord holds. Twist one way, wrap the other. That is a reverse wrap.');
    }
    case 'shelter-1': {
      if (state.shelter !== 0) return fail(state, 'The ridge pole is already up.');
      if (!state.shelterAnchor) return fail(state, 'Choose a spot for the lean-to.');
      if (!has(state, { sticks: STICKS_RIDGE })) return fail(state, needMessage(state, { sticks: STICKS_RIDGE }));
      if (state.energy < SHELTER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        offTheFootprint({ ...spend(state, { sticks: STICKS_RIDGE }, SHELTER_ENERGY), shelter: 1 }),
        'Ridge pole is up. Lash it next, then the ribs and the leaves.',
      );
    }
    case 'shelter-2': {
      if (state.shelter < 1) return fail(state, 'Set the ridge pole first.');
      if (state.shelter !== 1) return fail(state, 'The ridge is already lashed.');
      if (!has(state, { cordage: 1 })) return fail(state, 'You need a length of cordage.');
      if (state.energy < SHELTER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...spend(state, { cordage: 1 }, SHELTER_ENERGY), shelter: 2 },
        'Square lashing is on. The wraps bite the joint so the ridge cannot roll.',
      );
    }
    case 'shelter-3': {
      if (state.shelter < 2) return fail(state, 'Lash the ridge before you lay the ribs.');
      if (state.shelter !== 2) return fail(state, 'The ribs are already on.');
      if (!has(state, { sticks: STICKS_RIBS })) return fail(state, needMessage(state, { sticks: STICKS_RIBS }));
      if (state.energy < SHELTER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...spend(state, { sticks: STICKS_RIBS }, SHELTER_ENERGY), shelter: 3 },
        'Ribs are leaned in. They still need a thick cover of leaves.',
      );
    }
    case 'shelter-4': {
      if (state.shelter < 3) return fail(state, 'The ribs have to be up before the leaves.');
      if (state.shelter !== 3) return fail(state, 'The lean-to is already covered.');
      if (!has(state, { leaves: LEAVES_ROOF })) return fail(state, needMessage(state, { leaves: LEAVES_ROOF }));
      if (state.energy < SHELTER_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...spend(state, { leaves: LEAVES_ROOF }, SHELTER_ENERGY), shelter: 4 },
        'The lean-to is thatched. Wind has to work to get in.',
      );
    }
    case 'fire-ring': {
      if (state.fire.ring) return fail(state, 'The stone ring is already there.');
      if (!state.fireTile) return fail(state, 'Choose a spot for the fire.');
      if (!has(state, { stones: STONES_RING })) return fail(state, needMessage(state, { stones: STONES_RING }));
      if (state.energy < FIRE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        offTheFootprint({
          ...spend(state, { stones: STONES_RING }, FIRE_ENERGY),
          fire: { ...state.fire, ring: true },
        }),
        'Stone ring is set. Dry stones, and a small fire.',
      );
    }
    case 'fire-tinder': {
      if (!state.fire.ring) return fail(state, 'Lay the stone ring first.');
      if (state.fire.tinder) return fail(state, 'Tinder is already in the ring.');
      if (!has(state, { tinder: 1 })) return fail(state, 'Peel a curl of birch bark first.');
      if (state.energy < FIRE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...spend(state, { tinder: 1 }, FIRE_ENERGY), fire: { ...state.fire, tinder: true } },
        'Tinder is in the middle, loose enough to breathe.',
      );
    }
    case 'fire-kindling': {
      if (!state.fire.tinder) return fail(state, 'Lay the tinder first.');
      if (state.fire.kindling) return fail(state, 'Kindling is already on.');
      if (!has(state, { sticks: STICKS_KINDLING })) return fail(state, needMessage(state, { sticks: STICKS_KINDLING }));
      if (state.energy < FIRE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...spend(state, { sticks: STICKS_KINDLING }, FIRE_ENERGY), fire: { ...state.fire, kindling: true } },
        'Kindling is on. Pencil-thin wood carries the flame up.',
      );
    }
    case 'lay-tipi':
    case 'lay-logcabin': {
      if (!state.fire.kindling) return fail(state, 'Add kindling before the fuel.');
      if (state.fire.lay !== 'none') return fail(state, 'The lay is already built.');
      if (!has(state, { sticks: STICKS_FUEL })) return fail(state, needMessage(state, { sticks: STICKS_FUEL }));
      if (state.energy < FIRE_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      const lay = id === 'lay-tipi' ? 'tipi' : 'logcabin';
      const message =
        lay === 'tipi'
          ? 'Tipi lay. Air can rise through the middle. Light it from the upwind side.'
          : 'Log cabin lay. Steadier if the breeze fidgets. Light the tinder in the middle.';
      return ok(
        { ...spend(state, { sticks: STICKS_FUEL }, FIRE_ENERGY), fire: { ...state.fire, lay } },
        message,
      );
    }
    case 'fire-light': {
      if (state.fire.lay === 'none') return fail(state, 'Choose a tipi or a log cabin first.');
      if (state.fire.lit) return fail(state, 'The fire is already going.');
      if (state.energy < LIGHT_ENERGY) return fail(state, 'You’re worn out. Rest a moment.');
      return ok(
        { ...state, energy: state.energy - LIGHT_ENERGY, fire: { ...state.fire, lit: true } },
        'Fire’s going. Stay close. It only warms this camp.',
      );
    }
    default:
      return fail(state, 'Not now.');
  }
}
