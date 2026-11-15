import { describe, expect, it } from 'vitest';
import { UPGRADE_NOTE } from '../src/game/copy';
import { recipesFor } from '../src/game/craft';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { emptyInventory, gather, initialState, knapFlint } from '../src/game/rules';
import { chooseUse, upgradePrompt } from '../src/game/use';

function stand(tx: number, ty: number, tool: 'hands' | 'hatchet' | 'hammerstone' = 'hands') {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool, energy: 100 };
}

describe('what Use reaches for', () => {
  it('picks up a river cobble with empty hands and leaves the tool alone', () => {
    const state = stand(2, 8, 'hands');
    const choice = chooseUse(state, { x: state.x, y: state.y });
    expect(choice.action).toBe('gather');
    if (choice.action !== 'gather') return;
    expect(choice.prop.kind).toBe('river_cobbles');
    const taken = gather(state, choice.prop.id);
    expect(taken.ok).toBe(true);
    expect(taken.message).toBe('A hard, round cobble. Good hammerstone.');
    expect(taken.state.inventory.hammerstone).toBe(true);
    expect(taken.state.tool).toBe('hands');
    const hatchet = chooseUse(stand(5, 8, 'hatchet'), { x: state.x, y: state.y });
    expect(hatchet.action).not.toBe('gather');
  });

  it('lets empty hands take fiber, and the hammerstone knap a core', () => {
    const fiber = stand(9, 5, 'hands');
    const plant = chooseUse(fiber, { x: fiber.x, y: fiber.y });
    expect(plant.action).toBe('gather');
    if (plant.action === 'gather') expect(plant.prop.kind).toBe('bush_fiber');
    expect(chooseUse(stand(9, 5, 'hatchet'), { x: fiber.x, y: fiber.y }).action).toBe('chop');

    const core = stand(9, 7, 'hammerstone');
    const knap = chooseUse({ ...core, inventory: { ...emptyInventory(), hammerstone: true } }, { x: core.x, y: core.y });
    expect(knap.action).toBe('knap');
    if (knap.action !== 'knap') return;
    const withStone = knapFlint(
      { ...core, inventory: { ...emptyInventory(), hammerstone: true } },
      knap.prop.id,
    );
    expect(withStone.ok).toBe(true);
    expect(withStone.popup).toMatch(/flake/);
    expect(chooseUse(stand(10, 7, 'hands'), { x: core.x, y: core.y }).action).not.toBe('knap');
  });

  it('saves the hatchet line for when nothing usable is in reach', () => {
    const leaf = gather(stand(5, 8), 'leaf_pile-5-8');
    expect(leaf.ok).toBe(true);
    expect(leaf.message).toBe('Set that aside.');
    expect(leaf.message).not.toMatch(/hatchet/);

    const picked: Record<string, true> = {};
    const trees: Record<string, { hits: number; felledAt: number }> = {};
    const plants: Record<string, number> = {};
    const cores: Record<string, number> = {};
    for (const prop of PROPS) {
      if (prop.gather) picked[prop.id] = true;
      if (prop.kind === 'pine_tree' || prop.kind === 'birch_tree') trees[prop.id] = { hits: 3, felledAt: 1 };
      if (prop.kind === 'bush_fiber') plants[prop.id] = 990;
      if (prop.kind === 'flint_core') cores[prop.id] = 2;
    }
    const bare = {
      ...stand(7, 5, 'hatchet'),
      inventory: { ...emptyInventory(), hammerstone: true },
      picked,
      trees,
      plants,
      cores,
    };
    const choice = chooseUse(bare, { x: bare.x, y: bare.y });
    expect(choice).toEqual({ action: 'none', message: 'The hatchet wants a trunk.' });
  });

  it('tells you to equip the hammerstone when a twig piece is in reach', () => {
    const state = {
      ...stand(6, 4),
      inventory: { ...emptyInventory(), hammerstone: true, stone: 5 },
      pieces: [{ kind: 'wall' as const, tx: 5, ty: 3, edge: 'se' as const, material: 'twig' as const }],
    };
    expect(upgradePrompt(state, { x: state.x, y: state.y })).toMatch(/Equip the hammerstone/);
    const ready = chooseUse({ ...state, tool: 'hammerstone' }, { x: state.x, y: state.y });
    expect(ready.action).toBe('upgrade');
    expect(upgradePrompt({ ...state, tool: 'hammerstone' }, { x: state.x, y: state.y })).toMatch(/tap Use/);
    expect(recipesFor(initialState()).find((recipe) => recipe.id === 'stone-wall')?.blurb).toContain(UPGRADE_NOTE);
  });
});
