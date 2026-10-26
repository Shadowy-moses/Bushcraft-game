import { describe, expect, it } from 'vitest';
import { FIRE_TILE, SHELTER_TILES } from '../src/game/constants';
import { parseSave } from '../src/game/save';
import { initialState } from '../src/game/rules';

describe('saved games', () => {
  it('rebuilds a version-1 camp on the old clearing', () => {
    const v1 = {
      version: 1,
      minutes: 1000,
      warmth: 50,
      energy: 40,
      tx: 7,
      ty: 4,
      faceLeft: false,
      inventory: { sticks: 1, stones: 2, fiber: 0, cordage: 1, tinder: 0, leaves: 0 },
      shelter: 2,
      cordageTwisted: false,
      fire: { ring: true, tinder: false, kindling: false, lay: 'none', lit: false },
      picked: {},
      outcome: 'playing',
      tip: 'hi',
    };
    const migrated = parseSave(JSON.stringify(v1));
    expect(migrated?.version).toBe(2);
    expect(migrated?.shelterAnchor).toEqual({ tx: SHELTER_TILES[0].tx, ty: SHELTER_TILES[0].ty });
    expect(migrated?.shelterFlip).toBe(false);
    expect(migrated?.fireTile).toEqual(FIRE_TILE);
    expect(migrated?.facing).toBe('se');
    expect(parseSave(JSON.stringify({ ...v1, faceLeft: true }))?.facing).toBe('sw');

    const untouched = {
      ...v1,
      shelter: 0,
      fire: { ring: false, tinder: false, kindling: false, lay: 'none', lit: false },
    };
    const fresh = parseSave(JSON.stringify(untouched));
    expect(fresh?.shelterAnchor).toBeNull();
    expect(fresh?.fireTile).toBeNull();
  });

  it('keeps a version-2 placement', () => {
    const placed = {
      ...initialState(),
      shelter: 1 as const,
      shelterAnchor: { tx: 7, ty: 3 },
      shelterFlip: true,
      fireTile: { tx: 4, ty: 5 },
    };
    expect(parseSave(JSON.stringify(placed))).toMatchObject({
      shelterAnchor: { tx: 7, ty: 3 },
      shelterFlip: true,
      fireTile: { tx: 4, ty: 5 },
    });
    expect(parseSave('not json')).toBeNull();
  });
});
