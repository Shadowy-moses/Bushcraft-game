import { describe, expect, it } from 'vitest';
import { placePiece, chopTree, gather, initialState, tick } from '../src/game/rules';
import { isFelled } from '../src/game/trees';

describe('wood and the hatchet', () => {
  it('turns a stick into a little wood and sets other pickups aside', () => {
    const beside = { ...initialState(), tx: 8, ty: 4 };
    const sticks = gather(beside, 'item_sticks-8-3');
    expect(sticks.ok).toBe(true);
    expect(sticks.popup).toBe('+1 Wood');
    expect(sticks.state.inventory.wood).toBe(1);

    const stone = gather(beside, 'item_stone-8-4');
    expect(stone.ok).toBe(true);
    expect(stone.state.inventory.wood).toBe(0);
    expect(stone.state.picked['item_stone-8-4']).toBe(true);
  });

  it('fells a tree in three swings and drops ten wood', () => {
    let state = { ...initialState(), tx: 6, ty: 2, energy: 100 };
    const id = 'pine_tree-6-1';
    for (let swing = 0; swing < 2; swing++) {
      const hit = chopTree(state, id);
      expect(hit.ok).toBe(true);
      expect(hit.popup).toBeUndefined();
      expect(isFelled(hit.state.trees, id)).toBe(false);
      state = { ...hit.state, energy: 100 };
    }
    const last = chopTree(state, id);
    expect(last.popup).toBe('+10 Wood');
    expect(last.state.inventory.wood).toBe(10);
    expect(isFelled(last.state.trees, id)).toBe(true);
    expect(chopTree({ ...last.state, tool: 'plan' }, id).ok).toBe(false);
  });

  it('lets a stump grow back unless a foundation covers it', () => {
    const felled = chopTree(chopTree(chopTree({ ...initialState(), tx: 6, ty: 2, energy: 100 }, 'pine_tree-6-1').state, 'pine_tree-6-1').state, 'pine_tree-6-1').state;
    const grown = tick({ ...felled, energy: 100 }, 90);
    expect(isFelled(grown.trees, 'pine_tree-6-1')).toBe(false);

    const held = tick(
      {
        ...felled,
        pieces: [{ kind: 'foundation', tx: 6, ty: 1, edge: 'se' }],
      },
      90,
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
  });
});
