import { describe, expect, it } from 'vitest';
import { PLAYER_START } from '../src/game/constants';
import { besideCreek } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { GRAVEL_LANDINGS, PROPS, blockedFor, groundAt } from '../src/game/map';
import { bodiesFor, canStand, reachFor, resolveMove } from '../src/game/move';
import { findPath } from '../src/game/path';
import { initialState } from '../src/game/rules';

describe('the creek bank', () => {
  it('walks from spawn onto a gravel landing where he can fill or drink', () => {
    expect(GRAVEL_LANDINGS.length).toBeGreaterThanOrEqual(3);
    const blocked = blockedFor(initialState());
    const bodies = bodiesFor(initialState());
    const drinkable = GRAVEL_LANDINGS.filter((tile) => {
      expect(groundAt(tile.tx, tile.ty)).toBe('creek_gravel');
      const at = tileToWorld(tile.tx, tile.ty);
      return besideCreek(at.x, at.y) && canStand(at.x, at.y, bodies, []);
    });
    expect(drinkable.length).toBeGreaterThanOrEqual(2);
    const goal = drinkable[0];
    const path = findPath(PLAYER_START, goal, blocked);
    expect(path).not.toBeNull();
    let pos = tileToWorld(PLAYER_START.tx, PLAYER_START.ty);
    for (const step of path ?? []) {
      const at = tileToWorld(step.tx, step.ty);
      let arrived = false;
      for (let i = 0; i < 40; i++) {
        const dx = at.x - pos.x;
        const dy = at.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) {
          arrived = true;
          break;
        }
        pos = resolveMove(pos.x, pos.y, (dx / dist) * 6, (dy / dist) * 6, bodies, []);
      }
      expect(arrived, `${step.tx},${step.ty}`).toBe(true);
    }
    expect(besideCreek(pos.x, pos.y)).toBe(true);
  });

  it('keeps every cobble pile reachable from spawn', () => {
    const blocked = blockedFor(initialState());
    const bodies = bodiesFor(initialState());
    const cobbles = PROPS.filter((prop) => prop.kind === 'river_cobbles');
    expect(cobbles.length).toBeGreaterThanOrEqual(3);
    for (const cobble of cobbles) {
      const at = tileToWorld(cobble.tx, cobble.ty);
      const reach = reachFor(cobble);
      let found = false;
      for (let ty = cobble.ty - 2; ty <= cobble.ty + 2; ty++) {
        for (let tx = cobble.tx - 2; tx <= cobble.tx + 2; tx++) {
          if (blocked(tx, ty)) continue;
          const stand = tileToWorld(tx, ty);
          if (!canStand(stand.x, stand.y, bodies, [])) continue;
          if (Math.hypot(stand.x - at.x, stand.y - at.y) > reach) continue;
          const path = findPath(PLAYER_START, { tx, ty }, blocked);
          if (path) found = true;
        }
      }
      expect(found, cobble.id).toBe(true);
    }
  });
});
