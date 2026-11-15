import { describe, expect, it } from 'vitest';
import { tileToWorld, worldToTile } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import {
  PLAYER_RADIUS,
  TRUNK_RADIUS,
  approachPoint,
  bodiesFor,
  canStand,
  escapeEnclosure,
  inReach,
  offIsland,
  resolveMove,
  segmentsFor,
  travelSpeed,
} from '../src/game/move';
import { initialState, upgradePiece } from '../src/game/rules';
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
      const at = tileToWorld(prop.tx, prop.ty);
      const spot = approachPoint(prop, state);
      if (offIsland(at.x, at.y)) {
        if (spot) {
          expect(offIsland(spot.x, spot.y), prop.id).toBe(false);
          expect(inReach(spot.x, spot.y, prop.tx, prop.ty)).toBe(true);
        }
        continue;
      }
      expect(spot, prop.id).not.toBeNull();
      expect(inReach(spot!.x, spot!.y, prop.tx, prop.ty)).toBe(true);
    }
  });

  it('keeps him on the island when he walks at the rim', () => {
    const bodies = bodiesFor(initialState());
    const start = tileToWorld(2, 6);
    expect(canStand(start.x, start.y, bodies, [])).toBe(true);
    const pushed = resolveMove(start.x, start.y, -500, -200, bodies, []);
    expect(offIsland(pushed.x, pushed.y)).toBe(false);
    expect(canStand(pushed.x, pushed.y, bodies, [])).toBe(true);
    const tile = worldToTile(pushed.x, pushed.y);
    expect(tile.tx).toBeGreaterThanOrEqual(1);
    expect(tile.tx).toBeLessThanOrEqual(10);
    expect(tile.ty).toBeGreaterThanOrEqual(1);
    expect(tile.ty).toBeLessThanOrEqual(10);
    expect(offIsland(tileToWorld(0, 6).x, tileToWorld(0, 6).y)).toBe(true);
    expect(offIsland(start.x - 200, start.y)).toBe(true);
  });

  it('nudges him out through the doorway when the hut has no way through', () => {
    const center = tileToWorld(7, 3);
    const pieces: Piece[] = [
      { kind: 'foundation', tx: 7, ty: 3, edge: 'se' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'se' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'sw' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'ne' },
      { kind: 'doorway', tx: 7, ty: 3, edge: 'nw' },
    ];
    const state = { ...initialState(), x: center.x, y: center.y, pieces };
    const bodies = bodiesFor(state);
    const walls = segmentsFor(pieces);
    const out = escapeEnclosure(state);
    expect(canStand(out.x, out.y, bodies, walls)).toBe(true);
    const again = escapeEnclosure({ ...state, x: out.x, y: out.y });
    expect(again).toEqual({ x: out.x, y: out.y });
    const door = tileToWorld(7, 3);
    const gap = { x: door.x - 8, y: door.y - 4 };
    const outside = { x: gap.x - 16, y: gap.y - 8 };
    const shoved = resolveMove(out.x, out.y, outside.x - out.x, outside.y - out.y, bodies, walls);
    const clear = Math.hypot(shoved.x - outside.x, shoved.y - outside.y) < 8 || Math.hypot(out.x - outside.x, out.y - outside.y) < 8;
    expect(clear).toBe(true);
  });

  it('nudges him off a wall he is standing inside', () => {
    const center = tileToWorld(7, 3);
    const onWall = { x: center.x + 8, y: center.y + 4 };
    const pieces: Piece[] = [{ kind: 'wall', tx: 7, ty: 3, edge: 'se' }];
    const state = { ...initialState(), ...onWall, pieces };
    const bodies = bodiesFor(state);
    const walls = segmentsFor(pieces);
    expect(canStand(onWall.x, onWall.y, bodies, walls)).toBe(false);
    const out = escapeEnclosure(state);
    expect(canStand(out.x, out.y, bodies, walls)).toBe(true);
    expect(Math.hypot(out.x - onWall.x, out.y - onWall.y)).toBeGreaterThan(1);
  });

  it('does not change the collider when a twig wall is upgraded to stone', () => {
    const pieces: Piece[] = [
      { kind: 'foundation', tx: 7, ty: 3, edge: 'se' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'se', material: 'twig' },
      { kind: 'doorway', tx: 7, ty: 3, edge: 'sw', material: 'twig' },
    ];
    const stone = pieces.map((piece) => ({ ...piece, material: 'stone' as const }));
    expect(segmentsFor(stone)).toEqual(segmentsFor(pieces));
    const center = tileToWorld(7, 3);
    const state = {
      ...initialState(),
      x: center.x,
      y: center.y,
      tool: 'hammerstone' as const,
      inventory: { ...initialState().inventory, hammerstone: true, stone: 20 },
      pieces,
    };
    const upgraded = upgradePiece(state, pieces[1]);
    expect(upgraded.ok).toBe(true);
    expect(segmentsFor(upgraded.state.pieces)).toEqual(segmentsFor(pieces));
    expect(upgraded.state.x).toBeCloseTo(center.x);
    expect(upgraded.state.y).toBeCloseTo(center.y);
    expect(upgraded.state.pieces[1].material).toBe('stone');
  });

  it('walks on a short stick and runs when it is pushed out', () => {
    const walk = travelSpeed(0.4);
    const run = travelSpeed(1);
    expect(walk.running).toBe(false);
    expect(run.running).toBe(true);
    expect(run.speed).toBeGreaterThan(walk.speed * 1.5);
  });
});
