import { describe, expect, it } from 'vitest';
import { DAWN_MINUTES, FIRE_TILE, START_MINUTES } from '../src/game/constants';
import { PROPS, isBlocked } from '../src/game/map';
import { planRoute } from '../src/game/path';
import {
  applyAction,
  atCamp,
  canWaitForDawn,
  gainEnergy,
  gather,
  initialState,
  tick,
  warmthPerGameHour,
} from '../src/game/rules';
import type { GameState, Prop } from '../src/game/types';

function standBeside(state: GameState, prop: Prop): GameState {
  const plan = planRoute({ tx: state.tx, ty: state.ty }, prop.tx, prop.ty, state.shelter);
  if (!plan) throw new Error(`no path to ${prop.id}`);
  return { ...state, tx: plan.stand.tx, ty: plan.stand.ty, energy: 100 };
}

function playPerfect(): GameState {
  let state = initialState();
  for (const prop of PROPS) {
    if (!prop.gather) continue;
    if (prop.gather === 'tinder' && state.inventory.tinder >= 1) continue;
    state = standBeside(state, prop);
    const result = gather(state, prop.id);
    if (!result.ok) throw new Error(`${prop.id}: ${result.message}`);
    state = result.state;
    state = gainEnergy(state, 100);
  }
  state = { ...state, tx: FIRE_TILE.tx, ty: FIRE_TILE.ty, energy: 100 };
  for (const id of ['cordage-twist', 'cordage-wrap', 'shelter-1', 'shelter-2', 'shelter-3', 'shelter-4', 'fire-ring', 'fire-tinder', 'fire-kindling', 'lay-tipi', 'fire-light'] as const) {
    const result = applyAction(state, id);
    if (!result.ok) throw new Error(`${id}: ${result.message}`);
    state = gainEnergy(result.state, 100);
  }
  return state;
}

describe('the first night', () => {
  it('freezes you if you never build a camp', () => {
    const ended = tick(initialState(), DAWN_MINUTES - START_MINUTES);
    expect(ended.outcome).toBe('lost');
    expect(ended.warmth).toBe(0);
  });

  it('still loses with only a fire, or only a shelter', () => {
    const base = {
      ...initialState(),
      tx: FIRE_TILE.tx,
      ty: FIRE_TILE.ty,
      warmth: 100,
    };
    const fireOnly = tick(
      { ...base, fire: { ring: true, tinder: true, kindling: true, lay: 'tipi', lit: true } },
      DAWN_MINUTES - START_MINUTES,
    );
    const shelterOnly = tick({ ...base, shelter: 4 }, DAWN_MINUTES - START_MINUTES);
    expect(fireOnly.outcome).toBe('lost');
    expect(shelterOnly.outcome).toBe('lost');
  });

  it('keeps you warm until dawn when both are finished and you stay in camp', () => {
    const ready = {
      ...initialState(),
      tx: FIRE_TILE.tx,
      ty: FIRE_TILE.ty,
      warmth: 80,
      shelter: 4 as const,
      fire: { ring: true, tinder: true, kindling: true, lay: 'logcabin' as const, lit: true },
    };
    expect(warmthPerGameHour({ ...ready, minutes: 23 * 60 })).toBeGreaterThan(0);
    const ended = tick(ready, DAWN_MINUTES - START_MINUTES);
    expect(ended.outcome).toBe('won');
    expect(ended.warmth).toBeGreaterThan(70);
    expect(canWaitForDawn(ready)).toBe(true);
  });

  it('gets colder when you wander away from the fire at night', () => {
    const camp = {
      ...initialState(),
      minutes: 23 * 60,
      warmth: 80,
      tx: FIRE_TILE.tx,
      ty: FIRE_TILE.ty,
      shelter: 4 as const,
      fire: { ring: true, tinder: true, kindling: true, lay: 'tipi' as const, lit: true },
    };
    const away = { ...camp, tx: 1, ty: 8 };
    expect(atCamp(away.tx, away.ty)).toBe(false);
    const stayed = tick(camp, 30);
    const left = tick(away, 30);
    expect(left.warmth).toBeLessThan(stayed.warmth - 5);
  });

  it('can be finished with what the woods actually hold', () => {
    const done = playPerfect();
    expect(done.shelter).toBe(4);
    expect(done.fire.lit).toBe(true);
    expect(done.fire.lay).toBe('tipi');
    expect(done.inventory.sticks).toBeGreaterThanOrEqual(0);
    expect(isBlocked(done.tx, done.ty, done.shelter)).toBe(false);
    const ended = tick(done, DAWN_MINUTES - done.minutes);
    expect(ended.outcome).toBe('won');
  });

  it('refuses a square lashing with no cordage', () => {
    const state = { ...initialState(), tx: FIRE_TILE.tx, ty: FIRE_TILE.ty, shelter: 1 as const, inventory: { ...initialState().inventory, sticks: 9 } };
    const result = applyAction(state, 'shelter-2');
    expect(result.ok).toBe(false);
  });
});
