import { describe, expect, it } from 'vitest';
import { AXE_BITE, BOILED_THIRST, BOWL_WOOD, WET_BURST_CHANCE } from '../src/game/constants';
import { recipesFor } from '../src/game/craft';
import { drinkBowl, finishBoil, scoopBowl } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { craftAxe, craftBowl, chopTree, emptyInventory, initialState } from '../src/game/rules';
import { dropHotStone, heatStone } from '../src/game/stoneboil';
import { TREE_HITS } from '../src/game/trees';
import { chooseUse } from '../src/game/use';
import type { GameState } from '../src/game/types';

function withPack(extra: Partial<GameState['inventory']>): GameState {
  return { ...initialState(), inventory: { ...emptyInventory(), ...extra } };
}

describe('hafted stone axe and wood bowl', () => {
  it('hafts an axe from a flake, wood, and cord without changing the tool', () => {
    const state = withPack({ flakes: 1, wood: 2, cordage: 1 });
    const made = craftAxe(state);
    expect(made.ok).toBe(true);
    expect(made.state.tool).toBe(state.tool);
    expect(made.state.inventory.axe).toBe(true);
    expect(made.state.inventory.flakes).toBe(0);
    expect(made.state.inventory.wood).toBe(0);
    expect(made.state.inventory.cordage).toBe(0);
    expect(craftAxe(made.state).ok).toBe(false);
    expect(recipesFor(state).find((recipe) => recipe.id === 'stone-axe')).toMatchObject({
      category: 'tools',
      enabled: true,
    });
  });

  it('bites 1.6 times as deep as the crude hatchet', () => {
    const feet = tileToWorld(6, 2);
    const stand = { ...initialState(), ...feet, tx: 6, ty: 2, energy: 100 };
    let hatchet = stand;
    let swings = 0;
    while (hatchet.trees['pine_tree-6-1']?.felledAt == null && swings < 6) {
      hatchet = chopTree(hatchet, 'pine_tree-6-1').state;
      swings += 1;
    }
    expect(swings).toBe(TREE_HITS);
    let axe = { ...stand, tool: 'axe' as const, inventory: { ...stand.inventory, axe: true } };
    const first = chopTree(axe, 'pine_tree-6-1');
    expect(first.state.trees['pine_tree-6-1']?.hits).toBeCloseTo(AXE_BITE);
    expect(first.state.trees['pine_tree-6-1']?.felledAt).toBeNull();
    const second = chopTree(first.state, 'pine_tree-6-1');
    expect(second.state.trees['pine_tree-6-1']?.felledAt).not.toBeNull();
    expect(second.state.tool).toBe('axe');
    expect(AXE_BITE).toBeCloseTo(1.6);
  });

  it('carves a bowl with the axe or a flake, and the tool stays', () => {
    const bare = withPack({ wood: BOWL_WOOD });
    expect(craftBowl(bare).message).toMatch(/axe or a flint flake/);
    const carved = craftBowl(withPack({ wood: BOWL_WOOD, flakes: 1 }));
    expect(carved.ok).toBe(true);
    expect(carved.state.inventory.bowl).toBe(true);
    expect(carved.state.inventory.flakes).toBe(1);
    expect(carved.state.inventory.wood).toBe(0);
    expect(carved.state.tool).toBe('hatchet');
    const withAxe = craftBowl(withPack({ wood: BOWL_WOOD, axe: true, flakes: 0 }));
    expect(withAxe.ok).toBe(true);
    expect(withAxe.state.inventory.axe).toBe(true);
  });

  it('boils bowl water with a dry stone, and a wet cobble can crack', () => {
    const fire = { kind: 'fire' as const, tx: 7, ty: 4, edge: 'se' as const, lit: true, fuel: 80 };
    const at = tileToWorld(7, 5);
    const ready: GameState = {
      ...initialState(),
      ...at,
      tx: 7,
      ty: 5,
      pieces: [fire],
      inventory: { ...emptyInventory(), bowl: true, stone: 1, wetCobble: 1 },
      bowlWater: 'raw',
    };
    const dry = heatStone(ready, () => 0);
    expect(dry.burst).toBe(false);
    expect(dry.spent).toBe('dry');
    expect(dry.state.inventory.stone).toBe(0);
    expect(dry.state.inventory.wetCobble).toBe(1);
    const hot = { ...dry.state, hotStone: 'hot' as const };
    const boiled = dropHotStone(hot);
    expect(boiled.ok).toBe(true);
    expect(boiled.state.bowlWater).toBe('boiled');
    expect(boiled.state.inventory.bowl).toBe(true);
    expect(boiled.state.hotStone).toBe('none');
    const drunk = drinkBowl({ ...boiled.state, thirst: 20 });
    expect(drunk.state.thirst).toBe(20 + BOILED_THIRST);
    expect(drunk.state.inventory.bowl).toBe(true);
    expect(drunk.state.bowlWater).toBe('empty');

    const wetOnly: GameState = { ...ready, inventory: { ...ready.inventory, stone: 0 } };
    const cracked = heatStone(wetOnly, () => 0);
    expect(cracked.burst).toBe(true);
    expect(cracked.state.inventory.wetCobble).toBe(0);
    expect(cracked.message).toMatch(/cracks/);
    const held = heatStone(wetOnly, () => 1);
    expect(held.burst).toBe(false);
    expect(held.spent).toBe('wet');
    expect(WET_BURST_CHANCE).toBeCloseTo(0.25);

    const pot = finishBoil({ ...initialState(), cupWater: 'raw', inventory: { ...emptyInventory(), pot: 3 } });
    expect(pot.inventory.pot).toBe(2);
    expect(pot.cupWater).toBe('boiled');
  });

  it('fills the bowl at the creek and heats only when that water is raw', () => {
    const bank = { ...initialState(), ...tileToWorld(2, 8), tx: 2, ty: 8, inventory: { ...emptyInventory(), bowl: true } };
    const filled = scoopBowl(bank);
    expect(filled.ok).toBe(true);
    expect(filled.state.bowlWater).toBe('raw');
    const at = tileToWorld(7, 5);
    const byFire = {
      ...filled.state,
      ...at,
      tx: 7,
      ty: 5,
      tool: 'hands' as const,
      picked: { 'item_sticks-8-6': true, 'item_stone-6-4': true },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 4, edge: 'se' as const, lit: true, fuel: 40 }],
      inventory: { ...filled.state.inventory, stone: 1 },
    };
    expect(chooseUse(byFire, { x: byFire.x, y: byFire.y }).action).toBe('heat');
    const hot = { ...byFire, hotStone: 'hot' as const };
    expect(chooseUse(hot, { x: hot.x, y: hot.y }).action).toBe('quench');
    const emptyBowl = { ...byFire, bowlWater: 'empty' as const };
    expect(chooseUse(emptyBowl, { x: emptyBowl.x, y: emptyBowl.y }).action).not.toBe('heat');
  });
});
