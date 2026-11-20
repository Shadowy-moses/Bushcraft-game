import { describe, expect, it } from 'vitest';
import { allowCraftTap } from '../src/game/craft';
import {
  BOUGH_FIBER,
  EMBER_MINUTES,
  EMBER_RAIN_MINUTES,
  FIRE_FUEL_PER_WOOD,
  FIRE_WARMTH_PER_HOUR,
  PLAY_MINUTES_PER_SECOND,
  START_MINUTES,
} from '../src/game/constants';
import { abandonDrill, addFirewood, DRILL_FIZZLE, stepDrill, tendFires } from '../src/game/fire';
import { tileToWorld } from '../src/game/iso';
import { RUN_SPEED, WALK_SPEED, stickDirection, travelSpeed } from '../src/game/move';
import { coverTripod, decayBuildings, initialState, minutesThisFrame, repairPiece, tick, warmthPerGameHour } from '../src/game/rules';
import { upgradePrompt } from '../src/game/use';
import { weatherAt, weatherWord } from '../src/game/weather';
import type { Piece } from '../src/game/types';

function fire(partial: Partial<Piece> = {}): Piece {
  return { kind: 'fire', tx: 8, ty: 4, edge: 'se', fuel: 30, lit: true, ...partial };
}

describe('round 8 weather, cover, wear, and coals', () => {
  it('names the day and lets rain and wind cool an open man', () => {
    expect(weatherAt(START_MINUTES)).toBe('clear');
    expect(weatherWord(weatherAt(21 * 60))).toBe('Rain');
    expect(weatherAt(23 * 60)).toBe('wind');
    const open = tick({ ...initialState(), minutes: 21 * 60, warmth: 80 }, 60);
    const roof = tick(
      {
        ...initialState(),
        minutes: 21 * 60,
        warmth: 80,
        pieces: [{ kind: 'floor', tx: 7, ty: 5, edge: 'se' }],
      },
      60,
    );
    expect(open.warmth).toBeLessThan(roof.warmth);
    expect(open.damp).toBeGreaterThan(0);
    expect(roof.damp).toBe(0);
  });

  it('lets boughs leak and bark keep the rain off', () => {
    const tripod: Piece = { kind: 'tripod', tx: 7, ty: 5, edge: 'se' };
    const bare = {
      ...initialState(),
      inventory: { ...initialState().inventory, fiber: BOUGH_FIBER, wood: 4, cordage: 2 },
      pieces: [tripod],
    };
    const boughs = coverTripod(bare, tripod, 'boughs');
    expect(boughs.ok).toBe(true);
    expect(boughs.message).toMatch(/leak/i);
    expect(boughs.state.inventory.fiber).toBe(0);
    const barked = coverTripod({ ...bare, pieces: [tripod] }, tripod, 'bark');
    expect(barked.ok).toBe(true);
    expect(barked.state.pieces[0].cover).toBe('bark');
    const wet = { ...initialState(), minutes: 21 * 60, warmth: 80 };
    const underBoughs = tick({ ...wet, pieces: [{ ...tripod, cover: 'boughs' }] }, 60);
    const underBark = tick({ ...wet, pieces: [{ ...tripod, cover: 'bark' }] }, 60);
    const open = tick(wet, 60);
    expect(underBark.warmth).toBeGreaterThan(underBoughs.warmth);
    expect(underBoughs.warmth).toBeGreaterThan(open.warmth);
    expect(underBark.damp).toBe(0);
    expect(underBoughs.damp).toBeGreaterThan(0);
    expect(open.damp).toBeGreaterThan(underBoughs.damp);
  });

  it('wears foundations faster than walls, and a length of wood repairs them', () => {
    const wall: Piece = { kind: 'wall', tx: 5, ty: 3, edge: 'se', material: 'twig', health: 100 };
    const foundation: Piece = { kind: 'foundation', tx: 5, ty: 3, edge: 'se', material: 'twig', health: 100 };
    const dryWall = decayBuildings({ ...initialState(), minutes: START_MINUTES, pieces: [wall] }, 60);
    const dryBed = decayBuildings({ ...initialState(), minutes: START_MINUTES, pieces: [foundation] }, 60);
    expect(dryWall.pieces[0].health).toBeCloseTo(98);
    expect(dryBed.pieces[0].health).toBeCloseTo(96);
    const wetBed = decayBuildings({ ...initialState(), minutes: 21 * 60, pieces: [{ ...foundation }] }, 60);
    expect(wetBed.pieces[0].health).toBeCloseTo(92);
    const stone = decayBuildings(
      { ...initialState(), minutes: 21 * 60, pieces: [{ ...foundation, material: 'stone' }] },
      60,
    );
    expect(stone.pieces[0].health ?? 100).toBe(100);
    const worn = { ...dryWall, inventory: { ...dryWall.inventory, wood: 1 }, pieces: [{ ...wall, health: 20 }] };
    const fixed = repairPiece(worn, worn.pieces[0]);
    expect(fixed.ok).toBe(true);
    expect(fixed.state.pieces[0].health).toBe(60);
    expect(fixed.state.inventory.wood).toBe(0);
    const gone = decayBuildings({ ...initialState(), pieces: [{ ...wall, health: 1 }] }, 60);
    expect(gone.pieces).toEqual([]);
    expect(gone.tip).toMatch(/gave way/);
  });

  it('leaves coals when the fuel is gone, and wood relights them', () => {
    const lay = fire({ fuel: 10 });
    const state = { ...initialState(), ...tileToWorld(8, 4), tx: 8, ty: 4, minutes: START_MINUTES, pieces: [lay] };
    const died = tendFires(state, 10);
    const coals = died.pieces[0];
    expect(coals.lit).toBe(false);
    expect(coals.coalsUntil).toBe(START_MINUTES + EMBER_MINUTES);
    const warm = tendFires({ ...died, warmth: 20 }, 30);
    expect(warm.warmth).toBeGreaterThan(20);
    const before = coals.fuel ?? 0;
    const relit = addFirewood({ ...died, inventory: { ...died.inventory, wood: 1 } }, coals);
    expect(relit.ok).toBe(true);
    expect(relit.message).toMatch(/embers catch/);
    expect(relit.state.pieces[0].lit).toBe(true);
    expect(relit.state.pieces[0].fuel).toBe(FIRE_FUEL_PER_WOOD);
    expect(relit.state.pieces[0].fuel).toBeGreaterThan(before);
    const rain = tendFires({ ...initialState(), minutes: 21 * 60, pieces: [fire({ fuel: 1 })] }, 1);
    expect(rain.pieces[0].coalsUntil).toBeCloseTo(21 * 60 + EMBER_RAIN_MINUTES);
    const cold = tendFires({ ...died, minutes: (coals.coalsUntil ?? 0) + 1 }, 1);
    expect(cold.pieces[0].coalsUntil).toBeUndefined();
    expect(addFirewood({ ...cold, inventory: { ...cold.inventory, wood: 1 } }, cold.pieces[0]).message).not.toMatch(/embers catch/);
  });

  it('burns an open fire faster in the rain, and not one beside a roof', () => {
    const open = tendFires({ ...initialState(), minutes: 21 * 60, pieces: [fire({ fuel: 60 })] }, 10);
    const sheltered = tendFires(
      {
        ...initialState(),
        minutes: 21 * 60,
        pieces: [fire({ fuel: 60 }), { kind: 'floor', tx: 8, ty: 5, edge: 'se' }],
      },
      10,
    );
    expect(open.pieces[0].fuel).toBeLessThan(sheltered.pieces[0].fuel ?? 0);
    expect(sheltered.pieces[0].fuel).toBeCloseTo(50);
  });

  it('fails an early drill release, and warmth rises beside the fire', () => {
    expect(stepDrill(0.4, 0.1, false, 50).result).toBe('fail');
    expect(stepDrill(0, 0.1, false, 50).result).toBe('going');
    expect(abandonDrill(0)).toBe(DRILL_FIZZLE);
    expect(abandonDrill(0.2)).toMatch(/fizzles/);
    expect(abandonDrill(1)).toBeNull();
    const feet = tileToWorld(8, 4);
    const near = {
      ...initialState(),
      ...feet,
      tx: 8,
      ty: 4,
      warmth: 10,
      minutes: START_MINUTES,
      pieces: [fire({ fuel: 120 })],
    };
    expect(warmthPerGameHour(near)).toBeGreaterThan(FIRE_WARMTH_PER_HOUR - 1);
    const later = tendFires(near, 30);
    expect(later.warmth).toBeGreaterThan(near.warmth);
    const fed = addFirewood({ ...later, inventory: { ...later.inventory, wood: 1 } }, later.pieces[0]);
    expect(fed.state.pieces[0].fuel).toBeCloseTo((later.pieces[0].fuel ?? 0) + FIRE_FUEL_PER_WOOD);
  });

  it('shows the upgrade line with the hammerstone in hand and when it is still in the pack', () => {
    const piece: Piece = { kind: 'wall', tx: 7, ty: 5, edge: 'se', material: 'twig' };
    const feet = tileToWorld(7, 5);
    const base = {
      ...initialState(),
      ...feet,
      tx: 7,
      ty: 5,
      inventory: { ...initialState().inventory, hammerstone: true, stone: 20 },
      pieces: [piece],
    };
    expect(upgradePrompt({ ...base, tool: 'hatchet' }, feet)).toMatch(/Equip the hammerstone/);
    expect(upgradePrompt({ ...base, tool: 'hammerstone' }, feet)).toMatch(/tap Use/);
  });

  it('keeps stick pace with the keys, and the clock at the working rate', () => {
    const held = stickDirection(0.4, 0);
    expect(Math.hypot(held.x, held.y)).toBeCloseTo(1);
    const creep = travelSpeed(0.2);
    expect(creep.running).toBe(false);
    expect(creep.speed).toBeGreaterThan(0);
    expect(creep.speed).toBeLessThan(WALK_SPEED);
    const mid = travelSpeed(0.4);
    expect(mid.running).toBe(false);
    expect(mid.speed).toBeGreaterThan(creep.speed);
    expect(mid.speed).toBeLessThan(RUN_SPEED);
    expect(travelSpeed(0.05).speed).toBe(0);
    expect(travelSpeed(0.6).speed).toBe(RUN_SPEED);
    expect(travelSpeed(1).speed).toBe(RUN_SPEED);
    expect(minutesThisFrame(1)).toBe(PLAY_MINUTES_PER_SECOND);
    expect(minutesThisFrame(5)).toBeCloseTo(2);
    expect(allowCraftTap(1000, 700, 1)).toBe(false);
    expect(allowCraftTap(1000, 500, 1)).toBe(true);
    expect(allowCraftTap(1000, 900, 3)).toBe(true);
  });
});
