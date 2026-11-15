import { describe, expect, it } from 'vitest';
import { placementVerdict } from '../src/game/build';
import { CHOP_ENERGY, STRIKE_ENERGY } from '../src/game/constants';
import { emptyInventory, gather, initialState, knapFlint, placePiece, strikeRock, upgradePiece } from '../src/game/rules';
import type { GameState } from '../src/game/types';
import { ROCK_HITS, stoneFromStrike } from '../src/game/stone';
import { TREE_HITS } from '../src/game/trees';
import { tileToWorld } from '../src/game/iso';

function atRock() {
  const feet = tileToWorld(1, 7);
  return {
    ...initialState(),
    ...feet,
    tx: 1,
    ty: 7,
    tool: 'hammerstone' as const,
    inventory: { ...emptyInventory(), hammerstone: true, rocks: 0 },
  };
}

describe('stone', () => {
  it('mines slower than a tree and drops six stone from a node', () => {
    expect(ROCK_HITS).toBeGreaterThan(TREE_HITS);
    expect(STRIKE_ENERGY).toBeGreaterThan(CHOP_ENERGY);
    let state: GameState = atRock();
    let stone = 0;
    for (let hit = 1; hit <= ROCK_HITS; hit++) {
      const blow = strikeRock(state, 'rock_node-1-8');
      expect(blow.ok).toBe(true);
      expect(blow.popup).toBe(`+${stoneFromStrike(hit)} stone`);
      stone += stoneFromStrike(hit);
      expect(blow.state.energy).toBe(100 - hit * STRIKE_ENERGY);
      state = blow.state;
    }
    expect(stone).toBe(6);
    expect(state.inventory.stone).toBe(6);
    expect(state.rocks['rock_node-1-8']).toBe(ROCK_HITS);
    expect(strikeRock(state, 'rock_node-1-8').message).toMatch(/rubble/i);
  });

  it('picks up a creek cobble as the hammerstone, once', () => {
    const feet = tileToWorld(2, 8);
    const stood = { ...initialState(), ...feet, tx: 2, ty: 8 };
    const taken = gather(stood, 'river_cobbles-2-8', true);
    expect(taken.ok).toBe(true);
    expect(taken.message).toBe('A hard, round cobble. Good hammerstone.');
    expect(taken.state.inventory.hammerstone).toBe(true);
    expect(taken.state.tool).toBe('hatchet');
    const again = gather({ ...taken.state, picked: {} }, 'river_cobbles-3-9', true);
    expect(again.ok).toBe(true);
    expect(again.state.inventory.wetCobble).toBe(1);
    expect(again.state.inventory.hammerstone).toBe(true);
    expect(again.state.tool).toBe(taken.state.tool);
    const third = gather({ ...again.state, picked: {} }, 'river_cobbles-2-8', true);
    expect(third.ok).toBe(true);
    expect(third.state.inventory.dryCobble).toBe(1);
  });

  it('knaps a flint core in place for two or three flakes, and stone nodes stay flake-free', () => {
    const feet = tileToWorld(4, 8);
    let state: GameState = {
      ...initialState(),
      ...feet,
      tx: 4,
      ty: 8,
      tool: 'hammerstone',
      inventory: { ...emptyInventory(), hammerstone: true },
    };
    const first = knapFlint(state, 'flint_core-4-9');
    expect(first.ok).toBe(true);
    expect(first.popup).toMatch(/^\+1 flake$/);
    state = first.state;
    const second = knapFlint(state, 'flint_core-4-9');
    expect(second.ok).toBe(true);
    expect(second.state.cores['flint_core-4-9']).toBe(2);
    expect(second.state.inventory.flakes).toBeGreaterThanOrEqual(2);
    expect(second.state.inventory.flakes).toBeLessThanOrEqual(3);
    expect(knapFlint(second.state, 'flint_core-4-9').message).toMatch(/spent/i);

    const rock = strikeRock(atRock(), 'rock_node-1-8');
    expect(rock.state.inventory.flakes).toBe(0);
    expect(rock.state.inventory.stone).toBe(1);

    const knapped = gather({ ...initialState(), ...tileToWorld(2, 8), tx: 2, ty: 8 }, 'river_cobbles-2-8', true);
    const built = placePiece(
      { ...knapped.state, inventory: { ...knapped.state.inventory, wood: 10, stone: 5 } },
      'wall',
      7,
      3,
      'se',
    );
    expect(built.ok).toBe(true);
    const upgraded = upgradePiece({ ...built.state, tool: 'hammerstone' }, built.state.pieces[0]);
    expect(upgraded.ok).toBe(true);
    expect(upgraded.message).toBe('Upgraded to stone.');
    expect(upgraded.state.pieces[0].material).toBe('stone');
    expect(upgraded.state.inventory.stone).toBe(0);
  });

  it('builds a stone foundation out of stone, not wood', () => {
    const state = {
      ...initialState(),
      inventory: { ...emptyInventory(), wood: 40, stone: 10 },
    };
    const laid = placePiece(state, 'foundation', 7, 3, 'se', 'stone');
    expect(laid.ok).toBe(true);
    expect(laid.state.inventory.wood).toBe(40);
    expect(laid.state.inventory.stone).toBe(0);
    expect(laid.state.pieces[0].material).toBe('stone');
    const feet = tileToWorld(7, 5);
    const verdict = placementVerdict('foundation', { tx: 7, ty: 3 }, 'se', { ...state, ...feet, tx: 7, ty: 5 }, feet, 'stone');
    expect(verdict.ok).toBe(true);
  });
});
