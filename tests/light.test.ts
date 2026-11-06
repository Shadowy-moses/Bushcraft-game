import { describe, expect, it } from 'vitest';
import { timeTint } from '../src/game/light';

function channels(color: number): number {
  return ((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255);
}

describe('night light', () => {
  it('lifts the night so the woodsman still reads, without turning it into day', () => {
    const night = timeTint(23 * 60);
    const day = timeTint(12 * 60);
    const pitch = 0x66748f;
    expect(channels(night)).toBeGreaterThan(channels(pitch));
    expect(channels(night)).toBeLessThan(channels(day) * 0.75);
    expect(night).not.toBe(day);
  });
});
