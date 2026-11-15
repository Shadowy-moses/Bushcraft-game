import {
  BOUGH_LEAK,
  DAMP_DRY_PER_HOUR,
  DAMP_PER_HOUR,
  DAMP_WARMTH_PER_HOUR,
  GROUND_DECAY_PER_HOUR,
  RAIN_WARMTH_PER_HOUR,
  WALL_DECAY_PER_HOUR,
  WIND_WARMTH_PER_HOUR,
} from './constants';
import type { GameState, Piece, PieceKind } from './types';

export type WeatherName = 'clear' | 'overcast' | 'rain' | 'wind';

/** The day's weather, from the clock. The first stretch after 4:30 is clear. */
export function weatherAt(minutes: number): WeatherName {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 16.5 && h < 18) return 'clear';
  if (h >= 18 && h < 20) return 'overcast';
  if (h >= 20 && h < 23) return 'rain';
  if (h >= 23 || h < 2) return 'wind';
  if (h >= 2 && h < 5) return 'overcast';
  if (h >= 5 && h < 11) return 'clear';
  return 'overcast';
}

export function weatherWord(name: WeatherName): string {
  if (name === 'clear') return 'Clear';
  if (name === 'overcast') return 'Overcast';
  if (name === 'rain') return 'Rain';
  return 'Wind';
}

/** Extra warmth per game hour in the open. A roof or a bark cover cancels it. */
export function weatherWarmthPerHour(name: WeatherName): number {
  if (name === 'rain') return -RAIN_WARMTH_PER_HOUR;
  if (name === 'wind') return -WIND_WARMTH_PER_HOUR;
  return 0;
}

export function pieceHealth(piece: Piece): number {
  return piece.health ?? 100;
}

function coverLeak(pieces: Piece[], tx: number, ty: number, roofReach: number): number {
  const roof = pieces.some(
    (piece) =>
      piece.kind === 'floor' &&
      pieceHealth(piece) > 0 &&
      Math.max(Math.abs(piece.tx - tx), Math.abs(piece.ty - ty)) <= roofReach,
  );
  if (roof) return 0;
  let leak = 1;
  for (const piece of pieces) {
    if (piece.kind !== 'tripod' || !piece.cover) continue;
    if (Math.max(Math.abs(piece.tx - tx), Math.abs(piece.ty - ty)) > 1) continue;
    leak = Math.min(leak, piece.cover === 'bark' ? 0 : BOUGH_LEAK);
  }
  return leak;
}

/** He is dry on a roof tile, or within one tile of a covered tripod. */
export function playerLeak(state: GameState): number {
  return coverLeak(state.pieces, state.tx, state.ty, 0);
}

/** A teepee is dry under a cover, or on the tile next to a roof. */
export function fireLeak(pieces: Piece[], fire: Piece): number {
  return coverLeak(pieces, fire.tx, fire.ty, 1);
}

export function isSheltered(state: GameState): boolean {
  return playerLeak(state) < 1;
}

/** Warmth the weather and his wet clothes take, before the fire is counted. */
export function exposurePerHour(state: GameState): number {
  const leak = playerLeak(state);
  const weather = weatherWarmthPerHour(weatherAt(state.minutes)) * leak;
  const damp = DAMP_WARMTH_PER_HOUR * ((state.damp ?? 0) / 100);
  return weather - damp;
}

/**
 * Open rain soaks him. A roof, bark, or a fire dries him. Boughs dry him halfway.
 * Clear air dries him too, so the wet outlasts the shower and then goes.
 */
export function nextDamp(state: GameState, gameMinutes: number, nearHeat: boolean): number {
  const hours = gameMinutes / 60;
  const leak = playerLeak(state);
  const raining = weatherAt(state.minutes) === 'rain';
  let damp = state.damp ?? 0;
  if (raining && leak > 0 && !nearHeat) damp += DAMP_PER_HOUR * leak * hours;
  else damp -= DAMP_DRY_PER_HOUR * hours;
  return Math.max(0, Math.min(100, damp));
}

export function decayPerHour(piece: Piece, minutes: number, pieces: Piece[]): number {
  if ((piece.material ?? 'twig') === 'stone') return 0;
  if (piece.kind === 'tripod' || piece.kind === 'fire') return 0;
  const base = groundPiece(piece.kind) ? GROUND_DECAY_PER_HOUR : WALL_DECAY_PER_HOUR;
  const rain = weatherAt(minutes) === 'rain' ? coverLeak(pieces, piece.tx, piece.ty, 0) : 0;
  return base * (1 + rain);
}

function groundPiece(kind: PieceKind): boolean {
  return kind === 'foundation' || kind === 'floor';
}

export function isEmbers(piece: Piece, minutes: number): boolean {
  return piece.kind === 'fire' && !piece.lit && piece.coalsUntil != null && minutes < piece.coalsUntil;
}
