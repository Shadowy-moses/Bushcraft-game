import { describe, expect, it } from 'vitest';
import { blocksStep, floorSpot, foundationSpot, wallSpot } from '../src/game/build';
import { findPath } from '../src/game/path';
import { initialState } from '../src/game/rules';
import type { Piece } from '../src/game/types';

describe('building on the block', () => {
  it('lays the first foundation on clear ground and snaps the next one to it', () => {
    const state = initialState();
    expect(foundationSpot({ tx: 7, ty: 3 }, state).ok).toBe(true);
    expect(foundationSpot({ tx: 6, ty: 1 }, state).reason).toMatch(/tree/i);
    expect(foundationSpot({ tx: 2, ty: 2 }, state).reason).toMatch(/rock/i);
    expect(foundationSpot({ tx: 1, ty: 3 }, state).reason).toMatch(/bush/i);
    expect(foundationSpot({ tx: 0, ty: 11 }, state).reason).toMatch(/creek/i);
    expect(foundationSpot({ tx: 12, ty: 3 }, state).reason).toMatch(/edge/i);
    expect(foundationSpot({ tx: 7, ty: 5 }, state).reason).toMatch(/standing/i);
    expect(foundationSpot({ tx: 8, ty: 3 }, state).ok).toBe(true);

    const one = {
      ...state,
      pieces: [{ kind: 'foundation', tx: 7, ty: 3, edge: 'se' } as Piece],
    };
    expect(foundationSpot({ tx: 8, ty: 3 }, one).ok).toBe(true);
    expect(foundationSpot({ tx: 5, ty: 5 }, one).reason).toMatch(/Snap/);
    expect(foundationSpot({ tx: 7, ty: 3 }, one).reason).toMatch(/already/);
  });

  it('puts walls and a doorway on a foundation edge, and the floor on the walls', () => {
    const base = {
      ...initialState(),
      pieces: [{ kind: 'foundation', tx: 7, ty: 3, edge: 'se' } as Piece],
    };
    expect(wallSpot({ tx: 7, ty: 3 }, 'sw', 'wall', base).ok).toBe(true);
    expect(wallSpot({ tx: 5, ty: 5 }, 'se', 'doorway', base).reason).toMatch(/foundation/i);
    expect(floorSpot({ tx: 7, ty: 3 }, base).reason).toMatch(/wall/i);

    const walled = {
      ...base,
      pieces: [...base.pieces, { kind: 'wall', tx: 7, ty: 3, edge: 'ne' } as Piece],
    };
    expect(floorSpot({ tx: 7, ty: 3 }, walled).ok).toBe(true);
    expect(wallSpot({ tx: 7, ty: 3 }, 'ne', 'doorway', walled).reason).toMatch(/already/i);
  });

  it('lets a doorway through and stops a solid wall', () => {
    const from = { tx: 7, ty: 3 };
    const to = { tx: 8, ty: 3 };
    const wall = [{ kind: 'wall', tx: 7, ty: 3, edge: 'se' } as Piece];
    const door = [{ kind: 'doorway', tx: 7, ty: 3, edge: 'se' } as Piece];
    const open = () => false;
    expect(blocksStep(wall, from, to)).toBe(true);
    expect(blocksStep(wall, to, from)).toBe(true);
    const around = findPath(from, to, open, (a, b) => blocksStep(wall, a, b));
    expect(around).not.toBeNull();
    expect(around![0]).not.toEqual(to);
    expect(blocksStep(door, from, to)).toBe(false);
    expect(findPath(from, to, open, (a, b) => blocksStep(door, a, b))).toEqual([to]);
  });
});
