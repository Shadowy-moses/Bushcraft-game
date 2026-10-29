import { describe, expect, it } from 'vitest';
import { blocksStep, floorSpot, foundationSpot, pieceFrame, placementVerdict, wallSpot } from '../src/game/build';
import { tileToWorld } from '../src/game/iso';
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

  it('places a doorway in reach even when walls close the path', () => {
    const feet = tileToWorld(7, 5);
    const state = {
      ...initialState(),
      ...feet,
      tx: 7,
      ty: 5,
      inventory: { wood: 20 },
      pieces: [
        { kind: 'foundation', tx: 7, ty: 3, edge: 'se' },
        { kind: 'wall', tx: 7, ty: 3, edge: 'se' },
        { kind: 'wall', tx: 7, ty: 3, edge: 'sw' },
        { kind: 'wall', tx: 7, ty: 3, edge: 'nw' },
      ] as Piece[],
    };
    const door = placementVerdict('doorway', { tx: 7, ty: 3 }, 'ne', state, feet);
    expect(door.ok).toBe(true);
    const treeInTheWay = placementVerdict('foundation', { tx: 8, ty: 3 }, 'se', state, feet);
    expect(treeInTheWay.ok).toBe(true);
  });

  it('uses one reason for short wood and for a ghost that is out of reach', () => {
    const feet = tileToWorld(7, 5);
    const here = { ...initialState(), ...feet, tx: 7, ty: 5 };
    expect(placementVerdict('foundation', { tx: 8, ty: 3 }, 'se', here, feet).reason).toBe('Need 10 more wood');
    const stocked = { ...here, inventory: { wood: 40 } };
    const far = placementVerdict('foundation', { tx: 1, ty: 8 }, 'se', stocked, feet);
    expect(far.ok).toBe(false);
    expect(far.reason).toBe("Can't reach that spot");
  });

  it('picks the atlas frame for each piece and its ghost', () => {
    expect(pieceFrame('foundation', 'se')).toBe('twig_foundation');
    expect(pieceFrame('foundation', 'se', 'ok')).toBe('twig_foundation_ghost_ok');
    expect(pieceFrame('floor', 'se', 'bad')).toBe('twig_floor_ghost_bad');
    expect(pieceFrame('wall', 'ne')).toBe('twig_wall_ne');
    expect(pieceFrame('wall', 'sw')).toBe('twig_wall_ne');
    expect(pieceFrame('wall', 'nw', 'ok')).toBe('twig_wall_nw_ghost_ok');
    expect(pieceFrame('doorway', 'se', 'bad')).toBe('twig_door_nw_ghost_bad');
    expect(pieceFrame('doorway', 'ne')).toBe('twig_door_ne');
  });
});
