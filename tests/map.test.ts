import { describe, expect, it } from 'vitest';
import { COLS, FIRE_TILE, PLAYER_START, ROWS, SHELTER_TILES } from '../src/game/constants';
import { occupiedFrom } from '../src/game/footprint';
import { GROUND_ROWS, PROPS, groundAt, isBlocked } from '../src/game/map';
import { planRoute } from '../src/game/path';
import { initialState } from '../src/game/rules';
import type { Occupied } from '../src/game/footprint';

function camp(shelter: 0 | 4): Occupied {
  return occupiedFrom({
    ...initialState(),
    shelter,
    shelterAnchor: shelter >= 1 ? { tx: SHELTER_TILES[0].tx, ty: SHELTER_TILES[0].ty } : null,
    shelterFlip: false,
  });
}

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

  it('holds enough material, and you can walk to all of it', () => {
    const totals = { sticks: 0, stones: 0, fiber: 0, tinder: 0, leaves: 0 };
    for (const prop of PROPS) {
      if (prop.gather) totals[prop.gather] += prop.amount;
    }
    expect(totals.sticks).toBeGreaterThanOrEqual(3 + 4 + 2 + 3);
    expect(totals.stones).toBeGreaterThanOrEqual(4);
    expect(totals.fiber).toBeGreaterThanOrEqual(2);
    expect(totals.tinder).toBeGreaterThanOrEqual(1);
    expect(totals.leaves).toBeGreaterThanOrEqual(4);

    for (const shelter of [0, 4] as const) {
      const occupied = camp(shelter);
      const blocked = (x: number, y: number) => isBlocked(x, y, occupied);
      for (const prop of PROPS) {
        if (!prop.gather) continue;
        const plan = planRoute(PLAYER_START, prop.tx, prop.ty, blocked);
        expect(plan, `${prop.id} shelter ${shelter}`).not.toBeNull();
      }
      expect(planRoute(PLAYER_START, FIRE_TILE.tx, FIRE_TILE.ty, blocked)).not.toBeNull();
    }
    expect(isBlocked(PLAYER_START.tx, PLAYER_START.ty, camp(0))).toBe(false);
    expect(isBlocked(SHELTER_TILES[0].tx, SHELTER_TILES[0].ty, camp(4))).toBe(true);
    expect(isBlocked(SHELTER_TILES[1].tx, SHELTER_TILES[1].ty, camp(4))).toBe(true);
    expect(isBlocked(SHELTER_TILES[0].tx, SHELTER_TILES[0].ty, camp(0))).toBe(false);
  });
});
