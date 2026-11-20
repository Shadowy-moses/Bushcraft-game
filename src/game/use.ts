import { materialCost, pieceAnchor } from './build';
import { BESIDE_FIRE, LOG_STRIPS, NEED_DIRE } from './constants';
import { AXE_IDLE, HATCHET_IDLE } from './copy';
import { isFiberCut } from './fiber';
import { isFelled } from './trees';
import { chebyshev, tileToWorld, worldToTile } from './iso';
import { PROPS } from './map';
import { CHOP_REACH, REACH, inReach, reachFor } from './move';
import { besideCreek } from './food';
import { nearestFire, nearLitFire } from './fire';
import { pieceHealth } from './weather';
import { CORE_KNAPS, ROCK_HITS } from './stone';
import type { GameState, Piece, Prop } from './types';

export type UseChoice =
  | { action: 'gather' | 'knap' | 'chop' | 'strike' | 'peel'; prop: Prop }
  | { action: 'upgrade' | 'repair' | 'feed' | 'blow' | 'drill'; piece: Piece }
  | { action: 'scoop' | 'scoop-bowl' | 'boil' | 'heat' | 'quench' | 'drink' | 'drink-bowl' | 'drink-creek' }
  | { action: 'none'; message: string };

/** A birch one tile off still counts as "at the tree" when a stick is underfoot. */
const BIRCH_SLACK = 22;

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

export interface RankedActions {
  primary: UseChoice;
  /** The next thing he could do. Null when only one action applies. */
  next: UseChoice | null;
}

/**
 * One order for Use, a tap, the hint, and the second button.
 * Place a carried pot, drink what is boiled, repair, pick up a cobble,
 * heat a stone, feed the fire, then the creek, then plants.
 * A hatchet or hammerstone still does its own job when none of those apply.
 */
export function rankedActions(state: GameState, feet: Feet, focus?: Prop): RankedActions {
  const options = listActions(state, feet, focus).filter((choice) => choice.action !== 'none');
  if (options.length === 0) {
    return { primary: idleChoice(state, feet), next: null };
  }
  return { primary: options[0], next: options[1] ?? null };
}

export function chooseTarget(state: GameState, feet: Feet, focus?: Prop): UseChoice {
  return rankedActions(state, feet, focus).primary;
}

/** Use and the hint call this with no tapped prop. */
export function chooseUse(state: GameState, feet: Feet): UseChoice {
  return chooseTarget(state, feet);
}

function listActions(state: GameState, feet: Feet, focus?: Prop): UseChoice[] {
  const hands = state.tool === 'hands' || state.tool === 'plan';
  const here = { ...state, x: feet.x, y: feet.y, tool: 'hands' as const };
  const out: UseChoice[] = [];
  if (hands) {
    const pot = placePot(here, feet);
    if (pot) out.push(pot);
    const boiled = boiledDrink(here, feet);
    if (boiled) out.push(boiled);
    const worn = nearestWorn(here, feet);
    if (worn && here.inventory.wood >= 1) out.push({ action: 'repair', piece: worn.piece });
  }
  const cobble = cobbleChoice(state, feet, focus, hands);
  if (cobble) out.push(cobble);
  if (hands) {
    if (here.hotStone === 'hot' && here.inventory.bowl && here.bowlWater === 'raw' && nearLitFire(here)) {
      out.push({ action: 'quench' });
    }
    if (
      here.inventory.bowl &&
      here.bowlWater === 'raw' &&
      here.hotStone !== 'hot' &&
      nearLitFire(here) &&
      (here.inventory.stone > 0 || (here.inventory.dryCobble ?? 0) > 0 || (here.inventory.wetCobble ?? 0) > 0)
    ) {
      out.push({ action: 'heat' });
    }
    const close = closeFire(here, feet);
    if (close && close.action !== 'none') out.push(close);
    const water = waterChoice(here, feet);
    if (water) out.push(water);
    const forage = forageChoice(state, feet);
    if (forage) out.push(forage);
    if (here.cupWater === 'raw' && here.thirst < NEED_DIRE && !out.some((choice) => choice.action === 'drink')) {
      out.push({ action: 'drink' });
    }
  }
  if (!hands) {
    const rest = toolRest(state, feet);
    if (rest.action !== 'none') out.push(rest);
  }
  return out;
}

function idleChoice(state: GameState, feet: Feet): UseChoice {
  const hands = state.tool === 'hands' || state.tool === 'plan';
  if (!hands) return toolRest(state, feet);
  const here = { ...state, x: feet.x, y: feet.y };
  const close = closeFire(here, feet);
  if (close) return close;
  if (state.cupWater === 'raw') return { action: 'none', message: 'Set it on the coals.' };
  return { action: 'none', message: 'Nothing in these hands.' };
}

/** A raw pot in the pack, set on the fire or the coals he is standing beside. */
function placePot(state: GameState, feet: Feet): UseChoice | null {
  if (state.potSeat || state.inventory.pot <= 0 || state.cupWater !== 'raw') return null;
  const fire = nearestFire(state, feet, BESIDE_FIRE);
  if (!fire) return null;
  const hot = fire.lit === true || (fire.coalsUntil != null && state.minutes < fire.coalsUntil);
  if (!hot) return null;
  return { action: 'boil' };
}

/** On the pile, or on a neighboring tile. A pointed cobble still counts from reach. */
function cobbleChoice(state: GameState, feet: Feet, focus: Prop | undefined, hands: boolean): UseChoice | null {
  if (focus && focus.gather === 'cobble' && !state.picked[focus.id] && inReach(feet.x, feet.y, focus.tx, focus.ty, reachFor(focus))) {
    return { action: 'gather', prop: focus };
  }
  if (!hands) return null;
  const here = worldToTile(feet.x, feet.y);
  let best: { prop: Prop; d: number } | null = null;
  for (const prop of PROPS) {
    if (prop.kind !== 'river_cobbles' || state.picked[prop.id]) continue;
    if (chebyshev(prop.tx, prop.ty, here.tx, here.ty) > 1) continue;
    const d = propDist(feet, prop);
    if (!best || d < best.d) best = { prop, d };
  }
  return best ? { action: 'gather', prop: best.prop } : null;
}

function forageChoice(state: GameState, feet: Feet): UseChoice | null {
  const pickup = nearestProp(feet, handsPickups(state));
  const birch = nearestProp(feet, liveBirches(state));
  const loose = pickup != null && isLoose(pickup.prop);
  if (birch && (!pickup || birch.d <= pickup.d || (loose && birch.d <= pickup.d + BIRCH_SLACK))) {
    return { action: 'peel', prop: birch.prop };
  }
  if (pickup) return { action: 'gather', prop: pickup.prop };
  return null;
}

function toolRest(state: GameState, feet: Feet): UseChoice {
  if (state.tool === 'hatchet' || state.tool === 'axe') {
    const tree = nearestProp(feet, standingTrees(state), CHOP_REACH);
    if (tree) return { action: 'chop', prop: tree.prop };
    return { action: 'none', message: state.tool === 'axe' ? AXE_IDLE : HATCHET_IDLE };
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
  if (state.tool !== 'hands' && state.tool !== 'plan') return { action: 'none', message: 'Nothing in these hands.' };
  if (!state.potSeat && state.cupWater === 'boiled') return { action: 'drink' };
  if (state.bowlWater === 'boiled') return { action: 'drink-bowl' };
  if (state.cupWater === 'raw' && state.thirst < NEED_DIRE) return { action: 'drink' };
  if (state.cupWater === 'raw') return { action: 'none', message: 'Set it on the coals.' };
  const worn = nearestWorn(state, feet);
  if (worn) return { action: 'repair', piece: worn.piece };
  return { action: 'none', message: 'Nothing in these hands.' };
}

function isLoose(prop: Prop): boolean {
  return (
    prop.gather === 'sticks' ||
    prop.gather === 'stones' ||
    prop.gather === 'leaves' ||
    prop.gather === 'rocks' ||
    prop.gather === 'cobble'
  );
}

/** A boiled pot in the pack, or one sitting within reach, then a boiled bowl. */
function boiledDrink(state: GameState, feet: Feet): UseChoice | null {
  if (state.cupWater === 'boiled') {
    if (!state.potSeat) return { action: 'drink' };
    const at = tileToWorld(state.potSeat.tx, state.potSeat.ty);
    if (distTo(feet, at.x, at.y) <= REACH) return { action: 'drink' };
  }
  if (state.bowlWater === 'boiled') return { action: 'drink-bowl' };
  return null;
}

/** The teepee under his feet. Creek water and plants do not get this turn. */
function closeFire(state: GameState, feet: Feet): UseChoice | null {
  const fire = nearestFire(state, feet, BESIDE_FIRE);
  if (!fire) return null;
  const hot = fire.lit === true || (fire.coalsUntil != null && state.minutes < fire.coalsUntil);
  if (hot && state.inventory.wood > 0) return { action: 'feed', piece: fire };
  if (hot) {
    return {
      action: 'none',
      message: fire.lit ? 'Need 1 more wood.' : 'The coals are fading. A length of wood would catch.',
    };
  }
  if (fire.ember === 'smoke' || (state.inventory.coal > 0 && !fire.lit)) return { action: 'blow', piece: fire };
  if (state.inventory.bowdrill && !fire.lit) return { action: 'drill', piece: fire };
  if (!fire.lit) return { action: 'none', message: 'The lay is cold. A bow drill could wake a coal.' };
  return null;
}

/** The short line for whatever Use will do right now. Empty when Use has nothing to do. */
export function actionLabel(choice: UseChoice): string {
  if (choice.action === 'drink' || choice.action === 'drink-bowl' || choice.action === 'drink-creek') return 'Drink';
  if (choice.action === 'scoop') return 'Fill pot';
  if (choice.action === 'scoop-bowl') return 'Fill bowl';
  if (choice.action === 'boil') return 'Set the pot';
  if (choice.action === 'heat') return 'Heat a stone';
  if (choice.action === 'quench') return 'Drop the stone';
  if (choice.action === 'peel') return 'Peel bark';
  if (choice.action === 'feed') return 'Feed the fire';
  if (choice.action === 'blow') return 'Blow';
  if (choice.action === 'drill') return 'Hold';
  if (choice.action === 'chop') return 'Chop';
  if (choice.action === 'repair') return 'Repair (1 wood)';
  if (choice.action === 'upgrade') return 'Upgrade to stone';
  if (choice.action === 'knap') return 'Knap';
  if (choice.action === 'strike') return 'Strike';
  if (choice.action === 'gather') {
    if (choice.prop.kind === 'birch_log' || choice.prop.gather === 'bark') return 'Peel bark';
    if (choice.prop.kind === 'cattails') return 'Pull cattail';
    return 'Gather';
  }
  return '';
}

/** Hint and Use both read chooseTarget. */
export function usePrompt(state: GameState, feet: Feet): string {
  return actionLabel(chooseTarget(state, feet));
}

/** Creek water at a landing: fill an empty pot or bowl, otherwise drink. */
export function waterChoice(state: GameState, feet: Feet): UseChoice | null {
  if (state.tool !== 'hands' || !besideCreek(feet.x, feet.y)) return null;
  if (state.inventory.pot > 0 && state.cupWater === 'empty') return { action: 'scoop' };
  if (state.inventory.bowl && state.bowlWater === 'empty') return { action: 'scoop-bowl' };
  return { action: 'drink-creek' };
}

/** The Use button reads Drink while a mouthful of water is what Use will do. */
export function drinkPrompt(state: GameState, feet: Feet): string | null {
  const line = usePrompt(state, feet);
  if (line === 'Drink' || line === 'Fill pot' || line === 'Fill bowl') return line;
  return null;
}

/** Shown when a damaged twig piece is in reach. One length of wood patches it. */
export function repairPrompt(state: GameState, feet: Feet): string | null {
  if (!nearestWorn(state, feet)) return null;
  return 'Repair (1 wood)';
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
