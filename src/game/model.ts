import {
  CORDAGE_ENERGY,
  FIBER_CORD,
  FIRE_ENERGY,
  LEAVES_ROOF,
  LIGHT_ENERGY,
  SHELTER_ENERGY,
  STICKS_FUEL,
  STICKS_KINDLING,
  STICKS_RIBS,
  STICKS_RIDGE,
  STONES_RING,
} from './constants';
import { NOTES, clockLabel, energyWord, untilDawn, warmthWord } from './copy';
import { atCamp, canWaitForDawn, warmthPerGameHour } from './rules';
import type { GameState } from './types';

export type SheetId = 'none' | 'title' | 'end' | 'pack' | 'make' | 'cordage' | 'lay';

export interface Step {
  section: string;
  note: string;
  label: string;
  detail: string;
  action?: string;
  enabled: boolean;
  done: boolean;
  then?: string;
}

export interface HudModel {
  time: string;
  until: string;
  warmth: number;
  energy: number;
  warmthLabel: string;
  energyLabel: string;
  lowWarmth: boolean;
  objective: string;
  tip: string;
  restLabel: string;
  restReady: boolean;
  sheet: SheetId;
  steps: Step[];
  pack: { label: string; count: number }[];
  endTitle: string;
  endBody: string;
}

export function objective(state: GameState): string {
  if (state.outcome === 'won') return 'Dawn is here.';
  if (state.outcome === 'lost') return 'The cold won.';
  if (state.warmth < 30) return 'Dangerously cold. Get into camp with a finished shelter and a fire.';
  const hour = (((state.minutes % 1440) + 1440) % 1440) / 60;
  const nightish = hour >= 19 || hour < 6;
  if (state.shelter >= 4 && state.fire.lit) {
    if (!atCamp(state.tx, state.ty)) return 'Get back to the fire. It only warms the camp.';
    return nightish ? 'Stay by the fire. Dawn will come.' : 'Camp is ready. You can wait for dawn from here.';
  }
  if (state.shelter >= 4) return 'The lean-to is up. Lay the fire on its open side.';
  if (state.fire.lit) return 'The fire is going. Finish the leaf cover on the lean-to.';
  if (state.shelter > 0) return 'Keep building the lean-to, then lay the fire.';
  if (nightish) return 'It is getting cold. You still need cordage, a lean-to, and a fire.';
  return 'Before dark: cordage, a lean-to, and a fire.';
}

function countDetail(have: number, need: number, name: string, energy: number, state: GameState): { enabled: boolean; detail: string } {
  if (have < need) return { enabled: false, detail: `Needs ${need} ${name}. You have ${have}.` };
  if (state.energy < energy) return { enabled: false, detail: 'Rest first. This takes some energy.' };
  return { enabled: true, detail: `Uses ${need} ${name}.` };
}

export function stepsFor(state: GameState): Step[] {
  if (state.shelter >= 4 && state.fire.lit) {
    return [
      {
        section: 'Camp',
        note: NOTES.ready,
        label: 'The camp will hold.',
        detail: atCamp(state.tx, state.ty) ? 'Tap Wait for dawn.' : 'Walk back to the clearing first.',
        enabled: false,
        done: true,
      },
    ];
  }

  const steps: Step[] = [];
  if (state.energy < 40) {
    steps.push({
      section: 'Breath',
      note: 'Work spends energy. Sitting gives it back. Time keeps moving while you sit.',
      label: 'Rest a moment',
      detail: 'Close this and catch your breath.',
      action: 'rest',
      enabled: true,
      done: false,
    });
  }

  if (state.inventory.cordage >= 1 && !state.cordageTwisted) {
    steps.push({
      section: 'Cordage',
      note: '',
      label: 'Cordage is ready.',
      detail: 'It will lash the ridge pole.',
      enabled: false,
      done: true,
    });
  } else if (state.cordageTwisted) {
    steps.push({
      section: 'Cordage',
      note: NOTES.cordage,
      label: 'Finish the cord',
      detail: 'The strands are twisted. Wrap them the other way.',
      action: 'cordage',
      enabled: true,
      done: false,
    });
  } else {
    const ready = countDetail(state.inventory.fiber, FIBER_CORD, 'fiber', CORDAGE_ENERGY, state);
    steps.push({
      section: 'Cordage',
      note: NOTES.cordage,
      label: 'Twist two strands',
      detail: ready.detail,
      action: 'cordage',
      enabled: ready.enabled,
      done: false,
    });
  }

  const shelterSteps: { label: string; note: string; then: string; need: number; have: number; name: string }[] = [
    {
      label: 'Set the ridge pole',
      note: NOTES.ridge,
      then: 'Then lash it, lay the ribs, and cover them with leaves.',
      need: STICKS_RIDGE,
      have: state.inventory.sticks,
      name: 'sticks',
    },
    {
      label: 'Lash the ridge',
      note: NOTES.lash,
      then: 'Then lay the ribs and cover them with leaves.',
      need: 1,
      have: state.inventory.cordage,
      name: 'cordage',
    },
    {
      label: 'Lay the ribs',
      note: NOTES.ribs,
      then: 'Then cover them with leaves.',
      need: STICKS_RIBS,
      have: state.inventory.sticks,
      name: 'sticks',
    },
    {
      label: 'Cover with leaves',
      note: NOTES.leaves,
      then: '',
      need: LEAVES_ROOF,
      have: state.inventory.leaves,
      name: 'leaf litter',
    },
  ];
  if (state.shelter >= 4) {
    steps.push({
      section: 'Lean-to',
      note: '',
      label: 'The lean-to is finished.',
      detail: 'Open side toward the fire.',
      enabled: false,
      done: true,
    });
  } else {
    const step = shelterSteps[state.shelter];
    const ready = countDetail(step.have, step.need, step.name, SHELTER_ENERGY, state);
    steps.push({
      section: 'Lean-to',
      note: step.note,
      label: step.label,
      detail: ready.detail,
      action: `shelter-${state.shelter + 1}`,
      enabled: ready.enabled,
      done: false,
      then: step.then,
    });
  }

  if (state.fire.lit) {
    steps.push({
      section: 'Fire',
      note: '',
      label: 'The fire is going.',
      detail: 'Stay close to it.',
      enabled: false,
      done: true,
    });
  } else if (!state.fire.ring) {
    const ready = countDetail(state.inventory.stones, STONES_RING, 'stones', FIRE_ENERGY, state);
    steps.push({
      section: 'Fire',
      note: NOTES.ring,
      label: 'Ring the fire with stones',
      detail: ready.detail,
      action: 'fire-ring',
      enabled: ready.enabled,
      done: false,
      then: 'Then tinder, kindling, a lay, and a light.',
    });
  } else if (!state.fire.tinder) {
    const ready = countDetail(state.inventory.tinder, 1, 'tinder', FIRE_ENERGY, state);
    steps.push({
      section: 'Fire',
      note: NOTES.tinder,
      label: 'Lay the tinder',
      detail: state.inventory.tinder < 1 ? 'Peel a curl of birch bark first.' : ready.detail,
      action: 'fire-tinder',
      enabled: ready.enabled,
      done: false,
      then: 'Then kindling, a lay, and a light.',
    });
  } else if (!state.fire.kindling) {
    const ready = countDetail(state.inventory.sticks, STICKS_KINDLING, 'sticks', FIRE_ENERGY, state);
    steps.push({
      section: 'Fire',
      note: NOTES.kindling,
      label: 'Add the kindling',
      detail: ready.detail,
      action: 'fire-kindling',
      enabled: ready.enabled,
      done: false,
      then: 'Then choose a tipi or a log cabin, and light it.',
    });
  } else if (state.fire.lay === 'none') {
    const ready = countDetail(state.inventory.sticks, STICKS_FUEL, 'sticks', FIRE_ENERGY, state);
    steps.push({
      section: 'Fire',
      note: NOTES.lay,
      label: 'Choose the lay',
      detail: ready.detail,
      action: 'lay',
      enabled: ready.enabled,
      done: false,
      then: 'Then light it.',
    });
  } else {
    const enabled = state.energy >= LIGHT_ENERGY;
    steps.push({
      section: 'Fire',
      note: NOTES.light,
      label: 'Light the fire',
      detail: enabled ? 'Tinder, kindling, and fuel are ready.' : 'Rest first. Lighting it takes some energy.',
      action: 'fire-light',
      enabled,
      done: false,
    });
  }

  return steps;
}

export function buildModel(state: GameState, sheet: SheetId, resting: boolean): HudModel {
  const perHour = warmthPerGameHour(state);
  const waiting = canWaitForDawn(state);
  let restLabel = 'Rest';
  if (resting && waiting) restLabel = 'Stop waiting';
  else if (resting) restLabel = 'Stop resting';
  else if (waiting) restLabel = 'Wait for dawn';

  return {
    time: clockLabel(state.minutes),
    until: untilDawn(state.minutes),
    warmth: state.warmth,
    energy: state.energy,
    warmthLabel: `${Math.round(state.warmth)} · ${warmthWord(perHour)}`,
    energyLabel: `${Math.round(state.energy)} · ${energyWord(state.energy)}`,
    lowWarmth: state.warmth < 30 && state.outcome === 'playing',
    objective: objective(state),
    tip: state.tip,
    restLabel,
    restReady: waiting && !resting,
    sheet,
    steps: stepsFor(state),
    pack: [
      { label: 'Sticks', count: state.inventory.sticks },
      { label: 'Stones', count: state.inventory.stones },
      { label: 'Fiber', count: state.inventory.fiber },
      { label: 'Cordage', count: state.inventory.cordage },
      { label: 'Tinder', count: state.inventory.tinder },
      { label: 'Leaf litter', count: state.inventory.leaves },
    ],
    endTitle: state.outcome === 'won' ? 'Dawn' : 'The cold won',
    endBody:
      state.outcome === 'won'
        ? 'You made it through the night, David. The lean-to broke the wind. The fire gave the heat back.'
        : 'Warmth ran out before the sun, David. Night takes the heat from anyone sitting in the open. A finished shelter and a fire, together, are what get you to dawn.',
  };
}
