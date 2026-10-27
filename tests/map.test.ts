import { describe, expect, it } from 'vitest';
import { COLS, FIRE_TILE, PLAYER_START, ROWS, SHELTER_TILES } from '../src/game/constants';
import { GROUND_ROWS, PROPS, groundAt, isBlocked, blockedFor } from '../src/game/map';
import { planRoute } from '../src/game/path';
import { initialState } from '../src/game/rules';

describe('the patch of woods', () => {
  it('is a 12 by 12 clearing with a creek', () => {
    expect(GROUND_ROWS).toHaveLength(ROWS);
    for (const row of GROUND_ROWS) {
      expect(row).toHaveLength(COLS);
      expect(row).toMatch(/^[fgdwe]+$/);
    }
    expect(groundAt(FIRE_TILE.tx, FIRE_TILE.ty)).toBe('dirt');
    expect(groundAt(0, 11)).toBe('creek_water');
  });

  it('does not stack two things on one tile, or put them in the water', () => {
    const seen = new Set<string>();
    for (const prop of PROPS) {
      const key = `${prop.tx},${prop.ty}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(groundAt(prop.tx, prop.ty)).not.toBe('creek_water');
      expect(groundAt(prop.tx, prop.ty)).not.toBeNull();
    }
    expect(seen.has(`${PLAYER_START.tx},${PLAYER_START.ty}`)).toBe(false);
    expect(seen.has(`${FIRE_TILE.tx},${FIRE_TILE.ty}`)).toBe(false);
    for (const tile of SHELTER_TILES) expect(seen.has(`${tile.tx},${tile.ty}`)).toBe(false);
  });

  it('has enough trees to build, and a stump gives the tile back', () => {
    const trees = PROPS.filter((prop) => prop.kind === 'pine_tree' || prop.kind === 'birch_tree');
    expect(trees.length).toBeGreaterThanOrEqual(16);
    const state = initialState();
    expect(isBlocked(6, 1, state)).toBe(true);
    expect(isBlocked(PLAYER_START.tx, PLAYER_START.ty, state)).toBe(false);
    const open = { trees: { 'pine_tree-6-1': { hits: 3, felledAt: 1 } } };
    expect(isBlocked(6, 1, open)).toBe(false);
    for (const prop of trees) {
      expect(planRoute(PLAYER_START, prop.tx, prop.ty, blockedFor(state)), prop.id).not.toBeNull();
    }
  });
});
