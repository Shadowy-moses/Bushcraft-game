import type { TreeMark } from './trees';
import type { Facing } from './woodsman';

export type PieceKind = 'foundation' | 'wall' | 'doorway' | 'floor';
export type EdgeName = 'se' | 'sw' | 'ne' | 'nw';
export type Material = 'twig' | 'stone';

export interface Piece {
  kind: PieceKind;
  tx: number;
  ty: number;
  edge: EdgeName;
  /** Missing on older saves. Those pieces are twig. */
  material?: Material;
}

export interface Inventory {
  wood: number;
  stone: number;
  flakes: number;
  rocks: number;
  hammerstone: boolean;
}

export type Tool = 'hatchet' | 'hammerstone' | 'plan';
export type Outcome = 'playing' | 'won' | 'lost';
export type GatherKind = 'sticks' | 'stones' | 'rocks' | 'fiber' | 'tinder' | 'leaves';

export interface GameState {
  version: 4;
  minutes: number;
  warmth: number;
  energy: number;
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
  picked: Record<string, true>;
  outcome: Outcome;
  tip: string;
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
  | 'item_sticks'
  | 'item_stone'
  | 'item_rock'
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
