import Phaser from 'phaser';
import { frameOrigin, standinOrigin } from '../atlas';
import {
  COLS,
  CORDAGE_ENERGY,
  FIBER_CORD,
  FIRE_ENERGY,
  PLAY_MINUTES_PER_SECOND,
  REST_ENERGY_PER_SECOND,
  REST_MINUTES_PER_SECOND,
  ROWS,
  SHELTER_ENERGY,
  STICKS_RIDGE,
  STONES_RING,
  WAIT_MINUTES_PER_SECOND,
  ZOOM,
} from '../constants';
import { CORDAGE_SECONDS } from '../craft';
import { HEADING, REST_TIP, TOO_COLD, WAIT_TIP } from '../copy';
import { shelterFootprint, shelterWorld } from '../footprint';
import { clamp, depthFor, tileToWorld, worldToTile } from '../iso';
import { SHADOW_TINT, lightTint, multiplyTint, skyColor } from '../light';
import { PROPS, blockedFor, groundAt, inBounds, propAt } from '../map';
import { buildModel, type PlaceModel, type SheetId } from '../model';
import { findPath, planRoute } from '../path';
import { fireSpot, shelterSpot, suggestAnchor } from '../place';
import { actionNeedsCamp, applyAction, atWorkSite, canWaitForDawn, gainEnergy, gather, initialState, tick } from '../rules';
import { clearGame, loadGame, saveGame } from '../save';
import type { ActionId, GameState, Prop, PropKind, Tile } from '../types';
import { facingFromDelta, mirrorFacing, poseClip, poseName } from '../woodsman';
import { Hud } from '../../ui/hud';

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
      fill: () => void;
      beginPlace: (kind: 'shelter' | 'fire') => void;
      moveGhost: (tx: number, ty: number) => void;
      flipGhost: () => void;
      confirmPlace: () => void;
      look: () => {
        facing: GameState['facing'];
        pose: string;
        frame: string;
        anim: string;
        playing: boolean;
        flipX: boolean;
        originX: number;
        originY: number;
      };
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
  private ghost?: Phaser.GameObjects.Sprite;
  private placing: 'shelter' | 'fire' | null = null;
  /** Set while the woodsman is walking to a spot that is not built yet. */
  private commitKind: 'shelter' | 'fire' | null = null;
  private ghostAnchor: Tile = { tx: 0, ty: 0 };
  private ghostFlip = false;
  private placeValid = false;
  private placeHint = '';
  private pointer = { x: 0, y: 0, down: false };
  private pose: 'idle' | 'walk' | 'gather' | 'chop' = 'idle';
  private poseUntil = 0;
  private craftJob: { elapsed: number; duration: number; didTwist: boolean } | null = null;
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
    this.placing = null;
    this.commitKind = null;
    this.placeValid = false;
    this.ghost?.setVisible(false);
    this.ground = new Map();
    this.propViews = [];
    this.ringSprites = [];
    this.kindlingSprites = [];
    this.pose = 'idle';
    this.poseUntil = 0;
    this.craftJob = null;
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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.x, y: pointer.y, down: true };
      this.onPointer(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.x, y: pointer.y, down: pointer.isDown };
      if (this.placing && pointer.isDown) this.moveGhost(pointer);
    });
    this.input.on('pointerup', () => {
      this.pointer.down = false;
    });
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
        const prop = PROPS.find((item) => item.id === id);
        this.state = result.state;
        if (prop) this.faceTile(prop.tx, prop.ty);
        this.playPose('gather');
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
      fill: () => {
        this.state = {
          ...this.state,
          energy: 100,
          inventory: { sticks: 12, stones: 5, fiber: 4, cordage: 0, tinder: 1, leaves: 5 },
        };
        this.afterChange();
      },
      beginPlace: (kind) => this.beginPlace(kind),
      moveGhost: (tx, ty) => {
        if (!this.placing) return;
        this.ghostAnchor = { tx, ty };
        this.refreshGhost();
      },
      flipGhost: () => this.handleAction('flip'),
      confirmPlace: () => this.handleAction('confirm'),
      look: () => ({
        facing: this.state.facing,
        pose: this.pose,
        frame: String(this.player.frame.name),
        anim: this.player.anims.currentAnim?.key ?? '',
        playing: this.player.anims.isPlaying,
        flipX: this.player.flipX,
        originX: this.player.originX,
        originY: this.player.originY,
      }),
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
    this.expirePose();
    this.stepCraft(dt);
    if (this.started && !this.hidden && this.sheet === 'none' && !this.placing && this.state.outcome === 'playing') {
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
    this.fireSprite = this.add.sprite(0, 0, 'world', 'fire_tipi_unlit');
    this.fireSprite.setVisible(false);
    this.fireSprite.on('animationupdate', () => this.syncFrameOrigin(this.fireSprite!));
    this.ringSprites = RING.map((offset) => this.makePiece(offset.x, offset.y, 'item_stone'));
    this.tinderSprite = this.makePiece(0, -1, 'item_fiber');
    this.kindlingSprites = [this.makePiece(-6, 2, 'item_sticks'), this.makePiece(7, 1, 'item_sticks')];
    this.shelterSprite = this.add.sprite(0, 0, 'shelter_ridge');
    this.shelterSprite.setVisible(false);
    this.ghost = this.add.sprite(0, 0, 'world', 'leanto_frame');
    this.ghost.setVisible(false);
    const markerOrigin = standinOrigin('tile_marker');
    this.marker = this.add.sprite(0, 0, 'tile_marker');
    this.marker.setOrigin(markerOrigin.x, markerOrigin.y);
    this.marker.setVisible(false);
  }

  private makePiece(dx: number, dy: number, frame: string): Phaser.GameObjects.Sprite {
    const sprite = this.add.sprite(0, 0, 'world', frame);
    const origin = frameOrigin(frame);
    sprite.setOrigin(origin.x, origin.y);
    sprite.setVisible(false);
    sprite.setData('dx', dx);
    sprite.setData('dy', dy);
    return sprite;
  }

  private buildPlayer(): void {
    const pos = tileToWorld(this.state.tx, this.state.ty);
    this.player = this.add.sprite(pos.x, pos.y, 'world', 'woodsman_idle');
    this.player.setDepth(depthFor(pos.y, 6));
    this.player.setFlipX(false);
    this.player.on('animationupdate', () => this.syncFrameOrigin(this.player));
    this.showIdle();
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
    if (this.placing) {
      this.moveGhost(pointer);
      return;
    }
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
    if (blockedFor(this.state)(tile.tx, tile.ty)) {
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
      this.faceTile(prop.tx, prop.ty);
      this.playPose('gather');
      this.afterChange();
    });
  }

  private walkTo(tx: number, ty: number, arrive?: () => void): boolean {
    const from = { tx: this.state.tx, ty: this.state.ty };
    const blocked = blockedFor(this.state);
    let plan: { path: { tx: number; ty: number }[]; stand: { tx: number; ty: number } } | null;
    if (!blocked(tx, ty)) {
      const path = findPath(from, { tx, ty }, blocked);
      plan = path === null ? null : { path, stand: { tx, ty } };
    } else {
      plan = planRoute(from, tx, ty, blocked);
    }
    if (!plan) {
      this.setTip('No way through.');
      return false;
    }
    this.arrive = arrive ?? null;
    this.path = plan.path;
    this.showMarker(plan.stand.tx, plan.stand.ty);
    if (this.path.length === 0) {
      this.finishArrive();
      return true;
    }
    this.beginStep();
    return true;
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
    const facing = facingFromDelta(this.to.x - this.from.x, this.to.y - this.from.y, this.state.facing);
    this.state = { ...this.state, facing };
    this.pose = 'walk';
    this.poseUntil = 0;
    this.showPose('walk');
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
    this.pose = 'idle';
    this.showIdle();
    this.marker?.setVisible(false);
    const fn = this.arrive;
    this.arrive = null;
    fn?.();
  }

  private showPose(pose: 'idle' | 'walk' | 'gather' | 'chop'): void {
    const clip = poseClip(
      this.state.facing,
      pose,
      (key) => this.anims.exists(key),
      (key) => this.textures.exists('world') && this.textures.get('world').has(key),
    );
    const own =
      this.anims.exists(poseName(this.state.facing, 'idle')) ||
      this.anims.exists(poseName(this.state.facing, 'walk'));
    this.player.setFlipX(mirrorFacing(this.state.facing, own));
    if (clip.kind === 'anim') {
      if (this.player.anims.currentAnim?.key !== clip.key || !this.player.anims.isPlaying) this.player.play(clip.key);
      this.syncFrameOrigin(this.player);
      return;
    }
    this.player.anims.stop();
    if (this.textures.get('world').has(clip.key)) this.applyAtlas(this.player, clip.key);
  }

  private showIdle(): void {
    this.showPose('idle');
  }

  private playPose(kind: 'gather' | 'chop'): void {
    this.pose = kind;
    this.poseUntil = this.time.now + 900;
    this.showPose(kind);
  }

  private expirePose(): void {
    if ((this.pose === 'gather' || this.pose === 'chop') && this.time.now >= this.poseUntil) {
      this.pose = 'idle';
      this.showIdle();
    }
  }

  /** Turn toward a tile. A zero step keeps the facing he already has. */
  private faceTile(tx: number, ty: number): void {
    const from = tileToWorld(this.state.tx, this.state.ty);
    const to = tileToWorld(tx, ty);
    const facing = facingFromDelta(to.x - from.x, to.y - from.y, this.state.facing);
    this.state = { ...this.state, facing };
  }

  private playChore(id: string): void {
    const tile = id.startsWith('shelter') ? this.state.shelterAnchor : this.state.fireTile;
    if (tile) this.faceTile(tile.tx, tile.ty);
    this.playPose('chop');
  }

  private stopWalk(): void {
    if (this.commitKind === 'shelter' && this.state.shelter < 1) {
      this.state = { ...this.state, shelterAnchor: null, shelterFlip: false };
    } else if (this.commitKind === 'fire' && !this.state.fire.ring) {
      this.state = { ...this.state, fireTile: null };
    }
    this.commitKind = null;
    this.path = [];
    this.arrive = null;
    if (!this.player) return;
    const pos = tileToWorld(this.state.tx, this.state.ty);
    this.player.setPosition(pos.x, pos.y);
    this.player.setDepth(depthFor(pos.y, 6));
    this.pose = 'idle';
    this.poseUntil = 0;
    this.showIdle();
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
      if (this.placing) {
        this.handleAction('cancel');
        return;
      }
      if (this.sheet === 'title' || this.sheet === 'end') return;
      this.sheet = 'none';
      this.paintHud(true);
      this.layoutCamera();
      return;
    }
    if (id === 'pack' || id === 'craft' || id === 'cordage' || id === 'lay') {
      if (!this.started || this.state.outcome !== 'playing') return;
      if (this.placing) this.endPlace();
      this.resting = false;
      this.stopWalk();
      this.sheet = 'craft';
      this.paintHud(true);
      return;
    }
    if (id === 'craft-cordage') {
      this.beginCordage();
      return;
    }
    if (id === 'place-shelter' || id === 'place-fire') {
      if (!this.started || this.state.outcome !== 'playing') return;
      this.tryBeginPlace(id === 'place-shelter' ? 'shelter' : 'fire');
      return;
    }
    if (id === 'flip') {
      if (this.placing !== 'shelter') return;
      this.ghostFlip = !this.ghostFlip;
      this.refreshGhost();
      return;
    }
    if (id === 'cancel') {
      if (!this.placing) return;
      this.endPlace();
      this.setTip('Left it.');
      return;
    }
    if (id === 'confirm') {
      this.confirmPlace();
      return;
    }
    if (id === 'rest') {
      if (!this.started || this.state.outcome !== 'playing') return;
      if (this.placing) this.endPlace();
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
    if (actionNeedsCamp(id) && !atWorkSite(this.state, id)) {
      const tile = id.startsWith('shelter') ? this.state.shelterAnchor : this.state.fireTile;
      if (!tile) {
        this.setTip(id.startsWith('shelter') ? 'Place the lean-to first.' : 'Place the fire first.');
        return;
      }
      const reopen = this.sheet === 'craft' || this.sheet === 'lay';
      this.sheet = 'none';
      this.paintHud(true);
      this.stopWalk();
      this.setTip(HEADING);
      this.walkTo(tile.tx, tile.ty, () => {
        this.handleAction(id);
        if (reopen && this.state.outcome === 'playing' && this.sheet === 'none') {
          this.sheet = 'craft';
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
    if (id.startsWith('shelter') || id.startsWith('fire') || id.startsWith('lay')) this.playChore(id);
    this.afterChange();
  }

  private afterChange(): void {
    const pos = tileToWorld(this.state.tx, this.state.ty);
    if (this.path.length === 0 && this.player) {
      this.player.setPosition(pos.x, pos.y);
      this.player.setDepth(depthFor(pos.y, 6));
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
    if (this.state.shelter >= 1 && this.state.shelterAnchor) {
      for (const tile of shelterFootprint(this.state.shelterAnchor, this.state.shelterFlip)) {
        this.shaded.add(`${tile.tx},${tile.ty}`);
      }
    }
    if ((this.state.fire.ring || this.state.fire.lay !== 'none') && this.state.fireTile) {
      this.shaded.add(`${this.state.fireTile.tx},${this.state.fireTile.ty}`);
    }
  }

  private syncProps(): void {
    for (const view of this.propViews) view.sprite.setVisible(!this.isGone(view.prop));
  }

  private showShelter(): void {
    const sprite = this.shelterSprite;
    if (!sprite) return;
    const stage = this.state.shelter;
    const anchor = this.state.shelterAnchor;
    if (stage <= 0 || !anchor) {
      sprite.setVisible(false);
      return;
    }
    const at = shelterWorld(anchor, this.state.shelterFlip);
    sprite.setVisible(true);
    sprite.setPosition(at.x, at.y);
    sprite.setDepth(depthFor(at.y, 5));
    sprite.setFlipX(this.state.shelterFlip);
    if (stage === 1) this.useStandin(sprite, 'shelter_ridge');
    else if (stage === 2) this.useStandin(sprite, 'shelter_lashed');
    else if (stage === 3) this.applyAtlas(sprite, 'leanto_frame');
    else this.applyAtlas(sprite, 'leanto_done');
  }

  private showFire(): void {
    const sprite = this.fireSprite;
    if (!sprite) return;
    const fire = this.state.fire;
    const tile = this.state.fireTile;
    if (!tile) {
      sprite.setVisible(false);
      this.ringSprites.forEach((stone) => stone.setVisible(false));
      this.tinderSprite?.setVisible(false);
      this.kindlingSprites.forEach((stick) => stick.setVisible(false));
      return;
    }
    const pos = tileToWorld(tile.tx, tile.ty);
    sprite.setPosition(pos.x, pos.y);
    sprite.setDepth(depthFor(pos.y, 5));
    this.layoutPieces(pos);
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

  private layoutPieces(base: { x: number; y: number }): void {
    const pieces = [...this.ringSprites, this.tinderSprite, ...this.kindlingSprites];
    for (const sprite of pieces) {
      if (!sprite) continue;
      const dx = Number(sprite.getData('dx') ?? 0);
      const dy = Number(sprite.getData('dy') ?? 0);
      sprite.setPosition(base.x + dx, base.y + dy);
      sprite.setDepth(depthFor(base.y + dy, 4));
    }
  }

  private applyTints(): void {
    const lit = this.state.fire.lit;
    const fireAt = lit ? this.state.fireTile : null;
    const sky = skyColor(this.state.minutes);
    this.cameras.main.setBackgroundColor(sky);
    const app = document.getElementById('app');
    if (app && app.style.background !== sky) app.style.background = sky;
    const feet = `${this.state.tx},${this.state.ty}`;
    for (const [key, sprite] of this.ground) {
      const [tx, ty] = key.split(',').map(Number);
      let tint = lightTint(this.state.minutes, tx, ty, lit, fireAt);
      if (this.shaded.has(key) || key === feet) tint = multiplyTint(tint, SHADOW_TINT);
      sprite.setTint(tint);
    }
    for (const view of this.propViews) {
      view.sprite.setTint(lightTint(this.state.minutes, view.prop.tx, view.prop.ty, lit, fireAt));
    }
    this.player?.setTint(lightTint(this.state.minutes, this.state.tx, this.state.ty, lit, fireAt));
    if (this.shelterSprite?.visible && this.state.shelterAnchor) {
      const anchor = this.state.shelterAnchor;
      this.shelterSprite.setTint(lightTint(this.state.minutes, anchor.tx, anchor.ty, lit, fireAt));
    }
    if (this.fireSprite?.visible && this.state.fireTile) {
      if (lit) this.fireSprite.clearTint();
      else this.fireSprite.setTint(lightTint(this.state.minutes, this.state.fireTile.tx, this.state.fireTile.ty, false, null));
    }
    const pieceTile = this.state.fireTile ?? { tx: this.state.tx, ty: this.state.ty };
    const pieceTint = lightTint(this.state.minutes, pieceTile.tx, pieceTile.ty, lit, fireAt);
    for (const sprite of [...this.ringSprites, this.tinderSprite, ...this.kindlingSprites]) {
      sprite?.setTint(pieceTint);
    }
  }

  private setTip(message: string): void {
    this.state = { ...this.state, tip: message };
    this.paintHud(false);
  }

  private paintHud(rebuild: boolean): void {
    this.hud.render(buildModel(this.state, this.sheet, this.resting, this.placeModel(), this.queueModel()), rebuild);
  }

  private queueModel(): { label: string; progress: number } | null {
    const job = this.craftJob;
    if (!job) return null;
    const progress = Math.max(0, Math.min(1, job.elapsed / job.duration));
    const label = job.didTwist || progress >= 0.5 ? 'Wrapping the other way' : 'Twisting the strands';
    return { label, progress };
  }

  private beginCordage(): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    if (this.craftJob) {
      this.setTip('Already working a cord.');
      return;
    }
    if (this.state.inventory.cordage >= 1) {
      this.setTip('You already have cordage.');
      return;
    }
    if (!this.state.cordageTwisted) {
      if (this.state.inventory.fiber < FIBER_CORD) {
        this.setTip(`Needs ${FIBER_CORD} fiber. You have ${this.state.inventory.fiber}.`);
        return;
      }
      if (this.state.energy < CORDAGE_ENERGY) {
        this.setTip('Rest first. This takes some energy.');
        return;
      }
    }
    this.craftJob = {
      elapsed: this.state.cordageTwisted ? CORDAGE_SECONDS * 0.5 : 0,
      duration: CORDAGE_SECONDS,
      didTwist: this.state.cordageTwisted,
    };
    this.sheet = 'craft';
    this.setTip('Twist each strand the same way. Then wrap the pair the other way.');
  }

  private stepCraft(dt: number): void {
    const job = this.craftJob;
    if (!job || !this.started || this.state.outcome !== 'playing') return;
    job.elapsed += dt;
    if (!job.didTwist && job.elapsed >= job.duration * 0.5) {
      const twisted = applyAction(this.state, 'cordage-twist');
      if (!twisted.ok) {
        this.craftJob = null;
        this.setTip(twisted.message);
        return;
      }
      this.state = twisted.state;
      job.didTwist = true;
      saveGame(this.state);
    }
    if (job.elapsed < job.duration) {
      this.paintHud(false);
      return;
    }
    this.craftJob = null;
    const wrapped = applyAction(this.state, 'cordage-wrap');
    if (!wrapped.ok) {
      this.setTip(wrapped.message);
      return;
    }
    this.state = wrapped.state;
    this.afterChange();
  }

  private placeModel(): PlaceModel | null {
    if (!this.placing) return null;
    return { kind: this.placing, valid: this.placeValid, hint: this.placeHint };
  }

  private tryBeginPlace(kind: 'shelter' | 'fire'): void {
    if (kind === 'shelter') {
      if (this.state.shelter !== 0) return;
      if (this.state.inventory.sticks < STICKS_RIDGE) {
        this.setTip(`Needs ${STICKS_RIDGE} sticks. You have ${this.state.inventory.sticks}.`);
        return;
      }
      if (this.state.energy < SHELTER_ENERGY) {
        this.setTip('Rest first. This takes some energy.');
        return;
      }
    } else {
      if (this.state.fire.ring) return;
      if (this.state.inventory.stones < STONES_RING) {
        this.setTip(`Needs ${STONES_RING} stones. You have ${this.state.inventory.stones}.`);
        return;
      }
      if (this.state.energy < FIRE_ENERGY) {
        this.setTip('Rest first. This takes some energy.');
        return;
      }
    }
    this.beginPlace(kind);
  }

  private beginPlace(kind: 'shelter' | 'fire'): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    this.resting = false;
    this.stopWalk();
    this.sheet = 'none';
    this.placing = kind;
    const spot = suggestAnchor(this.state, kind);
    this.ghostAnchor = spot.anchor;
    this.ghostFlip = spot.flip;
    this.cameras.main.stopFollow();
    this.refreshGhost();
    this.paintHud(true);
    this.layoutCamera();
  }

  private endPlace(): void {
    this.placing = null;
    this.ghost?.setVisible(false);
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.layoutCamera();
    this.paintHud(true);
  }

  private moveGhost(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = worldToTile(world.x, world.y);
    const tx = clamp(tile.tx, -1, COLS);
    const ty = clamp(tile.ty, -1, ROWS);
    if (tx === this.ghostAnchor.tx && ty === this.ghostAnchor.ty) return;
    this.ghostAnchor = { tx, ty };
    this.refreshGhost();
  }

  private refreshGhost(): void {
    const sprite = this.ghost;
    if (!sprite || !this.placing) return;
    const spot =
      this.placing === 'shelter'
        ? shelterSpot(this.ghostAnchor, this.ghostFlip, this.state)
        : fireSpot(this.ghostAnchor, this.state);
    const at =
      this.placing === 'shelter'
        ? shelterWorld(this.ghostAnchor, this.ghostFlip)
        : tileToWorld(this.ghostAnchor.tx, this.ghostAnchor.ty);
    const frame = this.placing === 'shelter' ? 'leanto_frame' : 'fire_tipi_unlit';
    this.applyAtlas(sprite, frame);
    sprite.setFlipX(this.placing === 'shelter' && this.ghostFlip);
    sprite.setAlpha(0.8);
    sprite.setTintFill(spot.ok ? 0x7a9a44 : 0xc4401c);
    sprite.setPosition(Math.round(at.x), Math.round(at.y));
    sprite.setDepth(20000);
    sprite.setVisible(true);
    this.keepGhostInView(at, this.placing === 'shelter');
    this.placeValid = spot.ok;
    this.placeHint = spot.reason;
    if (this.state.tip !== spot.reason) this.setTip(spot.reason);
    else this.paintHud(false);
  }

  private confirmPlace(): void {
    if (!this.placing) return;
    const kind = this.placing;
    const anchor = { tx: this.ghostAnchor.tx, ty: this.ghostAnchor.ty };
    const flip = this.ghostFlip;
    const spot = kind === 'shelter' ? shelterSpot(anchor, flip, this.state) : fireSpot(anchor, this.state);
    if (!spot.ok) {
      this.setTip(spot.reason);
      this.paintHud(false);
      return;
    }
    this.endPlace();
    this.setTip(HEADING);
    this.commitKind = kind;
    if (kind === 'shelter') {
      this.state = { ...this.state, shelterAnchor: anchor, shelterFlip: flip };
      const walked = this.walkTo(anchor.tx, anchor.ty, () => this.finishPlacement('shelter-1'));
      if (!walked) this.stopWalk();
      return;
    }
    this.state = { ...this.state, fireTile: anchor };
    const walked = this.walkTo(anchor.tx, anchor.ty, () => this.finishPlacement('fire-ring'));
    if (!walked) this.stopWalk();
  }

  private finishPlacement(id: 'shelter-1' | 'fire-ring'): void {
    this.commitKind = null;
    const shelterBefore = this.state.shelter;
    const ringBefore = this.state.fire.ring;
    this.handleAction(id);
    if (id === 'shelter-1' && this.state.shelter === shelterBefore) {
      this.state = { ...this.state, shelterAnchor: null, shelterFlip: false };
      saveGame(this.state);
    }
    if (id === 'fire-ring' && this.state.fire.ring === ringBefore) {
      this.state = { ...this.state, fireTile: null };
      saveGame(this.state);
    }
  }

  /** Slide the camera just enough that the whole ghost stays between the bars. */
  private keepGhostInView(at: { x: number; y: number }, wide: boolean): void {
    const cam = this.cameras.main;
    const top = document.getElementById('top-bar');
    const bottom = document.getElementById('bottom-bar');
    const topH = top && !top.hidden ? top.offsetHeight : 0;
    const bottomH = bottom && !bottom.hidden ? bottom.offsetHeight : 0;
    const zoom = cam.zoom;
    const originX = cam.width * 0.5;
    const originY = cam.height * 0.5;
    const screenX = (at.x - cam.scrollX) * zoom + originX * (1 - zoom);
    const screenY = (at.y - cam.scrollY) * zoom + originY * (1 - zoom);
    const halfW = (wide ? 34 : 18) * zoom;
    const up = (wide ? 42 : 34) * zoom;
    const down = 14 * zoom;
    const margin = 8;
    const minX = margin;
    const maxX = cam.width - margin;
    const minY = topH + margin;
    const maxY = cam.height - bottomH - margin;
    let dx = 0;
    let dy = 0;
    if (screenX - halfW < minX) dx = screenX - halfW - minX;
    else if (screenX + halfW > maxX) dx = screenX + halfW - maxX;
    if (screenY - up < minY) dy = screenY - up - minY;
    else if (screenY + down > maxY) dy = screenY + down - maxY;
    if (dx === 0 && dy === 0) return;
    cam.scrollX += dx / zoom;
    cam.scrollY += dy / zoom;
  }
}
