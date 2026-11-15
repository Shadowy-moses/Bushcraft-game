import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { emptyInventory, initialState } from '../src/game/rules';
import type { GameState } from '../src/game/types';
import { resolveUse } from '../src/game/use';

function stand(tx: number, ty: number, tool: GameState['tool'] = 'hands'): GameState {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool, energy: 100 };
}

describe('smart Use', () => {
  it('puts the stone axe in hand for a tree, and the hatchet when he has no axe', () => {
    const here = stand(6, 2, 'hands');
    const quiet = {
      ...here,
      picked: Object.fromEntries(PROPS.filter((prop) => prop.gather).map((prop) => [prop.id, true as const])),
      plants: Object.fromEntries(PROPS.filter((prop) => prop.kind === 'birch_tree').map((prop) => [prop.id, here.minutes])),
      inventory: { ...emptyInventory(), axe: true },
    };
    const axe = resolveUse(quiet, { x: quiet.x, y: quiet.y });
    expect(axe.swapped).toBe(true);
    expect(axe.state.tool).toBe('axe');
    expect(axe.name).toBe('Stone axe');
    expect(axe.choice.action).toBe('chop');

    const crude = resolveUse({ ...quiet, inventory: emptyInventory() }, { x: quiet.x, y: quiet.y });
    expect(crude.state.tool).toBe('hatchet');
    expect(crude.name).toBe('Hatchet');
    expect(crude.choice.action).toBe('chop');

    const held = resolveUse({ ...quiet, tool: 'axe' }, { x: quiet.x, y: quiet.y });
    expect(held.swapped).toBe(false);
    expect(held.state.tool).toBe('axe');
    expect(held.choice.action).toBe('chop');

    const prefer = resolveUse({ ...quiet, tool: 'hatchet' }, { x: quiet.x, y: quiet.y });
    expect(prefer.swapped).toBe(true);
    expect(prefer.state.tool).toBe('axe');
    expect(prefer.name).toBe('Stone axe');
    expect(prefer.choice.action).toBe('chop');
  });

  it('keeps empty hands for a peel, and swaps off the hatchet for a stick', () => {
    const birch = stand(10, 4, 'hands');
    const peel = resolveUse(birch, { x: birch.x, y: birch.y });
    expect(peel.swapped).toBe(false);
    expect(peel.state.tool).toBe('hands');
    expect(peel.choice.action).toBe('peel');

    const chopping = resolveUse({ ...birch, tool: 'hatchet' }, { x: birch.x, y: birch.y });
    expect(chopping.swapped).toBe(true);
    expect(chopping.state.tool).toBe('hands');
    expect(chopping.choice.action).toBe('peel');

    const stick = stand(5, 4, 'hatchet');
    const drop = resolveUse(stick, { x: stick.x, y: stick.y });
    expect(drop.swapped).toBe(true);
    expect(drop.state.tool).toBe('hands');
    expect(drop.name).toBe('Hands');
    expect(drop.choice.action).toBe('gather');
  });

  it('drinks at a landing before it chops, and feeds a fire before it chops', () => {
    const landing = stand(2, 9, 'hatchet');
    const drink = resolveUse(
      { ...landing, inventory: { ...emptyInventory(), axe: true } },
      { x: landing.x, y: landing.y },
    );
    expect(drink.state.tool).toBe('hands');
    expect(drink.choice.action).toBe('drink-creek');

    const fire = stand(7, 4, 'axe');
    const fed = resolveUse(
      {
        ...fire,
        inventory: { ...emptyInventory(), axe: true, wood: 3 },
        pieces: [{ kind: 'fire', tx: 7, ty: 4, edge: 'se', lit: true, fuel: 40 }],
      },
      { x: fire.x, y: fire.y },
    );
    expect(fed.state.tool).toBe('hands');
    expect(fed.choice.action).toBe('feed');
  });

  it('equips the hammerstone for a twig wall, and a flake does not take its place', () => {
    const here = stand(5, 3, 'hands');
    const quiet = {
      picked: Object.fromEntries(PROPS.filter((prop) => prop.gather).map((prop) => [prop.id, true as const])),
      plants: Object.fromEntries(PROPS.filter((prop) => prop.kind === 'birch_tree').map((prop) => [prop.id, here.minutes])),
      trees: Object.fromEntries(
        PROPS.filter((prop) => prop.kind === 'pine_tree' || prop.kind === 'birch_tree').map((prop) => [
          prop.id,
          { hits: 3, felledAt: 1 },
        ]),
      ),
    };
    const owned = resolveUse(
      {
        ...here,
        ...quiet,
        inventory: { ...emptyInventory(), hammerstone: true, stone: 8 },
        pieces: [{ kind: 'wall', tx: 5, ty: 3, edge: 'se', material: 'twig' }],
      },
      { x: here.x, y: here.y },
    );
    expect(owned.swapped).toBe(true);
    expect(owned.state.tool).toBe('hammerstone');
    expect(owned.name).toBe('Hammerstone');
    expect(owned.choice.action).toBe('upgrade');

    const core = stand(9, 7, 'hands');
    const flake = resolveUse(
      { ...core, inventory: { ...emptyInventory(), flakes: 2 } },
      { x: core.x, y: core.y },
    );
    expect(flake.state.tool).toBe('hands');
    expect(flake.choice.action).not.toBe('knap');
  });

  it('swaps to empty hands to drink a boiled pot', () => {
    const at = stand(7, 4, 'hatchet');
    const state = {
      ...at,
      inventory: { ...at.inventory, pot: 2, wood: 4 },
      cupWater: 'boiled' as const,
      potSeat: { tx: 7, ty: 4 },
      pieces: [{ kind: 'fire' as const, tx: 7, ty: 4, edge: 'se' as const, lit: true, fuel: 40 }],
    };
    const drink = resolveUse(state, { x: state.x, y: state.y });
    expect(drink.swapped).toBe(true);
    expect(drink.state.tool).toBe('hands');
    expect(drink.name).toBe('Hands');
    expect(drink.choice.action).toBe('drink');
  });
});
