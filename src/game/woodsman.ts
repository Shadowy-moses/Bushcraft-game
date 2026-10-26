/** Screen-diagonal facings. Tile steps land on one of these. */
export type Facing = 'se' | 'sw' | 'ne' | 'nw';

export function isFacing(value: unknown): value is Facing {
  return value === 'se' || value === 'sw' || value === 'ne' || value === 'nw';
}

/**
 * Pick a facing from a step in world pixels.
 * +tile-x is down-right (se), +tile-y is down-left (sw).
 */
export function facingFromDelta(dx: number, dy: number, current: Facing): Facing {
  if (dx === 0 && dy === 0) return current;
  if (dy >= 0) return dx >= 0 ? 'se' : 'sw';
  return dx >= 0 ? 'ne' : 'nw';
}

/** Gather and chop were painted for the two near sides. The far side uses that same side. */
export function workFacing(facing: Facing): 'se' | 'sw' {
  return facing === 'sw' || facing === 'nw' ? 'sw' : 'se';
}

export type Pose = 'idle' | 'walk' | 'gather' | 'chop';

export function poseName(facing: Facing, pose: Pose): string {
  const dir = pose === 'gather' || pose === 'chop' ? workFacing(facing) : facing;
  return `woodsman_${dir}_${pose}`;
}

export interface PoseClip {
  kind: 'anim' | 'frame';
  key: string;
}

/**
 * Idle and walk prefer the directional animation.
 * Gather and chop are single frames, and only the near sides were painted.
 * Older sheets still have woodsman_idle and woodsman_walk.
 */
export function poseClip(
  facing: Facing,
  pose: Pose,
  hasAnim: (key: string) => boolean,
  hasFrame: (key: string) => boolean,
): PoseClip {
  const preferred = poseName(facing, pose);
  if (pose === 'walk') {
    if (hasAnim(preferred)) return { kind: 'anim', key: preferred };
    if (hasAnim('woodsman_walk')) return { kind: 'anim', key: 'woodsman_walk' };
  } else if (pose === 'idle') {
    if (hasAnim(preferred)) return { kind: 'anim', key: preferred };
  } else if (hasAnim(preferred)) {
    return { kind: 'anim', key: preferred };
  }
  if (hasFrame(preferred)) return { kind: 'frame', key: preferred };
  if (pose === 'idle' && hasFrame('woodsman_idle')) return { kind: 'frame', key: 'woodsman_idle' };
  if (hasAnim('woodsman_se_idle')) return { kind: 'anim', key: 'woodsman_se_idle' };
  return { kind: 'frame', key: 'woodsman_idle' };
}

/** Mirror the southeast painting only when this facing was not drawn on the sheet. */
export function mirrorFacing(facing: Facing, hasOwnPose: boolean): boolean {
  if (hasOwnPose) return false;
  return facing === 'sw' || facing === 'nw';
}

/** Older saves stored a left/right flip. The unflipped sheet was the southeast view. */
export function facingFromSave(facing: unknown, faceLeft: unknown): Facing {
  if (isFacing(facing)) return facing;
  return faceLeft === true ? 'sw' : 'se';
}
