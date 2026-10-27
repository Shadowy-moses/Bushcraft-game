import { SAVE_KEY } from './constants';
import { initialState } from './rules';
import type { EdgeName, GameState, Outcome, Piece, PieceKind, Tool } from './types';
import type { TreeMark } from './trees';
import { facingFromSave, isFacing } from './woodsman';
import { storage } from '../platform/storage';

const KINDS: PieceKind[] = ['foundation', 'wall', 'doorway', 'floor'];
const EDGES: EdgeName[] = ['se', 'sw', 'ne', 'nw'];

function isTool(value: unknown): value is Tool {
  return value === 'hatchet' || value === 'plan';
}

function outcomeOk(value: unknown): value is Outcome {
  return value === 'playing' || value === 'won' || value === 'lost';
}

function pieceOk(value: unknown): value is Piece {
  if (!value || typeof value !== 'object') return false;
  const piece = value as Piece;
  return (
    KINDS.includes(piece.kind) &&
    typeof piece.tx === 'number' &&
    typeof piece.ty === 'number' &&
    EDGES.includes(piece.edge)
  );
}

function treesOk(value: unknown): value is Record<string, TreeMark> {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, TreeMark>).every(
    (mark) => mark && typeof mark.hits === 'number' && (mark.felledAt === null || typeof mark.felledAt === 'number'),
  );
}

function pickedOk(value: unknown): value is Record<string, true> {
  return !!value && typeof value === 'object';
}

/** Reads a saved game. Older nights become a fresh build, keeping where he stood. */
export function parseSave(raw: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const save = parsed as {
      version?: unknown;
      minutes?: unknown;
      tx?: unknown;
      ty?: unknown;
      warmth?: unknown;
      energy?: unknown;
      outcome?: unknown;
      tip?: unknown;
      facing?: unknown;
      faceLeft?: unknown;
      tool?: unknown;
      inventory?: { wood?: unknown };
      pieces?: unknown;
      trees?: unknown;
      picked?: unknown;
    };
    if (typeof save.minutes !== 'number' || typeof save.tx !== 'number' || typeof save.ty !== 'number') return null;
    if (typeof save.warmth !== 'number' || typeof save.energy !== 'number') return null;
    if (!outcomeOk(save.outcome) || typeof save.tip !== 'string') return null;
    const facing = facingFromSave(save.facing, save.faceLeft);
    if (!isFacing(facing) && save.facing !== undefined && save.faceLeft === undefined) return null;
    const fresh = initialState();
    if (save.version === 3 && save.inventory && typeof save.inventory.wood === 'number' && Array.isArray(save.pieces) && save.pieces.every(pieceOk) && treesOk(save.trees) && pickedOk(save.picked)) {
      return {
        ...fresh,
        minutes: save.minutes,
        warmth: save.warmth,
        energy: save.energy,
        tx: save.tx,
        ty: save.ty,
        facing,
        tool: isTool(save.tool) ? save.tool : 'hatchet',
        inventory: { wood: save.inventory.wood },
        pieces: save.pieces,
        trees: save.trees,
        picked: save.picked,
        outcome: 'playing',
        tip: save.tip,
      };
    }
    if (save.version === 1 || save.version === 2 || save.version === 3) {
      return {
        ...fresh,
        minutes: save.minutes,
        warmth: save.warmth,
        energy: save.energy,
        tx: save.tx,
        ty: save.ty,
        facing,
        picked: pickedOk(save.picked) ? save.picked : {},
        tip: fresh.tip,
      };
    }
    return null;
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
