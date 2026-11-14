import { describe, expect, it } from 'vitest';
import { placementVerdict } from '../src/game/build';
import { CHOP_ENERGY, STRIKE_ENERGY } from '../src/game/constants';
import { emptyInventory, initialState, knapHammerstone, placePiece, strikeRock, upgradePiece } from '../src/game/rules';
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

  it('knaps a hammerstone from two rocks and upgrades a twig wall', () => {
    const bare = knapHammerstone(initialState());
    expect(bare.ok).toBe(false);
    expect(bare.message).toBe('Need 2 more rock');
    const knapped = knapHammerstone({
      ...initialState(),
      inventory: { ...emptyInventory(), rocks: 2 },
    });
    expect(knapped.ok).toBe(true);
    expect(knapped.state.inventory.hammerstone).toBe(true);
    expect(knapped.state.inventory.rocks).toBe(0);
    expect(knapped.state.tool).toBe('hammerstone');

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
