/** Original 16×16 pixel marks in the bushcraft palette. Not taken from another game. */

const INK = '#e8e0c8';
const BARK = '#8a5a34';
const DEEP = '#3b2620';
const MOSS = '#7a9a44';
const CLAY = '#c4401c';
const FIRE = '#f08a24';
const GOLD = '#ffd25a';
const CREAM = '#c08a5a';
const SLATE = '#6e7680';

export function pixelIcon(rows: string[]): string {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const rects: string[] = [];
  const color: Record<string, string> = {
    i: INK,
    b: BARK,
    d: DEEP,
    m: MOSS,
    c: CLAY,
    f: FIRE,
    g: GOLD,
    k: CREAM,
    s: SLATE,
  };
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x++) {
      const fill = color[row[x] ?? ''];
      if (!fill) continue;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
    }
  }
  return `<svg class="pixel" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
}

export const ICONS: Record<string, string> = {
  health: pixelIcon([
    '................',
    '................',
    '....cc....cc....',
    '...cccc..cccc...',
    '...cccccccccc...',
    '....cccccccc....',
    '.....cccccc.....',
    '......cccc......',
    '.......cc.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  warmth: pixelIcon([
    '................',
    '.......g........',
    '......ggg.......',
    '.....gfgfg......',
    '.....ffffg......',
    '....ffcfffg.....',
    '....ffcfffg.....',
    '....fffffff.....',
    '.....fffff......',
    '......fff.......',
    '.......f........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  energy: pixelIcon([
    '................',
    '.......mm.......',
    '......mmm.......',
    '.....mmmm.......',
    '....mmmmmm......',
    '...mmmmmmm......',
    '....mmmm........',
    '.....mmmm.......',
    '......mmm.......',
    '.......mm.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  bag: pixelIcon([
    '................',
    '......bbbb......',
    '.....b....b.....',
    '....bbbbbbbb....',
    '...bkkkkkkkb....',
    '...bkkkkkkkb....',
    '...bkibbikkb....',
    '...bkkkkkkkb....',
    '...bkkkkkkkb....',
    '...bbbbbbbbb....',
    '....b......b....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  hands: pixelIcon([
    '................',
    '....ii....ii....',
    '...iii....iii...',
    '...iii....iii...',
    '....iiiiiiii....',
    '.....iiiiii.....',
    '......iiii......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  item_tinder: pixelIcon([
    '................',
    '......kkkk......',
    '.....kkkkkk.....',
    '....kkgkkkk.....',
    '...kkkkkkkk.....',
    '..kkkkkkkkk.....',
    '...kkkkkkk......',
    '....kkkkk.......',
    '.....kkk........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  item_leaves: pixelIcon([
    '................',
    '.....mmm........',
    '....mmmmm.......',
    '...mmmmmmm......',
    '..mmmmmmmm......',
    '...mmmmmm.......',
    '.....mmm........',
    '......m.........',
    '......d.........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
};
