import { describe, expect, it } from 'vitest';
import { DAWN_MINUTES, PLAY_MINUTES_PER_SECOND, START_MINUTES } from '../src/game/constants';
import { tileToWorld } from '../src/game/iso';
import { placePiece, chopTree, gather, initialState, tick } from '../src/game/rules';
import { REGROW_MINUTES, isFelled, woodFromTree } from '../src/game/trees';

function stand(tx: number, ty: number) {
  return { ...initialState(), tx, ty, ...tileToWorld(tx, ty), energy: 100 };
}

describe('wood and the hatchet', () => {
  it('turns a stick into a little wood and sets other pickups aside', () => {
    const beside = stand(8, 4);
    const sticks = gather(beside, 'item_sticks-8-3');
    expect(sticks.ok).toBe(true);
    expect(sticks.popup).toBe('+1 Wood');
    expect(sticks.state.inventory.wood).toBe(1);

    const stone = gather(beside, 'item_stone-8-4');
    expect(stone.ok).toBe(true);
    expect(stone.state.inventory.wood).toBe(0);
    expect(stone.state.picked['item_stone-8-4']).toBe(true);
  });

  it('fells a tree in three swings and drops a few wood', () => {
    let state = stand(6, 2);
    const id = 'pine_tree-6-1';
    for (let swing = 0; swing < 2; swing++) {
      const hit = chopTree(state, id);
      expect(hit.ok).toBe(true);
      expect(hit.popup).toBeUndefined();
      expect(isFelled(hit.state.trees, id)).toBe(false);
      state = { ...hit.state, energy: 100 };
    }
    const gain = woodFromTree(id, state.minutes);
    const last = chopTree(state, id);
    expect(gain).toBeGreaterThanOrEqual(3);
    expect(gain).toBeLessThanOrEqual(5);
    expect(last.popup).toBe(`+${gain} Wood`);
    expect(last.state.inventory.wood).toBe(gain);
    expect(isFelled(last.state.trees, id)).toBe(true);
    expect(chopTree({ ...last.state, x: last.state.x, y: last.state.y, tool: 'hatchet' }, id).message).toMatch(/stump/i);
  });

  it('lets a stump grow back unless a foundation covers it', () => {
    const felled = chopTree(chopTree(chopTree(stand(6, 2), 'pine_tree-6-1').state, 'pine_tree-6-1').state, 'pine_tree-6-1').state;
    const early = tick({ ...felled, energy: 100 }, REGROW_MINUTES - 1);
    expect(isFelled(early.trees, 'pine_tree-6-1')).toBe(true);
    const grown = tick({ ...felled, energy: 100 }, REGROW_MINUTES);
    expect(isFelled(grown.trees, 'pine_tree-6-1')).toBe(false);

    const held = tick(
      {
        ...felled,
        pieces: [{ kind: 'foundation', tx: 6, ty: 1, edge: 'se' }],
      },
      REGROW_MINUTES,
    );
    expect(isFelled(held.trees, 'pine_tree-6-1')).toBe(true);
  });

  it('keeps the afternoon going after the warmth reading hits zero', () => {
    const later = tick(initialState(), 5000);
    expect(later.outcome).toBe('playing');
    expect(later.warmth).toBe(0);
  });

  it('spends wood and energy when a piece goes up', () => {
    const ready = { ...initialState(), inventory: { wood: 20 }, energy: 100 };
    const laid = placePiece(ready, 'foundation', 7, 3, 'se');
    expect(laid.ok).toBe(true);
    expect(laid.state.inventory.wood).toBe(0);
    expect(laid.state.energy).toBe(94);
    expect(laid.state.pieces).toHaveLength(1);
    expect(placePiece(laid.state, 'foundation', 8, 3, 'se').ok).toBe(false);

    const tired = placePiece({ ...initialState(), inventory: { wood: 20 }, energy: 0 }, 'foundation', 7, 3, 'se');
    expect(tired.ok).toBe(true);
    expect(tired.state.energy).toBe(0);
    expect(tired.state.pieces).toHaveLength(1);
  });

  it('lets the afternoon last long enough to raise a hut', () => {
    const realSeconds = (DAWN_MINUTES - START_MINUTES) / PLAY_MINUTES_PER_SECOND;
    expect(realSeconds).toBeGreaterThanOrEqual(20 * 60);
  });
});
