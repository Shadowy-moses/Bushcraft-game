import { materialCost, pieceAnchor } from './build';
import { COBBLE_REACH } from './constants';
import { HATCHET_IDLE } from './copy';
import { isFiberCut } from './fiber';
import { tileToWorld } from './iso';
import { PROPS } from './map';
import { REACH } from './move';
import { CORE_KNAPS, ROCK_HITS } from './stone';
import type { GameState, Piece, Prop } from './types';

export type UseChoice =
  | { action: 'gather' | 'knap' | 'chop' | 'strike'; prop: Prop }
  | { action: 'upgrade'; piece: Piece }
  | { action: 'none'; message: string };

interface Feet {
  x: number;
  y: number;
}

function distTo(feet: Feet, x: number, y: number): number {
  return Math.hypot(x - feet.x, y - feet.y);
}

function propDist(feet: Feet, prop: Prop): number {
  const at = tileToWorld(prop.tx, prop.ty);
  return distTo(feet, at.x, at.y);
}

function nearestProp(feet: Feet, props: Prop[], reach = REACH): { prop: Prop; d: number } | null {
  let best: { prop: Prop; d: number } | null = null;
  for (const prop of props) {
    const d = propDist(feet, prop);
    if (d > reach) continue;
    if (!best || d < best.d) best = { prop, d };
  }
  return best;
}

function liveCobbles(state: GameState): Prop[] {
  return PROPS.filter((prop) => prop.kind === 'river_cobbles' && !state.picked[prop.id]);
}

function liveFiber(state: GameState): Prop[] {
  return PROPS.filter(
    (prop) => prop.kind === 'bush_fiber' && !isFiberCut(state.plants, prop.id, state.minutes),
  );
}

function liveCores(state: GameState): Prop[] {
  return PROPS.filter((prop) => prop.kind === 'flint_core' && (state.cores[prop.id] ?? 0) < CORE_KNAPS);
}

function loosePickups(state: GameState): Prop[] {
  return PROPS.filter(
    (prop) =>
      !state.picked[prop.id] &&
      (prop.gather === 'sticks' || prop.gather === 'stones' || prop.gather === 'leaves' || prop.gather === 'rocks'),
  );
}

function standingTrees(state: GameState): Prop[] {
  return PROPS.filter(
    (prop) =>
      (prop.kind === 'pine_tree' || prop.kind === 'birch_tree') && state.trees[prop.id]?.felledAt == null,
  );
}

function liveRocks(state: GameState): Prop[] {
  return PROPS.filter((prop) => prop.kind === 'rock_node' && (state.rocks[prop.id] ?? 0) < ROCK_HITS);
}

function nearestUpgrade(state: GameState, feet: Feet): { piece: Piece; d: number } | null {
  let best: { piece: Piece; d: number } | null = null;
  for (const piece of state.pieces) {
    if (piece.kind === 'tripod' || piece.kind === 'fire') continue;
    if ((piece.material ?? 'twig') !== 'twig') continue;
    const at = pieceAnchor(piece.kind, piece, piece.edge);
    const d = distTo(feet, at.x, at.y);
    if (d > REACH) continue;
    if (!best || d < best.d) best = { piece, d };
  }
  return best;
}

/**
 * What Use does from here.
 * A river cobble, fiber plant, or flint core in reach is taken even if a tree is closer,
 * and even if the hatchet is what he's holding. Loose stones and leaves do not count as
 * that, so they can't swallow the cobble and then blame the hatchet.
 */
export function chooseUse(state: GameState, feet: Feet): UseChoice {
  if (!state.inventory.hammerstone) {
    const cobble = nearestProp(feet, liveCobbles(state), COBBLE_REACH);
    if (cobble) return { action: 'gather', prop: cobble.prop };
  }

  const specials = nearestProp(feet, [...liveFiber(state), ...liveCores(state), ...liveCobbles(state)]);
  const rock = state.tool === 'hammerstone' ? nearestProp(feet, liveRocks(state)) : null;
  const upgrade = state.tool === 'hammerstone' ? nearestUpgrade(state, feet) : null;
  let work: UseChoice | null = null;
  let workD = Infinity;
  if (rock) {
    work = { action: 'strike', prop: rock.prop };
    workD = rock.d;
  }
  if (upgrade && upgrade.d < workD) {
    work = { action: 'upgrade', piece: upgrade.piece };
    workD = upgrade.d;
  }
  if (specials && (state.tool !== 'hammerstone' || specials.d <= workD)) {
    const prop = specials.prop;
    if (prop.kind === 'flint_core') return { action: 'knap', prop };
    return { action: 'gather', prop };
  }
  if (work?.action === 'strike' && work.prop) return work;
  if (work?.action === 'upgrade' && work.piece) return work;

  const piles = nearestProp(feet, loosePickups(state));
  const tree = state.tool === 'hatchet' ? nearestProp(feet, standingTrees(state)) : null;
  if (piles && (!tree || piles.d <= tree.d)) return { action: 'gather', prop: piles.prop };
  if (tree) return { action: 'chop', prop: tree.prop };
  if (state.tool === 'hammerstone') return { action: 'none', message: 'Nothing to strike.' };
  if (state.tool === 'hands') return { action: 'none', message: 'Nothing in these hands.' };
  return { action: 'none', message: HATCHET_IDLE };
}

/** Line while he stands next to twig he can afford to turn to stone. */
export function upgradePrompt(state: GameState, feet: Feet): string | null {
  if (!state.inventory.hammerstone) return null;
  const near = nearestUpgrade(state, feet);
  if (!near) return null;
  if (state.inventory.stone < materialCost(near.piece.kind, 'stone')) return null;
  if (state.tool === 'hammerstone') return 'Tap the piece, or tap Use, to upgrade it to stone.';
  return 'Equip the hammerstone, then tap the piece or Use to upgrade it to stone.';
}
