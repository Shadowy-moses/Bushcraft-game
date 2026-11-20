import { describe, expect, it } from 'vitest';
import { PLAYER_START, RAW_THIRST } from '../src/game/constants';
import { drinkCreek, scoopCreek } from '../src/game/food';
import { tileToWorld } from '../src/game/iso';
import { GRAVEL_LANDINGS, PROPS, blockedFor } from '../src/game/map';
import { REACH, bodiesFor, canStand, resolveMove } from '../src/game/move';
import { findPath } from '../src/game/path';
import { emptyInventory, initialState } from '../src/game/rules';
import { chooseUse, drinkPrompt, rankedActions } from '../src/game/use';

function walkTo(tx: number, ty: number) {
  const path = findPath(PLAYER_START, { tx, ty }, blockedFor(initialState()));
  expect(path, `${tx},${ty}`).not.toBeNull();
  const bodies = bodiesFor(initialState());
  let pos = tileToWorld(PLAYER_START.tx, PLAYER_START.ty);
  for (const step of path ?? []) {
      const at = tileToWorld(step.tx, step.ty);
      for (let i = 0; i < 40; i++) {
        const dx = at.x - pos.x;
        const dy = at.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 12) break;
        const next = resolveMove(pos.x, pos.y, (dx / dist) * 6, (dy / dist) * 6, bodies, []);
        if (Math.hypot(next.x - pos.x, next.y - pos.y) < 0.2) break;
        pos = next;
      }
  }
  return pos;
}

describe('drinking at the gravel', () => {
  it('drinks at every landing before it gathers, and the thirst goes up', () => {
    expect(GRAVEL_LANDINGS).toEqual([
      { tx: 2, ty: 9 },
      { tx: 9, ty: 9 },
      { tx: 5, ty: 11 },
    ]);
    for (const landing of GRAVEL_LANDINGS) {
      const pos = walkTo(landing.tx, landing.ty);
      expect(canStand(pos.x, pos.y, bodiesFor(initialState()), [])).toBe(true);
      const state = {
        ...initialState(),
        ...pos,
        tx: landing.tx,
        ty: landing.ty,
        tool: 'hands' as const,
        thirst: 20,
        inventory: { ...emptyInventory(), berries: 2, roots: 2 },
      };
      const ranked = rankedActions(state, pos);
      const besideCobble = PROPS.some(
        (prop) => prop.kind === 'river_cobbles' && Math.max(Math.abs(prop.tx - landing.tx), Math.abs(prop.ty - landing.ty)) <= 1,
      );
      if (besideCobble) {
        expect(ranked.primary.action).toBe('gather');
        expect(ranked.next?.action).toBe('drink-creek');
      } else {
        expect(drinkPrompt(state, pos)).toBe('Drink');
        expect(ranked.primary.action).toBe('drink-creek');
      }
      const choice = chooseUse(state, pos);
      expect(choice.action === 'drink-creek' || choice.action === 'gather').toBe(true);
      const drunk = drinkCreek({ ...state, x: pos.x, y: pos.y }, () => 1);
      expect(drunk.ok).toBe(true);
      expect(drunk.state.thirst).toBe(20 + RAW_THIRST);
      expect(drunk.state.inventory.berries).toBe(2);
      expect(drunk.state.inventory.roots).toBe(2);
    }
  });

  it('fills the bark pot from a landing, and cattails are not in reach of one', () => {
    const landing = GRAVEL_LANDINGS[0];
    const pos = walkTo(landing.tx, landing.ty);
    const state = {
      ...initialState(),
      ...pos,
      tx: landing.tx,
      ty: landing.ty,
      tool: 'hands' as const,
      inventory: { ...emptyInventory(), pot: 3 },
    };
    const ranked = rankedActions(state, pos);
    expect(ranked.primary.action).toBe('gather');
    expect(ranked.next?.action).toBe('scoop');
    const filled = scoopCreek({ ...state, x: pos.x, y: pos.y });
    expect(filled.ok).toBe(true);
    expect(filled.state.cupWater).toBe('raw');
    for (const cattail of PROPS.filter((prop) => prop.kind === 'cattails')) {
      const at = tileToWorld(cattail.tx, cattail.ty);
      for (const spot of GRAVEL_LANDINGS) {
        const feet = tileToWorld(spot.tx, spot.ty);
        expect(Math.hypot(at.x - feet.x, at.y - feet.y)).toBeGreaterThan(REACH);
      }
    }
  });
});
