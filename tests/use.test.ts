import { describe, expect, it } from 'vitest';
import { UPGRADE_NOTE } from '../src/game/copy';
import { recipesFor } from '../src/game/craft';
import { tileToWorld } from '../src/game/iso';
import { emptyInventory, gather, initialState, knapFlint } from '../src/game/rules';
import { chooseUse, upgradePrompt } from '../src/game/use';

function stand(tx: number, ty: number, tool: 'hatchet' | 'hammerstone' = 'hatchet') {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool, energy: 100 };
}

describe('what Use reaches for', () => {
  it('picks up a river cobble with the hatchet out, even when a leaf is closer', () => {
    const state = stand(5, 8);
    const choice = chooseUse(state, { x: state.x, y: state.y });
    expect(choice.action).toBe('gather');
    if (choice.action !== 'gather') return;
    expect(choice.prop.kind).toBe('river_cobbles');
    const taken = gather(state, choice.prop.id);
    expect(taken.ok).toBe(true);
    expect(taken.message).toBe('A hard, round cobble. Good hammerstone.');
    expect(taken.state.inventory.hammerstone).toBe(true);
    expect(taken.message).not.toMatch(/hatchet wants a trunk/);
  });

  it('harvests fiber and offers a flint core without the hatchet blocking them', () => {
    const fiber = stand(10, 5);
    const plant = chooseUse(fiber, { x: fiber.x, y: fiber.y });
    expect(plant.action).toBe('gather');
    if (plant.action === 'gather') expect(plant.prop.kind).toBe('bush_fiber');

    const core = stand(10, 7);
    const knap = chooseUse(core, { x: core.x, y: core.y });
    expect(knap.action).toBe('knap');
    if (knap.action !== 'knap') return;
    expect(knapFlint(core, knap.prop.id).message).toBe('You need a hammerstone.');
    const withStone = knapFlint(
      { ...core, inventory: { ...emptyInventory(), hammerstone: true } },
      knap.prop.id,
    );
    expect(withStone.ok).toBe(true);
    expect(withStone.popup).toMatch(/flake/);
  });

  it('saves the hatchet line for when nothing usable is in reach', () => {
    const leaf = gather(stand(5, 8), 'leaf_pile-5-8');
    expect(leaf.ok).toBe(true);
    expect(leaf.message).toBe('Set that aside.');
    expect(leaf.message).not.toMatch(/hatchet/);

    let idle: string | null = null;
    for (let ty = 0; ty < 12 && !idle; ty++) {
      for (let tx = 0; tx < 12; tx++) {
        const state = stand(tx, ty);
        const choice = chooseUse(state, { x: state.x, y: state.y });
        if (choice.action === 'none' && choice.message === 'The hatchet wants a trunk.') {
          idle = `${tx},${ty}`;
          break;
        }
      }
    }
    expect(idle).toBeTruthy();
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
