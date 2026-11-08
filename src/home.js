/* ═══════════════════════════════════════════════════════════════
   Starbyte — UI/UX V2 « Monde d'abord »  (starbyte_uiux_v2_monde_d_abord.md)

   La planète 3D devient l'écran principal, plein écran :
     · ressources sur une ligne compacte en haut (tap → micro-overlay)
     · un seul objectif, discret (bandeau antenne de planet3d.js)
     · trois raccourcis bas : ⚓ Flotte · 🛡 Défense · 📡 Prospection
     · les bâtiments / parcelles s'ouvrent en micro-overlay (fiche existante)
     · les systèmes s'ouvrent en overlay (niveau 2), la croix ramène au monde
   Les anciens écrans détaillés restent accessibles depuis ces overlays.
   ═══════════════════════════════════════════════════════════════ */

import { SBOrbit, hasShipyard } from './orbit3d.js';
import { SBUnit3D } from './unit3d.js';

const RES = [
  { k: 'metal', label: 'Métal', color: '#ff8848', icon: '<path d="M8 1.5 13.6 4.75v6.5L8 14.5 2.4 11.25v-6.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>' },
  { k: 'energie', label: 'Énergie', color: '#ffaf3a', icon: '<path d="M9.2 1 3.5 9h4l-1 6 6-8.2h-4.1z" fill="currentColor"/>' },
  { k: 'cristal', label: 'Cristal', color: '#5fffe8', icon: '<path d="M8 1 13 6.2 8 15 3 6.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 6.2h10" stroke="currentColor" stroke-width="1.2"/>' },
  { k: 'biomass', label: 'Biomasse', color: '#7ed080', icon: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/>' },
  { k: 'artefact', label: 'Artefact', color: '#a370ff', icon: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="currentColor"/><path d="M8 5 11 8 8 11 5 8z" fill="#0b0f16"/>' },
];

const ICONS = {
  fleet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2"/><path d="M12 6.6v14.6M7.5 10.5h9M4 14.5c.6 3.8 3.9 6.7 8 6.7s7.4-2.9 8-6.7M4 14.5l-1.6 1.6M4 14.5l2 1.2M20 14.5l1.6 1.6M20 14.5l-2 1.2"/></svg>',
  defense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.6 4.5 5.5v6c0 4.8 3.2 8.6 7.5 10 4.3-1.4 7.5-5.2 7.5-10v-6z"/><path d="M12 7v10M8.5 11.2h7"/></svg>',
  prospect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 13.8a7 7 0 0 1 9.9-9.9z"/><path d="M10.2 8.9 15 4.1"/><circle cx="16.2" cy="2.9" r="1.1"/><path d="M8.2 15.8 6.3 21.4h7.4l-1.9-4.6"/><path d="M17.6 9.5a4.2 4.2 0 0 1-3 4.1M20.7 8.9a7.3 7.3 0 0 1-5 6.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/></svg>',
  center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
};

const fmt = (v) => {
  v = Math.floor(v || 0);
  if (v < 1000) return String(v);
  if (v < 10000) return (Math.floor(v / 100) / 10).toFixed(1).replace('.0', '') + 'k';
  if (v < 1e6) return Math.floor(v / 1000) + 'k';
  return (Math.floor(v / 1e5) / 10) + 'M';
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const has = (fn) => typeof window[fn] === 'function';

const SBHome = {
  built: false,

  init() {
    const scr = document.getElementById('scr-planet');
    if (!scr || this.built) return;
    this.built = true;
    scr.classList.add('world');
    document.body.classList.add('sb-world');

    // HUD haut : ressources + nom de planète + réglages
    const top = document.createElement('div');
    top.className = 'w-top';
    top.innerHTML = `
      <div class="w-res" id="w-res">${RES.map((r) => `
        <button class="w-chip" data-k="${r.k}" style="--c:${r.color}" aria-label="${r.label}">
          <svg viewBox="0 0 16 16">${r.icon}</svg><b>0</b><i class="w-full"></i>
        </button>`).join('')}
        <button class="w-gear" aria-label="Réglages">${ICONS.gear}</button>
      </div>
      <div class="w-planet" id="w-planet"></div>`;
    scr.appendChild(top);
    // mode dev : 5 taps rapides sur le nom de la planète (même code secret que l'ancien tableau de bord)
    top.querySelector('#w-planet').addEventListener('click', () => { if (has('_secretTap')) _secretTap(); });

    // Raccourcis bas
    const nav = document.createElement('nav');
    nav.className = 'w-nav';
    nav.innerHTML = [['fleet', 'Flotte'], ['defense', 'Défense'], ['prospect', 'Prospection']].map(([k, l]) =>
      `<button data-sys="${k}">${ICONS[k]}<span>${l}</span><i class="w-dot"></i></button>`).join('');
    scr.appendChild(nav);

    const recenter = document.createElement('button');
    recenter.className = 'w-center'; recenter.setAttribute('aria-label', 'Recentrer');
    recenter.innerHTML = ICONS.center;
    recenter.onclick = () => { this.closeCard(); if (window.Planet3D) window.Planet3D.home(); };
    scr.appendChild(recenter);

    // Fiche bâtiment / parcelle en micro-overlay (le contenu reste rendu par renderInfoCard)
    const info = document.getElementById('planet-info');
    const card = document.createElement('div');
    card.className = 'w-card';
    card.innerHTML = '<button class="w-x" aria-label="Fermer">×</button>';
    card.appendChild(info);
    scr.appendChild(card);
    card.querySelector('.w-x').onclick = () => this.closeCard();
    this.card = card;

    // Micro-overlay ressource + overlay système
    this.pop = document.createElement('div'); this.pop.className = 'w-pop'; scr.appendChild(this.pop);
    this.sheet = document.createElement('div'); this.sheet.className = 'w-sheet'; this.sheet.innerHTML = '<div class="w-sheet-in"></div>';
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet) this.closeSheet(); });
    scr.appendChild(this.sheet);

    top.querySelectorAll('.w-chip').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.showRes(b.dataset.k, b); }; });
    top.querySelector('.w-gear').onclick = () => this.openSettings();
    nav.querySelectorAll('button').forEach((b) => { b.onclick = () => this.openSystem(b.dataset.sys); });
    document.addEventListener('click', () => this.pop.classList.remove('on'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.closeSheet(); this.closeCard(); } });

    // La fiche est re-rendue régulièrement par le jeu : on ne remplace le DOM que si le contenu change
    // (sinon un tap sur un bouton peut tomber pendant le remplacement et se perdre)
    const origRender = window.renderInfoCard;
    if (typeof origRender === 'function' && !origRender._sbHome) {
      window.renderInfoCard = function () {
        const live = document.getElementById('planet-info');
        if (!live) return origRender.apply(this, arguments);
        const ghost = document.createElement('div');
        ghost.style.display = 'none';
        live.id = 'planet-info-live'; ghost.id = 'planet-info';
        document.body.appendChild(ghost);
        try { origRender.apply(this, arguments); }
        finally {
          ghost.remove(); live.id = 'planet-info';
          if (ghost.innerHTML !== live.innerHTML) live.innerHTML = ghost.innerHTML;
          if (ghost.className && ghost.className !== live.className) live.className = ghost.className;
        }
      };
      window.renderInfoCard._sbHome = true;
    }

    // Toucher une parcelle ouvre sa fiche
    const orig = window.onHexClick;
    if (typeof orig === 'function' && !orig._sbHome) {
      window.onHexClick = function (i) { SBHome.lastHexAt = performance.now(); const r = orig.apply(this, arguments); SBHome.openCard(); return r; };
      window.onHexClick._sbHome = true;
    }

    // Toucher la carte hors d'une parcelle referme la fiche (un glissé pour déplacer la vue ne compte pas)
    const host = document.getElementById('planet3d');
    if (host) {
      let down = null;
      host.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
      host.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
        if (moved > 8 || e.target.closest('.p3d-goal')) return;
        const t = performance.now();
        setTimeout(() => { if (!(this.lastHexAt > t - 5)) this.closeCard(); }, 120);
      });
    }

    SBOrbit.mount();
    window.SBOrbit = SBOrbit;   // l'orbite est appelée aussi depuis la carte planétaire (bâtiment = menu physique)

    // Fiche détail d'unité : vitrine 3D plein écran (la case illustration disparaît, les cartes défilent par-dessus)
    // Garde planétaire = UNIT-07 · Soldat lourd = RED PHALANX
    const U3D_UNITS = { garde: true, lourd: true, tourelle: true };
    const origUD = window.renderDefenseUnitDetail;
    if (typeof origUD === 'function' && !origUD._sbHome) {
      window.renderDefenseUnitDetail = function (key) {
        const r = origUD.apply(this, arguments);
        const scr = document.getElementById('scr-unit-detail');
        const scroll = scr && scr.querySelector('.screen-scroll');
        let st = document.getElementById('ud-u3d');
        let sp = document.getElementById('ud-hero-space');
        if (U3D_UNITS[key] && scr && scroll) {
          if (!st) {
            st = document.createElement('div'); st.id = 'ud-u3d'; st.className = 'u3d u3d-hero';
            scr.insertBefore(st, scroll);
          }
          if (!sp) {
            sp = document.createElement('div'); sp.id = 'ud-hero-space'; sp.className = 'ud-hero-space';
            const head = scroll.querySelector('.head');
            scroll.insertBefore(sp, head ? head.nextSibling : scroll.firstChild);
          }
          const n = (G.defense && G.defense.units && G.defense.units[key] && G.defense.units[key].qty) || 0;
          st.innerHTML = `<div class="u3d-stat"><b>${fmt(n)}</b><span>en service</span></div><div class="u3d-hint">Glisser pour tourner</div>`;
          scr.classList.add('ud-hero');
          scroll.scrollTop = 0;
          SBUnit3D.mount(st, key);
        } else if (scr) {
          scr.classList.remove('ud-hero');
          if (st) SBUnit3D.unmount(st);
        }
        return r;
      };
      window.renderDefenseUnitDetail._sbHome = true;
    }

    // Fiche bâtiment du Bunker : vitrine 3D plein écran de la tourelle du tier (PD-3 légère / PD-3L lourde au Bunker fortifié)
    // + « Arsenal du bunker » : tourelles et soldat lourd débloqués, un toucher change le modèle présenté.
    const origBD = window.renderBuildingDetail;
    if (typeof origBD === 'function' && !origBD._sbHome) {
      window.renderBuildingDetail = function () {
        const _bdS = document.querySelector('#scr-building-detail .screen-scroll'), _bdTop = _bdS ? _bdS.scrollTop : 0;   // PATCH_2510_BUNKER : position avant le rendu
        const r = origBD.apply(this, arguments);
        const scr = document.getElementById('scr-building-detail');
        const scroll = scr && scr.querySelector('.screen-scroll');
        let st = document.getElementById('bd-u3d');
        let sp = document.getElementById('bd-hero-space');
        let ars = document.getElementById('bd-arsenal');
        let parcel = null;
        try { parcel = G.planet.parcels[selectedBuildingParcelIdx]; } catch (e) { /* écran sans parcelle */ }
        if (parcel && parcel.building === 'turret' && scr && scroll) {
          const tier = parcel.lvl || 1;
          const UQ = (k) => (G.defense && G.defense.units && G.defense.units[k] && G.defense.units[k].qty) || 0;
          const ARS = [
            { key: tier >= 2 ? 'tourelle_lourde' : 'tourelle', code: tier >= 2 ? 'PD-3L' : 'PD-3', name: tier >= 2 ? 'Tourelle lourde' : 'Tourelle légère',
              img: tier >= 2 ? 'illustrations/tourelle_lourde.png' : 'illustrations/tourelle.png', n: UQ('tourelle'), sub: 'en service' },
            tier >= 2 ? { key: 'tourelle', code: 'PD-3', name: 'Tourelle légère', img: 'illustrations/tourelle.png', n: UQ('tourelle'), sub: 'en service' }
              : { key: 'tourelle_lourde', code: 'PD-3L', name: 'Tourelle lourde', img: 'illustrations/tourelle_lourde.png', n: null, sub: 'Tier 2', lock: true },
            { key: 'lourd', code: 'RED PHALANX', name: 'Soldat lourd', img: 'illustrations/lourd.png', n: UQ('lourd'), sub: 'en service' },
          ];
          if (!st) { st = document.createElement('div'); st.id = 'bd-u3d'; st.className = 'u3d u3d-hero'; scr.insertBefore(st, scroll); }
          if (!sp) {
            sp = document.createElement('div'); sp.id = 'bd-hero-space'; sp.className = 'ud-hero-space';
            const head = scroll.querySelector('.head'); scroll.insertBefore(sp, head ? head.nextSibling : scroll.firstChild);
          }
          if (!ars) {
            ars = document.createElement('div'); ars.id = 'bd-arsenal';
            const cur = document.getElementById('bd-current');
            const lbl = cur && cur.previousElementSibling;
            scroll.insertBefore(ars, lbl && lbl.classList.contains('section-label') ? lbl : sp.nextSibling);
          }
          const pick = (k) => {
            const a = ARS.find((x) => x.key === k) || ARS[0];
            scr._bdKey = a.key;
            /* PATCH_2510_BUNKER : même unité déjà montée → on ne recrée pas la scène 3D */
            if (st._k === a.key && st.querySelector('canvas')) {
              const _st = st.querySelector('.u3d-stat');
              if (_st) _st.innerHTML = `<b>${a.n == null ? '—' : fmt(a.n)}</b><span>${esc(a.lock ? 'verrouillée · tier 2' : a.sub)}</span>`;
              ars.querySelectorAll('.wd-tile').forEach((t) => t.classList.toggle('on', t.dataset.k === a.key));
              return;
            }
            st._k = a.key;
            st.innerHTML = `<div class="u3d-stat"><b>${a.n == null ? '—' : fmt(a.n)}</b><span>${esc(a.lock ? 'verrouillée · tier 2' : a.sub)}</span></div>
              <div class="u3d-hint">${esc(a.code)} · glisser pour tourner</div>`;
            ars.querySelectorAll('.wd-tile').forEach((t) => t.classList.toggle('on', t.dataset.k === a.key));
            SBUnit3D.mount(st, a.key);
          };
          ars.innerHTML = `<div class="section-label">Arsenal du bunker</div><div class="wd-tiles bd-tiles">${ARS.map((a) => `
            <button class="wd-tile${a.lock ? ' lock' : ''}" data-k="${a.key}"><img src="${a.img}" alt="" loading="lazy">
              <span class="wd-tile-t"><b>${esc(a.name)}</b><em>${a.n == null ? '🔒' : fmt(a.n)}</em><i>${esc(a.sub)}</i></span></button>`).join('')}</div>`;
          ars.querySelectorAll('.wd-tile').forEach((t) => { t.onclick = () => pick(t.dataset.k); });
          scr.classList.add('ud-hero');
          {
            /* PATCH_2510_BUNKER : un nouveau rendu de la même fiche (skill appris, recherche qui avance) garde la position et l'unité choisie */
            const _f = !!window._bdFresh || scr._bdIdx !== selectedBuildingParcelIdx;
            window._bdFresh = false; scr._bdIdx = selectedBuildingParcelIdx;
            if (_f) { scroll.scrollTop = 0; st._k = null; pick(ARS[0].key); }
            else { scroll.scrollTop = _bdTop; pick(scr._bdKey && ARS.some((x) => x.key === scr._bdKey) ? scr._bdKey : ARS[0].key); }
          }
        } else if (scr) {
          scr.classList.remove('ud-hero');
          if (ars) ars.innerHTML = '';
          if (st) SBUnit3D.unmount(st);
        }
        return r;
      };
      window.renderBuildingDetail._sbHome = true;
    }

    // Écrans détaillés : une croix en haut à droite ramène toujours à la planète
    document.querySelectorAll('.screen').forEach((sc) => {
      if (['scr-planet', 'scr-m3', 'scr-welcome', 'scr-orbit'].includes(sc.id) || sc.querySelector(':scope > .w-screen-x')) return;
      const x = document.createElement('button');
      x.className = 'w-screen-x'; x.setAttribute('aria-label', 'Retour à la planète'); x.textContent = '×';
      x.onclick = () => goto('planet');
      sc.appendChild(x);
    });

    // premier affichage en portrait : cadrage large de la colonie
    const wait = setInterval(() => {
      if (window.Planet3D && window.Planet3D.ready) { clearInterval(wait); window.Planet3D.home(1); }
    }, 200);

    this.refresh();
    setInterval(() => { if (!scr.classList.contains('hidden')) this.refresh(); }, 1000);
  },

  refresh() {
    if (typeof G === 'undefined' || !G.res) return;
    RES.forEach((r) => {
      const b = document.querySelector(`.w-chip[data-k="${r.k}"]`), res = G.res[r.k];
      if (!b || !res) return;
      b.querySelector('b').textContent = fmt(res.v);
      b.classList.toggle('full', res.max > 0 && res.v >= res.max);
    });
    const pl = document.getElementById('w-planet');
    if (pl) {
      const age = (document.getElementById('dash-planet-sub') || {}).textContent || '';
      const ageTxt = age.split('·').pop().trim();
      pl.textContent = [(G.planet && G.planet.name) || 'Kerath-VII', ageTxt].filter(Boolean).join(' · ').toUpperCase();
    }
    const a = window.SBAntenna && window.SBAntenna.data ? window.SBAntenna.data() : null;
    const dot = document.querySelector('.w-nav [data-sys="prospect"] .w-dot');
    if (dot) dot.classList.toggle('on', !!(a && a.built && !a.seenProspect));
    // Moment 7 : le chantier vient d'être construit, l'orbite n'a pas encore été vue
    const fdot = document.querySelector('.w-nav [data-sys="fleet"] .w-dot');
    if (fdot) fdot.classList.toggle('on', !!(G.orbitUnseen && hasShipyard()));
  },

  showRes(k, el) {
    const r = RES.find((x) => x.k === k), res = G.res[k];
    if (!res) return;
    let rate = res.rate > 0 ? `+${typeof effRate == 'function' ? rateNum(effRate(k)) : res.rate}/h` : 'aucune production';
    const _ov = res.max > 0 && res.v > res.max ? Math.floor(res.v - res.max) : 0;
    /* PATCH_2010_SURPLUS : stock au-delà du stockage (cargaisons livrées) */
    if (res.max > 0 && res.v >= res.max && res.rate > 0) rate = `${rate} · à l'arrêt, stock plein`;
    this.pop.innerHTML = `<b style="color:${r.color}">${r.label.toUpperCase()}</b>
      <div>${Math.floor(res.v).toLocaleString('fr-CH')} / ${Math.floor(res.max).toLocaleString('fr-CH')}</div>
      <div class="w-mut">${rate}</div>${_ov ? `<div class="w-mut" style="color:#ffb066;margin-top:4px;line-height:1.4">+${_ov.toLocaleString('fr-CH')} au-delà du stockage : une cargaison livrée (commerce, butin) est gardée, mais la production attend que tu redescendes sous ${Math.floor(res.max).toLocaleString('fr-CH')}.</div>` : ''}`;
    const rr = el.getBoundingClientRect(), sr = document.getElementById('scr-planet').getBoundingClientRect();
    this.pop.style.left = Math.max(8, Math.min(rr.left - sr.left - 20, sr.width - (_ov ? 244 : 168))) + 'px';
    this.pop.style.top = (rr.bottom - sr.top + 6) + 'px';
    this.pop.classList.add('on');
    clearTimeout(this._popT); this._popT = setTimeout(() => this.pop.classList.remove("on"), _ov ? 7000 : 3500);
  },

  openCard() { this.closeSheet(); if (this.card) this.card.classList.add('on'); },
  closeCard() { if (this.card) this.card.classList.remove('on'); },

  _sheet(title, body, actions = []) {
    this.closeCard();
    SBUnit3D.unmount();
    const inn = this.sheet.querySelector('.w-sheet-in');
    inn.classList.remove('wd');
    inn.innerHTML = `
      <header><span>${esc(title)}</span><button class="w-x" aria-label="Fermer">×</button></header>
      <div class="w-body">${body}</div>
      ${actions.length ? `<div class="w-acts">${actions.map((a, i) => `<button class="${i === 0 ? 'btn-primary' : 'btn-ghost'}" data-i="${i}">${esc(a[0])}</button>`).join('')}</div>` : ''}`;
    inn.querySelector('.w-x').onclick = () => this.closeSheet();
    inn.querySelectorAll('.w-acts button').forEach((b) => { b.onclick = () => { this.closeSheet(); actions[+b.dataset.i][1](); }; });
    this.sheet.classList.add('on');
  },
  closeSheet() { if (this.sheet) this.sheet.classList.remove('on'); SBUnit3D.unmount(document.getElementById('w-u3d')); },

  // Contenu repris des blocs du tableau de bord (mêmes calculs), sans la page bento
  _block(id) {
    if (has('renderDashboard')) { try { renderDashboard(); } catch (e) { /* écran absent */ } }
    const el = document.getElementById(id);
    return el ? `<div class="w-block">${el.innerHTML}</div>` : '';
  },

  openSystem(sys) {
    if (sys === 'fleet') {
      // L'orbite sert à armer : construction navale et docks se gèrent depuis l'orbite, qui n'existe qu'avec le chantier
      const yard = hasShipyard();
      const note = yard
        ? (G.orbitUnseen ? `<div class="w-note"><span class="w-k">Chantier opérationnel</span><b>L'orbite est accessible.</b> Les vaisseaux se construisent là-haut.</div>` : '')
        : `<div class="w-note"><b>Pas encore d'accès orbital.</b> Construis le chantier orbital : vaisseaux, docks et flottes se gèrent depuis l'orbite.</div>`;
      this._sheet('Flotte', note + this._block('dash-fleet-block'), [
        ...(yard ? [['Entrer en orbite', () => SBOrbit.open()]] : []),
        ['Gérer les flottes', () => goto('fleet')],
      ]);
    } else if (sys === 'defense') {
      this.openDefense();
    } else {
      const A = window.SBAntenna, a = A && A.data ? A.data() : null;
      let head = '';
      if (a && !a.built) {
        head = `<div class="w-note"><b>Aucune liaison externe.</b> Construis l'antenne de prospection pour capter les premiers signaux.</div>`;
      } else if (a && a.signal) {
        head = `<div class="w-note"><span class="w-k">Signal actif</span><b>${esc(a.signal.name || 'SIGNATURE 01')}</b> · ${esc(a.signal.dist || '')} · ${esc(a.signal.cls || '')}</div>`;
        a.seenProspect = true; if (has('saveGame')) saveGame();
      }
      // 12/10 (Adrien) : pas d'antenne → pas de Centre de prospection (prospectLocked() dans index.html)
      const locked = has('prospectLocked') && prospectLocked();
      const acts = [];
      if (a && !a.built) acts.push(["Voir l'antenne", () => { onHexClick(a.parcel); if (window.Planet3D) window.Planet3D.focus(a.parcel); }]);
      if (!locked) acts.push(['Ouvrir le centre de prospection', () => (has('openProspectAtTab') ? openProspectAtTab('univers') : goto('prospect'))]);
      this._sheet('Prospection', head + (locked ? '' : this._block('dash-universe-block')), acts);
      this.refresh();
    }
  },

  // Vue Défense (depuis la carte) : vitrine 3D en décor, onglets d'unités, bilan, accès à l'écran de gestion
  openDefense(sel) {
    const U = (G.defense && G.defense.units) || {};
    const DU = window.DEFENSE_UNITS || (typeof DEFENSE_UNITS !== 'undefined' ? DEFENSE_UNITS : {});
    const LIST = [
      { key: 'lourd', code: 'RED PHALANX', img: 'illustrations/lourd.png' },
      { key: 'tourelle', code: 'PD-3', img: 'illustrations/tourelle.png' },
      { key: 'garde', code: 'UNIT-07', img: 'illustrations/soldat.png' },
    ].map((u) => ({ ...u, name: (DU[u.key] && DU[u.key].name) || u.key, n: (U[u.key] && U[u.key].qty) || 0 }));
    if (!sel) sel = (LIST.slice().sort((p, q) => q.n - p.n)[0] || LIST[0]).key;
    const cur = LIST.find((u) => u.key === sel) || LIST[0];
    const P = (G.planet && G.planet.parcels) || [];
    const caserne = P.some((p) => p.building === 'caserne' && p.state !== 'building');
    let total = 0, st = { label: '—', color: '#cfe1ee' };
    try { if (has('totalDefense')) total = totalDefense(); if (has('defenseStatus')) st = defenseStatus(); } catch (e) { /* données partielles */ }
    const units = Object.values(U).reduce((t, u) => t + (u.qty || 0), 0);
    const I = {
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v5M12 16v.5"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 13.6c2.7.2 5 2 5 5"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
      gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    };
    const tiles = LIST.map((u) => `<button class="wd-tile${u.key === cur.key ? ' on' : ''}" data-k="${u.key}">
        <img src="${u.img}" alt="" loading="lazy"><span class="wd-tile-t"><b>${esc(u.name)}</b><em>${fmt(u.n)}</em><i>en garnison</i></span></button>`).join('');
    const body = `
      <div class="u3d w-u3d u3d-ctx wd-stage" id="w-u3d">
        <div class="u3d-cap wd-cap"><b>${esc(cur.code)}</b><span>${esc(cur.name)}</span></div>
        <div class="u3d-stat wd-stat"><b>${fmt(cur.n)}</b><span>en garnison</span></div>
        <div class="u3d-hint">Glisser pour tourner · toucher pour agir</div>
      </div>
      <div class="wd-tiles">${tiles}</div>
      ${caserne ? '' : `<div class="w-note"><b>Aucune caserne.</b> Construis une caserne pour mobiliser les premiers gardes.</div>`}
      <div class="wd-stats">
        <div class="wd-row"><i>${I.shield}</i><span>Défense totale</span><b style="color:${st.color || '#7fe0a0'}">${fmt(total)}</b></div>
        <div class="wd-row"><i>${I.users}</i><span>Unités déployées</span><b>${fmt(units)}</b></div>
        <div class="wd-row"><i>${I.check}</i><span>Statut</span><b style="color:${st.color || '#7fe0a0'}">${esc(st.label || '—')}</b></div>
      </div>
      <button class="wd-cta" id="wd-cta"><i>${I.gear}</i><span>Gérer la défense</span><em>›</em></button>
      <button class="wd-more" id="wd-more">Fiche de l'unité</button>`;
    this._sheet('Défense', body);
    const inn = this.sheet.querySelector('.w-sheet-in');
    inn.classList.add('wd');
    inn.querySelectorAll('.wd-tile').forEach((t) => { t.onclick = () => this._defSelect(t.dataset.k, LIST); });
    inn.querySelector('#wd-cta').onclick = () => { this.closeSheet(); goto('defense'); };
    inn.querySelector('#wd-more').onclick = () => { const k = this._defKey || cur.key; this.closeSheet(); if (has('openUnitDetail')) openUnitDetail(k, 'defense'); else goto('defense'); };
    this._defKey = cur.key;
    SBUnit3D.mount(document.getElementById('w-u3d'), cur.key, { decor: 'planet' });
  },
  _defSelect(k, LIST) {
    const u = LIST.find((x) => x.key === k); if (!u) return;
    this._defKey = k;
    const inn = this.sheet.querySelector('.w-sheet-in');
    inn.querySelectorAll('.wd-tile').forEach((t) => t.classList.toggle('on', t.dataset.k === k));
    inn.querySelector('.wd-cap').innerHTML = `<b>${esc(u.code)}</b><span>${esc(u.name)}</span>`;
    inn.querySelector('.wd-stat').innerHTML = `<b>${fmt(u.n)}</b><span>en garnison</span>`;
    SBUnit3D.mount(document.getElementById('w-u3d'), k, { decor: 'planet' });
  },

  openSettings() {
    const slot = document.getElementById('dash-cloud-slot');
    this._sheet('Réglages', `<div id="w-cloud"></div>
      <div class="w-links">
        <button onclick="SBHome.closeSheet();goto('reports')">Rapports</button>
        <button onclick="SBHome.closeSheet();goto('tech-tree')">Arbre technologique</button>
        <button onclick="SBHome.closeSheet();goto('resources')">Détail des ressources</button>
        <button onclick="SBHome.closeSheet();goto('dashboard')">Ancien tableau de bord</button>
      </div>`);
    if (slot) document.getElementById('w-cloud').appendChild(slot);
    if (window.SBCloud && window.SBCloud.renderDash) window.SBCloud.renderDash();
  },
};

const css = document.createElement('style');
css.textContent = `
  #scr-planet.world > .head, #scr-planet.world > footer.actions, #scr-planet.world .screen-scroll > div[onclick] { display:none !important; }
  #scr-planet.world { background:#05080c; }
  #scr-planet.world .screen-scroll { position:absolute; inset:0; overflow:hidden; padding:0; }
  #scr-planet.world .mapwrap { position:absolute; inset:0; margin:0; padding:0; border:0; }
  #scr-planet.world .planet3d { height:100% !important; min-height:0; }
  #scr-planet.world #hexmap { position:absolute; inset:15% 0 auto; }
  #scr-planet.world .p3d-goal { top:calc(var(--sai) + 60px); left:12px; right:12px; padding:7px 10px; background:rgba(6,10,15,.62); border-color:rgba(95,168,232,.22); }
  #scr-planet.world .p3d-goal-t { font-size:8.5px; margin-bottom:2px; }
  #scr-planet.world .p3d-goal-n { font-size:10.5px; gap:10px; }
  body.sb-world #dev-nav { display:none !important; }

  .w-top { position:absolute; left:0; right:0; top:0; z-index:20; padding:calc(var(--sai) + 8px) 10px 0; pointer-events:none;
    background:linear-gradient(to bottom, rgba(4,7,11,.78), rgba(4,7,11,0)); }
  .w-top > * { pointer-events:auto; }
  .w-res { display:flex; align-items:center; gap:2px; }
  .w-chip { flex:1; min-width:0; display:flex; align-items:center; justify-content:center; gap:4px; height:30px; padding:0 2px; background:none; border:0; color:var(--c); cursor:pointer; position:relative; }
  .w-chip svg { width:13px; height:13px; flex-shrink:0; }
  .w-chip b { font:600 12.5px/1 var(--font-mono, monospace); color:#e8eef2; letter-spacing:.02em; }
  .w-chip.full b { color:#ffb14a; }
  .w-chip .w-full { display:none; position:absolute; top:4px; right:6px; width:5px; height:5px; border-radius:50%; background:#ffb14a; }
  .w-chip.full .w-full { display:block; }
  .w-gear { width:30px; height:30px; flex-shrink:0; background:none; border:0; color:rgba(200,215,225,.7); padding:6px; cursor:pointer; }
  #cheat-toggle { bottom:calc(var(--sab) + 92px) !important; }
  #cheat-panel { bottom:calc(var(--sab) + 126px) !important; max-height:calc(100vh - var(--sab) - 150px) !important; }
  .w-planet { -webkit-user-select:none; user-select:none; cursor:default; padding:4px 0; text-align:center; font-size:8.5px; letter-spacing:.22em; color:rgba(190,205,215,.55); margin-top:1px; }

  .w-nav { position:absolute; left:0; right:0; bottom:0; z-index:20; display:flex; justify-content:space-around; align-items:flex-end;
    padding:18px 18px calc(var(--sab) + 10px); background:linear-gradient(to top, rgba(4,7,11,.85), rgba(4,7,11,0)); pointer-events:none; }
  .w-nav button { pointer-events:auto; position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; width:84px; background:none; border:0; color:#cfdbe4; cursor:pointer; padding:6px 0; }
  .w-nav svg { width:30px; height:30px; padding:9px; box-sizing:content-box; border-radius:50%; background:rgba(10,16,24,.72); border:1px solid rgba(150,190,220,.22); }
  .w-nav button:active svg { border-color:rgba(95,168,232,.8); background:rgba(20,40,60,.8); }
  .w-nav [data-sys="fleet"] svg { color:#7fb8ff; } .w-nav [data-sys="defense"] svg { color:#ff8a78; } .w-nav [data-sys="prospect"] svg { color:#5fe0ff; }
  .w-nav span { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:rgba(200,215,225,.75); }
  .w-dot { display:none; position:absolute; top:6px; right:20px; width:8px; height:8px; border-radius:50%; background:#ffb14a; box-shadow:0 0 8px #ffb14a; }
  .w-dot.on { display:block; }
  .w-center { position:absolute; right:12px; bottom:calc(var(--sab) + 96px); z-index:20; width:38px; height:38px; padding:8px; border-radius:50%; background:rgba(10,16,24,.6); border:1px solid rgba(150,190,220,.2); color:rgba(200,215,225,.8); cursor:pointer; }

  .w-card { position:absolute; left:10px; right:10px; bottom:calc(var(--sab) + 92px); z-index:25; max-height:52%; overflow-y:auto;
    transform:translateY(16px); opacity:0; pointer-events:none; transition:opacity .18s ease, transform .18s ease; }
  .w-card.on { transform:none; opacity:1; pointer-events:auto; }
  .w-card #planet-info { margin:0 !important; background:rgba(8,13,19,.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(120,160,190,.22); }
  .w-card .w-x { position:absolute; top:4px; right:4px; z-index:6; width:44px; height:44px; font-size:28px; }
  .w-card #planet-info .row1 { padding-right:36px; }
  #scr-unit-detail.ud-hero > .stars, #scr-unit-detail.ud-hero > .glow, #scr-unit-detail.ud-hero .bld-banner { display:none; }
  #scr-unit-detail:not(.ud-hero) > .u3d-hero, #scr-unit-detail:not(.ud-hero) .ud-hero-space { display:none; }
  #scr-unit-detail.ud-hero .screen-scroll { position:relative; z-index:2; touch-action:pan-y; }
  #scr-unit-detail.ud-hero .head { text-shadow:0 2px 12px rgba(0,0,0,.8); }
  #scr-building-detail.ud-hero > .stars, #scr-building-detail.ud-hero > .glow, #scr-building-detail.ud-hero #bd-banner { display:none; }
  #scr-building-detail:not(.ud-hero) > .u3d-hero, #scr-building-detail:not(.ud-hero) .ud-hero-space { display:none; }
  #scr-building-detail.ud-hero .screen-scroll { position:relative; z-index:2; touch-action:pan-y; }
  #scr-building-detail.ud-hero .head { text-shadow:0 2px 12px rgba(0,0,0,.8); }
  #scr-building-detail.ud-hero .dash-section-card { background:rgba(8,12,18,.86); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
  #bd-u3d.u3d-hero { margin:0; height:auto; }
  .bd-tiles { margin:0 16px 6px; }
  .wd-tile.lock { opacity:.62; } .wd-tile.lock img { filter:grayscale(.6) brightness(.8); }
  .ud-hero-space { height:50vh; }
  #scr-unit-detail.ud-hero .dash-section-card, #scr-unit-detail.ud-hero .info { background:rgba(8,12,18,.86); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
  .w-screen-x { position:absolute; top:calc(var(--sai) + 8px); right:8px; z-index:60; width:44px; height:44px; border-radius:50%; border:1px solid rgba(150,190,220,.2); background:rgba(8,13,19,.7); color:#dfe8ee; font-size:26px; line-height:1; cursor:pointer; }
  .w-x { width:36px; height:36px; border:0; background:none; color:rgba(220,230,238,.8); font-size:24px; line-height:1; cursor:pointer; }

  .w-pop { position:absolute; z-index:30; min-width:160px; max-width:236px; padding:9px 11px; border-radius:8px; background:rgba(8,13,19,.94); border:1px solid rgba(120,160,190,.25); font-size:11px; color:#dfe8ee; line-height:1.5;
    opacity:0; transform:translateY(-4px); pointer-events:none; transition:opacity .15s, transform .15s; }
  .w-pop.on { opacity:1; transform:none; }
  .w-pop b { font-size:9px; letter-spacing:.14em; }
  .w-pop div { font-family:var(--font-mono, monospace); }
  .w-mut { color:rgba(170,185,195,.7); }

  .w-sheet { position:absolute; inset:0; z-index:40; background:rgba(3,6,10,.45); display:flex; align-items:flex-end; opacity:0; pointer-events:none; transition:opacity .2s ease; }
  .w-sheet.on { opacity:1; pointer-events:auto; }
  .w-sheet-in { width:100%; max-height:82%; overflow-y:auto; background:rgba(7,11,17,.95); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    border-top:1px solid rgba(120,160,190,.25); border-radius:16px 16px 0 0; padding:6px 0 calc(var(--sab) + 16px); transform:translateY(24px); transition:transform .22s ease; }
  .w-sheet.on .w-sheet-in { transform:none; }
  .w-sheet header { display:flex; justify-content:space-between; align-items:center; padding:4px 8px 4px 18px; }
  .w-sheet header span { font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:#cfe1ee; }
  .w-body { padding:0 4px; }
  .w-block { margin:4px 12px 0; padding:12px 14px; border:1px solid rgba(120,160,190,.14); border-radius:10px; background:rgba(255,255,255,.02); }
  .w-block > [onclick], .w-block .dash-cta { pointer-events:none; }
  .w-note { margin:6px 16px 10px; font-size:12px; line-height:1.55; color:#aebdc8; }
  .w-note b { color:#e6f0f4; } .w-k { display:block; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#5fa8e8; }
  .w-acts { display:flex; flex-direction:column; gap:8px; padding:14px 16px 0; }
  .w-links { display:flex; flex-direction:column; margin:8px 16px 0; }
  .w-links button { text-align:left; padding:13px 2px; background:none; border:0; border-bottom:1px solid rgba(120,160,190,.12); color:#d6e2ea; font-size:13px; cursor:pointer; }
  #w-cloud #dash-cloud-slot { margin:0 0 4px; }
  .w-u3d { margin:2px 12px 8px; height:min(46vh, 340px); }
  /* Vue Défense (carte) : scène en décor, onglets d'unités, bilan */
  .w-sheet-in.wd { max-height:90%; }
  .w-sheet-in.wd .wd-stage { height:min(46vh, 420px); margin:2px 10px 10px; border-radius:14px; border:1px solid rgba(255,90,70,.16); }
  .wd-stage::before { content:''; position:absolute; inset:0; z-index:1; pointer-events:none; border-radius:inherit;
    background:radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(2,5,8,.55) 100%), linear-gradient(to bottom, rgba(2,5,8,.35), rgba(2,5,8,0) 22%, rgba(2,5,8,0) 80%, rgba(2,5,8,.45)); }
  .wd-stage .u3d-cap { left:16px; top:14px; }
  .wd-stage .u3d-cap b { font-size:17px; letter-spacing:.28em; }
  .wd-stage .u3d-cap span { font-size:10px; letter-spacing:.26em; margin-top:4px; }
  .wd-stage .u3d-stat { right:16px; top:12px; }
  .wd-stage .u3d-stat b { font-size:30px; }
  .wd-stage .u3d-stat span { font-size:9px; letter-spacing:.2em; }
  .wd-tiles { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin:0 10px 10px; }
  .wd-tile { position:relative; display:flex; align-items:center; gap:6px; min-height:74px; padding:6px 6px 6px 4px; border-radius:11px; cursor:pointer;
    background:linear-gradient(160deg, rgba(20,26,34,.95), rgba(9,13,19,.95)); border:1px solid rgba(120,160,190,.16); color:#d8e3ea; text-align:left; overflow:hidden; }
  .wd-tile img { width:42%; aspect-ratio:1; object-fit:contain; flex:none; filter:drop-shadow(0 4px 8px rgba(0,0,0,.6)); }
  .wd-tile-t { display:flex; flex-direction:column; min-width:0; }
  .wd-tile-t b { font-size:7.6px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; line-height:1.35; color:#e6eef3; }
  .wd-tile-t em { font-style:normal; font:600 17px/1.1 var(--font-mono, monospace); margin-top:4px; color:#f2f6f8; }
  .wd-tile-t i { font-style:normal; font-size:7.5px; letter-spacing:.16em; text-transform:uppercase; color:rgba(190,205,215,.55); }
  .wd-tile.on { border-color:rgba(255,72,52,.85); background:linear-gradient(160deg, rgba(120,20,16,.55), rgba(30,8,8,.9)); box-shadow:0 0 0 1px rgba(255,72,52,.35), 0 0 18px rgba(255,50,30,.22) inset; }
  .wd-stats { margin:0 10px; padding:4px 16px; border:1px solid rgba(120,160,190,.14); border-radius:12px; background:rgba(255,255,255,.02); }
  .wd-row { display:flex; align-items:center; gap:14px; padding:13px 0; border-bottom:1px solid rgba(120,160,190,.1); }
  .wd-row:last-child { border-bottom:0; }
  .wd-row i { width:22px; height:22px; color:#cfe1ee; flex:none; } .wd-row i svg { width:100%; height:100%; }
  .wd-row span { flex:1; font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:#aebdc8; }
  .wd-row b { font:600 15px/1 var(--font-mono, monospace); color:#e6eef3; letter-spacing:.06em; }
  .wd-cta { display:flex; align-items:center; justify-content:center; gap:12px; width:calc(100% - 20px); margin:14px 10px 0; padding:17px 18px; border-radius:14px; cursor:pointer;
    background:rgba(40,190,200,.06); border:1.5px solid rgba(70,220,225,.75); color:#5fe3e6; box-shadow:0 0 18px rgba(60,220,225,.18), inset 0 0 14px rgba(60,220,225,.08); }
  .wd-cta i { width:20px; height:20px; } .wd-cta i svg { width:100%; height:100%; }
  .wd-cta span { flex:1; text-align:center; font-size:12px; font-weight:600; letter-spacing:.28em; text-transform:uppercase; }
  .wd-cta em { font-style:normal; font-size:22px; line-height:1; }
  .wd-more { display:block; margin:10px auto 0; padding:8px 14px; background:none; border:0; color:rgba(190,205,215,.6); font-size:10px; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; }
  #ud-u3d:not(.u3d-hero) { margin:0 16px 12px; height:min(58vh, 440px); }
  #ud-u3d.u3d-hero { margin:0; height:auto; }
`;
document.head.appendChild(css);

window.SBHome = SBHome;
const boot = () => { try { SBHome.init(); } catch (e) { console.warn('[SBHome]', e); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
