import { describe, expect, it } from 'vitest';
import atlas from '../assets/spritesheet.json';
import origins from '../assets/standins/origins.json';
import { ATLAS_FRAMES, frameOrigin, installAtlas, type AtlasFile } from '../src/game/atlas';

describe('artist atlas', () => {
  it('has every frame the game asks for, with a ground anchor', () => {
    expect(Object.keys(atlas.frames)).toHaveLength(150);
    expect(atlas.meta.size).toEqual({ w: 512, h: 444 });
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
    expect(atlas.frames.wood_chip_0.frame).toMatchObject({ w: 12, h: 12 });
    expect(atlas.frames.wood_chip_2.anchorPx).toEqual({ x: 6, y: 6 });
    expect(atlas.frames.stone_chip_0.anchorPx).toEqual({ x: 6, y: 6 });
    expect(atlas.frames.stone_chip_1.frame).toMatchObject({ w: 12, h: 12 });
    expect(atlas.frames.woodsman_se_idle_0.anchorPx).toEqual({ x: 16, y: 31 });
    for (const name of ['twig_wall_ne', 'twig_door_ne', 'twig_wall_ne_ghost_ok', 'twig_wall_ne_ghost_bad', 'twig_door_ne_ghost_ok', 'twig_door_ne_ghost_bad']) {
      expect(atlas.frames[name as keyof typeof atlas.frames].frame, name).toMatchObject({ w: 31, h: 39 });
      expect(atlas.frames[name as keyof typeof atlas.frames].anchorPx, name).toEqual({ x: 10, y: 36 });
    }
    for (const name of ['twig_wall_nw', 'twig_door_nw', 'twig_wall_nw_ghost_ok', 'twig_wall_nw_ghost_bad', 'twig_door_nw_ghost_ok', 'twig_door_nw_ghost_bad']) {
      expect(atlas.frames[name as keyof typeof atlas.frames].frame, name).toMatchObject({ w: 25, h: 39 });
      expect(atlas.frames[name as keyof typeof atlas.frames].anchorPx, name).toEqual({ x: 20, y: 36 });
    }
    expect(atlas.frames.rock_node_0.frame).toMatchObject({ w: 24, h: 20 });
    expect(atlas.frames.rock_node_rubble.anchorPx).toEqual({ x: 12, y: 19 });
    expect(atlas.frames.item_hammerstone.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.item_flake.frame).toMatchObject({ w: 16, h: 16 });
    expect(atlas.frames.item_rock.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.river_cobbles.frame).toMatchObject({ w: 24, h: 14 });
    expect(atlas.frames.river_cobbles.anchorPx).toEqual({ x: 12, y: 12 });
    expect(atlas.frames.flint_core_0.frame).toMatchObject({ w: 20, h: 16 });
    expect(atlas.frames.flint_core_2.anchorPx).toEqual({ x: 10, y: 15 });
    expect(atlas.frames.item_flint_core.frame).toMatchObject({ w: 16, h: 16 });
    expect(atlas.frames.bush_fiber_cut.frame).toMatchObject({ w: 20, h: 24 });
    expect(atlas.frames.bush_fiber_cut.anchorPx).toEqual({ x: 10, y: 22 });
    expect(atlas.frames.item_fiber.frame).toMatchObject({ w: 16, h: 16 });
    expect(atlas.frames.item_cordage.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.lashed_tripod.frame).toMatchObject({ w: 36, h: 44 });
    expect(atlas.frames.lashed_tripod.anchorPx).toEqual({ x: 18, y: 40 });
    expect(atlas.frames.bowdrill_0.frame).toMatchObject({ w: 28, h: 24 });
    expect(atlas.frames.bowdrill_1.anchorPx).toEqual({ x: 14, y: 20 });
    expect(atlas.frames.bowdrill_coal.anchorPx).toEqual({ x: 14, y: 20 });
    expect(atlas.frames.item_bowdrill_kit.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.item_tinder.frame).toMatchObject({ w: 16, h: 16 });
    expect(atlas.frames.item_kindling.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.item_coal.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.item_tinder_lit_0.frame).toMatchObject({ w: 16, h: 16 });
    expect(atlas.frames.item_tinder_lit_1.anchorPx).toEqual({ x: 8, y: 12 });
    expect(atlas.frames.stone_wall_ne.frame).toMatchObject({ w: 31, h: 39 });
    expect(atlas.frames.stone_wall_ne.anchorPx).toEqual({ x: 10, y: 36 });
    expect(atlas.frames.woodsman_se_strike_0.anchorPx).toEqual({ x: 16, y: 31 });
    expect(atlas.animations.woodsman_se_strike).toEqual(['woodsman_se_strike_0', 'woodsman_se_strike_1']);
    expect(atlas.animations.woodsman_nw_strike).toEqual(['woodsman_nw_strike_0', 'woodsman_nw_strike_1']);
    expect(atlas.frames.woodsman_nw_walk_3.anchor).toEqual({ x: 0.5, y: 0.96875 });
    expect(atlas.animations.fire_tipi_lit).toEqual(['fire_tipi_lit_0', 'fire_tipi_lit_1']);
    expect(atlas.animations.fire_logcabin_lit).toEqual(['fire_logcabin_lit_0', 'fire_logcabin_lit_1']);
    expect(atlas.frames.leanto_frame.frame.w).toBe(64);
    expect(atlas.frames.grass.frame).toMatchObject({ w: 32, h: 16 });
    expect(atlas.frames.fire_tipi_embers_0.frame).toMatchObject({ w: 32, h: 40 });
    expect(atlas.frames.fire_tipi_embers_0.anchorPx).toEqual({ x: 16, y: 32 });
    expect(atlas.frames.firelight_0.frame).toMatchObject({ w: 96, h: 48 });
    expect(atlas.frames.firelight_0.anchorPx).toEqual({ x: 48, y: 24 });
    expect(atlas.frames.warmth_ring.frame).toMatchObject({ w: 116, h: 60 });
    expect(atlas.frames.warmth_ring.anchorPx).toEqual({ x: 58, y: 30 });
    expect(atlas.frames.tripod_boughs.anchorPx).toEqual({ x: 18, y: 40 });
    expect(atlas.frames.tripod_bark.frame).toMatchObject({ w: 36, h: 44 });
    expect(atlas.frames.twig_foundation_worn.anchorPx).toEqual({ x: 19, y: 22 });
    expect(atlas.frames.twig_wall_ne_worn.frame).toMatchObject({ w: 31, h: 39 });
    expect(atlas.frames.rain_drop.frame).toMatchObject({ w: 4, h: 10 });
    expect(atlas.frames.puddle.anchorPx).toEqual({ x: 14, y: 6 });
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
