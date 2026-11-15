import { materialCost, pieceAnchor } from './build';
import { BESIDE_FIRE, FIRE_RADIUS, LOG_STRIPS, NEED_DIRE } from './constants';
import { AXE_IDLE, HATCHET_IDLE } from './copy';
import { isFiberCut } from './fiber';
import { isFelled } from './trees';
import { tileToWorld } from './iso';
import { PROPS } from './map';
import { CHOP_REACH, REACH, inReach, reachFor } from './move';
import { canBoil, besideCreek } from './food';
import { nearestFire, nearLitFire } from './fire';
import { heldIcon } from './hold';
import { pieceHealth } from './weather';
import { CORE_KNAPS, ROCK_HITS } from './stone';
import type { GameState, Piece, Prop, Tool } from './types';

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

/**
 * One order for Use, a tap, and the hint.
 * Boiled water, then the fire beside him, then a cobble he tapped, then the creek, then plants.
 * A hatchet or hammerstone still does its own job when none of those are the target.
 */
export function chooseTarget(state: GameState, feet: Feet, focus?: Prop): UseChoice {
  const world = worldTarget(state, feet, focus);
  if (world) return world;
  return toolRest(state, feet);
}

/** Use and the hint call this with no tapped prop. */
export function chooseUse(state: GameState, feet: Feet): UseChoice {
  return chooseTarget(state, feet);
}

function worldTarget(state: GameState, feet: Feet, focus?: Prop): UseChoice | null {
  const hands = state.tool === 'hands' || state.tool === 'plan';
  const pointed = focus != null && (focus.gather === 'cobble' || isPlant(focus) || focus.kind === 'birch_log' || focus.kind === 'birch_tree');
  if (!hands && !pointed) return null;

  const boiled = boiledDrink(state, feet);
  if (boiled) return boiled;
  const here = { ...state, x: feet.x, y: feet.y, tool: 'hands' as const };
  if (canBoil(here)) return { action: 'boil' };
  if (state.hotStone === 'hot' && state.inventory.bowl && state.bowlWater === 'raw' && nearLitFire(here)) {
    return { action: 'quench' };
  }
  if (
    state.inventory.bowl &&
    state.bowlWater === 'raw' &&
    state.hotStone !== 'hot' &&
    nearLitFire(here) &&
    (state.inventory.stone > 0 || (state.inventory.dryCobble ?? 0) > 0 || (state.inventory.wetCobble ?? 0) > 0)
  ) {
    return { action: 'heat' };
  }
  const close = closeFire(here, feet);
  if (close) return close;
  if (focus && focus.gather === 'cobble' && !state.picked[focus.id] && inReach(feet.x, feet.y, focus.tx, focus.ty, reachFor(focus))) {
    return { action: 'gather', prop: focus };
  }
  const water = waterChoice(here, feet);
  if (water) return water;
  if (!hands) return null;
  return forageChoice(state, feet);
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

function isPlant(prop: Prop): boolean {
  return prop.kind === 'cattails' || prop.kind === 'berry_bush' || prop.kind === 'bush_fiber';
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
  if (choice.action === 'boil') return 'Boil';
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

/** Hint and Use both read chooseTarget, after a tool swap when the one in hand does not fit. */
export function usePrompt(state: GameState, feet: Feet): string {
  return actionLabel(resolveUse(state, feet).choice);
}

export interface ResolvedUse {
  state: GameState;
  choice: UseChoice;
  swapped: boolean;
  name: string;
}

/**
 * Use equips the tool the nearest target needs, then follows chooseTarget.
 * A stone axe beats the hatchet for a tree. A hammerstone is for knapping, striking, and upgrading.
 * Empty hands pick up, drink, peel, and forage. The tool already in hand stays when it can do that target.
 */
export function resolveUse(state: GameState, feet: Feet): ResolvedUse {
  const tool = toolForTarget(state, feet);
  const next = tool === state.tool ? state : { ...state, tool };
  return {
    state: next,
    choice: chooseTarget(next, feet),
    swapped: tool !== state.tool,
    name: heldIcon(tool, next.inventory.axe, next.inventory.hammerstone).name,
  };
}

function toolForTarget(state: GameState, feet: Feet): Tool {
  const asHands = chooseTarget({ ...state, tool: 'hands' }, feet);
  if (handsWork(asHands)) return 'hands';
  const options: { d: number; tool: Tool }[] = [];
  const tree = nearestProp(feet, standingTrees(state), CHOP_REACH);
  if (tree) options.push({ d: tree.d, tool: state.inventory.axe ? 'axe' : 'hatchet' });
  if (state.inventory.hammerstone) {
    const struck = chooseTarget({ ...state, tool: 'hammerstone' }, feet);
    if (struck.action === 'knap' || struck.action === 'strike' || struck.action === 'upgrade') {
      options.push({ d: choiceDistance(state, feet, struck), tool: 'hammerstone' });
    }
  }
  if (options.length === 0) return state.tool;
  options.sort((a, b) => a.d - b.d);
  return options[0].tool;
}

/** Drink, the fire, the creek, and forage outrank a chop. Those stay in his hands. */
function handsWork(choice: UseChoice): boolean {
  if (choice.action === 'none') {
    return choice.message !== 'Nothing in these hands.';
  }
  return choice.action !== 'chop' && choice.action !== 'knap' && choice.action !== 'strike' && choice.action !== 'upgrade';
}

function choiceDistance(state: GameState, feet: Feet, choice: UseChoice): number {
  if (choice.action === 'gather' || choice.action === 'knap' || choice.action === 'chop' || choice.action === 'strike' || choice.action === 'peel') {
    return propDist(feet, choice.prop);
  }
  if (choice.action === 'upgrade' || choice.action === 'repair' || choice.action === 'feed' || choice.action === 'blow' || choice.action === 'drill') {
    const at = tileToWorld(choice.piece.tx, choice.piece.ty);
    return distTo(feet, at.x, at.y);
  }
  if (choice.action === 'drink' && state.potSeat) {
    const at = tileToWorld(state.potSeat.tx, state.potSeat.ty);
    return distTo(feet, at.x, at.y);
  }
  if (choice.action === 'boil' || choice.action === 'heat' || choice.action === 'quench') {
    const fire = nearestFire(state, feet, FIRE_RADIUS);
    if (!fire) return FIRE_RADIUS;
    const at = tileToWorld(fire.tx, fire.ty);
    return distTo(feet, at.x, at.y);
  }
  if (choice.action === 'scoop' || choice.action === 'scoop-bowl' || choice.action === 'drink-creek') return 0;
  if (choice.action === 'drink' || choice.action === 'drink-bowl') return 120;
  return REACH;
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
