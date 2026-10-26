import {
  CORDAGE_ENERGY,
  FIBER_CORD,
  FIRE_ENERGY,
  LEAVES_ROOF,
  LIGHT_ENERGY,
  SHELTER_ENERGY,
  STICKS_FUEL,
  STICKS_KINDLING,
  STICKS_RIBS,
  STICKS_RIDGE,
  STONES_RING,
} from './constants';
import { NOTES } from './copy';
import { nearFire, nearShelter } from './rules';
import type { GameState } from './types';

export type CraftCategory = 'tools' | 'construction' | 'fire' | 'resources';

export const CRAFT_CATEGORIES: { id: CraftCategory; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'construction', label: 'Construction' },
  { id: 'fire', label: 'Fire' },
  { id: 'resources', label: 'Resources' },
];

/** Real seconds the cordage reverse-wrap spends in the queue. */
export const CORDAGE_SECONDS = 4.4;

export interface Ingredient {
  name: string;
  have: number;
  need: number;
}

export interface Recipe {
  id: string;
  category: CraftCategory;
  name: string;
  blurb: string;
  frame: string;
  ingredients: Ingredient[];
  seconds: number;
  timeLabel: string;
  action: string;
  enabled: boolean;
  done: boolean;
}

export interface HotbarSlot {
  id: string;
  name: string;
  count: number;
  frame: string;
}

export function hotbarSlots(state: GameState): HotbarSlot[] {
  const bag = state.inventory;
  return [
    { id: 'sticks', name: 'Sticks', count: bag.sticks, frame: 'item_sticks' },
    { id: 'stones', name: 'Stones', count: bag.stones, frame: 'item_stone' },
    { id: 'fiber', name: 'Fiber', count: bag.fiber, frame: 'item_fiber' },
    { id: 'cordage', name: 'Cordage', count: bag.cordage, frame: 'item_cordage' },
    { id: 'tinder', name: 'Tinder', count: bag.tinder, frame: 'item_tinder' },
    { id: 'leaves', name: 'Leaves', count: bag.leaves, frame: 'item_leaves' },
  ];
}

export function statusLine(state: GameState): string {
  if (state.outcome === 'lost') return 'Down';
  if (state.outcome === 'won') return 'Dawn';
  if (state.warmth < 30) return 'Cold';
  if (state.shelter >= 4 && nearShelter(state)) return 'Sheltered';
  if (state.fire.lit && nearFire(state)) return 'By the fire';
  if (state.energy < 25) return 'Tired';
  return 'Steady';
}

function ing(name: string, have: number, need: number): Ingredient {
  return { name, have, need };
}

function canSpend(state: GameState, have: number, need: number, energy: number): boolean {
  return have >= need && state.energy >= energy && state.outcome === 'playing';
}

export function recipesFor(state: GameState): Recipe[] {
  const bag = state.inventory;
  const list: Recipe[] = [
    {
      id: 'hands',
      category: 'tools',
      name: 'Bare hands',
      blurb: 'No shop out here, and nothing to forge. Tonight the kit is cordage, a lean-to, and a fire.',
      frame: 'hands',
      ingredients: [],
      seconds: 0,
      timeLabel: 'Nothing to craft',
      action: '',
      enabled: false,
      done: false,
    },
  ];

  const shelterNext = shelterRecipe(state);
  list.push(shelterNext);

  list.push(fireRingRecipe(state));
  list.push({
    id: 'tinder',
    category: 'fire',
    name: 'Birch tinder',
    blurb: NOTES.tinder,
    frame: 'item_tinder',
    ingredients: [ing('Tinder', bag.tinder, 1)],
    seconds: 0,
    timeLabel: 'At the fire',
    action: 'fire-tinder',
    enabled: state.fire.ring && !state.fire.tinder && canSpend(state, bag.tinder, 1, FIRE_ENERGY),
    done: state.fire.tinder,
  });
  list.push({
    id: 'kindling',
    category: 'fire',
    name: 'Kindling',
    blurb: NOTES.kindling,
    frame: 'item_sticks',
    ingredients: [ing('Sticks', bag.sticks, STICKS_KINDLING)],
    seconds: 0,
    timeLabel: 'At the fire',
    action: 'fire-kindling',
    enabled:
      state.fire.ring && state.fire.tinder && !state.fire.kindling && canSpend(state, bag.sticks, STICKS_KINDLING, FIRE_ENERGY),
    done: state.fire.kindling,
  });
  list.push(layRecipe(state, 'tipi', 'Tipi lay', 'fire_tipi_unlit'));
  list.push(layRecipe(state, 'logcabin', 'Log cabin lay', 'fire_logcabin_unlit'));
  list.push({
    id: 'light',
    category: 'fire',
    name: 'Light the fire',
    blurb: NOTES.light,
    frame: 'fire_tipi_lit_0',
    ingredients: [],
    seconds: 0,
    timeLabel: 'At the fire',
    action: 'fire-light',
    enabled: state.fire.lay !== 'none' && !state.fire.lit && state.energy >= LIGHT_ENERGY,
    done: state.fire.lit,
  });

  const cordReady = bag.cordage < 1 && !state.cordageTwisted && canSpend(state, bag.fiber, FIBER_CORD, CORDAGE_ENERGY);
  const cordFinishing = state.cordageTwisted && bag.cordage < 1;
  list.push({
    id: 'cordage',
    category: 'resources',
    name: 'Cordage',
    blurb: NOTES.cordage,
    frame: 'item_cordage',
    ingredients: [ing('Fiber', bag.fiber, state.cordageTwisted ? 0 : FIBER_CORD)],
    seconds: CORDAGE_SECONDS,
    timeLabel: `${CORDAGE_SECONDS.toFixed(0)} seconds`,
    action: 'craft-cordage',
    enabled: cordReady || cordFinishing,
    done: bag.cordage >= 1,
  });

  return list;
}

function shelterRecipe(state: GameState): Recipe {
  const bag = state.inventory;
  const stages: { name: string; blurb: string; needName: string; have: number; need: number; action: string }[] = [
    {
      name: 'Lean-to',
      blurb: NOTES.ridge,
      needName: 'Sticks',
      have: bag.sticks,
      need: STICKS_RIDGE,
      action: 'place-shelter',
    },
    {
      name: 'Lash the ridge',
      blurb: NOTES.lash,
      needName: 'Cordage',
      have: bag.cordage,
      need: 1,
      action: 'shelter-2',
    },
    {
      name: 'Lean the ribs',
      blurb: NOTES.ribs,
      needName: 'Sticks',
      have: bag.sticks,
      need: STICKS_RIBS,
      action: 'shelter-3',
    },
    {
      name: 'Leaf cover',
      blurb: NOTES.leaves,
      needName: 'Leaves',
      have: bag.leaves,
      need: LEAVES_ROOF,
      action: 'shelter-4',
    },
  ];
  const stage = state.shelter >= 4 ? 3 : state.shelter;
  const step = stages[stage];
  const placing = state.shelter === 0;
  return {
    id: 'lean-to',
    category: 'construction',
    name: step.name,
    blurb: step.blurb,
    frame: state.shelter >= 4 ? 'leanto_done' : 'leanto_frame',
    ingredients: state.shelter >= 4 ? [] : [ing(step.needName, step.have, step.need)],
    seconds: 0,
    timeLabel: placing ? 'Place on the ground' : state.shelter >= 4 ? 'Standing' : 'At the lean-to',
    action: state.shelter >= 4 ? '' : step.action,
    enabled: state.shelter < 4 && canSpend(state, step.have, step.need, SHELTER_ENERGY),
    done: state.shelter >= 4,
  };
}

function fireRingRecipe(state: GameState): Recipe {
  const have = state.inventory.stones;
  return {
    id: 'fire-ring',
    category: 'fire',
    name: 'Fire ring',
    blurb: NOTES.ring,
    frame: 'item_stone',
    ingredients: state.fire.ring ? [] : [ing('Stones', have, STONES_RING)],
    seconds: 0,
    timeLabel: 'Place on the ground',
    action: state.fire.ring ? '' : 'place-fire',
    enabled: !state.fire.ring && canSpend(state, have, STONES_RING, FIRE_ENERGY),
    done: state.fire.ring,
  };
}

function layRecipe(state: GameState, lay: 'tipi' | 'logcabin', name: string, frame: string): Recipe {
  const bag = state.inventory;
  const placed = state.fire.ring;
  const readyForLay =
    placed && state.fire.tinder && state.fire.kindling && state.fire.lay === 'none' && canSpend(state, bag.sticks, STICKS_FUEL, FIRE_ENERGY);
  const canPlaceRing = !placed && canSpend(state, bag.stones, STONES_RING, FIRE_ENERGY);
  const thisLay = state.fire.lay === lay;
  return {
    id: lay,
    category: 'fire',
    name,
    blurb: NOTES.lay,
    frame,
    ingredients: placed
      ? [ing('Sticks', bag.sticks, STICKS_FUEL)]
      : [ing('Stones', bag.stones, STONES_RING), ing('Sticks', bag.sticks, STICKS_FUEL)],
    seconds: 0,
    timeLabel: placed ? 'At the fire' : 'Place the ring first',
    action: placed ? (lay === 'tipi' ? 'lay-tipi' : 'lay-logcabin') : 'place-fire',
    enabled: readyForLay || canPlaceRing,
    done: thisLay || state.fire.lit,
  };
}
