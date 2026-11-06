import { describe, expect, it } from 'vitest';
import { hotbarSlots, placeButtonLabel, recipesFor, statusLine } from '../src/game/craft';
import { initialState } from '../src/game/rules';

describe('the building plan', () => {
  it('starts with the hatchet equipped and wood in the pack line', () => {
    const slots = hotbarSlots(initialState());
    expect(slots[0]).toMatchObject({ id: 'hatchet', name: 'Hatchet' });
    expect(slots[1]).toMatchObject({ id: 'plan', name: 'Building plan' });
    expect(slots[2].count).toBe(0);
  });

  it('offers four wood pieces and keeps the hatchet as a tool you already own', () => {
    const broke = recipesFor(initialState());
    expect(broke.find((recipe) => recipe.id === 'hatchet')).toMatchObject({ done: true, enabled: false });
    expect(broke.find((recipe) => recipe.id === 'foundation')).toMatchObject({
      action: 'place-foundation',
      enabled: false,
    });
    expect(broke.map((recipe) => recipe.id)).toEqual(['hatchet', 'foundation', 'wall', 'doorway', 'floor']);

    const ready = recipesFor({ ...initialState(), inventory: { wood: 10 }, energy: 100 });
    expect(ready.find((recipe) => recipe.id === 'foundation')?.enabled).toBe(true);
    const tired = recipesFor({ ...initialState(), inventory: { wood: 10 }, energy: 0 });
    expect(tired.find((recipe) => recipe.id === 'foundation')?.enabled).toBe(true);
    expect(ready.find((recipe) => recipe.id === 'wall')?.enabled).toBe(true);
    const nine = recipesFor({ ...initialState(), inventory: { wood: 9 }, energy: 100 });
    expect(nine.find((recipe) => recipe.id === 'foundation')?.enabled).toBe(false);
    expect(nine.find((recipe) => recipe.id === 'floor')?.enabled).toBe(true);
    expect(nine.find((recipe) => recipe.id === 'wall')?.enabled).toBe(true);
    const short = recipesFor({ ...initialState(), inventory: { wood: 4 }, energy: 100 });
    expect(short.find((recipe) => recipe.id === 'wall')?.enabled).toBe(false);
  });

  it('says how much wood a greyed place button is missing', () => {
    expect(placeButtonLabel(7, 10)).toBe('Need 3 more wood');
    expect(placeButtonLabel(10, 10)).toBe('Place');
  });

  it('names the cold and a roof', () => {
    expect(statusLine({ ...initialState(), warmth: 12 })).toBe('Cold');
    expect(statusLine({ ...initialState(), warmth: 70, energy: 10 })).toBe('Tired');
    expect(
      statusLine({
        ...initialState(),
        warmth: 70,
        energy: 80,
        pieces: [{ kind: 'floor', tx: 7, ty: 3, edge: 'se' }],
      }),
    ).toBe('Under a roof');
  });
});
