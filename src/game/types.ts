import type { TreeMark } from './trees';
import type { Facing } from './woodsman';

export type PieceKind = 'foundation' | 'wall' | 'doorway' | 'floor' | 'tripod' | 'fire';
export type EdgeName = 'se' | 'sw' | 'ne' | 'nw';
export type Material = 'twig' | 'stone';

export interface Piece {
  kind: PieceKind;
  tx: number;
  ty: number;
  edge: EdgeName;
  /** Missing on older saves. Those pieces are twig. */
  material?: Material;
  /** Game minutes of fuel left in a teepee. */
  fuel?: number;
  lit?: boolean;
  /** First blow of a coal into the tinder bundle. */
  ember?: 'none' | 'smoke';
  /** Game minute a spent teepee stops glowing. Missing means the lay is cold. */
  coalsUntil?: number;
  /** Missing means sound. Twig wears. Stone does not. */
  health?: number;
  /** A cover on a lashed tripod. Boughs leak. Bark does not. */
  cover?: 'boughs' | 'bark';
}

export interface Inventory {
  wood: number;
  stone: number;
  flakes: number;
  rocks: number;
  hammerstone: boolean;
  fiber: number;
  cordage: number;
  tinder: number;
  kindling: number;
  coal: number;
  bowdrill: boolean;
  berries: number;
  roots: number;
  /** Birch bark strips. The pot and, later, other bark work. */
  bark: number;
  /** Boils left in the bark pot. Zero means he has no pot. */
  pot: number;
  /** A hafted stone axe. It does not switch into his hand on its own. */
  axe: boolean;
  /** A carved wood bowl. It does not wear out. */
  bowl: boolean;
  /** Wet creek cobbles carried for stone boiling. Not a second hammerstone. */
  wetCobble: number;
}

export type Tool = 'hands' | 'hatchet' | 'axe' | 'hammerstone' | 'plan';
export type Outcome = 'playing' | 'won' | 'lost';
export type GatherKind = 'sticks' | 'stones' | 'rocks' | 'cobble' | 'fiber' | 'tinder' | 'leaves' | 'berries' | 'cattail' | 'bark';
export type CupWater = 'empty' | 'raw' | 'boiled';

export interface GameState {
  version: 6;
  minutes: number;
  warmth: number;
  energy: number;
  health: number;
  hunger: number;
  thirst: number;
  /** Game minutes of sickness still to run. */
  sick: number;
  /** Game minute a delayed sickness begins. Zero means none is waiting. */
  sickAt: number;
  /** Raw drinks taken. About one in three is going to turn. */
  sips: number;
  cupWater: CupWater;
  /** Water in the wood bowl, separate from the bark pot. */
  bowlWater: CupWater;
  /** A stone that has finished heating and can be dropped into the bowl. */
  hotStone: 'none' | 'hot';
  /** Strips taken from each fallen birch log. */
  logStrips: Record<string, number>;
  tx: number;
  ty: number;
  /** Feet, in world pixels. Free movement does not snap these to a tile. */
  x: number;
  y: number;
  /** Which way he is looking: se, sw, ne, or nw. */
  facing: Facing;
  /** What the hotbar has in hand. The hatchet chops. The plan builds. */
  tool: Tool;
  inventory: Inventory;
  pieces: Piece[];
  trees: Record<string, TreeMark>;
  /** Strikes landed on each rock node. Five leaves rubble. */
  rocks: Record<string, number>;
  /** Game minute a rock node was worked down to rubble. */
  rockGone: Record<string, number>;
  /** Knaps landed on each flint core. Two leaves it spent. */
  cores: Record<string, number>;
  /** Game minute each fiber plant was cut. Missing means it is standing. */
  plants: Record<string, number>;
  picked: Record<string, true>;
  outcome: Outcome;
  tip: string;
  /** 0 to 100. Rain soaks him, and he stays wet after it stops. */
  damp: number;
  /** Tile where the bark pot is sitting. Null while it is in the pack. */
  potSeat: { tx: number; ty: number } | null;
}

export interface Tile {
  tx: number;
  ty: number;
}

export type GroundId = 'grass' | 'dirt' | 'forest_floor' | 'creek_water' | 'creek_edge_stones' | 'creek_gravel';

export type PropKind =
  | 'pine_tree'
  | 'birch_tree'
  | 'rock'
  | 'bush_fiber'
  | 'berry_bush'
  | 'cattails'
  | 'birch_log'
  | 'item_sticks'
  | 'item_stone'
  | 'item_rock'
  | 'river_cobbles'
  | 'flint_core'
  | 'rock_node'
  | 'leaf_pile';

export interface Prop {
  id: string;
  kind: PropKind;
  tx: number;
  ty: number;
  blocks: boolean;
  gather?: GatherKind;
  amount: number;
}

export interface ActionResult {
  state: GameState;
  ok: boolean;
  message: string;
  /** Floating pickup text, such as "+4 Wood". */
  popup?: string;
}
