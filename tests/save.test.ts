import { describe, expect, it, vi } from 'vitest';
import { tileToWorld } from '../src/game/iso';
import { OPENING_TIP } from '../src/game/copy';
import { bodiesFor, canStand, segmentsFor } from '../src/game/move';
import { initialState } from '../src/game/rules';
import { SAVE_BACKUP_KEY, SAVE_KEY } from '../src/game/constants';
import { loadGame, parseSave, saveGame } from '../src/game/save';
import type { Piece } from '../src/game/types';

describe('saved games', () => {
  it('turns an older night into a fresh build and keeps where he stood', () => {
    const v1 = {
      version: 1,
      minutes: 1000,
      warmth: 50,
      energy: 40,
      tx: 7,
      ty: 4,
      faceLeft: true,
      inventory: { sticks: 1, stones: 2, fiber: 0, cordage: 1, tinder: 0, leaves: 0 },
      shelter: 2,
      cordageTwisted: false,
      fire: { ring: true, tinder: false, kindling: false, lay: 'none', lit: false },
      picked: { 'item_sticks-8-3': true },
      outcome: 'playing',
      tip: 'hi',
    };
    const migrated = parseSave(JSON.stringify(v1));
    expect(migrated?.version).toBe(7);
    expect(migrated?.tx).toBe(7);
    expect(migrated?.ty).toBe(4);
    expect(migrated?.facing).toBe('sw');
    expect(migrated?.tool).toBe('hatchet');
    expect(migrated?.inventory.wood).toBe(0);
    expect(migrated?.pieces).toEqual([]);
    expect(migrated?.picked['item_sticks-8-3']).toBe(true);
    expect(migrated?.tip).toBe(OPENING_TIP);
  });

  it('keeps a version-3 build', () => {
    const placed = {
      ...initialState(),
      inventory: { ...initialState().inventory, wood: 30 },
      pieces: [{ kind: 'foundation' as const, tx: 7, ty: 3, edge: 'se' as const }],
      trees: { 'pine_tree-6-1': { hits: 3, felledAt: 1000 } },
    };
    expect(parseSave(JSON.stringify(placed))).toMatchObject({
      inventory: { ...initialState().inventory, wood: 30 },
      pieces: [{ kind: 'foundation', tx: 7, ty: 3, edge: 'se' }],
      trees: { 'pine_tree-6-1': { hits: 3, felledAt: 1000 } },
    });
    expect(parseSave('not json')).toBeNull();
  });

  it('stands him outside a closed hut when the save loads', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    const center = tileToWorld(7, 3);
    const pieces: Piece[] = [
      { kind: 'foundation', tx: 7, ty: 3, edge: 'se' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'se' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'sw' },
      { kind: 'wall', tx: 7, ty: 3, edge: 'ne' },
      { kind: 'doorway', tx: 7, ty: 3, edge: 'nw' },
    ];
    const trapped = { ...initialState(), x: center.x + 8, y: center.y + 4, pieces };
    saveGame(trapped);
    expect(memory.get(SAVE_KEY)).toBeTruthy();
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const bodies = bodiesFor(loaded!);
    const walls = segmentsFor(loaded!.pieces);
    expect(canStand(loaded!.x, loaded!.y, bodies, walls)).toBe(true);
    expect(canStand(trapped.x, trapped.y, bodies, walls)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('saves, reloads, and falls back to the backup when the main slot is corrupt', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    const first = { ...initialState(), minutes: 1100, inventory: { ...initialState().inventory, wood: 9 } };
    saveGame(first);
    const again = { ...initialState(), minutes: 1200, inventory: { ...initialState().inventory, wood: 15 } };
    saveGame(again);
    expect(memory.has(SAVE_BACKUP_KEY)).toBe(true);
    const reloaded = loadGame();
    expect(reloaded?.minutes).toBe(1200);
    expect(reloaded?.inventory.wood).toBe(15);
    expect(reloaded?.version).toBe(7);
    memory.set(SAVE_KEY, '{not json');
    const fallback = loadGame();
    expect(fallback?.minutes).toBe(1100);
    expect(fallback?.inventory.wood).toBe(9);
    expect(memory.get(SAVE_KEY)).toBe('{not json');
    vi.unstubAllGlobals();
  });

  it('migrates a version-6 night into the current envelope', () => {
    const older = {
      version: 6,
      minutes: 1300,
      warmth: 70,
      energy: 55,
      health: 90,
      hunger: 40,
      thirst: 30,
      tx: 6,
      ty: 5,
      x: 12,
      y: 40,
      facing: 'se',
      tool: 'hands',
      inventory: { wood: 4, stone: 2, fiber: 1, cordage: 0 },
      pieces: [],
      trees: {},
      picked: {},
      outcome: 'playing',
      tip: 'Still here.',
    };
    const migrated = parseSave(JSON.stringify(older));
    expect(migrated?.version).toBe(7);
    expect(migrated?.inventory.wood).toBe(4);
    expect(migrated?.inventory.axe).toBe(false);
    expect(migrated?.inventory.bowl).toBe(false);
    expect(migrated?.bowlWater).toBe('empty');
    expect(migrated?.tool).toBe('hands');
  });
});
