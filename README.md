# First Night

A small bushcraft game for David. It is late afternoon in a patch of woods. Stay warm until dawn.

You can play it in Safari on an iPhone, or in a desktop browser. Progress is saved on the phone itself.

## How to play

Tap the ground to walk. Tap sticks, stones, nettles, birch trees, and leaf piles to pick them up.

Tap **Make** when you want to build.

- Twist two strands of fiber into cordage. Twist them one way, then wrap them the other way. That lock is a reverse wrap.
- Set a ridge pole for a lean-to, lash it with the cordage (a square lashing), lean ribs against it, then cover the ribs with leaves.
- Ring a fire with dry stones. Add birch-bark tinder, then kindling, then fuel. Choose a tipi or a log cabin, and light it.

Night takes your warmth. The finished shelter and the fire give it back, but only while you stay in the camp. If warmth runs out, the night wins. If you are still warm at dawn, you made it.

Tap **Rest** to catch your breath. Once the camp is ready, that button becomes **Wait for dawn**.

## On an iPhone

Open the GitHub Pages site in Safari. Tap Share, then **Add to Home Screen**. It opens full screen, like an app. Either way up works.

Play it at https://shadowy-moses.github.io/Bushcraft-game/. Pages deploys from GitHub Actions.

## Pictures

The painted tiles live in `assets/spritesheet.png` and `assets/spritesheet.json`. Frame names stay the same when a new woodsman arrives. Each frame’s `anchor` is the spot where it meets the ground, and the game uses that. Tiles are 32×16 and drawn at 3× with crisp pixels. There are no soft shadows; the ground tile under an object is darkened instead.

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
