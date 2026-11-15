import { describe, expect, it } from 'vitest';
import { pieceFrame } from '../src/game/build';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { coverTripod, initialState, repairPiece, tick } from '../src/game/rules';
import { chooseUse, repairPrompt } from '../src/game/use';
import type { Piece } from '../src/game/types';

describe('weather on a twig wall', () => {
  it('shows the worn look after a day and offers a one-wood repair', () => {
    const wall: Piece = { kind: 'wall', tx: 7, ty: 4, edge: 'se', material: 'twig', health: 100 };
    let state = { ...initialState(), pieces: [wall], inventory: { ...initialState().inventory, wood: 4 } };
    for (let step = 0; step < 48; step++) state = tick(state, 30);
    const worn = state.pieces.find((piece) => piece.kind === 'wall');
    expect(worn).toBeTruthy();
    expect(worn!.health ?? 100).toBeLessThanOrEqual(50);
    expect(worn!.health ?? 0).toBeGreaterThan(0);
    expect(pieceFrame('wall', worn!.edge, null, 'twig', true)).toMatch(/_worn$/);
    const feet = tileToWorld(worn!.tx, worn!.ty);
    const peeled = Object.fromEntries(
      PROPS.filter((prop) => prop.kind === 'birch_tree').map((prop) => [prop.id, state.minutes]),
    );
    const here = {
      ...state,
      ...feet,
      tx: worn!.tx,
      ty: worn!.ty,
      tool: 'hands' as const,
      picked: Object.fromEntries(PROPS.map((prop) => [prop.id, true as const])),
      plants: { ...state.plants, ...peeled },
    };
    expect(repairPrompt(here, feet)).toBe('Repair (1 wood)');
    expect(chooseUse(here, feet).action).toBe('repair');
    const patched = repairPiece(here, worn!);
    expect(patched.ok).toBe(true);
    expect(patched.state.inventory.wood).toBe(here.inventory.wood - 1);
    expect(patched.state.pieces[0].health ?? 0).toBeGreaterThan(worn!.health ?? 0);
  });

  it('lets a new tripod cover replace the old one and refunds nothing', () => {
    const tripod: Piece = { kind: 'tripod', tx: 7, ty: 3, edge: 'se', cover: 'boughs' };
    const before = {
      ...initialState(),
      pieces: [tripod],
      inventory: { ...initialState().inventory, wood: 8, cordage: 4, fiber: 6 },
    };
    const next = coverTripod(before, tripod, 'bark');
    expect(next.ok).toBe(true);
    expect(next.state.pieces[0].cover).toBe('bark');
    expect(next.state.inventory.wood).toBeLessThan(before.inventory.wood);
    expect(next.state.inventory.fiber).toBe(before.inventory.fiber);
    expect(next.message).toMatch(/replaces/);
    expect(coverTripod(next.state, next.state.pieces[0], 'bark').ok).toBe(false);
  });
});
