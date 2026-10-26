import { FIRE_TILE } from './constants';
import { chebyshev } from './iso';

function channel(color: number, shift: number): number {
  return (color >> shift) & 255;
}

export function lerpTint(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const mix = (shift: number) => Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * u);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function multiplyTint(a: number, b: number): number {
  const mix = (shift: number) => Math.round((channel(a, shift) * channel(b, shift)) / 255);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Multiply tint for the whole wood. Golden hour stays close to the painted colors. */
export function timeTint(minutes: number): number {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 16 && h < 18) return lerpTint(0xfff6ea, 0xf0d4b4, (h - 16) / 2);
  if (h >= 18 && h < 20) return lerpTint(0xf0d4b4, 0xa8b0c0, (h - 18) / 2);
  if (h >= 20 && h < 22) return lerpTint(0xa8b0c0, 0x7e8aa4, (h - 20) / 2);
  if (h >= 22) return lerpTint(0x7e8aa4, 0x66748f, Math.min(1, (h - 22) / 2));
  if (h < 5) return 0x66748f;
  if (h < 6) return lerpTint(0x66748f, 0xe4d2b8, h - 5);
  return 0xfff6ea;
}

export function lightTint(minutes: number, tx: number, ty: number, fireLit: boolean): number {
  const base = timeTint(minutes);
  if (!fireLit) return base;
  const d = chebyshev(tx, ty, FIRE_TILE.tx, FIRE_TILE.ty);
  if (d <= 1) return lerpTint(base, 0xffe4c4, 0.92);
  if (d === 2) return lerpTint(base, 0xffe4c4, 0.55);
  if (d === 3) return lerpTint(base, 0xffe4c4, 0.22);
  return base;
}

/** Opaque darkening of the ground tile under an object. Not a transparent shadow. */
export const SHADOW_TINT = 0x6a6158;

export function skyColor(minutes: number): string {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 16 && h < 18.5) return '#3a2c24';
  if (h >= 18.5 && h < 20.5) return '#242830';
  if (h >= 5 && h < 7) return '#3a342c';
  return '#141820';
}
