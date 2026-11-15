export const TILE_W = 32;
export const TILE_H = 16;
/**
 * Integer follow zoom. Wide windows keep this zoom and crop the view,
 * so the camera stays on him and the minimap is the overview.
 */
export const ZOOM = 3;
/** Largest on-screen follow window. Bigger displays letterbox instead of zooming out. */
export const FOLLOW_MAX_W = 480;
export const FOLLOW_MAX_H = 900;
export const COLS = 12;
export const ROWS = 12;

/** 4:30 in the afternoon. */
export const START_MINUTES = 16 * 60 + 30;
/** 6:00 the next morning. */
export const DAWN_MINUTES = 30 * 60;

export const START_WARMTH = 80;
export const START_ENERGY = 100;
export const START_HEALTH = 100;
/** Both start comfortable. Thirst falls faster, so the cup matters before the berries do. */
export const START_HUNGER = 80;
export const START_THIRST = 80;
/** Points lost each game hour. A game hour is about two and a half real minutes. */
export const HUNGER_PER_HOUR = 4;
export const THIRST_PER_HOUR = 8;
/** Under this, resting brings stamina back more slowly. */
export const NEED_LOW = 30;
/** Under this, health starts to slip. */
export const NEED_DIRE = 12;
export const DIRE_HEALTH_PER_HOUR = 4;
/** One berry. A bush gives two. */
export const BERRY_HUNGER = 28;
export const BERRIES_PER_BUSH = 2;
/** One cattail root. */
export const ROOT_HUNGER = 22;
export const BOILED_THIRST = 40;
export const RAW_THIRST = 24;
/** How long raw water keeps him sick. Two game hours, about five real minutes. */
export const SICK_MINUTES = 120;
export const SICK_ENERGY_PER_HOUR = 8;
export const SICK_HEALTH_PER_HOUR = 4;
/** One mined-out rock node returns this often. One game day, about an hour of real time. */
export const ROCK_RETURN_MINUTES = 1440;
/** A fallen birch log gives this many strips, then it is spent. */
export const LOG_STRIPS = 4;
/** Strips one Use takes from a birch, live or fallen. A live birch still peels only once a day. */
export const BARK_STRIPS = 2;
/** A bark pot survives this many boils. */
export const POT_BOILS = 3;
/** Hafted stone axe: one creek cobble, two wood, one cord. */
export const AXE_WOOD = 2;
export const AXE_CORDAGE = 1;
/** Chop progress per swing. A tree falls at 3. The axe bites 1.6 times as deep. */
export const HATCHET_BITE = 1;
export const AXE_BITE = 1.6;
/** A wood bowl is carved from two lengths of wood. */
export const BOWL_WOOD = 2;
/** About one wet creek cobble in four cracks when it goes into the fire. A dry stone never does. */
export const WET_BURST_CHANCE = 0.25;
/** Raw water, when it sickens him, waits this long before it starts. Two game hours. */
export const SICK_DELAY = 120;

export const GATHER_ENERGY = 5;
/**
 * One point a swing. A full bar is twice the last round, and a second tap
 * during the swing does not spend again.
 */
export const CHOP_ENERGY = 1;
/**
 * A strike costs more than a chop, and a node takes more swings than a tree.
 * See ROCK_HITS in stone.ts. A stone hut is about twice the stamina of a twig hut.
 */
export const STRIKE_ENERGY = 2;
export const BUILD_ENERGY = 6;
/** Cobbles sit in the creek fringe. The bank is close enough. */
export const COBBLE_REACH = 88;
/** About one tile. A fire this close wins Use and taps over the creek and the plants. */
export const BESIDE_FIRE = 36;

export const WOOD_FOUNDATION = 10;
export const WOOD_WALL = 5;
export const WOOD_DOOR = 5;
export const WOOD_FLOOR = 8;

/** Three poles and two cords. The cords are the slow part: 6 fiber, twisted in two passes. */
export const TRIPOD_WOOD = 3;
export const TRIPOD_CORDAGE = 2;
/** How close his feet have to be before the frame takes some of his weight. */
export const TRIPOD_REST_REACH = 36;
/** Extra stamina return while resting against a tripod. 0.4 is forty percent. */
export const TRIPOD_REST_BONUS = 0.4;

/** Bow, spindle, hearth, and a bearing block. Cordage is the bowstring. */
export const BOWDRILL_WOOD = 4;
export const BOWDRILL_CORD = 1;
/** Dry grass or shredded bark, twisted into one bundle. */
export const TINDER_FIBER = 2;
/** One length of wood splits into two handfuls of kindling. */
export const KINDLING_WOOD = 1;
export const KINDLING_OUT = 2;
/** Teepee: tinder in the middle, kindling around it, then fuel wood. */
export const FIRE_TINDER = 1;
export const FIRE_KINDLING = 2;
export const FIRE_WOOD = 2;
/** Game minutes one piece of wood feeds a burning teepee. About two and a half real minutes. */
export const FIRE_FUEL_PER_WOOD = 60;
/** World pixels. Standing inside this of a lit teepee warms him. */
export const FIRE_RADIUS = 56;
/** Added on top of the hour's drift while he is in that radius. */
export const FIRE_WARMTH_PER_HOUR = 60;
/** Hold the bow this many real seconds or the coal dusts out. */
export const DRILL_SECONDS = 5;
export const DRILL_STAMINA_PER_SECOND = 2;
/** Glowing coals after the fuel is gone. 48 game minutes is about two real minutes. */
export const EMBER_MINUTES = 48;
/** Open rain cuts the coal bed in half. */
export const EMBER_RAIN_MINUTES = 24;
/** A little warmth from the coals, much less than a flame. */
export const EMBER_WARMTH_PER_HOUR = 18;
/** An uncovered teepee in the rain eats wood twice as fast. */
export const RAIN_BURN_MULT = 2;
/** Pine boughs leak. The fire under them burns a little faster, not twice as fast. */
export const BOUGH_BURN_MULT = 1.4;
/** Share of the rain that still gets through a bough cover. Bark lets none through. */
export const BOUGH_LEAK = 0.4;
/** Extra warmth lost per game hour while standing in the rain, or in the wind. */
export const RAIN_WARMTH_PER_HOUR = 12;
export const WIND_WARMTH_PER_HOUR = 6;
/** Damp builds in open rain and lingers after it. Full damp is another small drain. */
export const DAMP_PER_HOUR = 20;
export const DAMP_DRY_PER_HOUR = 40;
export const DAMP_WARMTH_PER_HOUR = 8;
/** Twig on the ground wears faster than a wall. Open rain doubles it. Stone does not wear. */
export const WALL_DECAY_PER_HOUR = 2;
export const GROUND_DECAY_PER_HOUR = 4;
/** One length of wood patches a worn piece. It is not a new wall. */
export const REPAIR_HEALTH = 40;
export const WORN_AT = 50;
/** A quick cover. Grass fiber bundled over the frame. It leaks. */
export const BOUGH_FIBER = 4;
/** Bark strips, lashed on. Costs more, and the rain stays outside. */
export const BARK_WOOD = 4;
export const BARK_CORDAGE = 2;
/** A second tap this soon does not craft again, unless a quantity was chosen. */
export const CRAFT_TAP_GAP_MS = 400;

/**
 * Game minutes that pass each real second while you are up and working.
 * 4:30 to 6:00 is 810 game minutes, so that night lasts about 34 real minutes.
 */
export const PLAY_MINUTES_PER_SECOND = 0.4;
export const REST_MINUTES_PER_SECOND = 1.8;
export const REST_ENERGY_PER_SECOND = 28;

export const SAVE_KEY = 'bushcraft-first-night-v1';

/** Clear tiles in the starting view, kept so the first foundation has room. */
export const FIRE_TILE = { tx: 7, ty: 4 };
export const SHELTER_TILES = [
  { tx: 5, ty: 3 },
  { tx: 6, ty: 2 },
] as const;
export const PLAYER_START = { tx: 7, ty: 5 };
