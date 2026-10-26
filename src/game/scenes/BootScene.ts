import Phaser from 'phaser';
import { installAtlas, installStandins, type AtlasFile, type StandinOrigins } from '../atlas';

const STANDINS = ['shelter_ridge', 'shelter_lashed', 'leaf_pile', 'tile_marker'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.atlas('world', `${base}assets/spritesheet.png`, `${base}assets/spritesheet.json`);
    this.load.json('atlas-meta', `${base}assets/spritesheet.json`);
    this.load.json('standin-meta', `${base}assets/standins/origins.json`);
    for (const name of STANDINS) {
      this.load.image(name, `${base}assets/standins/${name}.png`);
    }
    this.load.on('loaderror', (file: { key: string }) => {
      const boot = document.getElementById('boot');
      if (boot) boot.textContent = `Could not load the pictures (${file.key}).`;
    });
  }

  create(): void {
    const meta = this.cache.json.get('atlas-meta') as AtlasFile;
    installAtlas(meta);
    installStandins(this.cache.json.get('standin-meta') as StandinOrigins);
    const animations = meta.animations ?? {};
    for (const [key, frames] of Object.entries(animations)) {
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: 'world', frame })),
        frameRate: key.startsWith('fire') ? 6 : key.endsWith('_idle') ? 3 : 8,
        repeat: -1,
      });
    }
    this.scene.start('game');
  }
}
