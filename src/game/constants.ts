export const TILE_W = 32;
export const TILE_H = 16;
export const ZOOM = 3;
export const COLS = 12;
export const ROWS = 12;

/** 4:30 in the afternoon. */
export const START_MINUTES = 16 * 60 + 30;
/** 6:00 the next morning. */
export const DAWN_MINUTES = 30 * 60;

export const START_WARMTH = 80;
export const START_ENERGY = 100;

export const GATHER_ENERGY = 5;
export const CORDAGE_ENERGY = 8;
export const SHELTER_ENERGY = 8;
export const FIRE_ENERGY = 6;
export const LIGHT_ENERGY = 8;

/** Game minutes that pass each real second while you are up and working. */
export const PLAY_MINUTES_PER_SECOND = 1.25;
export const REST_MINUTES_PER_SECOND = 3;
/** Used once the shelter is finished and the fire is lit. */
export const WAIT_MINUTES_PER_SECOND = 40;
export const REST_ENERGY_PER_SECOND = 28;

export const STICKS_RIDGE = 3;
export const STICKS_RIBS = 4;
export const STICKS_KINDLING = 2;
export const STICKS_FUEL = 3;
export const STONES_RING = 4;
export const FIBER_CORD = 2;
export const LEAVES_ROOF = 4;

/**
 * Deep night is cold enough that a fire alone, or a shelter alone, runs out
 * before dawn. Together they put a little warmth back.
 */
export const SHELTER_WARMTH = 18;
export const FIRE_WARMTH = 18;

export const SAVE_KEY = 'bushcraft-first-night-v1';

/**
 * Where a version-1 save had its camp. New games place the lean-to and the
 * fire by hand. These stay so an old save still rebuilds in the same spot.
 * The lean-to pair is the screen-horizontal span: anchor (5, 3), not flipped.
 */
export const FIRE_TILE = { tx: 7, ty: 4 };
export const SHELTER_TILES = [
  { tx: 5, ty: 3 },
  { tx: 6, ty: 2 },
] as const;
export const PLAYER_START = { tx: 7, ty: 5 };
