export const OPENING_TIP =
  'The stick on the left walks you. Stand by a tree and tap it, or tap Use. The hatchet is already in your hand.';

export const REST_TIP = 'Sit a minute. The work can wait. Warmth is only a reading now.';

export const HEADING = 'Heading over.';

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

/** Compact clock for the corner. The longer sentence stays on the title and tips. */
export function clockParts(minutes: number): { clock: string; daypart: string } {
  const day = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(day / 60);
  const m = Math.floor(day % 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const clock = `${h12}:${m.toString().padStart(2, '0')}`;
  if (h24 >= 5 && h24 < 12) return { clock, daypart: 'Morning' };
  if (h24 >= 12 && h24 < 17) return { clock, daypart: 'Afternoon' };
  if (h24 >= 17 && h24 < 20) return { clock, daypart: 'Evening' };
  return { clock, daypart: 'Night' };
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
