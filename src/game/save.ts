import { FIRE_TILE, SAVE_KEY, SHELTER_TILES } from './constants';
import type { FireState, GameState, Outcome, ShelterStage, Tile } from './types';
import { storage } from '../platform/storage';

interface RawSave {
  version?: unknown;
  minutes?: unknown;
  warmth?: unknown;
  energy?: unknown;
  tx?: unknown;
  ty?: unknown;
  faceLeft?: unknown;
  inventory?: Partial<GameState['inventory']> | null;
  shelter?: unknown;
  shelterAnchor?: unknown;
  shelterFlip?: unknown;
  fireTile?: unknown;
  cordageTwisted?: unknown;
  fire?: Partial<FireState> | null;
  picked?: unknown;
  outcome?: unknown;
  tip?: unknown;
}

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== 'object') return false;
  const tile = value as Tile;
  return typeof tile.tx === 'number' && typeof tile.ty === 'number';
}

function inventoryOk(value: RawSave['inventory']): value is GameState['inventory'] {
  if (!value) return false;
  return (
    typeof value.sticks === 'number' &&
    typeof value.stones === 'number' &&
    typeof value.fiber === 'number' &&
    typeof value.cordage === 'number' &&
    typeof value.tinder === 'number' &&
    typeof value.leaves === 'number'
  );
}

function fireOk(value: RawSave['fire']): value is FireState {
  if (!value) return false;
  return (
    typeof value.ring === 'boolean' &&
    typeof value.tinder === 'boolean' &&
    typeof value.kindling === 'boolean' &&
    (value.lay === 'none' || value.lay === 'tipi' || value.lay === 'logcabin') &&
    typeof value.lit === 'boolean'
  );
}

function outcomeOk(value: unknown): value is Outcome {
  return value === 'playing' || value === 'won' || value === 'lost';
}

function shelterOk(value: unknown): value is ShelterStage {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function sharedOk(raw: RawSave): boolean {
  return (
    typeof raw.minutes === 'number' &&
    typeof raw.warmth === 'number' &&
    typeof raw.energy === 'number' &&
    typeof raw.tx === 'number' &&
    typeof raw.ty === 'number' &&
    typeof raw.faceLeft === 'boolean' &&
    inventoryOk(raw.inventory) &&
    shelterOk(raw.shelter) &&
    typeof raw.cordageTwisted === 'boolean' &&
    fireOk(raw.fire) &&
    !!raw.picked &&
    typeof raw.picked === 'object' &&
    outcomeOk(raw.outcome) &&
    typeof raw.tip === 'string'
  );
}

/** Reads a saved game. A version-1 camp is rebuilt on the old clearing. */
export function parseSave(raw: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const save = parsed as RawSave;
    if (!sharedOk(save)) return null;
    const base = save as RawSave & {
      minutes: number;
      warmth: number;
      energy: number;
      tx: number;
      ty: number;
      faceLeft: boolean;
      inventory: GameState['inventory'];
      shelter: ShelterStage;
      cordageTwisted: boolean;
      fire: FireState;
      picked: Record<string, true>;
      outcome: Outcome;
      tip: string;
    };
    if (save.version === 1) {
      return {
        version: 2,
        minutes: base.minutes,
        warmth: base.warmth,
        energy: base.energy,
        tx: base.tx,
        ty: base.ty,
        faceLeft: base.faceLeft,
        inventory: base.inventory,
        shelter: base.shelter,
        shelterAnchor: base.shelter >= 1 ? { tx: SHELTER_TILES[0].tx, ty: SHELTER_TILES[0].ty } : null,
        shelterFlip: false,
        fireTile: base.fire.ring ? { tx: FIRE_TILE.tx, ty: FIRE_TILE.ty } : null,
        cordageTwisted: base.cordageTwisted,
        fire: base.fire,
        picked: base.picked,
        outcome: base.outcome,
        tip: base.tip,
      };
    }
    if (save.version !== 2) return null;
    if (typeof save.shelterFlip !== 'boolean') return null;
    const shelterAnchor = save.shelterAnchor === null ? null : save.shelterAnchor;
    const fireTile = save.fireTile === null ? null : save.fireTile;
    if (shelterAnchor !== null && !isTile(shelterAnchor)) return null;
    if (fireTile !== null && !isTile(fireTile)) return null;
    return {
      version: 2,
      minutes: base.minutes,
      warmth: base.warmth,
      energy: base.energy,
      tx: base.tx,
      ty: base.ty,
      faceLeft: base.faceLeft,
      inventory: base.inventory,
      shelter: base.shelter,
      shelterAnchor,
      shelterFlip: save.shelterFlip,
      fireTile,
      cordageTwisted: base.cordageTwisted,
      fire: base.fire,
      picked: base.picked,
      outcome: base.outcome,
      tip: base.tip,
    };
  } catch {
    return null;
  }
}

export function loadGame(): GameState | null {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return null;
  return parseSave(raw);
}

export function saveGame(state: GameState): void {
  storage.set(SAVE_KEY, JSON.stringify(state));
}

export function clearGame(): void {
  storage.remove(SAVE_KEY);
}
