/** Strikes to work a rock node down to rubble. A tree falls in three. */
export const ROCK_HITS = 5;

/** Stone from this strike. The last blow drops one extra. A node totals 6. */
export function stoneFromStrike(hit: number): number {
  return hit >= ROCK_HITS ? 2 : 1;
}

/** About half the nodes hide a flint flake in the last blow. */
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
