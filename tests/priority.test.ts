import { describe, expect, it } from 'vitest';
import { actionLabel, chooseTarget } from '../src/game/use';
import { tileToWorld } from '../src/game/iso';
import { PROPS } from '../src/game/map';
import { emptyInventory, initialState } from '../src/game/rules';
import type { GameState, Prop } from '../src/game/types';

function at(tx: number, ty: number, extra: Partial<GameState> = {}): GameState {
  return { ...initialState(), ...tileToWorld(tx, ty), tx, ty, tool: 'hands', energy: 100, ...extra };
}

const fire = { kind: 'fire' as const, tx: 2, ty: 9, edge: 'se' as const, lit: true, fuel: 40 };
const cattail = PROPS.find((prop) => prop.kind === 'cattails')!;
const cobble = PROPS.find((prop) => prop.id === 'river_cobbles-2-8')!;

describe('one target order for Use, taps, and the hint', () => {
  const rows: { name: string; state: GameState; focus?: Prop; action: string; hint: string }[] = [
    {
      name: 'a boiled bowl beats the fire',
      state: at(2, 9, { inventory: { ...emptyInventory(), bowl: true, wood: 4 }, bowlWater: 'boiled', pieces: [fire] }),
      action: 'drink-bowl',
      hint: 'Drink',
    },
    {
      name: 'a boiled pot in the pack beats the creek',
      state: at(2, 9, { inventory: { ...emptyInventory(), pot: 2 }, cupWater: 'boiled' }),
      action: 'drink',
      hint: 'Drink',
    },
    {
      name: 'the fire beats the creek',
      state: at(2, 9, { inventory: { ...emptyInventory(), wood: 2 }, pieces: [fire] }),
      action: 'feed',
      hint: 'Feed the fire',
    },
    {
      name: 'the fire beats a plant',
      state: at(cattail.tx, cattail.ty, {
        inventory: { ...emptyInventory(), wood: 2 },
        pieces: [{ ...fire, tx: cattail.tx, ty: cattail.ty }],
      }),
      action: 'feed',
      hint: 'Feed the fire',
    },
    {
      name: 'the creek beats forage',
      state: at(2, 9),
      action: 'drink-creek',
      hint: 'Drink',
    },
    {
      name: 'a plant is taken when the creek and the fire are not',
      state: at(cattail.tx, cattail.ty),
      action: 'gather',
      hint: 'Pull cattail',
    },
    {
      name: 'a tapped cobble is picked up even beside the creek',
      state: at(cobble.tx, cobble.ty),
      focus: cobble,
      action: 'gather',
      hint: 'Gather',
    },
    {
      name: 'the hatchet still chops when nothing above it is the target',
      state: at(6, 2, { tool: 'hatchet' }),
      action: 'chop',
      hint: 'Chop',
    },
  ];

  it.each(rows)('$name', ({ state, focus, action, hint }) => {
    const choice = chooseTarget(state, { x: state.x, y: state.y }, focus);
    expect(choice.action).toBe(action);
    expect(actionLabel(choice)).toBe(hint);
  });
});
