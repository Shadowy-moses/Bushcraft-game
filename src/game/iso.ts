import { TILE_H, TILE_W } from './constants';

export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2),
  };
}

export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  const tx = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
  const ty = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
  return { tx: Math.round(tx), ty: Math.round(ty) };
}

/** Painter's order. Higher ground (larger world y) draws in front. */
export function depthFor(worldY: number, bias = 0): number {
  return Math.round(worldY * 10) + bias;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
