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
  /** A vessel for creek water. The bark cup is today's container. */
  cup: boolean;
}

export type Tool = 'hands' | 'hatchet' | 'hammerstone' | 'plan';
export type Outcome = 'playing' | 'won' | 'lost';
export type GatherKind = 'sticks' | 'stones' | 'rocks' | 'cobble' | 'fiber' | 'tinder' | 'leaves' | 'berries' | 'cattail' | 'cup';
export type CupWater = 'empty' | 'raw' | 'boiled';

export interface GameState {
  version: 6;
  minutes: number;
  warmth: number;
  energy: number;
  health: number;
  hunger: number;
  thirst: number;
  /** Game minutes of sickness still to run. Raw water sets this. */
  sick: number;
  cupWater: CupWater;
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
}

export interface Tile {
  tx: number;
  ty: number;
}

export type GroundId = 'grass' | 'dirt' | 'forest_floor' | 'creek_water' | 'creek_edge_stones';

export type PropKind =
  | 'pine_tree'
  | 'birch_tree'
  | 'rock'
  | 'bush_fiber'
  | 'berry_bush'
  | 'cattails'
  | 'bark_cup'
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
