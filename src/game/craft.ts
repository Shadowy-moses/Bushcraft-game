import { WOOD_COST } from './build';
import type { GameState, PieceKind } from './types';

export type CraftCategory = 'tools' | 'construction';

export const CRAFT_CATEGORIES: { id: CraftCategory; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'construction', label: 'Construction' },
];

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

const PIECES: { id: PieceKind; name: string; blurb: string; time: string }[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    blurb: 'A square of lashed poles on the grid. Everything else sits on one of these. The next one snaps to a side that is already down.',
    time: 'On clear ground',
  },
  {
    id: 'wall',
    name: 'Wall',
    blurb: 'Twig wall along a foundation edge. Rotate it to the side you want. A solid wall stops you walking through.',
    time: 'On a foundation edge',
  },
  {
    id: 'doorway',
    name: 'Doorway',
    blurb: 'The same twig wall, with a gap you can walk through. Rotate it onto the edge you use as a door.',
    time: 'On a foundation edge',
  },
  {
    id: 'floor',
    name: 'Floor',
    blurb: 'A pole floor. Laid on the walls it is also the roof of the room under it, the start of a second storey.',
    time: 'On top of walls',
  },
];

export function hotbarSlots(state: GameState): HotbarSlot[] {
  return [
    { id: 'hatchet', name: 'Hatchet', count: -1, frame: 'hatchet' },
    { id: 'plan', name: 'Building plan', count: -1, frame: 'plan' },
    { id: 'wood', name: 'Wood', count: state.inventory.wood, frame: 'wood' },
    { id: 'empty-3', name: 'Empty', count: -1, frame: 'hands' },
    { id: 'empty-4', name: 'Empty', count: -1, frame: 'hands' },
    { id: 'empty-5', name: 'Empty', count: -1, frame: 'hands' },
  ];
}

export function statusLine(state: GameState): string {
  if (state.warmth < 30) return 'Cold';
  if (state.energy < 25) return 'Tired';
  if (state.pieces.some((piece) => piece.kind === 'floor')) return 'Under a roof';
  return 'Steady';
}

function pieceRecipe(state: GameState, spec: (typeof PIECES)[number]): Recipe {
  const need = WOOD_COST[spec.id];
  const have = state.inventory.wood;
  return {
    id: spec.id,
    category: 'construction',
    name: spec.name,
    blurb: spec.blurb,
    frame:
      spec.id === 'foundation'
        ? 'twig_foundation'
        : spec.id === 'floor'
          ? 'twig_floor'
          : spec.id === 'doorway'
            ? 'twig_door_ne'
            : 'twig_wall_ne',
    ingredients: [{ name: 'Wood', have, need }],
    seconds: 0,
    timeLabel: spec.time,
    action: `place-${spec.id}`,
    enabled: have >= need,
    done: false,
  };
}

export function recipesFor(state: GameState): Recipe[] {
  return [
    {
      id: 'hatchet',
      category: 'tools',
      name: 'Primitive hatchet',
      blurb: 'A stone head on a short haft. It is already in your hand. Three swings fell a tree, and the wood goes in the pack.',
      frame: 'hatchet',
      ingredients: [],
      seconds: 0,
      timeLabel: 'In your hand',
      action: '',
      enabled: false,
      done: true,
    },
    ...PIECES.map((spec) => pieceRecipe(state, spec)),
  ];
}
