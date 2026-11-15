import Phaser from 'phaser';
import { frameOrigin, standinOrigin } from '../atlas';
import {
  approachBuild,
  canAfford,
  dampStep,
  edgeAhead,
  edgeOffset,
  nearestSocket,
  pieceAnchor,
  pieceFrame,
  pieceKey,
  materialShortMessage,
  pieceSpot,
  placementVerdict,
  rotateWall,
  suggestPiece,
  woodShortMessage,
} from '../build';
import {
  COLS,
  FOLLOW_MAX_H,
  FOLLOW_MAX_W,
  REST_MINUTES_PER_SECOND,
  ROWS,
  TRIPOD_CORDAGE,
  TRIPOD_WOOD,
  ZOOM,
} from '../constants';
import { AXE_IDLE, HATCHET_IDLE, OPENING_TIP, restingTip } from '../copy';
import { CORD_SECONDS, fiberFrame, isFiberCut } from '../fiber';
import { addFirewood, blowCoal, craftBowdrill, craftKindling, craftTinder, DRILL_FIZZLE, fireShort, giveCoal, nearestFire, nearEmberFire, nearLitFire, stepDrill } from '../fire';
import { clamp, depthFor, tileToWorld, worldToTile } from '../iso';
import { SHADOW_TINT, lightTint, multiplyTint, skyColor } from '../light';
import { PROPS, groundAt, inBounds, propAt } from '../map';
import { buildModel, type PlaceModel, type SheetId } from '../model';
import {
  BUILD_REACH,
  CHOP_REACH,
  bodiesFor,
  gatherStand,
  inReach,
  inReachOf,
  PICKUP_RADIUS,
  reachFor,
  resolveMove,
  segmentsFor,
  stickDirection,
  travelSpeed,
} from '../move';
import {
  beginCordage,
  besideTripod,
  chopTree,
  craftAxe,
  craftBowl,
  craftPot,
  peelBirch,
  finishCordage,
  gainEnergy,
  gather,
  coverTripod,
  initialState,
  knapFlint,
  minutesThisFrame,
  nearestBareTripod,
  placePiece,
  repairPiece,
  restEnergyPerSecond,
  strikeRock,
  tick,
  upgradePiece,
} from '../rules';
import { flintFrame, rockFrame } from '../stone';
import { clearGame, loadGame, saveGame } from '../save';
import { isFelled } from '../trees';
import { hotbarSlots } from '../craft';
import { chooseUse, upgradePrompt, waterChoice } from '../use';
import type { EdgeName, GameState, Material, Piece, PieceKind, Prop, PropKind, Tile } from '../types';
import { BOIL_METHOD } from '../boil';
import { drinkBowl, drinkCreek, drinkCup, eat, finishBoil, liftPot, plantFrame, scoopBowl, scoopCreek } from '../food';
import { dropHotStone, heatStone, HEAT_SECONDS, markStoneHot, refundStone, STONE_BOIL_SECONDS } from '../stoneboil';
import { weatherAt } from '../weather';
import { facingFromVector, mirrorFacing, poseClip, poseName } from '../woodsman';
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

interface Chip {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  ground: number;
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
      stick: (x: number, y: number) => void;
      screenOf: (tx: number, ty: number) => { x: number; y: number };
      fill: () => void;
      beginPlace: (kind: PieceKind) => void;
      ghost: () => { kind: PieceKind | null; tx: number; ty: number; edge: EdgeName; valid: boolean; scale: number; marked: boolean };
      moveGhost: (tx: number, ty: number) => void;
      flipGhost: () => void;
      confirmPlace: () => void;
      occlude: () => { key: string; alpha: number }[];
      chips: () => number;
      chipAt: () => { x: number; y: number; s: number; a: number; sx: number; sy: number }[];
      zoom: () => { zoom: number; viewW: number; viewH: number };
      hint: () => boolean;
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
  private debugMode = false;
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
  private logs = new Map<string, Phaser.GameObjects.Sprite>();
  private logUntil = new Map<string, number>();
  private marker?: Phaser.GameObjects.Sprite;
  private ghost?: Phaser.GameObjects.Sprite;
  private placing: PieceKind | null = null;
  private placingMaterial: Material = 'twig';
  private pending: PendingPlace | null = null;
  private ghostAnchor: Tile = { tx: 0, ty: 0 };
  private ghostEdge: EdgeName = 'se';
  /** World point the ghost eases toward. Snaps to a tile or a foundation edge. */
  private aimX = 0;
  private aimY = 0;
  private dragX = 0;
  private dragY = 0;
  private draggingGhost = false;
  private edgeHint?: Phaser.GameObjects.Sprite;
  private edgeMark?: Phaser.GameObjects.Graphics;
  private ghostHome = { x: 0, y: 0 };
  private shove = { x: 0, y: 0, until: 0 };
  private ghostPulse = 0;
  private approach: { x: number; y: number; kind: PieceKind; tile: Tile; edge: EdgeName } | null = null;
  private approachStill = 0;
  private walkTo: { x: number; y: number; id: string } | null = null;
  private drill: { tx: number; ty: number; progress: number } | null = null;
  private rain: Phaser.GameObjects.Sprite[] = [];
  private puddles: Phaser.GameObjects.Sprite[] = [];
  private splashes: Phaser.GameObjects.Sprite[] = [];
  private fireGlows = new Map<string, Phaser.GameObjects.Sprite>();
  private warmthRing: Phaser.GameObjects.Sprite | null = null;
  private holdingDrill = false;
  private fx: Phaser.GameObjects.Sprite | null = null;
  private fxUntil = 0;
  private placeValid = false;
  private placeHint = '';
  private pointer = { x: 0, y: 0, down: false };
  private pose: 'idle' | 'walk' | 'gather' | 'chop' | 'strike' = 'idle';
  private poseUntil = 0;
  /** Tree that stays standing until the felling swing finishes. */
  private chopTarget: string | null = null;
  private px = 0;
  private py = 0;
  private stickX = 0;
  private stickY = 0;
  private keys = new Set<string>();
  private rested = 0;
  private craftJob: { label: string; started: number; seconds: number } | null = null;
  private boilJob: { started: number; tx: number; ty: number } | null = null;
  private steam: Phaser.GameObjects.Sprite | null = null;
  private potSprite: Phaser.GameObjects.Sprite | null = null;
  private heatJob: { started: number; tx: number; ty: number; spent: 'dry' | 'wet' } | null = null;
  private stoneAt: { tx: number; ty: number } | null = null;
  private stoneSprite: Phaser.GameObjects.Sprite | null = null;
  private bowlSprite: Phaser.GameObjects.Sprite | null = null;
  private bowlShowUntil = 0;
  private crackSprite: Phaser.GameObjects.Sprite | null = null;
  private crackUntil = 0;
  private chips: Chip[] = [];
  private reachMark?: Phaser.GameObjects.Graphics;
  private minuteBank = 0;
  private saveBank = 0;
  private hudBank = 0;
  private floaters: Floater[] = [];
  private onVis = (): void => undefined;
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.handleAction('close');
    if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
    this.keys.add(event.key.toLowerCase());
    if ((event.key === 'e' || event.key === ' ') && !event.repeat) {
      this.holdingDrill = true;
      this.handleAction('use');
    }
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.key === 'e' || event.key === ' ') {
      this.holdingDrill = false;
      this.releaseDrill();
    }
  };
  private resizeObs?: ResizeObserver;

  constructor() {
    super('game');
  }

  init(data: { skipTitle?: boolean }): void {
    this.skipTitle = Boolean(data?.skipTitle);
  }

  create(): void {
    this.stickX = 0;
    this.stickY = 0;
    this.keys.clear();
    this.resting = false;
    this.placing = null;
    this.pending = null;
    this.placeValid = false;
    this.ground = new Map();
    this.propViews = [];
    this.buildings = new Map();
    this.stumps = new Map();
    this.logs = new Map();
    this.logUntil = new Map();
    this.floaters = [];
    this.chips = [];
    this.rested = 0;
    this.craftJob = null;
    this.pose = 'idle';
    this.poseUntil = 0;
    this.debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
    if (this.debugMode) clearGame();
    const saved = this.debugMode ? null : loadGame();
    if (saved) {
      this.state = saved;
      this.started = true;
      this.sheet = 'none';
    } else {
      const fresh = initialState();
      this.state = this.debugMode
        ? {
            ...fresh,
            inventory: {
              ...fresh.inventory,
              wood: 40,
              fiber: 20,
              stone: 20,
              cordage: 4,
              bark: 2,
              flakes: 1,
              axe: true,
              bowl: true,
              wetCobble: 1,
            },
          }
        : fresh;
      this.started = this.debugMode || this.skipTitle;
      this.sheet = this.started ? 'none' : 'title';
      if (this.started) saveGame(this.state);
    }

    this.buildGround();
    this.buildProps();
    this.buildMarkers();
    this.buildPlayer();
    this.refreshShadows();
    this.syncProps();
    this.syncRocks();
    this.syncStumps();
    this.syncBuildings();

    const root = document.getElementById('hud');
    if (!root) throw new Error('Missing hud');
    this.hud = new Hud(root);
    this.hud.setHandlers({
      onAction: (id) => this.handleAction(id),
      onStick: (x, y) => {
        this.stickX = x;
        this.stickY = y;
        if (Math.hypot(x, y) > 0.1) this.resting = false;
      },
    });
    const act = document.getElementById('act');
    act?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.holdingDrill = true;
      if (this.tryStartDrill()) event.preventDefault();
    });
    window.addEventListener('pointerup', () => {
      if (!this.holdingDrill) return;
      this.holdingDrill = false;
      this.releaseDrill();
    });

    const cam = this.cameras.main;
    cam.roundPixels = true;
    cam.centerOn(this.player.x, this.player.y);
    cam.startFollow(this.player, true, 0.18, 0.18);
    this.layoutCamera();
    this.applyTints();
    this.paintHud(true);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.x, y: pointer.y, down: true };
      if (this.placing) {
        this.dragX = pointer.x;
        this.dragY = pointer.y;
        this.draggingGhost = false;
        return;
      }
      this.onPointer(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const prevX = this.pointer.x;
      const prevY = this.pointer.y;
      this.pointer = { x: pointer.x, y: pointer.y, down: pointer.isDown };
      const held = pointer.isDown || pointer.leftButtonDown();
      if (!this.placing || !held) return;
      const sdx = pointer.x - prevX;
      const sdy = pointer.y - prevY;
      if (sdx === 0 && sdy === 0) return;
      this.draggingGhost = true;
      this.slideGhost(sdx, sdy);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const moved = Math.hypot(pointer.x - this.dragX, pointer.y - this.dragY);
      const tap = this.placing && !this.draggingGhost && moved < 12;
      this.pointer.down = false;
      this.draggingGhost = false;
      this.edgeHint?.setVisible(false);
      this.paintCurrentEdge();
      if (tap) this.tapGhost(pointer);
    });
    this.scale.on('resize', () => {
      this.layoutCamera();
      this.time.delayedCall(0, () => this.layoutCamera());
    });
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
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

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
        const pos = tileToWorld(tx, ty);
        this.px = pos.x;
        this.py = pos.y;
        this.state = { ...this.state, tx, ty, x: pos.x, y: pos.y };
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
        const at = tileToWorld(tx, ty);
        const moved = resolveMove(
          this.px,
          this.py,
          at.x - this.px,
          at.y - this.py,
          bodiesFor(this.state),
          segmentsFor(this.state.pieces),
        );
        const arrived = Math.hypot(moved.x - at.x, moved.y - at.y) < 8;
        const tile = worldToTile(moved.x, moved.y);
        return { ok: arrived, tip: arrived ? this.state.tip : 'The island ends there.', tx: tile.tx, ty: tile.ty };
      },
      stick: (x: number, y: number) => {
        this.stickX = x;
        this.stickY = y;
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
        this.state = { ...this.state, energy: 100, inventory: { ...this.state.inventory, wood: 200 } };
        this.afterChange();
      },
      beginPlace: (kind) => this.beginPlace(kind),
      moveGhost: (tx, ty) => {
        if (!this.placing) return;
        this.ghostAnchor = { tx, ty };
        this.aimFromGhost();
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
        scale: this.ghost?.scaleX ?? 1,
        marked: Boolean(this.edgeMark?.visible),
      }),
      occlude: () =>
        [...this.buildings.entries()]
          .filter(([, sprite]) => sprite.alpha < 0.95)
          .map(([key, sprite]) => ({ key, alpha: sprite.alpha })),
      chips: () => this.chips.length,
      chipAt: () => {
        const camera = this.cameras.main;
        const m = (camera as unknown as { matrix: { matrix: number[] } }).matrix.matrix;
        const rect = this.game.canvas.getBoundingClientRect();
        return this.chips.map((chip) => {
          const x = (chip.sprite.x - camera.scrollX) * m[0] + (chip.sprite.y - camera.scrollY) * m[2] + m[4];
          const y = (chip.sprite.x - camera.scrollX) * m[1] + (chip.sprite.y - camera.scrollY) * m[3] + m[5];
          return {
            x: Math.round(chip.sprite.x),
            y: Math.round(chip.sprite.y),
            s: chip.sprite.scaleX,
            a: chip.sprite.alpha,
            sx: Math.round(rect.left + x),
            sy: Math.round(rect.top + y),
          };
        });
      },
      zoom: () => ({
        zoom: this.cameras.main.zoom,
        viewW: this.cameras.main.width,
        viewH: this.cameras.main.height,
      }),
      hint: () => Boolean(this.edgeHint?.visible),
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
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.hud.destroy();
      window.__firstNight = undefined;
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    if (this.cameras.main.zoom !== ZOOM) this.layoutCamera();
    if (this.walkTo) this.stepWalk(dt);
    else if (this.approach) this.stepApproach(dt);
    else this.stepFree(dt);
    this.stepDrillFrame(dt);
    this.stepGhostShove();
    this.expirePose();
    this.expireLogs();
    this.stepFloaters(dt);
    this.stepChips(dt);
    this.stepCraft();
    this.stepBoil();
    this.stepStoneWork();
    this.stepAtmosphere();
    this.fadeOccluders();
    if (this.started && !this.hidden && this.sheet === 'none' && !this.placing && this.state.outcome === 'playing') {
      if (this.resting) {
        const sheltered = besideTripod(this.state);
        this.state = gainEnergy(this.state, dt * restEnergyPerSecond(this.state));
        this.rested += dt * REST_MINUTES_PER_SECOND;
        const tip = restingTip(this.rested, sheltered);
        if (this.state.tip !== tip) this.state = { ...this.state, tip };
      }
      this.minuteBank += this.resting ? dt * REST_MINUTES_PER_SECOND : minutesThisFrame(dt);
      if (this.minuteBank >= 0.2) {
        const minutes = this.minuteBank;
        this.minuteBank = 0;
        const beforeTrees = this.state.trees;
        const beforePlants = this.state.plants;
        const beforeRocks = this.state.rocks;
        const beforePicked = this.state.picked;
        const beforeFires = this.state.pieces
          .filter((piece) => piece.kind === 'fire')
          .map((piece) => `${piece.tx},${piece.ty}:${piece.lit}:${piece.fuel}`)
          .join('|');
        this.state = tick(this.state, minutes);
        if (this.state.trees !== beforeTrees) {
          this.syncProps();
          this.syncStumps();
        }
        if (this.state.plants !== beforePlants || this.state.rocks !== beforeRocks || this.state.picked !== beforePicked) {
          this.syncRocks();
          this.syncProps();
        }
        const afterFires = this.state.pieces
          .filter((piece) => piece.kind === 'fire')
          .map((piece) => `${piece.tx},${piece.ty}:${piece.lit}:${piece.fuel}`)
          .join('|');
        if (afterFires !== beforeFires) this.syncBuildings();
      }
      if (!this.resting) this.stepUpgradeHint();
      if (this.resting && this.state.energy >= 100) {
        this.resting = false;
        this.rested = 0;
        this.state = { ...this.state, tip: 'Rested. On your feet.' };
      }
    }
    this.applyTints();
    this.markReach();
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
      const grown = plantFrame(prop.kind, {}, prop.id, 0);
      const frame =
        grown ??
        (prop.kind === 'rock_node'
          ? 'rock_node_0'
          : prop.kind === 'flint_core'
            ? 'flint_core_0'
            : prop.kind === 'river_cobbles'
              ? 'river_cobbles'
              : prop.kind);
      const sprite =
        prop.kind === 'leaf_pile'
          ? this.add.sprite(pos.x, pos.y, 'leaf_pile')
          : this.add.sprite(pos.x, pos.y, 'world', frame);
      if (prop.kind === 'leaf_pile') {
        const origin = standinOrigin('leaf_pile');
        sprite.setOrigin(origin.x, origin.y);
      } else {
        const origin = frameOrigin(frame);
        sprite.setOrigin(origin.x, origin.y);
      }
      sprite.setDepth(depthFor(pos.y, 5));
      this.propViews.push({ prop, sprite });
    }
  }

  private buildMarkers(): void {
    this.ghost = this.add.sprite(0, 0, 'world', 'twig_foundation_ghost_ok');
    this.applyAtlas(this.ghost, 'twig_foundation_ghost_ok');
    this.ghost.setVisible(false);
    this.edgeHint = this.add.sprite(0, 0, 'world', 'twig_wall_ne_ghost_ok');
    this.applyAtlas(this.edgeHint, 'twig_wall_ne_ghost_ok');
    this.edgeHint.setVisible(false);
    this.edgeHint.setAlpha(0.85);
    this.edgeHint.setTint(0xffe08a);
    this.edgeMark = this.add.graphics();
    this.edgeMark.setVisible(false);
    const markerOrigin = standinOrigin('tile_marker');
    this.marker = this.add.sprite(0, 0, 'tile_marker');
    this.marker.setOrigin(markerOrigin.x, markerOrigin.y);
    this.marker.setVisible(false);
  }

  private buildPlayer(): void {
    this.px = this.state.x;
    this.py = this.state.y;
    this.player = this.add.sprite(this.px, this.py, 'world', 'woodsman_idle');
    this.player.setDepth(depthFor(this.py, 6));
    this.player.setFlipX(false);
    this.player.on('animationupdate', () => this.syncFrameOrigin(this.player));
    this.showIdle();
  }

  private layoutCamera(): void {
    const cam = this.cameras.main;
    const parentW = Math.max(1, this.scale.width);
    const parentH = Math.max(1, this.scale.height);
    const viewW = Math.min(parentW, FOLLOW_MAX_W);
    const viewH = Math.min(parentH, FOLLOW_MAX_H);
    const vx = Math.round((parentW - viewW) / 2);
    const vy = Math.round((parentH - viewH) / 2);
    cam.setViewport(vx, vy, viewW, viewH);
    cam.setZoom(ZOOM);
    cam.roundPixels = true;
    const top = document.getElementById('top-bar');
    const bottom = document.getElementById('bottom-bar');
    const topH = top && !top.hidden ? top.offsetHeight : 0;
    const bottomH = bottom && !bottom.hidden ? bottom.offsetHeight : 0;
    cam.setFollowOffset(0, -((bottomH - topH) / (2 * ZOOM)));
    document.getElementById('hud')?.style.setProperty('--dock', `${bottomH}px`);
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.started || this.state.outcome !== 'playing' || this.sheet !== 'none' || this.placing) return;
    if (this.resting) {
      this.resting = false;
      this.rested = 0;
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.potHit(world.x, world.y)) {
      this.takePot();
      return;
    }
    const tile = this.tileAt(world.x, world.y);
    if (this.state.tool === 'hands' && tile && groundAt(tile.tx, tile.ty) === 'creek_water') {
      const water = waterChoice(this.state, { x: this.px, y: this.py });
      if (water?.action === 'drink-creek' || water?.action === 'scoop' || water?.action === 'scoop-bowl') {
        this.handsFood(water.action);
        return;
      }
      this.setTip('Walk up to the water.');
      return;
    }
    const hits = this.propsAtPoint(world.x, world.y);
    if (this.state.tool === 'hatchet' || this.state.tool === 'axe') {
      const tree = hits.find((prop) => this.isTree(prop) && !isFelled(this.state.trees, prop.id));
      if (tree && inReach(this.px, this.py, tree.tx, tree.ty, CHOP_REACH)) {
        this.swingAt(tree);
        return;
      }
      this.setTip(tree ? 'Walk up to the trunk.' : this.state.tool === 'axe' ? AXE_IDLE : HATCHET_IDLE);
      return;
    }
    if (this.state.tool !== 'hands' && this.state.tool !== 'hammerstone') return;
    if (this.state.tool === 'hammerstone') {
      const core = hits.find((prop) => prop.kind === 'flint_core' && inReach(this.px, this.py, prop.tx, prop.ty));
      if (core) {
        this.knapAt(core);
        return;
      }
      const rock = hits.find((prop) => prop.kind === 'rock_node' && inReach(this.px, this.py, prop.tx, prop.ty));
      if (rock) {
        this.strikeAt(rock);
        return;
      }
      const piece = this.pieceAtPoint(world.x, world.y);
      if (piece && (piece.material ?? 'twig') === 'twig') {
        this.upgradeAt(piece);
        return;
      }
      this.setTip('Nothing to strike.');
      return;
    }
    const near = hits
      .filter((prop) => this.actionable(prop) && inReach(this.px, this.py, prop.tx, prop.ty, reachFor(prop)))
      .sort((a, b) => this.reachDist(a) - this.reachDist(b));
    if (near[0]) {
      if (near[0].kind === 'birch_tree') {
        this.peelAt(near[0]);
        return;
      }
      if (this.isTree(near[0])) {
        this.setTip('The hatchet fells a tree.');
        return;
      }
      this.useProp(near[0]);
      return;
    }
    const gatherable = hits.find((prop) => prop.gather && !this.state.picked[prop.id]);
    if (!gatherable) return;
    const stand = gatherStand(gatherable, this.state);
    if (stand) {
      this.walkTo = { x: stand.x, y: stand.y, id: gatherable.id };
      this.setTip('Heading over.');
      return;
    }
    this.setTip('Walk up to it.');
  }

  private tileAt(x: number, y: number): { tx: number; ty: number } | null {
    const tile = worldToTile(x, y);
    if (!inBounds(tile.tx, tile.ty)) return null;
    return tile;
  }

  private pieceAtPoint(x: number, y: number): Piece | null {
    let best: Piece | null = null;
    let depth = -Infinity;
    for (const piece of this.state.pieces) {
      const sprite = this.buildings.get(pieceKey(piece));
      if (!sprite?.visible || !this.opaqueHit(sprite, x, y)) continue;
      if (sprite.depth < depth) continue;
      depth = sprite.depth;
      best = piece;
    }
    return best;
  }

  private propAtPoint(x: number, y: number): Prop | null {
    return this.propsAtPoint(x, y)[0] ?? null;
  }

  private propsAtPoint(x: number, y: number): Prop[] {
    const hits: { prop: Prop; depth: number }[] = [];
    for (const view of this.propViews) {
      if (!view.sprite.visible) continue;
      if (!this.opaqueHit(view.sprite, x, y)) continue;
      hits.push({ prop: view.prop, depth: view.sprite.depth });
    }
    for (const prop of PROPS) {
      if (!this.isTree(prop) || this.isGone(prop)) continue;
      if (hits.some((hit) => hit.prop.id === prop.id)) continue;
      const at = tileToWorld(prop.tx, prop.ty);
      if (Math.hypot(at.x - x, at.y - y) <= 12) hits.push({ prop, depth: at.y });
    }
    hits.sort((a, b) => b.depth - a.depth);
    const tile = this.tileAt(x, y);
    if (tile) {
      const onTile = propAt(tile.tx, tile.ty);
      if (onTile && !this.isGone(onTile) && !hits.some((hit) => hit.prop.id === onTile.id)) {
        hits.push({ prop: onTile, depth: -1 });
      }
    }
    return hits.map((hit) => hit.prop);
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
    return kind === 'item_sticks' || kind === 'item_stone' || kind === 'item_rock' || kind === 'river_cobbles' || kind === 'leaf_pile' || kind === 'birch_log';
  }

  private actionable(prop: Prop): boolean {
    if (this.isTree(prop)) return !isFelled(this.state.trees, prop.id);
    if (prop.kind === 'bush_fiber' || prop.kind === 'berry_bush' || prop.kind === 'cattails') {
      return !isFiberCut(this.state.plants, prop.id, this.state.minutes);
    }
    return Boolean(prop.gather) && !this.state.picked[prop.id];
  }

  private reachDist(prop: Prop): number {
    const at = tileToWorld(prop.tx, prop.ty);
    return Math.hypot(at.x - this.px, at.y - this.py);
  }

  private useProp(prop: Prop): void {
    if (prop.kind === 'flint_core') {
      this.knapAt(prop);
      return;
    }
    if (prop.kind === 'rock_node') {
      this.strikeAt(prop);
      return;
    }
    if (prop.kind === 'birch_tree') {
      this.peelAt(prop);
      return;
    }
    if (prop.gather) this.pickUp(prop);
  }

  private peelAt(prop: Prop): void {
    const result = peelBirch(this.state, prop.id);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(prop.tx, prop.ty);
    this.playPose('gather');
    if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
  }

  private swingAt(prop: Prop): void {
    if ((this.pose === 'chop' || this.pose === 'strike') && this.time.now < this.poseUntil) return;
    if (!inReach(this.px, this.py, prop.tx, prop.ty, CHOP_REACH)) {
      this.setTip('Walk up to the trunk.');
      return;
    }
    const result = chopTree(this.state, prop.id);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(prop.tx, prop.ty);
    if (result.popup) this.chopTarget = prop.id;
    this.playPose('chop');
    const at = tileToWorld(prop.tx, prop.ty);
    this.sprayChips(at.x, at.y, 'wood');
    this.cameras.main.shake(120, 0.0028);
    if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
  }

  private pickUp(prop: Prop): void {
    if (!inReach(this.px, this.py, prop.tx, prop.ty, reachFor(prop))) {
      this.setTip('Walk up to it.');
      return;
    }
    const result = gather(this.state, prop.id);
    if (!result.ok) {
      if (result.message) this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(prop.tx, prop.ty);
    this.playPose('gather');
    if (prop.gather === 'stones' || prop.gather === 'fiber') {
      const at = tileToWorld(prop.tx, prop.ty);
      this.sprayChips(at.x, at.y, prop.gather === 'stones' ? 'stone' : 'wood');
    }
    if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
  }

  private strikeAt(prop: Prop): void {
    if ((this.pose === 'chop' || this.pose === 'strike') && this.time.now < this.poseUntil) return;
    const result = strikeRock(this.state, prop.id);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(prop.tx, prop.ty);
    this.playPose('strike');
    const at = tileToWorld(prop.tx, prop.ty);
    this.sprayChips(at.x, at.y, 'stone');
    this.cameras.main.shake(90, 0.0022);
    if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
  }

  private knapAt(prop: Prop): void {
    if ((this.pose === 'chop' || this.pose === 'strike') && this.time.now < this.poseUntil) return;
    const result = knapFlint(this.state, prop.id);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.faceTile(prop.tx, prop.ty);
    this.playPose('strike');
    const at = tileToWorld(prop.tx, prop.ty);
    this.sprayChips(at.x, at.y, 'stone');
    if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    this.afterChange();
  }

  private upgradeAt(piece: Piece): void {
    const result = upgradePiece(this.state, piece);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.adoptFeet();
    this.faceTile(piece.tx, piece.ty);
    this.playPose('strike');
    this.afterChange();
  }

  private feedFire(piece: Piece): void {
    const result = addFirewood(this.state, piece);
    if (!result.ok) this.setTip(result.message);
    else {
      this.state = result.state;
      this.afterChange();
    }
  }

  private blowAt(piece: Piece): void {
    const result = blowCoal(this.state, piece);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    const at = tileToWorld(piece.tx, piece.ty);
    const frame = piece.ember === 'smoke' ? 'item_tinder_lit_1' : 'item_tinder_lit_0';
    this.showFx(at.x, at.y - 10, frame);
    this.fxUntil = this.time.now + (piece.ember === 'smoke' ? 700 : 900);
    this.afterChange();
  }

  private tryStartDrill(): boolean {
    if (this.drill || !this.state.inventory.bowdrill) return false;
    const fire = nearestFire(this.state, { x: this.px, y: this.py });
    if (!fire || fire.lit || fire.ember === 'smoke') return false;
    if (this.state.energy <= 0) {
      this.setTip('You’re worn out. Rest a moment.');
      return false;
    }
    this.drill = { tx: fire.tx, ty: fire.ty, progress: 0 };
    this.holdingDrill = true;
    this.setTip('Hold. Work the bow.');
    return true;
  }

  private releaseDrill(): void {
    if (!this.drill || this.drill.progress >= 1) return;
    this.drill = null;
    this.hideFx();
    this.setTip(DRILL_FIZZLE);
  }

  private stepDrillFrame(dt: number): void {
    const job = this.drill;
    if (job) {
      const step = stepDrill(job.progress, dt, this.holdingDrill, this.state.energy);
      this.state = { ...this.state, energy: step.energy };
      job.progress = step.progress;
      const at = tileToWorld(job.tx, job.ty);
      const frame = Math.floor(this.time.now / 180) % 2 === 0 ? 'bowdrill_0' : 'bowdrill_1';
      this.showFx(at.x + 14, at.y, frame);
      const pct = Math.round(step.progress * 100);
      const tip = `Hold. Work the bow. ${pct}%`;
      if (this.state.tip !== tip && step.result === 'going') this.setTip(tip);
      if (step.result === 'coal') {
        this.drill = null;
        this.state = giveCoal(this.state);
        this.showFx(at.x + 14, at.y, 'bowdrill_coal');
        this.fxUntil = this.time.now + 1200;
        this.afterChange();
      } else if (step.result === 'fail') {
        this.drill = null;
        this.hideFx();
        this.setTip(step.energy <= 0 ? 'You’re worn out. Rest a moment.' : DRILL_FIZZLE);
      }
      return;
    }
    const smoking = this.state.pieces.find((piece) => piece.kind === 'fire' && piece.ember === 'smoke');
    if (smoking) {
      const at = tileToWorld(smoking.tx, smoking.ty);
      this.showFx(at.x, at.y - 8, 'item_tinder_lit_0');
      return;
    }
    if (this.fx && this.fxUntil > 0 && this.time.now > this.fxUntil) this.hideFx();
  }

  private showFx(x: number, y: number, frame: string): void {
    if (!this.fx) {
      this.fx = this.add.sprite(x, y, 'world', frame);
    }
    this.applyAtlas(this.fx, frame);
    this.fx.setPosition(Math.round(x), Math.round(y));
    this.fx.setDepth(26000);
    this.fx.setVisible(true);
  }

  private hideFx(): void {
    this.fx?.setVisible(false);
    this.fxUntil = 0;
  }

  private stepWalk(dt: number): void {
    const job = this.walkTo;
    if (!job) return;
    const dx = job.x - this.px;
    const dy = job.y - this.py;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      this.walkTo = null;
      const prop = PROPS.find((item) => item.id === job.id);
      if (prop) this.pickUp(prop);
      return;
    }
    const step = Math.min(dist, 90 * dt);
    const prevX = this.px;
    const prevY = this.py;
    const next = resolveMove(this.px, this.py, (dx / dist) * step, (dy / dist) * step, bodiesFor(this.state), segmentsFor(this.state.pieces));
    this.placeFeet(next.x, next.y);
    if (Math.hypot(next.x - prevX, next.y - prevY) < 0.2 && dist > 6) {
      this.walkTo = null;
      this.setTip('Walk up to it.');
    }
  }

  private useNearest(): void {
    if (this.drill) return;
    const choice = chooseUse(this.state, { x: this.px, y: this.py });
    if (choice.action === 'gather') {
      this.pickUp(choice.prop);
      return;
    }
    if (choice.action === 'knap') {
      this.knapAt(choice.prop);
      return;
    }
    if (choice.action === 'chop') {
      this.swingAt(choice.prop);
      return;
    }
    if (choice.action === 'strike') {
      this.strikeAt(choice.prop);
      return;
    }
    if (choice.action === 'upgrade') {
      this.upgradeAt(choice.piece);
      return;
    }
    if (choice.action === 'peel') {
      this.peelAt(choice.prop);
      return;
    }
    if (
      choice.action === 'scoop' ||
      choice.action === 'scoop-bowl' ||
      choice.action === 'drink' ||
      choice.action === 'drink-bowl' ||
      choice.action === 'drink-creek'
    ) {
      this.handsFood(choice.action);
      return;
    }
    if (choice.action === 'heat') {
      this.startHeat();
      return;
    }
    if (choice.action === 'quench') {
      this.dropInBowl();
      return;
    }
    if (choice.action === 'boil') {
      this.beginBoil();
      return;
    }
    if (choice.action === 'feed') {
      this.feedFire(choice.piece);
      return;
    }
    if (choice.action === 'blow') {
      this.blowAt(choice.piece);
      return;
    }
    if (choice.action === 'drill') {
      if (this.holdingDrill) this.tryStartDrill();
      return;
    }
    if (choice.action === 'repair') {
      const result = repairPiece(this.state, choice.piece);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.playPose('gather');
        this.afterChange();
      }
      return;
    }
    if (choice.action === 'none') this.setTip(choice.message);
  }

  /** The build-menu sentence, repeated beside a twig piece he can actually pay for. */
  private stepUpgradeHint(): void {
    const hint = upgradePrompt(this.state, { x: this.px, y: this.py });
    const tip = this.state.tip;
    const ours =
      tip === OPENING_TIP ||
      tip === HATCHET_IDLE ||
      tip.startsWith('Tap the piece, or tap Use') ||
      tip.startsWith('Equip the hammerstone, then tap');
    if (!hint || tip === hint || !ours) return;
    this.setTip(hint);
  }

  private stepFree(dt: number): void {
    if (!this.started || this.state.outcome !== 'playing' || this.sheet !== 'none') {
      this.parkWalk();
      return;
    }
    let dx = 0;
    let dy = 0;
    const held = stickDirection(this.stickX, this.stickY);
    if (held.x !== 0 || held.y !== 0) {
      dx = held.x;
      dy = held.y;
    } else {
      if (this.keys.has('arrowright') || this.keys.has('d')) dx += 1;
      if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= 1;
      if (this.keys.has('arrowdown') || this.keys.has('s')) dy += 1;
      if (this.keys.has('arrowup') || this.keys.has('w')) dy -= 1;
    }
    const mag = Math.hypot(dx, dy);
    const travel = travelSpeed(Math.min(1, mag));
    if (travel.speed <= 0) {
      if (this.placing) this.nudgeGhost(dt);
      this.parkWalk();
      return;
    }
    if ((this.pose === 'chop' || this.pose === 'gather' || this.pose === 'strike') && travel.speed > 0) {
      this.poseUntil = 0;
      this.expirePose();
    }
    if (this.resting) this.resting = false;
    dx /= mag;
    dy /= mag;
    const facing = facingFromVector(dx, dy, this.state.facing);
    if (facing !== this.state.facing) this.state = { ...this.state, facing };
    if (this.pose !== 'walk') {
      this.pose = 'walk';
      this.poseUntil = 0;
      this.showPose('walk');
    }
    if (this.player.anims) this.player.anims.timeScale = travel.running ? 1.7 : 1;
    const step = travel.speed * dt;
    const next = resolveMove(this.px, this.py, dx * step, dy * step, bodiesFor(this.state), segmentsFor(this.state.pieces));
    this.placeFeet(next.x, next.y);
    if (this.placing) this.nudgeGhost(dt);
  }

  /** A held stick creeps the ghost. A quick nudge is only a few pixels, not a whole tile. */
  private nudgeGhost(dt: number): void {
    if (this.draggingGhost || this.pointer.down) return;
    const mag = Math.hypot(this.stickX, this.stickY);
    if (mag < 0.45) return;
    const speed = 16 * Math.min(1, mag);
    this.aimX += (this.stickX / mag) * speed * dt;
    this.aimY += (this.stickY / mag) * speed * dt;
    this.snapAim();
  }

  private parkWalk(): void {
    if (this.player?.anims) this.player.anims.timeScale = 1;
    if (this.pose !== 'walk') return;
    this.pose = 'idle';
    this.showIdle();
  }

  /** Follow a nudge from placing or upgrading. Walking still picks things up; this does not. */
  private adoptFeet(): void {
    this.px = this.state.x;
    this.py = this.state.y;
    this.player.setPosition(Math.round(this.px), Math.round(this.py));
    this.player.setDepth(depthFor(this.py, 6));
  }

  private placeFeet(x: number, y: number): void {
    this.px = x;
    this.py = y;
    const tile = worldToTile(x, y);
    this.state = { ...this.state, x, y, tx: tile.tx, ty: tile.ty };
    this.player.setPosition(Math.round(x), Math.round(y));
    this.player.setDepth(depthFor(y, 6));
    this.collectUnderfoot();
  }

  /** One reach test for the ring and for Use, so they name the same tree. */
  private nearestInReach(treesOnly: boolean): Prop | null {
    let best: Prop | null = null;
    let bestD = Infinity;
    for (const prop of PROPS) {
      if (treesOnly) {
        if (!this.isTree(prop) || isFelled(this.state.trees, prop.id)) continue;
      } else if (!this.actionable(prop)) continue;
      if (!inReach(this.px, this.py, prop.tx, prop.ty)) continue;
      const dist = this.reachDist(prop);
      if (dist < bestD) {
        best = prop;
        bestD = dist;
      }
    }
    return best;
  }

  private nearestTree(): Prop | null {
    return this.nearestInReach(true);
  }

  /** Gold ring and a warm tint on the nearest trunk he can chop. */
  private markReach(): void {
    if (!this.reachMark) this.reachMark = this.add.graphics();
    const mark = this.reachMark;
    mark.clear();
    const show = this.started && this.sheet === 'none' && this.state.outcome === 'playing';
    const tree = show ? this.nearestTree() : null;
    if (!tree) {
      mark.setVisible(false);
      return;
    }
    const at = tileToWorld(tree.tx, tree.ty);
    mark.setVisible(true);
    mark.setDepth(depthFor(at.y, 30));
    mark.lineStyle(5, 0xffd25a, 0.55);
    mark.strokeEllipse(at.x, at.y - 1, 36, 16);
    mark.lineStyle(2, 0xfff2c4, 1);
    mark.strokeEllipse(at.x, at.y - 1, 26, 11);
    const view = this.propViews.find((item) => item.prop.id === tree.id);
    view?.sprite.setTint(0xffe7a0);
  }

  private showPose(pose: 'idle' | 'walk' | 'gather' | 'chop' | 'strike'): void {
    if (pose === 'chop' && this.state.tool === 'axe') {
      const key = `woodsman_${this.state.facing}_axe`;
      if (this.anims.exists(key)) {
        this.player.setFlipX(false);
        if (this.player.anims.currentAnim?.key !== key || !this.player.anims.isPlaying) this.player.play(key);
        this.syncFrameOrigin(this.player);
        return;
      }
    }
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

  private playPose(kind: 'gather' | 'chop' | 'strike'): void {
    this.pose = kind;
    this.poseUntil = this.time.now + 900;
    this.showPose(kind);
  }

  private expirePose(): void {
    if ((this.pose === 'gather' || this.pose === 'chop' || this.pose === 'strike') && this.time.now >= this.poseUntil) {
      const felledId = this.pose === 'chop' ? this.chopTarget : null;
      this.pose = 'idle';
      this.chopTarget = null;
      this.showIdle();
      if (felledId && isFelled(this.state.trees, felledId)) this.logUntil.set(felledId, this.time.now + 1400);
      if (felledId) {
        this.syncProps();
        this.syncStumps();
      }
    }
  }

  private expireLogs(): void {
    let changed = false;
    for (const [id, until] of this.logUntil) {
      if (this.time.now < until) continue;
      this.logUntil.delete(id);
      changed = true;
    }
    if (changed) this.syncStumps();
  }

  /** Turn toward a tile from wherever his feet are. */
  private faceTile(tx: number, ty: number): void {
    const to = tileToWorld(tx, ty);
    const facing = facingFromVector(to.x - this.px, to.y - this.py, this.state.facing);
    this.state = { ...this.state, facing };
  }

  private stopWalk(): void {
    this.pending = null;
    this.marker?.setVisible(false);
    this.parkWalk();
  }


  private handleAction(id: string): void {
    if (id === 'debug-eight' || id === 'debug-rain') {
      if (!this.debugMode) return;
      this.state = { ...this.state, minutes: 20 * 60 };
      this.afterChange();
      return;
    }
    if (id === 'debug-hour') {
      if (!this.debugMode) return;
      this.state = tick(this.state, 60);
      this.afterChange();
      return;
    }
    if (id === 'debug-refill') {
      if (!this.debugMode) return;
      this.state = { ...this.state, health: 100, warmth: 100, hunger: 100, thirst: 100, energy: 100, sick: 0, sickAt: 0 };
      this.afterChange();
      return;
    }
    if (id === 'debug-wear') {
      if (!this.debugMode) return;
      this.state = {
        ...this.state,
        pieces: this.state.pieces.map((piece) => {
          if (piece.kind === 'fire' || piece.kind === 'tripod') return piece;
          if ((piece.material ?? 'twig') === 'stone') return piece;
          const near = Math.max(Math.abs(piece.tx - this.state.tx), Math.abs(piece.ty - this.state.ty)) <= 3;
          return near ? { ...piece, health: 50 } : piece;
        }),
      };
      this.afterChange();
      return;
    }
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
      const slot = hotbarSlots(this.state)[index];
      if (slot?.id === 'pot') {
        if (this.state.cupWater === 'boiled') {
          this.handsFood('drink');
          return;
        }
        if (this.state.cupWater === 'raw') this.setTip(this.state.potSeat ? 'It is on the coals.' : 'Set it on the coals.');
        return;
      }
      if (slot?.id === 'berries' || slot?.id === 'roots') {
        const result = eat(this.state, slot.id === 'berries' ? 'berries' : 'roots');
        if (!result.ok) this.setTip(result.message);
        else {
          this.state = result.state;
          this.playPose('gather');
          this.afterChange();
        }
        return;
      }
      if (index === 0) this.state = { ...this.state, tool: 'hands' };
      if (index === 1) this.state = { ...this.state, tool: 'hatchet' };
      if (index === 2) {
        if (!this.state.inventory.axe) {
          this.setTip('Haft a stone axe first.');
          return;
        }
        this.state = { ...this.state, tool: 'axe' };
        this.paintHud(false);
        return;
      }
      if (index === 3) {
        if (!this.state.inventory.hammerstone) {
          this.setTip('Knap a hammerstone first.');
          return;
        }
        this.state = { ...this.state, tool: 'hammerstone' };
        this.paintHud(false);
        return;
      }
      if (index === 4) {
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
    if (id === 'cover-boughs' || id === 'cover-bark') {
      const tripod = nearestBareTripod(this.state);
      if (!tripod) {
        this.setTip('Lash a tripod first.');
        return;
      }
      if (!inReach(this.px, this.py, tripod.tx, tripod.ty, 54)) {
        this.setTip('Walk up to the tripod.');
        return;
      }
      const result = coverTripod(this.state, tripod, id === 'cover-boughs' ? 'boughs' : 'bark');
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.playPose('gather');
        this.afterChange();
      }
      return;
    }
    if (id === 'craft-axe' || id === 'craft-bowl') {
      const result = id === 'craft-axe' ? craftAxe(this.state) : craftBowl(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (id === 'craft-pot') {
      const result = craftPot(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (id === 'craft-tinder' || id === 'craft-kindling' || id === 'craft-bowdrill') {
      const result =
        id === 'craft-tinder' ? craftTinder(this.state) : id === 'craft-kindling' ? craftKindling(this.state) : craftBowdrill(this.state);
      if (!result.ok) {
        this.setTip(result.message);
        return;
      }
      this.state = result.state;
      this.afterChange();
      return;
    }
    if (id === 'craft-cordage') {
      if (this.craftJob) {
        this.setTip('Still twisting.');
        return;
      }
      const result = beginCordage(this.state);
      if (!result.ok) {
        this.setTip(result.message);
        return;
      }
      this.state = result.state;
      this.craftJob = { label: 'Reverse-wrapping the fibers…', started: this.time.now, seconds: CORD_SECONDS };
      this.playPose('gather');
      this.poseUntil = this.time.now + CORD_SECONDS * 1000;
      this.afterChange();
      return;
    }
    if (id.startsWith('place-')) {
      const stone = id.startsWith('place-stone-');
      const kind = (stone ? id.slice('place-stone-'.length) : id.slice('place-'.length)) as PieceKind;
      this.tryBeginPlace(kind, stone ? 'stone' : 'twig');
      return;
    }
    if (id === 'flip') {
      if (this.placing !== 'wall' && this.placing !== 'doorway') return;
      const turned = rotateWall(this.state.pieces, this.ghostAnchor, this.ghostEdge, { x: this.px, y: this.py });
      this.ghostAnchor = turned.tile;
      this.ghostEdge = turned.edge;
      this.aimFromGhost();
      this.ghostPulse = 1;
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
    if (id === 'use') {
      if (!this.started || this.state.outcome !== 'playing' || this.sheet !== 'none' || this.placing) return;
      this.useNearest();
      return;
    }
    if (id === 'rest') {
      if (!this.started || this.state.outcome !== 'playing' || this.placing) return;
      this.sheet = 'none';
      if (this.state.energy >= 100 && !this.resting) {
        this.setTip('Already rested.');
        this.paintHud(true);
        return;
      }
      if (this.resting) {
        this.resting = false;
        this.rested = 0;
        this.setTip('On your feet.');
        this.paintHud(true);
        return;
      }
      this.stopWalk();
      this.resting = true;
      this.rested = 0;
      this.setTip(restingTip(0));
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
    if (this.player) {
      this.player.setPosition(Math.round(this.px), Math.round(this.py));
      this.player.setDepth(depthFor(this.py, 6));
    }
    this.refreshShadows();
    this.syncProps();
    this.syncRocks();
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

  private syncRocks(): void {
    for (const view of this.propViews) {
      if (view.prop.kind === 'rock_node') {
        const frame = rockFrame(this.state.rocks[view.prop.id] ?? 0);
        if (view.sprite.frame.name !== frame) this.applyAtlas(view.sprite, frame);
      }
      if (view.prop.kind === 'flint_core') {
        const frame = flintFrame(this.state.cores[view.prop.id] ?? 0);
        if (view.sprite.frame.name !== frame) this.applyAtlas(view.sprite, frame);
      }
      if (view.prop.kind === 'bush_fiber') {
        const frame = fiberFrame(this.state.plants, view.prop.id, this.state.minutes);
        if (view.sprite.frame.name !== frame) this.applyAtlas(view.sprite, frame);
      }
      const grown = plantFrame(view.prop.kind, this.state.plants, view.prop.id, this.state.minutes);
      if (grown && view.sprite.frame.name !== grown) this.applyAtlas(view.sprite, grown);
    }
  }

  private syncStumps(): void {
    const felled = new Set<string>();
    for (const prop of PROPS) {
      if (!this.isTree(prop) || !isFelled(this.state.trees, prop.id)) continue;
      felled.add(prop.id);
      const pos = tileToWorld(prop.tx, prop.ty);
      const showLog = (this.logUntil.get(prop.id) ?? 0) > this.time.now && this.chopTarget !== prop.id;
      let log = this.logs.get(prop.id);
      if (!log) {
        log = this.add.sprite(pos.x, pos.y, 'world', 'felled_log');
        this.applyAtlas(log, 'felled_log');
        log.setDepth(depthFor(pos.y, 3));
        this.logs.set(prop.id, log);
      }
      log.setVisible(showLog);
      const frame = prop.kind === 'birch_tree' ? 'birch_stump' : 'pine_stump';
      let stump = this.stumps.get(prop.id);
      if (!stump) {
        stump = this.add.sprite(pos.x, pos.y, 'world', frame);
        this.applyAtlas(stump, frame);
        stump.setDepth(depthFor(pos.y, 4));
        this.stumps.set(prop.id, stump);
      }
      stump.setVisible(!showLog && this.chopTarget !== prop.id);
    }
    for (const [id, stump] of this.stumps) {
      if (!felled.has(id)) stump.setVisible(false);
    }
    for (const [id, log] of this.logs) {
      if (!felled.has(id)) log.setVisible(false);
    }
  }

  private syncBuildings(): void {
    const live = new Set<string>();
    for (const piece of this.state.pieces) {
      const key = pieceKey(piece);
      live.add(key);
      let sprite = this.buildings.get(key);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, 'world', pieceFrame(piece.kind, piece.edge));
        this.buildings.set(key, sprite);
      }
      const pose = this.piecePose(piece.kind, piece, null);
      sprite.setOrigin(pose.ox, pose.oy);
      sprite.setFlipX(false);
      sprite.setPosition(Math.round(pose.x), Math.round(pose.y));
      sprite.setDepth(depthFor(pose.y, pose.bias));
      sprite.setVisible(true);
      const embers = piece.kind === 'fire' && !piece.lit && piece.coalsUntil != null && this.state.minutes < piece.coalsUntil;
      if (piece.kind === 'fire' && piece.lit) {
        if (sprite.anims.currentAnim?.key !== 'fire_tipi_lit') sprite.play('fire_tipi_lit');
      } else if (embers) {
        if (sprite.anims.currentAnim?.key !== 'fire_tipi_embers') sprite.play('fire_tipi_embers');
      } else {
        if (sprite.anims.isPlaying) sprite.anims.stop();
        if (sprite.frame.name !== pose.key) sprite.setTexture('world', pose.key);
      }
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
    for (const log of this.logs.values()) {
      log.setTint(lightTint(this.state.minutes, this.state.tx, this.state.ty, false, null));
    }
  }

  private setTip(message: string): void {
    this.state = { ...this.state, tip: message };
    this.paintHud(false);
  }

  private paintHud(rebuild: boolean): void {
    const job = this.craftJob;
    const queue = job
      ? {
          label: job.label,
          progress: Math.min(1, (this.time.now - job.started) / (job.seconds * 1000)),
        }
      : null;
    this.hud.render(buildModel(this.state, this.sheet, this.resting, this.placeModel(), queue, this.debugMode), rebuild);
  }

  private stepCraft(): void {
    const job = this.craftJob;
    if (!job) return;
    if (this.time.now - job.started < job.seconds * 1000) return;
    this.craftJob = null;
    this.state = finishCordage(this.state);
    this.afterChange();
  }

  private handsFood(action: 'scoop' | 'scoop-bowl' | 'drink' | 'drink-bowl' | 'drink-creek'): void {
    if (action === 'drink-creek') {
      const result = drinkCreek(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (action === 'scoop-bowl') {
      const result = scoopBowl(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (action === 'drink-bowl') {
      const result = drinkBowl(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (action === 'scoop') {
      const result = scoopCreek(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.afterChange();
      }
      return;
    }
    if (action === 'drink') {
      const result = drinkCup(this.state);
      if (!result.ok) this.setTip(result.message);
      else {
        this.state = result.state;
        this.boilJob = null;
        this.afterChange();
      }
      return;
    }
  }

  private potHit(x: number, y: number): boolean {
    const pot = this.potSprite;
    const seat = this.state.potSeat;
    if (!pot?.visible || !seat) return false;
    if (!this.opaqueHit(pot, x, y)) return false;
    return inReach(this.px, this.py, seat.tx, seat.ty, 72);
  }

  private takePot(): void {
    const result = liftPot(this.state);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.boilJob = null;
    this.state = result.state;
    this.afterChange();
  }

  private fireSpot(): { tx: number; ty: number } | null {
    const fire = this.state.pieces.find(
      (piece) => piece.kind === 'fire' && (piece.lit === true || (piece.coalsUntil != null && this.state.minutes < piece.coalsUntil)),
    );
    return fire ? { tx: fire.tx, ty: fire.ty } : null;
  }

  private showCrackedCobble(tx: number, ty: number): void {
    const at = tileToWorld(tx, ty);
    if (!this.crackSprite) this.crackSprite = this.add.sprite(at.x + 12, at.y + 2, 'world', 'item_cobble_cracked');
    this.applyAtlas(this.crackSprite, 'item_cobble_cracked');
    this.crackSprite.setPosition(Math.round(at.x + 22), Math.round(at.y + 8));
    this.crackSprite.setDepth(depthFor(at.y + 8, 12));
    this.crackSprite.setScale(2);
    this.crackSprite.setVisible(true);
    this.crackUntil = this.time.now + 1400;
  }

  private startHeat(): void {
    if (this.heatJob) return;
    const spot = this.fireSpot();
    if (!spot) {
      this.setTip('The fire is out.');
      return;
    }
    const result = heatStone(this.state);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    if (result.burst) {
      this.showCrackedCobble(spot.tx, spot.ty);
      this.afterChange();
      return;
    }
    if (!result.spent) return;
    this.heatJob = { started: this.time.now, tx: spot.tx, ty: spot.ty, spent: result.spent };
    this.stoneAt = { tx: spot.tx, ty: spot.ty };
    this.afterChange();
  }

  private dropInBowl(): void {
    const result = dropHotStone(this.state);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.heatJob = null;
    const spot = this.stoneAt ?? this.fireSpot() ?? { tx: this.state.tx, ty: this.state.ty };
    this.stoneAt = null;
    this.stoneSprite?.setVisible(false);
    const at = tileToWorld(spot.tx, spot.ty);
    if (!this.bowlSprite) this.bowlSprite = this.add.sprite(at.x + 14, at.y + 2, 'world', 'item_wood_bowl_boil');
    this.applyAtlas(this.bowlSprite, 'item_wood_bowl_boil');
    this.bowlSprite.setPosition(Math.round(at.x + 22), Math.round(at.y + 6));
    this.bowlSprite.setDepth(depthFor(at.y + 6, 12));
    this.bowlSprite.setScale(2);
    this.bowlSprite.setVisible(true);
    this.bowlShowUntil = this.time.now + STONE_BOIL_SECONDS * 1000;
    this.afterChange();
  }

  private stepStoneWork(): void {
    if (this.crackSprite) this.crackSprite.setVisible(this.time.now < this.crackUntil);
    if (this.bowlSprite && this.time.now >= this.bowlShowUntil) this.bowlSprite.setVisible(false);
    const job = this.heatJob;
    if (job && !nearLitFire(this.state)) {
      this.state = refundStone(this.state, job.spent);
      this.heatJob = null;
      this.stoneAt = null;
      this.stoneSprite?.setVisible(false);
      this.afterChange();
      return;
    }
    const showHot = Boolean(job) || this.state.hotStone === 'hot';
    const atSpot = job ? { tx: job.tx, ty: job.ty } : this.stoneAt;
    if (!showHot || !atSpot) {
      if (!job) this.stoneSprite?.setVisible(false);
      return;
    }
    const at = tileToWorld(atSpot.tx, atSpot.ty);
    const frame = Math.floor(this.time.now / 180) % 2 === 0 ? 'item_hot_stone_0' : 'item_hot_stone_1';
    if (!this.stoneSprite) this.stoneSprite = this.add.sprite(at.x + 12, at.y + 2, 'world', frame);
    this.applyAtlas(this.stoneSprite, frame);
    this.stoneSprite.setPosition(Math.round(at.x - 18), Math.round(at.y + 4));
    this.stoneSprite.setDepth(depthFor(at.y + 4, 12));
    this.stoneSprite.setScale(2);
    this.stoneSprite.setVisible(true);
    if (!job) return;
    if (this.time.now - job.started < HEAT_SECONDS * 1000) return;
    this.heatJob = null;
    this.stoneAt = { tx: job.tx, ty: job.ty };
    this.state = markStoneHot(this.state);
    this.afterChange();
  }

  private beginBoil(): void {
    if (this.boilJob) return;
    const fire = this.state.pieces.find((piece) => piece.kind === 'fire' && (piece.lit || (piece.coalsUntil != null && this.state.minutes < piece.coalsUntil)));
    if (!fire || !(nearLitFire(this.state) || nearEmberFire(this.state))) {
      this.setTip('Set it on the coals.');
      return;
    }
    this.boilJob = { started: this.time.now, tx: fire.tx, ty: fire.ty };
    this.state = { ...this.state, potSeat: { tx: fire.tx, ty: fire.ty }, tip: 'The bark pot sits on the coals.' };
    this.afterChange();
  }

  private stepBoil(): void {
    const job = this.boilJob;
    const seat = this.state.potSeat;
    const hide = () => {
      this.steam?.setVisible(false);
      this.potSprite?.setVisible(false);
    };
    if (job && (!(nearLitFire(this.state) || nearEmberFire(this.state)) || this.state.cupWater !== 'raw')) {
      this.boilJob = null;
      this.state = { ...this.state, potSeat: null };
      hide();
      this.setTip('The boil stops.');
      return;
    }
    if (!job && !(seat && this.state.cupWater !== 'empty')) {
      hide();
      return;
    }
    const spot = job ? { tx: job.tx, ty: job.ty } : seat!;
    const at = tileToWorld(spot.tx, spot.ty);
    const elapsed = job ? (this.time.now - job.started) / 1000 : BOIL_METHOD.seconds;
    const boiling = Boolean(job) && elapsed >= BOIL_METHOD.seconds / 2;
    const potFrame = job
      ? boiling
        ? BOIL_METHOD.boilingFrame
        : BOIL_METHOD.coalsFrame
      : this.state.inventory.pot === 1
        ? BOIL_METHOD.wornFrame
        : BOIL_METHOD.fullFrame;
    if (!this.potSprite) this.potSprite = this.add.sprite(at.x + 14, at.y + 2, 'world', potFrame);
    this.applyAtlas(this.potSprite, potFrame);
    this.potSprite.setPosition(Math.round(at.x + 14), Math.round(at.y + 2));
    this.potSprite.setDepth(depthFor(at.y, 22));
    this.potSprite.setVisible(true);
    const frame = BOIL_METHOD.steamFrames[Math.floor(this.time.now / 180) % 2];
    if (!this.steam) this.steam = this.add.sprite(at.x + 14, at.y - 10, 'world', frame);
    this.applyAtlas(this.steam, frame);
    this.steam.setPosition(Math.round(at.x + 14), Math.round(at.y - 10));
    this.steam.setDepth(depthFor(at.y, 30));
    this.steam.setVisible(boiling);
    if (!job || elapsed < BOIL_METHOD.seconds) return;
    this.boilJob = null;
    this.steam.setVisible(false);
    this.state = { ...finishBoil(this.state), potSeat: { tx: spot.tx, ty: spot.ty } };
    this.afterChange();
  }

  private placeModel(): PlaceModel | null {
    if (!this.placing) return null;
    return { kind: this.placing, valid: this.placeValid, hint: this.placeHint };
  }

  private tryBeginPlace(kind: PieceKind, material: Material = 'twig'): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    if (!canAfford(this.state, kind, material)) {
      if (kind === 'tripod') {
        const woodShort = Math.max(0, TRIPOD_WOOD - this.state.inventory.wood);
        const cordShort = Math.max(0, TRIPOD_CORDAGE - this.state.inventory.cordage);
        this.setTip(woodShort > 0 ? `Need ${woodShort} more wood` : `Need ${cordShort} more cordage`);
        return;
      }
      if (kind === 'fire') {
        this.setTip(fireShort(this.state));
        return;
      }
      const have = material === 'stone' ? this.state.inventory.stone : this.state.inventory.wood;
      this.setTip(material === 'stone' ? materialShortMessage(kind, have, 'stone') : woodShortMessage(kind, have));
      return;
    }
    this.beginPlace(kind, material);
  }

  private beginPlace(kind: PieceKind, material: Material = 'twig'): void {
    if (!this.started || this.state.outcome !== 'playing') return;
    this.resting = false;
    this.stopWalk();
    this.sheet = 'none';
    this.placing = kind;
    this.placingMaterial = material;
    const spot = suggestPiece(this.state, kind, { x: this.px, y: this.py }, material);
    this.ghostAnchor = spot.tile;
    this.ghostEdge = spot.edge;
    this.aimFromGhost();
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.refreshGhost();
    this.paintHud(true);
    this.layoutCamera();
  }

  private endPlace(): void {
    this.placing = null;
    this.approach = null;
    this.approachStill = 0;
    this.ghost?.setVisible(false);
    this.edgeHint?.setVisible(false);
    this.edgeMark?.setVisible(false);
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.layoutCamera();
    this.paintHud(true);
  }

  private aimFromGhost(): void {
    const at = pieceAnchor(this.placing ?? 'foundation', this.ghostAnchor, this.ghostEdge);
    this.aimX = at.x;
    this.aimY = at.y;
  }

  /** Drag moves the aim a short way, then the ghost snaps to a tile or a foundation edge. */
  private slideGhost(screenDx: number, screenDy: number): void {
    const cam = this.cameras.main;
    const origin = cam.getWorldPoint(0, 0);
    const shifted = cam.getWorldPoint(screenDx, screenDy);
    const step = dampStep(shifted.x - origin.x, shifted.y - origin.y, 0.45, 8);
    this.aimX += step.x;
    this.aimY += step.y;
    this.snapAim();
    if (this.placing === 'wall' || this.placing === 'doorway') {
      const mag = Math.hypot(step.x, step.y) || 1;
      this.shove = { x: (step.x / mag) * 8, y: (step.y / mag) * 8, until: this.time.now + 220 };
      this.ghostPulse = Math.max(this.ghostPulse, 0.7);
      this.showEdgeHint();
      this.paintCurrentEdge();
    }
  }

  /** Gold ring on the edge the ghost is actually sitting on, for the whole placement. */
  private paintCurrentEdge(): void {
    const mark = this.edgeMark;
    if (!mark || (this.placing !== 'wall' && this.placing !== 'doorway')) {
      mark?.clear();
      mark?.setVisible(false);
      return;
    }
    const at = pieceAnchor(this.placing, this.ghostAnchor, this.ghostEdge);
    mark.clear();
    mark.lineStyle(4, 0xffe08a, 1);
    mark.strokeEllipse(at.x, at.y - 2, 36, 16);
    mark.lineStyle(2, 0xfff6d0, 1);
    mark.strokeEllipse(at.x, at.y - 2, 24, 10);
    mark.setDepth(19980);
    mark.setVisible(true);
  }

  /** Gold ghost on the edge this drag would snap to, before the snap actually happens. */
  private showEdgeHint(): void {
    const hint = this.edgeHint;
    if (!hint || (this.placing !== 'wall' && this.placing !== 'doorway')) return;
    const next = edgeAhead(this.state.pieces, this.ghostAnchor, this.ghostEdge, this.aimX, this.aimY);
    if (!next) {
      hint.setVisible(false);
      return;
    }
    const pose = this.piecePose(this.placing, { tx: next.tile.tx, ty: next.tile.ty, edge: next.edge }, 'ok');
    hint.setTexture('world', pose.key);
    hint.setOrigin(pose.ox, pose.oy);
    hint.setPosition(Math.round(pose.x), Math.round(pose.y));
    hint.setDepth(19990);
    hint.setAlpha(0.9);
    hint.setTint(0xffe08a);
    hint.setVisible(true);
  }

  private stepGhostShove(): void {
    const ghost = this.ghost;
    if (!ghost?.visible) {
      if (ghost) ghost.setScale(1);
      return;
    }
    const left = this.shove.until - this.time.now;
    const shoveT = left > 0 ? Math.max(0, left / 220) : 0;
    ghost.setPosition(this.ghostHome.x + this.shove.x * shoveT, this.ghostHome.y + this.shove.y * shoveT);
    if (this.ghostPulse > 0) this.ghostPulse = Math.max(0, this.ghostPulse - 0.05);
    const scale = 1 + 0.34 * this.ghostPulse;
    ghost.setScale(scale);
  }

  private willWalkCloser(kind: PieceKind, tile: Tile, edge: EdgeName, reason: string): boolean {
    if (kind !== 'wall' && kind !== 'doorway') return false;
    if (reason !== "Can't reach that spot") return false;
    return pieceSpot(kind, tile, edge, this.state).ok;
  }

  private stepApproach(dt: number): void {
    const job = this.approach;
    if (!job || !this.placing) {
      this.approach = null;
      return;
    }
    const anchor = pieceAnchor(job.kind, job.tile, job.edge);
    if (inReachOf(this.px, this.py, anchor, BUILD_REACH)) {
      this.approach = null;
      this.approachStill = 0;
      this.confirmPlace();
      return;
    }
    const dx = job.x - this.px;
    const dy = job.y - this.py;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      this.approach = null;
      this.setTip("Can't reach that spot");
      this.refreshGhost();
      return;
    }
    const step = Math.min(dist, 104 * dt);
    const next = resolveMove(
      this.px,
      this.py,
      (dx / dist) * step,
      (dy / dist) * step,
      bodiesFor(this.state),
      segmentsFor(this.state.pieces),
    );
    const moved = Math.hypot(next.x - this.px, next.y - this.py);
    this.approachStill = moved < 0.15 ? this.approachStill + 1 : 0;
    if (this.approachStill > 20) {
      this.approach = null;
      this.approachStill = 0;
      this.setTip("Can't reach that spot");
      this.refreshGhost();
      return;
    }
    const facing = facingFromVector(dx, dy, this.state.facing);
    if (facing !== this.state.facing) this.state = { ...this.state, facing };
    if (this.pose !== 'walk') {
      this.pose = 'walk';
      this.poseUntil = 0;
      this.showPose('walk');
    }
    this.placeFeet(next.x, next.y);
  }

  /** A tap lands on a nearby edge or the next tile. A tap across the island does nothing. */
  private tapGhost(pointer: Phaser.Input.Pointer): void {
    if (!this.placing) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.placing === 'wall' || this.placing === 'doorway') {
      const near = nearestSocket(this.state.pieces, world.x, world.y, 22);
      if (!near) return;
      this.ghostAnchor = near.tile;
      this.ghostEdge = near.edge;
      this.aimFromGhost();
      this.refreshGhost();
      return;
    }
    const tile = worldToTile(world.x, world.y);
    const nearTile =
      Math.abs(tile.tx - this.ghostAnchor.tx) <= 1 && Math.abs(tile.ty - this.ghostAnchor.ty) <= 1;
    if (!nearTile) return;
    this.ghostAnchor = { tx: clamp(tile.tx, 0, COLS - 1), ty: clamp(tile.ty, 0, ROWS - 1) };
    this.aimFromGhost();
    this.refreshGhost();
  }

  private snapAim(): void {
    if (!this.placing) return;
    if (this.placing === 'wall' || this.placing === 'doorway') {
      const near = nearestSocket(this.state.pieces, this.aimX, this.aimY, 26);
      if (!near) return;
      const current = pieceAnchor(this.placing, this.ghostAnchor, this.ghostEdge);
      const stay = Math.hypot(current.x - this.aimX, current.y - this.aimY);
      if (stay <= near.dist + 6 && stay <= 26) return;
      if (near.tile.tx === this.ghostAnchor.tx && near.tile.ty === this.ghostAnchor.ty && near.edge === this.ghostEdge) return;
      this.ghostAnchor = near.tile;
      this.ghostEdge = near.edge;
      this.refreshGhost();
      return;
    }
    const tile = worldToTile(this.aimX, this.aimY);
    const tx = clamp(tile.tx, 0, COLS - 1);
    const ty = clamp(tile.ty, 0, ROWS - 1);
    if (tx === this.ghostAnchor.tx && ty === this.ghostAnchor.ty) return;
    this.ghostAnchor = { tx, ty };
    this.refreshGhost();
  }

  private piecePose(
    kind: PieceKind,
    at: {
      tx: number;
      ty: number;
      edge: EdgeName;
      material?: Material;
      health?: number;
      cover?: 'boughs' | 'bark';
      lit?: boolean;
      coalsUntil?: number;
    },
    ghost: 'ok' | 'bad' | null,
  ): { x: number; y: number; key: string; ox: number; oy: number; tall: boolean; bias: number } {
    const material = ghost ? this.placingMaterial : (at.material ?? 'twig');
    const worn = !ghost && material === 'twig' && typeof at.health === 'number' && at.health <= 50 && at.health > 0;
    let key = pieceFrame(kind, at.edge, ghost, material, worn);
    if (!ghost && kind === 'tripod') {
      key = at.cover === 'boughs' ? 'tripod_boughs' : at.cover === 'bark' ? 'tripod_bark' : 'lashed_tripod';
    }
    if (!ghost && kind === 'fire' && !at.lit && at.coalsUntil != null && this.state.minutes < at.coalsUntil) {
      key = 'fire_tipi_embers_0';
    }
    const origin = frameOrigin(key);
    const pos = tileToWorld(at.tx, at.ty);
    if (kind === 'wall' || kind === 'doorway') {
      const off = edgeOffset(at.edge);
      return { x: pos.x + off.x, y: pos.y + off.y, key, ox: origin.x, oy: origin.y, tall: true, bias: 5 };
    }
    if (kind === 'floor') return { x: pos.x, y: pos.y, key, ox: origin.x, oy: origin.y, tall: false, bias: 12 };
    if (kind === 'tripod' || kind === 'fire') return { x: pos.x, y: pos.y, key, ox: origin.x, oy: origin.y, tall: true, bias: 8 };
    return { x: pos.x, y: pos.y, key, ox: origin.x, oy: origin.y, tall: false, bias: 1 };
  }

  private ghostPose(): { x: number; y: number; key: string; ox: number; oy: number; tall: boolean } {
    if (!this.placing) return { x: 0, y: 0, key: 'twig_foundation_ghost_ok', ox: 0.5, oy: 0.73, tall: false };
    const spot = placementVerdict(this.placing, this.ghostAnchor, this.ghostEdge, this.state, { x: this.px, y: this.py }, this.placingMaterial);
    const walk = this.willWalkCloser(this.placing, this.ghostAnchor, this.ghostEdge, spot.reason);
    const ghost = spot.ok || walk ? 'ok' : 'bad';
    const pose = this.piecePose(this.placing, { tx: this.ghostAnchor.tx, ty: this.ghostAnchor.ty, edge: this.ghostEdge }, ghost);
    return pose;
  }

  private refreshGhost(): void {
    const sprite = this.ghost;
    if (!sprite || !this.placing) return;
    const spot = placementVerdict(this.placing, this.ghostAnchor, this.ghostEdge, this.state, { x: this.px, y: this.py }, this.placingMaterial);
    const walk = this.willWalkCloser(this.placing, this.ghostAnchor, this.ghostEdge, spot.reason);
    const pose = this.ghostPose();
    sprite.setTexture('world', pose.key);
    sprite.setOrigin(pose.ox, pose.oy);
    sprite.setFlipX(false);
    sprite.clearTint();
    sprite.setAlpha(1);
    sprite.setPosition(Math.round(pose.x), Math.round(pose.y));
    this.ghostHome = { x: sprite.x, y: sprite.y };
    sprite.setDepth(20000);
    sprite.setVisible(true);
    if (this.placing === 'tripod' || this.placing === 'fire') {
      sprite.setAlpha(0.72);
      sprite.setTint(spot.ok || walk ? 0xb6d98a : 0xc45a4a);
    }
    this.paintCurrentEdge();
    this.keepGhostInView(pose, pose.tall);
    this.placeValid = spot.ok || walk;
    this.placeHint = walk ? "He'll walk closer. Tap Confirm." : spot.reason;
    if (this.state.tip !== this.placeHint) this.setTip(this.placeHint);
    else this.paintHud(false);
  }

  private confirmPlace(): void {
    if (!this.placing) return;
    const kind = this.placing;
    const tile = { tx: this.ghostAnchor.tx, ty: this.ghostAnchor.ty };
    const edge = this.ghostEdge;
    const spot = placementVerdict(kind, tile, edge, this.state, { x: this.px, y: this.py }, this.placingMaterial);
    if (!spot.ok) {
      if (this.willWalkCloser(kind, tile, edge, spot.reason) && !this.approach) {
        const anchor = pieceAnchor(kind, tile, edge);
        const stand = approachBuild(anchor, { x: this.px, y: this.py }, this.state);
        if (stand) {
          this.approach = { x: stand.x, y: stand.y, kind, tile, edge };
          this.approachStill = 0;
          this.setTip("He'll walk closer.");
          return;
        }
      }
      if (this.approach) return;
      this.setTip(spot.reason);
      this.refreshGhost();
      return;
    }
    this.approach = null;
    this.approachStill = 0;
    this.edgeHint?.setVisible(false);
    this.endPlace();
    this.pending = { kind, tile, edge };
    this.finishPlacement();
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
    const result = placePiece(this.state, job.kind, job.tile.tx, job.tile.ty, job.edge, this.placingMaterial);
    if (!result.ok) {
      this.setTip(result.message);
      return;
    }
    this.state = result.state;
    this.adoptFeet();
    this.faceTile(job.tile.tx, job.tile.ty);
    this.playPose(job.kind === 'tripod' ? 'gather' : 'chop');
    this.afterChange();
  }

  private collectUnderfoot(): void {
    if (!this.started || this.sheet !== 'none' || this.placing) return;
    for (const prop of PROPS) {
      if (prop.gather !== 'sticks' && prop.gather !== 'stones' && prop.gather !== 'rocks' && prop.gather !== 'cobble') continue;
      if (this.state.picked[prop.id]) continue;
      if (this.reachDist(prop) > PICKUP_RADIUS) continue;
      const result = gather(this.state, prop.id, true);
      if (!result.ok) continue;
      this.state = result.state;
      const at = tileToWorld(prop.tx, prop.ty);
      if (prop.gather === 'stones') this.sprayChips(at.x, at.y, 'stone');
      if (result.popup) this.popup(result.popup, prop.tx, prop.ty);
    }
  }

  private sprayChips(x: number, y: number, kind: 'wood' | 'stone'): void {
    const frames = kind === 'wood' ? ['wood_chip_0', 'wood_chip_1', 'wood_chip_2'] : ['stone_chip_0', 'stone_chip_1'];
    const count = 4;
    for (let i = 0; i < count; i++) {
      const frame = frames[Math.floor(Math.random() * frames.length)];
      if (!this.textures.exists('world') || !this.textures.get('world').has(frame)) continue;
      const side = (Math.random() - 0.5) * 18;
      const along = (Math.random() - 0.5) * 8;
      const sprite = this.add.sprite(x + side, y + along, 'world', frame);
      this.applyAtlas(sprite, frame);
      sprite.setScale(1.25 + Math.random() * 0.25);
      sprite.setDepth(depthFor(y + along, 40));
      sprite.setAngle((Math.random() - 0.5) * 70);
      const pop = 34 + Math.random() * 40;
      this.chips.push({
        sprite,
        vx: side * 0.55 + (Math.random() - 0.5) * 8,
        vy: -pop,
        spin: (Math.random() - 0.5) * 140,
        life: 0,
        ground: y + 4,
      });
    }
  }

  private stepChips(dt: number): void {
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const chip = this.chips[i];
      chip.life += dt;
      if (chip.sprite.y < chip.ground) chip.vy += 280 * dt;
      chip.sprite.x += chip.vx * dt;
      chip.sprite.y += chip.vy * dt;
      if (chip.sprite.y > chip.ground) {
        chip.sprite.y = chip.ground;
        chip.vy = 0;
        chip.vx *= 0.5;
      }
      chip.sprite.angle += chip.spin * dt;
      chip.sprite.setAlpha(chip.life < 0.32 ? 1 : Math.max(0, (0.5 - chip.life) / 0.18));
      if (chip.life < 0.5) continue;
      chip.sprite.destroy();
      this.chips.splice(i, 1);
    }
  }

  /**
   * Rain is drawn inside the camera's visible world rectangle.
   * Screen-pixel coordinates put the streaks off to the side, and a depth
   * under the ground tiles hid the puddles. Either one looks like "no rain".
   */
  private stepAtmosphere(): void {
    const raining = weatherAt(this.state.minutes) === 'rain';
    const cam = this.cameras.main;
    const topLeft = cam.getWorldPoint(0, 0);
    const bottomRight = cam.getWorldPoint(cam.width, cam.height);
    const viewW = Math.max(8, bottomRight.x - topLeft.x);
    const viewH = Math.max(8, bottomRight.y - topLeft.y);
    if (this.rain.length === 0 && this.textures.exists('world') && this.textures.get('world').has('rain_drop')) {
      for (let i = 0; i < 22; i++) {
        const drop = this.add.sprite(0, 0, 'world', 'rain_drop');
        drop.setDepth(60000);
        drop.setData('lx', (i * 17) % 100);
        drop.setData('ly', (i * 29) % 100);
        drop.setData('fall', 40 + (i % 5) * 10);
        drop.setData('drift', ((i % 5) - 2) * 4);
        this.rain.push(drop);
      }
      for (let i = 0; i < 5; i++) {
        const puddle = this.add.sprite(0, 0, 'world', 'puddle');
        puddle.setAlpha(0.8);
        this.puddles.push(puddle);
        const splash = this.add.sprite(0, 0, 'world', 'rain_splash_0');
        this.splashes.push(splash);
      }
    }
    this.rain.forEach((drop, i) => {
      drop.setVisible(raining);
      if (!raining) return;
      let ly = Number(drop.getData('ly')) + Number(drop.getData('fall')) * 0.012;
      let lx = Number(drop.getData('lx')) + Number(drop.getData('drift')) * 0.004;
      if (ly > 100) {
        ly = -4;
        lx = (i * 37) % 100;
      }
      lx = ((lx % 100) + 100) % 100;
      drop.setData('lx', lx);
      drop.setData('ly', ly);
      const x = topLeft.x + (lx / 100) * viewW;
      const y = topLeft.y + (ly / 100) * viewH;
      drop.setPosition(x, y);
      drop.setDepth(60000);
    });
    this.puddles.forEach((puddle, i) => {
      puddle.setVisible(raining);
      this.splashes[i]?.setVisible(raining);
      if (!raining) return;
      const angle = (i / this.puddles.length) * Math.PI * 2;
      const x = topLeft.x + viewW * 0.5 + Math.cos(angle) * Math.min(28, viewW * 0.2);
      const y = topLeft.y + viewH * 0.55 + Math.sin(angle) * Math.min(14, viewH * 0.12);
      puddle.setPosition(x, y);
      puddle.setDepth(depthFor(y, 1));
      const splash = this.splashes[i];
      if (!splash) return;
      splash.setPosition(x, y + 2);
      splash.setDepth(depthFor(y, 2));
      splash.setTexture('world', Math.floor(this.time.now / 220 + i) % 2 === 0 ? 'rain_splash_0' : 'rain_splash_1');
    });

    const seen = new Set<string>();
    let ringAt: { x: number; y: number } | null = null;
    for (const piece of this.state.pieces) {
      if (piece.kind !== 'fire') continue;
      const lit = piece.lit === true;
      const embers = !lit && piece.coalsUntil != null && this.state.minutes < piece.coalsUntil;
      if (!lit && !embers) continue;
      const key = `${piece.tx},${piece.ty}`;
      seen.add(key);
      let glow = this.fireGlows.get(key);
      if (!glow) {
        glow = this.add.sprite(0, 0, 'world', 'firelight_0');
        glow.setBlendMode(Phaser.BlendModes.ADD);
        glow.setAlpha(0.5);
        this.fireGlows.set(key, glow);
      }
      const at = tileToWorld(piece.tx, piece.ty);
      const flame = this.buildings.get(pieceKey(piece));
      const ground = { x: flame?.x ?? at.x, y: flame?.y ?? at.y };
      glow.setTexture('world', Math.floor(this.time.now / 180) % 2 === 0 ? 'firelight_0' : 'firelight_1');
      glow.setOrigin(0.5, 0.5);
      glow.setPosition(ground.x, ground.y);
      glow.setDepth(depthFor(ground.y, 2));
      glow.setVisible(true);
      glow.setAlpha(lit ? 0.5 : 0.28);
      if (lit && Math.hypot(ground.x - this.px, ground.y - this.py) <= 56) ringAt = ground;
    }
    for (const [key, glow] of this.fireGlows) {
      if (!seen.has(key)) glow.setVisible(false);
    }
    if (ringAt) {
      if (!this.warmthRing) this.warmthRing = this.add.sprite(0, 0, 'world', 'warmth_ring');
      this.warmthRing.setPosition(ringAt.x, ringAt.y);
      this.warmthRing.setOrigin(0.5, 0.5);
      this.warmthRing.setDepth(depthFor(ringAt.y, 2));
      this.warmthRing.setVisible(true);
    } else if (this.warmthRing) this.warmthRing.setVisible(false);
  }

  /** Walls and the roof in front of him fade, and his outline is drawn back on top. */
  private fadeOccluders(): void {
    const player = this.player;
    if (!player) return;
    const home = depthFor(this.py, 6);
    if (player.depth !== home) player.setDepth(home);
    const body = new Phaser.Geom.Rectangle(player.x - 10, player.y - 30, 20, 32);
    let covered = false;
    let top = home;
    for (const piece of this.state.pieces) {
      if (piece.kind === 'foundation' || piece.kind === 'fire') continue;
      const sprite = this.buildings.get(pieceKey(piece));
      if (!sprite) continue;
      const covers =
        sprite.visible &&
        sprite.depth > home &&
        Phaser.Geom.Intersects.RectangleToRectangle(sprite.getBounds(), body);
      const alpha = covers ? 0.28 : 1;
      if (sprite.alpha !== alpha) sprite.setAlpha(alpha);
      if (!covers) continue;
      covered = true;
      top = Math.max(top, sprite.depth);
    }
    if (covered) player.setDepth(top + 2);
    for (const piece of this.state.pieces) {
      if (piece.kind !== 'fire' || (!piece.lit && !(piece.coalsUntil != null && this.state.minutes < piece.coalsUntil))) continue;
      const flame = this.buildings.get(pieceKey(piece));
      if (!flame) continue;
      const at = tileToWorld(piece.tx, piece.ty);
      const beside = Math.hypot(at.x - this.px, at.y - this.py) <= 56;
      const baseY = beside ? Math.max(at.y, this.py) : at.y;
      flame.setDepth(depthFor(baseY, 8));
      const glow = this.fireGlows.get(`${piece.tx},${piece.ty}`);
      glow?.setPosition(flame.x, flame.y);
      glow?.setDepth(depthFor(flame.y, 2));
      if (this.warmthRing?.visible && Math.hypot(this.warmthRing.x - flame.x, this.warmthRing.y - flame.y) < 8) {
        this.warmthRing.setPosition(flame.x, flame.y);
        this.warmthRing.setDepth(depthFor(flame.y, 3));
      }
    }
    this.fadeCanopies();
  }

  /** A leafy or pine canopy goes see-through when it covers him or a lit fire. */
  private fadeCanopies(): void {
    const player = this.player;
    if (!player) return;
    const body = new Phaser.Geom.Rectangle(player.x - 10, player.y - 30, 20, 32);
    const fires: Phaser.Geom.Rectangle[] = [];
    for (const piece of this.state.pieces) {
      if (piece.kind !== 'fire' || piece.lit !== true) continue;
      const flame = this.buildings.get(pieceKey(piece));
      if (flame?.visible) fires.push(flame.getBounds());
    }
    for (const view of this.propViews) {
      const tree = this.isTree(view.prop) && view.sprite.visible;
      if (!tree) {
        if (view.sprite.alpha !== 1) view.sprite.setAlpha(1);
        continue;
      }
      const bounds = view.sprite.getBounds();
      const cover =
        Phaser.Geom.Intersects.RectangleToRectangle(bounds, body) ||
        fires.some((fire) => Phaser.Geom.Intersects.RectangleToRectangle(bounds, fire));
      const alpha = cover ? 0.34 : 1;
      if (view.sprite.alpha !== alpha) view.sprite.setAlpha(alpha);
    }
  }

  private popup(message: string, tx: number, ty: number): void {
    const pos = tileToWorld(tx, ty);
    const text = this.add.text(pos.x, pos.y - 46, message, {
      fontFamily: '"Courier New", ui-monospace, monospace',
      fontSize: '11px',
      color: '#f4ecda',
      stroke: '#1a1420',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 1);
    text.setDepth(50000);
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
