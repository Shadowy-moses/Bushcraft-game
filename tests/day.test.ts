import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/game/iso';
import { bodiesFor, resolveMove } from '../src/game/move';
import { initialState, tick } from '../src/game/rules';
import { weatherAt } from '../src/game/weather';

describe('a full day of weather', () => {
  it('keeps the clock moving through every change, and rain makes him damp', () => {
    let state = initialState();
    const seen = new Set<string>();
    let dampInRain = 0;
    for (let step = 0; step < 48; step++) {
      const before = state.minutes;
      state = tick(state, 30);
      expect(state.minutes).toBeGreaterThan(before);
      const weather = weatherAt(state.minutes);
      seen.add(weather);
      if (weather === 'rain') dampInRain = state.damp;
    }
    expect(state.minutes - initialState().minutes).toBeCloseTo(1440);
    expect(seen.has('clear')).toBe(true);
    expect(seen.has('overcast')).toBe(true);
    expect(seen.has('rain')).toBe(true);
    expect(seen.has('wind')).toBe(true);
    expect(dampInRain).toBeGreaterThan(0);

    const intoRain = tick({ ...initialState(), minutes: 20 * 60 - 1 }, 5);
    expect(intoRain.minutes).toBeGreaterThan(20 * 60);
    expect(weatherAt(intoRain.minutes)).toBe('rain');
    expect(intoRain.damp).toBeGreaterThan(0);

    const open = tileToWorld(7, 5);
    const moved = resolveMove(open.x, open.y, 24, 0, bodiesFor(intoRain), []);
    expect(Math.hypot(moved.x - open.x, moved.y - open.y)).toBeGreaterThan(8);
  });
});
