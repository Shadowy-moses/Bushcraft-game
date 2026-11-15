import { materialCost, pieceAnchor } from './build';
import { LOG_STRIPS, NEED_DIRE } from './constants';
import { HATCHET_IDLE } from './copy';
import { isFiberCut } from './fiber';
import { isFelled } from './trees';
import { tileToWorld } from './iso';
import { PROPS } from './map';
import { CHOP_REACH, REACH } from './move';
import { canBoil, besideCreek } from './food';
import { pieceHealth } from './weather';
import { CORE_KNAPS, ROCK_HITS } from './stone';
import type { GameState, Piece, Prop } from './types';

export type UseChoice =
  | { action: 'gather' | 'knap' | 'chop' | 'strike' | 'peel'; prop: Prop }
  | { action: 'upgrade' | 'repair'; piece: Piece }
  | { action: 'scoop' | 'boil' | 'drink' | 'eat' }
  | { action: 'none'; message: string };

interface Feet {
  x: number;
  y: number;
}

function nearestWorn(state: GameState, feet: Feet): { piece: Piece; d: number } | null {
  let best: { piece: Piece; d: number } | null = null;
  for (const piece of state.pieces) {
    if (piece.kind === 'tripod' || piece.kind === 'fire') continue;
    if ((piece.material ?? 'twig') === 'stone') continue;
    if (pieceHealth(piece) >= 100) continue;
    const at = pieceAnchor(piece.kind, { tx: piece.tx, ty: piece.ty }, piece.edge);
    const d = distTo(feet, at.x, at.y);
    if (d > REACH) continue;
    if (!best || d < best.d) best = { piece, d };
  }
  return best;
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

function handsPickups(state: GameState): Prop[] {
  return PROPS.filter((prop) => {
    if (state.picked[prop.id]) return false;
    if (prop.gather === 'cobble' && state.inventory.hammerstone) return false;
    if (prop.gather === 'sticks' || prop.gather === 'stones' || prop.gather === 'leaves' || prop.gather === 'rocks' || prop.gather === 'cobble') {
      return true;
    }
    if (prop.kind === 'bush_fiber' || prop.kind === 'berry_bush' || prop.kind === 'cattails') {
      return !isFiberCut(state.plants, prop.id, state.minutes);
    }
    if (prop.kind === 'birch_log') return (state.logStrips?.[prop.id] ?? 0) < LOG_STRIPS;
    return false;
  });
}

function liveBirches(state: GameState): Prop[] {
  return PROPS.filter(
    (prop) =>
      prop.kind === 'birch_tree' &&
      !isFelled(state.trees, prop.id) &&
      !isFiberCut(state.plants, prop.id, state.minutes),
  );
}

function liveCores(state: GameState): Prop[] {
  return PROPS.filter((prop) => prop.kind === 'flint_core' && (state.cores[prop.id] ?? 0) < CORE_KNAPS);
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
 * Use follows the tool in his hand.
 * The hatchet chops. Empty hands pick things up and peel bark. The hammerstone knaps and strikes.
 * Nothing here changes which tool that is.
 */
export function chooseUse(state: GameState, feet: Feet): UseChoice {
  if (state.tool === 'hatchet') {
    const tree = nearestProp(feet, standingTrees(state), CHOP_REACH);
    if (tree) return { action: 'chop', prop: tree.prop };
    return { action: 'none', message: HATCHET_IDLE };
  }
  if (state.tool === 'hammerstone') {
    const rock = nearestProp(feet, liveRocks(state));
    const core = nearestProp(feet, liveCores(state));
    const upgrade = nearestUpgrade(state, feet);
    const options: { d: number; choice: UseChoice }[] = [];
    if (rock) options.push({ d: rock.d, choice: { action: 'strike', prop: rock.prop } });
    if (core) options.push({ d: core.d, choice: { action: 'knap', prop: core.prop } });
    if (upgrade) options.push({ d: upgrade.d, choice: { action: 'upgrade', piece: upgrade.piece } });
    options.sort((a, b) => a.d - b.d);
    return options[0]?.choice ?? { action: 'none', message: 'Nothing to strike.' };
  }
  if (state.tool !== 'hands') return { action: 'none', message: 'Nothing in these hands.' };

  const pickup = nearestProp(feet, handsPickups(state));
  const birch = nearestProp(feet, liveBirches(state));
  const underfoot = (d: number) => d <= 16;
  if (pickup && underfoot(pickup.d) && (!birch || pickup.d <= birch.d)) return { action: 'gather', prop: pickup.prop };
  if (birch && underfoot(birch.d)) return { action: 'peel', prop: birch.prop };
  const here = { ...state, x: feet.x, y: feet.y };
  if (canBoil(here)) return { action: 'boil' };
  if (state.inventory.pot > 0 && state.cupWater === 'empty' && besideCreek(feet.x, feet.y)) return { action: 'scoop' };
  if (pickup && (!birch || pickup.d <= birch.d)) return { action: 'gather', prop: pickup.prop };
  if (birch) return { action: 'peel', prop: birch.prop };
  if (state.cupWater === 'boiled') return { action: 'drink' };
  if (state.cupWater === 'raw' && state.thirst < NEED_DIRE) return { action: 'drink' };
  if (state.cupWater === 'raw') return { action: 'none', message: 'Set it on the coals.' };
  const worn = nearestWorn(state, feet);
  if (worn) return { action: 'repair', piece: worn.piece };
  if (state.inventory.berries > 0) return { action: 'eat' };
  if (state.inventory.roots > 0) return { action: 'eat' };
  return { action: 'none', message: 'Nothing in these hands.' };
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
