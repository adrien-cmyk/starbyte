/* Starbyte — Blackmarket v0 (31/10/2026) — GDD : claude/starbyte_GDD_blackmarket.md
   Aperçu du catalogue : les 7 vaisseaux payants dans leur vitrine validée (assets/blackmarket/<id>.html,
   modèle assets/3d/bm/<id>.glb.gz). Pas encore de paiement ni de marchand IA.
   Réservé au compte d'Adrien (_sbDevAllowed) tant qu'il n'a pas validé : entrée en haut de l'écran Commerce.
   Les prix et plafonds affichés ici sont indicatifs : la vente réelle passera par un catalogue serveur. */
(function () {
  'use strict';

  const CATS = {
    sport: {
      label: 'Cuirassé de Héro', plural: 'Cuirassés de Héro', price: 12, cap: 10,
      rule: 'Cuirassé T3 · +20 % vitesse et puissance de feu · réparation plus lente',
    },
    dread: {
      label: 'Dreadnought', plural: 'Dreadnoughts', price: 20, cap: 3,
      rule: 'Deux fois un cuirassé T3',
    },
    arche: {
      label: 'TAXI', plural: 'Édition légendaire', price: 150, cap: 1,
      rule: 'Transport par Arche eXtra-Interstellaire · 100 exemplaires numérotés · un par joueur',
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
    { id: 'taxi',         name: 'TAXI',           cat: 'arche', accent: '#b98cff', line: 'Perce la trame et te dépose un monde. Une fois.' },
  ];
  let taxiLeft = null;                            // exemplaires restants (serveur)
  const LINES = [
    'Ouais. Tu veux quoi ?',
    "Regarde, mais touche pas. Y en a pas deux pareils dans l'amas.",
    "Pas de facture, pas de questions. C'est comme ça qu'on bosse ici.",
    'Tu négocies ? Retourne compter tes cailloux au match-3.',
    "T'as vu l'acier ? Ça, ça se construit pas dans ton petit chantier.",
  ];
  const VERSION = '20261031';
  // Serveur (schema_mp_v31_blackmarket.sql + fonctions bm-checkout / bm-webhook)
  const SB = 'https://elupnpdcblztpfywnhjl.supabase.co';
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';
  let owned = (() => { try { return JSON.parse(localStorage.getItem('bm_owned_cache') || '{}') || {}; } catch (e) { return {}; } })();   // item_id → nombre possédé (payé, non remboursé)
  function token() {
    try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) { return null; }
  }
  async function call(path, body) {
    const tok = token(); if (!tok) throw new Error('not_signed_in');
    const r = await fetch(SB + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + tok }, body: JSON.stringify(body || {}) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const er = new Error((j && (j.error || j.message)) || ('http_' + r.status)); er.data = j; throw er; }
    return j;
  }
  // un vaisseau acheté = une « unité » (id de l'achat) : { id, item, cat, down (fin de mise hors service, ms) }
  let units = (() => { try { return JSON.parse(localStorage.getItem('bm_units_cache') || '[]') || []; } catch (e) { return []; } })();
  async function loadOwned() {
    try {
      const st = await call('/rest/v1/rpc/bm_state', {});
      units = (st && st.owned || []).filter(o => o && o.id && SHIPS.some(x => x.id === o.item_id))
        .map(o => ({ id: o.id, item: o.item_id, cat: o.category, down: o.disabled_until ? new Date(o.disabled_until).getTime() : 0,
          ed: o.edition_no || null, used: o.taxi_used_at ? new Date(o.taxi_used_at).getTime() : 0, addr: o.taxi_address || null, showPseudo: !!o.show_pseudo }));
      if (st && typeof st.taxi_left === 'number') taxiLeft = st.taxi_left;
      owned = {}; units.forEach(u => { owned[u.item] = (owned[u.item] || 0) + 1; });
      try { localStorage.setItem('bm_owned_cache', JSON.stringify(owned)); localStorage.setItem('bm_units_cache', JSON.stringify(units)); } catch (e) {}
    } catch (e) { /* v31 pas encore lancé : rien à afficher */ }
  }

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
#bm-root .bm-card .bm-th { flex: 0 0 58px; height: 58px; border-radius: 8px; background: #000 center/cover no-repeat; border: 1px solid #222930; }
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
#bm-root .bm-buy:not([disabled]) { background: #c9a45a; color: #15110a; cursor: pointer; }
#bm-root .bm-buy-sub.err { color: #d9845a; }
#bm-root .bm-own { font: 500 10px 'JetBrains Mono', monospace; color: #7fbf7a; letter-spacing: .08em; margin-top: 3px; }
#bm-root .bm-buy-sub { text-align: center; font: 400 10px 'JetBrains Mono', monospace; color: #6f7a84; margin-top: 6px; }
`;

  const STAR = (sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-6 3.3 1.3-6.6-4.9-4.6 6.7-.8z" fill="#f1d27a" stroke="#7a5a1c" stroke-width="1"/></svg>`;
  const thumb = (id) => `assets/blackmarket/thumbs/${id}.jpg?v=20261102`;
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
    if (cat === 'arche') return [
      { k: 'Largage', v: null, txt: '1×', d: 'à l\'aveugle' }, { k: 'Voyage', v: null, txt: '1 h', d: 'trame percée' },
      { k: 'Planète', v: null, txt: 'jardin', d: 'luxuriante' }, { k: 'Bouclier', v: null, txt: '72 h', d: 'à l\'arrivée' },
    ];
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
      return `<h2>${c.plural}</h2><div class="bm-rule">${c.rule}${cat === 'arche' ? (taxiLeft != null ? ` · <b style="color:#d9c2ff">${taxiLeft} restant${taxiLeft > 1 ? 's' : ''}</b>` : '') : ` · max ${c.cap} par joueur`}</div>` +
        SHIPS.filter(s => s.cat === cat).map(s => `
          <button class="bm-card" style="--a:${s.accent}" data-ship="${s.id}">
            <div class="bm-th" style="background-image:url('${thumb(s.id)}')"></div>
            <div class="t"><b>${esc(s.name)}</b><span>${esc(s.line)}</span>${owned[s.id] ? `<div class="bm-own">À TOI ×${owned[s.id]}</div>` : ''}</div>
            <div class="bm-price">${chf(c.price)}</div><div class="bm-chev">›</div>
          </button>`).join('');
    };
    root.querySelector('.bm-cat').innerHTML = `
      <div class="bm-eyebrow">Marché noir · Docks francs</div>
      <h1>BLACKMARKET</h1>
      <div class="bm-dev">Aperçu réservé à ton compte · paiement en mode test</div>
      <div class="bm-merchant"><div class="bm-face">${face}</div>
        <div class="bm-say">${esc(LINES[line % LINES.length])}<small>PAULINE · REINE DU NOIR</small></div></div>
      ${section('sport')}${section('dread')}${section('arche')}`;
    line++;
  }

  let fromFleet = false;
  function mineStatus(item) {
    try { const us = units.filter(u => u.item === item); if (!us.length) return ''; return us.map(u => unitStatus(u).txt).join(' · '); } catch (e) { return ''; }
  }
  function openShip(id, mine) {
    const s = SHIPS.find(x => x.id === id); if (!s) return;
    const c = CATS[s.cat];
    const tx = s.cat === 'arche' ? units.find(u => u.cat === 'arche') : null;   // mon TAXI (s'il est à moi)
    const pane = root.querySelector('.bm-ship');
    const stats = statsOf(s.cat).map(x => `<div><i>${x.k}</i><b>${x.v != null ? fmt(x.v) : x.txt}</b>${x.d ? `<em class="${x.neg ? 'neg' : /^(=|standard)$/.test(x.d) ? 'neu' : ''}">${x.d}</em>` : ''}</div>`).join('');
    pane.innerHTML = `
      <iframe src="assets/blackmarket/${s.id}.html?embed${mine && tx && tx.used ? '&dead' : ''}&v=${VERSION}" title="${esc(s.name)} en 3D" allow="fullscreen"></iframe>
      <div class="bm-top"><button class="bm-back" ${mine ? 'data-close' : 'data-cat'}>‹ ${mine ? 'Flotte' : 'Catalogue'}</button></div>
      <div class="bm-sheet" style="--a:${s.accent}">
        <div class="bm-grip" data-grip></div>
        <div class="cat">${mine ? `${STAR(11)} Vaisseau d'exception · ` : ''}${s.cat === 'arche' ? 'Édition légendaire' : c.label}</div>
        <div class="nm"><b>${esc(s.name)}${tx && tx.ed ? ` <span style="font:500 13px 'JetBrains Mono',monospace;color:#d9c2ff">n° ${String(tx.ed).padStart(3, '0')} / 100</span>` : ''}</b><span class="bm-price">${mine ? (s.cat === 'arche' ? '' : `À toi ×${owned[s.id] || 1}`) : chf(c.price)}</span></div>
        <div class="bm-stats">${stats}</div>
        <div class="bm-note">${s.cat === 'arche'
          ? `Transport par Arche eXtra-Interstellaire. Tu choisis un secteur, même inconnu : le TAXI perce la trame et te crée un monde dans un système vide, tiré au sort. Tu ne sais où qu'en arrivant. Planète-jardin luxuriante, 72 h de protection, aucune ressource. Un seul largage ; ensuite, il reste dans ta flotte, coque morte. 100 exemplaires numérotés, un par joueur.`
          : `Comparé à un cuirassé T3 construit. Jamais détruit : vaincu, il est mis hors service et répare à quai 24 h minimum. Max ${c.cap} ${c.plural.toLowerCase()} par joueur, tous modèles confondus.`}</div>
        ${mine ? (tx && !tx.used && !taxiFlight() ? `<button class="bm-buy" data-taxi style="background:#5b3fa0;color:#f1e8ff">Larguer le TAXI</button><div class="bm-buy-sub">Une seule fois · à l'aveugle</div>` : `<div class="bm-buy-sub" style="text-align:left;color:#a7b1ba">${esc(mineStatus(s.id))}</div>`) : (s.cat === 'arche' && taxiLeft === 0 ? `<div class="bm-buy-sub">Édition épuisée. Les 100 TAXI ont trouvé preneur.</div>` : `<button class="bm-buy" data-buy="${s.id}">Acheter · ${chf(c.price)}</button>
        <div class="bm-buy-sub">${owned[s.id] ? `Tu en as déjà ${owned[s.id]} · ` : ''}Paiement par Stripe · mode test</div>`)}
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
    loadOwned().then(() => { if (root.classList.contains('on') && !root.querySelector('.bm-ship.on')) renderCatalog(); });
    root.classList.add('on');
  }
  function close() { if (!root) return; closeShip(); root.classList.remove('on'); }

  document.addEventListener('click', (e) => {
    if (!root || !root.classList.contains('on')) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    const card = t.closest('[data-ship]'); if (card) return openShip(card.dataset.ship);
    const buy = t.closest('[data-buy]'); if (buy) return startBuy(buy);
    if (t.closest('[data-taxi]')) return taxiPicker();
    const sec = t.closest('[data-sector]'); if (sec) return taxiConfirm(sec.dataset.sector);
    if (t.closest('[data-taxigo]')) return taxiDrop(t.closest('[data-taxigo]').dataset.taxigo);
    if (t.closest('[data-taxiback]')) return taxiPicker();
    if (t.closest('[data-cat]')) return closeShip();
    if (t.closest('[data-close]')) { close(); if (fromFleet) { fromFleet = false; try { renderFleetScreen(); } catch (e) {} } return; }
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

  async function startBuy(btn) {
    const sub = btn.parentNode.querySelector('.bm-buy-sub');
    const say = (txt, err) => { if (sub) { sub.textContent = txt; sub.classList.toggle('err', !!err); } };
    btn.disabled = true; say('Pauline prépare la facture…');
    try {
      const r = await call('/functions/v1/bm-checkout', { item_id: btn.dataset.buy });
      if (r && r.url) {
        try { localStorage.setItem('bm_pending', JSON.stringify({ item: btn.dataset.buy, n: owned[btn.dataset.buy] || 0, at: Date.now() })); } catch (e) {}
        location.href = r.url; return;
      }
      throw new Error('no_url');
    } catch (e) {
      const m = e.message;
      say(m === 'sold_out' ? 'Édition épuisée : les 100 TAXI sont partis.' : m === 'cap_reached' ? `Plafond atteint : ${e.data && e.data.cap} ${(e.data && e.data.label || '').toLowerCase()} max. « T'en as assez, non ? »`
        : m === 'not_signed_in' ? 'Connecte ton compte (cloud) pour acheter.'
        : m === 'stripe_not_configured' ? 'Clé Stripe absente côté serveur (secret STRIPE_SECRET_KEY).'
        : 'Paiement indisponible pour le moment (' + m + ').', true);
      btn.disabled = false;
    }
  }
  // Retour de Stripe : ?bm=ok&item=… ou ?bm=annule
  (function back() {
    try {
      const u = new URL(location.href), st = u.searchParams.get('bm'); if (!st) return;
      const item = SHIPS.find(x => x.id === u.searchParams.get('item'));
      u.searchParams.delete('bm'); u.searchParams.delete('item');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
      // App installée : iOS ouvre Stripe dans une fenêtre à part, qui revient ici SANS la partie du joueur
      // (pas de session dans cette fenêtre). On n'y lance pas le jeu : on dit de fermer la fenêtre.
      if (!token()) { sheetNotice(st === 'ok', item); return; }
      try { localStorage.removeItem('bm_pending'); } catch (e) {}
      const msg = st === 'ok' ? `Paiement reçu. ${item ? item.name : 'Ton vaisseau'} est à toi. Pauline : « Fais-en bon usage. »` : 'Achat annulé. Pauline : « Reviens quand t\'auras les moyens. »';
      const show = (n) => { if (typeof toast === 'function') toast(msg); else if (n < 20) setTimeout(() => show(n + 1), 500); };
      setTimeout(() => show(0), 2500);
    } catch (e) {}
  })();
  function sheetNotice(ok, item) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#07090b;color:#e6edf2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:"Space Grotesk",system-ui,sans-serif';
    d.innerHTML = `<div style="font:500 11px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#8d98a3;text-transform:uppercase">Blackmarket</div>
      <div style="font-size:26px;font-weight:600;margin:10px 0 14px">${ok ? 'Paiement reçu' : 'Achat annulé'}</div>
      <div style="font-size:16px;line-height:1.5;color:#c7d0d8;max-width:30ch">${ok ? `${item ? esc(item.name) : 'Ton vaisseau'} t'attend au Blackmarket.` : 'Rien n\'a été débité.'}<br><br>
      Ferme cette fenêtre (la croix en haut à gauche) pour retourner dans Starbyte.</div>
      <div style="margin-top:22px;font-size:14px;color:#c9a45a">Pauline : « ${ok ? 'Fais-en bon usage.' : 'Reviens quand t\'auras les moyens.'} »</div>`;
    const put = () => document.body ? document.body.appendChild(d) : setTimeout(put, 50);
    put();
  }
  // Retour dans l'app après la fenêtre Stripe : on recharge ce que le joueur possède et on confirme l'achat
  async function checkPending() {
    let p = null; try { p = JSON.parse(localStorage.getItem('bm_pending') || 'null'); } catch (e) {}
    if (!p || Date.now() - p.at > 3600e3) { if (p) try { localStorage.removeItem('bm_pending'); } catch (e) {} return; }
    await loadOwned();
    if ((owned[p.item] || 0) > p.n) {
      try { localStorage.removeItem('bm_pending'); } catch (e) {}
      const it = SHIPS.find(x => x.id === p.item);
      if (typeof toast === 'function') toast(`Paiement reçu. ${it ? it.name : 'Ton vaisseau'} est à toi. Pauline : « Fais-en bon usage. »`);
      if (root && root.classList.contains('on')) { if (root.querySelector('.bm-ship.on')) openShip(p.item); else renderCatalog(); }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => checkPending().catch(() => {}), 800); });
  window.addEventListener('focus', () => setTimeout(() => checkPending().catch(() => {}), 800));
  function openOwned(id) {
    build(); closeShip(); root.classList.add('on'); fromFleet = true;
    root.querySelector('.bm-cat').innerHTML = '';
    openShip(id, true);
  }
  // ── Vaisseaux d'exception dans la flotte (v32) ──
  // Chaque unité vit à la capitale tant qu'aucune flotte ne l'a emmenée ailleurs (G.fleet.bmLoc[id] = planète).
  // Elle entre dans une flotte (fleet.premium = [{ pid, item, cat }]), part en mission, défend en orbite
  // quand sa flotte est déployée (même règle que les autres vaisseaux), n'est jamais détruite : défaite → hors service.
  const here = () => (typeof G !== 'undefined' && G.activeWorld) || 'home';
  const isDown = (u) => !!(u && u.down && u.down > Date.now());
  const unitOf = (pid) => units.find(u => u.id === pid);
  const shipOf = (u) => SHIPS.find(x => x.id === (u && u.item));
  function locs() { try { if (!G.fleet.bmLoc) G.fleet.bmLoc = {}; return G.fleet.bmLoc; } catch (e) { return {}; } }
  function fleetsWithPremium() { try { return (G.fleet.prepared || []).filter(f => Array.isArray(f.premium) && f.premium.length); } catch (e) { return []; } }
  function fleetOfUnit(pid) { return fleetsWithPremium().find(f => f.premium.some(p => p.pid === pid)) || null; }
  function trackLoc() { const L = locs(); for (const f of fleetsWithPremium()) for (const p of f.premium) L[p.pid] = f.world || 'home'; }
  function unitAtk(cat) { const b = baseT3(); return cat === 'dread' ? b.atk * 2 : b.atk * 1.2; }
  function unitDef(cat) { const b = baseT3(); return cat === 'dread' ? b.def * 2 : b.def; }
  function hoursLeft(u) { const h = Math.ceil((u.down - Date.now()) / 3600e3); return h <= 1 ? 'moins d\'1 h' : h + ' h'; }
  function unitStatus(u) {
    if (u && u.cat === 'arche') {
      const fl = taxiFlight();
      if (fl) return { txt: 'En route · ' + Math.max(1, Math.ceil((fl.arriveAt - Date.now()) / 60000)) + ' min', col: '#d9c2ff' };
      return u.used ? { txt: 'Coque morte · travail accompli', col: '#8d98a3' } : { txt: 'Prêt à larguer', col: '#d9c2ff' };
    }
    if (isDown(u)) return { txt: 'Hors service · ' + hoursLeft(u), col: '#d9845a' };
    const f = fleetOfUnit(u.id);
    if (f) return { txt: (f.status === 'in_mission' ? 'En mission' : f.status === 'deployed' ? 'En orbite' : 'En flotte') + ' · ' + f.name, col: '#b8d0ff' };
    return { txt: 'À quai', col: '#c9a45a' };
  }
  function freeHere(exceptFleetId) {
    const L = locs(), w = here();
    return units.filter(u => u.cat !== 'arche' && !isDown(u) && (L[u.id] || 'home') === w && !fleetsWithPremium().some(f => f.id !== exceptFleetId && f.premium.some(p => p.pid === u.id)));
  }
  const thumbBox = (id, sz) => `<div style="position:relative;flex:0 0 ${sz}px;height:${sz}px;border-radius:8px;background:#000 url('${thumb(id)}') center/cover;border:1px solid rgba(241,210,122,.45)">
      <div style="position:absolute;top:-7px;right:-7px;width:22px;height:22px;border-radius:50%;background:#15110a;border:1px solid rgba(241,210,122,.6);display:grid;place-items:center">${STAR(14)}</div></div>`;
  function fleetSection() {
    const list = document.getElementById('fleet-stationed-list'); if (!list) return;
    const label = list.previousElementSibling;
    let box = document.getElementById('bm-fleet');
    trackLoc();
    const L = locs(), w = here();
    const mine = units.filter(u => shipOf(u) && ((L[u.id] || 'home') === w || (fleetOfUnit(u.id) && (fleetOfUnit(u.id).world || 'home') === w)));
    if (!mine.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'bm-fleet';
      (label && label.classList.contains('section-label') ? label : list).before(box);
      box.addEventListener('click', (e) => { const c = e.target.closest && e.target.closest('[data-own]'); if (c) openOwned(c.dataset.own); });
    }
    box.innerHTML = `<div class="section-label"><span>Vaisseaux d'exception</span></div>` + mine.map(u => {
      const s = shipOf(u), c = CATS[s.cat], st = unitStatus(u);
      return `<div data-own="${s.id}" style="margin:0 16px 8px;padding:10px 12px 10px 10px;display:flex;align-items:center;gap:12px;cursor:pointer;${isDown(u) ? 'opacity:.72;' : ''}
          background:linear-gradient(90deg,rgba(241,210,122,.09),rgba(241,210,122,.02));border:1px solid rgba(241,210,122,.32);border-radius:10px">
        ${thumbBox(s.id === 'taxi' && u.used ? 'taxi-dead' : s.id, 64)}
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:#f3ead2">${esc(s.name)}${u.ed ? ` <span style="font:500 11px 'JetBrains Mono',monospace;color:#d9c2ff">n° ${String(u.ed).padStart(3, '0')}</span>` : ''}</div>
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-top:2px"><span style="color:#c9a45a">${c.label}</span> · <span style="color:${st.col}">${esc(st.txt)}</span></div>
          <div style="font-size:11px;color:var(--mut);margin-top:3px;font-family:'SF Mono',monospace">${s.cat === 'arche' ? (u.used ? 'Hors combat · trophée' : 'Largage à l\'aveugle · 1×') : `<span style="color:var(--red)">${fmt(unitAtk(s.cat))} atk</span> · <span>${fmt(unitDef(s.cat))} déf</span>`}</div>
        </div>
        <div style="color:var(--mut);font-size:16px">›</div></div>`;
    }).join('');
    // étoile sur les flottes préparées qui emmènent un vaisseau d'exception
    for (const f of fleetsWithPremium()) {
      const row = document.querySelector(`.fleet-prepared-row[onclick*="${f.id}"] .fleet-prepared-info`);
      if (row && !row.querySelector('.bm-fl')) row.insertAdjacentHTML('beforeend', `<div class="bm-fl" style="font-size:10px;color:#f1d27a;margin-top:2px;display:flex;align-items:center;gap:4px">${STAR(10)} ${f.premium.map(p => esc((SHIPS.find(x => x.id === p.item) || {}).name || '')).join(' · ')} · +${fmt(f.premium.reduce((a, p) => a + unitAtk(p.cat), 0))} atk</div>`);
    }
  }
  let lastFleetLoad = 0;
  if (typeof window.renderFleetScreen === 'function') {
    const origF = window.renderFleetScreen;
    window.renderFleetScreen = function () {
      const r = origF.apply(this, arguments);
      try { fleetSection(); } catch (e) {}
      if (Date.now() - lastFleetLoad > 60000) { lastFleetLoad = Date.now(); loadOwned().then(() => { try { fleetSection(); } catch (e) {} }); }   // l'écran se redessine souvent : serveur 1×/min
      return r;
    };
  }
  // ── Composer une flotte : section « Vaisseaux d'exception » ──
  function composeSection() {
    const ships = document.getElementById('fleet-compose-ships'); if (!ships || typeof G === 'undefined' || !G.fleetComposing) return;
    const fc = G.fleetComposing; if (!Array.isArray(fc.premium)) fc.premium = [];
    const avail = freeHere(fc.editingId);
    fc.premium = fc.premium.filter(p => avail.some(u => u.id === p.pid));   // déjà ailleurs ou hors service : retiré
    let box = document.getElementById('bm-compose');
    if (!avail.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'bm-compose'; ships.after(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('[data-pick]'); if (!b || !G.fleetComposing) return;
        const pid = b.dataset.pick, list = G.fleetComposing.premium || (G.fleetComposing.premium = []);
        const i = list.findIndex(p => p.pid === pid);
        if (i >= 0) list.splice(i, 1); else { const u = unitOf(pid); if (u) list.push({ pid: u.id, item: u.item, cat: u.cat }); }
        composeSection(); try { renderFleetComposeRecap(); } catch (er) {}
      });
    }
    box.innerHTML = `<div class="section-label" style="margin-top:6px"><span>Vaisseaux d'exception</span></div>` + avail.map(u => {
      const s = shipOf(u); if (!s) return ''; const on = fc.premium.some(p => p.pid === u.id);
      return `<div data-pick="${u.id}" style="margin:0 16px 8px;padding:8px 12px 8px 8px;display:flex;align-items:center;gap:12px;cursor:pointer;border-radius:10px;
          border:1px solid ${on ? 'rgba(241,210,122,.75)' : 'rgba(241,210,122,.25)'};background:${on ? 'rgba(241,210,122,.13)' : 'rgba(241,210,122,.03)'}">
        ${thumbBox(s.id, 48)}
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#f3ead2">${esc(s.name)}</div>
          <div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace;margin-top:2px">${CATS[s.cat].label} · <span style="color:var(--red)">+${fmt(unitAtk(s.cat))} atk</span></div></div>
        <div style="font:600 11px 'Space Grotesk',sans-serif;letter-spacing:.08em;color:${on ? '#15110a' : '#c9a45a'};background:${on ? '#c9a45a' : 'transparent'};border:1px solid #c9a45a;border-radius:6px;padding:6px 10px">${on ? 'À BORD' : 'AJOUTER'}</div>
      </div>`;
    }).join('') + `<div style="margin:-2px 16px 10px;font-size:10px;color:var(--mut)">Jamais détruits : si l'orbite est perdue, ils sont mis hors service (Cuirassé de Héro 36 h, Dreadnought 24 h). Une flotte doit compter au moins un vaisseau construit.</div>`;
  }
  function recapLine() {
    const el = document.getElementById('fleet-compose-recap'); if (!el || !G.fleetComposing) return;
    const old = el.querySelector('.bm-recap'); if (old) old.remove();
    const pr = G.fleetComposing.premium || []; if (!pr.length) return;
    el.insertAdjacentHTML('beforeend', `<div class="dash-stat-row bm-recap"><span class="lbl" style="display:flex;align-items:center;gap:5px">${STAR(11)} Vaisseaux d'exception ×${pr.length}</span><span class="val" style="color:var(--red)">+${fmt(pr.reduce((a, p) => a + unitAtk(p.cat), 0))} atk</span></div>`);
  }
  function wrap(name, after, before) {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = function () { const ctx = before ? before.apply(this, arguments) : null; const r = orig.apply(this, arguments); try { after && after(r, ctx, arguments); } catch (e) { console.warn('[Blackmarket]', name, e); } return r; };
  }
  wrap('openFleetCompose', (r, ctx, args) => {
    if (!G.fleetComposing) return;
    const ex = args[0] && G.fleet.prepared.find(f => f.id === args[0]);
    G.fleetComposing.premium = ex && Array.isArray(ex.premium) ? JSON.parse(JSON.stringify(ex.premium)) : [];
    composeSection(); recapLine();   // l'écran a déjà été dessiné par goto()
  });
  wrap('renderFleetCompose', () => composeSection());
  wrap('renderFleetComposeRecap', () => recapLine());
  const compShips = (c) => { let n = 0; for (const k of ['tanker', 'fregate', 'cuirasse']) for (const t of ['t1', 't2', 't3']) n += (c && c[k] && c[k][t]) || 0; return n; };
  // flotte d'exception seule (choix d'Adrien, 02/11) : une escadre sans vaisseau construit est permise
  if (typeof window.confirmFleetComposition === 'function') {
    const origCF = window.confirmFleetComposition;
    window.confirmFleetComposition = function () {
      const fc = G.fleetComposing;
      const ctx = fc ? { editing: fc.editingId, premium: JSON.parse(JSON.stringify(fc.premium || [])), ids: new Set(G.fleet.prepared.map(f => f.id)) } : null;
      if (fc && ctx.premium.length && compShips(fc.composition) === 0) {
        const name = (fc.name || '').trim();
        if (!name) { if (typeof toast === 'function') toast('Donne un nom à ta flotte'); return; }
        if (fc.editingId) {
          const ex = G.fleet.prepared.find(f => f.id === fc.editingId); if (!ex) return;
          ex.name = name; ex.composition = JSON.parse(JSON.stringify(fc.composition)); ex.soldiers = { garde: 0, lourd: 0 }; ex.premium = ctx.premium; ex.modifiedAt = Date.now();
          G.fleetComposing = null; trackLoc(); if (typeof saveGame === 'function') saveGame();
          toast(`${ex.name} mise à jour`); selectedFleetId = ex.id; goto('fleet-detail', { replace: true }); return;
        }
        if (G.fleet.prepared.length >= 5) { toast('Maximum 5 flottes préparées simultanément'); return; }
        const fleet = { id: 'fleet_' + Date.now(), name, composition: JSON.parse(JSON.stringify(fc.composition)), soldiers: { garde: 0, lourd: 0 },
          status: 'prepared', heroes: { tanker: null, fregate: null, cuirasse: null }, createdAt: Date.now(), premium: ctx.premium };
        G.fleet.prepared.push(typeof sbTagWorld === 'function' ? sbTagWorld(fleet) : fleet);
        G.fleetComposing = null; trackLoc(); if (typeof saveGame === 'function') saveGame();
        toast(`${fleet.name} prête au départ`); goto('fleet', { replace: true }); return;
      }
      const r = origCF.apply(this, arguments);
      try {
        if (ctx && !G.fleetComposing) {
          const f = ctx.editing ? G.fleet.prepared.find(x => x.id === ctx.editing) : G.fleet.prepared.find(x => !ctx.ids.has(x.id));
          if (f) { f.premium = ctx.premium; trackLoc(); if (typeof saveGame === 'function') saveGame(); }
        }
      } catch (e) { console.warn('[Blackmarket] flotte', e); }
      return r;
    };
  }
  wrap('updateComposeConfirmBtn', () => {
    const btn = document.getElementById('fleet-compose-confirm-btn'), fc = G.fleetComposing;
    if (btn && fc && (fc.premium || []).length && fc.name && fc.name.trim()) btn.disabled = false;
  });
  // ── Vitesse : une escadre composée UNIQUEMENT de Cuirassés de Héro va 20 % plus vite (une flotte avance au rythme du plus lent) ──
  const isHeroSquad = (f) => !!(f && Array.isArray(f.premium) && f.premium.length && compShips(f.composition) === 0 && f.premium.every(p => p.cat === 'sport'));
  wrap('confirmSendMission', (r, ctx) => {
    if (!ctx) return;
    const f = G.fleet.prepared.find(x => x.id === ctx.id);
    if (f && f.status === 'in_mission' && !f.mpRaidId && f.missionEndsAt && f.missionStartedAt >= ctx.t && isHeroSquad(f)) {
      f.missionEndsAt = f.missionStartedAt + Math.round((f.missionEndsAt - f.missionStartedAt) / 1.2);
      if (typeof saveGame === 'function') saveGame();
    }
  }, () => ({ id: typeof selectedFleetId !== 'undefined' ? selectedFleetId : null, t: Date.now() }));
  // transferts : une escadre d'exception se transfère aussi (et plus vite si ce ne sont que des Héros)
  wrap('_sbXferFleets', (r) => {
    if (!Array.isArray(r)) return;
    for (const f of fleetsWithPremium()) if (!r.includes(f) && (typeof _sbMine !== 'function' || _sbMine(f)) && ['prepared', 'deployed'].includes(f.status || 'prepared')) r.push(f);
  });
  wrap('sbLaunchTransfer', (r, ctx) => {
    if (!ctx || !Array.isArray(G.fleetTransfers)) return;
    const x = G.fleetTransfers.find(y => y.fleetId === ctx && y.departAt >= Date.now() - 5000);
    const f = G.fleet.prepared.find(y => y.id === ctx);
    if (x && f && isHeroSquad(f) && !x.bmFast) { x.arriveAt = x.departAt + Math.round((x.arriveAt - x.departAt) / 1.2); x.bmFast = true; if (typeof saveGame === 'function') saveGame(); }
  }, () => (typeof _sbXfer !== 'undefined' && _sbXfer) ? _sbXfer.fleetId : null);
  // fiche d'une flotte : ses vaisseaux d'exception
  // fiche d'une flotte : ses vaisseaux d'exception dans la liste « Composition » (toucher = sa vitrine, même en mission)
  wrap('renderFleetDetail', () => {
    const old = document.getElementById('bm-fd'); if (old) old.remove();
    const comp = document.getElementById('fleet-detail-composition'); if (!comp) return;
    const f = (G.fleet.prepared || []).find(x => x.id === selectedFleetId);
    if (!f || !Array.isArray(f.premium) || !f.premium.length) return;
    comp.insertAdjacentHTML('afterbegin', f.premium.map(p => {
      const s = SHIPS.find(x => x.id === p.item); if (!s) return ''; const u = unitOf(p.pid);
      const st = u && isDown(u) ? `<span style="color:#d9845a">hors service · ${hoursLeft(u)}</span>`
        : `<span style="color:var(--red)">${fmt(unitAtk(s.cat))} atk</span> · <span style="color:var(--cyan)">${fmt(unitDef(s.cat))} def</span>${s.cat === 'sport' ? ' · <span style="color:var(--amber)">5k cargo</span>' : ''}`;
      return `<div class="hangar-row" data-bmown="${s.id}" style="cursor:pointer;border-color:rgba(241,210,122,.4);background:linear-gradient(90deg,rgba(241,210,122,.08),rgba(241,210,122,.02))">
        <div class="hangar-icon" style="overflow:visible">${thumbBox(s.id, 46)}</div>
        <div class="hangar-info"><div class="hangar-name" style="color:#f3ead2">${esc(s.name)} <span style="color:#c9a45a;font-weight:400;font-size:.8em">${CATS[s.cat].label}</span></div>
          <div class="hangar-stats">${st}</div></div>
        <div style="color:var(--mut);font-size:16px;align-self:center">›</div></div>`;
    }).join(''));
    const meta = document.getElementById('fleet-detail-meta');
    if (meta && !meta.querySelector('.bm-meta')) {
      const atk = f.premium.filter(p => !isDown(unitOf(p.pid))).reduce((n, p) => n + unitAtk(p.cat), 0);
      meta.insertAdjacentHTML('beforeend', ` · <span class="bm-meta" style="color:#f1d27a">★ ${f.premium.length} d'exception${atk ? ' · +' + fmt(atk) + ' atk' : ''}</span>`);
    }
    if (!comp._bmClick) { comp._bmClick = true; comp.addEventListener('click', (e) => { const r = e.target.closest && e.target.closest('[data-bmown]'); if (r) openOwned(r.dataset.bmown); }); }
  });
  // raid entre commandants : la flotte envoyée au serveur emmène ses vaisseaux d'exception (vérifiés là-bas)
  wrap('_mpFleetPayload', (r, ctx, args) => {
    const f = args[0]; if (!r || !f || !Array.isArray(f.premium)) return;
    r.premium = f.premium.filter(p => !isDown(unitOf(p.pid))).map(p => ({ pid: p.pid, cat: p.cat, item: p.item }));
  });
  // retour d'un raid : le serveur a peut-être mis des vaisseaux hors service
  wrap('mpReturnRaid', () => { lastFleetLoad = 0; loadOwned().then(() => { try { fleetSection(); } catch (e) {} }); });
  // défense tombée face à un raid : les vaisseaux d'exception des flottes en orbite de cette planète passent hors service
  // (jamais détruits). mpApplyDefenseLosses tourne déjà « dans » la planète visée (sbWithWorld).
  wrap('mpApplyDefenseLosses', (out, ctx, args) => {
    const combat = args[0], raidWon = args[1], ph1 = combat && combat.phases && combat.phases.phase1;
    if (!ph1 || !(raidWon || ph1.won)) return;
    const ids = [];
    for (const f of fleetsWithPremium()) {
      if ((f.status || 'prepared') !== 'deployed' || (typeof _sbMine === 'function' && !_sbMine(f))) continue;
      for (const p of f.premium) { const u = unitOf(p.pid); if (u && !isDown(u)) ids.push(p.pid); }
    }
    if (!ids.length) return;
    const now = Date.now();
    ids.forEach(id => { const u = unitOf(id); if (u) u.down = Math.max(u.down || 0, now + (u.cat === 'sport' ? 36 : 24) * 3600e3); });
    try { localStorage.setItem('bm_units_cache', JSON.stringify(units)); } catch (e) {}
    call('/rest/v1/rpc/bm_disable', { p_ids: ids }).catch(e => console.warn('[Blackmarket] hors service :', e.message));
    if (out && out.ships) out.ships["Vaisseaux d'exception (hors service)"] = { destroyed: 0, damaged: ids.length };
  });
  // embuscades : le serveur a peut-être mis des vaisseaux hors service
  wrap('mpIngestPiracy', () => { if (Date.now() - lastFleetLoad > 60000 && fleetsWithPremium().length) { lastFleetLoad = Date.now(); loadOwned(); } });
  // défense orbitale : une flotte DÉPLOYÉE défend avec ses vaisseaux d'exception (même règle que les autres)
  if (typeof window.getOrbitalDefenseFromFleets === 'function') {
    const origD = window.getOrbitalDefenseFromFleets;
    window.getOrbitalDefenseFromFleets = function () {
      let t = origD.apply(this, arguments);
      try {
        for (const f of fleetsWithPremium()) {
          if ((f.status || 'prepared') !== 'deployed' || (f.world || 'home') !== here()) continue;
          for (const p of f.premium) if (!isDown(unitOf(p.pid))) t += unitDef(p.cat);
        }
      } catch (e) {}
      return t;
    };
  }
  // missions contre les cibles du jeu (combat calculé ici) : vaisseaux hors service retirés, défaite → hors service
  if (typeof window.resolveCombat === 'function') {
    const origC = window.resolveCombat;
    window.resolveCombat = function (fleet, target) {
      let fl = fleet;
      if (fleet && Array.isArray(fleet.premium) && fleet.premium.length) fl = Object.assign({}, fleet, { premium: fleet.premium.filter(p => !isDown(unitOf(p.pid))) });
      const r = origC.call(this, fl, target);
      try {
        if (r && r.premiumDown && fl.premium && fl.premium.length) {
          const ids = fl.premium.map(p => p.pid), now = Date.now();
          ids.forEach(id => { const u = unitOf(id); if (u) u.down = Math.max(u.down || 0, now + (u.cat === 'sport' ? 36 : 24) * 3600e3); });
          try { localStorage.setItem('bm_units_cache', JSON.stringify(units)); } catch (e) {}
          call('/rest/v1/rpc/bm_disable', { p_ids: ids }).catch(e => console.warn('[Blackmarket] hors service :', e.message));
          if (typeof toast === 'function') setTimeout(() => toast('Orbite perdue : tes vaisseaux d\'exception rentrent à quai, hors service.'), 1500);
        }
      } catch (e) {}
      return r;
    };
  }
  // ── Hors service = interdit de sortie (retour d'Adrien 02/11 : une flotte repartait avec son Héro HS) ──
  // Avant toute sortie (mission, raid, embuscade) : les vaisseaux d'exception hors service restent à quai, ou la sortie est annulée.
  async function guardDown(fleet) {
    if (!fleet || !Array.isArray(fleet.premium) || !fleet.premium.length) return true;
    const down = fleet.premium.filter(p => isDown(unitOf(p.pid)));
    if (!down.length) return true;
    const names = down.map(p => { const sh = SHIPS.find(x => x.id === p.item), u = unitOf(p.pid); return `<strong>${esc(sh ? sh.name : p.item)}</strong> (encore ${hoursLeft(u)})`; }).join(', ');
    const alone = compShips(fleet.composition) === 0 && down.length === fleet.premium.length;
    if (alone) {
      if (typeof sbConfirmWarning === 'function') await sbConfirmWarning('Hors service', `${names} répare à quai : cette escadre ne peut pas sortir avant la fin des réparations.`, 'Compris');
      else if (typeof toast === 'function') toast('Vaisseau d\'exception hors service : sortie impossible');
      return false;
    }
    const ok = typeof sbConfirmWarning === 'function'
      ? await sbConfirmWarning('Hors service', `${names} répare à quai et ne peut pas partir.<br><br>Envoyer la flotte sans ${down.length > 1 ? 'eux' : 'lui'} ?`, 'Partir sans')
      : false;
    if (!ok) return false;
    fleet.premium = fleet.premium.filter(p => !down.includes(p));
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  function guardWrap(name, fleetOf) {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = async function () {
      let f = null; try { f = fleetOf.apply(this, arguments); } catch (e) {}
      if (f && !(await guardDown(f))) return;
      return orig.apply(this, arguments);
    };
  }
  const curFleet = () => (G.fleet.prepared || []).find(f => f.id === selectedFleetId);
  guardWrap('openFleetTargetSelection', curFleet);
  guardWrap('confirmSendMission', curFleet);
  guardWrap('mpAmbushStart', (id) => (G.fleet.prepared || []).find(f => f.id === id));

  // ── TAXI : largage à l'aveugle (v34) ──
  function taxiFlight() { try { const t = G.fleet.bmTaxi; return t && !t.done ? t : null; } catch (e) { return null; } }
  function taxiLayer() {
    let el = root.querySelector('.bm-taxi');
    if (!el) { el = document.createElement('div'); el.className = 'bm-taxi'; root.appendChild(el); }
    el.style.cssText = 'position:absolute;inset:0;z-index:5;background:radial-gradient(120% 70% at 50% 100%,rgba(140,80,255,.22),transparent 60%),#06050a;overflow-y:auto;padding:calc(env(safe-area-inset-top) + 18px) 16px calc(env(safe-area-inset-bottom) + 24px)';
    return el;
  }
  function closeTaxiLayer() { const el = root && root.querySelector('.bm-taxi'); if (el) el.remove(); }
  function taxiPicker() {
    const el = taxiLayer();
    const homeSec = (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS && MY_ADDRESS.sector) || '';
    const colSecs = new Set(((G.worlds || []).filter(w => w.kind === 'colony').map(w => (String(w.coord || '').split('-')[1] || ''))));
    const known = new Set(Object.values(G.knownSystems || {}).map(x => x && x.sector).filter(Boolean));
    const cells = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L => {
      const mark = L === homeSec ? 'Capitale' : colSecs.has(L) ? 'Colonie' : known.has(L) ? 'Exploré' : '';
      const lit = mark ? (L === homeSec ? '#f1d27a' : '#b98cff') : '#3a3350';
      return `<button data-sector="${L}" style="aspect-ratio:1;border-radius:10px;border:1px solid ${lit};background:${mark ? 'rgba(185,140,255,.08)' : 'rgba(255,255,255,.02)'};color:#e6edf2;font:600 18px 'Space Grotesk',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer">
        ${L}<span style="font:400 8px 'JetBrains Mono',monospace;letter-spacing:.06em;color:${mark ? lit : '#5a5470'};text-transform:uppercase">${mark || 'inconnu'}</span></button>`;
    }).join('');
    el.innerHTML = `<div style="font:500 10px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#9b8fc0;text-transform:uppercase">TAXI · Transport par Arche eXtra-Interstellaire</div>
      <h1 style="margin:6px 0 4px;font-size:26px">Où percer la trame ?</h1>
      <div style="font-size:14px;color:#b7aed6;line-height:1.5;margin-bottom:16px">Choisis un secteur, même inconnu. Le TAXI y crée un monde dans un système vide tiré au sort : tu ne sauras où qu'en arrivant, dans 1 h. Une seule fois.</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px">${cells}</div>
      <button class="bm-btn" style="margin-top:18px" onclick="this.closest('.bm-taxi').remove()">Annuler</button>`;
  }
  function taxiConfirm(L) {
    const el = taxiLayer();
    el.innerHTML = `<div style="min-height:100%;display:flex;flex-direction:column;justify-content:center;text-align:center">
      <div style="font:500 10px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#9b8fc0;text-transform:uppercase">Largage à l'aveugle</div>
      <div style="font-size:72px;font-weight:600;line-height:1;margin:14px 0 6px;color:#d9c2ff">${esc(L)}</div>
      <div style="font-size:15px;color:#c7bfe3;line-height:1.55;max-width:30ch;margin:0 auto 22px">Secteur ${esc(L)}. Un système vide, tiré au sort. Une planète-jardin créée pour toi, 72 h de protection.<br>Arrivée dans 1 h. On ne revient pas en arrière.</div>
      <button class="bm-buy" data-taxigo="${esc(L)}" style="background:#5b3fa0;color:#f1e8ff">Percer la trame</button>
      <div class="bm-buy-sub" style="margin-bottom:14px">Pauline : « T'es sûr ? Le TAXI, il fait pas de marche arrière. »</div>
      <button class="bm-btn" data-taxiback>Choisir un autre secteur</button></div>`;
  }
  async function taxiDrop(L) {
    const go = root.querySelector('[data-taxigo]'); if (go) { go.disabled = true; go.textContent = 'Le TAXI s\'arrache…'; }
    try {
      const r = await call('/rest/v1/rpc/bm_taxi_drop', { p_sector: L });
      if (!r || !r.address) throw new Error('no_address');
      G.fleet.bmTaxi = { address: r.address, ed: r.edition_no || null, departAt: Date.now(), arriveAt: Date.now() + 3600e3, sector: L };
      const u = units.find(x => x.cat === 'arche'); if (u) { u.used = Date.now(); u.addr = r.address; }
      try { localStorage.setItem('bm_units_cache', JSON.stringify(units)); } catch (e) {}
      if (typeof saveGame === 'function') saveGame();
      closeTaxiLayer(); close();
      taxiCinema('depart');
    } catch (e) {
      const m = e.message || '';
      const sub = root.querySelector('.bm-taxi .bm-buy-sub');
      if (sub) sub.innerHTML = m === 'taxi_used' ? 'Ton TAXI a déjà fait son voyage.' : m === 'no_taxi' ? 'Aucun TAXI à ton nom (paiement pas encore reçu ?).'
        : m === 'not_signed_in' ? 'Connecte ton compte (cloud) pour larguer.' : 'La trame résiste (' + esc(m) + '). Réessaie dans un instant.';
      if (go) { go.disabled = false; go.textContent = 'Percer la trame'; }
    }
  }
  // cinématique provisoire : la vitrine du TAXI (trou noir) en plein écran, avec le récit ; la vraie viendra avec le modèle final
  function taxiCinema(kind, done) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:#000;opacity:0;transition:opacity .6s ease';
    ov.innerHTML = `<iframe src="assets/blackmarket/taxi.html?embed&v=${VERSION}" style="position:absolute;inset:0;width:100%;height:100%;border:0;transition:filter 2.4s ease, transform 2.4s ease"></iframe>
      <div class="cap" style="position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 70px);text-align:center;color:#f1e8ff;font:600 20px 'Space Grotesk',sans-serif;letter-spacing:.04em;text-shadow:0 2px 18px #000;padding:0 24px;transition:opacity .5s"></div>
      <button style="position:absolute;right:16px;top:calc(env(safe-area-inset-top) + 12px);border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.4);color:#fff;border-radius:18px;padding:7px 14px;font:500 12px 'Space Grotesk',sans-serif">Passer</button>`;
    document.body.appendChild(ov); requestAnimationFrame(() => { ov.style.opacity = '1'; });
    const cap = ov.querySelector('.cap'), fr = ov.querySelector('iframe');
    const lines = kind === 'depart'
      ? [[1500, 'Le TAXI émerge du trou noir.'], [5000, 'Il force la trame de l\'univers.'], [8500, 'Destination inconnue. Arrivée dans 1 h.']]
      : [[1200, 'La trame se déchire. Le TAXI surgit.'], [4800, 'Il ouvre sa gueule et dépose le monde.'], [8400, 'Le trou noir le reprend, sans ménagement.']];
    const timers = lines.map(([t, txt]) => setTimeout(() => { cap.style.opacity = '0'; setTimeout(() => { cap.textContent = txt; cap.style.opacity = '1'; }, 300); }, t));
    if (kind !== 'depart') timers.push(setTimeout(() => { fr.style.filter = 'brightness(.25) blur(2px)'; fr.style.transform = 'scaleY(1.6) translateY(30%)'; }, 8600));
    const end = () => { timers.forEach(clearTimeout); ov.style.opacity = '0'; setTimeout(() => { ov.remove(); if (done) done(); }, 650); };
    timers.push(setTimeout(end, 12500));
    ov.querySelector('button').onclick = end;
  }
  // arrivée : la colonie (planète-jardin) est fondée chez le joueur ; elle est déjà inscrite sur le serveur
  let taxiLanding = false;
  function taxiTick() {
    const t = taxiFlight(); if (!t || taxiLanding || Date.now() < t.arriveAt || typeof sbFoundColony !== 'function') return;
    if ((G.worlds || []).some(w => w.coord === t.address)) { t.done = true; return; }
    taxiLanding = true;
    try {
      const w = sbFoundColony({ name: 'TAXI-' + String(t.ed || 0).padStart(3, '0'), coord: t.address });
      w.garden = true; w.taxi = t.ed || true; w.mpClaimed = true;
      t.done = true; t.landedAt = Date.now(); t.colonyId = w.id;
      if (typeof saveGame === 'function') saveGame();
      taxiCinema('arrive', async () => {
        try { if (typeof sbAskColonyName === 'function') await sbAskColonyName(w.id, true); } catch (e) {}
        const go = typeof sbConfirmWarning === 'function' ? await sbConfirmWarning('◈ ' + w.name + ' est née',
          `Le TAXI a percé la trame et déposé <strong>${esc(w.name)}</strong> (${esc(w.coord)}) : une planète-jardin, protégée 72 h. Tout est à bâtir.<br><br>Le TAXI, lui, est rentré dans ta flotte : coque morte, travail accompli.`, 'Y aller') : true;
        if (go && typeof sbSwitchWorld === 'function') { sbSwitchWorld(w.id); try { goto('planet'); } catch (e) {} }
      });
    } finally { taxiLanding = false; }
  }
  setInterval(() => { try { taxiTick(); } catch (e) { console.warn('[TAXI]', e); } }, 5000);
  window.addEventListener('resize', () => { try { fitView(); } catch (e) {} });
  window.SBBlackmarket = { open, close, openOwned, ships: SHIPS, cats: CATS, owned: () => owned, units: () => units, reload: loadOwned };
})();
