/** Strikes to work a rock node down to rubble. A tree falls in three. */
export const ROCK_HITS = 5;

/** Stone from this strike. The last blow drops one extra. A node totals 6. */
export function stoneFromStrike(hit: number): number {
  return hit >= ROCK_HITS ? 2 : 1;
}

/** Two knaps walk a core from fresh to spent. The second blow drops 1 or 2 flakes. */
export const CORE_KNAPS = 2;

export function flakesFromKnap(id: string, hit: number): number {
  if (hit < CORE_KNAPS) return 1;
  return flakeOnLastStrike(id) ? 2 : 1;
}

export function flintFrame(hits: number): string {
  if (hits >= CORE_KNAPS) return 'flint_core_2';
  if (hits === 1) return 'flint_core_1';
  return 'flint_core_0';
}

/** About half the cores drop an extra flake on the last knap. */
export function flakeOnLastStrike(id: string): boolean {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0;
}

export function rockFrame(hits: number): string {
  if (hits >= ROCK_HITS) return 'rock_node_rubble';
  if (hits >= 3) return 'rock_node_2';
  if (hits >= 1) return 'rock_node_1';
  return 'rock_node_0';
}
