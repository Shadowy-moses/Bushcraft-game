import { SAVE_KEY } from './constants';
import { tileToWorld } from './iso';
import { escapeEnclosure } from './move';
import { initialState } from './rules';
import type { EdgeName, GameState, Material, Outcome, Piece, PieceKind, Tool } from './types';
import type { TreeMark } from './trees';
import { facingFromSave, isFacing } from './woodsman';
import { storage } from '../platform/storage';

const KINDS: PieceKind[] = ['foundation', 'wall', 'doorway', 'floor', 'tripod', 'fire'];
const EDGES: EdgeName[] = ['se', 'sw', 'ne', 'nw'];

function isTool(value: unknown): value is Tool {
  return value === 'hands' || value === 'hatchet' || value === 'axe' || value === 'hammerstone' || value === 'plan';
}

function freshPicked(picked: Record<string, true>): Record<string, true> {
  const next: Record<string, true> = {};
  for (const [id, value] of Object.entries(picked)) {
    if (id.startsWith('bush_fiber-')) continue;
    if (value) next[id] = true;
  }
  return next;
}

function restorePiece(item: Piece): Piece {
  const health = typeof item.health === 'number' ? item.health : undefined;
  if (item.kind === 'tripod') {
    const cover = item.cover === 'boughs' || item.cover === 'bark' ? item.cover : undefined;
    return { kind: item.kind, tx: item.tx, ty: item.ty, edge: item.edge, cover };
  }
  if (item.kind === 'fire') {
    return {
      kind: item.kind,
      tx: item.tx,
      ty: item.ty,
      edge: item.edge,
      fuel: countOf(item.fuel),
      lit: item.lit === true,
      ember: item.ember === 'smoke' ? 'smoke' : 'none',
      coalsUntil: typeof item.coalsUntil === 'number' ? item.coalsUntil : undefined,
    };
  }
  return { ...item, material: materialOf(item.material), health };
}

function materialOf(value: unknown): Material {
  return value === 'stone' ? 'stone' : 'twig';
}

function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function seatOf(value: unknown): { tx: number; ty: number } | null {
  if (!value || typeof value !== 'object') return null;
  const seat = value as { tx?: unknown; ty?: unknown };
  if (typeof seat.tx !== 'number' || typeof seat.ty !== 'number') return null;
  return { tx: seat.tx, ty: seat.ty };
}

function keepNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
      x?: unknown;
      y?: unknown;
      warmth?: unknown;
      energy?: unknown;
      outcome?: unknown;
      tip?: unknown;
      facing?: unknown;
      faceLeft?: unknown;
      tool?: unknown;
      inventory?: {
        wood?: unknown;
        stone?: unknown;
        flakes?: unknown;
        rocks?: unknown;
        hammerstone?: unknown;
        fiber?: unknown;
        cordage?: unknown;
        tinder?: unknown;
        kindling?: unknown;
        coal?: unknown;
        bowdrill?: unknown;
        berries?: unknown;
        roots?: unknown;
        bark?: unknown;
        pot?: unknown;
        cup?: unknown;
        axe?: unknown;
        bowl?: unknown;
        wetCobble?: unknown;
      };
      health?: unknown;
      hunger?: unknown;
      thirst?: unknown;
      sick?: unknown;
      sickAt?: unknown;
      sips?: unknown;
      logStrips?: unknown;
      cupWater?: unknown;
      bowlWater?: unknown;
      hotStone?: unknown;
      potSeat?: unknown;
      rockGone?: unknown;
      rocks?: unknown;
      cores?: unknown;
      plants?: unknown;
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
    const feet = tileToWorld(save.tx, save.ty);
    const x = typeof save.x === 'number' ? save.x : feet.x;
    const y = typeof save.y === 'number' ? save.y : feet.y;
    const rocksOk =
      !save.rocks ||
      (typeof save.rocks === 'object' &&
        Object.values(save.rocks as Record<string, unknown>).every((hits) => typeof hits === 'number'));
    const plantsOk =
      !save.plants ||
      (typeof save.plants === 'object' &&
        Object.values(save.plants as Record<string, unknown>).every((at) => typeof at === 'number'));
    if (
      (save.version === 3 || save.version === 4 || save.version === 5 || save.version === 6) &&
      save.inventory &&
      typeof save.inventory.wood === 'number' &&
      Array.isArray(save.pieces) &&
      save.pieces.every(pieceOk) &&
      treesOk(save.trees) &&
      pickedOk(save.picked) &&
      rocksOk &&
      plantsOk
    ) {
      return {
        ...fresh,
        version: 6,
        minutes: save.minutes,
        warmth: save.warmth,
        energy: save.energy,
        health: keepNumber(save.health, fresh.health),
        hunger: keepNumber(save.hunger, fresh.hunger),
        thirst: keepNumber(save.thirst, fresh.thirst),
        sick: keepNumber(save.sick, 0),
        sickAt: keepNumber(save.sickAt, 0),
        sips: keepNumber(save.sips, 0),
        cupWater: save.cupWater === 'raw' || save.cupWater === 'boiled' ? save.cupWater : 'empty',
        bowlWater: save.bowlWater === 'raw' || save.bowlWater === 'boiled' ? save.bowlWater : 'empty',
        hotStone: save.hotStone === 'hot' ? 'hot' : 'none',
        potSeat: seatOf(save.potSeat),
        tx: save.tx,
        ty: save.ty,
        x,
        y,
        facing,
        tool: isTool(save.tool) ? save.tool : 'hatchet',
        inventory: {
          wood: save.inventory.wood,
          stone: countOf(save.inventory.stone),
          flakes: countOf(save.inventory.flakes),
          rocks: countOf(save.inventory.rocks),
          hammerstone: save.inventory.hammerstone === true,
        fiber: countOf(save.inventory.fiber),
        cordage: countOf(save.inventory.cordage),
        tinder: countOf(save.inventory.tinder),
        kindling: countOf(save.inventory.kindling),
        coal: countOf(save.inventory.coal),
        bowdrill: save.inventory.bowdrill === true,
        berries: countOf(save.inventory.berries),
        roots: countOf(save.inventory.roots),
        bark: countOf(save.inventory.bark),
        pot: typeof save.inventory.pot === 'number' ? save.inventory.pot : save.inventory.cup === true ? 3 : 0,
        axe: save.inventory.axe === true,
        bowl: save.inventory.bowl === true,
        wetCobble: countOf(save.inventory.wetCobble),
      },
      pieces: save.pieces.map((piece) => restorePiece(piece as Piece)),
      trees: save.trees,
      rocks: (save.rocks as Record<string, number> | undefined) ?? {},
      rockGone: (save.rockGone as Record<string, number> | undefined) ?? {},
      logStrips: (save.logStrips as Record<string, number> | undefined) ?? {},
      cores: (save.cores as Record<string, number> | undefined) ?? {},
      plants: save.version === 6 ? ((save.plants as Record<string, number> | undefined) ?? {}) : {},
      picked: freshPicked(save.picked),
        outcome: 'playing',
        tip: save.tip,
        damp: countOf((save as { damp?: unknown }).damp),
      };
    }
    if (
      save.version === 1 ||
      save.version === 2 ||
      save.version === 3 ||
      save.version === 4 ||
      save.version === 5 ||
      save.version === 6
    ) {
      return {
        ...fresh,
        minutes: save.minutes,
        warmth: save.warmth,
        energy: save.energy,
        tx: save.tx,
        ty: save.ty,
        x,
        y,
        facing,
        picked: pickedOk(save.picked) ? freshPicked(save.picked) : {},
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
  const parsed = parseSave(raw);
  if (!parsed) return null;
  const spot = escapeEnclosure(parsed);
  return spot.x === parsed.x && spot.y === parsed.y ? parsed : { ...parsed, x: spot.x, y: spot.y };
}

export function saveGame(state: GameState): void {
  storage.set(SAVE_KEY, JSON.stringify(state));
}

export function clearGame(): void {
  storage.remove(SAVE_KEY);
}
