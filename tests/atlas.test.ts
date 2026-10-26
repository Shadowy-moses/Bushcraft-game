import { describe, expect, it } from 'vitest';
import atlas from '../assets/spritesheet.json';
import origins from '../assets/standins/origins.json';
import { ATLAS_FRAMES, frameOrigin, installAtlas, type AtlasFile } from '../src/game/atlas';

describe('artist atlas', () => {
  it('has every frame the game asks for, with a ground anchor', () => {
    expect(Object.keys(atlas.frames)).toHaveLength(24);
    for (const name of ATLAS_FRAMES) {
      const frame = atlas.frames[name as keyof typeof atlas.frames];
      expect(frame, name).toBeTruthy();
      expect(frame.anchor.x).toBeGreaterThanOrEqual(0);
      expect(frame.anchor.x).toBeLessThanOrEqual(1);
      expect(frame.anchor.y).toBeGreaterThanOrEqual(0);
      expect(frame.anchor.y).toBeLessThanOrEqual(1);
    }
  });

  it('names the walk and fire flickers the game plays', () => {
    for (const frame of atlas.animations.woodsman_walk) {
      expect(atlas.frames[frame as keyof typeof atlas.frames]).toBeTruthy();
    }
    expect(atlas.animations.fire_tipi_lit).toEqual(['fire_tipi_lit_0', 'fire_tipi_lit_1']);
    expect(atlas.animations.fire_logcabin_lit).toEqual(['fire_logcabin_lit_0', 'fire_logcabin_lit_1']);
    expect(atlas.frames.leanto_frame.frame.w).toBe(64);
    expect(atlas.frames.grass.frame).toMatchObject({ w: 32, h: 16 });
  });

  it('reads the woodsman feet from the atlas instead of a fixed offset', () => {
    installAtlas(atlas as AtlasFile);
    expect(frameOrigin('woodsman_idle')).toEqual(atlas.frames.woodsman_idle.anchor);
    expect(frameOrigin('missing')).toEqual({ x: 0.5, y: 1 });
    installAtlas({
      frames: {
        feet: { anchorPx: { x: 16, y: 31 }, sourceSize: { w: 32, h: 40 } },
      },
    });
    expect(frameOrigin('feet')).toEqual({ x: 16 / 32, y: 31 / 40 });
    installAtlas(atlas as AtlasFile);
  });

  it('gives stand-ins the same kind of anchor', () => {
    for (const name of ['shelter_ridge', 'shelter_lashed', 'leaf_pile', 'tile_marker']) {
      const origin = origins[name as keyof typeof origins];
      expect(origin.x).toBeGreaterThan(0);
      expect(origin.y).toBeGreaterThan(0);
    }
    expect(origins.shelter_ridge).toEqual(origins.shelter_lashed);
  });
});
