import { describe, expect, it } from 'vitest';
import { PLAYER_START } from '../src/game/constants';
import {
  addFirewood,
  blowCoal,
  craftBowdrill,
  craftKindling,
  craftTinder,
  placeFire,
  stepDrill,
  tendFires,
} from '../src/game/fire';
import { tileToWorld } from '../src/game/iso';
import { PROPS, blockedFor, groundAt } from '../src/game/map';
import { canStand, bodiesFor, gatherStand, reachFor } from '../src/game/move';
import { planRoute } from '../src/game/path';
import { emptyInventory, gather, initialState } from '../src/game/rules';
import { parseSave } from '../src/game/save';
import { chooseUse } from '../src/game/use';

function stand(tx: number, ty: number) {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, energy: 100, tool: 'hands' as const };
}

describe('the bank, a fresh fiber plant, and empty hands', () => {
  it('picks up a creek cobble from the grass bank', () => {
    expect(groundAt(5, 7)).toBe('grass');
    expect(planRoute(PLAYER_START, 5, 7, blockedFor(initialState()))).not.toBeNull();
    const state = stand(2, 8);
    expect(canStand(state.x, state.y, bodiesFor(state), [])).toBe(true);
    expect(chooseUse(state, { x: state.x, y: state.y }).action).toBe('drink-creek');
    const cobble = PROPS.find((prop) => prop.id === 'river_cobbles-2-8');
    expect(cobble).toBeTruthy();
    expect(reachFor(cobble!)).toBeGreaterThan(54);
    const standOn = gatherStand(cobble!, state);
    expect(standOn).not.toBeNull();
    const taken = gather(state, cobble!.id);
    expect(taken.ok).toBe(true);
    expect(taken.message).toBe('A hard, round cobble. Good hammerstone.');
  });

  it('starts fiber ready, and an old save does not keep cut plants', () => {
    const fresh = stand(9, 5);
    expect(fresh.plants).toEqual({});
    const cut = gather(fresh, 'bush_fiber-9-5');
    expect(cut.ok).toBe(true);
    expect(cut.state.inventory.fiber).toBeGreaterThan(0);

    const old = {
      ...initialState(),
      version: 5,
      picked: { 'bush_fiber-9-5': true },
      plants: { 'bush_fiber-9-5': 10 },
      inventory: { ...emptyInventory(), fiber: 0 },
    };
    const loaded = parseSave(JSON.stringify(old));
    expect(loaded?.plants).toEqual({});
    expect(loaded?.picked['bush_fiber-9-5']).toBeUndefined();
    const again = gather({ ...loaded!, ...tileToWorld(9, 5), tx: 9, ty: 5, energy: 100, tool: 'hands' }, 'bush_fiber-9-5');
    expect(again.ok).toBe(true);
    expect(again.state.inventory.fiber).toBeGreaterThan(0);
  });

  it('does not chop while his hands are empty', () => {
    const state = { ...stand(6, 1), tool: 'hands' as const };
    const choice = chooseUse(state, { x: state.x, y: state.y });
    expect(choice.action).not.toBe('chop');
  });
});

describe('bow drill and the teepee', () => {
  it('builds a kit from softwood and cord, then a lay, then a coal', () => {
    let state = {
      ...initialState(),
      inventory: { ...emptyInventory(), wood: 8, cordage: 2, fiber: 4 },
    };
    const bundle = craftTinder(state);
    expect(bundle.ok).toBe(true);
    state = bundle.state;
    expect(state.inventory.tinder).toBe(1);
    const sticks = craftKindling(state);
    expect(sticks.ok).toBe(true);
    state = { ...sticks.state, inventory: { ...sticks.state.inventory, kindling: 2 } };
    const kit = craftBowdrill(state);
    expect(kit.ok).toBe(true);
    expect(kit.message).toMatch(/softwood|cord/i);
    state = kit.state;
    expect(state.inventory.bowdrill).toBe(true);
    expect(state.inventory.wood).toBe(8 - 1 - 4);
    const laid = placeFire(state, 7, 4);
    expect(laid.ok).toBe(true);
    const lay = laid.state.pieces.find((piece) => piece.kind === 'fire');
    expect(lay?.lit).toBe(false);
    expect(lay?.fuel).toBe(120);

    const early = stepDrill(0.4, 0.1, false, 50);
    expect(early.result).toBe('fail');
    const done = stepDrill(0.9, 1, true, 40);
    expect(done.result).toBe('coal');
    state = { ...laid.state, inventory: { ...laid.state.inventory, coal: 1 } };
    const smoke = blowCoal(state, lay!);
    expect(smoke.message).toMatch(/smokes/);
    const flame = blowCoal(smoke.state, smoke.state.pieces.find((piece) => piece.kind === 'fire')!);
    expect(flame.ok).toBe(true);
    expect(flame.state.pieces.find((piece) => piece.kind === 'fire')?.lit).toBe(true);

    const cold = { ...flame.state, warmth: 10, ...tileToWorld(lay!.tx, lay!.ty) };
    const warm = tendFires(cold, 30);
    expect(warm.warmth).toBeGreaterThan(cold.warmth);
    const fed = addFirewood(warm, warm.pieces.find((piece) => piece.kind === 'fire')!);
    expect(fed.ok).toBe(true);
    const out = tendFires({ ...fed.state, pieces: fed.state.pieces.map((piece) => piece.kind === 'fire' ? { ...piece, fuel: 1 } : piece) }, 5);
    expect(out.pieces.find((piece) => piece.kind === 'fire')?.lit).toBe(false);
  });
});
