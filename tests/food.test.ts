import { describe, expect, it } from 'vitest';
import { BOIL_METHOD } from '../src/game/boil';
import { HUNGER_PER_HOUR, LOG_STRIPS, NEED_DIRE, NEED_LOW, POT_BOILS, SICK_DELAY, SICK_MINUTES, START_MINUTES, THIRST_PER_HOUR } from '../src/game/constants';
import { besideCreek, drinkCup, finishBoil, plantFrame, rainEndsBetween, regrowRocks, scoopCreek } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { craftPot, gather, initialState, needRegen, peelBirch, restEnergyPerSecond, tick } from '../src/game/rules';
import type { GameState } from '../src/game/types';
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

  it('boils in a bark pot, and raw water sickens about one drink in three after a delay', () => {
    expect(BOIL_METHOD.id).toBe('bark-pot');
    expect(BOIL_METHOD.seconds).toBe(4);
    expect(BOIL_METHOD.coalsFrame).toBe('bark_pot_coals');
    expect(BOIL_METHOD.boilingFrame).toBe('bark_pot_coals_boil');
    const bank = stand(2, 8);
    expect(besideCreek(bank.x, bank.y)).toBe(true);
    const made = craftPot({ ...bank, inventory: { ...bank.inventory, bark: 1, cordage: 1 } });
    expect(made.ok).toBe(true);
    expect(made.state.inventory.pot).toBe(POT_BOILS);
    const raw = scoopCreek(made.state);
    expect(raw.ok).toBe(true);
    expect(raw.state.tip).toMatch(/coals/);
    let boiled = raw.state;
    for (let i = 0; i < POT_BOILS; i++) {
      boiled = scoopCreek({ ...boiled, cupWater: 'empty' }).state;
      boiled = finishBoil(boiled);
    }
    expect(boiled.inventory.pot).toBe(0);
    expect(boiled.cupWater).toBe('boiled');
    const safe = drinkCup(boiled);
    expect(safe.state.thirst).toBeGreaterThan(bank.thirst);
    expect(safe.state.sick).toBe(0);
    const rawCup = { ...made.state, cupWater: 'raw' as const, thirst: 40 };
    const fine = drinkCup(rawCup, () => 1);
    expect(fine.state.sick).toBe(0);
    expect(fine.state.sickAt).toBe(0);
    expect(fine.message).toMatch(/sits all right/);
    const risky = drinkCup(rawCup, () => 0);
    expect(risky.state.sick).toBe(0);
    expect(risky.state.sickAt).toBe(risky.state.minutes + SICK_DELAY);
    expect(risky.message).not.toMatch(/stomach/);
    const waiting = tick(risky.state, 60);
    expect(waiting.sick).toBe(0);
    expect(waiting.tip).not.toMatch(/stomach/);
    const started = tick(risky.state, SICK_DELAY + 60);
    expect(started.sick).toBeGreaterThan(0);
    expect(started.sick).toBeLessThanOrEqual(SICK_MINUTES);
    expect(started.tip).toMatch(/stomach/);
    expect(started.health).toBeLessThan(risky.state.health);
  });

  it('peels a living birch once a day, and a fallen log four times', () => {
    const birch = PROPS.find((prop) => prop.kind === 'birch_tree');
    const log = PROPS.find((prop) => prop.kind === 'birch_log');
    expect(birch).toBeTruthy();
    expect(log).toBeTruthy();
    const here = stand(birch!.tx, birch!.ty);
    const strip = peelBirch(here, birch!.id);
    expect(strip.ok).toBe(true);
    expect(strip.popup).toBe('+1 Bark');
    expect(plantFrame('birch_tree', {}, birch!.id, here.minutes)).toBe('birch_tree');
    expect(plantFrame('birch_tree', strip.state.plants, birch!.id, strip.state.minutes)).toBe('birch_tree_peeled');
    expect(plantFrame('birch_tree', strip.state.plants, birch!.id, strip.state.minutes + 1440)).toBe('birch_tree');
    expect(plantFrame('birch_log', {}, log!.id, here.minutes)).toBe('birch_log');
    expect(peelBirch(strip.state, birch!.id).message).toMatch(/peeled/);
    const hatchet = peelBirch({ ...here, tool: 'hatchet' }, birch!.id);
    expect(hatchet.ok).toBe(false);
    const again = tick(strip.state, 1440);
    expect(peelBirch({ ...again, ...tileToWorld(birch!.tx, birch!.ty), tx: birch!.tx, ty: birch!.ty, tool: 'hands' }, birch!.id).ok).toBe(true);
    let logs: GameState = stand(log!.tx, log!.ty);
    for (let i = 0; i < LOG_STRIPS; i++) logs = gather(logs, log!.id).state;
    expect(logs.inventory.bark).toBe(LOG_STRIPS);
    expect(gather(logs, log!.id).ok).toBe(false);
  });

  it('returns one rock node a day, and puts a cobble back when the rain ends', () => {
    const from = START_MINUTES;
    const rocks = { 'rock_node-1-8': 5, 'rock_node-10-8': 5 };
    const gone = { 'rock_node-1-8': from, 'rock_node-10-8': from };
    const soon = regrowRocks(rocks, gone, from, from + 180);
    expect(soon.rocks['rock_node-1-8']).toBe(5);
    const day = regrowRocks(rocks, gone, from, from + 1440);
    expect(day.rocks['rock_node-1-8']).toBe(0);
    expect(day.rocks['rock_node-10-8']).toBe(5);
    const two = regrowRocks(rocks, gone, from, from + 2880);
    expect(two.rocks['rock_node-10-8']).toBe(0);
    expect(rainEndsBetween(20 * 60, 23 * 60)).toBe(1);
    const picked = { 'river_cobbles-2-8': true as const, 'river_cobbles-3-9': true as const };
    const washed = tick({ ...initialState(), minutes: 20 * 60, picked }, 23 * 60 - 20 * 60);
    expect(washed.picked['river_cobbles-2-8']).toBeUndefined();
    expect(washed.picked['river_cobbles-3-9']).toBe(true);
    const atReed = stand(1, 1);
    const reed = chooseUse(atReed, { x: atReed.x, y: atReed.y });
    expect(reed.action).toBe('gather');
    if (reed.action === 'gather') expect(reed.prop.kind).toBe('cattails');
  });
});
