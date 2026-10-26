import { hotbarSlots, recipesFor, statusLine, type HotbarSlot, type Recipe } from './craft';
import { clockParts, energyWord, warmthWord } from './copy';
import { warmthPerGameHour } from './rules';
import type { PieceKind, GameState } from './types';

export type SheetId = 'none' | 'title' | 'end' | 'pack' | 'craft';

export interface PlaceModel {
  kind: PieceKind;
  valid: boolean;
  hint: string;
}

export interface HudModel {
  clock: string;
  daypart: string;
  health: number;
  warmth: number;
  energy: number;
  warmthLabel: string;
  energyLabel: string;
  lowWarmth: boolean;
  status: string;
  tip: string;
  restLabel: string;
  restReady: boolean;
  sheet: SheetId;
  hotbar: HotbarSlot[];
  recipes: Recipe[];
  queue: { label: string; progress: number } | null;
  endTitle: string;
  endBody: string;
  place: PlaceModel | null;
}

export function buildModel(state: GameState, sheet: SheetId, resting: boolean, place: PlaceModel | null = null): HudModel {
  const perHour = warmthPerGameHour(state);
  const face = clockParts(state.minutes);
  return {
    clock: face.clock,
    daypart: face.daypart,
    health: 100,
    warmth: state.warmth,
    energy: state.energy,
    warmthLabel: `${Math.round(state.warmth)} · ${warmthWord(perHour)}`,
    energyLabel: `${Math.round(state.energy)} · ${energyWord(state.energy)}`,
    lowWarmth: state.warmth < 30,
    status: statusLine(state),
    tip: state.tip,
    restLabel: resting ? 'Stop resting' : 'Rest',
    restReady: false,
    sheet,
    hotbar: hotbarSlots(state),
    recipes: recipesFor(state),
    queue: null,
    endTitle: 'Still standing',
    endBody: 'The afternoon is still yours.',
    place,
  };
}
