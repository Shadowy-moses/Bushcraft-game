import {
  BERRIES_PER_BUSH,
  BERRY_HUNGER,
  BOILED_THIRST,
  RAW_THIRST,
  ROCK_RETURN_MINUTES,
  ROOT_HUNGER,
  SICK_MINUTES,
} from './constants';
import { isFiberCut } from './fiber';
import { tileToWorld, worldToTile } from './iso';
import { groundAt, PROPS } from './map';
import { REACH } from './move';
import { ROCK_HITS } from './stone';
import type { CupWater, GameState } from './types';
import { weatherAt } from './weather';
import { nearLitFire } from './fire';

export function plantFrame(kind: string, plants: Record<string, number>, id: string, minutes: number): string | null {
  const resting = isFiberCut(plants, id, minutes);
  if (kind === 'berry_bush') return resting ? 'berry_bush_picked' : 'berry_bush_ripe';
  if (kind === 'cattails') return resting ? 'cattails_1' : 'cattails_0';
  if (kind === 'bark_cup') return 'item_bark_cup';
  return null;
}

export function besideCreek(x: number, y: number): boolean {
  const here = worldToTile(x, y);
  for (let ty = here.ty - 2; ty <= here.ty + 2; ty++) {
    for (let tx = here.tx - 2; tx <= here.tx + 2; tx++) {
      if (groundAt(tx, ty) !== 'creek_water') continue;
      const at = tileToWorld(tx, ty);
      if (Math.hypot(at.x - x, at.y - y) <= REACH + 20) return true;
    }
  }
  return false;
}

export function scoopCreek(state: GameState): { state: GameState; ok: boolean; message: string } {
  if (!state.inventory.cup) return { state, ok: false, message: 'You need a cup for that.' };
  if (state.cupWater !== 'empty') return { state, ok: false, message: 'The cup is already full.' };
  if (!besideCreek(state.x, state.y)) return { state, ok: false, message: 'Walk to the creek.' };
  return {
    ok: true,
    message: 'Creek water in the cup. Boil it before you drink.',
    state: { ...state, cupWater: 'raw', tip: 'Creek water in the cup. Boil it before you drink.' },
  };
}

export function canBoil(state: GameState): boolean {
  return state.inventory.cup && state.cupWater === 'raw' && nearLitFire(state);
}

export function finishBoil(state: GameState): GameState {
  if (state.cupWater !== 'raw') return state;
  return { ...state, cupWater: 'boiled', tip: 'It has boiled. Safe to drink.' };
}

export function drinkCup(state: GameState): { state: GameState; ok: boolean; message: string } {
  if (!state.inventory.cup || state.cupWater === 'empty') return { state, ok: false, message: 'The cup is empty.' };
  if (state.cupWater === 'boiled') {
    return {
      ok: true,
      message: 'Cool enough. The thirst eases.',
      state: {
        ...state,
        cupWater: 'empty',
        thirst: clampNeed(state.thirst + BOILED_THIRST),
        tip: 'Cool enough. The thirst eases.',
      },
    };
  }
  return {
    ok: true,
    message: 'You drink it raw. Your stomach turns.',
    state: {
      ...state,
      cupWater: 'empty',
      thirst: clampNeed(state.thirst + RAW_THIRST),
      sick: Math.max(state.sick, SICK_MINUTES),
      tip: 'You drink it raw. Your stomach turns.',
    },
  };
}

export function eat(state: GameState, which: 'berries' | 'roots'): { state: GameState; ok: boolean; message: string } {
  if (which === 'berries') {
    if (state.inventory.berries < 1) return { state, ok: false, message: 'No berries left.' };
    return {
      ok: true,
      message: 'Sweet, and gone in a bite.',
      state: {
        ...state,
        hunger: clampNeed(state.hunger + BERRY_HUNGER),
        inventory: { ...state.inventory, berries: state.inventory.berries - 1 },
        tip: 'Sweet, and gone in a bite.',
      },
    };
  }
  if (state.inventory.roots < 1) return { state, ok: false, message: 'No roots left.' };
  return {
    ok: true,
    message: 'A starchy cattail root.',
    state: {
      ...state,
      hunger: clampNeed(state.hunger + ROOT_HUNGER),
      inventory: { ...state.inventory, roots: state.inventory.roots - 1 },
      tip: 'A starchy cattail root.',
    },
  };
}

export function berryYield(): number {
  return BERRIES_PER_BUSH;
}

function clampNeed(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** One rubble node comes back every ROCK_RETURN_MINUTES. The oldest goes first. */
export function regrowRocks(
  rocks: Record<string, number>,
  gone: Record<string, number>,
  from: number,
  to: number,
): { rocks: Record<string, number>; gone: Record<string, number> } {
  const depleted = Object.keys(rocks).filter((id) => (rocks[id] ?? 0) >= ROCK_HITS);
  if (depleted.length === 0) return { rocks, gone };
  const known = { ...gone };
  for (const id of depleted) if (known[id] == null) known[id] = from;
  const order = depleted.slice().sort((a, b) => known[a] - known[b] || (a < b ? -1 : 1));
  const nextRocks = { ...rocks };
  let gate = from;
  let changed = false;
  for (const id of order) {
    const back = Math.max(known[id] + ROCK_RETURN_MINUTES, gate === from ? known[id] + ROCK_RETURN_MINUTES : gate + ROCK_RETURN_MINUTES);
    if (back > to) break;
    nextRocks[id] = 0;
    delete known[id];
    gate = back;
    changed = true;
  }
  if (!changed && sameGone(gone, known)) return { rocks, gone };
  return { rocks: changed ? nextRocks : rocks, gone: known };
}

function sameGone(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/** When the evening rain ends, one gathered cobble is back on the bank. */
export function washCobbles(picked: Record<string, true>, from: number, to: number): Record<string, true> {
  const ends = rainEndsBetween(from, to);
  if (ends <= 0) return picked;
  const ids = PROPS.filter((prop) => prop.kind === 'river_cobbles' && picked[prop.id]).map((prop) => prop.id);
  if (ids.length === 0) return picked;
  const next = { ...picked };
  for (let i = 0; i < ends && i < ids.length; i++) delete next[ids[i]];
  return next;
}

export function rainEndsBetween(from: number, to: number): number {
  if (to <= from) return 0;
  let count = 0;
  const firstDay = Math.floor(from / 1440);
  const lastDay = Math.floor(to / 1440);
  for (let day = firstDay; day <= lastDay; day++) {
    const end = day * 1440 + 23 * 60;
    if (end > from && end <= to && weatherAt(end - 1) === 'rain' && weatherAt(end) !== 'rain') count += 1;
  }
  return count;
}

export function cupFrame(water: CupWater, hasCup: boolean): string {
  if (!hasCup || water === 'empty') return 'item_bark_cup';
  return 'item_bark_cup_water';
}
