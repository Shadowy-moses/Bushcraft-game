import { describe, expect, it } from 'vitest';
import { materialCost } from '../src/game/build';
import { COLS, FIRE_TILE, PLAYER_START, ROWS, SHELTER_TILES } from '../src/game/constants';
import { GROUND_ROWS, PROPS, groundAt, isBlocked, blockedFor } from '../src/game/map';
import { planRoute } from '../src/game/path';
import { initialState, tick } from '../src/game/rules';
import { stoneFromStrike } from '../src/game/stone';

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

  it('has seven rock nodes, enough stone for one hut, and they stay mined', () => {
    const nodes = PROPS.filter((prop) => prop.kind === 'rock_node');
    expect(nodes).toHaveLength(7);
    const perNode = [1, 2, 3, 4, 5].reduce((sum, hit) => sum + stoneFromStrike(hit), 0);
    expect(perNode).toBe(6);
    const hut =
      materialCost('foundation', 'stone') +
      materialCost('wall', 'stone') * 3 +
      materialCost('doorway', 'stone') +
      materialCost('floor', 'stone');
    expect(hut).toBe(38);
    expect(nodes.length * perNode).toBeGreaterThanOrEqual(hut);
    const mined = { ...initialState(), rocks: { 'rock_node-1-8': 5 } };
    expect(tick(mined, 4000).rocks['rock_node-1-8']).toBe(5);
  });
});
