import { describe, expect, it } from 'vitest';
import { tripodSpot } from '../src/game/build';
import { REST_ENERGY_PER_SECOND, TRIPOD_CORDAGE, TRIPOD_REST_BONUS, TRIPOD_WOOD } from '../src/game/constants';
import { CORD_FIBER, FIBER_REGROW_MINUTES, fiberFromPlant } from '../src/game/fiber';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { bodiesFor, TRIPOD_RADIUS } from '../src/game/move';
import {
  beginCordage,
  besideTripod,
  finishCordage,
  gather,
  initialState,
  placePiece,
  restEnergyPerSecond,
  tick,
} from '../src/game/rules';
import type { GameState } from '../src/game/types';
function stand(tx: number, ty: number): GameState {
  return { ...initialState(), tx, ty, ...tileToWorld(tx, ty), energy: 100, tool: 'hands' };
}

describe('fiber, cordage, and the tripod', () => {
  it('strips a plant for two or three fiber and leaves stubble that regrows', () => {
    const plants = PROPS.filter((prop) => prop.kind === 'bush_fiber');
    expect(plants.length).toBeGreaterThanOrEqual(7);
    const id = 'bush_fiber-1-3';
    const gained = fiberFromPlant(id);
    expect(gained).toBeGreaterThanOrEqual(2);
    expect(gained).toBeLessThanOrEqual(3);
    const cut = gather(stand(1, 4), id);
    expect(cut.ok).toBe(true);
    expect(cut.popup).toBe(`+${gained} fiber`);
    expect(cut.state.inventory.fiber).toBe(gained);
    expect(cut.state.plants[id]).toBe(cut.state.minutes);
    const again = gather(cut.state, id);
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/stubble/i);
    const grown = tick(cut.state, FIBER_REGROW_MINUTES);
    expect(grown.plants[id]).toBeUndefined();
    const second = gather({ ...grown, energy: 100, tool: 'hands' }, id);
    expect(second.ok).toBe(true);
    expect(second.state.inventory.fiber).toBe(gained * 2);
  });

  it('twists three fiber into one cord, then lashes a tripod that blocks and rests', () => {
    let state = { ...stand(7, 4), inventory: { ...initialState().inventory, fiber: CORD_FIBER, wood: TRIPOD_WOOD } };
    const started = beginCordage(state);
    expect(started.ok).toBe(true);
    expect(started.state.inventory.fiber).toBe(0);
    const cord = finishCordage(started.state);
    expect(cord.inventory.cordage).toBe(1);
    expect(cord.tip).toBe('You reverse-wrap the fibers into cord.');
    const short = beginCordage(cord);
    expect(short.ok).toBe(false);

    state = { ...cord, inventory: { ...cord.inventory, cordage: TRIPOD_CORDAGE, wood: TRIPOD_WOOD } };
    expect(tripodSpot({ tx: 7, ty: 3 }, { ...state, pieces: [{ kind: 'foundation', tx: 7, ty: 3, edge: 'se' }] }).reason).toMatch(/open ground/i);
    expect(tripodSpot({ tx: 6, ty: 1 }, state).reason).toMatch(/tree/i);
    const placed = placePiece(state, 'tripod', 8, 4, 'se');
    expect(placed.ok).toBe(true);
    expect(placed.state.inventory.wood).toBe(0);
    expect(placed.state.inventory.cordage).toBe(0);
    expect(placed.state.pieces).toEqual([{ kind: 'tripod', tx: 8, ty: 4, edge: 'se' }]);
    const bodies = bodiesFor(placed.state);
    expect(bodies.some((body) => body.id === 'tripod-8-4' && body.r === TRIPOD_RADIUS)).toBe(true);
    const beside = { ...placed.state, ...tileToWorld(8, 5), tx: 8, ty: 5 };
    expect(besideTripod(beside)).toBe(true);
    expect(restEnergyPerSecond(beside)).toBeCloseTo(REST_ENERGY_PER_SECOND * (1 + TRIPOD_REST_BONUS));
    expect(besideTripod({ ...placed.state, ...tileToWorld(4, 4), tx: 4, ty: 4 })).toBe(false);
  });
});
