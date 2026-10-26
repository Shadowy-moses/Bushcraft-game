import { describe, expect, it } from 'vitest';
import { OPENING_TIP } from '../src/game/copy';
import { initialState } from '../src/game/rules';
import { parseSave } from '../src/game/save';

describe('saved games', () => {
  it('turns an older night into a fresh build and keeps where he stood', () => {
    const v1 = {
      version: 1,
      minutes: 1000,
      warmth: 50,
      energy: 40,
      tx: 7,
      ty: 4,
      faceLeft: true,
      inventory: { sticks: 1, stones: 2, fiber: 0, cordage: 1, tinder: 0, leaves: 0 },
      shelter: 2,
      cordageTwisted: false,
      fire: { ring: true, tinder: false, kindling: false, lay: 'none', lit: false },
      picked: { 'item_sticks-8-3': true },
      outcome: 'playing',
      tip: 'hi',
    };
    const migrated = parseSave(JSON.stringify(v1));
    expect(migrated?.version).toBe(3);
    expect(migrated?.tx).toBe(7);
    expect(migrated?.ty).toBe(4);
    expect(migrated?.facing).toBe('sw');
    expect(migrated?.tool).toBe('hatchet');
    expect(migrated?.inventory.wood).toBe(0);
    expect(migrated?.pieces).toEqual([]);
    expect(migrated?.picked['item_sticks-8-3']).toBe(true);
    expect(migrated?.tip).toBe(OPENING_TIP);
  });

  it('keeps a version-3 build', () => {
    const placed = {
      ...initialState(),
      inventory: { wood: 30 },
      pieces: [{ kind: 'foundation' as const, tx: 7, ty: 3, edge: 'se' as const }],
      trees: { 'pine_tree-6-1': { hits: 3, felledAt: 1000 } },
    };
    expect(parseSave(JSON.stringify(placed))).toMatchObject({
      inventory: { wood: 30 },
      pieces: [{ kind: 'foundation', tx: 7, ty: 3, edge: 'se' }],
      trees: { 'pine_tree-6-1': { hits: 3, felledAt: 1000 } },
    });
    expect(parseSave('not json')).toBeNull();
  });
});
