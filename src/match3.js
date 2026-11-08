/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Match-3 V2 · interface de session
   Septembre 2026 · conforme à « Match-3 V2 canonique »

   Source : sb-build/src/match3.js (+ m3core.js) → bundle assets/match3.js.
   Remplace l'ancien match-3 : window.startM3(parcelIdx, context) ouvre une
   session V2 dans l'écran #scr-m3. Lit l'état global du jeu (G, TILES,
   getAvailableTileImg, tileInfo, saveGame, goto, toast, sbConfirm) et
   l'objectif en cours via window.SBAntenna.goal().
   ═══════════════════════════════════════════════════════════════════════════ */

import { COLS, ROWS, N, DIRS, step, neighbors, areNeighbors, SESSION, RES_TYPES } from './m3core.js';
import { THEMES, createSession, applyMove, accountStep, finishMove, decide, finish as sessionFinish, report as sessionReport } from './m3session.js';
import { Board3D, canUse3D } from './m3view3d.js';

// Le vocabulaire « Secours » (__m3V / __m3VO / __m3Sec) est dans src/m3secours_vocab.js, ajouté en tête du bundle par le build (voir BUILD.md).

const SQ3 = Math.sqrt(3);
const INFO_BLUE = '#5fa8e8';
const TIER_ROMAN = ['I', 'II', 'III'];
const CASCADE_LABEL = ['', 'RENDEMENT +20%', 'RENDEMENT +50%', 'EXTRACTION ACCÉLÉRÉE ×2', 'RÉSONANCE GÉOLOGIQUE ×3'];
const REMINE_MAX_DEFAULT = 5;
const SPRITE_DIR = 'tiles/m3v2/';
const CELL_SKIN = { 'Énergie': '_energie', Recherche: '_recherche', Secours: '_secours' };   // couleur du liseré de case
// Tuiles propres à un lieu, rendu 2D de secours + vignettes du compteur (GDD match-3 thématiques)
const SKIN_DIR = { Recherche: 'tiles/m3v2/lab/', 'Énergie': 'tiles/m3v2/centrale/', Secours: 'tiles/m3v2/secours/' };
// L'obstacle n'est pas une roche partout : lentille au Labo, cellule thermique éteinte à la Centrale
const OBSTACLE_LABEL = { Secours: (n) => `Dégager ${n} décombres`, Recherche: (n) => `Dégager ${n} lentilles`, 'Énergie': (n) => `Dégager ${n} cellules thermiques` };
const OBSTACLE_TEXT = {
  Secours: { blocked: 'DÉCOMBRES BLOQUÉS', stat: 'Décombres dégagés' },
  Recherche: { blocked: 'LENTILLE BLOQUÉE', stat: 'Lentilles dégagées' },
  'Énergie': { blocked: 'CELLULE BLOQUÉE', stat: 'Cellules dégagées' },
};

// Pondération par contexte de session (bâtiment) : ressource dominante / secondaire
// THEMES vit dans m3session.js (partagé avec le serveur)

function info(key) {
  try { const t = tileInfo(key); if (t) return t; } catch (e) { /* hors jeu */ }
  const fb = { metal: ['Métal', '#ff8848'], energie: ['Énergie', '#ffaf3a'], cristal: ['Cristal', '#5fffe8'], biomass: ['Biomasse', '#7ed080'], artefact: ['Artefact', '#a370ff'] }[key] || [key, '#aaa'];
  return { label: fb[0], color: fb[1] };
}
const fmt1 = (v) => (v < 10 ? (Math.floor(v * 10) / 10).toFixed(1) : String(Math.floor(v)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => { if (typeof toast === 'function') toast(m); };

/* ─────────────────────────────── Session ─────────────────────────────── */


/* ─────────────── SERVEUR_0811 — graines serveur et rapport de partie (Temps A du GDD « match-3 serveur ») ───────────────
   · Graines : le jeu garde un lot de graines fournies par le serveur (m3_seed_batch) ; chaque partie en consomme une.
     Lot vide et hors-ligne → graine tirée sur place, marquée « client » (le serveur le saura).
   · Rapport : en fin de partie, la session (graine, coups, choix, crédit annoncé) part au serveur (m3_report). Hors-ligne,
     elle attend dans une file locale et part à la reconnexion. Le serveur rejoue et compare ; en jeu, rien ne change. */
const M3_SEEDS_KEY = 'sb_m3_seeds', M3_QUEUE_KEY = 'sb_m3_queue', M3_SEEDS_LOW = 6, M3_QUEUE_MAX = 60;
const m3LS = { get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const m3Rpc = (fn, args) => (typeof window._mpRpc === 'function' ? window._mpRpc(fn, args) : Promise.reject(new Error('no_rpc')));
let m3Refilling = false, m3Flushing = false;
function m3TakeSeed() {
  const pool = m3LS.get(M3_SEEDS_KEY, []).filter((x) => Number.isFinite(x));
  let value, src;
  if (pool.length) { value = pool.shift() >>> 0; src = 'server'; m3LS.set(M3_SEEDS_KEY, pool); }
  else { const a = new Uint32Array(1); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.floor(Math.random() * 4294967296)); value = a[0] >>> 0; src = 'client'; }
  if (pool.length < M3_SEEDS_LOW) m3RefillSeeds();
  return { value, src };
}
async function m3RefillSeeds() {
  if (m3Refilling) return; m3Refilling = true;
  try {
    const rows = await m3Rpc('m3_seed_batch', {});
    const pool = m3LS.get(M3_SEEDS_KEY, []).concat((Array.isArray(rows) ? rows : []).map((r) => (typeof r === 'object' && r ? r.seed : r)).map(Number).filter(Number.isFinite));
    m3LS.set(M3_SEEDS_KEY, pool.slice(0, 60));
  } catch (e) { /* hors-ligne ou registre indisponible : on retentera */ }
  finally { m3Refilling = false; }
}
function m3Report(rep) {
  if (!rep || !rep.seed) return;
  rep.seed_src = (SBMatch3.s && SBMatch3.s.seedSrc) || 'client';
  rep.at = Date.now();
  const q = m3LS.get(M3_QUEUE_KEY, []); q.push(rep); m3LS.set(M3_QUEUE_KEY, q.slice(-M3_QUEUE_MAX));
  m3Flush();
}
async function m3Flush() {
  if (m3Flushing) return; m3Flushing = true;
  let sent = 0;
  try {
    let q = m3LS.get(M3_QUEUE_KEY, []);
    while (q.length) {
      const rep = q[0];
      try { await m3Rpc('m3_report', { p: rep }); sent++; }
      catch (e) { const msg = String(e && e.message || e); if (/m3_report_invalid|m3_report_dup/.test(msg)) { /* rapport refusé pour de bon : on l'abandonne */ } else break; }
      q.shift(); m3LS.set(M3_QUEUE_KEY, q);
    }
  } finally { m3Flushing = false; }
  if (sent) m3AskVerify();
}
// Demande au serveur de rejouer les parties en attente du joueur (fonction m3-verify) — informatif au Temps A
function m3AskVerify() {
  try {
    const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'), tok = a && (a.access_token || (a.currentSession && a.currentSession.access_token));
    if (!tok) return;
    fetch('https://elupnpdcblztpfywnhjl.supabase.co/functions/v1/m3-verify', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ', Authorization: 'Bearer ' + tok }, body: '{}' }).catch(() => {});
  } catch (e) {}
}
setTimeout(() => { m3Flush(); if (m3LS.get(M3_SEEDS_KEY, []).length < M3_SEEDS_LOW) m3RefillSeeds(); }, 4000);
window.addEventListener('online', () => m3Flush());

const SBMatch3 = {
  s: null,          // état de la session en cours
  N,
  view3d: null,     // plateau 3D (Three.js), réutilisé d'une session à l'autre
  use3d: false,

  start(parcelIdx, context) {
    const parcel = G.planet.parcels[parcelIdx];
    if (!parcel) return;
    if (this.s && !this.s.stopped) {
      if (!this.s.ended) { if (typeof goto === 'function') goto('m3'); return; }   // session en cours : on y retourne
      this.apply();                                                              // session terminée non validée : on encaisse
    }
    context = context || 'Terraformation';
    const remine = context === 'Re-mining' ? (parcel.remineCount || 0) : 0;
    // SERVEUR_0811 (Temps A) : la partie est entièrement déterminée par sa graine et ses coups ; le serveur la rejoue
    const seed = m3TakeSeed();
    this.s = createSession({ seed: seed.value, context, remine, parcelIdx,
      labelFor: (def, ctx) => (def.id === 'rocks' && OBSTACLE_LABEL[ctx] ? OBSTACLE_LABEL[ctx] : null) });
    this.s.seedSrc = seed.src;
    this.s.sel = null; this.s.lastInput = performance.now();
    this._mount();
    if (typeof goto === 'function') goto('m3');
    this.use3d = false;
    this.want3d = canUse3D();
    if (this.want3d) this.s.busy = true;          // entrée animée : pas de coup avant la fin
    requestAnimationFrame(() => { this._resize(); this._syncSprites(true); this._renderHud(); this._loop(); if (this.want3d) this._try3D(); });
  },

  // Plateau 3D : chargement du kit Blender, puis entrée animée (repli 2D si échec)
  async _try3D() {
    const s = this.s;
    const fallback = () => { if (this.s === s) { this.want3d = false; this.use3d = false; s.busy = false; this._resize(); } };
    try {
      if (!this.view3d) this.view3d = new Board3D();
      this.view3d.attach(document.getElementById('m3v2-board'), this.canvas);
      const ready = this.view3d.init(this);
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 6000));
      await Promise.race([ready, timeout]);
      if (this.s !== s) return;
      this.use3d = true;
      document.getElementById('m3v2-board').classList.add('gl');
      this._resize();
      this.view3d.intro();
      await sleep(1550);
      await this.until(() => this.view3d.introT >= 1);
      if (this.s === s) { s.busy = false; this._renderHud(); }
    } catch (e) {
      console.warn('[Match3] plateau 3D indisponible, rendu 2D :', e);
      const gl = document.querySelector('#m3v2-board .m3v2-gl'); if (gl) gl.remove();
      fallback();
    }
  },

  // Direction écran (px plateau) d'un axe de match, pour orienter les flèches de charge
  axisDir(axis) {
    const i = 3 * COLS + 3, j = step(i, axis);
    const a = this.center(i), b = this.center(j >= 0 ? j : i);
    return { x: b.x - a.x, y: b.y - a.y };
  },

  /* ─────────────── Montage de l'écran ─────────────── */

  _mount() {
    const scr = document.getElementById('scr-m3');
    const s = this.s, p = G.planet.parcels[s.parcelIdx];
    // REPAIR_1110 — réparation d'un bâtiment abîmé par un raid
    const meta = s.context === 'Antenne' ? `Antenne de prospection · étape ${Math.min(3, (window.SBAntenna && SBAntenna.veinStep ? SBAntenna.veinStep() : 0) + 1)}/3 · atteins la veine profonde (palier III)`
      : s.context === 'Secours' ? 'Secours sanitaires · chaque palier soigne la planète (III : +10 % de santé)'
      : s.context === 'Réparation' ? `Réparation · ${p.n || 'bâtiment abîmé'} · atteins le palier I`
      : s.theme ? s.theme.label : s.context === 'Re-mining' ? `Re-minage ${s.remine + 1} · rendement ×${s.bonus.toFixed(2)}` : 'Terraformation · parcelle vierge';
    scr.innerHTML = `
      <div class="stars"></div><div class="glow"></div>
      <div class="screen-scroll m3v2">
        <header class="m3v2-head">
          <div class="m3v2-title">${s.context === 'Antenne' ? 'ANTENNE' : 'PARCELLE'} ${typeof coord === 'function' ? coord(s.parcelIdx) : s.parcelIdx + 1}</div>
          <div class="m3v2-meta">${meta}</div>
        </header>
        <div class="m3v2-needs" id="m3v2-needs"></div>
        <div class="m3v2-track" id="m3v2-track"></div>
        <div class="m3v2-sec" id="m3v2-sec"></div>
        <div class="m3v2-board" id="m3v2-board">
          <canvas id="m3v2-canvas"></canvas>
          <div class="m3v2-float" id="m3v2-float"></div>
        </div>
        <div class="m3v2-gains" id="m3v2-gains"></div>
        <footer class="actions"><button class="back" id="m3v2-exit">QUITTER</button></footer>
      </div>
      <div class="m3v2-panel hidden" id="m3v2-panel"></div>`;
    void p;
    this.canvas = document.getElementById('m3v2-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.floatEl = document.getElementById('m3v2-float');
    document.getElementById('m3v2-exit').addEventListener('click', () => this._exitPressed());
    this._bindInput();
    this._loadImages();
    if (!this._ro) {
      this._ro = new ResizeObserver(() => { if (this.s) { this._resize(); this._syncSprites(true); } });
    }
    this._ro.disconnect();
    this._ro.observe(document.getElementById('m3v2-board'));
  },

  // Tuiles rendues dans Blender (tiles/m3v2, scène SB_MATCH3) ; anciens PNG en secours
  _loadImages() {
    const ctx = this.s.context;
    const legacy = (k) => (typeof getAvailableTileImg === 'function' ? getAvailableTileImg(k === 'rock' ? 'megastone' : k, ctx) : null);
    const load = (key, url, fallback, fallbackV2) => {
      const im = new Image();
      im.decoding = 'async';
      im.v2 = true;
      im.onerror = () => {
        if (fallback && !im.src.endsWith(fallback)) { im.v2 = !!fallbackV2; im.src = fallback; } else delete this.img[key];
      };
      if (key === 'cell') im.onload = () => { if (this.g) this._cellBg = this._makeCellBg(); };
      im.src = url;
      this.img[key] = im;
    };
    this.img = {};
    const skin = SKIN_DIR[ctx];
    RES_TYPES.forEach((k) => {
      if (skin) {
        load(k, skin + k + '.png', SPRITE_DIR + k + '.png', true);
        load(k + '_charge', skin + k + '_charge.png', SPRITE_DIR + k + '_charge.png', true);
        load(k + '_core', skin + k + '_core.png', SPRITE_DIR + k + '_core.png', true);
      } else {
        load(k, SPRITE_DIR + k + '.png', legacy(k));
        load(k + '_charge', SPRITE_DIR + k + '_charge.png');
        load(k + '_core', SPRITE_DIR + k + '_core.png');
      }
    });
    if (skin) {
      load('rock', skin + 'rock.png', SPRITE_DIR + 'rock.png', true);
      load('rock_cracked', skin + 'rock_cracked.png', SPRITE_DIR + 'rock_cracked.png', true);
    } else {
      load('rock', SPRITE_DIR + 'rock.png', legacy('rock'));
      load('rock_cracked', SPRITE_DIR + 'rock_cracked.png');
    }
    load('cell', SPRITE_DIR + 'cell' + (CELL_SKIN[ctx] || '') + '.png');
  },

  /* ─────────────── Géométrie ─────────────── */

  _resize() {
    const wrap = document.getElementById('m3v2-board');
    if (!wrap) return;
    const W = Math.min(wrap.clientWidth || 360, 480);
    const cw = W / (COLS + 0.5), hh = cw * 2 / SQ3, rs = hh * 0.75;
    const H = (ROWS - 1) * rs + hh;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.g = { W, H, cw, hh, rs, dpr };
    let CH = H;
    if (this.use3d && this.view3d) {
      if (!this.view3d.board || Math.abs(this.view3d.cw0 - cw) > 0.5) { this.view3d._buildBoard(this); this.view3d.cw0 = cw; }
      CH = this.view3d.resize(W, dpr);
    }
    this.g.CH = CH;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(CH * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = CH + 'px';
    this._cellBg = this._makeCellBg();
  },

  center(i) {
    const { cw, hh, rs } = this.g, c = i % COLS, r = (i / COLS) | 0;
    return { x: c * cw + cw / 2 + (r & 1 ? cw / 2 : 0), y: r * rs + hh / 2 };
  },
  // Position d'une case virtuelle au-dessus du plateau (apparition des nouvelles tuiles)
  above(i, n) {
    const p = this.center(i);
    return { x: p.x, y: p.y - (Math.floor(i / COLS) + n) * this.g.rs - this.g.rs * 0.4 + ((i / COLS) | 0) * this.g.rs };
  },
  cellAt(x, y) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      const c = this.center(i), d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return bd < (this.g.cw * 0.62) ** 2 ? best : -1;
  },

  /* ─────────────── Sprites & animation ─────────────── */

  // Un sprite par tuile (clé = id) ; position animée vers la case cible
  _syncSprites(snap) {
    if (!this.g) return;
    const grid = this.s.board.grid;
    const keep = new Map();
    grid.forEach((t, i) => {
      if (!t) return;
      let sp = this.sprites && this.sprites.get(t.id);
      const c = this.center(i);
      if (!sp) sp = { tile: t, x: c.x, y: c.y, vy: 0, scale: 1, alpha: 1, hp: t.hp };
      sp.tile = t; sp.cell = i; sp.tx = c.x; sp.ty = c.y;
      if (snap) { sp.x = c.x; sp.y = c.y; sp.vy = 0; }
      keep.set(t.id, sp);
    });
    this.sprites = keep;
    this.dying = this.dying || [];
    this.fx = this.fx || [];
  },

  _anim(dt) {
    const g = 2400 * (this.g.cw / 50);
    let moving = false;
    this.sprites.forEach((sp) => {
      if (sp.swap) {
        sp.swap.t = Math.min(1, sp.swap.t + dt / sp.swap.d);
        const e = sp.swap.t < 0.5 ? 2 * sp.swap.t * sp.swap.t : 1 - (-2 * sp.swap.t + 2) ** 2 / 2;
        sp.x = sp.swap.x0 + (sp.tx - sp.swap.x0) * e;
        sp.y = sp.swap.y0 + (sp.ty - sp.swap.y0) * e;
        if (sp.swap.t >= 1) sp.swap = null; else moving = true;
        return;
      }
      if (sp.y < sp.ty - 0.5 || Math.abs(sp.x - sp.tx) > 0.5) {
        sp.vy += g * dt;
        const ny = Math.min(sp.ty, sp.y + sp.vy * dt);
        const k = sp.ty - sp.y > 0.01 ? (ny - sp.y) / (sp.ty - sp.y) : 1;
        sp.x += (sp.tx - sp.x) * Math.min(1, Math.max(k, 0.2));
        sp.y = ny;
        if (sp.y >= sp.ty - 0.5 && Math.abs(sp.x - sp.tx) <= 0.5) { sp.x = sp.tx; sp.y = sp.ty; sp.vy = 0; sp.land = 1; sp.spawn = false; }
        else moving = true;
      }
      if (sp.scale < 1) { sp.scale = Math.min(1, sp.scale + dt * 6); moving = true; }
      if (sp.land) { sp.land = Math.max(0, sp.land - dt * 6); }
    });
    this.dying = this.dying.filter((d) => { d.t += dt; return d.t < d.d; });
    this.fx = this.fx.filter((f) => { f.t += dt; return f.t < f.d; });
    return moving || this.dying.length > 0;
  },

  _idle() {
    let busy = false;
    this.sprites.forEach((sp) => { if (sp.swap || sp.y < sp.ty - 0.5 || Math.abs(sp.x - sp.tx) > 0.5 || sp.scale < 1) busy = true; });
    return !busy && this.dying.length === 0;
  },
  until(fn) {
    return new Promise((res) => { const t = () => (fn() ? res() : requestAnimationFrame(t)); t(); });
  },

  _loop() {
    let last = performance.now();
    const sess = this.s;   // AUDIT_1110 : la boucle meurt avec sa session
    const frame = (now) => {
      if (!this.s || this.s !== sess || this.s.stopped) return;
      const scr = document.getElementById('scr-m3');
      if (scr && !scr.classList.contains('hidden')) {
        const dt = Math.min(0.05, (now - last) / 1000);
        this._anim(dt);
        this._dt = dt;
        this._draw(now / 1000);
      }
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  /* ─────────────── Dessin ─────────────── */

  _hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 90);
      const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  },

  _makeCellBg() {
    const { cw, hh, dpr } = this.g;
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw * dpr); c.height = Math.ceil(hh * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const cell = this.img && this.img.cell;
    if (cell && cell.complete && cell.naturalWidth) {
      // rendu Blender : cadre carré de côté hh, l'hexagone y occupe cw × hh
      x.drawImage(cell, (cw - hh) / 2, 0, hh, hh);
      return c;
    }
    const tint = { 'Énergie': ['#2b2414', '#140f08'], Recherche: ['#12261c', '#08120d'] }[this.s.context] || ['#1a2a44', '#0a1322'];
    const gr = x.createLinearGradient(0, 0, cw, hh);
    gr.addColorStop(0, tint[0]); gr.addColorStop(1, tint[1]);
    this._hexPath(x, cw / 2, hh / 2, hh / 2 - 1.5);
    x.fillStyle = gr; x.fill();
    x.strokeStyle = 'rgba(160,200,255,.10)'; x.lineWidth = 1; x.stroke();
    return c;
  },

  _draw(t) {
    const ctx = this.ctx, { W, H, cw, hh, dpr } = this.g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, this.g.CH || H);
    if (this.want3d && !this.use3d) return;                 // plateau 3D en chargement
    if (this.use3d) {
      this.view3d.render(this, t, this._dt || 0.016);
      this.fx.forEach((f) => this._drawFx(ctx, this._fxToScreen(f)));
      return;
    }
    // cases
    for (let i = 0; i < N; i++) {
      const c = this.center(i);
      ctx.drawImage(this._cellBg, c.x - cw / 2, c.y - hh / 2, cw, hh);
    }
    // indice (coup possible après inactivité)
    const s = this.s;
    if (s.hint && !s.busy) {
      const a = 0.35 + 0.35 * Math.sin(t * 5);
      s.hint.forEach((i) => {
        const c = this.center(i);
        this._hexPath(ctx, c.x, c.y, hh / 2 - 2);
        ctx.strokeStyle = `rgba(200,230,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
      });
    }
    if (s.sel !== null && s.sel >= 0) {
      const c = this.center(s.sel);
      this._hexPath(ctx, c.x, c.y, hh / 2 - 2);
      ctx.strokeStyle = 'rgba(220,240,255,.9)'; ctx.lineWidth = 2.2; ctx.stroke();
    }
    // tuiles
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    this.sprites.forEach((sp) => this._drawTile(ctx, sp, t, 1));
    this.dying.forEach((d) => {
      const k = d.t / d.d;
      this._drawTile(ctx, { ...d.sp, scale: 1 + 0.25 * k, alpha: 1 - k }, t, 1);
    });
    ctx.restore();
    // effets
    this.fx.forEach((f) => this._drawFx(ctx, f));
  },

  _drawTile(ctx, sp, t) {
    const tile = sp.tile, size = this.g.cw * 0.86 * (sp.scale ?? 1) * (1 - 0.06 * (sp.land || 0));
    const x = sp.x, y = sp.y;
    ctx.globalAlpha = sp.alpha ?? 1;
    const col = tile.type === 'rock' ? '#8a8f96' : info(tile.type).color;
    if (tile.special === 'core') {
      const pulse = 0.55 + 0.25 * Math.sin(t * 4 + tile.id);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, size * 0.72);
      gr.addColorStop(0, col); gr.addColorStop(0.45, col + '66'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (sp.alpha ?? 1) * pulse;
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, size * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = sp.alpha ?? 1;
    }
    const ok = (im) => im && im.complete && im.naturalWidth;
    const cracked = tile.type === 'rock' && (sp.hp ?? tile.hp) <= 1;
    let key = cracked ? 'rock_cracked' : tile.special ? `${tile.type}_${tile.special}` : tile.type;
    if (!ok(this.img[key])) key = tile.type;
    const im = this.img[key];
    const v2 = ok(im) && im.v2;
    if (ok(im)) {
      // sprites Blender : cadre de 1 m = une case ; légèrement remontés pour asseoir la tuile sur son alvéole
      const sz = v2 ? size * 1.2 : size;
      ctx.drawImage(im, x - sz / 2, y - sz / 2 - (v2 ? size * 0.06 : 0), sz, sz);
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, size * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (cracked && key !== 'rock_cracked') {                                     // roche fissurée (secours)
      ctx.strokeStyle = 'rgba(255,220,170,.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.28, y - size * 0.22); ctx.lineTo(x - size * 0.02, y - size * 0.02);
      ctx.lineTo(x - size * 0.12, y + size * 0.18); ctx.moveTo(x - size * 0.02, y - size * 0.02);
      ctx.lineTo(x + size * 0.25, y + size * 0.06); ctx.lineTo(x + size * 0.3, y + size * 0.26);
      ctx.stroke();
    }
    if (tile.special === 'charge') {                                            // charge de forage
      const [dx, dy, dz] = DIRS[tile.axis];
      // direction écran de l'axe cube (x → droite, z → bas)
      const vx = dx + dz * 0.5, vy = dz * 0.75 * (2 / SQ3);
      const L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L, R = size * 0.52;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.globalAlpha = (sp.alpha ?? 1) * (0.7 + 0.3 * Math.sin(t * 6));
      ctx.beginPath(); ctx.moveTo(x - ux * R, y - uy * R); ctx.lineTo(x + ux * R, y + uy * R); ctx.stroke();
      [1, -1].forEach((sg) => {
        const tx = x + ux * R * sg, ty = y + uy * R * sg, nx = -uy, ny = ux;
        ctx.beginPath();
        ctx.moveTo(tx - ux * 6 * sg + nx * 4, ty - uy * 6 * sg + ny * 4);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - ux * 6 * sg - nx * 4, ty - uy * 6 * sg - ny * 4);
        ctx.stroke();
      });
      ctx.globalAlpha = sp.alpha ?? 1;
    }
    if (tile.special === 'core' && key !== `${tile.type}_core`) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
      ctx.globalAlpha = (sp.alpha ?? 1) * 0.85;
      ctx.beginPath(); ctx.arc(x, y, size * 0.47, t * 2, t * 2 + Math.PI * 1.4); ctx.stroke();
      ctx.globalAlpha = sp.alpha ?? 1;
    }
    ctx.globalAlpha = 1;
  },

  // Effets 2D posés sur le plateau 3D : coordonnées projetées
  _fxToScreen(f) {
    const v = this.view3d, P = (x, y) => v.project(x, y);
    const k = v.cssW / this.g.W;
    if (f.kind === 'line') { const a = P(f.x0, f.y0), b = P(f.x1, f.y1); return { ...f, x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }
    const c = P(f.x, f.y);
    return { ...f, x: c.x, y: c.y, r: f.r ? f.r * k : f.r };
  },

  _drawFx(ctx, f) {
    const k = f.t / f.d;
    if (f.kind === 'spark') {
      const x = f.x + f.vx * f.t, y = f.y + f.vy * f.t + 300 * f.t * f.t;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    } else if (f.kind === 'line') {
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
    } else if (f.kind === 'ring') {
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  _sparks(x, y, color, n = 6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      this.fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, color, t: 0, d: 0.45 });
    }
    if (this.fx.length > 220) this.fx.splice(0, this.fx.length - 220);
  },

  _float(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'm3v2-msg ' + cls;
    el.textContent = __m3V(text);
    this.floatEl.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  },

  /* ─────────────── Entrées ─────────────── */

  _bindInput() {
    const cv = this.canvas;
    let start = null;
    const pos = (e) => {
      if (this.use3d) return this.view3d.pick(e.clientX, e.clientY);
      const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.s || this.s.busy || this.s.ended) return;
      const p = pos(e), i = this.cellAt(p.x, p.y);
      start = { ...p, i, used: false };
      this.s.lastInput = performance.now(); this.s.hint = null;
      cv.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!start || start.used || start.i < 0) return;
      const p = pos(e), dx = p.x - start.x, dy = p.y - start.y;
      if (Math.hypot(dx, dy) < this.g.cw * 0.35) return;
      start.used = true;
      // voisin dont la direction est la plus proche du geste
      const a = start.i, ca = this.center(a);
      let best = -1, bd = -2;
      neighbors(a).forEach((j) => {
        const cj = this.center(j), vx = cj.x - ca.x, vy = cj.y - ca.y;
        const dot = (vx * dx + vy * dy) / (Math.hypot(vx, vy) * Math.hypot(dx, dy));
        if (dot > bd) { bd = dot; best = j; }
      });
      this.s.sel = null;
      if (best >= 0) this.trySwap(a, best);
    });
    cv.addEventListener('pointerup', (e) => {
      if (!start) return;
      const st = start; start = null;
      if (st.used || st.i < 0 || !this.s || this.s.busy) return;
      const s = this.s;
      if (s.sel === null) { s.sel = st.i; return; }
      if (s.sel === st.i) { s.sel = null; return; }
      if (areNeighbors(s.sel, st.i)) { const a = s.sel; s.sel = null; this.trySwap(a, st.i); }
      else s.sel = st.i;
    });
    cv.addEventListener('pointercancel', () => { start = null; });
    cv.style.touchAction = 'none';
  },

  /* ─────────────── Jeu ─────────────── */

  async trySwap(a, b) {
    const s = this.s;
    if (!s || s.busy || s.ended || s.movesLeft <= 0) return;
    const board = s.board;
    if (!board.canSwap(a, b)) { if (board.grid[a]?.type === 'rock' || board.grid[b]?.type === 'rock') this._float((OBSTACLE_TEXT[s.context] || {}).blocked || 'ROCHE INAMOVIBLE', 'dim'); return; }
    s.busy = true;
    const ta = board.grid[a], tb = board.grid[b];
    const spA = this.sprites.get(ta.id), spB = this.sprites.get(tb.id);
    const swapTo = (sp, cell) => { const c = this.center(cell); sp.swap = { x0: sp.x, y0: sp.y, t: 0, d: 0.14 }; sp.tx = c.x; sp.ty = c.y; sp.cell = cell; };
    if (!board.isValidSwap(a, b)) {
      // échange refusé : aller-retour, aucun coup consommé (§5.2)
      window.SBSfx && SBSfx.play('nope');   // SFX_2410
      swapTo(spA, b); swapTo(spB, a);
      await this.until(() => this._idle());
      swapTo(spA, a); swapTo(spB, b);
      await this.until(() => this._idle());
      s.busy = false;
      return;
    }
    window.SBSfx && SBSfx.play('swap');   // SFX_2410
    const mv = applyMove(s, a, b, { account: false });   // SERVEUR_0811 : le coup est joué et journalisé par la session
    const steps = mv.steps;
    this._renderHud();
    swapTo(spA, b); swapTo(spB, a);
    await this.until(() => this._idle());

    for (const st of steps) { accountStep(s, st); await this._animateStep(st); }
    const f = finishMove(s, steps, mv.events);   // coups bonus (§16.2), paliers, objectifs, remélange
    for (const ev of mv.events) {
      if (ev.type === 'bonus') { window.SBSfx && SBSfx.play('bonus', 0.25); this._float(`+1 COUP · ${ev.why}`, 'bonus'); }   // SFX_2410
      else if (ev.type === 'tier') {
        this._float(ev.tier === 3 ? 'VEINE PROFONDE OUVERTE' : `PALIER ${TIER_ROMAN[ev.tier - 1]} ATTEINT`, 'tier');
        window.SBSfx && SBSfx.play(ev.tier === 3 ? 'tier3' : 'tier', 0.15);   // SFX_2410
        if (this.use3d) this.view3d.wave(ev.tier === 3 ? 0xb58cff : 0xffd27a);
      } else if (ev.type === 'secondary') this._float('OBJECTIF SECONDAIRE ATTEINT', 'sec');
    }

    if (f.reshuffled) {
      this._float('RÉORGANISATION GÉOLOGIQUE', 'dim');
      await sleep(500);
      this.sprites.forEach((sp) => { sp.swap = { x0: sp.x, y0: sp.y, t: 0, d: 0.35 }; });
      this._syncSprites(false);
      this.sprites.forEach((sp) => { if (!sp.swap) sp.swap = { x0: sp.x, y0: sp.y, t: 0, d: 0.35 }; });
      await this.until(() => this._idle());
    }
    s.busy = false;
    this._renderHud();

    if (f.offerChoice) { this._showChoice(); return; }
    if (f.exhausted) { await sleep(350); this.finish('moves'); }
  },

  async _animateStep(st) {
    const s = this.s;
    window.SBSfx && SBSfx.m3Step(st);   // SFX_2410
    // gains et statistiques : comptés par la session (accountStep) avant l'animation

    if (st.cascade >= 1) this._float(CASCADE_LABEL[Math.min(st.cascade, 4)], 'cascade');
    st.created.forEach((c) => this._float(c.tile.special === 'core' ? 'NOYAU INSTABLE' : 'CHARGE DE FORAGE', 'special'));

    // explosions de spéciales
    st.blasts.forEach((b) => {
      const c0 = this.center(b.cell), col = info(b.type).color;
      if (b.kind === 'charge') {
        const cells = b.area.map((i) => this.center(i));
        const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
        const i0 = cells.reduce((m, c, k) => (c.x + c.y * 0.001 < cells[m].x + cells[m].y * 0.001 ? k : m), 0);
        const i1 = cells.reduce((m, c, k) => (c.x + c.y * 0.001 > cells[m].x + cells[m].y * 0.001 ? k : m), 0);
        void xs; void ys;
        this.fx.push({ kind: 'line', x0: cells[i0].x, y0: cells[i0].y, x1: cells[i1].x, y1: cells[i1].y, color: '#ffffff', t: 0, d: 0.3 });
      } else this.fx.push({ kind: 'ring', x: c0.x, y: c0.y, r: this.g.W * 0.7, color: col, t: 0, d: 0.5 });
    });

    // disparition des tuiles détruites + remplacement par les spéciales créées
    const replaced = new Set(st.created.map((c) => c.replacedId));
    st.removed.forEach(({ tile }) => {
      const sp = this.sprites.get(tile.id);
      if (!sp) return;
      this.sprites.delete(tile.id);
      this.dying.push({ sp, t: 0, d: 0.2 });
      if (tile.type !== 'rock') this._sparks(sp.x, sp.y, info(tile.type).color, 5);
      else this._sparks(sp.x, sp.y, '#b9b2a6', 8);
    });
    replaced.forEach((id) => {
      const sp = this.sprites.get(id);
      if (sp) { this.sprites.delete(id); this.dying.push({ sp, t: 0, d: 0.2 }); }
    });
    st.created.forEach(({ cell, tile }) => {
      const c = this.center(cell);
      this.sprites.set(tile.id, { tile, x: c.x, y: c.y, tx: c.x, ty: c.y, vy: 0, scale: 0.2, alpha: 1, cell });
    });
    st.rocksCracked.forEach((i) => {
      const t = s.board.grid[i];
      // la roche a pu tomber depuis : on retrouve son sprite par id
      this.sprites.forEach((sp) => { if (sp.tile.type === 'rock' && sp.cell === i) sp.hp = 1; });
      void t;
    });
    this._renderHud();
    await sleep(190);

    // chute + nouvelles tuiles
    const byId = new Map();
    st.falls.forEach((f) => byId.set(f.id, f.to));
    byId.forEach((to, id) => {
      const sp = this.sprites.get(id);
      if (!sp) return;
      const c = this.center(to);
      sp.cell = to; sp.tx = c.x; sp.ty = c.y;
    });
    st.spawns.forEach(({ id, to, above, tile }) => {
      const c = this.center(to), { rs } = this.g;
      const startY = -above * rs + this.g.hh / 2 - rs * 0.25;
      this.sprites.set(id, { tile, x: c.x, y: Math.min(startY, c.y - rs), tx: c.x, ty: c.y, vy: 0, scale: 1, alpha: 1, cell: to, hp: tile.hp, spawn: true });
    });
    await this.until(() => this._idle());
    await sleep(60);
  },

  // _bonusMove / _checkTiers / _checkSecondaries : règles déplacées dans m3session.js (finishMove), l'interface n'affiche plus que les événements

  // Instabilité informative (§19) : 0 → palier I stable, puis monte jusqu'au-delà du palier III
  instability() {
    const s = this.s, [t1, t2, t3] = SESSION.tiers, v = s.total;
    if (v < t1) return { v: 0, label: 'STABLE' };
    if (v < t2) return { v: 0.4 * (v - t1) / (t2 - t1), label: 'PRESSION CROISSANTE' };
    if (v < t3) return { v: 0.4 + 0.35 * (v - t2) / (t3 - t2), label: 'INSTABILITÉ MOYENNE' };
    return { v: Math.min(1, 0.75 + 0.25 * (v - t3) / t3), label: 'INSTABILITÉ ÉLEVÉE' };
  },

  /* ─────────────── HUD ─────────────── */

  // Ordre d'affichage des ressources : celles du lieu d'abord (dominante, secondaire), puis les autres
  _resOrder() {
    const th = this.s && this.s.theme;
    return th ? [th.dom, th.sec, ...RES_TYPES.filter((k) => k !== th.dom && k !== th.sec)] : RES_TYPES;
  },

  // Vignette de la tuile du lieu à côté de la ressource qu'elle rapporte (apprendre en jouant, GDD §4)
  _tileIcon(k) {
    const dir = this.s && SKIN_DIR[this.s.context];
    return dir ? `<img class="m3v2-ti" src="${dir}${k}.png" alt="">` : '';
  },

  _renderHud() {
    const s = this.s;
    if (!s) return;
    // besoins de l'objectif en cours (§15)
    const needs = document.getElementById('m3v2-needs');
    const goal = window.SBAntenna && window.SBAntenna.goal ? window.SBAntenna.goal() : null;
    if (needs) {
      if (goal && goal.vein) {   // ANTENNE_VEINE : l'étape de l'antenne se gagne à la veine profonde
        needs.innerHTML = __m3V(`<div class="m3v2-k">${goal.name} · étape ${goal.step}/3</div><div class="m3v2-needs-r"><span class="${s.tier >= 3 ? 'ok' : ''}">Veine profonde (palier III) → ${goal.label.toLowerCase()} ${s.tier >= 3 ? '<em>atteinte</em>' : ''}</span></div>`);
        needs.style.display = '';
      } else if (goal) {
        const rows = Object.entries(goal.cost).map(([k, need]) => {
          const have = Math.floor((G.res[k] && G.res[k].v) || 0), got = s.gains[k] || 0;
          const left = Math.max(0, need - have - got);
          const t = info(k);
          return `<span class="${left ? '' : 'ok'}">${this._tileIcon(k)}<i style="color:${t.color}">${t.label}</i> ${left ? `manque <b>${Math.ceil(left)}</b>` : 'couvert'}${got >= 0.1 ? ` <em>+${fmt1(got)}</em>` : ''}</span>`;
        }).join('');
        needs.innerHTML = `<div class="m3v2-k">Besoins · ${goal.name}</div><div class="m3v2-needs-r">${rows}</div>`;
        needs.style.display = '';
      } else needs.style.display = 'none';
    }
    // paliers + coups + instabilité (§16-19)
    const track = document.getElementById('m3v2-track');
    if (track) {
      const max = SESSION.tiers[2] * 1.12, pct = Math.min(100, s.total / max * 100);
      const marks = SESSION.tiers.map((v, k) => `<span class="m3v2-mark ${s.tier > k ? 'on' : ''}" style="left:${v / max * 100}%"><b>${TIER_ROMAN[k]}</b></span>`).join('');
      const ins = this.instability();
      const tierName = s.tier ? SESSION.tierNames[s.tier - 1] : 'Aucun palier';
      track.innerHTML = __m3V(`
        <div class="m3v2-row">
          <div><div class="m3v2-k">Extraction</div><div class="m3v2-big">${Math.floor(s.total)}<small> / ${SESSION.tiers[Math.min(s.tier, 2)]}</small></div></div>
          <div class="m3v2-moves"><div class="m3v2-k">Coups</div><div class="m3v2-big ${s.movesLeft <= 3 ? 'low' : ''}">${s.movesLeft}</div></div>
        </div>
        <div class="m3v2-bar"><div class="m3v2-fill" style="width:${pct}%"></div>${marks}</div>
        <div class="m3v2-row m3v2-sub">
          <span>${s.tier ? `Palier ${TIER_ROMAN[s.tier - 1]} · ${tierName}` : 'Palier I · Extraction minimale à atteindre'}</span>
          <span class="m3v2-ins"><i style="width:${Math.round(ins.v * 100)}%"></i></span><span class="m3v2-ins-l">${ins.label}</span>
        </div>`);
    }
    const sec = document.getElementById('m3v2-sec');
    if (sec) {
      sec.innerHTML = __m3V(s.secondaries.map((o) => `<span class="${o.done ? 'done' : ''}">${o.label(o.n)} <b>${Math.min(o.have, o.n)}/${o.n}</b></span>`).join(''));
    }
    const gains = document.getElementById('m3v2-gains');
    if (gains) {
      gains.innerHTML = this._resOrder().map((k) => {
        const t = info(k), v = s.gains[k] || 0;
        const ic = this._tileIcon(k);
        return `<span>${ic || `<i style="background:${t.color}"></i>`}${t.label.toLowerCase()} <b style="color:${t.color}">${fmt1(v)}</b></span>`;
      }).join('');
    }
    const exit = document.getElementById('m3v2-exit');
    if (exit) exit.textContent = __m3V(s.tier >= 1 ? 'EXTRAIRE MAINTENANT' : 'QUITTER');
    // indice après 6 s d'inactivité
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => {
      if (!this.s || this.s.busy || this.s.ended) return;
      const mv = this.s.board.moves();
      if (mv.length) this.s.hint = mv[Math.floor(Math.random() * mv.length)];
    }, 6000);
  },

  /* ─────────────── Choix, fin de session ─────────────── */

  _panel(html) {
    const p = document.getElementById('m3v2-panel');
    p.innerHTML = `<div class="m3v2-card">${__m3V(html)}</div>`;
    p.classList.remove('hidden');
    return p;
  },
  _closePanel() { document.getElementById('m3v2-panel')?.classList.add('hidden'); },

  // §18 : sécuriser l'extraction ou continuer le forage
  _showChoice() {
    const s = this.s, [, t2, t3] = SESSION.tiers;
    const next = s.tier >= 3 ? 'La veine profonde est ouverte : chaque coup restant est du bonus.'
      : s.tier === 2 ? `Continuer peut ouvrir la veine profonde (${t3}), mais le sous-sol devient instable.`
      : `Continuer peut ouvrir le rendement optimal (${t2}) puis la veine profonde (${t3}), mais le sous-sol devient instable.`;
    const p = this._panel(`
      <div class="m3v2-k">Palier ${TIER_ROMAN[s.tier - 1]} atteint · gains sécurisés</div>
      <div class="m3v2-ptitle">${SESSION.tierNames[s.tier - 1]}</div>
      <div class="m3v2-ptext">${Math.floor(s.total)} unités extraites · ${s.movesLeft} coup${s.movesLeft > 1 ? 's' : ''} restant${s.movesLeft > 1 ? 's' : ''}. ${next}</div>
      <div class="m3v2-actions">
        <button class="btn-ghost" data-a="extract">Extraire maintenant</button>
        <button class="btn-primary" data-a="go">Continuer le forage</button>
      </div>`);
    p.querySelector('[data-a="extract"]').onclick = () => { this._closePanel(); decide(s, 'extract'); this.finish('extract'); };
    p.querySelector('[data-a="go"]').onclick = () => { this._closePanel(); decide(s, 'go'); this._float('FORAGE PROLONGÉ', 'dim'); };
  },

  async _exitPressed() {
    const s = this.s;
    if (!s || s.ended || s.busy) return;
    if (s.tier >= 1) { decide(s, 'extract'); this.finish('extract'); return; }
    const ok = typeof sbConfirm === 'function' ? await sbConfirm(__m3VO({
      title: 'Quitter l\'exploitation ?',
      body: s.context === 'Antenne'
        ? "Tu gardes tout ce que tu as extrait, mais sans la veine profonde l'antenne n'avance pas."
        : s.context === 'Réparation'
        ? 'Tu gardes tout ce que tu as extrait, mais sans le palier I le bâtiment reste abîmé.'
        : 'Tu gardes tout ce que tu as extrait, mais sans le palier I la parcelle ne sera pas conquise.',
      confirmLabel: 'Quitter', cancelLabel: 'Continuer',
    })) : true;
    if (ok) { decide(s, 'quit'); this.finish('quit'); }
  },

  finish(reason) {
    const s = this.s;
    if (!s || s.ended) return;
    if (reason !== 'quit') window.SBSfx && SBSfx.play('finish', 0.2);   // SFX_2410
    // SERVEUR_0811 : le crédit est calculé par la session (m3session.finish), skills de forage compris (PATCH_1910_SKILLS_M3)
    const R = sessionFinish(s, reason, (k) => (window.SBSkills && SBSkills.m3Mult ? SBSkills.m3Mult(k) : 1));
    const { credit, rendement, success, secDone } = R, _skx = R.skillExtra;
    m3Report(sessionReport(s));   // rapport au serveur (file hors-ligne), il rejoue et compare
    const parcelLine = this._parcelOutcomeText(success);
    const goalLine = s.context === 'Antenne' ? '' : this._goalAfterText(credit);
    // AUDIT_1110 — on encaisse tout de suite : une app fermée sur l'écran de résultat ne perd plus rien
    const added = this._commit();
    const _sv = s.context === 'Secours' && window.SBAftermath && SBAftermath.onRelief(s.tier);                 // PATCH_2110_SECOURS : la planète dévastée se soigne
    const _v = s.tier >= 3 && window.SBAntenna && SBAntenna.onDeepVein && SBAntenna.onDeepVein();              // ANTENNE_VEINE : l'étape de l'antenne avance
    const _skd = window.SBSkills && SBSkills.m3Discover && SBSkills.m3Discover(s.parcelIdx, s.tier);           // PATCH_1910_SKILLS_M3 : découverte d'un skill
    const rows = Object.keys(credit).length
      ? Object.entries(credit).map(([k, v]) => {
          const t = info(k), a = added[k] || 0;
          const tag = a < v ? ` <span style="color:#ff9a6a;font-size:10px">${a > 0 ? `+${a} · stock plein` : 'stock plein'}</span>` : '';
          const _sk = _skx[k] ? `<span class="m3v2-sk">dont +${_skx[k]} · skill ${(SBSkills.m3By ? SBSkills.m3By(k) : []).join(', ')}</span>` : '';   // PATCH_1910_SKILLS_M3
          return `<div class="m3v2-res"><span>${t.label}</span><b style="color:${t.color}">+${v}</b>${tag}${_sk}</div>`;
        }).join('')
      : '<div class="m3v2-ptext">Aucune ressource extraite.</div>';
    const secRows = s.secondaries.map((o) => `<span class="${o.done ? 'done' : ''}">${o.label(o.n)} · ${o.done ? 'atteint' : `${Math.min(o.have, o.n)}/${o.n}`}</span>`).join('');
    const p = this._panel(`
      <div class="m3v2-k">${reason === 'moves' ? 'Coups épuisés' : reason === 'quit' ? 'Exploitation interrompue' : 'Extraction sécurisée'}</div>
      <div class="m3v2-ptitle">Rendement final · ${rendement}%</div>
      <div class="m3v2-ptext">${s.tier ? `Palier ${TIER_ROMAN[s.tier - 1]} · ${SESSION.tierNames[s.tier - 1]}` : 'Palier I non atteint'}${secDone ? ` · prime de précision +${secDone * 10}%` : ''}</div>
      <div class="m3v2-reslist">${rows}</div>
      <div class="m3v2-stats">${(OBSTACLE_TEXT[s.context] || {}).stat || 'Roches brisées'} ${s.stats.rocksBroken} · Cascade max ×${s.stats.maxCascade ? [1, 1.2, 1.5, 2, 3][Math.min(s.stats.maxCascade, 4)].toFixed(1) : '1.0'} · Coups joués ${s.movesUsed}</div>
      <div class="m3v2-secres">${secRows}</div>
      <div class="m3v2-ptext">${parcelLine}${goalLine ? '<br>' + goalLine : ''}</div>
      <div class="m3v2-actions"><button class="btn-primary" data-a="back">Retour à la planète</button></div>`);
    p.querySelector('[data-a="back"]').onclick = () => this.apply();
  },

  _parcelOutcomeText(success) {
    const p = G.planet.parcels[this.s.parcelIdx];
    if (this.s.context === 'Antenne') {   // ANTENNE_VEINE
      const _k = window.SBAntenna && SBAntenna.veinStep ? SBAntenna.veinStep() : 0, _L = ['Couler les fondations', 'Ériger la structure', 'Monter la parabole et activer'];
      return this.s.tier >= 3
        ? (_k + 1 >= 3 ? "Veine profonde atteinte : la parabole est prête, l'antenne s'active sur la planète." : `Veine profonde atteinte : étape ${_k + 1}/3 faite. Prochaine : ${_L[_k + 1]}.`)
        : `Veine profonde non atteinte : l'étape « ${_L[Math.min(_k, 2)]} » attend. Rejoue depuis l'antenne.`;
    }
    if (this.s.context === 'Réparation') return success ? 'Bâtiment réparé : sa production est rétablie.' : 'Réparation inachevée : atteins le palier I pour remettre le bâtiment en état.';
    if (!success) return 'La parcelle reste à conquérir.';
    if (p.state === 'rocky') return 'Parcelle conquise · gisement détecté.';
    if (this.s.context === 'Re-mining') {
      const n = (p.remineCount || 0) + 1, max = typeof REMINE_MAX !== 'undefined' ? REMINE_MAX : REMINE_MAX_DEFAULT;
      return n >= max ? 'Le gisement est épuisé.' : `Gisement re-miné ${n}× sur ${max}.`;
    }
    return 'Ressources versées dans tes stocks.';
  },

  _goalAfterText(credit) {
    const goal = window.SBAntenna && window.SBAntenna.goal ? window.SBAntenna.goal() : null;
    if (!goal) return '';
    if (goal.vein) return this.s && this.s.tier >= 3   // ANTENNE_VEINE
      ? `<b class="m3v2-okline">${goal.name} : veine profonde atteinte — ${goal.label.toLowerCase()} (étape ${goal.step}/3).</b>`
      : `${goal.name} : atteins la veine profonde (palier III) pour ${goal.label.toLowerCase()}.`;
    const missing = Object.entries(goal.cost).map(([k, need]) => {
      const have = Math.floor((G.res[k] && G.res[k].v) || 0) + (credit[k] || 0);
      return [k, Math.max(0, need - have)];
    }).filter(([, v]) => v > 0);
    if (!missing.length) return `<b class="m3v2-okline">${goal.name} : ressources réunies, prête à construire.</b>`;
    return `${goal.name} : il manque encore ${missing.map(([k, v]) => `${v} ${info(k).label.toLowerCase()}`).join(' · ')}.`;
  },

  // Crédit des ressources et transition de la parcelle (§21, §24) — une seule fois par session
  _commit() {
    const s = this.s;
    const added = {};
    if (!s || !s.result || s.committed) return added;
    s.committed = true;
    const { credit, success } = s.result;
    Object.entries(credit).forEach(([k, v]) => {
      const r = G.res[k];
      if (!r) return;
      const before = r.v;
      if (r.v < r.max) r.v = Math.min(r.max, r.v + v);   // jamais de baisse si le stock dépassait déjà
      added[k] = Math.max(0, Math.round(r.v - before));
    });
    const p = G.planet.parcels[s.parcelIdx];
    if (success && s.context === 'Réparation') {
      if (p.damaged && typeof mpRepairParcel === 'function') mpRepairParcel(s.parcelIdx, { free: true });
    } else if (success && s.context !== 'Antenne') {   // ANTENNE_VEINE : l'antenne ne conquiert pas la parcelle
      p.successCount = (p.successCount || 0) + 1;
      if (p.state === 'rocky') {
        p.state = 'resource';
        p.n = 'Gisement détecté';
        p.sub = 'Construire un bâtiment ou re-miner.';
      } else if (s.context === 'Re-mining' && p.state === 'resource') {
        const max = typeof REMINE_MAX !== 'undefined' ? REMINE_MAX : REMINE_MAX_DEFAULT;
        p.remineCount = (p.remineCount || 0) + 1;
        if (p.remineCount >= max) {
          p.state = 'depleted'; p.n = 'Gisement épuisé'; p.sub = 'Aucune ressource exploitable. Recyclage requis.'; say('Gisement épuisé');
        } else p.sub = `Gisement re-miné ${p.remineCount}× · conquêtes : ${p.successCount}`;
      }
    }
    if (typeof saveGame === 'function') saveGame();
    return added;
  },

  // Retour à la carte (les gains sont déjà encaissés par _commit)
  apply() {
    const s = this.s;
    if (!s || !s.result) return;
    this._commit();
    s.stopped = true;
    if (this.view3d) this.view3d.clear();
    this._closePanel();
    G.selParcel = s.parcelIdx;
    this.s = null;
    if (typeof saveGame === 'function') saveGame();
    if (typeof goto === 'function') goto('planet');
  },
};

/* ─────────────────────────────── Styles ─────────────────────────────── */

const css = document.createElement('style');
css.textContent = `.m3v2-res{flex-wrap:wrap}.m3v2-sk{display:block;width:100%;font-size:10px;color:#7ed080;margin-top:2px;text-align:right}
  .m3v2 { padding-bottom: 8px; }
  .m3v2-head { text-align:center; padding: calc(var(--sat, 0px) + 18px) 16px 6px; }
  .m3v2-title { font-size:22px; font-weight:700; letter-spacing:.2em; color:#e6f0f4; }
  .m3v2-meta { margin-top:4px; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--mut); }
  .m3v2-k { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:${INFO_BLUE}; margin-bottom:3px; }
  .m3v2-needs, .m3v2-track { margin:8px 12px 0; padding:8px 12px; border:1px solid rgba(95,168,232,.25); border-radius:10px; background:rgba(95,168,232,.05); }
  .m3v2-needs-r { display:flex; flex-wrap:wrap; gap:3px 14px; font-family:'JetBrains Mono','SF Mono',monospace; font-size:11px; color:#9fb4c2; }
  .m3v2-needs-r i { font-style:normal; }
  .m3v2-needs-r b { color:#e6f0f4; }
  .m3v2-needs-r em { font-style:normal; color:#9fdc7a; }
  .m3v2-needs-r .ok { color:#9fdc7a; }
  .m3v2-row { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; }
  .m3v2-big { font-family:'JetBrains Mono','SF Mono',monospace; font-size:20px; font-weight:700; color:#e6f0f4; line-height:1.1; }
  .m3v2-big small { font-size:11px; color:var(--mut); font-weight:400; }
  .m3v2-big.low { color:#ff8a6a; }
  .m3v2-moves { text-align:right; }
  .m3v2-bar { position:relative; height:6px; margin:8px 0 4px; background:rgba(255,255,255,.07); border-radius:3px; }
  .m3v2-fill { height:100%; border-radius:3px; background:linear-gradient(90deg,#f7a53c,#ffd27a); transition:width .3s ease; }
  .m3v2-mark { position:absolute; top:-3px; width:2px; height:12px; margin-left:-1px; background:rgba(255,255,255,.35); }
  .m3v2-mark b { position:absolute; top:13px; left:50%; transform:translateX(-50%); font-size:9px; color:var(--mut); font-family:'JetBrains Mono',monospace; }
  .m3v2-mark.on { background:#ffd27a; } .m3v2-mark.on b { color:#ffd27a; }
  .m3v2-sub { margin-top:14px; font-size:10px; color:#9fb4c2; align-items:center; }
  .m3v2-sub > span:first-child { flex:1; }
  .m3v2-ins { width:54px; height:4px; background:rgba(255,255,255,.08); border-radius:2px; overflow:hidden; }
  .m3v2-ins i { display:block; height:100%; background:linear-gradient(90deg,#f7a53c,#ff5a4a); }
  .m3v2-ins-l { font-size:8px; letter-spacing:.1em; color:var(--mut); min-width:88px; text-align:right; }
  .m3v2-sec { display:flex; flex-wrap:wrap; gap:6px; margin:8px 12px 0; }
  .m3v2-sec span { font-size:10px; color:#9fb4c2; padding:4px 8px; border:1px solid rgba(255,255,255,.1); border-radius:12px; }
  .m3v2-sec span b { color:#e6f0f4; font-family:'JetBrains Mono',monospace; font-weight:600; }
  .m3v2-sec span.done { border-color:rgba(159,220,122,.5); color:#9fdc7a; }
  .m3v2-board { position:relative; margin:10px 12px 0; display:flex; justify-content:center; }
  .m3v2-board canvas { display:block; }
  .m3v2-board.gl { display:block; }
  .m3v2-board .m3v2-gl { display:block; margin:0 auto; }
  .m3v2-board.gl #m3v2-canvas { position:absolute; top:0; left:50%; transform:translateX(-50%); }
  .m3v2-float { position:absolute; inset:0; pointer-events:none; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
  .m3v2-msg { font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700; letter-spacing:.12em; color:#fff; padding:5px 10px; border-radius:6px; background:rgba(6,12,18,.72); animation:m3v2Msg 1.5s ease-out both; text-shadow:0 1px 4px #000; }
  .m3v2-msg.cascade { color:#ffd27a; } .m3v2-msg.special { color:#cfe8ff; } .m3v2-msg.tier { color:#ffd27a; font-size:15px; }
  .m3v2-msg.bonus { color:#9fdc7a; } .m3v2-msg.sec { color:#9fdc7a; } .m3v2-msg.dim { color:#9fb4c2; font-weight:500; }
  @keyframes m3v2Msg { 0% { opacity:0; transform:translateY(8px) scale(.96) } 15% { opacity:1; transform:none } 75% { opacity:1 } 100% { opacity:0; transform:translateY(-10px) } }
  .m3v2-gains { display:flex; flex-wrap:wrap; justify-content:center; gap:4px 12px; margin:10px 12px 0; font-size:10px; color:var(--mut); }
  .m3v2-gains i { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:4px; vertical-align:middle; }
  .m3v2-gains b { font-family:'JetBrains Mono',monospace; }
  .m3v2-ti { width:20px; height:20px; vertical-align:middle; margin:-4px 3px -4px 0; object-fit:contain; }
  .m3v2-gains .m3v2-ti { width:24px; height:24px; margin:-6px 2px -6px 0; }
  .m3v2-panel { position:fixed; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; background:rgba(3,6,10,.62); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); padding:16px; }
  .m3v2-panel.hidden { display:none; }
  .m3v2-card { width:min(100%,360px); padding:18px 16px 14px; border-radius:14px; background:rgba(9,15,21,.96); border:1px solid rgba(95,168,232,.4); box-shadow:0 0 40px rgba(63,200,255,.12); animation:m3v2Card .28s ease-out both; max-height:calc(100% - 20px); overflow-y:auto; }
  @keyframes m3v2Card { from { opacity:0; transform:translateY(12px) scale(.97) } to { opacity:1; transform:none } }
  .m3v2-ptitle { font-size:20px; font-weight:700; color:#e6f0f4; margin:4px 0 8px; }
  .m3v2-ptext { font-size:12px; line-height:1.55; color:#9fb4c2; margin:6px 0; }
  .m3v2-okline { color:#9fdc7a; font-weight:600; }
  .m3v2-reslist { margin:10px 0; border-top:1px solid rgba(255,255,255,.07); }
  .m3v2-res { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.07); font-size:13px; color:#c8d2d6; }
  .m3v2-res b { font-family:'JetBrains Mono',monospace; }
  .m3v2-stats { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--mut); margin:6px 0; }
  .m3v2-secres { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
  .m3v2-secres span { font-size:10px; color:var(--mut); } .m3v2-secres span.done { color:#9fdc7a; }
  .m3v2-actions { display:flex; gap:8px; margin-top:12px; }
  .m3v2-actions button { flex:1; }
`;
document.head.appendChild(css);

/* ─────────────────────────────── Branchement ─────────────────────────────── */

window.SBMatch3 = SBMatch3;
// L'ancien moteur est remplacé : toutes les entrées passent par startM3(parcelIdx, context)
window.startM3 = (parcelIdx, context) => SBMatch3.start(parcelIdx, context);
