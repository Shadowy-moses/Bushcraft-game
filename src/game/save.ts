import { SAVE_KEY } from './constants';
import type { GameState } from './types';
import { storage } from '../platform/storage';

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as GameState;
  return (
    state.version === 1 &&
    typeof state.minutes === 'number' &&
    typeof state.warmth === 'number' &&
    typeof state.energy === 'number' &&
    typeof state.tx === 'number' &&
    typeof state.ty === 'number' &&
    typeof state.shelter === 'number' &&
    !!state.inventory &&
    typeof state.inventory.sticks === 'number' &&
    typeof state.inventory.stones === 'number' &&
    typeof state.inventory.fiber === 'number' &&
    typeof state.inventory.cordage === 'number' &&
    typeof state.inventory.tinder === 'number' &&
    typeof state.inventory.leaves === 'number' &&
    !!state.fire &&
    !!state.picked &&
    (state.outcome === 'playing' || state.outcome === 'won' || state.outcome === 'lost')
  );
}

export function loadGame(): GameState | null {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  storage.set(SAVE_KEY, JSON.stringify(state));
}

export function clearGame(): void {
  storage.remove(SAVE_KEY);
}
