export interface AtlasFrame {
  anchor?: { x: number; y: number };
}

export interface AtlasFile {
  frames: Record<string, AtlasFrame>;
  animations?: Record<string, string[]>;
}

export interface StandinOrigins {
  [name: string]: { x: number; y: number };
}

let frames: Record<string, AtlasFrame> = {};
let standins: StandinOrigins = {};

/** Called once the atlas JSON has loaded, so a swapped sheet keeps its own anchors. */
export function installAtlas(file: AtlasFile): void {
  frames = file.frames ?? {};
}

export function installStandins(file: StandinOrigins): void {
  standins = file ?? {};
}

export function frameOrigin(name: string): { x: number; y: number } {
  return frames[name]?.anchor ?? { x: 0.5, y: 1 };
}

export function standinOrigin(name: string): { x: number; y: number } {
  return standins[name] ?? { x: 0.5, y: 1 };
}

export const ATLAS_FRAMES = [
  'grass',
  'dirt',
  'forest_floor',
  'creek_water',
  'creek_edge_stones',
  'pine_tree',
  'birch_tree',
  'rock',
  'bush_fiber',
  'item_sticks',
  'item_stone',
  'item_fiber',
  'item_cordage',
  'fire_tipi_unlit',
  'fire_tipi_lit_0',
  'fire_tipi_lit_1',
  'fire_logcabin_unlit',
  'fire_logcabin_lit_0',
  'fire_logcabin_lit_1',
  'leanto_frame',
  'leanto_done',
  'woodsman_idle',
  'woodsman_walk_0',
  'woodsman_walk_1',
] as const;
