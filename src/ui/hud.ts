import { CRAFT_CATEGORIES, type CraftCategory, type Recipe } from '../game/craft';
import type { HudModel } from '../game/model';
import { ICONS } from './icons';

export interface HudHandlers {
  onAction: (id: string) => void;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return '&quot;';
  });
}

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Hud {
  private onClick: (event: MouseEvent) => void;
  private model: HudModel | null = null;
  private armReset = false;
  private handlers: HudHandlers = { onAction: () => undefined };
  private selectedSlot = 0;
  private category: CraftCategory = 'construction';
  private recipeId = 'lean-to';
  private qty = 1;
  private hotbarSig = '';
  private placeKind = '';
  private sheetSig = '';
  private frames = new Map<string, FrameRect>();
  private sheetSize = { w: 1, h: 1 };

  constructor(private root: HTMLElement) {
    this.root.innerHTML = `
      <header id="top-bar">
        <div class="clock panel">
          <div id="time">--:--</div>
          <div id="daypart"></div>
        </div>
      </header>
      <footer id="bottom-bar">
        <p id="tip" aria-live="polite"></p>
        <div class="hud-cluster">
          <div id="vitals" class="panel">
            <div class="vital"><span class="vicon">${ICONS.health}</span><div class="bar health"><span id="health-fill"></span></div></div>
            <div class="vital"><span class="vicon">${ICONS.warmth}</span><div class="bar warmth"><span id="warmth-fill"></span></div></div>
            <div class="vital"><span class="vicon">${ICONS.energy}</span><div class="bar energy"><span id="energy-fill"></span></div></div>
            <p id="status"></p>
            <button type="button" id="rest-button" data-action="rest">Rest</button>
          </div>
          <div class="dock">
            <button type="button" id="bag" data-action="craft" aria-label="Inventory">${ICONS.bag}</button>
            <div class="hotbar" id="hotbar"></div>
            <div class="place-actions" id="place-actions" hidden></div>
          </div>
        </div>
      </footer>
      <div id="overlay" hidden></div>
    `;
    this.onClick = (event) => this.handleClick(event);
    this.root.addEventListener('click', this.onClick);
    void this.loadFrames();
  }

  setHandlers(handlers: HudHandlers): void {
    this.handlers = handlers;
  }

  render(model: HudModel, rebuildSheet: boolean): void {
    this.model = model;
    if (model.sheet !== 'craft' && model.sheet !== 'pack') this.armReset = false;
    if (rebuildSheet) this.paintSheet();
    this.paintLive();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.replaceChildren();
  }

  private async loadFrames(): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/spritesheet.json`);
      const json = (await response.json()) as {
        frames: Record<string, { frame: FrameRect }>;
        meta?: { size?: { w: number; h: number } };
      };
      this.frames.clear();
      for (const [name, entry] of Object.entries(json.frames ?? {})) {
        if (entry?.frame) this.frames.set(name, entry.frame);
      }
      if (json.meta?.size) this.sheetSize = json.meta.size;
      this.hotbarSig = '';
      this.sheetSig = '';
      if (this.model) this.render(this.model, true);
    } catch {
      /* Painted fallbacks stay in the slots. */
    }
  }

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || target.hasAttribute('disabled')) return;
    const action = target.dataset.action;
    if (!action) return;
    if (action.startsWith('slot-')) {
      this.selectedSlot = Number(action.slice(5)) || 0;
      this.paintHotbar(this.model);
      return;
    }
    if (action.startsWith('cat-')) {
      this.category = action.slice(4) as CraftCategory;
      const first = this.model?.recipes.find((recipe) => recipe.category === this.category);
      this.recipeId = first?.id ?? this.recipeId;
      this.qty = 1;
      this.sheetSig = '';
      this.paintSheet();
      return;
    }
    if (action.startsWith('pick-')) {
      const id = action.slice(5);
      const recipe = this.model?.recipes.find((item) => item.id === id);
      if (id === this.recipeId && recipe?.enabled && recipe.action) {
        this.handlers.onAction(recipe.action);
        return;
      }
      this.recipeId = id;
      this.qty = 1;
      this.sheetSig = '';
      this.paintSheet();
      return;
    }
    if (action === 'qty-inc' || action === 'qty-dec') {
      const max = this.maxQty();
      this.qty = action === 'qty-inc' ? Math.min(max, this.qty + 1) : Math.max(1, this.qty - 1);
      this.paintQty();
      return;
    }
    if (action === 'craft-go') {
      const recipe = this.currentRecipe();
      if (recipe?.enabled && recipe.action) this.handlers.onAction(recipe.action);
      return;
    }
    if (action === 'reset-arm') {
      this.armReset = true;
      this.sheetSig = '';
      this.paintSheet();
      return;
    }
    this.handlers.onAction(action);
  }

  private paintLive(): void {
    const model = this.model;
    if (!model) return;
    this.text('time', model.clock);
    this.text('daypart', model.daypart);
    this.text('status', model.status);
    this.text('tip', model.tip);
    this.fill('health-fill', model.health);
    this.fill('warmth-fill', model.warmth);
    this.fill('energy-fill', model.energy);
    document.getElementById('warmth-fill')?.parentElement?.classList.toggle('low', model.lowWarmth);
    const rest = document.getElementById('rest-button');
    if (rest) {
      rest.textContent = model.restLabel;
      rest.classList.toggle('ready', model.restReady);
    }
    const playing = model.sheet !== 'title' && model.sheet !== 'end';
    document.getElementById('top-bar')?.toggleAttribute('hidden', !playing);
    document.getElementById('bottom-bar')?.toggleAttribute('hidden', !playing);
    this.paintHotbar(model);
    this.paintDock(model);
    this.paintIngredients(model);
    this.paintQueue(model);
    this.paintQty();
    const craft = document.querySelector<HTMLButtonElement>('[data-action="craft-go"]');
    const recipe = this.currentRecipe();
    if (craft && recipe) craft.disabled = !recipe.enabled;
  }

  private paintHotbar(model: HudModel | null): void {
    const bar = document.getElementById('hotbar');
    if (!bar || !model) return;
    const signature = `${model.hotbar.map((slot) => slot.frame).join(',')}:${this.frames.size}`;
    if (signature !== this.hotbarSig) {
      this.hotbarSig = signature;
      bar.innerHTML = model.hotbar
        .map(
          (slot, index) => `
            <button type="button" class="slot${index === this.selectedSlot ? ' on' : ''}" data-action="slot-${index}" aria-label="${esc(slot.name)}">
              ${this.iconHtml(slot.frame, false)}
              <span class="count" data-slot="${slot.id}">${slot.count}</span>
            </button>
          `,
        )
        .join('');
      return;
    }
    for (const slot of model.hotbar) {
      this.root.querySelectorAll(`[data-slot="${slot.id}"]`).forEach((node) => {
        if (node.textContent !== String(slot.count)) node.textContent = String(slot.count);
      });
    }
    this.root.querySelectorAll('.slot').forEach((node) => {
      const action = (node as HTMLElement).dataset.action ?? '';
      const index = Number(action.slice(5));
      node.classList.toggle('on', index === this.selectedSlot);
    });
  }

  private paintDock(model: HudModel): void {
    const placing = model.place?.kind ?? '';
    const bag = document.getElementById('bag');
    const bar = document.getElementById('hotbar');
    const place = document.getElementById('place-actions');
    if (!bag || !bar || !place) return;
    const showPlace = placing === 'shelter' || placing === 'fire';
    bag.hidden = showPlace;
    bar.hidden = showPlace;
    place.hidden = !showPlace;
    if (showPlace && this.placeKind !== placing) {
      this.placeKind = placing;
      place.innerHTML =
        placing === 'shelter'
          ? `<button type="button" data-action="flip">Flip</button><button type="button" class="primary" data-action="confirm">Confirm</button><button type="button" data-action="cancel">Cancel</button>`
          : `<button type="button" class="primary" data-action="confirm">Confirm</button><button type="button" data-action="cancel">Cancel</button>`;
    }
    if (!showPlace) this.placeKind = '';
    const confirm = place.querySelector<HTMLButtonElement>('[data-action="confirm"]');
    if (confirm && model.place) confirm.disabled = !model.place.valid;
  }

  private paintIngredients(model: HudModel): void {
    const counts = new Map(model.hotbar.map((slot) => [slot.name, slot.count]));
    document.querySelectorAll<HTMLElement>('[data-have]').forEach((node) => {
      const name = node.dataset.have ?? '';
      const need = Number(node.dataset.need ?? 0);
      const have = counts.get(name) ?? 0;
      const text = `${have}/${need}`;
      if (node.textContent !== text) node.textContent = text;
      node.classList.toggle('ok', have >= need);
      node.classList.toggle('short', have < need);
    });
  }

  private paintQueue(model: HudModel): void {
    const queue = document.getElementById('queue');
    if (!queue) return;
    queue.hidden = !model.queue;
    this.text('queue-label', model.queue?.label ?? '');
    const fill = document.getElementById('queue-fill');
    if (fill) fill.style.width = `${Math.round((model.queue?.progress ?? 0) * 100)}%`;
  }

  private paintQty(): void {
    const node = document.getElementById('qty-value');
    if (node) node.textContent = String(this.qty);
    const max = this.maxQty();
    const inc = document.querySelector<HTMLButtonElement>('[data-action="qty-inc"]');
    const dec = document.querySelector<HTMLButtonElement>('[data-action="qty-dec"]');
    if (inc) inc.disabled = this.qty >= max;
    if (dec) dec.disabled = this.qty <= 1;
  }

  private maxQty(): number {
    const recipe = this.currentRecipe();
    if (!recipe?.enabled) return 1;
    return 1;
  }

  private currentRecipe(): Recipe | null {
    const recipes = this.model?.recipes ?? [];
    return (
      recipes.find((recipe) => recipe.id === this.recipeId) ??
      recipes.find((recipe) => recipe.category === this.category) ??
      null
    );
  }

  private fill(id: string, value: number): void {
    const node = document.getElementById(id);
    if (node) node.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  private text(id: string, value: string): void {
    const node = document.getElementById(id);
    if (node && node.textContent !== value) node.textContent = value;
  }

  private paintSheet(): void {
    const model = this.model;
    const overlay = document.getElementById('overlay');
    if (!model || !overlay) return;
    if (model.sheet === 'none') {
      overlay.hidden = true;
      overlay.innerHTML = '';
      overlay.className = '';
      this.sheetSig = '';
      return;
    }
    overlay.hidden = false;
    if (model.sheet === 'title') {
      overlay.className = 'modal-mode';
      this.sheetSig = 'title';
      overlay.innerHTML = `
        <section class="modal panel">
          <p class="eyebrow">A bushcraft game</p>
          <h1>First Night</h1>
          <p class="for">for David</p>
          <p>Late afternoon in a small wood. Stay warm until dawn.</p>
          <p>Tap the ground to walk. Tap sticks, stones, and plants to pick them up. The bag opens your inventory and the crafting bench.</p>
          <p>Night takes your warmth. A lean-to and a fire, close together, give it back.</p>
          <button type="button" class="primary" data-action="start">Start the afternoon</button>
        </section>
      `;
      return;
    }
    if (model.sheet === 'end') {
      overlay.className = 'modal-mode';
      this.sheetSig = 'end';
      overlay.innerHTML = `
        <section class="modal panel">
          <h1>${esc(model.endTitle)}</h1>
          <p>${esc(model.endBody)}</p>
          <button type="button" class="primary" data-action="restart">Try again</button>
        </section>
      `;
      return;
    }
    const recipe = this.currentRecipe();
    const sig = `${model.sheet}:${this.category}:${recipe?.id}:${this.armReset}:${this.frames.size}`;
    if (sig === this.sheetSig) return;
    this.sheetSig = sig;
    overlay.className = 'craft-mode';
    overlay.innerHTML = this.craftHtml(model, recipe);
  }

  private craftHtml(model: HudModel, recipe: Recipe | null): string {
    const cats = CRAFT_CATEGORIES.map(
      (cat) =>
        `<button type="button" class="cat${cat.id === this.category ? ' on' : ''}" data-action="cat-${cat.id}">${esc(cat.label)}</button>`,
    ).join('');
    const tiles = model.recipes
      .filter((item) => item.category === this.category)
      .map(
        (item) => `
          <button type="button" class="tile${item.id === recipe?.id ? ' on' : ''}${item.done ? ' done' : ''}" data-action="pick-${item.id}">
            ${this.iconHtml(item.frame, false)}
            <span>${esc(item.name)}</span>
          </button>
        `,
      )
      .join('');
    const slots = model.hotbar
      .map(
        (slot, index) => `
          <button type="button" class="slot${index === this.selectedSlot ? ' on' : ''}" data-action="slot-${index}" aria-label="${esc(slot.name)}">
            ${this.iconHtml(slot.frame, false)}
            <span class="count" data-slot="${slot.id}">${slot.count}</span>
          </button>
        `,
      )
      .join('');
    const reset = this.armReset
      ? '<button type="button" data-action="restart">Tap again to start over</button>'
      : '<button type="button" data-action="reset-arm">Start over</button>';
    return `
      <button type="button" class="craft-dismiss" data-action="close" aria-label="Close"></button>
      <section class="craft panel">
        <header class="craft-head">
          <h2>Inventory</h2>
          <button type="button" data-action="close" aria-label="Close">Close</button>
        </header>
        <div class="craft-body">
          <aside class="inv">
            <p class="kicker">Pack</p>
            <div class="inv-grid">${slots}</div>
            ${reset}
          </aside>
          <div class="bench">
            <nav class="cats">${cats}</nav>
            <div class="recipes">${tiles || '<p class="empty">Nothing in this list.</p>'}</div>
            <aside class="detail">${this.detailHtml(recipe)}</aside>
          </div>
        </div>
        <footer id="queue" class="queue" hidden>
          <p id="queue-label"></p>
          <div class="bar"><span id="queue-fill"></span></div>
        </footer>
      </section>
    `;
  }

  private detailHtml(recipe: Recipe | null): string {
    if (!recipe) return '<p class="empty">Pick something to make.</p>';
    const ingredients = recipe.ingredients
      .map(
        (item) => `
          <li>
            <span>${esc(item.name)}</span>
            <span class="have" data-have="${esc(item.name)}" data-need="${item.need}">${item.have}/${item.need}</span>
          </li>
        `,
      )
      .join('');
    const craftLabel = recipe.action.startsWith('place-') ? 'Place' : 'Craft';
    return `
      ${this.iconHtml(recipe.frame, true)}
      <h3>${esc(recipe.name)}</h3>
      <p class="blurb">${esc(recipe.blurb)}</p>
      <ul class="ings">${ingredients || '<li><span>No materials</span></li>'}</ul>
      <p class="time">Time <span>${esc(recipe.timeLabel)}</span></p>
      <div class="stepper">
        <button type="button" data-action="qty-dec" aria-label="Fewer">−</button>
        <span id="qty-value">${this.qty}</span>
        <button type="button" data-action="qty-inc" aria-label="More">+</button>
      </div>
      <button type="button" class="primary" data-action="craft-go" ${recipe.enabled ? '' : 'disabled'}>${craftLabel}</button>
    `;
  }

  private iconHtml(frame: string, large: boolean): string {
    const rect = this.frames.get(frame);
    if (!rect) return `<span class="icon${large ? ' lg' : ''}">${ICONS[frame] ?? ICONS.hands}</span>`;
    const fit = large ? 72 : 28;
    const scale = fit / Math.max(rect.w, rect.h);
    const base = import.meta.env.BASE_URL;
    return `<span class="icon${large ? ' lg' : ''}"><span class="sheet-icon" style="width:${rect.w}px;height:${rect.h}px;background-image:url('${base}assets/spritesheet.png');background-position:-${rect.x}px -${rect.y}px;background-size:${this.sheetSize.w}px ${this.sheetSize.h}px;transform:scale(${scale})"></span></span>`;
  }
}
