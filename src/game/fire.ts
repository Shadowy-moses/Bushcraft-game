import {
  BOWDRILL_CORD,
  BOWDRILL_WOOD,
  BUILD_ENERGY,
  DRILL_SECONDS,
  DRILL_STAMINA_PER_SECOND,
  EMBER_MINUTES,
  EMBER_RAIN_MINUTES,
  EMBER_WARMTH_PER_HOUR,
  FIRE_FUEL_PER_WOOD,
  FIRE_KINDLING,
  FIRE_RADIUS,
  FIRE_TINDER,
  FIRE_WARMTH_PER_HOUR,
  FIRE_WOOD,
  RAIN_BURN_MULT,
  BOUGH_BURN_MULT,
  KINDLING_OUT,
  KINDLING_WOOD,
  TINDER_FIBER,
} from './constants';
import { clamp, tileToWorld } from './iso';
import type { ActionResult, GameState, Piece } from './types';
import { fireLeak, isEmbers, weatherAt } from './weather';

export function emptyFirePack(): Pick<GameState['inventory'], 'tinder' | 'kindling' | 'coal' | 'bowdrill'> {
  return { tinder: 0, kindling: 0, coal: 0, bowdrill: false };
}

export function craftTinder(state: GameState): ActionResult {
  if (state.inventory.fiber < TINDER_FIBER) {
    return fail(state, `Need ${TINDER_FIBER - state.inventory.fiber} more fiber.`);
  }
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        fiber: state.inventory.fiber - TINDER_FIBER,
        tinder: state.inventory.tinder + 1,
      },
    },
    'Dry grass and bark, worked into a tinder bundle.',
  );
}

export function craftKindling(state: GameState): ActionResult {
  if (state.inventory.wood < KINDLING_WOOD) return fail(state, 'Need 1 more wood.');
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        wood: state.inventory.wood - KINDLING_WOOD,
        kindling: state.inventory.kindling + KINDLING_OUT,
      },
    },
    'Split into small sticks.',
  );
}

export function craftBowdrill(state: GameState): ActionResult {
  if (state.inventory.bowdrill) return fail(state, 'You already carry a bow drill.');
  if (state.inventory.wood < BOWDRILL_WOOD) {
    return fail(state, `Need ${BOWDRILL_WOOD - state.inventory.wood} more wood.`);
  }
  if (state.inventory.cordage < BOWDRILL_CORD) return fail(state, 'Need 1 more cordage.');
  return ok(
    {
      ...state,
      inventory: {
        ...state.inventory,
        wood: state.inventory.wood - BOWDRILL_WOOD,
        cordage: state.inventory.cordage - BOWDRILL_CORD,
        bowdrill: true,
      },
    },
    '4 wood (dry, from dead branches), strung with cord.',
  );
}

export function canAffordFire(state: GameState): boolean {
  return (
    state.inventory.tinder >= FIRE_TINDER &&
    state.inventory.kindling >= FIRE_KINDLING &&
    state.inventory.wood >= FIRE_WOOD
  );
}

export function fireShort(state: GameState): string {
  if (state.inventory.tinder < FIRE_TINDER) return 'Need 1 more tinder';
  if (state.inventory.kindling < FIRE_KINDLING) {
    return `Need ${FIRE_KINDLING - state.inventory.kindling} more kindling`;
  }
  return `Need ${Math.max(0, FIRE_WOOD - state.inventory.wood)} more wood`;
}

export function placeFire(state: GameState, tx: number, ty: number): ActionResult {
  if (!canAffordFire(state)) return fail(state, fireShort(state));
  const piece: Piece = {
    kind: 'fire',
    tx,
    ty,
    edge: 'se',
    fuel: FIRE_WOOD * FIRE_FUEL_PER_WOOD,
    lit: false,
    ember: 'none',
  };
  return ok(
    {
      ...state,
      energy: Math.max(0, state.energy - BUILD_ENERGY),
      inventory: {
        ...state.inventory,
        tinder: state.inventory.tinder - FIRE_TINDER,
        kindling: state.inventory.kindling - FIRE_KINDLING,
        wood: state.inventory.wood - FIRE_WOOD,
      },
      pieces: [...state.pieces, piece],
    },
    'Teepee laid. Tinder in the heart, kindling around it, fuel wood outside.',
  );
}

export function nearestFire(state: GameState, feet: { x: number; y: number }, reach = 36): Piece | null {
  let best: Piece | null = null;
  let bestD = reach;
  for (const piece of state.pieces) {
    if (piece.kind !== 'fire') continue;
    const at = tileToWorld(piece.tx, piece.ty);
    const d = Math.hypot(at.x - feet.x, at.y - feet.y);
    if (d > bestD) continue;
    best = piece;
    bestD = d;
  }
  return best;
}

export function nearLitFire(state: GameState): boolean {
  for (const piece of state.pieces) {
    if (piece.kind !== 'fire' || !piece.lit) continue;
    const at = tileToWorld(piece.tx, piece.ty);
    if (Math.hypot(at.x - state.x, at.y - state.y) <= FIRE_RADIUS) return true;
  }
  return false;
}

export function nearEmberFire(state: GameState): boolean {
  for (const piece of state.pieces) {
    if (!isEmbers(piece, state.minutes)) continue;
    const at = tileToWorld(piece.tx, piece.ty);
    if (Math.hypot(at.x - state.x, at.y - state.y) <= FIRE_RADIUS) return true;
  }
  return false;
}

function burnMult(pieces: Piece[], fire: Piece, minutes: number): number {
  if (weatherAt(minutes) !== 'rain') return 1;
  const leak = fireLeak(pieces, fire);
  if (leak <= 0) return 1;
  if (leak < 1) return BOUGH_BURN_MULT;
  return RAIN_BURN_MULT;
}

function emberWindow(pieces: Piece[], fire: Piece, minutes: number): number {
  if (weatherAt(minutes) !== 'rain') return EMBER_MINUTES;
  const leak = fireLeak(pieces, fire);
  return EMBER_RAIN_MINUTES + (EMBER_MINUTES - EMBER_RAIN_MINUTES) * (1 - leak);
}

/** Warmth from a lit teepee or its coals. Fuel burns down, faster in open rain. */
export function tendFires(state: GameState, gameMinutes: number): GameState {
  if (gameMinutes <= 0) return state;
  let warmth = state.warmth;
  if (nearLitFire(state)) warmth = clamp(warmth + FIRE_WARMTH_PER_HOUR * (gameMinutes / 60), 0, 100);
  else if (nearEmberFire(state)) warmth = clamp(warmth + EMBER_WARMTH_PER_HOUR * (gameMinutes / 60), 0, 100);
  let changed = false;
  const pieces = state.pieces.map((piece) => {
    if (piece.kind !== 'fire') return piece;
    if (piece.lit) {
      changed = true;
      const fuel = (piece.fuel ?? 0) - gameMinutes * burnMult(state.pieces, piece, state.minutes);
      if (fuel <= 0) {
        return {
          ...piece,
          lit: false,
          fuel: 0,
          ember: 'none' as const,
          coalsUntil: state.minutes + emberWindow(state.pieces, piece, state.minutes),
        };
      }
      return { ...piece, fuel };
    }
    if (piece.coalsUntil != null && state.minutes >= piece.coalsUntil) {
      changed = true;
      const cold = { ...piece };
      delete cold.coalsUntil;
      return cold;
    }
    return piece;
  });
  if (!changed && warmth === state.warmth) return state;
  return { ...state, warmth, pieces };
}

export function addFirewood(state: GameState, piece: Piece): ActionResult {
  if (piece.kind !== 'fire') return fail(state, 'That is not a fire lay.');
  if (state.inventory.wood < 1) return fail(state, 'Need 1 more wood.');
  const hot = isEmbers(piece, state.minutes);
  const pieces = state.pieces.map((item) => {
    if (!(item === piece || (item.kind === 'fire' && item.tx === piece.tx && item.ty === piece.ty))) return item;
    if (hot) {
      const next = { ...item, lit: true, fuel: FIRE_FUEL_PER_WOOD, ember: 'none' as const };
      delete next.coalsUntil;
      return next;
    }
    return { ...item, fuel: (item.fuel ?? 0) + FIRE_FUEL_PER_WOOD };
  });
  return ok(
    { ...state, inventory: { ...state.inventory, wood: state.inventory.wood - 1 }, pieces },
    hot ? 'The embers catch the wood.' : 'Another length on the teepee.',
  );
}

export interface DrillStep {
  progress: number;
  energy: number;
  result: 'going' | 'fail' | 'coal';
}

/** Shown when a bow-drill hold ends before the coal forms. */
export const DRILL_FIZZLE = 'Too soon. The coal fizzles.';

/** A short hold, even one that never reached a frame, fails out loud. */
export function abandonDrill(progress: number): string | null {
  if (progress >= 1) return null;
  return DRILL_FIZZLE;
}

/** Holding the bow. Letting go early fails the coal. A full hold makes one. */
export function stepDrill(progress: number, dt: number, holding: boolean, energy: number): DrillStep {
  if (!holding) {
    if (progress <= 0) return { progress: 0, energy, result: 'going' };
    return { progress: 0, energy, result: 'fail' };
  }
  if (energy <= 0) return { progress, energy: 0, result: 'fail' };
  const next = progress + dt / DRILL_SECONDS;
  const spent = Math.min(energy, DRILL_STAMINA_PER_SECOND * dt);
  if (next >= 1) return { progress: 1, energy: energy - spent, result: 'coal' };
  return { progress: next, energy: energy - spent, result: 'going' };
}

export function giveCoal(state: GameState): GameState {
  return {
    ...state,
    inventory: { ...state.inventory, coal: state.inventory.coal + 1 },
    tip: 'A coal glows in the notch.',
  };
}

/** First tap smokes the bundle. Second tap catches, and the teepee lights if it has fuel. */
export function blowCoal(state: GameState, piece: Piece): ActionResult {
  if (piece.kind !== 'fire') return fail(state, 'That is not a fire lay.');
  if (state.inventory.coal < 1 && piece.ember !== 'smoke') return fail(state, 'No coal to tip in.');
  if ((piece.fuel ?? 0) <= 0) return fail(state, 'The lay needs fuel wood.');
  if (piece.lit) return fail(state, 'It is already burning.');
  if (piece.ember !== 'smoke') {
    const pieces = state.pieces.map((item) =>
      item.kind === 'fire' && item.tx === piece.tx && item.ty === piece.ty ? { ...item, ember: 'smoke' as const } : item,
    );
    return ok(
      { ...state, inventory: { ...state.inventory, coal: Math.max(0, state.inventory.coal - 1) }, pieces },
      'The bundle smokes. Blow again.',
    );
  }
  const pieces = state.pieces.map((item) =>
    item.kind === 'fire' && item.tx === piece.tx && item.ty === piece.ty
      ? { ...item, ember: 'none' as const, lit: true }
      : item,
  );
  return ok({ ...state, pieces }, 'It catches. The teepee takes the flame.');
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message };
}

function ok(state: GameState, message: string): ActionResult {
  return { state: { ...state, tip: message }, ok: true, message };
}
