import type { HudModel, Step } from '../game/model';

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

export class Hud {
  private onClick: (event: MouseEvent) => void;
  private model: HudModel | null = null;
  private armReset = false;
  private handlers: HudHandlers = { onAction: () => undefined };

  constructor(private root: HTMLElement) {
    this.root.innerHTML = `
      <header id="top-bar">
        <div id="time"></div>
        <div id="until"></div>
        <div class="stat">
          <div class="stat-label"><span>Warmth</span><span id="warmth-label"></span></div>
          <div class="bar" id="warmth-bar"><span id="warmth-fill"></span></div>
        </div>
        <div class="stat">
          <div class="stat-label"><span>Energy</span><span id="energy-label"></span></div>
          <div class="bar energy"><span id="energy-fill"></span></div>
        </div>
        <p id="objective"></p>
      </header>
      <footer id="bottom-bar">
        <p id="tip" aria-live="polite"></p>
        <div class="actions">
          <button type="button" data-action="pack">Pack</button>
          <button type="button" data-action="make">Make</button>
          <button type="button" data-action="rest" id="rest-button">Rest</button>
        </div>
      </footer>
      <div id="overlay" hidden></div>
    `;
    this.onClick = (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || target.hasAttribute('disabled')) return;
      const action = target.dataset.action;
      if (!action) return;
      if (action === 'reset-arm') {
        this.armReset = true;
        this.paintSheet();
        return;
      }
      this.handlers.onAction(action);
    };
    this.root.addEventListener('click', this.onClick);
  }

  setHandlers(handlers: HudHandlers): void {
    this.handlers = handlers;
  }

  render(model: HudModel, rebuildSheet: boolean): void {
    this.model = model;
    if (model.sheet !== 'pack') this.armReset = false;
    this.paintLive();
    if (rebuildSheet) this.paintSheet();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.replaceChildren();
  }

  private paintLive(): void {
    const model = this.model;
    if (!model) return;
    this.text('time', model.time);
    this.text('until', model.until);
    this.text('warmth-label', model.warmthLabel);
    this.text('energy-label', model.energyLabel);
    this.text('objective', model.objective);
    this.text('tip', model.tip);
    const warmth = document.getElementById('warmth-fill');
    const energy = document.getElementById('energy-fill');
    if (warmth) warmth.style.width = `${Math.max(0, Math.min(100, model.warmth))}%`;
    if (energy) energy.style.width = `${Math.max(0, Math.min(100, model.energy))}%`;
    document.getElementById('warmth-bar')?.classList.toggle('low', model.lowWarmth);
    const rest = document.getElementById('rest-button');
    if (rest) {
      rest.textContent = model.restLabel;
      rest.classList.toggle('ready', model.restReady);
    }
    const playing = model.sheet !== 'title' && model.sheet !== 'end';
    document.getElementById('top-bar')?.toggleAttribute('hidden', !playing);
    document.getElementById('bottom-bar')?.toggleAttribute('hidden', !playing);
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
      return;
    }
    overlay.hidden = false;
    if (model.sheet === 'title') {
      overlay.className = 'modal-mode';
      overlay.innerHTML = `
        <section class="modal">
          <p class="eyebrow">A bushcraft game</p>
          <h1>First Night</h1>
          <p class="for">for David</p>
          <p>Late afternoon in a small wood. Stay warm until dawn.</p>
          <p>Tap the ground to walk. Tap sticks, stones, and plants to pick them up.</p>
          <p>Tap Make to twist cordage, build a lean-to, and lay a fire. Night takes your warmth. The shelter and the fire give it back.</p>
          <button type="button" class="primary" data-action="start">Start the afternoon</button>
        </section>
      `;
      return;
    }
    if (model.sheet === 'end') {
      overlay.className = 'modal-mode';
      overlay.innerHTML = `
        <section class="modal">
          <h1>${esc(model.endTitle)}</h1>
          <p>${esc(model.endBody)}</p>
          <button type="button" class="primary" data-action="restart">Try again</button>
        </section>
      `;
      return;
    }
    overlay.className = 'sheet-mode';
    overlay.innerHTML = `
      <button type="button" class="sheet-dismiss" data-action="close" aria-label="Close"></button>
      <section class="sheet">${this.sheetBody(model)}</section>
    `;
  }

  private sheetBody(model: HudModel): string {
    if (model.sheet === 'pack') {
      const rows = model.pack
        .map((item) => `<li><span>${esc(item.label)}</span><span>${item.count}</span></li>`)
        .join('');
      const reset = this.armReset
        ? '<button type="button" data-action="restart">Tap again to start over</button>'
        : '<button type="button" data-action="reset-arm">Start over</button>';
      return `<h2>Pack</h2><ul class="pack">${rows}</ul>${reset}`;
    }
    if (model.sheet === 'cordage') {
      const twisted = model.steps.some((step) => step.label === 'Finish the cord');
      const button = twisted
        ? '<button type="button" class="primary" data-action="cordage-wrap">Wrap them the other way</button>'
        : '<button type="button" class="primary" data-action="cordage-twist">Twist both strands</button>';
      return `<h2>Cordage</h2><p class="note">Take two strands. Twist each one the same way. Then wrap the pair the other way. The twist fights the wrap, so the cord locks. That is a reverse wrap.</p>${button}`;
    }
    if (model.sheet === 'lay') {
      return `
        <h2>Fire lay</h2>
        <p class="note">A tipi lights fast when the air is still. A log cabin stands up to a breeze and burns a little slower. Both sit over the tinder.</p>
        <button type="button" class="primary" data-action="lay-tipi">Tipi</button>
        <button type="button" class="primary" data-action="lay-logcabin">Log cabin</button>
      `;
    }
    return `<h2>Make</h2>${model.steps.map((step) => this.stepHtml(step)).join('')}`;
  }

  private stepHtml(step: Step): string {
    const note = step.note ? `<p class="note">${esc(step.note)}</p>` : '';
    const then = step.then ? `<p class="then">${esc(step.then)}</p>` : '';
    if (step.done || !step.action) {
      return `<section class="step"><h3>${esc(step.section)}</h3>${note}<p class="done">${esc(step.label)}</p><p class="detail">${esc(step.detail)}</p></section>`;
    }
    const disabled = step.enabled ? '' : 'disabled';
    return `
      <section class="step">
        <h3>${esc(step.section)}</h3>
        ${note}
        <button type="button" class="primary" data-action="${esc(step.action)}" ${disabled}>
          <span class="choice-label">${esc(step.label)}</span>
          <span class="choice-detail">${esc(step.detail)}</span>
        </button>
        ${then}
      </section>
    `;
  }
}
