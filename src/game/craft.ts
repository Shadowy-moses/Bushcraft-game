import { materialCost } from './build';
import type { GameState, Material, PieceKind } from './types';

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

/** Greyed Place buttons say how much of the material is missing. */
export function placeButtonLabel(have: number, need: number, material = 'wood'): string {
  const short = need - have;
  if (short > 0) return `Need ${short} more ${material}`;
  return 'Place';
}

export function hotbarSlots(state: GameState): HotbarSlot[] {
  const hammer = state.inventory.hammerstone;
  return [
    { id: 'hatchet', name: 'Hatchet', count: -1, frame: 'hatchet' },
    { id: 'hammerstone', name: 'Hammerstone', count: -1, frame: hammer ? 'item_hammerstone' : 'hands' },
    { id: 'plan', name: 'Building plan', count: -1, frame: 'plan' },
    { id: 'wood', name: 'Wood', count: state.inventory.wood, frame: 'wood' },
    { id: 'stone', name: 'Stone', count: state.inventory.stone, frame: 'item_rock' },
    { id: 'flakes', name: 'Flakes', count: state.inventory.flakes, frame: 'item_flake' },
  ];
}

export function statusLine(state: GameState): string {
  if (state.warmth < 30) return 'Cold';
  if (state.energy < 25) return 'Tired';
  if (state.pieces.some((piece) => piece.kind === 'floor')) return 'Under a roof';
  return 'Steady';
}

const STONE_PIECES: { id: PieceKind; name: string; blurb: string; time: string }[] = [
  {
    id: 'foundation',
    name: 'Stone foundation',
    blurb: 'Rocks set in a square. Walls of either kind sit on it, the same as a twig foundation.',
    time: 'On clear ground',
  },
  {
    id: 'wall',
    name: 'Stone wall',
    blurb: 'A dry-stone wall on a foundation edge. Rotate it to the side you want.',
    time: 'On a foundation edge',
  },
  {
    id: 'doorway',
    name: 'Stone doorway',
    blurb: 'A stone wall with a gap you can walk through.',
    time: 'On a foundation edge',
  },
  {
    id: 'floor',
    name: 'Stone floor',
    blurb: 'Slabs over the walls. It is also the roof of the room under it.',
    time: 'On top of walls',
  },
];

function pieceRecipe(state: GameState, spec: (typeof PIECES)[number], material: Material): Recipe {
  const need = materialCost(spec.id, material);
  const have = material === 'stone' ? state.inventory.stone : state.inventory.wood;
  const family = material === 'stone' ? 'stone' : 'twig';
  return {
    id: material === 'stone' ? `stone-${spec.id}` : spec.id,
    category: 'construction',
    name: spec.name,
    blurb: spec.blurb,
    frame:
      spec.id === 'foundation'
        ? `${family}_foundation`
        : spec.id === 'floor'
          ? `${family}_floor`
          : spec.id === 'doorway'
            ? `${family}_door_ne`
            : `${family}_wall_ne`,
    ingredients: [{ name: material === 'stone' ? 'Stone' : 'Wood', have, need }],
    seconds: 0,
    timeLabel: spec.time,
    action: material === 'stone' ? `place-stone-${spec.id}` : `place-${spec.id}`,
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
    ...PIECES.map((spec) => pieceRecipe(state, spec, 'twig')),
    ...STONE_PIECES.map((spec) => pieceRecipe(state, spec, 'stone')),
  ];
}
