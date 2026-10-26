# First Night

A small bushcraft game for David. It is late afternoon in a patch of woods. Stay warm until dawn.

You can play it in Safari on an iPhone, or in a desktop browser. Progress is saved on the phone itself.

## How to play

Tap the ground to walk. Tap sticks, stones, nettles, birch trees, and leaf piles to pick them up. What you are carrying sits in the six slots along the bottom. Warmth, energy, and health sit in the corner, with a short line such as Cold or Sheltered. The clock is at the top.

Tap the bag to open your inventory and the crafting bench.

- Cordage is under Resources. It takes a few seconds: twist two strands one way, then wrap them the other way. That lock is a reverse wrap. The queue shows the progress.
- Lean-to is under Construction. Crafting it puts a ghost on the ground. Green ground is clear. Red ground is blocked, on either of the two tiles it covers. Flip it if you need the open side the other way, then confirm. The woodsman walks over and raises the ridge pole there. Lash it with the cordage (a square lashing), lean ribs against it, then cover the ribs with leaves.
- Fire ring, tipi, and log cabin are under Fire. Choosing one before the ring is down places the fire on one tile. Then add birch-bark tinder, kindling, the lay, and a light.

Night takes your warmth. The finished shelter warms you when you stay near it, and the fire warms you when you stay near the fire. If warmth runs out, the night wins. If you are still warm at dawn, you made it.

**Rest** sits under the vitals. Once the camp is ready, that button becomes **Wait for dawn**.

## On an iPhone

Open the GitHub Pages site in Safari. Tap Share, then **Add to Home Screen**. It opens full screen, like an app. Either way up works.

Play it at https://shadowy-moses.github.io/Bushcraft-game/. Pages deploys from GitHub Actions.

## Pictures

The painted tiles live in `assets/spritesheet.png` and `assets/spritesheet.json`, a 512×174 sheet with 54 frames. The woodsman has a painted idle and walk for southeast, southwest, northeast, and northwest, and the game shows that picture instead of flipping it. Picking something up holds the gather pose. Building the lean-to or the fire holds the chop pose. Gather and chop are painted for the two near sides, and the far sides reuse the matching near pose. Each frame’s `anchor` (or `anchorPx`) is the spot where it meets the ground, and the game uses that. The older woodsman names still mean the southeast view. Tiles are 32×16 and drawn at 3× with crisp pixels. There are no soft shadows; the ground tile under an object is darkened instead.

`assets/standins/` is only the in-between lean-to (ridge pole, then the lashing), leaf piles, and the tile you are walking to. Swap those files when real art arrives. `assets/standins/origins.json` is where each one sits on the ground.

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
