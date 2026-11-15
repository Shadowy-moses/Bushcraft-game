import { describe, expect, it } from 'vitest';
import { BARK_STRIPS, BOILED_THIRST, LOG_STRIPS, ROOT_HUNGER } from '../src/game/constants';
import { clockParts } from '../src/game/copy';
import { drinkCup, eat, finishBoil, liftPot, scoopCreek } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { emptyInventory, gather, initialState, peelBirch, tick } from '../src/game/rules';
import type { GameState } from '../src/game/types';
import { actionLabel, chooseUse, usePrompt } from '../src/game/use';
import { weatherAt } from '../src/game/weather';

function stand(tx: number, ty: number) {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool: 'hands' as const, energy: 100 };
}

describe('a boiled bark pot', () => {
  it('drinks from the coals, and a lifted pot still drinks from the pack', () => {
    const bank = stand(2, 8);
    const made = {
      ...bank,
      inventory: { ...bank.inventory, pot: 3, bark: 0, cordage: 0, wood: 6, bowl: true },
      thirst: 20,
    };
    const raw = scoopCreek(made);
    expect(raw.ok).toBe(true);
    const fire = { tx: 7, ty: 4 };
    const atFire = {
      ...raw.state,
      ...tileToWorld(fire.tx, fire.ty),
      tx: fire.tx,
      ty: fire.ty,
      pieces: [{ kind: 'fire' as const, tx: fire.tx, ty: fire.ty, edge: 'se' as const, lit: true, fuel: 80 }],
      potSeat: fire,
    };
    const boiled = { ...finishBoil(atFire), potSeat: fire };
    expect(boiled.cupWater).toBe('boiled');
    expect(boiled.inventory.pot).toBe(2);
    const feet = { x: boiled.x, y: boiled.y };
    const choice = chooseUse(boiled, feet);
    expect(choice.action).toBe('drink');
    expect(usePrompt(boiled, feet)).toBe('Drink');
    expect(usePrompt(boiled, feet)).toBe(actionLabel(choice));
    expect(usePrompt(boiled, feet)).not.toBe('Fill bowl');
    expect(choice.action).not.toBe('feed');
    const drunk = drinkCup(boiled);
    expect(drunk.ok).toBe(true);
    expect(drunk.state.thirst).toBe(20 + BOILED_THIRST);
    expect(drunk.state.cupWater).toBe('empty');
    expect(drunk.state.potSeat).toBeNull();

    const again = { ...finishBoil({ ...raw.state, ...tileToWorld(fire.tx, fire.ty), tx: fire.tx, ty: fire.ty, potSeat: fire }), potSeat: fire };
    const wear = again.inventory.pot;
    const lifted = liftPot(again);
    expect(lifted.ok).toBe(true);
    expect(lifted.state.potSeat).toBeNull();
    expect(lifted.state.cupWater).toBe('boiled');
    expect(lifted.state.inventory.pot).toBe(wear);
    const fromPack = drinkCup(lifted.state);
    expect(fromPack.state.thirst).toBeGreaterThan(again.thirst);
    expect(fromPack.state.inventory.pot).toBe(wear);
  });

  it('names the fire when feeding is what Use will do', () => {
    const at = tileToWorld(7, 4);
    const state = {
      ...stand(7, 4),
      ...at,
      inventory: { ...emptyInventory(), wood: 4 },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 4, edge: 'se' as const, lit: true, fuel: 40 }],
      picked: { 'item_sticks-5-4': true as const },
    };
    const feet = { x: state.x, y: state.y };
    const choice = chooseUse(state, feet);
    expect(choice.action).toBe('feed');
    expect(usePrompt(state, feet)).toBe('Feed the fire');
    expect(usePrompt(state, feet)).toBe(actionLabel(choice));
  });
});

describe('birch bark', () => {
  it('peels a live birch with empty hands, and the hatchet chops only while it is held', () => {
    const birch = PROPS.find((prop) => prop.id === 'birch_tree-10-5');
    expect(birch).toBeTruthy();
    const here = stand(10, 4);
    const hands = chooseUse(here, { x: here.x, y: here.y });
    expect(hands.action).toBe('peel');
    expect(usePrompt(here, { x: here.x, y: here.y })).toBe('Peel bark');
    const strip = peelBirch(here, birch!.id);
    expect(strip.ok).toBe(true);
    expect(strip.state.inventory.bark).toBe(BARK_STRIPS);
    expect(peelBirch(strip.state, birch!.id).ok).toBe(false);

    const hatchet = chooseUse({ ...here, tool: 'hatchet' }, { x: here.x, y: here.y });
    expect(hatchet.action).toBe('chop');
    const axe = chooseUse({ ...here, tool: 'axe', inventory: { ...here.inventory, axe: true } }, { x: here.x, y: here.y });
    expect(axe.action).toBe('chop');
  });

  it('takes two strips from a fallen birch, and the log still totals four', () => {
    const log = PROPS.find((prop) => prop.kind === 'birch_log')!;
    let state: GameState = stand(log.tx, log.ty);
    const first = gather(state, log.id);
    expect(first.ok).toBe(true);
    expect(first.state.inventory.bark).toBe(BARK_STRIPS);
    state = first.state;
    const second = gather(state, log.id);
    expect(second.state.inventory.bark).toBe(LOG_STRIPS);
    expect(gather(second.state, log.id).ok).toBe(false);
  });
});

describe('cattail roots', () => {
  it('fills 22 hunger', () => {
    const reed = PROPS.find((prop) => prop.kind === 'cattails')!;
    const pulled = gather({ ...stand(reed.tx, reed.ty), hunger: 40 }, reed.id);
    expect(pulled.state.inventory.roots).toBe(1);
    const eaten = eat({ ...pulled.state, hunger: 40 }, 'roots');
    expect(eaten.state.hunger).toBe(40 + ROOT_HUNGER);
  });
});

describe('the rain button sequence', () => {
  it('keeps the clock moving after three hours, a refill, and the jump to rain', () => {
    let state = initialState();
    state = tick(state, 60);
    state = tick(state, 60);
    state = tick(state, 60);
    state = { ...state, health: 100, warmth: 100, hunger: 100, thirst: 100, energy: 100, sick: 0, sickAt: 0 };
    state = { ...state, minutes: 20 * 60 };
    expect(weatherAt(state.minutes)).toBe('rain');
    expect(clockParts(state.minutes).clock).toBe('8:00');
    const next = tick(state, 2);
    expect(next.minutes).toBeGreaterThan(state.minutes);
    expect(clockParts(next.minutes).clock).not.toBe(clockParts(state.minutes).clock);
  });
});
