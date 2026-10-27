import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/game/iso';
import { facingFromDelta, facingFromSave, facingFromVector, mirrorFacing, poseClip, poseName, workFacing } from '../src/game/woodsman';

function step(fromX: number, fromY: number, toX: number, toY: number) {
  const a = tileToWorld(fromX, fromY);
  const b = tileToWorld(toX, toY);
  return facingFromDelta(b.x - a.x, b.y - a.y, 'se');
}

describe('woodsman facing', () => {
  it('follows the four tile steps instead of a flip', () => {
    expect(step(7, 5, 8, 5)).toBe('se');
    expect(step(7, 5, 7, 6)).toBe('sw');
    expect(step(7, 5, 7, 4)).toBe('ne');
    expect(step(7, 5, 6, 5)).toBe('nw');
  });

  it('keeps the current facing when he has not moved', () => {
    expect(facingFromDelta(0, 0, 'nw')).toBe('nw');
    expect(facingFromVector(0, 0, 'nw')).toBe('nw');
  });

  it('picks the nearest of the four facings for a free step', () => {
    expect(facingFromVector(1, 0.5, 'nw')).toBe('se');
    expect(facingFromVector(-1, 0.5, 'se')).toBe('sw');
    expect(facingFromVector(1, -0.5, 'sw')).toBe('ne');
    expect(facingFromVector(-1, -0.5, 'se')).toBe('nw');
    expect(facingFromVector(1, 0, 'sw')).toBe('se');
    expect(facingFromVector(0, 1, 'ne')).toBe('se');
  });

  it('borrows the near gather and chop when he faces away', () => {
    expect(workFacing('se')).toBe('se');
    expect(workFacing('ne')).toBe('se');
    expect(workFacing('sw')).toBe('sw');
    expect(workFacing('nw')).toBe('sw');
    expect(poseName('ne', 'walk')).toBe('woodsman_ne_walk');
    expect(poseName('ne', 'gather')).toBe('woodsman_se_gather');
    expect(poseName('nw', 'chop')).toBe('woodsman_nw_chop');
    expect(poseName('ne', 'chop')).toBe('woodsman_ne_chop');
    expect(poseName('sw', 'idle')).toBe('woodsman_sw_idle');
  });

  it('plays the painted clip, and borrows a near pose when that side was not drawn', () => {
    const anims = new Set([
      'woodsman_se_idle',
      'woodsman_sw_idle',
      'woodsman_ne_idle',
      'woodsman_nw_idle',
      'woodsman_se_walk',
      'woodsman_sw_walk',
      'woodsman_ne_walk',
      'woodsman_nw_walk',
      'woodsman_walk',
    ]);
    const frames = new Set([
      'woodsman_idle',
      'woodsman_walk_0',
      'woodsman_walk_1',
      'woodsman_se_gather',
      'woodsman_sw_gather',
      'woodsman_se_chop',
      'woodsman_sw_chop',
    ]);
    const hasAnim = (key: string) => anims.has(key);
    const hasFrame = (key: string) => frames.has(key);
    expect(poseClip('ne', 'walk', hasAnim, hasFrame)).toEqual({ kind: 'anim', key: 'woodsman_ne_walk' });
    expect(poseClip('se', 'idle', hasAnim, hasFrame)).toEqual({ kind: 'anim', key: 'woodsman_se_idle' });
    expect(poseClip('ne', 'gather', hasAnim, hasFrame)).toEqual({ kind: 'frame', key: 'woodsman_se_gather' });
    expect(poseClip('nw', 'chop', hasAnim, hasFrame)).toEqual({ kind: 'frame', key: 'woodsman_sw_chop' });
    expect(poseClip('sw', 'chop', hasAnim, hasFrame)).toEqual({ kind: 'frame', key: 'woodsman_sw_chop' });
    const fourChop = (key: string) => key.startsWith('woodsman_') && key.endsWith('_chop');
    expect(poseClip('nw', 'chop', fourChop, () => false)).toEqual({ kind: 'anim', key: 'woodsman_nw_chop' });
    expect(poseClip('ne', 'chop', fourChop, () => false)).toEqual({ kind: 'anim', key: 'woodsman_ne_chop' });

    const oldAnim = (key: string) => key === 'woodsman_walk';
    const oldFrame = (key: string) => key === 'woodsman_idle' || key === 'woodsman_walk_0' || key === 'woodsman_walk_1';
    expect(poseClip('se', 'walk', oldAnim, oldFrame)).toEqual({ kind: 'anim', key: 'woodsman_walk' });
    expect(poseClip('nw', 'idle', oldAnim, oldFrame)).toEqual({ kind: 'frame', key: 'woodsman_idle' });
    expect(poseClip('se', 'gather', oldAnim, oldFrame)).toEqual({ kind: 'frame', key: 'woodsman_idle' });
    expect(mirrorFacing('sw', false)).toBe(true);
    expect(mirrorFacing('nw', false)).toBe(true);
    expect(mirrorFacing('se', false)).toBe(false);
    expect(mirrorFacing('ne', false)).toBe(false);
    expect(mirrorFacing('sw', true)).toBe(false);
    expect(mirrorFacing('nw', true)).toBe(false);
  });

  it('reads an old left-facing save as southwest', () => {
    expect(facingFromSave(undefined, false)).toBe('se');
    expect(facingFromSave(undefined, true)).toBe('sw');
    expect(facingFromSave('nw', true)).toBe('nw');
  });
});
