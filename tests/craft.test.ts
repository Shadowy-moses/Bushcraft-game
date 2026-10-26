import { describe, expect, it } from 'vitest';
import { recipesFor, statusLine } from '../src/game/craft';
import { initialState } from '../src/game/rules';

describe('crafting bench', () => {
  it('sends an unplaced lean-to and an unplaced fire lay into placement', () => {
    const recipes = recipesFor(initialState());
    expect(recipes.find((recipe) => recipe.id === 'lean-to')?.action).toBe('place-shelter');
    expect(recipes.find((recipe) => recipe.id === 'tipi')?.action).toBe('place-fire');
    expect(recipes.find((recipe) => recipe.id === 'logcabin')?.action).toBe('place-fire');
    expect(recipes.find((recipe) => recipe.id === 'cordage')).toMatchObject({
      category: 'resources',
      action: 'craft-cordage',
      enabled: false,
    });
    expect(recipes.find((recipe) => recipe.id === 'cordage')?.seconds).toBeGreaterThan(0);
  });

  it('crafts the lay once the ring, tinder, and kindling are ready', () => {
    const state = {
      ...initialState(),
      inventory: { ...initialState().inventory, sticks: 6, stones: 4, fiber: 2 },
      fire: { ring: true, tinder: true, kindling: true, lay: 'none' as const, lit: false },
      fireTile: { tx: 7, ty: 4 },
    };
    const tipi = recipesFor(state).find((recipe) => recipe.id === 'tipi');
    expect(tipi?.action).toBe('lay-tipi');
    expect(tipi?.enabled).toBe(true);
  });

  it('names the cold and a finished shelter', () => {
    const cold = { ...initialState(), warmth: 12 };
    expect(statusLine(cold)).toBe('Cold');
    const sheltered = {
      ...initialState(),
      warmth: 70,
      tx: 5,
      ty: 3,
      shelter: 4 as const,
      shelterAnchor: { tx: 5, ty: 3 },
      shelterFlip: false,
    };
    expect(statusLine(sheltered)).toBe('Sheltered');
  });
});