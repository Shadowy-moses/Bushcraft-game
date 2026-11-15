import { materialCost } from './build';
import {
  BOWDRILL_CORD,
  BOWDRILL_WOOD,
  FIRE_KINDLING,
  FIRE_TINDER,
  FIRE_WOOD,
  KINDLING_WOOD,
  TINDER_FIBER,
  TRIPOD_CORDAGE,
  TRIPOD_WOOD,
} from './constants';
import { UPGRADE_NOTE } from './copy';
import { CORD_FIBER, CORD_SECONDS } from './fiber';
import type { GameState, Material, PieceKind } from './types';

export type CraftCategory = 'tools' | 'resources' | 'construction';

export const CRAFT_CATEGORIES: { id: CraftCategory; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
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
    { id: 'hands', name: 'Hands', count: -1, frame: 'hands' },
    { id: 'hatchet', name: 'Hatchet', count: -1, frame: 'hatchet' },
    { id: 'hammerstone', name: 'Hammerstone', count: -1, frame: hammer ? 'item_hammerstone' : 'hands' },
    { id: 'plan', name: 'Building plan', count: -1, frame: 'plan' },
    { id: 'wood', name: 'Wood', count: state.inventory.wood, frame: 'wood' },
    { id: 'stone', name: 'Stone', count: state.inventory.stone, frame: 'item_rock' },
    { id: 'flakes', name: 'Flakes', count: state.inventory.flakes, frame: 'item_flake' },
    { id: 'fiber', name: 'Fiber', count: state.inventory.fiber, frame: 'item_fiber' },
    { id: 'cordage', name: 'Cordage', count: state.inventory.cordage, frame: 'item_cordage' },
    { id: 'tinder', name: 'Tinder', count: state.inventory.tinder, frame: 'item_tinder' },
    { id: 'kindling', name: 'Kindling', count: state.inventory.kindling, frame: 'item_kindling' },
    { id: 'coal', name: 'Coal', count: state.inventory.coal, frame: 'item_coal' },
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
    blurb: material === 'stone' ? `${spec.blurb} ${UPGRADE_NOTE}` : spec.blurb,
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
    {
      id: 'tinder',
      category: 'resources',
      name: 'Tinder bundle',
      blurb: 'Dry grass or shredded bark, worked into a nest. It catches a coal.',
      frame: 'item_tinder',
      ingredients: [{ name: 'Fiber', have: state.inventory.fiber, need: TINDER_FIBER }],
      seconds: 0,
      timeLabel: 'A moment in the hands',
      action: 'craft-tinder',
      enabled: state.inventory.fiber >= TINDER_FIBER,
      done: false,
    },
    {
      id: 'kindling',
      category: 'resources',
      name: 'Kindling',
      blurb: 'Small sticks split from a length of wood. They stand around the tinder.',
      frame: 'item_kindling',
      ingredients: [{ name: 'Wood', have: state.inventory.wood, need: KINDLING_WOOD }],
      seconds: 0,
      timeLabel: 'A moment in the hands',
      action: 'craft-kindling',
      enabled: state.inventory.wood >= KINDLING_WOOD,
      done: false,
    },
    {
      id: 'bowdrill',
      category: 'resources',
      name: 'Bow drill',
      blurb:
        'A bow, a spindle, a hearth board, and a bearing block, all dry softwood (cedar, willow, or basswood). Cordage is the bowstring.',
      frame: 'item_bowdrill_kit',
      ingredients: [
        { name: 'Wood', have: state.inventory.wood, need: BOWDRILL_WOOD },
        { name: 'Cordage', have: state.inventory.cordage, need: BOWDRILL_CORD },
      ],
      seconds: 0,
      timeLabel: 'A short while',
      action: 'craft-bowdrill',
      enabled: !state.inventory.bowdrill && state.inventory.wood >= BOWDRILL_WOOD && state.inventory.cordage >= BOWDRILL_CORD,
      done: state.inventory.bowdrill,
    },
    {
      id: 'cordage',
      category: 'resources',
      name: 'Cordage',
      blurb: 'Three fibers, reverse-wrapped until they lock. Two lengths lash a tripod.',
      frame: 'item_cordage',
      ingredients: [{ name: 'Fiber', have: state.inventory.fiber, need: CORD_FIBER }],
      seconds: CORD_SECONDS,
      timeLabel: 'A short twist',
      action: 'craft-cordage',
      enabled: state.inventory.fiber >= CORD_FIBER,
      done: false,
    },
    {
      id: 'tripod',
      category: 'construction',
      name: 'Lashed tripod',
      blurb: 'Three poles lashed at the top. A sturdy frame. Rest against it, and later it can hold a bow drill or the start of a shelter.',
      frame: 'lashed_tripod',
      ingredients: [
        { name: 'Wood', have: state.inventory.wood, need: TRIPOD_WOOD },
        { name: 'Cordage', have: state.inventory.cordage, need: TRIPOD_CORDAGE },
      ],
      seconds: 0,
      timeLabel: 'On clear ground',
      action: 'place-tripod',
      enabled: state.inventory.wood >= TRIPOD_WOOD && state.inventory.cordage >= TRIPOD_CORDAGE,
      done: false,
    },
    {
      id: 'fire',
      category: 'construction',
      name: 'Teepee fire lay',
      blurb:
        'Tinder in the center, kindling leaned over it, fuel wood outside. Unlit until a coal is blown into flame and set in the heart.',
      frame: 'fire_tipi_unlit',
      ingredients: [
        { name: 'Tinder', have: state.inventory.tinder, need: FIRE_TINDER },
        { name: 'Kindling', have: state.inventory.kindling, need: FIRE_KINDLING },
        { name: 'Wood', have: state.inventory.wood, need: FIRE_WOOD },
      ],
      seconds: 0,
      timeLabel: 'On clear ground',
      action: 'place-fire',
      enabled:
        state.inventory.tinder >= FIRE_TINDER &&
        state.inventory.kindling >= FIRE_KINDLING &&
        state.inventory.wood >= FIRE_WOOD,
      done: false,
    },
  ];
}
