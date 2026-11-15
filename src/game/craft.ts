import { materialCost } from './build';
import {
  AXE_CORDAGE,
  AXE_WOOD,
  BARK_CORDAGE,
  BARK_WOOD,
  BOUGH_FIBER,
  BOWL_WOOD,
  BOWDRILL_CORD,
  BOWDRILL_WOOD,
  CRAFT_TAP_GAP_MS,
  FIRE_KINDLING,
  FIRE_TINDER,
  FIRE_WOOD,
  KINDLING_WOOD,
  TINDER_FIBER,
  TRIPOD_CORDAGE,
  TRIPOD_WOOD,
} from './constants';
import { UPGRADE_NOTE } from './copy';
import { nearLitFire } from './fire';
import { CORD_FIBER, CORD_SECONDS } from './fiber';
import type { GameState, Material, PieceKind } from './types';

/** One tap crafts once. A chosen quantity is the exception, and it still counts as one tap. */
export function allowCraftTap(now: number, last: number, qty: number): boolean {
  if (qty > 1) return true;
  return now - last >= CRAFT_TAP_GAP_MS;
}

export type CraftCategory = 'tools' | 'resources' | 'construction' | 'fire';

export const CRAFT_CATEGORIES: { id: CraftCategory; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
  { id: 'construction', label: 'Construction' },
  { id: 'fire', label: 'Fire' },
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
  /** Shown in the pouch instead of the count. The bark pot uses this for 2/3. */
  text?: string;
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
    { id: 'hands', name: 'Hands', count: -1, frame: 'item_hands' },
    { id: 'hatchet', name: 'Hatchet', count: -1, frame: 'item_hatchet' },
    { id: 'axe', name: 'Axe', count: -1, frame: state.inventory.axe ? 'item_stone_axe' : 'item_hatchet' },
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
    { id: 'berries', name: 'Berries', count: state.inventory.berries, frame: 'item_berries' },
    { id: 'roots', name: 'Cattail root', count: state.inventory.roots, frame: 'item_cattail_root' },
    { id: 'bark', name: 'Bark', count: state.inventory.bark, frame: 'item_birch_bark' },
    ...(state.inventory.bowl || state.bowlWater !== 'empty'
      ? [
          {
            id: 'bowl',
            name: 'Wood bowl',
            count: 1,
            frame:
              state.bowlWater === 'boiled'
                ? 'item_wood_bowl_boil'
                : state.bowlWater === 'raw'
                  ? 'item_wood_bowl_water'
                  : 'item_wood_bowl',
          },
        ]
      : []),
    ...((state.inventory.dryCobble ?? 0) > 0
      ? [{ id: 'dry-cobble', name: 'Dry cobble', count: state.inventory.dryCobble, frame: 'item_rock' }]
      : []),
    ...((state.inventory.wetCobble ?? 0) > 0
      ? [{ id: 'wet-cobble', name: 'Wet cobble', count: state.inventory.wetCobble, frame: 'river_cobbles' }]
      : []),
    ...(state.hotStone === 'hot'
      ? [{ id: 'hot-stone', name: 'Hot stone', count: 1, frame: 'item_hot_stone_0' }]
      : []),
    ...(state.inventory.pot > 0 || state.cupWater !== 'empty'
      ? [
          {
            id: 'pot',
            name: `Bark pot ${state.inventory.pot}/3`,
            count: 1,
            text: `${state.inventory.pot}/3`,
            frame:
              state.inventory.pot === 1
                ? 'item_bark_cup_worn'
                : state.cupWater === 'empty'
                  ? 'item_bark_cup'
                  : 'item_bark_cup_water',
          },
        ]
      : []),
  ];
}

export function statusLine(state: GameState): string {
  if ((state.sick ?? 0) > 0) return 'Queasy';
  if (state.thirst < 30) return 'Thirsty';
  if (state.hunger < 30) return 'Hungry';
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
      name: 'Crude hatchet',
      blurb: 'A crude head jammed on a short haft. It bites slowly: three swings fell a tree, and the wood goes in the pack. It is already in your hand.',
      frame: 'item_hatchet',
      ingredients: [],
      seconds: 0,
      timeLabel: 'In your hand',
      action: '',
      enabled: false,
      done: true,
    },
    {
      id: 'stone-axe',
      category: 'tools',
      name: 'Hafted stone axe',
      blurb: 'A creek cobble, knapped and pecked into a thick wedge head, then hafted with cord. It bites about 1.6 times as deep as the crude hatchet, so two swings drop a tree.',
      frame: 'item_stone_axe',
      ingredients: [
        { name: 'Cobble', have: (state.inventory.dryCobble ?? 0) + (state.inventory.wetCobble ?? 0), need: 1 },
        { name: 'Wood', have: state.inventory.wood, need: AXE_WOOD },
        { name: 'Cordage', have: state.inventory.cordage, need: AXE_CORDAGE },
      ],
      seconds: 0,
      timeLabel: 'In the hands',
      action: 'craft-axe',
      enabled:
        !state.inventory.axe &&
        ((state.inventory.dryCobble ?? 0) >= 1 || (state.inventory.wetCobble ?? 0) >= 1) &&
        state.inventory.wood >= AXE_WOOD &&
        state.inventory.cordage >= AXE_CORDAGE,
      done: state.inventory.axe,
    },
    {
      id: 'wood-bowl',
      category: 'tools',
      name: 'Wood bowl',
      blurb: 'Burn and scrape. Two wood, a flint flake to scrape with (it is not used up), and a lit fire nearby. A coal chars the hollow. The bowl does not wear out.',
      frame: 'item_wood_bowl',
      ingredients: [
        { name: 'Wood', have: state.inventory.wood, need: BOWL_WOOD },
        { name: 'Flake', have: state.inventory.flakes, need: 1 },
      ],
      seconds: 0,
      timeLabel: nearLitFire(state) ? 'Beside a lit fire' : 'Needs a lit fire nearby',
      action: 'craft-bowl',
      enabled: !state.inventory.bowl && state.inventory.wood >= BOWL_WOOD && state.inventory.flakes >= 1 && nearLitFire(state),
      done: state.inventory.bowl,
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
      blurb: '4 wood (dry, from dead branches), plus a length of cordage for the bowstring.',
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
      id: 'boughs',
      category: 'construction',
      name: 'Bough cover',
      blurb: 'Pine boughs over the lashed frame. Quick and cheap. Rain still drips through. A new cover replaces the old one, and nothing is refunded.',
      frame: 'tripod_boughs',
      ingredients: [{ name: 'Fiber', have: state.inventory.fiber, need: BOUGH_FIBER }],
      seconds: 0,
      timeLabel: 'On a lashed tripod',
      action: 'cover-boughs',
      enabled: state.inventory.fiber >= BOUGH_FIBER && state.pieces.some((piece) => piece.kind === 'tripod' && piece.cover !== 'boughs'),
      done: false,
    },
    {
      id: 'bark',
      category: 'construction',
      name: 'Bark cover',
      blurb: 'Bark strips lashed over the frame. Costs more than boughs, and it sheds the rain. A new cover replaces the old one, and nothing is refunded.',
      frame: 'tripod_bark',
      ingredients: [
        { name: 'Wood', have: state.inventory.wood, need: BARK_WOOD },
        { name: 'Cordage', have: state.inventory.cordage, need: BARK_CORDAGE },
      ],
      seconds: 0,
      timeLabel: 'On a lashed tripod',
      action: 'cover-bark',
      enabled:
        state.inventory.wood >= BARK_WOOD &&
        state.inventory.cordage >= BARK_CORDAGE &&
        state.pieces.some((piece) => piece.kind === 'tripod' && piece.cover !== 'bark'),
      done: false,
    },
    {
      id: 'bark-pot',
      category: 'fire',
      name: 'Bark pot',
      blurb: 'One strip of birch bark and a length of cord. It holds creek water and takes three boils on the coals.',
      frame: 'item_bark_cup',
      ingredients: [
        { name: 'Bark', have: state.inventory.bark, need: 1 },
        { name: 'Cordage', have: state.inventory.cordage, need: 1 },
      ],
      seconds: 0,
      timeLabel: 'In the hands',
      action: 'craft-pot',
      enabled: state.inventory.pot <= 0 && state.inventory.bark >= 1 && state.inventory.cordage >= 1,
      done: state.inventory.pot > 0,
    },
    {
      id: 'fire',
      category: 'fire',
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
