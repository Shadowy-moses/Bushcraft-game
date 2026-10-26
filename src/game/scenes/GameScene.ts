import Phaser from 'phaser';
import { frameOrigin, standinOrigin } from '../atlas';
import {
  FIRE_TILE,
  PLAY_MINUTES_PER_SECOND,
  REST_ENERGY_PER_SECOND,
  REST_MINUTES_PER_SECOND,
  SHELTER_TILES,
  WAIT_MINUTES_PER_SECOND,
  ZOOM,
} from '../constants';
import { HEADING, REST_TIP, TOO_COLD, WAIT_TIP } from '../copy';
import { depthFor, tileToWorld, worldToTile } from '../iso';
import { SHADOW_TINT, lightTint, multiplyTint, skyColor } from '../light';
import { PROPS, groundAt, inBounds, isBlocked, propAt } from '../map';
import { buildModel, type SheetId } from '../model';
import { findPath, planRoute } from '../path';
import { actionNeedsCamp, applyAction, atCamp, canWaitForDawn, gainEnergy, gather, initialState, tick } from '../rules';
import { clearGame, loadGame, saveGame } from '../save';
import type { ActionId, GameState, Prop, PropKind } from '../types';
import { Hud } from '../../ui/hud';

const SHELTER_AT = (() => {
  const a = tileToWorld(SHELTER_TILES[0].tx, SHELTER_TILES[0].ty);
  const b = tileToWorld(SHELTER_TILES[1].tx, SHELTER_TILES[1].ty);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
})();

const imagePixels = new WeakMap<CanvasImageSource, { data: Uint8ClampedArray; width: number; height: number }>();

function imageAlpha(image: CanvasImageSource & { width: number; height: number }, sx: number, sy: number): number {
  let cache = imagePixels.get(image);
  if (!cache) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 255;
    ctx.drawImage(image, 0, 0);
    cache = {
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      width: canvas.width,
      height: canvas.height,
    };
    imagePixels.set(image, cache);
  }
  if (sx < 0 || sy < 0 || sx >= cache.width || sy >= cache.height) return 0;
  return cache.data[(sy * cache.width + sx) * 4 + 3] ?? 0;
}

const RING = [
  { x: -12, y: -1 },
  { x: 12, y: -2 },
  { x: -7, y: 5 },
  { x: 8, y: 4 },
];

interface PropView {
  prop: Prop;
  sprite: Phaser.GameObjects.Sprite;
}

declare global {
  interface Window {
    __firstNight?: {
      state: () => GameState;
      act: (id: string) => void;
      gather: (id: string) => string;
      jump: (minutes: number) => void;
      teleport: (tx: number, ty: number) => void;
      screenOf: (tx: number, ty: number) => { x: number; y: number };
    };
  }
}

export class GameScene extends Phaser.Scene {
  private skipTitle = false;
  private state!: GameState;
  private started = false;
  private sheet: SheetId = 'none';
  private resting = false;
  private hidden = false;
  private hud!: Hud;
  private player!: Phaser.GameObjects.Sprite;
  private ground = new Map<string, Phaser.GameObjects.Sprite>();
  private propViews: PropView[] = [];
  private shaded = new Set<string>();
  private shelterSprite?: Phaser.GameObjects.Sprite;
  private fireSprite?: Phaser.GameObjects.Sprite;
  private ringSprites: Phaser.GameObjects.Sprite[] = [];
  private tinderSprite?: Phaser.GameObjects.Sprite;
  private kindlingSprites: Phaser.GameObjects.Sprite[] = [];
  private marker?: Phaser.GameObjects.Sprite;
  private path: { tx: number; ty: number }[] = [];
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private stepT = 0;
  private readonly stepDur = 0.28;
  private arrive: (() => void) | null = null;
  private minuteBank = 0;
  private saveBank = 0;
  private hudBank = 0;
  private onVis = (): void => undefined;
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.handleAction('close');
  };
  private resizeObs?: ResizeObserver;

  constructor() {
    super('game');
  }

  init(data: { skipTitle?: boolean }): void {
    this.skipTitle = Boolean(data?.skipTitle);
  }

  create(): void {
    this.path = [];
    this.arrive = null;
    this.resting = false;
    this.ground = new Map();
    this.propViews = [];
    this.ringSprites = [];
    this.kindlingSprites = [];
    const saved = loadGame();
    if (saved) {
      this.state = saved;
      this.started = true;
      this.sheet = saved.outcome === 'playing' ? 'none' : 'end';
    } else {
      this.state = initialState();
      this.started = this.skipTitle;
      this.sheet = this.skipTitle ? 'none' : 'title';
      if (this.skipTitle) saveGame(this.state);
    }

    this.buildGround();
    this.buildProps();
    this.buildCamp();
    this.buildPlayer();
    this.refreshShadows();
    this.syncProps();
    this.showShelter();
    this.showFire();

    const root = document.getElementById('hud');
    if (!root) throw new Error('Missing hud');
    this.hud = new Hud(root);
    this.hud.setHandlers({ onAction: (id) => this.handleAction(id) });

    const cam = this.cameras.main;
    cam.roundPixels = true;
    cam.centerOn(this.player.x, this.player.y);
    cam.startFollow(this.player, true, 0.18, 0.18);
    this.layoutCamera();
    this.applyTints();
    this.paintHud(true);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointer(pointer));
    this.scale.on('resize', () => this.layoutCamera());
    this.resizeObs = new ResizeObserver(() => this.layoutCamera());
    const top = document.getElementById('top-bar');
    const bottom = document.getElementById('bottom-bar');
    if (top) this.resizeObs.observe(top);
    if (bottom) this.resizeObs.observe(bottom);

    this.onVis = () => {
      this.hidden = document.hidden;
      if (this.hidden && this.started) saveGame(this.state);
    };
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('keydown', this.onKey);

    window.__firstNight = {
      state: () => this.state,
      act: (id) => this.handleAction(id),
      gather: (id) => {
        const result = gather(this.state, id);
        if (!result.ok) return result.message;
        this.state = result.state;
        this.afterChange();
        return result.message;
      },
      jump: (minutes) => {
        this.state = tick(this.state, minutes);
        this.afterChange();
      },
      teleport: (tx, ty) => {
        this.stopWalk();
        this.state = { ...this.state, tx, ty };
        const pos = tileToWorld(tx, ty);
        this.player.setPosition(pos.x, pos.y);
        this.player.setDepth(depthFor(pos.y, 6));
        this.afterChange();
      },
      screenOf: (tx: number, ty: number) => {
        const pos = tileToWorld(tx, ty);
        const cam = this.cameras.main;
        const m = (cam as unknown as { matrix: { matrix: number[] } }).matrix.matrix;
        const rect = this.game.canvas.getBoundingClientRect();
        const x = (pos.x - cam.scrollX) * m[0] + (pos.y - cam.scrollY) * m[2] + m[4];
        const y = (pos.x - cam.scrollX) * m[1] + (pos.y - cam.scrollY) * m[3] + m[5];
        return { x: rect.left + x, y: rect.top + y };
      },
    };

    document.getElementById('boot')?.classList.add('hide');

    this.events.once('shutdown', () => {
      this.resizeObs?.disconnect();
      document.removeEventListener('visibilitychange', this.onVis);
      window.removeEventListener('keydown', this.onKey);
      this.hud.destroy();
      window.__firstNight = undefined;
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.stepMove(dt);
    if (this.started && !this.hidden && this.sheet === 'none' && this.state.outcome === 'playing') {
      const waiting = this.resting && canWaitForDawn(this.state);
      let rate: number = PLAY_MINUTES_PER_SECOND;
      if (this.resting) {
        rate = waiting ? WAIT_MINUTES_PER_SECOND : REST_MINUTES_PER_SECOND;
        this.state = gainEnergy(this.state, dt * (waiting ? 8 : REST_ENERGY_PER_SECOND));
      }
      this.minuteBank += dt * rate;
      if (this.minuteBank >= 0.2) {
        const minutes = this.minuteBank;
        this.minuteBank = 0;
        this.state = tick(this.state, minutes);
      }
      if (this.resting && !canWaitForDawn(this.state) && this.state.warmth < 24) {
        this.resting = false;
        this.state = { ...this.state, tip: TOO_COLD };
      } else if (this.resting && !waiting && this.state.energy >= 100) {
        this.resting = false;
        this.state = { ...this.state, tip: 'Rested. On your feet.' };
      }
      if (this.state.outcome !== 'playing') {
        this.resting = false;
        this.sheet = 'end';
        this.stopWalk();
        this.paintHud(true);
        saveGame(this.state);
      }
    }
    this.applyTints();
    this.hudBank += dt;
    if (this.hudBank > 0.15) {
      this.hudBank = 0;
      this.paintHud(false);
    }
    this.saveBank += dt;
    if (this.started && this.saveBank > 5) {
      this.saveBank = 0;
      saveGame(this.state);
    }
  }

  private buildGround(): void {
    for (let ty = 0; ty < 12; ty++) {
      for (let tx = 0; tx < 12; tx++) {
        const ground = groundAt(tx, ty);
        if (!ground) continue;
        const pos = tileToWorld(tx, ty);
        const sprite = this.add.sprite(pos.x, pos.y, 'world', ground);
        const origin = frameOrigin(ground);
        sprite.setOrigin(origin.x, origin.y);
        sprite.setDepth(depthFor(pos.y, 0));
        this.ground.set(`${tx},${ty}`, sprite);
      }
    }
  }

  private buildProps(): void {
    for (const prop of PROPS) {
      const pos = tileToWorld(prop.tx, prop.ty);
      const sprite =
        prop.kind === 'leaf_pile'
          ? this.add.sprite(pos.x, pos.y, 'leaf_pile')
          : this.add.sprite(pos.x, pos.y, 'world', prop.kind);
      if (prop.kind === 'leaf_pile') {
        const origin = standinOrigin('leaf_pile');
        sprite.setOrigin(origin.x, origin.y);
      } else {
        const origin = frameOrigin(prop.kind);
        sprite.setOrigin(origin.x, origin.y);
      }
      sprite.setDepth(depthFor(pos.y, 5));
      this.propViews.push({ prop, sprite });
    }
  }

  private buildCamp(): void {
    const fire = tileToWorld(FIRE_TILE.tx, FIRE_TILE.ty);
    this.fireSprite = this.add.sprite(fire.x, fire.y, 'world', 'fire_tipi_unlit');
    this.fireSprite.setVisible(false);
    this.fireSprite.on('animationupdate', () => this.syncFrameOrigin(this.fireSprite!));
    this.ringSprites = RING.map((offset) => this.makePiece(offset.x, offset.y, 'item_stone'));
    this.tinderSprite = this.makePiece(0, -1, 'item_fiber');
    this.kindlingSprites = [this.makePiece(-6, 2, 'item_sticks'), this.makePiece(7, 1, 'item_sticks')];
    this.shelterSprite = this.add.sprite(SHELTER_AT.x, SHELTER_AT.y, 'shelter_ridge');
    this.shelterSprite.setVisible(false);
    const markerOrigin = standinOrigin('tile_marker');
    this.marker = this.add.sprite(0, 0, 'tile_marker');
    this.marker.setOrigin(markerOrigin.x, markerOrigin.y);
    this.marker.setVisible(false);
  }

  private makePiece(dx: number, dy: number, frame: string): Phaser.GameObjects.Sprite {
    const base = tileToWorld(FIRE_TILE.tx, FIRE_TILE.ty);
    const sprite = this.add.sprite(base.x + dx, base.y + dy, 'world', frame);
    const origin = frameOrigin(frame);
    sprite.setOrigin(origin.x, origin.y);
    sprite.setDepth(depthFor(base.y + dy, 4));
    sprite.setVisible(false);
    return sprite;
  }

  private buildPlayer(): void {
    const pos = tileToWorld(this.state.tx, this.state.ty);
    this.player = this.add.sprite(pos.x, pos.y, 'world', 'woodsman_idle');
    this.syncFrameOrigin(this.player);
    this.player.setDepth(depthFor(pos.y, 6));
    this.player.setFlipX(this.state.faceLeft);
    this.player.on('animationupdate', () => this.syncFrameOrigin(this.player));
  }

  private layoutCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.roundPixels = true;
    const top = document.getElementById('top-bar');
    const bottom = document.getElementById('bottom-bar');
    const topH = top && !top.hidden ? top.offsetHeight : 0;
    const bottomH = bottom && !bottom.hidden ? bottom.offsetHeight : 0;
    cam.setFollowOffset(0, -((bottomH - topH) / (2 * ZOOM)));
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.started || this.state.outcome !== 'playing' || this.sheet !== 'none') return;
    if (this.resting) this.resting = false;
    this.stopWalk();
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const prop = this.propAtPoint(world.x, world.y);
    if (prop?.gather) {
      this.goGather(prop);
      return;
    }
    if (prop?.blocks) {
      this.setTip(prop.kind === 'rock' ? 'That rock is staying put. Pick up the loose stones.' : 'The trees are too tight to walk through.');
      return;
    }
    const tile = this.tileAt(world.x, world.y);
    if (!tile) {
      this.setTip('That is past the trees.');
      return;
    }
    if (groundAt(tile.tx, tile.ty) === 'creek_water') {
      this.setTip('The creek is cold. Leave the wet stones where they are.');
      return;
    }
    if (isBlocked(tile.tx, tile.ty, this.state.shelter)) {
      this.setTip('You can’t walk through that.');
      return;
    }
    this.walkTo(tile.tx, tile.ty);
  }

  private tileAt(x: number, y: number): { tx: number; ty: number } | null {
    const tile = worldToTile(x, y);
    if (!inBounds(tile.tx, tile.ty)) return null;
    return tile;
  }

  private propAtPoint(x: number, y: number): Prop | null {
    let best: PropView | null = null;
    for (const view of this.propViews) {
      if (!view.sprite.visible) continue;
      if (!this.opaqueHit(view.sprite, x, y)) continue;
      if (!best || view.sprite.depth > best.sprite.depth) best = view;
    }
    if (best) return best.prop;
    const tile = this.tileAt(x, y);
    if (!tile) return null;
    const onTile = propAt(tile.tx, tile.ty);
    if (!onTile || this.isGone(onTile)) return null;
    return onTile;
  }

  /** Ignore the clear parts of a sprite so a tree's empty box does not steal a tap. */
  private opaqueHit(sprite: Phaser.GameObjects.Sprite, worldX: number, worldY: number): boolean {
    const frame = sprite.frame;
    let localX = (worldX - sprite.x) / sprite.scaleX + frame.width * sprite.originX;
    let localY = (worldY - sprite.y) / sprite.scaleY + frame.height * sprite.originY;
    if (sprite.flipX) localX = frame.width - localX;
    if (sprite.flipY) localY = frame.height - localY;
    if (localX < 0 || localY < 0 || localX >= frame.width || localY >= frame.height) return false;
    const image = frame.source.image as CanvasImageSource & { width: number; height: number };
    if (!image || typeof image.width !== 'number') return true;
    const alpha = imageAlpha(image, Math.floor(frame.cutX + localX), Math.floor(frame.cutY + localY));
    return alpha > 16;
  }

  private isGone(prop: Prop): boolean {
    return Boolean(this.state.picked[prop.id]) && this.removable(prop.kind);
  }

  private removable(kind: PropKind): boolean {
    return kind === 'item_sticks' || kind === 'item_stone' || kind === 'leaf_pile';
  }

  private goGather(prop: Prop): void {
    this.walkTo(prop.tx, prop.ty, () => {
      const result = gather(this.state, prop.id);
      if (!result.ok) {
        this.setTip(result.message);
        return;
      }
      this.state = result.state;
      this.afterChange();
    });
  }

  private walkTo(tx: number, ty: number, arrive?: () => void): void {
    const from = { tx: this.state.tx, ty: this.state.ty };
    const blocked = (x: number, y: number) => isBlocked(x, y, this.state.shelter);
    let plan: { path: { tx: number; ty: number }[]; stand: { tx: number; ty: number } } | null;
    if (!blocked(tx, ty)) {
      const path = findPath(from, { tx, ty }, blocked);
      plan = path === null ? null : { path, stand: { tx, ty } };
    } else {
      plan = planRoute(from, tx, ty, this.state.shelter);
    }
    if (!plan) {
      this.setTip('No way through.');
      return;
    }
    this.arrive = arrive ?? null;
    this.path = plan.path;
    this.showMarker(plan.stand.tx, plan.stand.ty);
    if (this.path.length === 0) {
      this.finishArrive();
      return;
    }
    this.beginStep();
  }

  private beginStep(): void {
    const next = this.path[0];
    if (!next) {
      this.finishArrive();
      return;
    }
    this.from = { x: this.player.x, y: this.player.y };
    this.to = tileToWorld(next.tx, next.ty);
    this.stepT = 0;
    if (this.to.x < this.from.x - 1) this.state = { ...this.state, faceLeft: true };
    else if (this.to.x > this.from.x + 1) this.state = { ...this.state, faceLeft: false };
    this.player.setFlipX(this.state.faceLeft);
    if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 'woodsman_walk') {
      this.player.play('woodsman_walk');
    }
  }

  private stepMove(dt: number): void {
    if (this.path.length === 0) return;
    this.stepT += dt;
    const u = Math.min(1, this.stepT / this.stepDur);
    const x = this.from.x + (this.to.x - this.from.x) * u;
    const y = this.from.y + (this.to.y - this.from.y) * u;
    this.player.setPosition(Math.round(x), Math.round(y));
    this.player.setDepth(depthFor(y, 6));
    if (u < 1) return;
    const step = this.path.shift();
    if (!step) return;
    this.state = { ...this.state, tx: step.tx, ty: step.ty };
    this.player.setPosition(this.to.x, this.to.y);
    if (this.path.length === 0) this.finishArrive();
    else this.beginStep();
  }

  private finishArrive(): void {
    if (this.player.anims.isPlaying) this.player.anims.stop();
    this.applyAtlas(this.player, 'woodsman_idle');
    this.marker?.setVisible(false);
    const fn = this.arrive;
    this.arrive = null;
    fn?.();
  }

  private stopWalk(): void {
    this.path = [];
    this.arrive = null;
    if (!this.player) return;
    const pos = tileToWorld(this.state.tx, this.state.ty);
    this.player.setPosition(pos.x, pos.y);
    this.player.setDepth(depthFor(pos.y, 6));
    if (this.player.anims.isPlaying) this.player.anims.stop();
    this.applyAtlas(this.player, 'woodsman_idle');
    this.marker?.setVisible(false);
  }

  private showMarker(tx: number, ty: number): void {
    if (!this.marker) return;
    const pos = tileToWorld(tx, ty);
    this.marker.setPosition(pos.x, pos.y);
    this.marker.setDepth(depthFor(pos.y, 2));
    this.marker.setVisible(true);
    this.marker.clearTint();
  }

  private handleAction(id: string): void {
    if (id === 'start') {
      this.started = true;
      this.sheet = 'none';
      saveGame(this.state);
      this.paintHud(true);
      this.layoutCamera();
      return;
    }
    if (id === 'restart') {
      clearGame();
      this.scene.restart({ skipTitle: true });
      return;
    }
    if (id === 'close') {
      if (this.sheet === 'title' || this.sheet === 'end') return;
      this.sheet = 'none';
      this.paintHud(true);
      this.layoutCamera();
      return;
    }
    if (id === 'pack' || id === 'make' || id === 'cordage' || id === 'lay') {
      if (!this.started || this.state.outcome !== 'playing') return;
      this.resting = false;
      this.stopWalk();
      this.sheet = id;
      this.paintHud(true);
      return;
    }
    if (id === 'rest') {
      if (!this.started || this.state.outcome !== 'playing') return;
      this.sheet = 'none';
      if (this.resting) {
        this.resting = false;
        this.setTip('On your feet.');
        this.paintHud(true);
        return;
      }
      this.stopWalk();
      this.resting = true;
      this.setTip(canWaitForDawn(this.state) ? WAIT_TIP : REST_TIP);
      this.paintHud(true);
      this.layoutCamera();
      return;
    }
    if (this.state.outcome !== 'playing') return;
    if (actionNeedsCamp(id) && !atCamp(this.state.tx, this.state.ty)) {
      const reopen = this.sheet === 'make' || this.sheet === 'lay';
      this.sheet = 'none';
      this.paintHud(true);
      this.stopWalk();
      this.setTip(HEADING);
      this.walkTo(FIRE_TILE.tx, FIRE_TILE.ty, () => {
        this.handleAction(id);
        if (reopen && this.state.outcome === 'playing' && this.sheet === 'none') {
          this.sheet = 'make';
          this.paintHud(true);
        }
      });
      return;
    }
    const result = applyAction(this.state, id as ActionId);
    if (!result.ok) {
      this.setTip(result.message);
      this.paintHud(true);
      return;
    }
    this.state = result.state;
    if (id === 'cordage-wrap' || id === 'lay-tipi' || id === 'lay-logcabin' || id === 'fire-light') {
      this.sheet = 'none';
    }
    this.afterChange();
  }

  private afterChange(): void {
    const pos = tileToWorld(this.state.tx, this.state.ty);
    if (this.path.length === 0 && this.player) {
      this.player.setPosition(pos.x, pos.y);
      this.player.setDepth(depthFor(pos.y, 6));
      this.player.setFlipX(this.state.faceLeft);
    }
    this.refreshShadows();
    this.syncProps();
    this.showShelter();
    this.showFire();
    if (this.state.outcome !== 'playing') {
      this.resting = false;
      this.sheet = 'end';
      this.stopWalk();
    }
    saveGame(this.state);
    this.paintHud(true);
    this.layoutCamera();
  }

  private refreshShadows(): void {
    this.shaded.clear();
    for (const view of this.propViews) {
      if (this.isGone(view.prop)) continue;
      this.shaded.add(`${view.prop.tx},${view.prop.ty}`);
    }
    if (this.state.shelter >= 1) {
      for (const tile of SHELTER_TILES) this.shaded.add(`${tile.tx},${tile.ty}`);
    }
    if (this.state.fire.ring || this.state.fire.lay !== 'none') {
      this.shaded.add(`${FIRE_TILE.tx},${FIRE_TILE.ty}`);
    }
  }

  private syncProps(): void {
    for (const view of this.propViews) view.sprite.setVisible(!this.isGone(view.prop));
  }

  private showShelter(): void {
    const sprite = this.shelterSprite;
    if (!sprite) return;
    const stage = this.state.shelter;
    if (stage <= 0) {
      sprite.setVisible(false);
      return;
    }
    sprite.setVisible(true);
    sprite.setPosition(SHELTER_AT.x, SHELTER_AT.y);
    sprite.setDepth(depthFor(SHELTER_AT.y, 5));
    if (stage === 1) this.useStandin(sprite, 'shelter_ridge');
    else if (stage === 2) this.useStandin(sprite, 'shelter_lashed');
    else if (stage === 3) this.applyAtlas(sprite, 'leanto_frame');
    else this.applyAtlas(sprite, 'leanto_done');
  }

  private showFire(): void {
    const sprite = this.fireSprite;
    if (!sprite) return;
    const fire = this.state.fire;
    const pos = tileToWorld(FIRE_TILE.tx, FIRE_TILE.ty);
    sprite.setPosition(pos.x, pos.y);
    sprite.setDepth(depthFor(pos.y, 5));
    const pieces = fire.lay === 'none';
    this.ringSprites.forEach((stone) => stone.setVisible(pieces && fire.ring));
    this.tinderSprite?.setVisible(pieces && fire.tinder);
    this.kindlingSprites.forEach((stick) => stick.setVisible(pieces && fire.kindling));
    if (fire.lit && fire.lay === 'tipi') this.playFire('fire_tipi_lit');
    else if (fire.lit && fire.lay === 'logcabin') this.playFire('fire_logcabin_lit');
    else if (fire.lay === 'tipi') this.showUnlit('fire_tipi_unlit');
    else if (fire.lay === 'logcabin') this.showUnlit('fire_logcabin_unlit');
    else {
      sprite.anims.stop();
      sprite.setVisible(false);
    }
  }

  private playFire(anim: string): void {
    const sprite = this.fireSprite;
    if (!sprite) return;
    sprite.setVisible(true);
    if (sprite.anims.currentAnim?.key !== anim || !sprite.anims.isPlaying) sprite.play(anim);
    this.syncFrameOrigin(sprite);
    sprite.clearTint();
  }

  private showUnlit(frame: string): void {
    const sprite = this.fireSprite;
    if (!sprite) return;
    sprite.anims.stop();
    sprite.setVisible(true);
    this.applyAtlas(sprite, frame);
  }

  private useStandin(sprite: Phaser.GameObjects.Sprite, key: string): void {
    sprite.setTexture(key);
    const origin = standinOrigin(key);
    sprite.setOrigin(origin.x, origin.y);
  }

  private applyAtlas(sprite: Phaser.GameObjects.Sprite, frame: string): void {
    sprite.setTexture('world', frame);
    const origin = frameOrigin(frame);
    sprite.setOrigin(origin.x, origin.y);
  }

  private syncFrameOrigin(sprite: Phaser.GameObjects.Sprite): void {
    const name = String(sprite.frame.name);
    if (!name || name === '__BASE') return;
    const origin = frameOrigin(name);
    sprite.setOrigin(origin.x, origin.y);
  }

  private applyTints(): void {
    const lit = this.state.fire.lit;
    const sky = skyColor(this.state.minutes);
    this.cameras.main.setBackgroundColor(sky);
    const app = document.getElementById('app');
    if (app && app.style.background !== sky) app.style.background = sky;
    const feet = `${this.state.tx},${this.state.ty}`;
    for (const [key, sprite] of this.ground) {
      const [tx, ty] = key.split(',').map(Number);
      let tint = lightTint(this.state.minutes, tx, ty, lit);
      if (this.shaded.has(key) || key === feet) tint = multiplyTint(tint, SHADOW_TINT);
      sprite.setTint(tint);
    }
    for (const view of this.propViews) {
      view.sprite.setTint(lightTint(this.state.minutes, view.prop.tx, view.prop.ty, lit));
    }
    this.player?.setTint(lightTint(this.state.minutes, this.state.tx, this.state.ty, lit));
    if (this.shelterSprite?.visible) {
      this.shelterSprite.setTint(lightTint(this.state.minutes, SHELTER_TILES[0].tx, SHELTER_TILES[0].ty, lit));
    }
    if (this.fireSprite?.visible) {
      if (lit) this.fireSprite.clearTint();
      else this.fireSprite.setTint(lightTint(this.state.minutes, FIRE_TILE.tx, FIRE_TILE.ty, false));
    }
    const pieceTint = lightTint(this.state.minutes, FIRE_TILE.tx, FIRE_TILE.ty, lit);
    for (const sprite of [...this.ringSprites, this.tinderSprite, ...this.kindlingSprites]) {
      sprite?.setTint(pieceTint);
    }
  }

  private setTip(message: string): void {
    this.state = { ...this.state, tip: message };
    this.paintHud(false);
  }

  private paintHud(rebuild: boolean): void {
    this.hud.render(buildModel(this.state, this.sheet, this.resting), rebuild);
  }
}
