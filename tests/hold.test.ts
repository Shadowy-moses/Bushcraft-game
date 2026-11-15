import { describe, expect, it } from 'vitest';
import { SICK_DELAY } from '../src/game/constants';
import { hotbarSlots } from '../src/game/craft';
import { drinkCreek, drinkCup } from '../src/game/food';
import { CANT_HOLD, heldIcon, holdSlot } from '../src/game/hold';
import { tileToWorld } from '../src/game/iso';
import { emptyInventory, initialState, tick } from '../src/game/rules';

describe('the tool in hand', () => {
  it('names the new tool, and refuses a slot he cannot hold', () => {
    const bare = initialState();
    const axeSlot = hotbarSlots(bare).findIndex((slot) => slot.id === 'axe');
    const refused = holdSlot(bare, axeSlot);
    expect(refused.changed).toBe(false);
    expect(refused.state.tool).toBe('hatchet');
    expect(refused.message).toBe(CANT_HOLD);

    const owned = { ...bare, inventory: { ...bare.inventory, axe: true } };
    const held = holdSlot(owned, axeSlot);
    expect(held.changed).toBe(true);
    expect(held.state.tool).toBe('axe');
    expect(held.message).toBe('Stone axe');

    const wood = hotbarSlots(owned).findIndex((slot) => slot.id === 'wood');
    expect(holdSlot(held.state, wood).message).toBe(CANT_HOLD);
    expect(holdSlot(held.state, wood).state.tool).toBe('axe');
  });

  it('uses the same icon for the hotbar slot and the hand', () => {
    const state = { ...initialState(), inventory: { ...emptyInventory(), axe: true, hammerstone: true }, tool: 'axe' as const };
    const slot = hotbarSlots(state).find((item) => item.id === 'axe');
    expect(heldIcon('axe', true, true).frame).toBe(slot?.frame);
    const hatchet = hotbarSlots(state).find((item) => item.id === 'hatchet');
    const hands = hotbarSlots(state).find((item) => item.id === 'hands');
    expect(heldIcon('hatchet', true, true).frame).toBe('item_hatchet');
    expect(heldIcon('hatchet', true, true).frame).toBe(hatchet?.frame);
    expect(heldIcon('hands', true, true).frame).toBe('item_hands');
    expect(heldIcon('hands', true, true).frame).toBe(hands?.frame);
    expect(heldIcon('hammerstone', true, true).frame).toBe('item_hammerstone');
    for (const slot of hotbarSlots(state)) {
      if (slot.id === 'hammerstone') continue;
      expect(slot.frame).not.toBe('item_hammerstone');
    }
    const bare = hotbarSlots(initialState());
    expect(bare.find((slot) => slot.id === 'hammerstone')?.frame).toBe('item_hands');
    expect(bare.every((slot) => slot.frame !== 'item_hammerstone')).toBe(true);
  });
});

describe('creek water and boiled water', () => {
  it('a creek drink can turn after the delay, and boiled water never does', () => {
    const at = tileToWorld(2, 9);
    const here = { ...initialState(), ...at, tx: 2, ty: 9, thirst: 20, tool: 'hands' as const };
    const risky = drinkCreek(here, () => 0);
    expect(risky.state.sick).toBe(0);
    expect(risky.state.sickAt).toBe(here.minutes + SICK_DELAY);
    expect(tick(risky.state, 60).sick).toBe(0);
    const started = tick(risky.state, SICK_DELAY + 30);
    expect(started.sick).toBeGreaterThan(0);
    expect(started.tip).toMatch(/stomach/);

    const safe = drinkCreek(here, () => 1);
    expect(safe.state.sickAt).toBe(0);
    expect(tick(safe.state, SICK_DELAY + 30).sick).toBe(0);

    const boiled = drinkCup(
      { ...here, cupWater: 'boiled', inventory: { ...here.inventory, pot: 2 } },
      () => 0,
    );
    expect(boiled.state.sick).toBe(0);
    expect(boiled.state.sickAt).toBe(0);
    expect(tick(boiled.state, SICK_DELAY + 30).sick).toBe(0);
  });
});
