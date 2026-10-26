export interface Inventory {
  sticks: number;
  stones: number;
  fiber: number;
  cordage: number;
  tinder: number;
  leaves: number;
}

export type FireLay = 'none' | 'tipi' | 'logcabin';
export type Outcome = 'playing' | 'won' | 'lost';
export type ShelterStage = 0 | 1 | 2 | 3 | 4;
export type GatherKind = 'sticks' | 'stones' | 'fiber' | 'tinder' | 'leaves';

export interface FireState {
  ring: boolean;
  tinder: boolean;
  kindling: boolean;
  lay: FireLay;
  lit: boolean;
}

export interface GameState {
  version: 1;
  minutes: number;
  warmth: number;
  energy: number;
  tx: number;
  ty: number;
  faceLeft: boolean;
  inventory: Inventory;
  shelter: ShelterStage;
  cordageTwisted: boolean;
  fire: FireState;
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

export type ActionId =
  | 'cordage-twist'
  | 'cordage-wrap'
  | 'shelter-1'
  | 'shelter-2'
  | 'shelter-3'
  | 'shelter-4'
  | 'fire-ring'
  | 'fire-tinder'
  | 'fire-kindling'
  | 'lay-tipi'
  | 'lay-logcabin'
  | 'fire-light';

export interface ActionResult {
  state: GameState;
  ok: boolean;
  message: string;
}
