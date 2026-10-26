import { DAWN_MINUTES } from './constants';
import type { GatherKind } from './types';

export const OPENING_TIP =
  'Golden hour. Night will take your warmth. A lean-to and a fire give it back.';

export const REST_TIP =
  'Sit a minute. Time still moves. Out in the night, with no shelter and no fire, the cold finds you.';

export const WAIT_TIP =
  'Stay under the lean-to, out of the wind, and let the fire work. Dawn will come.';

export const TOO_COLD = 'Too cold to keep sitting. Get the fire going, or get back to it.';

export const HEADING = 'Heading over.';

export const NOTES = {
  cordage:
    'Take two strands of bark or nettle. Twist each strand the same way, then wrap the pair the other way. The twist fights the wrap, and that lock is what holds the cord. This is a reverse wrap.',
  ridge:
    'The ridge pole is the backbone of a lean-to. Set it across two supports, about chest high, with the open side toward the fire.',
  lash:
    'A square lashing binds two poles that cross. Wrap the cord around both, then pull a few wraps across the joint so they bite. The ridge should not be able to roll.',
  ribs:
    'Lean the ribs against the ridge, close together, on the windward side. They are the bones the leaves sit on. Ribs alone will not stop the wind.',
  leaves:
    'Pile leaves, needles, and duff on the ribs until you cannot see daylight through them. As deep as your hand is long. Start at the bottom and work up, like shingles.',
  ring:
    'Lay a ring of dry stones from the forest floor, not from the creek. A wet rock can crack in the fire. Keep the ring small.',
  tinder:
    'Set the birch bark in the middle, loose and airy. It lights even when the woods are damp. It has to catch before anything else will.',
  kindling:
    'Kindling is pencil-thin to finger-thin. It catches from the tinder and carries the flame up to the fuel wood.',
  lay:
    'A tipi is sticks leaned like a tent over the tinder. Air rises through the middle, so it lights fast when the wind is quiet. A log cabin is sticks stacked in a square. It stands a breeze better and burns a little slower.',
  light:
    'Light the tinder on the upwind side and let the flame climb into the kindling. Kneel close, so your body blocks the wind.',
  ready:
    'The lean-to breaks the wind and holds a little warm air. The fire gives the heat back. Stay close, on the open side.',
} as const;

export function clockLabel(minutes: number): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(day / 60);
  const m = Math.floor(day % 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const hm = `${h12}:${m.toString().padStart(2, '0')}`;
  if (h24 >= 5 && h24 < 12) return `${hm} in the morning`;
  if (h24 >= 12 && h24 < 17) return `${hm} in the afternoon`;
  if (h24 >= 17 && h24 < 20) return `${hm} in the evening`;
  return `${hm} at night`;
}

export function untilDawn(minutes: number): string {
  const left = Math.max(0, DAWN_MINUTES - minutes);
  const h = Math.floor(left / 60);
  const m = Math.floor(left % 60);
  if (left < 1) return 'Dawn';
  if (h <= 0) return `${m} minutes until dawn`;
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  if (m === 0) return `${hours} until dawn`;
  return `${hours} ${m} minutes until dawn`;
}

export function warmthWord(perHour: number): string {
  if (perHour >= 1) return 'coming back';
  if (perHour > -1) return 'holding';
  if (perHour > -10) return 'slipping';
  return 'falling fast';
}

export function energyWord(energy: number): string {
  if (energy >= 80) return 'ready';
  if (energy >= 40) return 'tiring';
  if (energy >= 15) return 'low';
  return 'worn out';
}

export function gatherMessage(kind: GatherKind, count: number, first: boolean): string {
  if (!first) {
    if (kind === 'sticks') return `Picked up sticks. You have ${count}.`;
    if (kind === 'stones') return `Picked up a stone. You have ${count}.`;
    if (kind === 'fiber') return `Picked up fiber. You have ${count}.`;
    if (kind === 'leaves') return `Gathered leaves. You have ${count}.`;
    return 'You have tinder already.';
  }
  switch (kind) {
    case 'sticks':
      return `Picked up sticks. You have ${count}. Dead wood that snaps is what you want. If it bends, it is green. Leave it.`;
    case 'stones':
      return `Picked up a stone. You have ${count}. Take them from the forest floor. Creek stones can crack in a fire.`;
    case 'fiber':
      return `Picked up plant fiber. You have ${count}. Nettle and inner bark both twist into cordage. Keep it dry.`;
    case 'tinder':
      return 'Peeled a curl of birch bark. It lights even when the day is damp. Don’t cut a ring all the way around the trunk.';
    case 'leaves':
      return `Gathered leaf litter. You have ${count}. The roof wants a mat as deep as your hand is long.`;
  }
}
