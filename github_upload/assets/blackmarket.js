/* Starbyte — Blackmarket v0 (31/10/2026) — GDD : claude/starbyte_GDD_blackmarket.md
   Aperçu du catalogue : les 7 vaisseaux payants dans leur vitrine validée (assets/blackmarket/<id>.html,
   modèle assets/3d/bm/<id>.glb.gz). Pas encore de paiement ni de marchand IA.
   Réservé au compte d'Adrien (_sbDevAllowed) tant qu'il n'a pas validé : entrée en haut de l'écran Commerce.
   Les prix et plafonds affichés ici sont indicatifs : la vente réelle passera par un catalogue serveur. */
(function () {
  'use strict';

  const CATS = {
    sport: {
      label: 'Cuirassé Sport', plural: 'Cuirassés Sport', price: 12, cap: 10,
      rule: 'Cuirassé T3 · +20 % vitesse et puissance de feu · réparation plus lente',
    },
    dread: {
      label: 'Dreadnought', plural: 'Dreadnoughts', price: 20, cap: 3,
      rule: 'Deux fois un cuirassé T3',
    },
  };
  const SHIPS = [
    { id: 'fulgurant',    name: 'Le Fulgurant',   cat: 'sport', accent: '#f2c230', line: 'Lance jaune, nacelles en lames' },
    { id: 'triumvirat',   name: 'Le Triumvirat',  cat: 'sport', accent: '#3fb3a6', line: 'Trois coques en V ouvert' },
    { id: 'arc-ecarlate', name: "L'Arc Écarlate", cat: 'sport', accent: '#c8243a', line: 'Coque en croissant, cornes de proue' },
    { id: 'vertige',      name: 'Le Vertige',     cat: 'sport', accent: '#d08a4e', line: 'Lames en croissant, canon-aiguille' },
    { id: 'requiem',      name: 'Le Requiem',     cat: 'dread', accent: '#e6e1d6', line: 'Proue fendue en croix, trois tours' },
    { id: 'souverain',    name: 'Le Souverain',   cat: 'dread', accent: '#c9a45a', line: 'Château en pagode, quatre cerclages' },
    { id: 'brise-monde',  name: 'Le Brise-Monde', cat: 'dread', accent: '#e0682c', line: "Arme de proue : anomalie d'antimatière" },
  ];
  const LINES = [
    'Ouais. Tu veux quoi ?',
    "Regarde, mais touche pas. Y en a pas deux pareils dans l'amas.",
    "Pas de facture, pas de questions. C'est comme ça qu'on bosse ici.",
    'Tu négocies ? Retourne compter tes cailloux au match-3.',
    "T'as vu l'acier ? Ça, ça se construit pas dans ton petit chantier.",
  ];
  const VERSION = '20261031';

  const css = `
#bm-root { position: fixed; inset: 0; z-index: 9000; background: #07090b; color: #e6edf2; font-family: 'Space Grotesk', system-ui, sans-serif;
  display: none; -webkit-tap-highlight-color: transparent; }
#bm-root.on { display: block; }
#bm-root .bm-cat { position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: calc(env(safe-area-inset-top) + 20px) 16px calc(env(safe-area-inset-bottom) + 96px);
  background: radial-gradient(120% 60% at 50% 0%, rgba(200,36,58,.10), transparent 60%), #07090b; }
#bm-root .bm-eyebrow { font: 500 10px 'JetBrains Mono', monospace; letter-spacing: .18em; color: #8d98a3; text-transform: uppercase; }
#bm-root h1 { margin: 4px 0 2px; font-size: 30px; font-weight: 600; letter-spacing: .04em; }
#bm-root .bm-dev { font: 400 10px 'JetBrains Mono', monospace; color: #c9a45a; margin-bottom: 18px; }
#bm-root .bm-merchant { display: flex; gap: 12px; align-items: flex-start; margin: 0 0 22px; }
#bm-root .bm-face { flex: 0 0 44px; height: 44px; border-radius: 10px; background: #151a1f; border: 1px solid #2a3138; display: grid; place-items: center; }
#bm-root .bm-say { background: #12161a; border: 1px solid #262d33; border-radius: 4px 14px 14px 14px; padding: 10px 13px; font-size: 15px; line-height: 1.4; }
#bm-root .bm-say small { display: block; font: 400 10px 'JetBrains Mono', monospace; color: #6f7a84; margin-top: 4px; letter-spacing: .06em; }
#bm-root h2 { font-size: 13px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; margin: 22px 0 2px; }
#bm-root .bm-rule { font-size: 12px; color: #8d98a3; margin-bottom: 10px; }
#bm-root .bm-card { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; color: inherit; font: inherit;
  background: linear-gradient(90deg, rgba(255,255,255,.035), rgba(255,255,255,.01)); border: 1px solid #222930; border-radius: 10px;
  padding: 14px 14px 14px 18px; margin-bottom: 8px; cursor: pointer; overflow: hidden; }
#bm-root .bm-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--a); }
#bm-root .bm-card:active { background: rgba(255,255,255,.06); }
#bm-root .bm-card .t { flex: 1; min-width: 0; }
#bm-root .bm-card b { display: block; font-size: 17px; font-weight: 600; }
#bm-root .bm-card span { display: block; font-size: 12px; color: #8d98a3; margin-top: 2px; }
#bm-root .bm-price { font: 500 14px 'JetBrains Mono', monospace; color: #f1d27a; white-space: nowrap; }
#bm-root .bm-chev { color: #6f7a84; font-size: 20px; }
#bm-root .bm-foot { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: linear-gradient(transparent, #07090b 40%); }
#bm-root .bm-btn { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #2c343b; background: #12161a; color: #e6edf2;
  font: 600 13px 'Space Grotesk', sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
#bm-root .bm-ship { position: absolute; inset: 0; display: none; background: #000; }
#bm-root .bm-ship.on { display: block; }
#bm-root iframe { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 0; background: #000; }
#bm-root .bm-top { position: absolute; left: 0; right: 0; top: 0; padding: calc(env(safe-area-inset-top) + 10px) 12px 10px; display: flex;
  align-items: center; gap: 10px; pointer-events: none; }
#bm-root .bm-back { pointer-events: auto; border: 1px solid rgba(255,255,255,.18); background: rgba(7,9,11,.6); color: #e6edf2; border-radius: 20px;
  padding: 8px 14px; font: 500 13px 'Space Grotesk', sans-serif; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); cursor: pointer; }
#bm-root .bm-sheet { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(9,12,15,.86); -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px); border-top: 1px solid #262d33; border-radius: 16px 16px 0 0;
  padding: 8px 16px calc(env(safe-area-inset-bottom) + 14px); transition: transform .25s ease; }
#bm-root .bm-sheet.min { transform: translateY(calc(100% - 92px - env(safe-area-inset-bottom))); }
#bm-root .bm-grip { width: 40px; height: 4px; border-radius: 2px; background: #3a434b; margin: 2px auto 10px; }
#bm-root .bm-sheet .cat { font: 500 10px 'JetBrains Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: var(--a); }
#bm-root .bm-sheet .nm { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 2px 0 10px; }
#bm-root .bm-sheet .nm b { font-size: 22px; font-weight: 600; }
#bm-root .bm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 10px; }
#bm-root .bm-stats div { background: rgba(255,255,255,.035); border: 1px solid #222930; border-radius: 8px; padding: 7px 7px 6px; min-width: 0; }
#bm-root .bm-stats i { display: block; font-style: normal; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #8d98a3; }
#bm-root .bm-stats b { display: block; font: 500 13px 'JetBrains Mono', monospace; white-space: nowrap; }
#bm-root .bm-stats em { display: block; font-style: normal; font: 400 10px 'JetBrains Mono', monospace; color: #7fbf7a; }
#bm-root .bm-stats em.neg { color: #d9845a; }
#bm-root .bm-stats em.neu { color: #6f7a84; }
#bm-root .bm-note { font-size: 12px; color: #a7b1ba; line-height: 1.45; margin-bottom: 12px; }
#bm-root .bm-buy { width: 100%; padding: 15px; border-radius: 10px; border: 0; background: #3a2f16; color: #8c7a4e;
  font: 600 14px 'Space Grotesk', sans-serif; letter-spacing: .08em; text-transform: uppercase; }
#bm-root .bm-buy-sub { text-align: center; font: 400 10px 'JetBrains Mono', monospace; color: #6f7a84; margin-top: 6px; }
`;

  const fmt = (n) => Math.round(n).toLocaleString('fr-CH').replace(/ |\s/g, ' ');
  const chf = (n) => 'CHF ' + n + '.–';
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const allowed = () => { try { return typeof _sbDevAllowed === 'function' && _sbDevAllowed(); } catch (e) { return false; } };

  function baseT3() {
    try { const t = SHIP_TIERS.cuirasse[3]; return { atk: t.atk, def: t.def }; } catch (e) { return { atk: 13500, def: 13500 }; }
  }
  // Règles du GDD (§4-5) — v0 : même stats pour tous les modèles d'une catégorie
  function statsOf(cat) {
    const b = baseT3();
    if (cat === 'sport') return [
      { k: 'Attaque', v: b.atk * 1.2, d: '+20 %' }, { k: 'Défense', v: b.def, d: '=' },
      { k: 'Vitesse', v: null, txt: '×1,2', d: '+20 %' }, { k: 'Réparation', v: null, txt: 'lente', d: 'contrepartie', neg: true },
    ];
    return [
      { k: 'Attaque', v: b.atk * 2, d: '×2' }, { k: 'Défense', v: b.def * 2, d: '×2' },
      { k: 'Vitesse', v: null, txt: '×1', d: 'standard' }, { k: 'Réparation', v: null, txt: '×1', d: 'standard' },
    ];
  }

  let root = null, line = 0;
  function build() {
    if (root) return root;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'bm-root';
    root.innerHTML = `<div class="bm-cat"></div><div class="bm-foot"><button class="bm-btn" data-close>← Retour</button></div><div class="bm-ship"></div>`;   // pied hors du défilement : reste collé en bas
    document.body.appendChild(root);
    return root;
  }

  function renderCatalog() {
    const face = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#8d98a3" stroke-width="1.4" aria-hidden="true">
      <circle cx="13" cy="9.5" r="4.5"/><path d="M4.5 23c1.2-4.6 4.6-7 8.5-7s7.3 2.4 8.5 7"/><path d="M8.6 8.4h8.8" stroke="#c9a45a"/></svg>`;
    const section = (cat) => {
      const c = CATS[cat];
      return `<h2>${c.plural}</h2><div class="bm-rule">${c.rule} · max ${c.cap} par joueur</div>` +
        SHIPS.filter(s => s.cat === cat).map(s => `
          <button class="bm-card" style="--a:${s.accent}" data-ship="${s.id}">
            <div class="t"><b>${esc(s.name)}</b><span>${esc(s.line)}</span></div>
            <div class="bm-price">${chf(c.price)}</div><div class="bm-chev">›</div>
          </button>`).join('');
    };
    root.querySelector('.bm-cat').innerHTML = `
      <div class="bm-eyebrow">Marché noir · Docks francs</div>
      <h1>BLACKMARKET</h1>
      <div class="bm-dev">Aperçu réservé à ton compte · paiement pas encore branché</div>
      <div class="bm-merchant"><div class="bm-face">${face}</div>
        <div class="bm-say">${esc(LINES[line % LINES.length])}<small>PAULINE · REINE DU NOIR</small></div></div>
      ${section('sport')}${section('dread')}`;
    line++;
  }

  function openShip(id) {
    const s = SHIPS.find(x => x.id === id); if (!s) return;
    const c = CATS[s.cat];
    const pane = root.querySelector('.bm-ship');
    const stats = statsOf(s.cat).map(x => `<div><i>${x.k}</i><b>${x.v != null ? fmt(x.v) : x.txt}</b>${x.d ? `<em class="${x.neg ? 'neg' : /^(=|standard)$/.test(x.d) ? 'neu' : ''}">${x.d}</em>` : ''}</div>`).join('');
    pane.innerHTML = `
      <iframe src="assets/blackmarket/${s.id}.html?embed&v=${VERSION}" title="${esc(s.name)} en 3D" allow="fullscreen"></iframe>
      <div class="bm-top"><button class="bm-back" data-cat>‹ Catalogue</button></div>
      <div class="bm-sheet" style="--a:${s.accent}">
        <div class="bm-grip" data-grip></div>
        <div class="cat">${c.label}</div>
        <div class="nm"><b>${esc(s.name)}</b><span class="bm-price">${chf(c.price)}</span></div>
        <div class="bm-stats">${stats}</div>
        <div class="bm-note">Comparé à un cuirassé T3 construit. Jamais détruit : vaincu, il est mis hors service et répare à quai 24 h minimum.
          Max ${c.cap} ${c.plural.toLowerCase()} par joueur, tous modèles confondus.</div>
        <button class="bm-buy" disabled>Acheter · ${chf(c.price)}</button>
        <div class="bm-buy-sub">Paiement Stripe pas encore branché</div>
      </div>`;
    pane.classList.add('on');
    fitView();
  }
  // La vitrine s'arrête au bord haut du tiroir : le vaisseau se centre dans la partie visible
  // (le tiroir arrondi chevauche de 16 px). Tiroir replié → la vitrine reprend presque tout l'écran.
  function fitView() {
    const pane = root && root.querySelector('.bm-ship.on'); if (!pane) return;
    const fr = pane.querySelector('iframe'), sh = pane.querySelector('.bm-sheet'); if (!fr || !sh) return;
    const r = sh.getBoundingClientRect(), H = window.innerHeight;
    fr.style.height = Math.max(200, Math.round(r.top + 16)) + 'px';
    if (H - r.top < 40) fr.style.height = H + 'px';
  }
  function closeShip() {
    const pane = root.querySelector('.bm-ship');
    pane.classList.remove('on');
    pane.innerHTML = '';                            // libère la vitrine (contexte WebGL + modèle)
  }

  function open() {
    if (!allowed()) return;
    build(); renderCatalog(); closeShip();
    root.classList.add('on');
  }
  function close() { if (!root) return; closeShip(); root.classList.remove('on'); }

  document.addEventListener('click', (e) => {
    if (!root || !root.classList.contains('on')) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    const card = t.closest('[data-ship]'); if (card) return openShip(card.dataset.ship);
    if (t.closest('[data-cat]')) return closeShip();
    if (t.closest('[data-close]')) return close();
    if (t.closest('[data-grip]')) { const sh = root.querySelector('.bm-sheet'); if (sh) { sh.classList.toggle('min'); setTimeout(fitView, 270); } }
  });

  // Entrée provisoire : carte en haut de l'écran Commerce, visible seulement sur le compte d'Adrien
  function entry() {
    const scr = document.getElementById('scr-commerce');
    const scroll = scr && scr.querySelector('.screen-scroll');
    if (!scroll) return;
    let el = document.getElementById('bm-entry');
    if (!allowed()) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'bm-entry';
    el.style.cssText = 'margin:0 16px 10px;padding:12px 14px;background:linear-gradient(90deg,rgba(200,36,58,.14),rgba(200,36,58,.03));border:1px solid rgba(200,36,58,.35);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px';
    el.innerHTML = '<div style="flex:1;min-width:0"><div style="font-size:13px;color:#e6f0ff;font-weight:600;letter-spacing:.06em">BLACKMARKET</div>' +
      '<div style="font-size:10px;color:var(--mut);margin-top:2px">Aperçu du catalogue · visible seulement par toi</div></div><div style="color:var(--mut);font-size:14px">›</div>';
    el.addEventListener('click', open);
    const banner = document.getElementById('commerce-banner');
    scroll.insertBefore(el, banner ? banner.nextSibling : scroll.firstChild);
  }
  if (typeof window.renderCommerceScreen === 'function') {
    const orig = window.renderCommerceScreen;
    window.renderCommerceScreen = function () { const r = orig.apply(this, arguments); try { entry(); } catch (e) {} return r; };
  }

  window.addEventListener('resize', () => { try { fitView(); } catch (e) {} });
  window.SBBlackmarket = { open, close, ships: SHIPS, cats: CATS };
})();
