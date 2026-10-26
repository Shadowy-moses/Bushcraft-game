import { describe, expect, it } from 'vitest';
import { occupiedFrom, shelterFootprint, shelterWorld } from '../src/game/footprint';
import { tileToWorld } from '../src/game/iso';
import { blockedFor, isBlocked } from '../src/game/map';
import { planRoute } from '../src/game/path';
import { fireSpot, shelterSpot } from '../src/game/place';
import { initialState } from '../src/game/rules';

describe('placing a lean-to', () => {
  it('spans two tiles and 64 pixels, and flip mirrors that span', () => {
    const [a, b] = shelterFootprint({ tx: 7, ty: 3 }, false);
    const left = tileToWorld(a.tx, a.ty);
    const right = tileToWorld(b.tx, b.ty);
    expect(b).toEqual({ tx: 8, ty: 2 });
    expect(right.x - left.x).toBe(32);
    expect(right.y).toBe(left.y);
    const mid = shelterWorld({ tx: 7, ty: 3 }, false);
    expect(mid).toEqual({ x: (left.x + right.x) / 2, y: left.y });

    const [c, d] = shelterFootprint({ tx: 7, ty: 3 }, true);
    expect(d).toEqual({ tx: 6, ty: 4 });
    const flipped = tileToWorld(d.tx, d.ty);
    expect(flipped.x - tileToWorld(c.tx, c.ty).x).toBe(-32);
    expect(flipped.y).toBe(tileToWorld(c.tx, c.ty).y);
  });

  it('accepts clear ground, including the creek bank, and rejects either blocked tile', () => {
    const state = initialState();
    expect(shelterSpot({ tx: 7, ty: 3 }, false, state).ok).toBe(true);
    expect(shelterSpot({ tx: 0, ty: 7 }, false, state).ok).toBe(true);

    expect(shelterSpot({ tx: 0, ty: 11 }, false, state).reason).toMatch(/creek/);
    expect(shelterSpot({ tx: 11, ty: 5 }, false, state).reason).toMatch(/edge/);
    expect(shelterSpot({ tx: 6, ty: 1 }, false, state).reason).toMatch(/tree/);
    expect(shelterSpot({ tx: 2, ty: 2 }, false, state).reason).toMatch(/rock/);
    expect(shelterSpot({ tx: 1, ty: 3 }, false, state).reason).toMatch(/bush/);
    expect(shelterSpot({ tx: 8, ty: 3 }, false, state).reason).toMatch(/Pick/);
    expect(shelterSpot({ tx: 7, ty: 1 }, false, state).ok).toBe(false);

    const picked = { ...state, picked: { 'item_sticks-8-3': true as const } };
    expect(shelterSpot({ tx: 8, ty: 3 }, false, picked).ok).toBe(true);

    const standing = { ...state, tx: 7, ty: 3 };
    expect(shelterSpot({ tx: 7, ty: 3 }, false, standing).reason).toMatch(/standing/);

    const fired = {
      ...state,
      fire: { ...state.fire, ring: true },
      fireTile: { tx: 8, ty: 2 },
    };
    expect(shelterSpot({ tx: 7, ty: 3 }, false, fired).reason).toMatch(/fire/);
  });

  it('keeps a placed lean-to and a placed fire out of the path', () => {
    const sheltered = {
      ...initialState(),
      shelter: 1 as const,
      shelterAnchor: { tx: 7, ty: 3 },
      shelterFlip: false,
    };
    const foot = occupiedFrom(sheltered);
    expect(isBlocked(7, 3, foot)).toBe(true);
    expect(isBlocked(8, 2, foot)).toBe(true);
    expect(isBlocked(5, 3, foot)).toBe(false);
    const around = planRoute({ tx: 7, ty: 5 }, 7, 3, blockedFor(sheltered));
    expect(around).not.toBeNull();
    expect(around?.stand).not.toEqual({ tx: 7, ty: 3 });
    expect(around?.stand).not.toEqual({ tx: 8, ty: 2 });

    expect(fireSpot({ tx: 8, ty: 2 }, sheltered).reason).toMatch(/lean-to/);
    expect(fireSpot({ tx: 7, ty: 4 }, sheltered).ok).toBe(true);

    const fired = {
      ...initialState(),
      fire: { ...initialState().fire, ring: true },
      fireTile: { tx: 7, ty: 4 },
    };
    expect(isBlocked(7, 4, occupiedFrom(fired))).toBe(true);
    expect(isBlocked(7, 4, occupiedFrom(initialState()))).toBe(false);
  });
});
