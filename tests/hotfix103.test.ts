import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/types';
import { pieceFrame } from '../src/game/build';
import { packTap, recipesFor, shownHave } from '../src/game/craft';
import { PLAY_MINUTES_PER_SECOND } from '../src/game/constants';
import { giveCoal, stepDrill } from '../src/game/fire';
import { tileToWorld } from '../src/game/iso';
import { buildModel } from '../src/game/model';
import { MESSAGE_LINES, MESSAGE_SLOT } from '../src/ui/message';
import { RUN_SPEED, travelSpeed } from '../src/game/move';
import { debugInventory, emptyInventory, initialState, stepPlayClock, tick, wearNearby } from '../src/game/rules';
import { heatStone } from '../src/game/stoneboil';
import { rankedActions } from '../src/game/use';

describe('hotfix 10.3', () => {
  it('keeps the bow drill moving across an hour with no debug skip', () => {
    let state: GameState = {
      ...initialState(),
      minutes: 59.8,
      energy: 100,
      inventory: { ...emptyInventory(), bowdrill: true },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 5, edge: 'se' as const, lit: false, fuel: 0 }],
    };
    let bank = 0;
    let progress = 0;
    let crossedWhileHolding = false;
    const dt = 1 / 60;
    for (let frame = 0; frame < 60 * 8 && progress < 1; frame++) {
      const before = state.minutes;
      const step = stepDrill(progress, dt, true, state.energy);
      progress = step.progress;
      state = { ...state, energy: step.energy };
      const clock = stepPlayClock(state, bank, dt, false);
      state = clock.state;
      bank = clock.bank;
      if (before < 60 && state.minutes >= 60 && progress < 1) crossedWhileHolding = true;
    }
    expect(crossedWhileHolding).toBe(true);
    expect(state.minutes).toBeGreaterThanOrEqual(60);
    expect(progress).toBeGreaterThanOrEqual(1);
    expect(giveCoal(state).inventory.coal).toBe(1);
    expect(stepDrill(0.2, Number.NaN, true, 40).progress).toBe(0.2);
    expect(tick(state, Number.POSITIVE_INFINITY)).toBe(state);
  });

  it('still advances after a debug hour skip, on the same clock the hold uses', () => {
    const cold = {
      ...initialState(),
      minutes: 23 * 60 + 39,
      inventory: { ...emptyInventory(), bowdrill: true },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 5, edge: 'se' as const, lit: false, fuel: 0 }],
    };
    const skipped = tick(cold, 60);
    expect(skipped.minutes).toBeCloseTo(cold.minutes + 60);
    let state = skipped;
    let bank = 0;
    let progress = 0;
    for (let frame = 0; frame < 30; frame++) {
      progress = stepDrill(progress, 0.05, true, state.energy).progress;
      const clock = stepPlayClock(state, bank, 0.05, false);
      state = clock.state;
      bank = clock.bank;
    }
    expect(state.minutes).toBeGreaterThan(skipped.minutes);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
    expect(PLAY_MINUTES_PER_SECOND).toBeGreaterThan(0);
  });

  it('crafts the axe and the bowl from the debug kit, and still heats a wet cobble after the dry ones are gone', () => {
    const kit = { ...debugInventory(), axe: false, bowl: false, stone: 0, dryCobble: 0, wetCobble: 1 };
    const atFire = {
      ...initialState(),
      ...tileToWorld(7, 5),
      tx: 7,
      ty: 5,
      inventory: { ...kit, flakes: 3, wood: 40, cordage: 4, dryCobble: 2, wetCobble: 1, stone: 0 },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 5, edge: 'se' as const, lit: true, fuel: 40 }],
    };
    const recipes = recipesFor(atFire);
    const axe = recipes.find((recipe) => recipe.id === 'stone-axe');
    const bowl = recipes.find((recipe) => recipe.id === 'wood-bowl');
    expect(axe?.enabled).toBe(true);
    expect(bowl?.enabled).toBe(true);
    expect(shownHave(recipes, 'Flake')).toBe(3);
    expect(shownHave(recipes, 'Cobble')).toBe(3);
    expect(shownHave(recipes, 'Flake')).not.toBe(0);

    const wetOnly = {
      ...atFire,
      inventory: { ...atFire.inventory, bowl: true, dryCobble: 0, stone: 0, wetCobble: 1, flakes: 0 },
      bowlWater: 'raw' as const,
      tool: 'hands' as const,
    };
    const ranked = rankedActions(wetOnly, { x: wetOnly.x, y: wetOnly.y });
    expect(ranked.primary.action).toBe('heat');
    expect(ranked.next?.action).toBe('feed');
    const burst = heatStone(wetOnly, () => 0);
    expect(burst.burst).toBe(true);
    expect(burst.state.inventory.wetCobble).toBe(0);
    expect(buildModel(wetOnly, 'none', false).secondLabel).toBe('Feed the fire');
  });

  it('names the pieces Wear nearby aged, and a pack tap drinks, eats, or equips', () => {
    const camp = {
      ...initialState(),
      tx: 7,
      ty: 5,
      pieces: [
        { kind: 'wall' as const, tx: 7, ty: 5, edge: 'se' as const, health: 100 },
        { kind: 'wall' as const, tx: 8, ty: 5, edge: 'se' as const, health: 80 },
        { kind: 'fire' as const, tx: 7, ty: 4, edge: 'se' as const, lit: true, fuel: 20 },
      ],
    };
    const worn = wearNearby(camp);
    expect(worn.message).toBe('Wore 2 twig walls');
    expect(worn.state.pieces.filter((piece) => piece.kind === 'wall').every((piece) => piece.health === 50)).toBe(true);
    expect(pieceFrame('wall', 'se', null, 'twig', true)).toMatch(/_worn$/);
    expect(worn.state.pieces.find((piece) => piece.kind === 'fire')?.health).toBeUndefined();

    const pack = {
      ...initialState(),
      inventory: { ...emptyInventory(), berries: 2, pot: 2, axe: true },
      cupWater: 'boiled' as const,
    };
    expect(packTap(pack, 'pot').kind).toBe('drink');
    expect(packTap(pack, 'berries')).toEqual({ kind: 'eat', food: 'berries' });
    expect(packTap(pack, 'axe')).toEqual({ kind: 'equip', tool: 'axe' });
    expect(packTap({ ...pack, inventory: { ...pack.inventory, axe: false } }, 'axe').kind).toBe('tip');
  });

  it('reaches full stick speed by 60% tilt and keeps a two-line message slot', () => {
    expect(travelSpeed(0.2).speed).toBeGreaterThan(0);
    expect(travelSpeed(0.2).speed).toBeLessThan(travelSpeed(0.6).speed);
    expect(travelSpeed(0.6).speed).toBe(RUN_SPEED);
    expect(travelSpeed(1).speed).toBe(RUN_SPEED);
    const bark = 'The new cover replaces the old one. Nothing comes back.';
    expect(bark.split(' ').length).toBeGreaterThan(8);
    expect(MESSAGE_LINES).toBe(2);
    expect(MESSAGE_SLOT).toBe('calc(17px * 1.35 * 2)');
  });
});
