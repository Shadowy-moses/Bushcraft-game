import { describe, expect, it } from 'vitest';
import atlas from '../assets/spritesheet.json';
import origins from '../assets/standins/origins.json';
import { ATLAS_FRAMES, frameOrigin, installAtlas, type AtlasFile } from '../src/game/atlas';

describe('artist atlas', () => {
  it('has every frame the game asks for, with a ground anchor', () => {
    expect(Object.keys(atlas.frames)).toHaveLength(84);
    expect(atlas.meta.size).toEqual({ w: 512, h: 288 });
    expect(atlas.meta.image).toBe('spritesheet.png');
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
    expect(atlas.animations.woodsman_walk).toEqual([
      'woodsman_se_walk_0',
      'woodsman_se_walk_1',
      'woodsman_se_walk_2',
      'woodsman_se_walk_3',
    ]);
    for (const dir of ['se', 'sw', 'ne', 'nw'] as const) {
      expect(atlas.animations[`woodsman_${dir}_idle`]).toEqual([
        `woodsman_${dir}_idle_0`,
        `woodsman_${dir}_idle_1`,
      ]);
      expect(atlas.animations[`woodsman_${dir}_walk`]).toHaveLength(4);
    }
    expect(atlas.animations.woodsman_se_gather).toEqual(['woodsman_se_gather_0']);
    expect(atlas.animations.woodsman_sw_gather).toEqual(['woodsman_sw_gather_0']);
    expect(atlas.animations.woodsman_se_chop).toEqual(['woodsman_se_chop_0', 'woodsman_se_chop_1']);
    expect(atlas.animations.woodsman_sw_chop).toEqual(['woodsman_sw_chop_0', 'woodsman_sw_chop_1']);
    expect(atlas.animations.woodsman_ne_chop).toEqual(['woodsman_ne_chop_0', 'woodsman_ne_chop_1']);
    expect(atlas.animations.woodsman_nw_chop).toEqual(['woodsman_nw_chop_0', 'woodsman_nw_chop_1']);
    expect('woodsman_ne_gather' in atlas.animations).toBe(false);
    for (const name of [
      'twig_foundation',
      'twig_foundation_ghost_ok',
      'twig_foundation_ghost_bad',
      'twig_wall_ne',
      'twig_wall_nw',
      'twig_door_ne',
      'twig_door_nw',
      'twig_floor',
      'pine_stump',
      'birch_stump',
      'felled_log',
    ]) {
      expect(atlas.frames[name as keyof typeof atlas.frames]?.anchorPx, name).toBeTruthy();
    }
    expect(atlas.frames.wood_chip_0.frame).toMatchObject({ w: 6, h: 6 });
    expect(atlas.frames.wood_chip_2.anchorPx).toEqual({ x: 3, y: 3 });
    expect(atlas.frames.stone_chip_0.anchorPx).toEqual({ x: 3, y: 3 });
    expect(atlas.frames.stone_chip_1.frame).toMatchObject({ w: 6, h: 6 });
    expect(atlas.frames.woodsman_se_idle_0.anchorPx).toEqual({ x: 16, y: 31 });
    expect(atlas.frames.woodsman_nw_walk_3.anchor).toEqual({ x: 0.5, y: 0.96875 });
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
