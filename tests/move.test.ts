import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import {
  PLAYER_RADIUS,
  TRUNK_RADIUS,
  approachPoint,
  canStand,
  bodiesFor,
  inReach,
  resolveMove,
  segmentsFor,
} from '../src/game/move';
import { initialState } from '../src/game/rules';
import type { Piece } from '../src/game/types';

describe('free movement', () => {
  it('stops at a trunk and slides along it', () => {
    const tree = tileToWorld(6, 1);
    const bodies = bodiesFor(initialState());
    const start = { x: tree.x, y: tree.y + TRUNK_RADIUS + PLAYER_RADIUS + 4 };
    expect(canStand(start.x, start.y, bodies, [])).toBe(true);
    const into = resolveMove(start.x, start.y, 0, -(TRUNK_RADIUS + 8), bodies, []);
    expect(Math.hypot(into.x - tree.x, into.y - tree.y)).toBeGreaterThan(TRUNK_RADIUS + PLAYER_RADIUS - 0.2);
    const slide = resolveMove(start.x, start.y, 12, -8, bodies, []);
    expect(slide.x).toBeGreaterThan(start.x);
  });

  it('keeps him out of the creek', () => {
    const dry = tileToWorld(2, 9);
    const wet = tileToWorld(2, 10);
    const bodies = bodiesFor(initialState());
    expect(canStand(dry.x, dry.y, bodies, [])).toBe(true);
    expect(canStand(wet.x, wet.y, bodies, [])).toBe(false);
    const stopped = resolveMove(dry.x, dry.y, wet.x - dry.x, wet.y - dry.y, bodies, []);
    expect(canStand(stopped.x, stopped.y, bodies, [])).toBe(true);
  });

  it('blocks a solid wall and leaves the doorway gap open', () => {
    const wall: Piece[] = [{ kind: 'wall', tx: 7, ty: 3, edge: 'sw' }];
    const door: Piece[] = [{ kind: 'doorway', tx: 7, ty: 3, edge: 'sw' }];
    const center = tileToWorld(7, 3);
    const mid = { x: center.x - 8, y: center.y + 4 };
    const south = { x: mid.x, y: mid.y + 6 };
    const north = { x: mid.x, y: mid.y - 6 };
    expect(resolveMove(south.x, south.y, 0, north.y - south.y, [], segmentsFor(wall)).y).toBeGreaterThan(mid.y);
    const through = resolveMove(south.x, south.y, 0, north.y - south.y, [], segmentsFor(door));
    expect(through.y).toBeLessThan(mid.y);
    expect(inReach(south.x, south.y, 7, 3)).toBe(true);
  });

  it('can stand beside every tree on the block', () => {
    const state = { ...initialState(), pieces: [] as Piece[] };
    for (const prop of PROPS) {
      if (prop.kind !== 'pine_tree' && prop.kind !== 'birch_tree') continue;
      const spot = approachPoint(prop, state);
      expect(spot, prop.id).not.toBeNull();
      expect(inReach(spot!.x, spot!.y, prop.tx, prop.ty)).toBe(true);
    }
  });
});
