import { describe, expect, it } from 'vitest';
import { BESIDE_FIRE, BOILED_THIRST } from '../src/game/constants';
import { drinkBowl, drinkCup } from '../src/game/food';
import { buildModel } from '../src/game/model';
import { cobbleIsWet, GRAVEL_LANDINGS, PROPS } from '../src/game/map';
import { tileToWorld } from '../src/game/iso';
import { debugInventory, emptyInventory, gather, initialState, knapFlint } from '../src/game/rules';
import { chooseUse } from '../src/game/use';
import { WALK_SPEED, travelSpeed } from '../src/game/move';

function at(tx: number, ty: number) {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool: 'hands' as const, thirst: 20, energy: 100 };
}

describe('boiled water at a landing', () => {
  it('drinks the boiled bowl through Use, and the creek does not get a turn', () => {
    const landing = GRAVEL_LANDINGS[0];
    const state = {
      ...at(landing.tx, landing.ty),
      inventory: { ...emptyInventory(), bowl: true },
      bowlWater: 'boiled' as const,
    };
    const choice = chooseUse(state, { x: state.x, y: state.y });
    expect(choice.action).toBe('drink-bowl');
    const drunk = drinkBowl(state, () => 0);
    expect(drunk.state.thirst).toBe(20 + BOILED_THIRST);
    expect(drunk.state.sick).toBe(0);
    expect(drunk.state.sickAt).toBe(0);
  });

  it('drinks the boiled pot through Use, and a raw pot comes before the creek', () => {
    const landing = GRAVEL_LANDINGS[1];
    const boiled = {
      ...at(landing.tx, landing.ty),
      inventory: { ...emptyInventory(), pot: 2 },
      cupWater: 'boiled' as const,
    };
    expect(chooseUse(boiled, { x: boiled.x, y: boiled.y }).action).toBe('drink');
    const drunk = drinkCup(boiled, () => 0);
    expect(drunk.state.thirst).toBe(20 + BOILED_THIRST);
    expect(drunk.state.sickAt).toBe(0);
    const raw = { ...boiled, cupWater: 'raw' as const };
    expect(chooseUse(raw, { x: raw.x, y: raw.y }).action).toBe('drink');
    const creek = { ...boiled, cupWater: 'empty' as const, inventory: { ...boiled.inventory, pot: 0 } };
    expect(chooseUse(creek, { x: creek.x, y: creek.y }).action).toBe('drink-creek');
  });
});

describe('cobbles, flakes, and the debug pack', () => {
  it('stocks the debug kit with an axe, a bowl, flakes, and both cobbles', () => {
    const pack = debugInventory();
    expect(pack.axe).toBe(true);
    expect(pack.bowl).toBe(true);
    expect(pack.flakes).toBeGreaterThanOrEqual(2);
    expect(pack.dryCobble).toBeGreaterThanOrEqual(2);
    expect(pack.wetCobble).toBeGreaterThanOrEqual(1);
    expect(pack.stone).not.toBe(pack.dryCobble);
  });

  it('picks a bank cobble up dry and a water-edge cobble up wet, and knapping makes flakes', () => {
    const bank = PROPS.find((prop) => prop.id === 'river_cobbles-7-9');
    const edge = PROPS.find((prop) => prop.id === 'river_cobbles-3-9');
    expect(bank && cobbleIsWet(bank.tx, bank.ty)).toBe(false);
    expect(edge && cobbleIsWet(edge.tx, edge.ty)).toBe(true);
    const owned = { ...at(7, 9), inventory: { ...emptyInventory(), hammerstone: true } };
    const dry = gather(owned, 'river_cobbles-7-9');
    expect(dry.ok).toBe(true);
    expect(dry.state.inventory.dryCobble).toBe(1);
    const wet = gather({ ...at(3, 9), inventory: { ...emptyInventory(), hammerstone: true } }, 'river_cobbles-3-9');
    expect(wet.ok).toBe(true);
    expect(wet.state.inventory.wetCobble).toBe(1);

    const core = at(4, 8);
    const knap = chooseUse(
      { ...core, tool: 'hammerstone', inventory: { ...emptyInventory(), hammerstone: true } },
      { x: core.x, y: core.y },
    );
    expect(knap.action).toBe('knap');
    if (knap.action !== 'knap') return;
    const flakes = knapFlint(
      { ...core, tool: 'hammerstone', inventory: { ...emptyInventory(), hammerstone: true } },
      knap.prop.id,
    );
    expect(flakes.ok).toBe(true);
    expect(flakes.state.inventory.flakes).toBeGreaterThan(0);
  });

  it('keeps cattails at least two tiles from the landings', () => {
    for (const plant of PROPS.filter((prop) => prop.kind === 'cattails' || prop.kind === 'berry_bush')) {
      for (const spot of GRAVEL_LANDINGS) {
        const tiles = Math.max(Math.abs(plant.tx - spot.tx), Math.abs(plant.ty - spot.ty));
        expect(tiles, plant.id).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('the fire beside him', () => {
  it('tends the coals instead of drinking the creek or pulling a plant', () => {
    const state = {
      ...at(2, 9),
      inventory: { ...emptyInventory(), wood: 3 },
      pieces: [{ kind: 'fire' as const, tx: 2, ty: 9, edge: 'se' as const, lit: true, fuel: 40 }],
    };
    const choice = chooseUse(state, { x: state.x, y: state.y });
    expect(choice.action).toBe('feed');
    expect(Math.hypot(0, 0)).toBeLessThan(BESIDE_FIRE);
    const cold = {
      ...state,
      inventory: { ...state.inventory, coal: 1, wood: 0 },
      pieces: [{ kind: 'fire' as const, tx: 2, ty: 9, edge: 'se' as const, lit: false, fuel: 40, ember: 'none' as const }],
    };
    expect(chooseUse(cold, { x: cold.x, y: cold.y }).action).toBe('blow');
    expect(buildModel(cold, 'none', false).useLabel).toBe('Blow');
    const smoking = {
      ...cold,
      pieces: [{ ...cold.pieces[0], ember: 'smoke' as const }],
    };
    expect(buildModel(smoking, 'none', false).useLabel).toBe('Blow');
  });
});

describe('the stick', () => {
  it('creeps at a low tilt and still runs at full tilt', () => {
    expect(travelSpeed(0.1).speed).toBe(0);
    const low = travelSpeed(0.35);
    expect(low.speed).toBeGreaterThan(0);
    expect(low.speed).toBeLessThan(WALK_SPEED * 0.5);
    expect(travelSpeed(1).running).toBe(true);
  });
});
