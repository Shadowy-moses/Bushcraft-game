import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../src/game/constants';
import { tileToWorld, worldToTile } from '../src/game/iso';

describe('isometric tiles', () => {
  it('round-trips every tile center', () => {
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const world = tileToWorld(tx, ty);
        const back = worldToTile(world.x, world.y);
        expect(back).toEqual({ tx, ty });
      }
    }
  });

  it('keeps a horizontal pair of tiles on the same row', () => {
    const a = tileToWorld(5, 3);
    const b = tileToWorld(6, 2);
    expect(a.y).toBe(b.y);
    expect(Math.abs(a.x - b.x)).toBe(32);
  });
});
