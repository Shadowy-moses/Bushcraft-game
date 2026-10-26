import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import './style.css';

const app = document.getElementById('game');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: app ?? undefined,
  backgroundColor: '#3a2c24',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  banner: false,
  audio: { noAudio: true },
  render: { preserveDrawingBuffer: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: app?.clientWidth || 390,
    height: app?.clientHeight || 844,
  },
  scene: [BootScene, GameScene],
  input: { activePointers: 2 },
});

app?.addEventListener('contextmenu', (event) => event.preventDefault());
app?.addEventListener(
  'touchmove',
  (event) => {
    if (event.target instanceof HTMLCanvasElement) event.preventDefault();
  },
  { passive: false },
);

void game;
