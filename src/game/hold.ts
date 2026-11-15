import { hotbarSlots } from './craft';
import type { GameState, Tool } from './types';

export const CANT_HOLD = "Can't hold that";

export interface HoldResult {
  state: GameState;
  /** Name to flash, or the refusal line. */
  message: string;
  changed: boolean;
  openCraft: boolean;
}

/** What the hotbar slot and the icon in his hand both use. Null means empty hands. */
export function heldIcon(tool: Tool, ownsAxe: boolean, ownsHammer: boolean): { name: string; frame: string | null } {
  if (tool === 'hatchet') return { name: 'Hatchet', frame: 'hatchet' };
  if (tool === 'axe' && ownsAxe) return { name: 'Stone axe', frame: 'item_stone_axe' };
  if (tool === 'hammerstone' && ownsHammer) return { name: 'Hammerstone', frame: 'item_hammerstone' };
  if (tool === 'plan') return { name: 'Building plan', frame: null };
  return { name: 'Hands', frame: null };
}

/** Equip a hotbar slot. A refused tap keeps the old tool and says so. */
export function holdSlot(state: GameState, index: number): HoldResult {
  const slot = hotbarSlots(state)[index];
  if (!slot || slot.count >= 0) return { state, message: CANT_HOLD, changed: false, openCraft: false };
  if (slot.id === 'hands') return taken(state, 'hands', 'Hands');
  if (slot.id === 'hatchet') return taken(state, 'hatchet', 'Hatchet');
  if (slot.id === 'axe') {
    if (!state.inventory.axe) return { state, message: CANT_HOLD, changed: false, openCraft: false };
    return taken(state, 'axe', 'Stone axe');
  }
  if (slot.id === 'hammerstone') {
    if (!state.inventory.hammerstone) return { state, message: CANT_HOLD, changed: false, openCraft: false };
    return taken(state, 'hammerstone', 'Hammerstone');
  }
  if (slot.id === 'plan') return { ...taken(state, 'plan', 'Building plan'), openCraft: true };
  return { state, message: CANT_HOLD, changed: false, openCraft: false };
}

function taken(state: GameState, tool: Tool, name: string): HoldResult {
  return {
    state: state.tool === tool ? state : { ...state, tool },
    message: name,
    changed: state.tool !== tool,
    openCraft: false,
  };
}
