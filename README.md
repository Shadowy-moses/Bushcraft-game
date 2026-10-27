# First Night

A small bushcraft game for David. It is late afternoon in a patch of woods. Chop trees, then raise a twig shelter on the block.

You can play it in Safari on an iPhone, or in a desktop browser. Progress is saved on the phone itself.

## How to play

The hatchet starts in the first hotbar slot. On a phone, the thumbstick on the left walks you in any direction. On a desktop, WASD or the arrow keys do the same. He turns to the nearest of his four facings and walks. Trees, stumps, rocks, water, and solid walls stop him. A doorway is a gap he can walk through.

Stand next to a tree and tap it, or tap Use. The nearest trunk in reach picks up a gold ring. Every trunk on the block can be chopped, including the ones tucked behind another canopy. Three swings bring it down, a stump stays where the tree stood, and the pack gains 3 to 5 wood. A small line such as `+4 Wood` floats off the trunk. Stumps grow back after a few minutes, unless a foundation covers that tile. Use also picks up a stick when you are standing on it. The afternoon runs long enough to raise a small hut. Building still works when the energy bar says tired.

The bag, or the building plan in the second slot, opens the crafting bench. Construction has four pieces, all paid in wood:

- Foundation. A square on the grid. The first one sits on clear ground. The next one snaps to a foundation already down.
- Wall. Twig wall along a foundation edge. Rotate it to the side you want. A solid wall stops you walking through.
- Doorway. The same wall with a gap you can walk through.
- Floor. A pole floor on top of the walls. It is also the roof of the room under it.

Green means the piece can sit there. Red means it cannot. Confirm, and he walks over and puts it up. Cancel leaves it.

Warmth and energy still show in the corner. Warmth drifts with the hour and does not end the day. Energy comes back when you rest. Health stays full.

## On an iPhone

Open the GitHub Pages site in Safari. Tap Share, then **Add to Home Screen**. It opens full screen, like an app. Either way up works.

Play it at https://shadowy-moses.github.io/Bushcraft-game/. Pages deploys from GitHub Actions.

## Pictures

The painted tiles live in `assets/spritesheet.png` and `assets/spritesheet.json`, a 512×255 sheet with 79 frames. The woodsman has a painted idle and walk for southeast, southwest, northeast, and northwest, and the game shows that picture instead of flipping it. Picking something up holds the gather pose, which is painted for the two near sides. Chopping plays a two-frame swing in all four directions. Each frame’s `anchor` (or `anchorPx`) is the spot where it meets the ground, and the game uses that. The older woodsman names still mean the southeast view. The camera is an integer 3× zoom with crisp pixels. The HUD is HTML and stays at its own size. There are no soft shadows; the ground tile under an object is darkened instead.

The twig foundation, walls, doorway, and floor, including the green and red placement previews, are frames on that sheet (`twig_foundation`, `twig_wall_ne` / `twig_wall_nw`, `twig_door_ne` / `twig_door_nw`, `twig_floor`). A felled pine or birch leaves `felled_log` for a moment, then `pine_stump` or `birch_stump`.

`assets/standins/` still holds leaf piles and the tile you are walking to. `assets/standins/origins.json` is where each one sits on the ground.

## On a computer

```bash
npm install
npm test
npm run dev
```

The dev site is at `http://localhost:5173/Bushcraft-game/`.

```bash
npm run build
npm run preview
```

## Later, as an iPhone app

Capacitor is not set up. The game is a static site with no server, and saves go in `localStorage`, which a Capacitor app can keep using. To wrap it later, build with relative asset paths:

```bash
VITE_BASE_PATH=./ npm run build
```

Point Capacitor at the `dist` folder. No rewrite of the game.
