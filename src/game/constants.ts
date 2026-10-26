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
export const CHOP_ENERGY = 4;
export const BUILD_ENERGY = 6;

export const WOOD_FOUNDATION = 20;
export const WOOD_WALL = 10;
export const WOOD_DOOR = 10;
export const WOOD_FLOOR = 15;

/** Game minutes that pass each real second while you are up and working. */
export const PLAY_MINUTES_PER_SECOND = 1.25;
export const REST_MINUTES_PER_SECOND = 3;
export const REST_ENERGY_PER_SECOND = 28;

export const SAVE_KEY = 'bushcraft-first-night-v1';

/** Clear tiles in the starting view, kept so the first foundation has room. */
export const FIRE_TILE = { tx: 7, ty: 4 };
export const SHELTER_TILES = [
  { tx: 5, ty: 3 },
  { tx: 6, ty: 2 },
] as const;
export const PLAYER_START = { tx: 7, ty: 5 };
