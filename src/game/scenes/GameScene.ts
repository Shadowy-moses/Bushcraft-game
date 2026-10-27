import Phaser from 'phaser';
import { frameOrigin, standinOrigin } from '../atlas';
import { across, blocksStep, canAfford, edgeArt, edgeOffset, EDGES, pieceKey, pieceSpot, suggestPiece, WOOD_COST } from '../build';
import { COLS, PLAY_MINUTES_PER_SECOND, REST_ENERGY_PER_SECOND, REST_MINUTES_PER_SECOND, ROWS, ZOOM } from '../constants';
import { HEADING, REST_TIP } from '../copy';
import { chebyshev, clamp, depthFor, tileToWorld, worldToTile } from '../iso';
import { SHADOW_TINT, lightTint, multiplyTint, skyColor } from '../light';
import { PROPS, blockedFor, groundAt, inBounds, propAt } from '../map';
import { buildModel, type PlaceModel, type SheetId } from '../model';
import { findPath, planRoute, DIRS } from '../path';
import { chopTree, gainEnergy, gather, initialState, placePiece, tick } from '../rules';
import { clearGame, loadGame, saveGame } from '../save';
import { isFelled } from '../trees';
import type { EdgeName, GameState, PieceKind, Prop, PropKind, Tile } from '../types';
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

interface PropView {
  prop: Prop;
  sprite: Phaser.GameObjects.Sprite;
}

interface Floater {
  text: Phaser.GameObjects.Text;
  life: number;
  y: number;
}

interface PendingPlace {
  kind: PieceKind;
  tile: Tile;
  edge: EdgeName;
}

declare global {
  interface Window {
    __firstNight?: {
      state: () => GameState;
      act: (id: string) => void;
      gather: (id: string) => string;
      chop: (id: string) => string;
      jump: (minutes: number) => void;
      teleport: (tx: number, ty: number) => void;
      resolve: (x: number, y: number) => { tx: number; ty: number };
      target: (x: number, y: number) => { tx: number; ty: number; prop: string | null };
      tryWalk: (tx: number, ty: number) => { ok: boolean; tip: string; tx: number; ty: number };
      screenOf: (tx: number, ty: number) => { x: number; y: number };
      fill: () => void;
      beginPlace: (kind: PieceKind) => void;
      ghost: () => { kind: PieceKind | null; tx: number; ty: number; edge: EdgeName; valid: boolean };
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
  private buildings = new Map<string, Phaser.GameObjects.Sprite>();
  private stumps = new Map<string, Phaser.GameObjects.Sprite>();
  private marker?: Phaser.GameObjects.Sprite;
  private ghost?: Phaser.GameObjects.Sprite;
  private placing: PieceKind | null = null;
  private pending: PendingPlace | null = null;
  private ghostAnchor: Tile = { tx: 0, ty: 0 };
  private ghostEdge: EdgeName = 'se';
  private placeValid = false;
  private placeHint = '';
  private pointer = { x: 0, y: 0, down: false };
  private pose: 'idle' | 'walk' | 'gather' | 'chop' = 'idle';
  private poseUntil = 0;
  /** Tree that stays standing until the felling swing finishes. */
  private chopTarget: string | null = null;
  private path: { tx: number; ty: number }[] = [];
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private stepT = 0;
  private readonly stepDur = 0.28;
  private arrive: (() => void) | null = null;
  private minuteBank = 0;
  private saveBank = 0;
  private hudBank = 0;
  private floaters: Floater[] = [];
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
    this.pending = null;
    this.placeValid = false;
    this.ground = new Map();
    this.propViews = [];
    this.buildings = new Map();
    this.stumps = new Map();
    this.floaters = [];
    this.pose = 'idle';
    this.poseUntil = 0;
    const saved = loadGame();
    if (saved) {
      this.state = saved;
      this.started = true;
      this.sheet = 'none';
    } else {
      this.state = initialState();
      this.started = this.skipTitle;
      this.sheet = this.skipTitle ? 'none' : 'title';
      if (this.skipTitle) saveGame(this.state);
    }

    this.buildGround();
    this.buildProps();
    this.buildMarkers();
    this.buildPlayer();
    this.refreshShadows();
    this.syncProps();
    this.syncStumps();
    this.syncBuildings();

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
      gather: (id) => this.debugGather(id),
      chop: (id) => this.debugChop(id),
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
      resolve: (x: number, y: number) => {
        const world = this.cameras.main.getWorldPoint(x, y);
        return worldToTile(world.x, world.y);
      },
      target: (x: number, y: number) => {
        const world = this.cameras.main.getWorldPoint(x, y);
        const prop = this.propAtPoint(world.x, world.y);
        const tile = worldToTile(world.x, world.y);
        return { tx: tile.tx, ty: tile.ty, prop: prop?.id ?? null };
      },
      tryWalk: (tx: number, ty: number) => {
        const ok = this.walkTo(tx, ty);
        return { ok, tip: this.state.tip, tx: this.state.tx, ty: this.state.ty };
      },
      screenOf: (tx: number, ty: number) => {
        const pos = tileToWorld(tx, ty);
        const camera = this.cameras.main;
        const m = (camera as unknown as { matrix: { matrix: number[] } }).matrix.matrix;
        const rect = this.game.canvas.getBoundingClientRect();
        const x = (pos.x - camera.scrollX) * m[0] + (pos.y - camera.scrollY) * m[2] + m[4];
        const y = (pos.x - camera.scrollX) * m[1] + (pos.y - camera.scrollY) * m[3] + m[5];
        return { x: rect.left + x, y: rect.top + y };
      },
      fill: () => {
        this.state = { ...this.state, energy: 100, inventory: { wood: 200 } };
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
      ghost: () => ({
        kind: this.placing,
        tx: this.ghostAnchor.tx,
        ty: this.ghostAnchor.ty,
        edge: this.ghostEdge,
        valid: this.placeValid,
      }),
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
    this.stepFloaters(dt);
    if (this.started && !this.hidden && this.sheet === 'none' && !this.placing && this.state.outcome === 'playing') {
      let rate: number = PLAY_MINUTES_PER_SECOND;
      if (this.resting) {
        rate = REST_MINUTES_PER_SECOND;
        this.state = gainEnergy(this.state, dt * REST_ENERGY_PER_SECOND);
      }
      this.minuteBank += dt * rate;
      if (this.minuteBank >= 0.2) {
        const minutes = this.minuteBank;
        this.minuteBank = 0;
        const before = this.state.trees;
        this.state = tick(this.state, minutes);
        if (this.state.trees !== before) {
          this.syncProps();
          this.syncStumps();
        }
      }
      if (this.resting && this.state.energy >= 100) {
        this.resting = false;
        this.state = { ...this.state, tip: 'Rested. On your feet.' };
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

  private buildMarkers(): void {
    this.ghost = this.add.sprite(0, 0, 'foundation');
    this.ghost.setOrigin(0.5, 0.8);
    this.ghost.setVisible(false);
    const markerOrigin = standinOrigin('tile_marker');
    this.marker = this.add.sprite(0, 0, 'tile_marker');
    this.marker.setOrigin(markerOrigin.x, markerOrigin.y);
    this.marker.setVisible(false);
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
    if (prop && this.isTree(prop) && !isFelled(this.state.trees, prop.id)) {
      this.goChop(prop);
      return;
    }
    if (prop?.gather) {
      this.goGather(prop);
      return;
    }
    if (prop?.blocks) {
      this.setTip(prop.kind === 'rock' ? 'That rock is staying put.' : 'The trees are too tight to walk through.');
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

  private isTree(prop: Prop): boolean {
    return prop.kind === 'pine_tree' || prop.kind === 'birch_tree';
  }

  private isGone(prop: Prop): boolean {
    if (this.isTree(prop) && isFelled(this.state.trees, prop.id)) {
      return this.chopTarget !== prop.id;
    }
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
      if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
      this.afterChange();
    });
  }

  private goChop(prop: Prop): void {
    if (this.state.tool !== 'hatchet') {
      this.setTip('Put the hatchet in your hand.');
      return;
    }
    this.walkTo(prop.tx, prop.ty, () => {
      const result = chopTree(this.state, prop.id);
      if (!result.ok) {
        this.setTip(result.message);
        return;
      }
      this.state = result.state;
      this.faceTile(prop.tx, prop.ty);
      if (result.popup) this.chopTarget = prop.id;
      this.playPose('chop');
      if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
      this.afterChange();
    });
  }

  private edgeBlocked(from: Tile, to: Tile): boolean {
    return blocksStep(this.state.pieces, from, to);
  }

  private walkTo(tx: number, ty: number, arrive?: () => void): boolean {
    const from = { tx: this.state.tx, ty: this.state.ty };
    const blocked = blockedFor(this.state);
    const edge = (a: Tile, b: Tile) => this.edgeBlocked(a, b);
    let plan: { path: { tx: number; ty: number }[]; stand: { tx: number; ty: number } } | null;
    if (!blocked(tx, ty)) {
      const path = findPath(from, { tx, ty }, blocked, edge);
      plan = path === null ? null : { path, stand: { tx, ty } };
    } else {
      plan = planRoute(from, tx, ty, blocked, edge);
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
      const reveal = this.pose === 'chop' && this.chopTarget;
      this.pose = 'idle';
      this.chopTarget = null;
      this.showIdle();
      if (reveal) {
        this.syncProps();
        this.syncStumps();
      }
    }
  }

  /** Turn toward a tile. A zero step keeps the facing he already has. */
  private faceTile(tx: number, ty: number): void {
    const from = tileToWorld(this.state.tx, this.state.ty);
    const to = tileToWorld(tx, ty);
    const facing = facingFromDelta(to.x - from.x, to.y - from.y, this.state.facing);
    this.state = { ...this.state, facing };
  }

  private stopWalk(): void {
    this.pending = null;
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
    if (id.startsWith('slot-')) {
      const index = Number(id.slice(5));
      if (index === 0) this.state = { ...this.state, tool: 'hatchet' };
      if (index === 1) {
        this.state = { ...this.state, tool: 'plan' };
        this.openCraft();
        return;
      }
      this.paintHud(false);
      return;
    }
    if (id === 'pack' || id === 'craft') {
      this.openCraft();
      return;
    }
    if (id === 'place-foundation' || id === 'place-wall' || id === 'place-doorway' || id === 'place-floor') {
      this.tryBeginPlace(id.slice('place-'.length) as PieceKind);
      return;
    }
    if (id === 'flip') {
      if (this.placing !== 'wall' && this.placing !== 'doorway') return;
      const index = EDGES.indexOf(this.ghostEdge);
      this.ghostEdge = EDGES[(index + 1) % EDGES.length];
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
      this.setTip(REST_TIP);
      this.paintHud(true);
      this.layoutCamera();
    }
  }

  private openCraft(): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    if (this.placing) this.endPlace();
    this.resting = false;
    this.stopWalk();
    this.sheet = 'craft';
    this.paintHud(true);
    this.layoutCamera();
  }

  private afterChange(): void {
    const pos = tileToWorld(this.state.tx, this.state.ty);
    if (this.path.length === 0 && this.player) {
      this.player.setPosition(pos.x, pos.y);
      this.player.setDepth(depthFor(pos.y, 6));
    }
    this.refreshShadows();
    this.syncProps();
    this.syncStumps();
    this.syncBuildings();
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
    for (const piece of this.state.pieces) {
      if (piece.kind === 'foundation' || piece.kind === 'floor') this.shaded.add(`${piece.tx},${piece.ty}`);
    }
  }

  private syncProps(): void {
    for (const view of this.propViews) view.sprite.setVisible(!this.isGone(view.prop));
  }

  private syncStumps(): void {
    const felled = new Set<string>();
    for (const prop of PROPS) {
      if (!this.isTree(prop) || !isFelled(this.state.trees, prop.id)) continue;
      felled.add(prop.id);
      let stump = this.stumps.get(prop.id);
      if (!stump) {
        const pos = tileToWorld(prop.tx, prop.ty);
        stump = this.add.sprite(pos.x, pos.y, 'stump');
        stump.setOrigin(0.5, 1);
        stump.setDepth(depthFor(pos.y, 2));
        this.stumps.set(prop.id, stump);
      }
      stump.setVisible(this.chopTarget !== prop.id);
    }
    for (const [id, stump] of this.stumps) {
      if (!felled.has(id)) stump.setVisible(false);
    }
  }

  private syncBuildings(): void {
    const live = new Set<string>();
    for (const piece of this.state.pieces) {
      const key = pieceKey(piece);
      live.add(key);
      let sprite = this.buildings.get(key);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, 'foundation');
        this.buildings.set(key, sprite);
      }
      const pos = tileToWorld(piece.tx, piece.ty);
      if (piece.kind === 'foundation') {
        sprite.setTexture('foundation');
        sprite.setOrigin(0.5, 0.8);
        sprite.setPosition(pos.x, pos.y);
        sprite.setDepth(depthFor(pos.y, 1));
        sprite.setFlipX(false);
      } else if (piece.kind === 'floor') {
        sprite.setTexture('floor');
        sprite.setOrigin(0.5, 1);
        sprite.setPosition(pos.x, pos.y - 14);
        sprite.setDepth(depthFor(pos.y, 12));
        sprite.setFlipX(false);
      } else {
        const art = edgeArt(piece.kind, piece.edge);
        const off = edgeOffset(piece.edge);
        sprite.setTexture(art.key);
        sprite.setOrigin(0.5, 1);
        sprite.setFlipX(art.flip);
        sprite.setPosition(pos.x + off.x, pos.y + off.y);
        sprite.setDepth(depthFor(pos.y + off.y, 5));
      }
      sprite.setVisible(true);
    }
    for (const [key, sprite] of this.buildings) {
      if (live.has(key)) continue;
      sprite.destroy();
      this.buildings.delete(key);
    }
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
    const sky = skyColor(this.state.minutes);
    this.cameras.main.setBackgroundColor(sky);
    const app = document.getElementById('app');
    if (app && app.style.background !== sky) app.style.background = sky;
    const feet = `${this.state.tx},${this.state.ty}`;
    for (const [key, sprite] of this.ground) {
      const [tx, ty] = key.split(',').map(Number);
      let tint = lightTint(this.state.minutes, tx, ty, false, null);
      if (this.shaded.has(key) || key === feet) tint = multiplyTint(tint, SHADOW_TINT);
      sprite.setTint(tint);
    }
    for (const view of this.propViews) {
      view.sprite.setTint(lightTint(this.state.minutes, view.prop.tx, view.prop.ty, false, null));
    }
    this.player?.setTint(lightTint(this.state.minutes, this.state.tx, this.state.ty, false, null));
    for (const piece of this.state.pieces) {
      const sprite = this.buildings.get(pieceKey(piece));
      sprite?.setTint(lightTint(this.state.minutes, piece.tx, piece.ty, false, null));
    }
    for (const stump of this.stumps.values()) {
      stump.setTint(lightTint(this.state.minutes, this.state.tx, this.state.ty, false, null));
    }
  }

  private setTip(message: string): void {
    this.state = { ...this.state, tip: message };
    this.paintHud(false);
  }

  private paintHud(rebuild: boolean): void {
    this.hud.render(buildModel(this.state, this.sheet, this.resting, this.placeModel()), rebuild);
  }

  private placeModel(): PlaceModel | null {
    if (!this.placing) return null;
    return { kind: this.placing, valid: this.placeValid, hint: this.placeHint };
  }

  private tryBeginPlace(kind: PieceKind): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    if (!canAfford(this.state, kind)) {
      if (this.state.inventory.wood < WOOD_COST[kind]) {
        this.setTip(`Needs ${WOOD_COST[kind]} wood. You have ${this.state.inventory.wood}.`);
      } else {
        this.setTip('Rest first. Raising this takes some energy.');
      }
      return;
    }
    this.beginPlace(kind);
  }

  private beginPlace(kind: PieceKind): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    this.resting = false;
    this.stopWalk();
    this.sheet = 'none';
    this.placing = kind;
    const spot = suggestPiece(this.state, kind);
    this.ghostAnchor = spot.tile;
    this.ghostEdge = spot.edge;
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

  private ghostPose(): { x: number; y: number; key: string; ox: number; oy: number; tall: boolean } {
    const pos = tileToWorld(this.ghostAnchor.tx, this.ghostAnchor.ty);
    if (this.placing === 'wall' || this.placing === 'doorway') {
      const art = edgeArt(this.placing, this.ghostEdge);
      const off = edgeOffset(this.ghostEdge);
      return { x: pos.x + off.x, y: pos.y + off.y, key: art.key, ox: 0.5, oy: 1, tall: true };
    }
    if (this.placing === 'floor') return { x: pos.x, y: pos.y - 14, key: 'floor', ox: 0.5, oy: 1, tall: false };
    return { x: pos.x, y: pos.y, key: 'foundation', ox: 0.5, oy: 0.8, tall: false };
  }

  private refreshGhost(): void {
    const sprite = this.ghost;
    if (!sprite || !this.placing) return;
    const spot = pieceSpot(this.placing, this.ghostAnchor, this.ghostEdge, this.state);
    const pose = this.ghostPose();
    sprite.setTexture(pose.key);
    sprite.setOrigin(pose.ox, pose.oy);
    sprite.setFlipX(false);
    sprite.setAlpha(0.8);
    sprite.setTintFill(spot.ok ? 0x7a9a44 : 0xc4401c);
    sprite.setPosition(Math.round(pose.x), Math.round(pose.y));
    sprite.setDepth(20000);
    sprite.setVisible(true);
    this.keepGhostInView(pose, pose.tall);
    this.placeValid = spot.ok && canAfford(this.state, this.placing);
    this.placeHint = spot.ok && !canAfford(this.state, this.placing) ? `Needs ${WOOD_COST[this.placing]} wood.` : spot.reason;
    if (this.state.tip !== this.placeHint) this.setTip(this.placeHint);
    else this.paintHud(false);
  }

  private confirmPlace(): void {
    if (!this.placing) return;
    const kind = this.placing;
    const tile = { tx: this.ghostAnchor.tx, ty: this.ghostAnchor.ty };
    const edge = this.ghostEdge;
    const spot = pieceSpot(kind, tile, edge, this.state);
    if (!spot.ok) {
      this.setTip(spot.reason);
      this.paintHud(false);
      return;
    }
    if (!canAfford(this.state, kind)) {
      this.setTip(`Needs ${WOOD_COST[kind]} wood. You have ${this.state.inventory.wood}.`);
      this.paintHud(false);
      return;
    }
    const stand = this.standTile(kind, tile, edge);
    if (!stand) {
      this.setTip('No way through.');
      return;
    }
    this.endPlace();
    this.pending = { kind, tile, edge };
    this.setTip(HEADING);
    const walked = this.walkTo(stand.tx, stand.ty, () => this.finishPlacement());
    if (!walked) this.stopWalk();
  }

  private standTile(kind: PieceKind, tile: Tile, edge: EdgeName): Tile | null {
    const blocked = blockedFor(this.state);
    const here = { tx: this.state.tx, ty: this.state.ty };
    const options: Tile[] = [];
    if (kind === 'wall' || kind === 'doorway') options.push(tile, across(tile.tx, tile.ty, edge));
    for (const d of DIRS) options.push({ tx: tile.tx + d.tx, ty: tile.ty + d.ty });
    const usable = (spot: Tile): boolean => {
      if (kind === 'foundation' && spot.tx === tile.tx && spot.ty === tile.ty) return false;
      return !blocked(spot.tx, spot.ty);
    };
    if (usable(here) && chebyshev(here.tx, here.ty, tile.tx, tile.ty) <= 1) return here;
    let best: Tile | null = null;
    let bestLen = Infinity;
    for (const spot of options) {
      if (!usable(spot)) continue;
      const path = findPath(here, spot, blocked, (a, b) => this.edgeBlocked(a, b));
      if (path === null || path.length >= bestLen) continue;
      best = spot;
      bestLen = path.length;
    }
    return best;
  }

  private finishPlacement(): void {
    const job = this.pending;
    this.pending = null;
    if (!job) return;
    const spot = pieceSpot(job.kind, job.tile, job.edge, this.state);
    if (!spot.ok) {
      this.setTip(spot.reason);
      return;
    }
    const result = placePiece(this.state, job.kind, job.tile.tx, job.tile.ty, job.edge);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(job.tile.tx, job.tile.ty);
    this.playPose('chop');
    this.afterChange();
  }

  private popup(message: string, tx: number, ty: number): void {
    const pos = tileToWorld(tx, ty);
    const text = this.add.text(pos.x, pos.y - 28, message, {
      fontFamily: '"Courier New", ui-monospace, monospace',
      fontSize: '8px',
      color: '#e8e0c8',
      stroke: '#1a1420',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 1);
    text.setDepth(30000);
    this.floaters.push({ text, life: 0, y: text.y });
  }

  private stepFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.life += dt;
      floater.text.setY(floater.y - floater.life * 14);
      floater.text.setAlpha(Math.max(0, 1 - floater.life / 1.15));
      if (floater.life < 1.15) continue;
      floater.text.destroy();
      this.floaters.splice(i, 1);
    }
  }

  private debugGather(id: string): string {
    const result = gather(this.state, id);
    if (!result.ok) return result.message;
    const prop = PROPS.find((item) => item.id === id);
    this.state = result.state;
    if (prop) this.faceTile(prop.tx, prop.ty);
    this.playPose('gather');
    if (result.popup && prop) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
    return result.message;
  }

  private debugChop(id: string): string {
    const result = chopTree(this.state, id);
    if (!result.ok) return result.message;
    const prop = PROPS.find((item) => item.id === id);
    this.state = result.state;
    if (prop) this.faceTile(prop.tx, prop.ty);
    if (result.popup) this.chopTarget = id;
    this.playPose('chop');
    if (result.popup && prop) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
    return result.message;
  }

  /** Slide the camera just enough that the whole ghost stays between the bars. */
  private keepGhostInView(at: { x: number; y: number }, tall: boolean): void {
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
    const halfW = 18 * zoom;
    const up = (tall ? 40 : 18) * zoom;
    const down = 10 * zoom;
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
