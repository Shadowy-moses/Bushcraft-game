import { WET_BURST_CHANCE } from './constants';
import { nearLitFire } from './fire';
import type { GameState } from './types';

/** Real seconds a stone sits in the flames before it is hot enough. */
export const HEAT_SECONDS = 3;
/** Real seconds the bowl shows boiling after the stone goes in. */
export const STONE_BOIL_SECONDS = 2;

export interface HeatResult {
  state: GameState;
  ok: boolean;
  message: string;
  /** The wet cobble shattered. Show the cracked frame and do not heat it. */
  burst: boolean;
  /** Which stone left the pack, so leaving the fire can give it back. */
  spent: 'dry' | 'wet' | null;
}

/** A dry stone is safe. A wet creek cobble bursts about one time in four. */
export function heatStone(state: GameState, random: () => number = Math.random): HeatResult {
  if (!nearLitFire(state)) {
    return { state, ok: false, message: 'The fire is out.', burst: false, spent: null };
  }
  if (state.hotStone === 'hot') {
    return { state, ok: false, message: 'A stone is already hot.', burst: false, spent: null };
  }
  const dry = state.inventory.stone > 0;
  const wet = (state.inventory.wetCobble ?? 0) > 0;
  if (!dry && !wet) {
    return { state, ok: false, message: 'You need a stone to heat.', burst: false, spent: null };
  }
  if (!dry && wet && random() < WET_BURST_CHANCE) {
    const next = {
      ...state,
      inventory: { ...state.inventory, wetCobble: state.inventory.wetCobble - 1 },
      tip: 'The wet cobble cracks in the fire.',
    };
    return { state: next, ok: true, message: next.tip, burst: true, spent: null };
  }
  const spent: 'dry' | 'wet' = dry ? 'dry' : 'wet';
  const inventory =
    spent === 'dry'
      ? { ...state.inventory, stone: state.inventory.stone - 1 }
      : { ...state.inventory, wetCobble: state.inventory.wetCobble - 1 };
  const tip = spent === 'dry' ? 'A dry stone heats in the fire.' : 'The cobble hisses, but it holds.';
  return { state: { ...state, inventory, tip }, ok: true, message: tip, burst: false, spent };
}

export function refundStone(state: GameState, spent: 'dry' | 'wet'): GameState {
  const inventory =
    spent === 'dry'
      ? { ...state.inventory, stone: state.inventory.stone + 1 }
      : { ...state.inventory, wetCobble: (state.inventory.wetCobble ?? 0) + 1 };
  return { ...state, inventory, tip: 'The stone comes off the fire.' };
}

export function markStoneHot(state: GameState): GameState {
  return { ...state, hotStone: 'hot', tip: 'The stone is hot. Drop it in the bowl.' };
}

/** The hot stone goes into raw bowl water. The bowl stays. The stone comes back dry. */
export function dropHotStone(state: GameState): { state: GameState; ok: boolean; message: string } {
  if (state.hotStone !== 'hot') return { state, ok: false, message: 'The stone is not hot yet.' };
  if (!state.inventory.bowl || state.bowlWater !== 'raw') {
    return { state, ok: false, message: 'The bowl needs creek water.' };
  }
  const tip = 'The hot stone goes in the bowl. It has boiled. Safe to drink.';
  return {
    ok: true,
    message: tip,
    state: {
      ...state,
      hotStone: 'none',
      bowlWater: 'boiled',
      inventory: { ...state.inventory, stone: state.inventory.stone + 1 },
      tip,
    },
  };
}
