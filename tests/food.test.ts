import { describe, expect, it } from 'vitest';
import { BOIL_METHOD } from '../src/game/boil';
import { HUNGER_PER_HOUR, NEED_DIRE, NEED_LOW, SICK_MINUTES, START_MINUTES, THIRST_PER_HOUR } from '../src/game/constants';
import { besideCreek, drinkCup, finishBoil, rainEndsBetween, regrowRocks, scoopCreek } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { gather, initialState, needRegen, restEnergyPerSecond, tick } from '../src/game/rules';
import { chooseUse } from '../src/game/use';

function stand(tx: number, ty: number) {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool: 'hands' as const };
}

describe('food and water', () => {
  it('drains thirst faster than hunger, and low bars slow rest then cost health', () => {
    const hour = tick(initialState(), 60);
    expect(initialState().hunger - hour.hunger).toBeCloseTo(HUNGER_PER_HOUR);
    expect(initialState().thirst - hour.thirst).toBeCloseTo(THIRST_PER_HOUR);
    expect(hour.thirst).toBeLessThan(hour.hunger);
    const fine = { ...initialState(), hunger: 80, thirst: 80 };
    const oneLow = { ...fine, thirst: NEED_LOW - 1 };
    const bothLow = { ...oneLow, hunger: NEED_LOW - 1 };
    expect(needRegen(oneLow)).toBeLessThan(needRegen(fine));
    expect(needRegen(bothLow)).toBeLessThan(needRegen(oneLow));
    expect(restEnergyPerSecond(oneLow)).toBeLessThan(restEnergyPerSecond(fine));
    const dire = tick({ ...initialState(), hunger: NEED_DIRE - 1, thirst: 80, health: 100 }, 60);
    expect(dire.health).toBeLessThan(100);
    const bothDire = tick({ ...initialState(), hunger: NEED_DIRE - 1, thirst: NEED_DIRE - 1, health: 100 }, 60);
    expect(bothDire.health).toBeLessThan(dire.health);
  });

  it('gathers berries and cattail roots by hand, then they grow back', () => {
    const berry = PROPS.find((prop) => prop.kind === 'berry_bush');
    const reed = PROPS.find((prop) => prop.kind === 'cattails');
    expect(berry).toBeTruthy();
    expect(reed).toBeTruthy();
    const picked = gather(stand(berry!.tx, berry!.ty), berry!.id);
    expect(picked.ok).toBe(true);
    expect(picked.state.inventory.berries).toBe(2);
    expect(gather(picked.state, berry!.id).message).toMatch(/come back/i);
    const hatchet = gather({ ...stand(berry!.tx, berry!.ty), tool: 'hatchet' }, berry!.id);
    expect(hatchet.ok).toBe(false);
    const root = gather(stand(reed!.tx, reed!.ty), reed!.id);
    expect(root.ok).toBe(true);
    expect(root.state.inventory.roots).toBe(1);
    const later = tick(picked.state, 1440);
    expect(gather({ ...later, ...tileToWorld(berry!.tx, berry!.ty), tx: berry!.tx, ty: berry!.ty, tool: 'hands' }, berry!.id).ok).toBe(true);
  });

  it('keeps the boil method swappable and makes raw water a sickness', () => {
    expect(BOIL_METHOD.id).toBe('bark-cup');
    expect(BOIL_METHOD.seconds).toBeGreaterThan(0);
    expect(BOIL_METHOD.steamFrames).toEqual(['steam_0', 'steam_1']);
    const bank = stand(2, 8);
    expect(besideCreek(bank.x, bank.y)).toBe(true);
    const dry = scoopCreek(bank);
    expect(dry.ok).toBe(false);
    const cup = { ...bank, inventory: { ...bank.inventory, cup: true } };
    const raw = scoopCreek(cup);
    expect(raw.ok).toBe(true);
    expect(raw.state.cupWater).toBe('raw');
    const boiled = finishBoil(raw.state);
    expect(boiled.cupWater).toBe('boiled');
    const drunk = drinkCup(boiled);
    expect(drunk.state.thirst).toBeGreaterThan(bank.thirst);
    expect(drunk.state.sick).toBe(0);
    const risky = drinkCup(raw.state);
    expect(risky.state.sick).toBe(SICK_MINUTES);
    const worse = tick(risky.state, 60);
    expect(worse.health).toBeLessThan(risky.state.health);
    expect(worse.energy).toBeLessThan(risky.state.energy);
  });

  it('returns one rock node at a time, and puts a cobble back when the rain ends', () => {
    const from = START_MINUTES;
    const rocks = { 'rock_node-1-8': 5, 'rock_node-10-8': 5 };
    const gone = { 'rock_node-1-8': from, 'rock_node-10-8': from };
    const soon = regrowRocks(rocks, gone, from, from + 180);
    expect(soon.rocks['rock_node-1-8']).toBe(0);
    expect(soon.rocks['rock_node-10-8']).toBe(5);
    const later = regrowRocks(rocks, gone, from, from + 360);
    expect(later.rocks['rock_node-10-8']).toBe(0);
    expect(rainEndsBetween(20 * 60, 23 * 60)).toBe(1);
    const picked = { 'river_cobbles-2-8': true as const, 'river_cobbles-3-9': true as const };
    const washed = tick({ ...initialState(), minutes: 20 * 60, picked }, 23 * 60 - 20 * 60);
    expect(washed.picked['river_cobbles-2-8']).toBeUndefined();
    expect(washed.picked['river_cobbles-3-9']).toBe(true);
    const atReed = stand(3, 8);
    expect(chooseUse(atReed, { x: atReed.x, y: atReed.y }).action).toBe('gather');
  });
});
