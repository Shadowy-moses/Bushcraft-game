import { hotbarSlots, recipesFor, statusLine, type HotbarSlot, type Recipe } from './craft';
import { clockParts, energyWord, warmthWord } from './copy';
import { nearLitFire } from './fire';
import { PROPS } from './map';
import { warmthPerGameHour } from './rules';
import { isFelled } from './trees';
import type { PieceKind, GameState, Tool } from './types';
import { chooseUse, usePrompt } from './use';
import { weatherAt, weatherWord } from './weather';

export type SheetId = 'none' | 'title' | 'end' | 'pack' | 'craft';

export interface PlaceModel {
  kind: PieceKind;
  valid: boolean;
  hint: string;
}

export interface MinimapTree {
  tx: number;
  ty: number;
  felled: boolean;
}

export interface HudModel {
  clock: string;
  daypart: string;
  health: number;
  warmth: number;
  energy: number;
  hunger: number;
  thirst: number;
  hungerLabel: string;
  thirstLabel: string;
  lowHunger: boolean;
  lowThirst: boolean;
  warmthLabel: string;
  warming: boolean;
  debug: boolean;
  energyLabel: string;
  weather: string;
  dampLabel: string;
  prompt: string;
  useLabel: string;
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
  tool: Tool;
  youTx: number;
  youTy: number;
  trees: MinimapTree[];
}

export function buildModel(
  state: GameState,
  sheet: SheetId,
  resting: boolean,
  place: PlaceModel | null = null,
  queue: { label: string; progress: number } | null = null,
  debug = false,
): HudModel {
  const perHour = warmthPerGameHour(state);
  const face = clockParts(state.minutes);
  const feet = { x: state.x, y: state.y };
  const warming = nearLitFire(state);
  const choice = chooseUse(state, feet);
  const prompt = usePrompt(state, feet);
  return {
    clock: face.clock,
    daypart: face.daypart,
    health: state.health,
    warmth: state.warmth,
    energy: state.energy,
    hunger: state.hunger,
    thirst: state.thirst,
    hungerLabel: 'Hunger',
    thirstLabel: 'Thirst',
    lowHunger: state.hunger < 30,
    lowThirst: state.thirst < 30,
    warmthLabel: warming
      ? `${Math.round(state.warmth)} · warming`
      : `${Math.round(state.warmth)} · ${warmthWord(perHour)}`,
    warming,
    debug,
    weather: weatherWord(weatherAt(state.minutes)),
    dampLabel: (state.damp ?? 0) >= 10 ? 'Damp' : '',
    prompt,
    useLabel:
      choice.action === 'drill' ? 'Hold' : choice.action === 'blow' ? 'Blow' : prompt === 'Drink' ? 'Drink' : 'Use',
    energyLabel: `${Math.round(state.energy)} · ${energyWord(state.energy)}`,
    lowWarmth: state.warmth < 30,
    status: statusLine(state),
    tip: state.tip,
    restLabel: resting ? 'Stop resting' : 'Rest',
    restReady: false,
    sheet,
    hotbar: hotbarSlots(state),
    recipes: recipesFor(state),
    queue,
    endTitle: 'Still standing',
    endBody: 'The afternoon is still yours.',
    place,
    tool: state.tool,
    youTx: state.tx,
    youTy: state.ty,
    trees: PROPS.filter((prop) => prop.kind === 'pine_tree' || prop.kind === 'birch_tree').map((prop) => ({
      tx: prop.tx,
      ty: prop.ty,
      felled: isFelled(state.trees, prop.id),
    })),
  };
}
