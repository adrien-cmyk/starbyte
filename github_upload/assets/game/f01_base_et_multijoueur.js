/* Starbyte — f01_base_et_multijoueur.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';
// Noms « var » de premier niveau du jeu : déclarés ici pour exister dès le départ, comme dans le monolithe (hoisting).
var TANKER_BUSY_STATUSES, EXTRA_SAVE_KEYS, _mpIncoming, _raOn, _raSeenPlanet, _raMinIds, _mpResolveAsked, _mpReturning, MP_RAID_ERRORS, _mpPeaceOkAt, _mpLaunching, DEF_LOSS, DEF_TURRETS, DEF_SOLDIERS, _MP_BUILDING_LABEL, MP_FLAG_CONTEXT, MP_DIPLO_ERRORS, MP_TRADE_PRICE, MP_TRADE_CAP_DEFAULT, MP_TRADE_SURPLUS, _mpTradeBusy, MP_ALLY_COST, MP_ALLY_MAX, MP_ALLY_COLORS, MP_ALLY_ERRORS, _mpAllyBusy, _mpGarBusy, _mpDiploBusy, _mpOrbitRegistering, MP_DIPLO_TYPES, _mpEmbIn, _mpChatUnread, _mpChatToasted, MP_CHAT_ERRORS, _emb, MP_PIRACY_ERRORS, _mpConvoyBusy, _mpPostsAt, MP_PIRACY_TYPES, _mpAmbushBusy, _mpInterceptOpen, MP_RENAME_ERRORS, _sbRenaming, SB_GEAR_SVG, SB_BELL_SVG, MP_DEAL_PRESETS, MP_BAR_LEAD_COST, MP_DEAL_GRACE_MS, _mpDealBusy, _mpOpenConvoyId, BOT_PROFILES, PV_KINDS, PV_REGEN_MS, PV_DECAY_MS, PV_INCIDENTS, BEACON_HISTORY_MS, BEACON_HISTORY_MAX, _sbColonyLoadAt, SB_WORLD_KEYS, SB_FREE_RATIONS, SB_FAMINE_MULT, RAP_SUBS, SW_LISTS, MP_FLAG_KEY, MP_FLAG_BY_KEY, MP_FLAG_ERRORS, RECYCLE_PCT, RECYCLE_FLOOR, RECYCLE_MIN, _toastTap, _toastWired, CROWN_DOCK_ID, CROWN_DOCK, SANCT_DOCK_ID, SANCT_DOCK, NOIRE_DOCK_ID, NOIRE_DOCK, REFUGE_DOCK_ID, REFUGE_DOCK, VEYRA_DOCK_ID, LUCIOLES_DOCK_ID, IVOIRE_DOCK_ID, AKHET_DOCK_ID, ABIME_DOCK_ID, OBSIDIENNE_DOCK_ID, VEYRA_DOCK, LUCIOLES_DOCK, IVOIRE_DOCK, AKHET_DOCK, ABIME_DOCK, OBSIDIENNE_DOCK, STATION_DOCKS, _crown, CROWN_URL, STATION_UI, _crownSpace, _st3dAsleep, SB_EMP, SB_EMP_TIERS, _sbWanted, TUTO_STEPS, SBTuto, BUILDING_GUIDE, SBProspectGuide;


// Retourne l'URL de l'image d'une tuile pour le contexte actif du match-3.
// Tombe sur l'image par défaut si le thème ou la clé manque.
function getTileImg(key, ctx) {
  const themed = ctx && TILE_THEMES[ctx] && TILE_THEMES[ctx][key];
  if (themed) return themed;
  if (key === 'megastone' || key === 'megahide') return `tiles/${key}.png`;
  const t = TILES.find(x => x.key === key);
  return t ? t.img : '';
}

// Helper : retourne l'URL seulement si l'asset est connu, sinon null
function getAvailableTileImg(key, ctx) {
  const url = getTileImg(key, ctx);
  return AVAILABLE_TILE_ASSETS.has(url) ? url : null;
}

// Helper : retourne l'objectif actif (ou null si mode standard)
function getM3Objective() {
  return G.m3 && G.m3.context ? M3_OBJECTIVES[G.m3.context] : null;
}

/* ═══════════════════════════════════════════════════════════════
   Phase 2 (19/05/2026) — Système hexagonal "odd-r offset"
   ═══════════════════════════════════════════════════════════════
   Colonnes impaires décalées d'une demi-hauteur vers le bas.
   6 voisins par tuile, 3 axes de match :
     - horizontal (E ↔ W)
     - diagonale NE ↔ SW
     - diagonale NW ↔ SE
   Le grid linéaire reste en index = row * M3_COLS + col pour compatibilité,
   mais le voisinage et les matches utilisent les coordonnées offset.
   ═══════════════════════════════════════════════════════════════ */

// Convertit index linéaire ↔ (col, row)
function hexIdx(col, row) { return row * M3_COLS + col; }
function hexCol(idx) { return idx % M3_COLS; }
function hexRow(idx) { return Math.floor(idx / M3_COLS); }
function hexInBounds(col, row) { return col >= 0 && col < M3_COLS && row >= 0 && row < M3_ROWS; }

// Les 6 voisins d'une cellule hex (odd-r offset)
// La ligne impaire (row % 2 === 1) est décalée vers la DROITE de 0.5 cellule
// Donc le voisinage diagonal change selon la parité de la ligne
function hexNeighbors(col, row) {
  const odd = row % 2 === 1;
  // Ordre : E, NE, NW, W, SW, SE
  const candidates = odd
    ? [[col+1, row], [col+1, row-1], [col, row-1], [col-1, row], [col, row+1], [col+1, row+1]]
    : [[col+1, row], [col, row-1], [col-1, row-1], [col-1, row], [col-1, row+1], [col, row+1]];
  return candidates.filter(([c, r]) => hexInBounds(c, r));
}

// Vrai/faux : deux cellules sont-elles voisines hexagonales ?
function hexAreNeighbors(idxA, idxB) {
  const cA = hexCol(idxA), rA = hexRow(idxA);
  const neighs = hexNeighbors(cA, rA);
  const cB = hexCol(idxB), rB = hexRow(idxB);
  return neighs.some(([c, r]) => c === cB && r === rB);
}

// Convertit offset (col, row) ↔ cube (x, y, z) pour les algos d'axes
// Cube coordinates : x + y + z = 0
function hexOffsetToCube(col, row) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}

// Cube → offset
function hexCubeToOffset(x, y, z) {
  const col = x + (z - (z & 1)) / 2;
  const row = z;
  return { col, row };
}

// Récupère l'index linéaire à partir de cube coords (ou null si hors grille)
function hexCubeIdx(x, y, z) {
  const { col, row } = hexCubeToOffset(x, y, z);
  if (!hexInBounds(col, row)) return null;
  return hexIdx(col, row);
}
function capitalParcelIdx() { return ((G.planet && G.planet.parcels) || []).findIndex(q => q && q.state === 'capital'); }
function syncCapitalParcelTier() {   // anciennes parties : le tier du centre se voit aussi sur la carte
  try { const i = capitalParcelIdx(); if (i >= 0 && G.skills) { const p = G.planet.parcels[i]; const t = G.skills.capitalLevel || 1; if ((p.lvl || 1) !== t) p.lvl = t; } } catch (e) {}
}

// Helper : retourne la bonne illustration de sonde selon le tier de portée
function getProbeIllustrationKey() {
  if (G.probe.rangeIdx >= 4) return 'probe_t3'; // illimitée
  if (G.probe.rangeIdx >= 2) return 'probe_t2'; // 50+ systèmes
  return 'probe_t1';                             // basique
}

// Helper appelé en onerror pour remplacer une img cassée par le SVG fallback
function pngFallback(imgEl, key) {
  const fallback = ILLUSTRATIONS[key];
  if (fallback) {
    imgEl.outerHTML = fallback;
  } else {
    imgEl.style.display = 'none';
  }
}

function getIllustration(key) {
  // Si on a un PNG pour cette clé, retourne une <img> avec fallback JS propre
  if (PNG_ILLUSTRATIONS[key]) {
    return `<img src="${PNG_ILLUSTRATIONS[key]}" alt="${key}" class="illu-png" onerror="pngFallback(this, '${key}')">`;
  }
  return ILLUSTRATIONS[key] || '';
}

// Icône SVG : ailes stylisées pour symboliser une flotte en orbite/déployée
// Style militaire sobre, à la place de l'emoji 🚀 (trop casual)
function svgFleetWings(color) {
  color = color || 'currentColor';
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 8 L16 24" />
    <path d="M16 12 L6 18 L4 20 L12 18" />
    <path d="M16 12 L26 18 L28 20 L20 18" />
    <circle cx="16" cy="10" r="1.5" fill="${color}" />
  </svg>`;
}

// Icône SVG : ancre stylisée pour flotte préparée (au port)
function svgFleetAnchor(color) {
  color = color || 'currentColor';
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="8" r="2.2" fill="${color}" stroke="none"/>
    <line x1="16" y1="10.5" x2="16" y2="24"/>
    <path d="M9 18c0 4 3 7 7 7s7-3 7-7"/>
    <line x1="12" y1="14" x2="20" y2="14"/>
  </svg>`;
}

// Icône SVG : crosshair militaire (passe 3.3 — bouton Envoyer en mission)
function svgTarget(color) {
  color = color || 'currentColor';
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="16" r="11" stroke-width="1.4" opacity="0.5"/>
    <circle cx="16" cy="16" r="6.5"/>
    <circle cx="16" cy="16" r="1.6" fill="${color}" stroke="none"/>
    <line x1="16" y1="2" x2="16" y2="8"/>
    <line x1="16" y1="24" x2="16" y2="30"/>
    <line x1="2" y1="16" x2="8" y2="16"/>
    <line x1="24" y1="16" x2="30" y2="16"/>
  </svg>`;
}

// Icône SVG : roquette/fusée — pour le bouton final "Lancer la mission"
function svgRocket(color) {
  color = color || 'currentColor';
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 3 C22 9, 22 18, 16 22 C10 18, 10 9, 16 3 Z"/>
    <circle cx="16" cy="12" r="2" fill="${color}" stroke="none"/>
    <path d="M11 18 L8 24 L11 22"/>
    <path d="M21 18 L24 24 L21 22"/>
    <path d="M14 22 L13 28 M18 22 L19 28 M16 22 L16 30" stroke-width="1.4"/>
  </svg>`;
}

/* Helper principal pour templates dynamiques.
   Retourne un span inline-flex contenant le SVG (string HTML).
   key   : nom de l'icône
   opts  : { size = 14, color = 'currentColor', style, className } */
/* Helper unifié — accepte soit une clé ICON_SVG, soit un caractère/string tel quel.
   Utile pour les configs `{ icon: 'sword' }` ou `{ icon: '◇' }` rétrocompatibles.
   Si la valeur correspond à une clé connue → SVG. Sinon → retourne la valeur brute. */
function renderIcon(value, opts) {
  if (typeof value !== 'string' || !value) return '';
  if (ICON_SVG[value]) return icon(value, opts);
  return value;  // fallback rétrocompat (◇ ◈ ⊙ etc.)
}

function icon(key, opts) {
  opts = opts || {};
  const svg = ICON_SVG[key];
  if (!svg) {
    if (typeof console !== 'undefined') console.warn('[icon] clé inconnue:', key);
    return '';
  }
  const size = opts.size || 14;
  const color = opts.color || 'currentColor';
  const extraStyle = opts.style || '';
  const extraClass = opts.className ? ' ' + opts.className : '';
  return `<span class="icon${extraClass}" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;vertical-align:middle;color:${color};flex-shrink:0;${extraStyle}">${svg}</span>`;
}

/* Hydrate les éléments HTML statiques marqués <span class="icon-static" data-icon="warning">.
   Appelé au DOMContentLoaded.
   Le size par défaut est 14px ; on peut surcharger via data-icon-size="20".
   Le color hérite via CSS (currentColor) sauf si data-icon-color est fourni. */
function hydrateStaticIcons() {
  const nodes = document.querySelectorAll('.icon-static[data-icon]');
  nodes.forEach(el => {
    if (el.dataset.iconHydrated === '1') return;
    const key = el.dataset.icon;
    const svg = ICON_SVG[key];
    if (!svg) return;
    const size = el.dataset.iconSize || '14';
    el.style.display = el.style.display || 'inline-flex';
    el.style.alignItems = el.style.alignItems || 'center';
    el.style.justifyContent = el.style.justifyContent || 'center';
    el.style.width = el.style.width || (size + 'px');
    el.style.height = el.style.height || (size + 'px');
    el.style.verticalAlign = el.style.verticalAlign || 'middle';
    if (el.dataset.iconColor) el.style.color = el.dataset.iconColor;
    el.innerHTML = svg;
    el.dataset.iconHydrated = '1';
  });
}

/* ═══════════════════════════════════════════════════════════════
   EFFETS SENSORIELS — passe 3.3 (boutons crescendo)
   ═══════════════════════════════════════════════════════════════
   3 niveaux d'intensité pour accompagner les 3 boutons moments-clés.
   ═══════════════════════════════════════════════════════════════ */

// Vibration haptique (iOS Safari → ignoré silencieusement si non supporté)
function _vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* navigator.vibrate peut throw sur certains contextes */ }
}

// Secousse de l'écran (clamp à 500ms)
function _shakeScreen(intensity) {
  const el = document.body;
  el.classList.remove('screen-shake');
  // Force reflow pour relancer l'animation
  void el.offsetWidth;
  el.classList.add('screen-shake');
  setTimeout(() => el.classList.remove('screen-shake'), 550);
}

// Flash blanc-bleuté plein écran
function _flashScreen() {
  const flash = document.createElement('div');
  flash.className = 'ignition-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 650);
}

// Particules qui s'envolent depuis un point (x, y)
function _explodeParticles(x, y, count, color) {
  count = count || 14;
  color = color || '#5fffe8';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'ignition-particle';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.background = color;
    p.style.boxShadow = `0 0 8px ${color}`;
    document.body.appendChild(p);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const distance = 80 + Math.random() * 60;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const duration = 600 + Math.random() * 400;

    // Animation via transform + opacity
    p.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 },
      ],
      { duration, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' }
    );
    setTimeout(() => p.remove(), duration + 50);
  }
}

// Joue la séquence de checklist : affiche un overlay plein écran avec lignes
// qui apparaissent une par une (~500ms d'intervalle), puis appelle onComplete.
// Total ~2s. Vibration courte à chaque ligne pour renforcer le tactile.
function playLaunchSequence(sequenceKey, onComplete) {
  const seq = LAUNCH_SEQUENCES[sequenceKey];
  if (!seq) { if (onComplete) onComplete(); return; }

  // Construire l'overlay
  const overlay = document.createElement('div');
  overlay.className = `launch-sequence-overlay level-${seq.level}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'launch-sequence-title';
  titleEl.textContent = seq.title;
  overlay.appendChild(titleEl);

  const list = document.createElement('div');
  list.className = 'launch-sequence-list';
  seq.steps.forEach((stepText) => {
    const item = document.createElement('div');
    item.className = 'launch-sequence-item';
    item.innerHTML = `<span class="ls-check">${icon('check', {size:11, color:'currentColor'})}</span><span class="ls-text">${stepText}</span>`;
    list.appendChild(item);
  });
  overlay.appendChild(list);
  document.body.appendChild(overlay);

  // Calculer la cadence : durée totale ~2s, répartie sur le nombre de steps
  const totalDuration = 2000;
  const finalPause = 250; // petit délai après le dernier step avant onComplete
  const stepInterval = (totalDuration - finalPause) / seq.steps.length;

  // Animer les items un par un
  const items = list.querySelectorAll('.launch-sequence-item');
  items.forEach((item, idx) => {
    setTimeout(() => {
      item.classList.add('visible');
      // Vibration courte synchronisée avec chaque check
      if (seq.level === 1) _vibrate(8);
      else if (seq.level === 2) _vibrate(12);
      else _vibrate([10, 5, 15]); // niveau 3 plus intense
    }, idx * stepInterval);
  });

  // À la fin : fade-out de l'overlay puis onComplete
  setTimeout(() => {
    overlay.classList.add('fading-out');
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 300);
  }, totalDuration + finalPause);
}

// ─── Wrappers crescendo : déclenchent checklist + effet sensoriel + action ───

// Niveau 1 — Déployer en orbite : checklist sobre + petite vibration
function igniteFx1(onComplete) {
  _vibrate(20); // tap initial
  playLaunchSequence('deploy', onComplete);
}

// Niveau 2 — Envoyer en mission : checklist spatiale + vibration moyenne
function igniteFx2(onComplete) {
  _vibrate([15, 30, 25]); // tap initial
  playLaunchSequence('mission', onComplete);
}

// Niveau 3 — LANCER LA MISSION : checklist nucléaire + célébration extrême
//   Pipeline : tap initial → checklist 2s → flash + secousse + particules + fade
function igniteFx3(btnElement, onComplete) {
  _vibrate([20, 30, 50, 30, 80]); // tap initial intense
  playLaunchSequence('launch', () => {
    // Après la checklist : explosion sensorielle
    _flashScreen();
    _shakeScreen();
    if (btnElement) {
      const rect = btnElement.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      _explodeParticles(cx, cy, 22, '#ff5040'); // particules rouge nucléaire
    }
    // Fade-out de l'écran courant
    const currentScreen = document.querySelector('.screen:not(.hidden)');
    if (currentScreen) {
      currentScreen.classList.add('scr-fadeout');
      setTimeout(() => {
        currentScreen.classList.remove('scr-fadeout');
        if (onComplete) onComplete();
      }, 600);
    } else if (onComplete) {
      setTimeout(onComplete, 600);
    }
  });
}

// ─── Wrapper générique pour câbler facilement n'importe quelle action rituelle ───
// Pattern : ritualAction('clefSequence', () => maFonction(args)).
// Vibration tap initial + lance la checklist correspondante + appelle l'action.
// Voir GDD 11_design_patterns.md pour la doctrine.
function ritualAction(sequenceKey, action) {
  const seq = LAUNCH_SEQUENCES[sequenceKey];
  if (!seq) { if (action) action(); return; }
  // Vibration tap initiale proportionnée au niveau
  if (seq.level === 1) _vibrate(20);
  else if (seq.level === 2) _vibrate([15, 30, 25]);
  else _vibrate([20, 30, 50, 30, 80]);
  playLaunchSequence(sequenceKey, action);
}                     // au-delà, parcelle épuisée

function makeInitialParcel(i) {
  if (i === 12) {
    return {
      idx: 12,
      state: 'capital',
      building: null,
      n: 'Centre de Commandement',
      sub: 'Cœur de la colonie. Centralise les rapports et la logistique.',
      lvl: 1,
      max: 3,
      prod: [['ordre','+5/h'], ['défense','+200']],
      remineCount: 0,
      successCount: 0,
    };
  }
  if (CAPITAL_NEIGHBORS.includes(i)) {
    return {
      idx: i,
      state: 'rocky',
      building: null,
      n: 'Plaine rocheuse',
      sub: 'Sol stable. Disponible pour terraformation.',
      lvl: null,
      max: 3,
      prod: null,
      remineCount: 0,
      successCount: 0,
    };
  }
  return {
    idx: i,
    state: 'locked',
    building: null,
    n: 'Zone non cartographiée',
    sub: 'S’ouvre quand ta planète monte de niveau : construis des bâtiments de familles différentes.',
    lvl: null,
    max: 3,
    prod: null,
    remineCount: 0,
    successCount: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// COSMOGRAPHIE — Génération déterministe de l'univers fixe
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/15_cosmographie.md et 16_deux_univers.md
//
// Principe : deux joueurs qui sondent la même adresse A-C-7777 trouvent
// les MÊMES 3 spots planète. C'est ce qui rend l'univers fixe partageable
// sans backend (génération à la volée, déterministe par seed).

// Hash 32-bit déterministe (variante FNV-1a, simple et stable)
function _hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// PRNG mulberry32 — produit une suite de floats [0,1[ déterministes
function _mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function getPlanetSlotsInSystem(addrOrKey) {
  // Accepte soit un objet { cluster, sector, system }, soit une clé "W-X-YYYY"
  let key;
  if (typeof addrOrKey === 'string') {
    key = addrOrKey;
  } else if (addrOrKey && addrOrKey.cluster) {
    key = `${addrOrKey.cluster}-${addrOrKey.sector}-${addrOrKey.system}`;
  } else if (addrOrKey && addrOrKey.sector) {
    // Compat v1 (sans cluster) → Amas A implicite
    key = `A-${addrOrKey.sector}-${addrOrKey.system}`;
  } else {
    return [];
  }

  if (_planetSlotsCache[key]) return _planetSlotsCache[key];

  const seed = _hashSeed('system:' + key);
  const rng = _mulberry32(seed);

  // Tirer 3 slots distincts entre 1 et 99
  const slots = new Set();
  let safety = 0;
  while (slots.size < 3 && safety < 100) {
    const z = 1 + Math.floor(rng() * 99);  // 1-99
    slots.add(z);
    safety++;
  }
  const result = Array.from(slots).sort((a, b) => a - b);
  _planetSlotsCache[key] = result;
  return result;
}

// Vérifie si un spot précis (W-X-YYYY-Z) est une planète dans l'univers fixe
function isPlanetSpot(addr) {
  if (!addr || typeof addr.planet !== 'number') return false;
  const slots = getPlanetSlotsInSystem(addr);
  return slots.includes(addr.planet);
}
function getNonHabitableSlotsInSystem(addrOrKey) {
  let key;
  if (typeof addrOrKey === 'string') {
    key = addrOrKey;
  } else if (addrOrKey && addrOrKey.cluster) {
    key = `${addrOrKey.cluster}-${addrOrKey.sector}-${addrOrKey.system}`;
  } else if (addrOrKey && addrOrKey.sector) {
    key = `A-${addrOrKey.sector}-${addrOrKey.system}`;
  } else {
    return [];
  }

  if (_nonHabSlotsCache[key]) return _nonHabSlotsCache[key];

  // On utilise un seed différent pour éviter collisions avec habitables
  const seed = _hashSeed('nonhab:' + key);
  const rng = _mulberry32(seed);

  // Récupérer les slots habitables pour les exclure
  const habitableSlots = getPlanetSlotsInSystem(addrOrKey);
  const habSet = new Set(habitableSlots);

  // Nombre de non-habitables : 5, 6 ou 7 (tirage déterministe)
  const nonHabCount = 5 + Math.floor(rng() * 3); // 5/6/7

  // Tirer N slots distincts non-habitables (pas dans habSet)
  const slots = new Set();
  let safety = 0;
  while (slots.size < nonHabCount && safety < 200) {
    const z = 1 + Math.floor(rng() * 99);
    if (!habSet.has(z)) slots.add(z);
    safety++;
  }

  const result = Array.from(slots).sort((a, b) => a - b);
  _nonHabSlotsCache[key] = result;
  return result;
}

// Pour un slot NON habitable, détermine son type :
//   'dead_world' (50%), 'gas_giant' (35%), 'lunar' (15%)
function getNonHabitableTypeForSlot(addrOrKey, slotZ) {
  let key;
  if (typeof addrOrKey === 'string') key = addrOrKey;
  else if (addrOrKey && addrOrKey.cluster) key = `${addrOrKey.cluster}-${addrOrKey.sector}-${addrOrKey.system}`;
  else if (addrOrKey && addrOrKey.sector) key = `A-${addrOrKey.sector}-${addrOrKey.system}`;
  else return 'dead_world';

  const seed = _hashSeed(`nonhabtype:${key}-${slotZ}`);
  const rng = _mulberry32(seed);
  const r = rng();
  if (r < 0.50) return 'dead_world';
  if (r < 0.85) return 'gas_giant';
  return 'lunar';
}

// Helper unifié : retourne TOUS les slots avec corps céleste d'un système
// (habitables + non-habitables fusionnés, triés).
// Utile pour les fonctions qui ne distinguent pas (ex. validation classifyAddress)
function getAllCelestialSlotsInSystem(addrOrKey) {
  const hab = getPlanetSlotsInSystem(addrOrKey);
  const nonhab = getNonHabitableSlotsInSystem(addrOrKey);
  const merged = [...hab, ...nonhab];
  return Array.from(new Set(merged)).sort((a, b) => a - b);
}

// Helper unifié : retourne le type d'un slot (habitable OU non-habitable)
// Retourne null si le slot n'a aucun corps céleste.
function getCelestialTypeForSlot(addrOrKey, slotZ) {
  const habSlots = getPlanetSlotsInSystem(addrOrKey);
  if (habSlots.includes(slotZ)) {
    const typeNum = getPlanetTypeForSlot(addrOrKey, slotZ);
    if (typeNum === 2) return 'dead_world';   // historique : type 2 = morte
    if (typeNum === 3) return 'habitable';
    if (typeNum === 4) return 'gas_giant';
    return 'habitable';
  }
  const nonHabSlots = getNonHabitableSlotsInSystem(addrOrKey);
  if (nonHabSlots.includes(slotZ)) {
    return getNonHabitableTypeForSlot(addrOrKey, slotZ);
  }
  return null;
}

// Pour un système donné, retourne le type de chaque slot planète (type 2/3/4)
// déterministe par seed du système + index du slot.
function getPlanetTypeForSlot(addrOrKey, slotZ) {
  let key;
  if (typeof addrOrKey === 'string') {
    key = addrOrKey;
  } else if (addrOrKey && addrOrKey.cluster) {
    key = `${addrOrKey.cluster}-${addrOrKey.sector}-${addrOrKey.system}`;
  } else if (addrOrKey && addrOrKey.sector) {
    key = `A-${addrOrKey.sector}-${addrOrKey.system}`;
  } else {
    return 3; // fallback : habitable
  }
  const seed = _hashSeed(`planet:${key}-${slotZ}`);
  const rng = _mulberry32(seed);
  const r = rng();
  // Distribution alignée GDD 06 v2.0 :
  //   30% morte (type 2) · 35% habitable (type 3) · 20% gazeuse (type 4) · 15% joueur (type 1)
  // NB : "joueur" reste virtuel tant que le multi n'est pas branché —
  // ces 15% sont des spots habitables "réservés" pour de futurs comptes.
  if (r < 0.30) return 2;       // morte
  if (r < 0.65) return 3;       // habitable
  if (r < 0.85) return 4;       // gazeuse
  return 3;                     // habitable (placeholder pour futur joueur)
}

// Classifie ce qui se trouve à une adresse complète (W-X-YYYY-Z)
//   'self'      : la planète du joueur
//   'habitable' : planète habitable (univers fixe)
//   'dead'      : planète morte
//   'gas'       : planète gazeuse
//   'empty'     : spot non-planète (univers mouvant prend le relais)
function classifyAddress(addr) {
  if (!addr || addr.kind !== 'spot') return 'empty';

  // Ta propre planète ?
  if (typeof MY_ADDRESS !== 'undefined'
      && MY_ADDRESS
      && addr.cluster === MY_ADDRESS.cluster
      && addr.sector  === MY_ADDRESS.sector
      && addr.system  === MY_ADDRESS.system
      && addr.planet  === MY_ADDRESS.planet) {
    return 'self';
  }

  // Univers fixe : est-ce un slot planète déterministe ?
  if (!isPlanetSpot(addr)) return 'empty';

  const type = getPlanetTypeForSlot(addr, addr.planet);
  if (type === 2) return 'dead';
  if (type === 4) return 'gas';
  return 'habitable';
}

// ═══════════════════════════════════════════════════════════════
// COSMOGRAPHIE — Portée par skills de Cartographie
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/13_sondes_exploration.md (section RÈGLES DE PORTÉE)
// + 11_design_patterns.md Principe #7 (le silence est un signal coûteux)
//
// Règle absolue : une sonde hors portée NE PART PAS. Pas de dégradation
// silencieuse — ça diluerait le silence narratif des secrets (Pilier 7).
// L'UI bloque l'envoi dès la saisie avec message "Trop loin pour les
// capteurs actuels", sans mentionner explicitement le skill à débloquer.

// Skills de Cartographie débloqués par le joueur.
// Persisté dans G (pas localStorage) car ça fait partie du save game futur.
// Format : un set de booléens — pas de niveaux, soit débloqué soit pas.
function makeDefaultCartoSkills() {
  return {
    sismic:       false,  // +1 secteur adjacent
    interstellar: false,  // +3 secteurs
    galactic:     false,  // amas entier
    interCluster: false,  // multi-amas (prérequis Trantor)
  };
}

// Calcule la portée maximale du joueur en termes de "distance secteur".
// Retourne :
//   { kind: 'sector_local' }              → secteur d'origine uniquement
//   { kind: 'sector_radius', radius: N }  → N secteurs adjacents
//   { kind: 'cluster' }                   → tout l'amas
//   { kind: 'universe' }                  → tous les amas
// Niveau de cartographie effectif (10/10) : jusqu'ici seuls les cheats débloquaient la portée,
// alors que l'arbre promet Labo T2 → sismique, Labo T3 → interstellaire. On prend le plus haut
// des deux : skills acquis (G.cartoSkills, cheats/futur) et niveau du Laboratoire construit.
function getLaboTier() { return getLaboTierOf(); }
// PATCH_3010_PORTEE_PLANETE (Adrien, 30/10) — chaque planète scanne depuis elle, avec SON Laboratoire
// (remplace PATCH_3010_PORTEE_EMPIRE). wid absent = la planète affichée.
function _sbWorldPlanet(wid) {
  if (!wid || wid === (G.activeWorld || 'home')) return G && G.planet;
  const w = (Array.isArray(G.worlds) ? G.worlds : []).find(x => x && x.id === wid);
  return w && w.data && w.data.planet;
}
function getLaboTierOf(wid) {
  let t = 0;
  for (const p of ((_sbWorldPlanet(wid) || {}).parcels) || []) if (p && p.building === 'labo' && p.state === 'built') t = Math.max(t, p.lvl || 1);
  return t;
}
function getCartoLevel(wid) {
  const s = (G && G.cartoSkills) ? G.cartoSkills : makeDefaultCartoSkills();
  let i = 0;
  ['sismic', 'interstellar', 'galactic', 'interCluster'].forEach((k, n) => { if (s[k]) i = Math.max(i, n + 1); });
  const lt = getLaboTierOf(wid);
  if (lt >= 3) i = Math.max(i, 2); else if (lt >= 2) i = Math.max(i, 1);
  return ['local', 'sismic', 'interstellar', 'galactic', 'interCluster'][i];
}
// 30/10 (Adrien) : +1 secteur pour toutes les planètes — sans Labo ou Labo 1 : 1 secteur autour, Labo 2 : 2, Labo 3 : 4
function _rangeOfLevel(lvl) {
  if (lvl === 'interCluster') return { kind: 'universe' };
  if (lvl === 'galactic')     return { kind: 'cluster' };
  if (lvl === 'interstellar') return { kind: 'sector_radius', radius: 4 };
  if (lvl === 'sismic')       return { kind: 'sector_radius', radius: 2 };
  return { kind: 'sector_radius', radius: 1 };
}
// PATCH_0811_PORTEE_COLONIES (Adrien, 08/11) — la portée vient de l'expansion, plus du Laboratoire.
// Cf. claude/starbyte_GDD_portee_colonies.md. Remplace la règle du 03/11 (« la meilleure planète + 1 secteur »).
// Toutes les planètes de l'empire partagent le même palier : 3 + nombre de colonies
// (1 colonie → 4 secteurs, 2 → 5, 3 → 6, 4 → 7, et à 4 colonies on a couvert les 26 lettres de l'amas).
// Avant la première colonie, c'est le Laboratoire qui décide (1 / 2 / 4 secteurs) ; on prend toujours le
// meilleur des deux, donc aucune partie existante ne perd de portée (Labo 3 sans colonie reste à 4).
function sbColonyCount() {
  if (!Array.isArray(G.worlds)) return 0;
  return G.worlds.filter(w => w && w.id !== 'home').length;
}
function getMaxRange(wid) {
  const score = (r) => r.kind === 'universe' ? 99 : r.kind === 'cluster' ? 50 : (r.radius || 0);
  // les skills de cartographie (cheats, amas entier, multi-amas) priment et restent partagés par l'empire
  let best = _rangeOfLevel(getCartoLevel(wid));
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) {
    if (!w || w.id === wid) continue;
    const r = _rangeOfLevel(getCartoLevel(w.id));
    if (score(r) > score(best)) best = r;
  }
  if (best.kind !== 'sector_radius') return best;
  const col = sbColonyCount();
  const own = _rangeOfLevel(getCartoLevel(wid));
  const radius = Math.max(own.radius || 0, col >= 1 ? 3 + col : 0);
  return { kind: 'sector_radius', radius };
}
// PATCH_0811_PORTEE_COLONIES — ce qu'il faut faire pour atteindre une case hors de portée.
// Un seul endroit pour le dire : la carte 3D, la carte SVG et la saisie d'adresse lisent cette phrase.
// Le message doit toujours nommer ce qui débloque RÉELLEMENT la case, jamais un Laboratoire déjà au maximum.
function sbRangeHint(targetSector) {
  let col = 0, lt = 0, radius = 0;
  try { col = sbColonyCount(); } catch (e) {}
  try { lt = getLaboTierOf(G.activeWorld || 'home'); } catch (e) {}
  try { const r = getMaxRange(G.activeWorld || 'home'); if (r && r.kind === 'sector_radius') radius = r.radius || 0; else return 'Au-delà de ce que tes capteurs peuvent atteindre aujourd\'hui.'; } catch (e) {}
  let gap = 0;
  try { if (targetSector) gap = _sectorDistance(sbOrigin().sector, String(targetSector)); } catch (e) {}
  const where = gap ? `À ${gap} secteur${gap > 1 ? 's' : ''} d'ici, pour une portée de ${radius}. ` : '';
  if (col < 1) {
    if (lt < 2) return where + 'Développe ton Laboratoire au niveau 2 : portée de 2 secteurs autour de la planète.';
    if (lt < 3) return where + 'Développe ton Laboratoire au niveau 3 : portée de 4 secteurs autour de la planète.';
    return where + 'Hors de portée, même au Laboratoire 3. Fonde une colonie : chaque colonie étend la vue de tout ton empire.';
  }
  if (col < 4) return where + `Ta prochaine colonie porte toutes tes planètes à ${3 + col + 1} secteurs. Pose-la au bord de ta portée pour voir au-delà.`;
  return where + 'Tu as couvert cet amas. Au-delà, c\'est un autre amas — la cinquième colonie est la première qui peut s\'y poser.';
}
// la plus grande portée de mes planètes (carte : zone éclairée)
function getMaxRangeAny() {
  const ids = (Array.isArray(G.worlds) && G.worlds.length) ? G.worlds.map(w => w.id) : ['home'];
  let best = null, score = (r) => r.kind === 'universe' ? 99 : r.kind === 'cluster' ? 50 : (r.radius || 0);
  for (const id of ids) { const r = getMaxRange(id); if (!best || score(r) > score(best)) best = r; }
  return best || getMaxRange();
}

// Distance Chebyshev entre deux secteurs (lettres A-Z).
// Avec 26 lettres on n'a qu'une dimension, donc c'est juste |a-b|.
// (Le GDD parle de "secteurs adjacents" — on prend l'interprétation linéaire
//  pour l'instant, c'est ce qui fait sens avec une seule lettre par secteur.)
function _sectorDistance(a, b) {
  if (!a || !b) return 999;
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0));
}

// Vérifie qu'une adresse parsée est dans la portée actuelle du joueur.
// Retourne true/false. La règle exacte dépend du kind de l'adresse.
// PATCH_2010_DEPART — d'où partent les vaisseaux et jusqu'où on voit : la planète affichée, et toutes ses planètes pour la portée
function _sbAddrOf(coord) {
  const m = String(coord || '').match(/^([A-Z])-([A-Z])-(\d{4})-(\d{1,2})/);
  return m ? { cluster: m[1], sector: m[2], system: parseInt(m[3], 10), planet: parseInt(m[4], 10) } : null;
}
function sbOrigin() {
  try { const w = typeof sbActiveWorld === 'function' ? sbActiveWorld() : null; if (w && w.id !== 'home') { const a = _sbAddrOf(w.coord); if (a) return a; } } catch (e) {}
  return MY_ADDRESS;
}
function sbOriginCoord() { const w = typeof sbActiveWorld === 'function' ? sbActiveWorld() : null; return (w && w.id !== 'home' && w.coord) ? w.coord : null; }
function sbAllOrigins() {
  const out = [MY_ADDRESS];
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.id !== 'home') { const a = _sbAddrOf(w.coord); if (a) out.push(a); }
  return out;
}
// 30/10 (Adrien) : on vise depuis la planète affichée, avec la portée de SON Laboratoire
function isInRange(parsed) { return _isInRangeFrom(parsed, sbOrigin(), G.activeWorld || 'home'); }
function _isInRangeFrom(parsed, MY_ADDRESS, wid) {
  if (!parsed || typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return false;
  const range = getMaxRange(wid);

  // Cas spécial : si l'adresse n'a pas de cluster (kind = 'cluster' seul ou
  // legacy sans préfixe), on tolère et on suppose même amas que le joueur.
  const targetCluster = parsed.cluster || MY_ADDRESS.cluster;
  const targetSector  = parsed.sector  || null;

  // Bloque multi-amas sauf si on a interCluster
  if (targetCluster !== MY_ADDRESS.cluster) {
    return range.kind === 'universe';
  }

  // Même amas : la règle dépend du tier de portée
  if (range.kind === 'universe' || range.kind === 'cluster') return true;

  // Sinon on doit comparer secteurs
  if (!targetSector) {
    // Cible "cluster entier" sans secteur → seuls galactic/universe peuvent
    return false;
  }
  const dist = _sectorDistance(MY_ADDRESS.sector, targetSector);
  // PATCH_0711_PORTEE_CARTE (Adrien, 07/11) : ce qui est proche SUR LA CARTE est à portée, même si la lettre de secteur est loin
  // (« depuis ma colonie, 2 systèmes à côté : trop loin »). La règle des secteurs reste valable : on ne perd aucune cible.
  if (range.kind === 'sector_radius' && parsed.system && window.SBMap && typeof SBMap.mapDist === 'function') {
    try {
      const from = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`, to = `${targetCluster}-${targetSector}-${parsed.system}`;
      const d = SBMap.mapDist(from, to);
      if (d != null && d <= SBMap.ringsFor(range.radius)) return true;
    } catch (e) {}
  }

  if (range.kind === 'sector_local') {
    return dist === 0;  // uniquement ton secteur
  }
  if (range.kind === 'sector_radius') {
    return dist <= range.radius;
  }
  return false;
}

// Helper : label lisible de la portée actuelle (pour cheats / debug)
function getRangeLabel() {
  const r = getMaxRange();
  if (r.kind === 'universe')        return 'Univers entier (inter-amas)';
  if (r.kind === 'cluster')         return 'Amas entier';
  if (r.kind === 'sector_radius')   return `Secteur local + ${r.radius} secteur${r.radius > 1 ? 's' : ''} autour`;
  return 'Secteur local uniquement';
}

// Construit un exemple d'adresse pertinent pour un tier donné, TOUJOURS dans
// la portée du joueur. Évite que le bouton "Essayer : X" propose une adresse
// que le joueur n'a pas encore le skill d'atteindre.
//
// Stratégie :
// - tier qui accepte 'spot'  → un spot dans le SYSTÈME du joueur (pas sa planète)
// - tier qui accepte 'system' uniquement → un système voisin dans son SECTEUR
// - tier qui accepte 'sector' → son secteur d'origine (W-X)
function buildExampleForTier(cfg) {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return cfg.defaultExample;
  const my = MY_ADDRESS;
  const valid = cfg.validPatterns || [];

  // PASSE 5.1 — Si signature acceptée : suggérer une signature existante
  // - Légère : signature non résolue
  // - Moyenne : signature résolue fixe sans adresse (à verrouiller)
  if (valid.includes('signature') && G.signatures) {
    if (cfg.key === 'medium') {
      const lockable = Object.values(G.signatures).find(s =>
        s.resolved && s.resolvedType === 'fixed' && !s.fixedAddress
      );
      if (lockable) return lockable.id;
      return 'SIG-7F2';
    }
    const unresolvedSig = Object.values(G.signatures).find(s => !s.resolved);
    if (unresolvedSig) return unresolvedSig.id;
    return 'SIG-7F2';
  }

  // Si spot accepté : proposer un autre spot du système (déterministe)
  if (valid.includes('spot')) {
    // Pioche un slot différent du sien parmi les 3 slots planète du système
    const slots = (typeof getPlanetSlotsInSystem === 'function')
      ? getPlanetSlotsInSystem(my)
      : [];
    const otherSlot = slots.find(s => s !== my.planet) || ((my.planet + 17) % 99) || 1;
    return `${my.cluster}-${my.sector}-${my.system}-${String(otherSlot).padStart(2, '0')}`;
  }

  // Si seulement system : système voisin (déterministe)
  if (valid.includes('system')) {
    const offset = ((my.system * 13) % 7) + 1;  // 1-7, déterministe
    const neighborSystem = my.system + offset > 9999 ? my.system - offset : my.system + offset;
    return `${my.cluster}-${my.sector}-${neighborSystem}`;
  }

  // Sinon : secteur du joueur
  return `${my.cluster}-${my.sector}`;
}

// Génération de l'adresse cosmique du joueur (persistée en localStorage)
// → Évite le bug "je me téléporte" à chaque hard refresh
// → Format v2 : { cluster, sector, system, planet }  (4 segments W-X-YYYY-Z)
// → Migration auto depuis ancien format { sector, system, planet } (3 segments X-XXXX-Z)
// → La planète du joueur est TOUJOURS placée sur un des 3 slots déterministes du système
function generateMyAddress() {
  // Helper : assigne un slot planète déterministe (le slot du milieu des 3)
  const assignPlanetSlot = (addr) => {
    const slots = getPlanetSlotsInSystem(addr);
    // Slot du milieu = position relative cohérente entre les saves
    addr.planet = slots[1] !== undefined ? slots[1] : slots[0] || 50;
    return addr;
  };

  // Tenter de charger depuis localStorage
  try {
    const saved = localStorage.getItem('starbyte_my_address');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Format v2 (avec cluster) — vérifier que la planète est sur un slot valide
      if (parsed && parsed.cluster && parsed.sector && parsed.system && parsed.planet) {
        const validSlots = getPlanetSlotsInSystem(parsed);
        if (validSlots.includes(parsed.planet)) {
          return parsed;  // déjà sur un slot déterministe : RAS
        }
        // Slot incohérent (ancien tirage aléatoire) → migration vers slot du milieu
        const migrated = assignPlanetSlot({ ...parsed });
        try { localStorage.setItem('starbyte_my_address', JSON.stringify(migrated)); } catch(e) {}
        return migrated;
      }
      // Format v1 (sans cluster) — migration auto vers Amas A (saison 1)
      // + assignation d'un slot planète déterministe (l'ancien planet=1/2/3 est ignoré)
      if (parsed && parsed.sector && parsed.system) {
        const migrated = assignPlanetSlot({
          cluster: 'A',
          sector: parsed.sector,
          system: parsed.system,
          planet: 0,  // sera recalculé
        });
        try { localStorage.setItem('starbyte_my_address', JSON.stringify(migrated)); } catch(e) {}
        return migrated;
      }
    }
  } catch (e) {
    // localStorage indisponible ou JSON corrompu : on regénère
  }
  // Première fois → générer aléatoirement dans Amas A (saison 1)
  // puis assigner un slot planète déterministe
  const newAddr = assignPlanetSlot({
    cluster: 'A',  // Saison 1 = Amas A
    sector: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    system: Math.floor(Math.random() * 9000 + 1000), // 1000-9999
    planet: 0,  // sera recalculé via assignPlanetSlot
  });
  try {
    localStorage.setItem('starbyte_my_address', JSON.stringify(newAddr));
  } catch (e) {
    // localStorage indisponible : on garde en mémoire pour la session
  }
  return newAddr;
}
// niveau du bâtiment le plus avancé de ce type (0 = aucun)
function bestBuildingLevel(key) {
  let lv = 0;
  for (const p of (G.planet && G.planet.parcels) || []) if (p.state === 'built' && p.building === key) lv = Math.max(lv, p.lvl || 1);
  return lv;
}
// sauvegardes d'avant la tourelle lourde : la ligne d'unité manque
function ensureDefenseUnits() {
  if (!G.defense || !G.defense.units) return;
  for (const k of Object.keys(DEFENSE_UNITS)) if (!G.defense.units[k]) G.defense.units[k] = { qty: 0, dmg: 0 };
}

// Résout un type de planète depuis l'identifiant utilisé dans le code legacy.
function resolvePlanetType(legacyType) {
  const map = {
    'mine':  PLANET_TYPES.type2,  // planète riche en minerai = type 2
    'empty': PLANET_TYPES.type1,  // planète vide = type 1 (naine)
    'dead':  PLANET_TYPES.type5,  // planète morte = type 5
    'gas':   PLANET_TYPES.type4,  // géante gazeuse = type 4
    'life':  PLANET_TYPES.type3,  // planète de vie = type 3
  };
  return map[legacyType] || PLANET_TYPES.type1;
}

// Calcule l'état d'un nœud : built / available (plus de "future" ni "locked")
function getTechNodeStatus(node) {
  // Bâtiment construit ?
  if (node.kind === 'building' && node.buildingKey) {
    const built = G.planet?.parcels?.find(p => p.building === node.buildingKey);
    if (built) {
      const builtTier = built.lvl || 1;
      if (builtTier >= node.tier) return 'built';
    }
    return 'available';
  }
  // Cartographie ?
  if (node.status === 'auto-carto') {
    const currentCarto = getCartoLevel();
    const order = ['local', 'sismic', 'interstellar', 'galactic', 'interCluster'];
    const currentIdx = order.indexOf(currentCarto);
    const requiredIdx = order.indexOf(node.cartoLevel);
    if (currentIdx >= requiredIdx) return 'built';
    return 'available';
  }
  // Sonde moyenne (besoin de carto sismique)
  if (node.status === 'auto-carto-medium') {
    const cartoLvl = getCartoLevel();
    return (cartoLvl !== 'local') ? 'built' : 'available';
  }
  // Flotte (vaisseau construit ?)
  if (node.status === 'auto-fleet') {
    if (node.id === 'fregate') {
      const total = (G.fleet?.stationed?.fregate?.t1 || 0) + (G.fleet?.stationed?.fregate?.t2 || 0) + (G.fleet?.stationed?.fregate?.t3 || 0);
      return total > 0 ? 'built' : 'available';
    }
    if (node.id === 'cuirasse') {
      const total = (G.fleet?.stationed?.cuirasse?.t1 || 0) + (G.fleet?.stationed?.cuirasse?.t2 || 0) + (G.fleet?.stationed?.cuirasse?.t3 || 0);
      return total > 0 ? 'built' : 'available';
    }
    if (node.id === 'tanker') {
      const total = (G.fleet?.stationed?.tanker?.t1 || 0) + (G.fleet?.stationed?.tanker?.t2 || 0) + (G.fleet?.stationed?.tanker?.t3 || 0);
      return total > 0 ? 'built' : 'available';
    }
    return 'available';
  }
  // Composer flotte
  if (node.status === 'auto-fleet-screen') {
    const hasMilitary = ['fregate','cuirasse'].some(k => {
      const s = G.fleet?.stationed?.[k];
      return s && (s.t1 + s.t2 + s.t3) > 0;
    });
    return hasMilitary ? 'built' : 'available';
  }
  // Garnison
  if (node.status === 'auto-garrison') {
    return G.planet?.parcels?.some(p => p.building === 'caserne') ? 'built' : 'available';
  }
  // Commerce
  if (node.status === 'auto-commerce') {
    return G.planet?.parcels?.some(p => p.building === 'comptoir') ? 'built' : 'available';
  }
  // Always available (centre prospect, sondes, carnet)
  if (node.status === 'auto-always') return 'built';
  return 'available';
}

// ─── RENDERING ARBRE TECH ───
function renderTechTree() {
  const root = document.getElementById('tech-tree-content');
  if (!root) return;

  const categoriesHtml = TECH_TREE.map(cat => {
    const nodesHtml = cat.nodes.map(node => {
      const status = getTechNodeStatus(node);
      const isBuilt = status === 'built';

      const stateColor = isBuilt ? cat.color : '#e6f0ff';
      const stateBadge = isBuilt ? '✓ Acquis' : 'À découvrir';
      const stateBadgeColor = isBuilt ? '#78c88c' : 'var(--mut)';

      const tierBadge = node.tier
        ? `<span style="display:inline-block;font-size:9px;letter-spacing:.10em;font-weight:600;padding:2px 5px;border-radius:3px;background:rgba(255,255,255,.08);color:${cat.color};margin-right:6px">T${node.tier}</span>`
        : '';

      return `
        <div style="
          padding:11px 13px;
          background:rgba(255,255,255,.02);
          border:1px solid rgba(255,255,255,.06);
          border-left:3px solid ${stateColor};
          border-radius:6px;
          cursor:default;
          opacity:${isBuilt ? '1' : '0.85'};
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px">
            <div style="font-size:13px;color:${stateColor};font-weight:600;display:flex;align-items:center;flex-wrap:wrap">${tierBadge}${node.name}</div>
            <div style="font-size:8px;color:${stateBadgeColor};letter-spacing:.10em;text-transform:uppercase;font-weight:600;white-space:nowrap">${stateBadge}</div>
          </div>
          <div style="font-size:11px;color:var(--mut);line-height:1.55;margin-bottom:5px">${node.sub}</div>
          ${node.flow ? `<div style="font-size:11px;color:${cat.color};opacity:.85;line-height:1.5;margin-bottom:3px"><span style="opacity:.7">${node.flow}</span></div>` : ''}
          ${node.requires ? `<div style="font-size:10px;color:var(--mut);opacity:.55;font-style:italic">Requis : ${node.requires}</div>` : ''}
        </div>
      `;
    }).join('');

    // Stats par catégorie
    const stats = cat.nodes.reduce((acc, n) => {
      const st = getTechNodeStatus(n);
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {});
    const _skc = window.SBSkills ? SBSkills.familyCount(cat.catKey) : { total: 0, learned: 0 };   // PATCH_1610_SKILLS
    const builtCount = (stats.built || 0) + _skc.learned;
    const totalCount = cat.nodes.length + _skc.total;
    const progressPct = totalCount > 0 ? Math.round((builtCount / totalCount) * 100) : 0;

    // Mapping icône
    const iconMap = { mine: 'pickaxe', centrale: 'zap', labo: 'gem', caserne: 'sword', turret: 'shield', comptoir: 'coin', pickaxe: 'pickaxe', zap: 'zap', gem: 'gem', sword: 'sword', shield: 'shield', coin: 'coin', rocket: 'rocket' };
    const iconName = iconMap[cat.icon] || cat.icon;

    return `
      <div id="tt-cat-${cat.catKey}" style="margin:0 16px 18px;padding:16px;background:${cat.bgGradient};border:1px solid ${cat.color}40;border-radius:12px;scroll-margin-top:70px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:42px;height:42px;border:1px solid ${cat.color}60;border-radius:10px;display:flex;align-items:center;justify-content:center;color:${cat.color};background:rgba(0,0,0,.25)">
            <span class="icon-static" data-icon="${iconName}" data-icon-size="22"></span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;color:${cat.color};font-weight:700;letter-spacing:.04em">${cat.catLabel.toUpperCase()}</div>
            <div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:2px">${cat.catTagline}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:18px;color:${cat.color};font-weight:700;font-family:'SF Mono',monospace">${builtCount}/${totalCount}</div>
            <div style="font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase">acquis</div>
          </div>
        </div>
        <div style="height:3px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden;margin-bottom:14px">
          <div style="height:100%;width:${progressPct}%;background:${cat.color};transition:width 0.3s"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${nodesHtml}
        </div>
        ${window.SBSkills ? SBSkills.familyHtml(cat.catKey, cat.color) : ''}
      </div>
    `;
  }).join('');

  root.innerHTML = categoriesHtml;

  // Mettre à jour la progression globale dans le header
  const allNodes = TECH_TREE.flatMap(cat => cat.nodes);
  const _skAll = window.SBSkills ? SBSkills.SKILLS : [];
  const totalAll = allNodes.length + _skAll.length;
  const totalBuilt = allNodes.filter(n => getTechNodeStatus(n) === 'built').length + _skAll.filter(x => SBSkills.has(x.key)).length;
  const progressEl = document.getElementById('tech-tree-progress');
  if (progressEl) {
    progressEl.textContent = `${totalBuilt}/${totalAll} acquis`;
  }

  // Activer les icônes statiques
  if (typeof hydrateStaticIcons === 'function') hydrateStaticIcons();
}


// Helper : calcule la défense totale dynamiquement
function totalDefense() {
  let total = G.defense.capitalBase, _soldierDef = 0;
  // Défense des unités au sol (= unités totales - unités embarquées sur flottes DÉPLOYÉES ou EN MISSION)
  // Doctrine Z4-ter : les soldats sur flotte préparée défendent encore (au sol),
  // ceux sur flotte déployée sont à bord et ne défendent plus le sol,
  // ceux en mission (passe 3.3) sont loin et ne défendent plus du tout.
  for (const [key, u] of Object.entries(G.defense.units)) {
    const inDeployedFleets = getSoldiersInDeployedFleets(key);
    const inMissionFleets = getSoldiersInMissionFleets(key);
    // PERTES DÉFENSE (13/10) : une unité endommagée est hors service jusqu'à sa réparation
    const groundUnits = Math.max(0, u.qty - (u.dmg || 0) - inDeployedFleets - inMissionFleets - soldiersCommittedElsewhere(key));
    total += groundUnits * DEFENSE_UNITS[key].defPerUnit;
    _soldierDef += groundUnits * DEFENSE_UNITS[key].defPerUnit;   // PATCH_1610_SKILLS
  }
  if (G.troopFamine && _soldierDef > 0) { total -= _soldierDef * (1 - SB_FAMINE_MULT); _soldierDef *= SB_FAMINE_MULT; }   // PATCH_2210_VIVRES : troupes affamées
  // Défense passive des bâtiments (Caserne, Bunker)
  for (const p of G.planet.parcels) {
    if (p.state !== 'built' || !p.building) continue;
    const meta = BUILDINGS[p.building];
    if (!meta?.def) continue;
    const tier = p.lvl || 1;
    const tierData = BUILDING_TIERS[p.building]?.[tier];
    const def = tierData?.def ?? meta.def;
    total += p.damaged ? def / 2 : def;
  }
  // Doctrine Z4-ter : bouclier orbital — les vaisseaux des flottes DÉPLOYÉES défendent
  // la planète. Ils ne sont pas au port (donc en assemblage) ni en mission, mais en orbite.
  total += getOrbitalDefenseFromFleets();
  return window.SBSkills ? SBSkills.defense(total, _soldierDef) : total;   // PATCH_1610_SKILLS
}   // PATCH_2110_COMMERCE : + livraison en attente de paiement   // PATCH_1310_POSTES : + poste de route
function _tankerMissionTier(m) { return m.tier || m.tankerTier || 0; }
// PATCH_2010_FLOTTES — chaque flotte, mission et garnison appartient à la planète d'où elle est partie
function _sbMine(x) { return ((x && x.world) || 'home') === ((typeof G !== 'undefined' && G.activeWorld) || 'home'); }
function sbTagWorld(x) { if (x && !x.world) x.world = (typeof G !== 'undefined' && G.activeWorld) || 'home'; return x; }
function _busyTankerMissions() { return (G.tankerMissions || []).filter(m => !m.bmEnvoy && TANKER_BUSY_STATUSES.includes(m.status) && _sbMine(m)); }   // PATCH_0211_AMBASSADEUR : un vaisseau d'exception en mission ne bloque aucun tanker
function _tankersInFleets(t, excludeFleetId) {
  let n = 0;
  for (const f of (G.fleet && G.fleet.prepared) || []) {
    if (excludeFleetId && f.id === excludeFleetId) continue;
    if (!_sbMine(f)) continue;
    n += (f.composition && f.composition.tanker && f.composition.tanker['t' + t]) || 0;
  }
  return n;
}
// Tankers libres (tier précis, ou n'importe lequel si tier absent)
function tankerAvailability(tier) {
  const stat = (G.fleet && G.fleet.stationed && G.fleet.stationed.tanker) || {};
  const busy = _busyTankerMissions();
  const perTier = {};
  let sum = 0;
  for (const t of [1, 2, 3]) {
    perTier[t] = Math.max(0, (stat['t' + t] || 0) - _tankersInFleets(t) - busy.filter(m => _tankerMissionTier(m) === t).length);
    sum += perTier[t];
  }
  const free = Math.max(0, sum - busy.filter(m => !_tankerMissionTier(m)).length);
  return tier ? Math.min(perTier[tier] || 0, free) : free;
}
// Soldats engagés hors des flottes de guerre : garnisons et cales de tankers
function soldiersCommittedElsewhere(k) {
  let n = 0;
  for (const g of G.garrisons || []) if (_sbMine(g)) n += (g.soldiers && g.soldiers[k]) || 0;
  for (const m of G.tankerMissions || []) {
    if (!_sbMine(m)) continue;
    if (m.status !== 'in_transit' && m.status !== 'orbital_relay' && m.status !== 'returning') continue;
    n += (m.cargo && m.cargo.soldiers && m.cargo.soldiers[k]) || 0;
  }
  return n;
}
// Pertes définitives : retirées de ce qu'on possède (sinon les morts « revenaient » au hangar)
function loseSoldiers(k, n) {
  const u = G.defense && G.defense.units && G.defense.units[k];
  if (u && n > 0) u.qty = Math.max(0, (u.qty || 0) - n);
}
function loseShips(type, tierKey, n) {
  const s = G.fleet && G.fleet.stationed && G.fleet.stationed[type];
  if (s && n > 0) s[tierKey] = Math.max(0, (s[tierKey] || 0) - n);
}

function getSoldiersInDeployedFleets(soldierKey) {
  let count = 0;
  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') !== 'deployed' || !_sbMine(fleet)) continue;
    count += fleet.soldiers?.[soldierKey] || 0;
  }
  return count;
}

// Helper : soldats d'un type réservés à des flottes PRÉPARÉES (au sol)
// Ces soldats défendent encore au sol mais sont assignés à une flotte.
function getSoldiersInPreparedFleets(soldierKey) {
  let count = 0;
  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') !== 'prepared' || !_sbMine(fleet)) continue;
    count += fleet.soldiers?.[soldierKey] || 0;
  }
  return count;
}

// Helper : soldats d'un type EN MISSION (loin, ne défendent plus la planète)
// Passe 3.3 Z4-quinquies
function getSoldiersInMissionFleets(soldierKey) {
  let count = 0;
  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') !== 'in_mission' || !_sbMine(fleet)) continue;
    count += fleet.soldiers?.[soldierKey] || 0;
  }
  return count;
}

// Helper : défense totale ajoutée par les vaisseaux des flottes DÉPLOYÉES (bouclier orbital)
function getOrbitalDefenseFromFleets() {
  let total = 0;
  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') !== 'deployed' || !_sbMine(fleet)) continue;
    if (typeof syncFleetIntegrity === 'function') syncFleetIntegrity(fleet);
    for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
      for (let tier = 1; tier <= 3; tier++) {
        const qty = fleet.composition?.[shipKey]?.['t' + tier] || 0;
        if (qty === 0) continue;
        const td = SHIP_TIERS[shipKey]?.[tier];
        if (!td) continue;
        // coques avariées : défendent selon leur efficacité (35 % à 0 d'intégrité)
        const hps = fleet.integrity?.[shipKey]?.['t' + tier] || [];
        for (let i = 0; i < qty; i++) total += (td.def || 0) * (typeof shipEfficiency === 'function' && typeof hps[i] === 'number' ? shipEfficiency(hps[i]) : 1);
      }
    }
  }
  return total;
}

// Helper : statut défense
function defenseStatus() {
  const t = totalDefense();
  if (t < 1000)   return { label: 'VULNÉRABLE',  color: 'var(--red)',   class: 'warn',   level: 0 };
  if (t < 10000)  return { label: 'EXPOSÉE',     color: 'var(--amber)', class: 'warn',   level: 1 };
  if (t < 100000) return { label: 'PROTÉGÉE',    color: 'var(--green)', class: 'ok',     level: 2 };
  return                { label: 'FORTERESSE',  color: 'var(--cyan)',  class: 'ok',     level: 3 };
}

// Retourne true si une save existe et est valide (utilisé au boot early
// pour décider si on skippe initKnownUniverse).
function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    return snapshot.saveVersion === SAVE_VERSION;
  } catch (e) {
    return false;
  }
}

// Convertit un Set en Array pour sérialisation, et inversement au load
// ⚡ V0.5 fix critique : Ne JAMAIS muter G.planet ! Si on remplace families par un Array
// dans le G original, alors `G.planet.families.has(...)` plante partout dans le code.
// On retourne un nouvel objet sans toucher au G d'origine.
function _serializeSets(obj) {
  if (!obj) return obj;
  // On reconstruit un objet plat avec les sets convertis en arrays.
  // IMPORTANT : on ne mute PAS obj.planet directement.
  if (obj.planet && obj.planet.families instanceof Set) {
    // Cloner planet sans toucher au G original
    obj.planet = { ...obj.planet, families: Array.from(obj.planet.families) };
  }
  return obj;
}
function _deserializeSets(obj) {
  if (obj && obj.planet && Array.isArray(obj.planet.families)) {
    obj.planet.families = new Set(obj.planet.families);
  }
  return obj;
}

// Sauvegarde G complet dans localStorage. Appelé fréquemment, doit être rapide.
// Marqué `_lastSavedAt` pour debugging.
function saveGame() {
  // CLOUD — pendant un reset ou une restauration, ne pas réécrire la partie avant le rechargement
  if (window._sbResetting) return false;
  try {
    const snapshot = {
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      // OFFLINE — instant jusqu'auquel le monde a été simulé (production, files)
      simAt: G._simAt || Date.now(),
      // Données du joueur (ce qui doit survivre à un reload)
      empire: G.empire,
      res: G.res,
      planet: G.planet,
      defense: G.defense,
      skills: G.skills,
      fleet: G.fleet,
      reports: G.reports,
      credits: G.credits,
      fuel: G.fuel,
      routeCards: G.routeCards,
      routes: G.routes,
      universeDocks: G.universeDocks,
      probe: G.probe,
      probesPool: G.probesPool,
      probeMissions: G.probeMissions,
      probeReports: G.probeReports,
      tankerMissions: G.tankerMissions || [],
      tankerReports: G.tankerReports || [],
      beaconReports: G.beaconReports || [],
      knownSystems: G.knownSystems,
      bookmarks: G.bookmarks,
      garrisons: G.garrisons || [],
      secretsState: G.secretsState,
      cartoSkills: G.cartoSkills,
      // Constructions en cours (queues)
      queues: typeof QUEUES !== 'undefined' ? QUEUES : null,
      // Onboarding (si défini ailleurs)
      onboarding: G.onboarding || null,
      // ⚡ V0.5 — Identité joueur
      profile: G.profile || null,
      // PLANET3D — Boucle fondatrice : état de l'antenne de prospection
      antenna: G.antenna || null,
      // ORBITE — chantier construit, orbite pas encore visitée (moment 7)
      orbitUnseen: !!G.orbitUnseen,
    };
    // AUDIT_1110 — carnet, pistes, docks découverts, marché, tutoriels : perdus à chaque rechargement avant
    for (const k of EXTRA_SAVE_KEYS) if (G[k] !== undefined) snapshot[k] = G[k];
    if (Array.isArray(snapshot.reports) && snapshot.reports.length > 60) { G.reports = G.reports.slice(0, 60); snapshot.reports = G.reports; }
    // Convertir les Sets en Array pour JSON
    _serializeSets(snapshot);
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    G._lastSavedAt = snapshot.savedAt;
    // CLOUD — réplication différée dans Supabase (assets/cloud.js)
    if (window.SBCloud) window.SBCloud.queue();
    return true;
  } catch (e) {
    console.error('[saveGame] Échec :', e);
    if (!window._sbSaveWarned && typeof toast === 'function') { window._sbSaveWarned = true; toast('⚠ Sauvegarde impossible sur cet appareil (stockage plein ?)'); }
    return false;
  }
}

// Charge une sauvegarde dans G. Appelé à la fin du boot (quand QUEUES est défini).
// Retourne true si une save a été chargée, false sinon (nouveau joueur).
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);

    // Vérification version
    if (!snapshot.saveVersion) {
      console.warn('[loadGame] Save sans version — ignorée');
      return false;
    }
    if (snapshot.saveVersion !== SAVE_VERSION) {
      console.warn(`[loadGame] Version save '${snapshot.saveVersion}' ≠ '${SAVE_VERSION}' — ignorée`);
      return false;
    }

    // Restaurer les clés sauvegardées dans G
    _deserializeSets(snapshot);
    const keysToRestore = [
      'empire', 'res', 'planet', 'defense', 'skills', 'fleet', 'reports',
      'credits', 'fuel', 'routeCards', 'routes', 'universeDocks',
      'probe', 'probesPool', 'probeMissions', 'probeReports',
      'tankerMissions', 'tankerReports', 'beaconReports',
      'knownSystems', 'bookmarks', 'garrisons', 'secretsState', 'cartoSkills',
      'onboarding',
      'profile',  // ⚡ V0.5 — Identité joueur
      'antenna',  // PLANET3D — Boucle fondatrice
      'orbitUnseen',  // ORBITE — moment 7
    ].concat(EXTRA_SAVE_KEYS);
    for (const key of keysToRestore) {
      if (snapshot[key] !== undefined) {
        G[key] = snapshot[key];
      }
    }
    // Restaurer les QUEUES si présentes et si QUEUES existe
    if (snapshot.queues && typeof QUEUES !== 'undefined') {
      if (snapshot.queues.barracks) QUEUES.barracks = snapshot.queues.barracks;
      if (snapshot.queues.shipyard) QUEUES.shipyard = snapshot.queues.shipyard;
      if (snapshot.queues.prospect) QUEUES.prospect = snapshot.queues.prospect;
      if (snapshot.queues.capital !== undefined) QUEUES.capital = snapshot.queues.capital;
    }

    refreshParcelProdLabels();
    syncCapitalParcelTier();   // PATCH_1910_CAPITAL
    try { sbMigrateBrest(); } catch (e) { console.warn('[brest]', e); }   // PATCH_1910_BREST
    setTimeout(() => { try { sbMigrateBrest(); sbRepairDockReports(); } catch (e) {} }, 3000);
    // AUDIT_1110 — l'adresse fait foi (déménagement vers la zone de test)
    if (G.planet && (!G.activeWorld || G.activeWorld === 'home')) { G.planet.address = MY_ADDRESS; G.planet.coordString = MY_COORD_STRING; }   // PATCH_2010_WORLDS : seulement la capitale
    if (typeof sbWorldsInit === 'function') sbWorldsInit();
    try { sbMigrateProbesPerWorld(); } catch (e) { console.warn('[sondes/planète]', e); }
    try { sbMigrateResPerWorld(); } catch (e) { console.warn('[stock/planète]', e); }
    try {   // PATCH_0111_BUTIN : flottes et missions d'avant les colonies = parties de la capitale
      for (const f of ((G.fleet && G.fleet.prepared) || [])) { if (!f) continue; if (!f.world) f.world = 'home'; if (f.ambush && !f.ambush.world) f.ambush.world = f.world; if (f.garrison && !f.garrison.world) f.garrison.world = f.world; }
      for (const m of (G.tankerMissions || [])) if (m && !m.world) m.world = 'home';
    } catch (e) { console.warn('[butin/planète]', e); }

    // OFFLINE — reprendre la simulation là où la sauvegarde l'a laissée
    G._simAt = snapshot.simAt || snapshot.savedAt || Date.now();
    G._lastLoadedAt = Date.now();
    const ageS = Math.round((Date.now() - snapshot.savedAt) / 1000);
    console.log(`[loadGame] Save chargée — v${snapshot.saveVersion} · dernière sauvegarde il y a ${ageS}s`);
    return true;
  } catch (e) {
    console.error('[loadGame] Échec :', e);
    return false;
  }
}

// Supprime la save (reset complet). Utilisé par le bouton "Reset partie" dans le panneau cheat.
function deleteSave() {
  try {
    // CLOUD — le beforeunload du rechargement ne doit pas réécrire la partie effacée,
    // et la copie cloud sera supprimée au prochain démarrage
    window._sbResetting = true;
    localStorage.setItem('starbyte_cloud_reset', '1');
    localStorage.removeItem(SAVE_KEY);
    // On nettoie aussi les stores secondaires pour un vrai reset propre
    localStorage.removeItem('starbyte_my_address');
    localStorage.removeItem('starbyte_known_targets');
    localStorage.removeItem('starbyte_signatures');
    localStorage.removeItem('starbyte_system_resolution');
    localStorage.removeItem('starbyte_legend_v1');
    localStorage.removeItem('starbyte_home_discoveries');
    localStorage.removeItem('starbyte_planet_custom_names');
    localStorage.removeItem('starbyte_cloud_base');
    return true;
  } catch (e) {
    console.error('[deleteSave] Échec :', e);
    return false;
  }
}

// Cheat : reset complet de la partie. Recharge la page après confirmation.
function cheatResetGame() {
  if (!confirm('Tout réinitialiser ? Ta progression sera perdue.')) return;
  deleteSave();
  location.reload();
}
function startAutosave() {
  if (_autosaveTimer) return;
  _autosaveTimer = setInterval(() => {
    saveGame();
  }, 30000); // 30 secondes
}

// Initialise les hooks de sauvegarde au boot (autosave + beforeunload + visibilitychange).
// À appeler en fin de script après QUEUES défini.
function initSaveHooks() {
  startAutosave();
  // Sauvegarder avant que le joueur quitte la page (best-effort)
  window.addEventListener('beforeunload', () => {
    saveGame();
  });
  // Sauvegarder quand la page devient cachée (iOS Safari : meilleure couverture qu'unload)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveGame();
    } else if (document.visibilityState === 'visible') {
      // OFFLINE — Safari revient au premier plan : créditer le temps écoulé
      catchUpOffline();
    }
  });
  // OFFLINE — page restaurée depuis le cache arrière/avant (iOS Safari)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) catchUpOffline();
  });
}

/* ════════════════════════════════════════════════════════════════════
   FIN SAVE SYSTEM
   ════════════════════════════════════════════════════════════════════ */

// Initialiser le système maison comme connu
// ═══════════════════════════════════════════════════════════════
// PASSE 5.4 — Vue Univers à horizon
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/17_signatures_resolution.md
// Cf. décision verrouillée #10, #16 du README
//
// Au démarrage, le joueur ne connait QUE sa propre planète.
// Les 2 autres slots du système restent invisibles tant qu'aucune
// sonde n'a transformé l'inconnu en connaissance.
//
// On pose une signature d'amorce (1 seule, subtile) qui guide le
// joueur vers sa première résolution — sans l'aiguiller explicitement.
function initKnownUniverse() {
  const sysKey = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  const sysAddress = sysKey; // ex: 'A-N-6208'

  // Le joueur connait UNIQUEMENT sa propre planète au démarrage
  const myCoord = `${sysKey}-${String(MY_ADDRESS.planet).padStart(2, '0')}`;
  const myPlanet = {
    coord: myCoord,
    cluster: MY_ADDRESS.cluster,
    sector: MY_ADDRESS.sector,
    system: MY_ADDRESS.system,
    index: MY_ADDRESS.planet,
    name: 'KERATH-VII',
    type: 'mine',
    desc: 'Ma planète · Type 3 · Niv. 0',
    playerName: null,
    playerLevel: null,
    report: null,
    isMine: true,
  };

  G.knownSystems[sysKey] = {
    cluster: MY_ADDRESS.cluster,
    sector: MY_ADDRESS.sector,
    system: MY_ADDRESS.system,
    planets: [myPlanet],
    discoveredAt: Date.now(),
    isMine: true,
  };

  // NOTE : la signature d'amorce est posée séparément via seedStarterSignature(),
  // appelée APRÈS la déclaration de SIGNATURE_TYPES et createSignature() plus bas.
}

// ─── PASSE 5.4 — Signature d'amorce (différée) ───
// Appelée après la déclaration de createSignature/SIGNATURE_TYPES pour éviter
// les erreurs de hoisting (TDZ sur const SIGNATURE_TYPES).
// Si le joueur n'a aucune signature en mémoire (nouveau save ou post-reset),
// on en pose UNE qui pointe vers son propre système. Cette signature représente
// "le bruit ambiant" — guidage subtil sans aiguillage explicite.
//
// Cf. décision verrouillée Q4bis (brainstorm 13 mai) : "1 seule signature
// précargée qui pointe vers une bonne 1ère cible"
function seedStarterSignature() {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return;
  if (typeof createSignature !== 'function') return;
  if (typeof G !== 'object' || !G) return;

  // Pas d'amorce si le joueur a déjà des signatures (déjà sondé)
  if (G.signatures && Object.keys(G.signatures).length > 0) return;

  const sysAddress = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  createSignature(sysAddress, 'Capteurs locaux', {
    type: 'cold_mass',
    position: 'orbite haute',
    intensity: 'faible',
  });
}

// ═══ MULTIJOUEUR v0 (10/10) — côté jeu. GDD starbyte_GDD_multijoueur_v0.md ═══
// Le dialogue avec Supabase est dans src/cloud.js (window.SBMP).

// Adresse du joueur au format du registre : 'A-N-3709-24'
function mpMyAddressString() {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return null;
  return `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}-${String(MY_ADDRESS.planet).padStart(2, '0')}`;
}

// Ce que les autres peuvent savoir de mon monde (publié à chaque sauvegarde cloud)
function mpWorldSnapshot() { return (typeof sbWithWorld === 'function') ? sbWithWorld('home', _mpWorldSnapshotHome) : _mpWorldSnapshotHome(); }   // PATCH_2010_WORLDS : le monde publié est la capitale
function _mpWorldSnapshotHome() {
  const parcels = (G.planet && G.planet.parcels) || [];
  const built = parcels.filter(p => p && p.building && (p.state === 'built' || p.state === 'damaged'));
  const level = 1 + built.reduce((s, p) => s + (p.lvl || 1), 0);
  const stocks = {};
  for (const k of ['metal', 'energie', 'cristal']) stocks[k] = Math.max(0, Math.floor((G.res && G.res[k] && G.res[k].v) || 0));
  const home = (G.knownSystems || {})[`${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`];
  const mine = home && (home.planets || []).find(p => p.isMine);
  let planetName = (G.planet && G.planet.name) || (mine && (mine.customName || mine.name)) || 'KERATH-VII';   // PROFIL_1310
  return {
    planet_name: String(planetName).slice(0, 40),
    level,
    defense: Math.max(0, Math.round(typeof totalDefense === 'function' ? totalDefense() : 0)),
    stocks,
    buildings: built.map(p => ({ key: p.building, lvl: p.lvl || 1, state: p.damaged || p.state === 'damaged' ? 'damaged' : 'built' })),
    fleets: mpFleetRegistry(),   // ANTITRICHE_0811 : les flottes sont publiées au registre, le serveur n'en accepte plus d'autres
    soldiers: mpSoldierRegistry(),   // ANTITRICHE_0811 (v48) : soldats possédés, pour que le serveur borne la défense publiée
  };
}
// ANTITRICHE_0811 — registre des flottes (schéma v46). Avant, un raid envoyait sa flotte en JSON libre que le serveur
// acceptait telle quelle. Désormais la partie publie TOUTES ses flottes dans worlds.fleets (toutes planètes confondues)
// et mp_launch_raid va chercher la composition dans ce registre, par id : une seule source, bornée et auditable côté serveur.
// ANTITRICHE_0811 (v48) — soldats possédés (quantités totales), publiés avec le monde : le serveur s'en sert
// pour vérifier que la défense déclarée est possible (soldats × défense/unité + bâtiments + flottes).
function mpSoldierRegistry() {
  const out = {};
  for (const [k, u] of Object.entries((G.defense && G.defense.units) || {})) out[k] = Math.max(0, Math.floor((u && u.qty) || 0));
  return out;
}
function mpFleetRegistry() {
  const out = [];
  for (const f of ((G.fleet && G.fleet.prepared) || [])) {
    if (!f || !f.id) continue;
    const heroes = {};
    for (const [k, h] of Object.entries(f.heroes || {})) if (h && h.name) heroes[k] = { name: String(h.name).slice(0, 40), dead: !!h.dead };
    const premium = Array.isArray(f.premium) ? f.premium.filter(p => p && typeof p.pid === 'string').map(p => ({ pid: p.pid, cat: p.cat, item: p.item })) : [];
    out.push({
      id: String(f.id).slice(0, 80),
      name: String(f.name || '').slice(0, 40),
      world: String(f.world || 'home').slice(0, 40),
      status: String(f.status || 'prepared').slice(0, 20),
      composition: JSON.parse(JSON.stringify(f.composition || {})),
      soldiers: { garde: (f.soldiers && f.soldiers.garde) || 0, lourd: (f.soldiers && f.soldiers.lourd) || 0 },
      heroes,
      premium,
    });
    if (out.length >= 12) break;
  }
  return out;
}
function mpRenderIncoming(list) {
  if (Array.isArray(list)) _mpIncoming = list.filter(r => Date.parse(r.arrives_at) > Date.now());
  else _mpIncoming = _mpIncoming.filter(r => Date.parse(r.arrives_at) > Date.now());
  let el = document.getElementById('mp-incoming');
  if (!_mpIncoming.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-incoming';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top, 0px) + 8px);z-index:9000;max-width:92vw;padding:8px 14px;border-radius:20px;background:rgba(60,10,10,.88);border:1px solid rgba(255,90,70,.6);color:#ffd6cf;font-size:12px;letter-spacing:.02em;box-shadow:0 0 18px rgba(255,60,40,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    el.onclick = () => {
      const r = _mpIncoming[0];
      if (r) toast(`${r.attacker_pseudo}${r.fleet_name ? ' · ' + r.fleet_name : ''} arrive à ${new Date(Date.parse(r.arrives_at)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Renforce ta défense ou déploie une flotte en orbite.`);
      goto('fleet');   // PATCH_1310_TOASTS — l'alerte mène à la flotte
    };
    document.body.appendChild(el);
  }
  const r = _mpIncoming.slice().sort((a, b) => Date.parse(a.arrives_at) - Date.parse(b.arrives_at))[0];
  const min = Math.max(1, Math.ceil((Date.parse(r.arrives_at) - Date.now()) / 60000));
  // PATCH_2010_AUDIT — quelle planète est visée (capitale ou colonie)
  const _w = (G.worlds || []).find(w => w && w.kind === 'colony' && w.coord && w.coord === r.defender_address);
  const _on = _w ? ` → ${_w.name || 'colonie'}` : ((G.worlds || []).some(w => w && w.kind === 'colony') ? ' → capitale' : '');
  el.innerHTML = `⚠ Flotte hostile · <strong>${r.attacker_pseudo}</strong>${_on} · impact dans ${min} min${_mpIncoming.length > 1 ? ` · +${_mpIncoming.length - 1}` : ''}`;
}
// ROUTES_V2 (03/11) — le signal d'antenne : un seul à la fois, visible sans peser (retour d'Adrien : « je me sens obligé ») —
// pleine phrase les 90 premières secondes, puis une petite pastille discrète en bas à droite ; il est aussi dans les rapports
// (onglet Balises, compté dans le badge de Prospection) tant qu'on ne l'a pas regardé.
// PATCH_0711_ANTENNE_SIGNAUX (07/11, Adrien : « la bulle me gêne, mettons tout ça dans le bâtiment de l'antenne ») :
// plus de bulle flottante. Les signaux captés vivent dans la fiche de l'antenne (et toujours dans Rapports › Balises).
function sbSignalRender() {
  const el = document.getElementById('sb-signal'); if (el) el.remove();
  // fiche de l'antenne ouverte : on la rafraîchit si un signal arrive ou part
  try {
    const a = window.SBAntenna && SBAntenna.data ? SBAntenna.data() : null;
    const n = sbSignalsHere().length;
    if (a && a.built && G.selParcel === a.parcel && sbSignalRender._n !== n && document.querySelector('#planet-info .sb-ant-sig, #planet-info .p3d-sig-name')) SBAntenna.renderCard(a.parcel);
    sbSignalRender._n = n;
  } catch (e) {}
}
function sbSignalsHere() { return window.SBLines && SBLines.activeSignals ? SBLines.activeSignals() : []; }
function sbSignalsAntennaHtml() {
  const list = sbSignalsHere();
  const ic = typeof icon === 'function' ? icon('satellite', { size: 12, color: '#ffc864' }) : '📡';
  const rows = list.map(sig => { sbSignalMarkRead(sig.sys); return `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;margin-top:6px;border-radius:8px;border:1px solid rgba(255,200,100,.32);background:rgba(255,200,100,.07)">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-mono);font-size:12px;color:#ffe3b0">${sig.sys}</div>
        <div style="font-size:11px;color:#c9b88f;line-height:1.35;margin-top:2px">Trafic régulier. Une balise posée ici remonte la route jusqu'au lieu caché.</div>
      </div>
      <button onclick="event.stopPropagation();openSystemOnMap('${sig.sys}')" style="flex:none;padding:7px 10px;border-radius:7px;border:1px solid rgba(255,200,100,.5);background:rgba(255,200,100,.12);color:#ffe3b0;font:inherit;font-size:11px;cursor:pointer">Poser une balise ›</button>
    </div>`; }).join('');
  return `<div class="sb-ant-sig" style="margin-top:10px">
    <div style="display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#ffc864">${ic} Signaux captés${list.length ? ' · ' + list.length : ''}</div>
    ${rows || `<div style="font-size:11px;color:#8f9bb3;margin-top:6px;line-height:1.4">Aucun trafic en attente. L'antenne balaie le ciel : un nouveau signal arrive toutes les quelques heures.</div>`}
  </div>`;
}
function sbOpenAntenna() {
  try {
    const a = window.SBAntenna && SBAntenna.data ? SBAntenna.data() : null;
    if (typeof goto === 'function') goto('planet');
    if (!a || a.parcel == null) return;
    const pick = () => { try { if (G.selParcel !== a.parcel || !document.querySelector('#planet-info .sb-ant-sig')) { if (typeof onHexClick === 'function') onHexClick(a.parcel); } if (window.Planet3D && Planet3D.ready) Planet3D.focus(a.parcel); const pi = document.getElementById('planet-info'); if (pi) pi.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} };
    setTimeout(pick, 300); setTimeout(pick, 1100); setTimeout(pick, 2200);   // l'écran planète peut re-sélectionner sa case par défaut juste après l'ouverture
  } catch (e) {}
}
function sbSignalMarkRead(sys) { if (!G._sigRead) G._sigRead = {}; if (!G._sigRead[sys]) { G._sigRead[sys] = Date.now(); if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge(); } }
function sbSignalUnread() { const l = window.SBLines && SBLines.activeSignals ? SBLines.activeSignals() : []; return l.filter(sig => !(G._sigRead && G._sigRead[sig.sys])).length; }
// la carte du signal dans les rapports (onglet Balises)
function sbSignalReportHtml() {
  const list = window.SBLines && SBLines.activeSignals ? SBLines.activeSignals() : [];
  return list.map(sbSignalCardHtml).join('');
}
function sbSignalCardHtml(sig) {
  if (!sig) return '';
  sbSignalMarkRead(sig.sys);
  const ic = typeof icon === 'function' ? icon('satellite', { size: 14, color: '#ffc864' }) : '';
  return `<div style="margin:0 16px 12px;padding:14px 16px;border-radius:10px;border:1px solid rgba(255,200,100,.4);background:linear-gradient(180deg,rgba(255,200,100,.10),rgba(255,200,100,.03))">
    <div style="display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#ffc864">${ic} Signal d'antenne</div>
    <div style="font-size:13px;color:#e6f0ff;margin-top:6px;line-height:1.5">Trafic régulier vers <strong style="font-family:var(--font-mono)">${sig.sys}</strong>. Une balise posée dessus remonte toute la route jusqu'au lieu caché qu'il dessert.</div>
    <button onclick="openSystemOnMap('${sig.sys}')" style="margin-top:10px;width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,200,100,.5);background:rgba(255,200,100,.12);color:#ffe3b0;font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Voir sur la carte · poser une balise</button>
  </div>`;
}
function mpRedAlertStyle() {
  if (document.getElementById('ra-style')) return;
  const st = document.createElement('style');
  st.id = 'ra-style';
  st.textContent = `
#ra-edge{position:fixed;inset:0;pointer-events:none;z-index:8990;box-shadow:inset 0 0 0 1px rgba(255,60,45,.35),inset 0 0 48px 6px rgba(255,30,20,.45),inset 0 0 120px 10px rgba(200,0,0,.22);animation:raEdge 1.6s ease-in-out infinite}
@keyframes raEdge{0%,100%{opacity:.35}50%{opacity:1}}
#ra-layer{position:absolute;inset:0;pointer-events:none;z-index:15;overflow:hidden}
#ra-layer .ra-veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,rgba(255,40,30,0) 30%,rgba(255,30,20,.28) 75%,rgba(140,0,0,.55) 100%);animation:raVeil 1.2s ease-in-out infinite}
@keyframes raVeil{0%,100%{opacity:.45}50%{opacity:1}}
#ra-layer .ra-tint{position:absolute;inset:0;background:rgba(255,20,10,.16);mix-blend-mode:screen;animation:raVeil 1.2s ease-in-out infinite}
.ra-gyro{position:absolute;width:30px;height:30px;z-index:4;margin-top:4px}
.ra-gyro.l{left:14px}
#ra-layer.ra-min .ra-tint,#ra-layer.ra-min .ra-veil,#ra-layer.ra-min #ra-bar,#ra-layer.ra-min .ra-gyro{display:none}
#ra-min{position:relative;flex-shrink:0;width:26px;height:26px;margin:-4px -36px -4px 4px;border:1px solid rgba(255,200,190,.5);border-radius:50%;background:rgba(0,0,0,.35);color:#ffd6cf;font-size:15px;line-height:22px;text-align:center;cursor:pointer}
#ra-restore{position:absolute;left:14px;width:34px;height:34px;border-radius:50%;pointer-events:auto;cursor:pointer;display:none;border:1px solid rgba(255,110,90,.7);background:radial-gradient(circle at 40% 35%,#fff 0 10%,#ff5a48 32%,#a00 75%,#400 100%);box-shadow:0 0 16px 4px rgba(255,40,30,.7);animation:raBlink .6s steps(2,jump-none) infinite}
#ra-layer.ra-min #ra-restore{display:block}
.ra-gyro .dome{position:absolute;inset:2px;border-radius:50% 50% 30% 30%;background:radial-gradient(circle at 40% 35%,#fff 0 12%,#ff5a48 30%,#c00 70%,#500 100%);box-shadow:0 0 14px 4px rgba(255,40,30,.8);animation:raBlink .6s steps(2,jump-none) infinite}
@keyframes raBlink{0%{filter:brightness(1.4)}100%{filter:brightness(.55)}}
.ra-gyro .beam{position:absolute;left:50%;top:50%;width:1500px;height:1500px;margin:-750px 0 0 -750px;border-radius:50%;background:conic-gradient(from 0deg,rgba(255,50,35,0) 0deg,rgba(255,70,50,.42) 10deg,rgba(255,50,35,0) 26deg,rgba(255,50,35,0) 180deg,rgba(255,70,50,.42) 190deg,rgba(255,50,35,0) 206deg);animation:raSpin 1.4s linear infinite;-webkit-mask:radial-gradient(circle,#000 0 4%,rgba(0,0,0,.75) 22%,transparent 62%);mask:radial-gradient(circle,#000 0 4%,rgba(0,0,0,.75) 22%,transparent 62%)}
@keyframes raSpin{to{transform:rotate(360deg)}}
#ra-bar{position:absolute;left:10px;right:10px;top:130px;z-index:3;pointer-events:auto;cursor:pointer;border-radius:8px;overflow:hidden;border:1px solid rgba(255,90,70,.8);box-shadow:0 0 22px rgba(255,40,30,.55);background:#2a0606}
#ra-bar .stripes{position:absolute;inset:0;background:repeating-linear-gradient(-45deg,rgba(255,50,40,.55) 0 12px,rgba(20,0,0,.85) 12px 24px);background-size:34px 34px;animation:raStripes .8s linear infinite;opacity:.55}
@keyframes raStripes{to{background-position:34px 0}}
#ra-bar .txt{position:relative;display:flex;align-items:center;gap:10px;padding:9px 48px 9px 50px;color:#fff;font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 0 6px #f00}
#ra-bar .txt b{font-size:12px;letter-spacing:.18em;white-space:nowrap;animation:raBlink .6s steps(2,jump-none) infinite}
#ra-bar .cd{margin-left:auto;flex-shrink:0;font-family:ui-monospace,Menlo,monospace;font-size:15px;letter-spacing:.06em;color:#ffd6cf}
#ra-bar .who{font-size:10px;letter-spacing:.08em;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw;flex:1;min-width:0}
body.sb-redalert.sb-ra-planet #mp-incoming{display:none}
body.sb-redalert #scr-planet .head h1{color:#ff6a58;text-shadow:0 0 12px rgba(255,40,30,.8)}
@media (prefers-reduced-motion:reduce){.ra-gyro .beam{animation-duration:4s}#ra-edge,#ra-layer .ra-veil,#ra-layer .ra-tint{animation:none}}
`;
  document.head.appendChild(st);
}
function mpRedAlertTick() {
  const list = (typeof _mpIncoming !== 'undefined' ? _mpIncoming : []).filter(r => Date.parse(r.arrives_at) > Date.now());
  const on = list.length > 0;
  const scr = document.getElementById('scr-planet');
  const onPlanet = !!(scr && !scr.classList.contains('hidden'));
  document.body.classList.toggle('sb-redalert', on);
  document.body.classList.toggle('sb-ra-planet', on && onPlanet);
  let edge = document.getElementById('ra-edge');
  let layer = document.getElementById('ra-layer');
  if (!on) {
    if (edge) edge.remove();
    if (layer) layer.remove();
    _raOn = false; _raSeenPlanet = false;
    return;
  }
  mpRedAlertStyle();
  if (!_raOn) { _raOn = true; try { _vibrate([220, 120, 220, 120, 420]); } catch (e) {} }
  // liseré rouge partout, sauf sur la carte planète (elle a son alerte complète)
  if (!onPlanet) { if (!edge) { edge = document.createElement('div'); edge.id = 'ra-edge'; document.body.appendChild(edge); } }
  if (!onPlanet) { if (layer) layer.remove(); _raSeenPlanet = false; return; }
  if (!layer || layer.parentNode !== scr) {
    if (layer) layer.remove();
    layer = document.createElement('div');
    layer.id = 'ra-layer';
    layer.innerHTML = '<div class="ra-tint"></div><div class="ra-veil"></div>'
      + '<div class="ra-gyro l"><div class="beam"></div><div class="dome"></div></div>'
      + '<div id="ra-bar"><div class="stripes"></div><div class="txt"><b>Attaque imminente</b><span class="who"></span><span class="cd"></span><span id="ra-min" title="Réduire" aria-label="Réduire l\'alerte">–</span></div></div>'
      + '<div id="ra-restore" title="Afficher l\'alerte" aria-label="Afficher l\'alerte"></div>';
    layer.querySelector('#ra-min').onclick = (ev) => {
      ev.stopPropagation();
      (typeof _mpIncoming !== 'undefined' ? _mpIncoming : []).forEach((x) => _raMinIds.add(x.id));
      mpRedAlertTick();
    };
    layer.querySelector('#ra-restore').onclick = () => { _raMinIds.clear(); mpRedAlertTick(); };
    layer.querySelector('#ra-bar').onclick = () => {
      const r = list[0];
      toast(`${r.attacker_pseudo}${r.fleet_name ? ' · ' + r.fleet_name : ''} : impact à ${new Date(Date.parse(r.arrives_at)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Renforce ta défense ou déploie une flotte en orbite.`);
      try { goto('defense'); } catch (e) {}
    };
    scr.appendChild(layer);
  }
  if (!_raSeenPlanet) { _raSeenPlanet = true; try { _vibrate([160, 90, 160]); } catch (e) {} }
  // bandeau + girophares sous le HUD du haut et l'objectif (jamais par-dessus)
  let top = 0;
  scr.querySelectorAll('.w-top, .p3d-goal').forEach((e) => { const b = e.getBoundingClientRect(); if (b.height > 0 && b.bottom < innerHeight / 2) top = Math.max(top, b.bottom); });
  const y = Math.round((top || 60) + 8) + 'px';
  const bar = layer.querySelector('#ra-bar');
  if (bar.style.top !== y) { bar.style.top = y; layer.querySelectorAll('.ra-gyro, #ra-restore').forEach((g) => { g.style.top = y; }); }
  // réduite : halo rouge seul (liseré), + petit girophare pour rouvrir
  const min = list.every((x) => _raMinIds.has(x.id));
  layer.classList.toggle('ra-min', min);
  if (min) { if (!edge) { edge = document.createElement('div'); edge.id = 'ra-edge'; document.body.appendChild(edge); } }
  else if (edge) edge.remove();
  const r = list.slice().sort((a, b) => Date.parse(a.arrives_at) - Date.parse(b.arrives_at))[0];
  const s = Math.max(0, Math.floor((Date.parse(r.arrives_at) - Date.now()) / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const who = layer.querySelector('.who'), cd = layer.querySelector('.cd');
  const whoTxt = `${r.attacker_pseudo || '?'}${list.length > 1 ? ' +' + (list.length - 1) : ''}`;
  if (who.textContent !== whoTxt) who.textContent = whoTxt;
  cd.textContent = (hh ? hh + ':' : '') + pad(mm) + ':' + pad(ss);
}

// RUMORS_1110 — chaque palier de 10 niveaux de monde fait parler le comptoir (une fois)
function mpGrowthCheck(level, planetName) {
  const milestone = Math.floor((level || 0) / 10) * 10;
  if (G.mpGrowthMilestone === undefined) { G.mpGrowthMilestone = milestone; return; }   // installation : pas d'annonce rétroactive
  if (milestone >= 10 && milestone > G.mpGrowthMilestone) {
    G.mpGrowthMilestone = milestone;
    if (window.SBMP && window.SBMP.ready()) window.SBMP.reportEvent('world_growth', planetName || null, { level: milestone });
  }
}

// Déménagement unique vers la zone de test (ou alignement sur l'adresse du registre).
// Garde toute la partie ; seule l'adresse change. Le rechargement est fait par l'appelant.
function relocateHome(addrStr) {
  const [cluster, sector, system, planet] = String(addrStr).split('-');
  const oldKey = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  const oldCoord = mpMyAddressString();
  const old = G.knownSystems && G.knownSystems[oldKey];
  let oldName = null;
  if (old) {
    const me = (old.planets || []).find(p => p.isMine);
    if (me) oldName = me.customName || null;
    old.planets = (old.planets || []).filter(p => !p.isMine);
    old.isMine = false;
    if (!old.planets.length) delete G.knownSystems[oldKey];
  }
  const newAddr = { cluster, sector, system: parseInt(system, 10), planet: parseInt(planet, 10) };
  const newCoord = `${cluster}-${sector}-${newAddr.system}-${String(newAddr.planet).padStart(2, '0')}`;
  try {
    const names = loadPlanetCustomNames();
    if (names[oldCoord] || oldName) { names[newCoord] = names[oldCoord] || oldName; delete names[oldCoord]; localStorage.setItem('starbyte_planet_custom_names', JSON.stringify(names)); }
    localStorage.setItem('starbyte_my_address', JSON.stringify(newAddr));
  } catch (e) { console.warn('[MP] relocalisation : stockage indisponible', e); }
  if (typeof saveGame === 'function') saveGame();
}

// Au chargement : si le système d'origine n'existe pas (première partie, ou après déménagement), le créer
function ensureHomeSystem() {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS || !G.knownSystems) return;
  const k = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  const sys = G.knownSystems[k];
  if (!sys || !(sys.planets || []).some(p => p.isMine)) {
    const others = sys ? (sys.planets || []) : [];
    initKnownUniverse();
    const coord = mpMyAddressString();
    G.knownSystems[k].planets = G.knownSystems[k].planets.concat(others.filter(p => p.coord !== coord));
    try { const n = loadPlanetCustomNames()[coord]; if (n) G.knownSystems[k].planets[0].customName = n; } catch (e) {}
  }
}

// Zone de test : pas de faux joueurs, tout joueur rencontré est une vraie personne
// PATCH_2210_UNIVERS_OUVERT (22/10, Adrien : « libérer le plein potentiel de l'univers ») — tout l'amas A est désormais réel :
// les nouveaux joueurs s'installent dans n'importe quel secteur, et nulle part on ne croise plus de faux joueurs inventés
function mpIsTestZone(cluster, sector) {
  return cluster === 'A' && /^[A-Z]$/.test(String(sector || ''));
}
// les systèmes déjà explorés hors de M, N, O gardaient des « joueurs » inventés (ZERATH, BERSEK89…) : on les remplace
// par ce que l'univers réel met à cet endroit (planète libre ou commandant automate, même tirage pour tous)
function sbPurgeFakePlayers() {
  if (G._fakePurged || !G.knownSystems) return;
  const FAKE = ['ZERATH', 'BERSEK89', 'LYS-ORBITAL', 'ANUBIS34', 'XERATH', 'KORVUS-9'];
  for (const [k, sys] of Object.entries(G.knownSystems)) {
    if (!sys || !Array.isArray(sys.planets) || !sys.planets.some(p => p && p.type === 'player' && !p.isBot && !p.isReal && !p.isMine && FAKE.includes(p.playerName))) continue;
    const [cl, sec, num] = k.split('-');
    let fresh = null;
    try { fresh = generateDiscoveredSystem(sec, parseInt(num, 10), cl); } catch (e) { continue; }
    sys.planets = sys.planets.map(p => {
      if (!(p && p.type === 'player' && !p.isBot && !p.isReal && !p.isMine && FAKE.includes(p.playerName))) return p;
      const n = (fresh || []).find(q => q.coord === p.coord);
      return n ? Object.assign({}, n, { reportRead: true }) : p;
    });
  }
  G._fakePurged = 1;
}

// Une sonde a révélé de vrais mondes dans un système : on les inscrit (remplace une planète inventée au même endroit)
// CARNET_ONLY_1410 — seule une sonde produit un rapport de mission ; voisins, pavillons, barman, expéditeurs → carnet seulement
function mergeRealWorlds(sysKey, worlds, opts) {
  if (!Array.isArray(worlds) || !worlds.length) return;
  const noReport = !!(opts && opts.noReport);
  const [cluster, sector, system] = sysKey.split('-');
  if (!G.knownSystems[sysKey]) {
    G.knownSystems[sysKey] = { cluster, sector, system: parseInt(system, 10), planets: [], discoveredAt: Date.now(), isMine: false };
  }
  const sys = G.knownSystems[sysKey];
  const fresh = [];
  for (const w of worlds) {
    const parts = String(w.address).split('-');
    const slot = parseInt(parts[3], 10);
    const coord = `${sysKey}-${String(slot).padStart(2, '0')}`;
    // NIVEAU_0811 — un pavillon ou une piste de bar n'apporte pas de niveau : on garde le meilleur niveau déjà connu
    const _known = sys.planets.find(p => p.coord === coord);
    const lvl = (w.level_estimate && w.level_estimate > 1) ? w.level_estimate : Math.max(1, (_known && _known.playerLevel) || 0, w.level_estimate || 0);
    const data = {
      coord, cluster, sector, system: parseInt(system, 10), index: slot,
      name: w.planet_name || 'Monde habité',
      type: 'player',
      desc: `Commandant : ${w.pseudo} · Niv. ~${lvl}`,
      playerName: w.pseudo,
      playerLevel: lvl,
      isReal: true,
      mpAddress: w.address,
      isMine: false,
      lastSeenDays: w.last_seen_days,
    };
    if (!noReport) {
      data.reportTimestamp = Date.now();
      data.report = (typeof makeReport === 'function') ? makeReport('player', sector, parseInt(system, 10), slot, w.pseudo, lvl, cluster) : null;
      data.reportRead = false;
      data.reportSource = 'probe';
    }
    const i = sys.planets.findIndex(p => p.coord === coord);
    if (i >= 0 && sys.planets[i].customName) {   // PROFIL_1310 — un ancien surnom local cède au vrai nom
      delete sys.planets[i].customName;
      if (typeof savePlanetCustomName === 'function') savePlanetCustomName(coord, null);
    }
    if (i >= 0) { if (!sys.planets[i].isReal) fresh.push(w.pseudo); sys.planets[i] = Object.assign({}, sys.planets[i], data); }
    else { sys.planets.push(data); fresh.push(w.pseudo); }
  }
  if (fresh.length && typeof toast === 'function') {
    toast(`Monde habité détecté dans ${sysKey} · ${fresh.join(', ')}`);
  }
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Même règle que le serveur : 10 min + 5 min par secteur d'écart (aller) ; retour = aller × 2
function mpRaidTravelMs(target) {
  const mine = (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? sbOrigin().sector : null;   // PATCH_2010_DEPART : depuis la planète affichée
  const sector = String(target.mpAddress || target.coord || '').split('-')[1];
  const d = (mine && sector) ? Math.min(Math.abs(mine.charCodeAt(0) - sector.charCodeAt(0)), 25) : 0;
  return (10 + 5 * d) * 60000;
}

function _mpFleetPayload(fleet) {
  const heroes = {};
  for (const [k, h] of Object.entries(fleet.heroes || {})) if (h && h.name) heroes[k] = { name: h.name, dead: !!h.dead };
  return {
    id: fleet.id,   // ANTITRICHE_0811 : le serveur retrouve la flotte au registre par cet id (schéma v46)
    composition: JSON.parse(JSON.stringify(fleet.composition || {})),
    soldiers: { garde: (fleet.soldiers && fleet.soldiers.garde) || 0, lourd: (fleet.soldiers && fleet.soldiers.lourd) || 0 },
    heroes,
  };
}
// ANTITRICHE_0811 — avant un raid, le registre doit connaître la flotte telle qu'elle part (la publication
// ordinaire est différée, après chaque sauvegarde cloud). On publie donc maintenant, puis on lance.
async function mpPublishFleetsNow() {
  try { if (window.SBMP && typeof SBMP.publish === 'function') await SBMP.publish(); } catch (e) { console.warn('[registre] publication des flottes :', String(e && e.message || e)); }
}   // confirmation récente : on ne redemande pas dans la même action
async function mpPeaceGuard(what) {
  return true;   // PATCH_0711_SANS_PACIFIQUE (Adrien, 07/11) : le mode pacifique est retiré — plus de statut à perdre, plus de confirmation
  if (typeof G !== 'undefined' && G && G.mpPeaceful === false) return true;
  if (Date.now() - _mpPeaceOkAt < 120000) return true;
  let st = null;
  try { st = await _mpRpc('mp_peace_state', {}); } catch (e) {}
  if (st && st.peaceful === false) { G.mpPeaceful = false; if (typeof saveGame === 'function') saveGame(); return true; }
  const ok = await sbConfirmWarning('Fin de ton statut pacifique',
    `Tu es <strong>pacifique</strong> : aucun commandant ne peut t'attaquer.<br><br>`
    + `Un pacifique ne fait sortir aucune flotte : ni mission, ni raid, ni embuscade, ni garnison. `
    + `${what || 'Envoyer cette flotte'} met fin à ce statut, <strong>définitivement</strong>. `
    + `Ta planète, tes colonies et tes convois pourront ensuite être attaqués comme ceux de tout le monde.`,
    'Renoncer et envoyer');
  if (ok) _mpPeaceOkAt = Date.now();
  return !!ok;
}
// la flotte est partie : le registre l'inscrit (missions PNJ, embuscades : le serveur ne le voit pas encore)
function mpPeaceRenounce() {
  return;   // PATCH_0711_SANS_PACIFIQUE
  if (typeof G === 'undefined' || !G || G.mpPeaceful === false) return;
  _mpRpc('mp_peace_renounce', {}).catch(e => console.warn('[pacifique] :', String(e && e.message || e)));
  mpPeaceLost();
}
function mpPeaceLost() {
  return;   // PATCH_0711_SANS_PACIFIQUE
  if (typeof G === 'undefined' || !G || G.mpPeaceful === false) return;
  G.mpPeaceful = false;
  if (typeof saveGame === 'function') saveGame();
  if (typeof toast === 'function') toast('Tu n\'es plus pacifique : l\'amas le sait');
}
async function mpLaunchRaid(fleet, target) {
  if (_mpLaunching) return;
  if ((fleet.status || 'prepared') !== 'deployed') { toast('La flotte doit être en orbite'); return; }
  const fuelCost = computeMissionFuelCost(fleet, target);
  if ((G.res.energie.v || 0) < fuelCost) { toast('Énergie insuffisante'); return; }
  if (!window.SBMP || !window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  if (!(await mpPeaceGuard(`Lancer ce raid contre ${target.mpPseudo || target.name || 'ce monde'}`))) { goto('fleet'); return; }   // PATCH_2410_PACIFIQUE
  let raid;
  _mpLaunching = true;
  try {
    await mpPublishFleetsNow();   // ANTITRICHE_0811 : le registre lit la flotte chez lui, pas dans l'appel
    raid = await window.SBMP.launchRaid(target.mpAddress, _mpFleetPayload(fleet), fleet.name);
  } catch (e) {
    const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_RAID_ERRORS[c]);
    toast(code ? MP_RAID_ERRORS[code] : 'Lancement impossible : liaison perdue');
    goto('fleet');
    return;
  } finally {
    _mpLaunching = false;
  }
  G.res.energie.v = Math.max(0, G.res.energie.v - fuelCost);
  const t0 = Date.parse(raid.departed_at) || Date.now();
  fleet.status = 'in_mission';
  fleet.missionTargetId = target.id;
  fleet.missionStartedAt = t0;
  fleet.mpArrivesAt = Date.parse(raid.arrives_at);
  fleet.missionEndsAt = Date.parse(raid.returns_at);
  fleet.missionFuelSpent = fuelCost;
  fleet.mpRaidId = raid.id;
  mpPeaceLost();   // PATCH_2410_PACIFIQUE
  fleet.mpTarget = { name: target.name, pseudo: target.mpPseudo || '', address: target.mpAddress, profile: target.profile };
  pendingMissionTargetId = null;
  if (typeof saveGame === 'function') saveGame();
  toast(`${fleet.name} en route vers ${target.name} · arrivée ${new Date(fleet.mpArrivesAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
  startMissionTimerLoop();
  goto('fleet');
}

// PATCH_2010_AUDIT — raids sortants sans flotte locale (réponse du lancement perdue, sauvegarde revenue en arrière) :
// la flotte du même nom en orbite repart avec le raid, pour qu'elle en subisse les pertes et en rapporte le butin.
function mpAdoptOrphanRaids(rows) {
  if (_mpLaunching || window._sbResetting || !Array.isArray(rows) || !G.fleet || !Array.isArray(G.fleet.prepared)) return;
  let changed = false;
  for (const r of rows) {
    if (!r || !r.id || G.fleet.prepared.some(f => f.mpRaidId === r.id)) continue;
    if (Array.isArray(G.mpRaidsReturned) && G.mpRaidsReturned.includes(r.id)) continue;
    const _ow = (G.worlds || []).find(w => w && w.kind === 'colony' && w.coord && w.coord === r.attacker_address);
    const wid = _ow ? _ow.id : 'home';   // planète d'où le raid est parti
    const ofW = x => (x.world || 'home') === wid && (x.status || 'prepared') === 'deployed';
    const f = G.fleet.prepared.find(x => ofW(x) && x.name === r.fleet_name) || G.fleet.prepared.find(ofW);
    if (!f) continue;
    f.status = 'in_mission';
    f.missionTargetId = 'mp:' + r.defender_address;
    f.missionStartedAt = Date.parse(r.departed_at) || Date.now();
    f.mpArrivesAt = Date.parse(r.arrives_at) || Date.now();
    f.missionEndsAt = Date.parse(r.returns_at) || Date.now();
    // le carburant du raid est payé à l'adoption (le lancement ne l'avait pas débité : réponse perdue)
    let _fuel = 0;
    try { _fuel = Math.min(G.res.energie.v || 0, computeMissionFuelCost(f, { distanceMult: typeof _carnetDistanceMult === 'function' ? _carnetDistanceMult(String(r.defender_address || '').split('-')[1]) : 1 })); } catch (e) {}
    if (_fuel > 0) G.res.energie.v = Math.max(0, G.res.energie.v - _fuel);
    f.missionFuelSpent = _fuel;
    f.mpRaidId = r.id;
    f.mpTarget = { name: r.defender_pseudo || r.defender_address, pseudo: r.defender_pseudo || '', address: r.defender_address, profile: 'Joueur' };
    changed = true;
    toast(`${f.name} est en raid vers ${r.defender_pseudo || r.defender_address}`);
  }
  if (changed) { if (typeof saveGame === 'function') saveGame(); if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop(); if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); }
}

function _mpClearMission(fleet) {
  fleet.status = 'deployed';
  fleet.missionTargetId = null;
  fleet.missionStartedAt = null;
  fleet.missionEndsAt = null;
  fleet.missionFuelSpent = null;
  fleet.mpRaidId = null;
  fleet.mpArrivesAt = null;
  fleet.mpTarget = null;
}

// Retour d'un raid : le résultat est sur le serveur. S'il n'y est pas encore, on réessaie.
async function mpReturnRaid(fleet) {
  const id = fleet.mpRaidId;
  if (!id || _mpReturning.has(id)) return;
  _mpReturning.add(id);
  const retry = (msg, ms) => {
    fleet.missionEndsAt = Date.now() + (ms || 30000);
    if (msg) toast(msg);
    startMissionTimerLoop();
  };
  try {
    if (!window.SBMP || !window.SBMP.ready()) { retry(null, 5000); return; }   // registre pas encore prêt (démarrage)
    let raid = await window.SBMP.getRaid(id);
    if (raid && (raid.status === 'enroute' || raid.status === 'resolving')) {
      await window.SBMP.resolveDue(true);
      raid = await window.SBMP.getRaid(id);
    }
    if (raid === null) {
      // Le raid n'existe plus au registre (saison remise à zéro) : la flotte rentre intacte
      _mpClearMission(fleet);
      toast(`${fleet.name} rentre : mission annulée par le registre`);
    } else if (!raid || (raid.status !== 'resolved' && raid.status !== 'aborted')) {
      retry(`${fleet.name} : rapport de combat en attente`);
      return;
    } else {
      _mpFinishRaid(fleet, raid);
    }
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  } catch (e) {
    console.warn('[MP] retour de raid :', e);
    retry();
  } finally {
    _mpReturning.delete(id);
  }
}

function _mpFinishRaid(fleet, raid) {
  if (window.SBSfx) SBSfx.play('fleet');   // SFX_2410
  const res = raid.result || {};
  const tgt = fleet.mpTarget || {};
  const target = { name: tgt.name || raid.defender_address, profile: 'Commandant · ' + (raid.defender_pseudo || tgt.pseudo || '?') };
  const combat = res.combat ? JSON.parse(JSON.stringify(res.combat)) : null;
  if (combat) combat.loot = Object.assign({ metal: 0, energie: 0, cristal: 0 }, res.loot || {});   // butin plafonné par le serveur
  if (combat && combat.phases && combat.phases.phase3 && combat.phases.phase3.executed) {
    combat.phases.phase3.loot = { ...combat.loot };
    combat.phases.phase3.cargoUsed = combat.loot.metal + combat.loot.energie + combat.loot.cristal;
  }
  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  const intent = getMissionIntent(fleet);
  const compositionBefore = JSON.parse(JSON.stringify(fleet.composition));
  const soldiersBefore = { ...fleet.soldiers };
  const heroesBefore = JSON.parse(JSON.stringify(fleet.heroes || {}));
  if (combat) applyCombatResult(fleet, combat, target);
  if (!G.reports) G.reports = [];
  G.reports.unshift({
    id: 'rpt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    fleetId: fleet.id, fleetName: fleet.name,
    targetId: fleet.missionTargetId, targetName: target.name, targetProfile: target.profile,
    doctrine: doctrine ? { key: doctrine.key, name: doctrine.name, color: doctrine.color, icon: doctrine.icon } : null,
    intent: { label: intent.label, icon: intent.icon },
    startedAt: fleet.missionStartedAt, returnedAt: Date.now(),
    fuelSpent: fleet.missionFuelSpent || 0, read: false,
    combat, compositionBefore, soldiersBefore, heroesBefore, placeholder: false,
    mpRaidId: raid.id, mpDamagedBuilding: res.damaged_building || null,
  });
  _mpClearMission(fleet);
  if (!Array.isArray(G.mpRaidsReturned)) G.mpRaidsReturned = [];   // PATCH_2010_AUDIT — retour déjà intégré (même si raidSeen échoue)
  G.mpRaidsReturned.push(raid.id); if (G.mpRaidsReturned.length > 200) G.mpRaidsReturned.splice(0, G.mpRaidsReturned.length - 200);
  if (window.SBMP) window.SBMP.raidSeen(raid.id);
  if (raid.status === 'aborted' || !combat) { toast(`${fleet.name} rentre : la cible a quitté le registre`); return; }
  try { sbEmpBountyCollected(res, raid.defender_pseudo); } catch (e) {}   // PATCH_2210_EMPIRE
  const labels = { crushing_victory: '⭐ Victoire écrasante', victory: 'Victoire', pyrrhic: 'Victoire à la Pyrrhus', defeat: 'Défaite', massacre: 'Massacre' };
  toast(`${fleet.name} : ${labels[combat.outcome] || 'Mission terminée'} sur ${target.name}`);
}
function _defLossPct(range, ratio, held) {
  // PATCH_0211_DEF_TENUE (Adrien 02/11) : défense tenue = pertes proportionnelles à la menace, sans plancher.
  // Avant : 10 % minimum même contre 1 tanker → 24 raids d'un tanker rasaient la défense.
  // Maintenant : 25 % × (attaque/défense)² — 1 tanker ≈ 0, moitié de la défense ≈ 6 %, attaque presque égale ≈ 25 %.
  if (held) { const r = Math.max(0, Math.min(1, ratio)); return range[1] * r * r; }
  const k = Math.max(0, Math.min(1, (ratio - 1) / 2));
  return range[0] + (range[1] - range[0]) * k;
}
function _defHitUnits(keys, pct, out) {
  for (const key of keys) {
    const u = G.defense && G.defense.units && G.defense.units[key];
    if (!u || !u.qty) continue;
    const away = getSoldiersInDeployedFleets(key) + getSoldiersInMissionFleets(key) + soldiersCommittedElsewhere(key);
    const inService = Math.max(0, u.qty - (u.dmg || 0) - away);
    const hit = Math.round(inService * pct);
    if (!hit) continue;
    const destroyed = Math.round(hit * DEF_LOSS.DESTROYED_SHARE), damaged = hit - destroyed;
    u.qty = Math.max(0, u.qty - destroyed);
    u.dmg = Math.min(u.qty, (u.dmg || 0) + damaged);
    out.units[key] = { destroyed, damaged };
    // PATCH_2010_AUDIT — les flottes préparées au sol perdent les soldats tués ou blessés (sinon ils repartaient en raid)
    try {
      const free = Math.max(0, u.qty - (u.dmg || 0) - away);
      const preps = ((G.fleet && G.fleet.prepared) || []).filter(f => (f.status || 'prepared') === 'prepared' && _sbMine(f) && f.soldiers && f.soldiers[key] > 0);
      const total = preps.reduce((t, f) => t + f.soldiers[key], 0);
      if (total > free) {
        let left = free;
        preps.forEach((f, i) => {
          const keep = i === preps.length - 1 ? left : Math.min(left, Math.floor(f.soldiers[key] * free / total));
          f.soldiers[key] = keep; left -= keep;
        });
      }
    } catch (e) {}
  }
}
function _defHitOrbitalFleets(pct, out) {
  for (const fleet of (G.fleet && G.fleet.prepared) || []) {
    if ((fleet.status || 'prepared') !== 'deployed' || !_sbMine(fleet)) continue;
    syncFleetIntegrity(fleet);
    for (const type of SHIP_TYPES_ALL) {
      const n = countShipsByType(fleet.composition, type), hit = Math.round(n * pct);
      if (!hit) continue;
      const destroyed = Math.round(hit * DEF_LOSS.DESTROYED_SHARE);
      const { lost } = distributeShipLosses(fleet.composition[type], destroyed);
      for (const tk of ['t1', 't2', 't3']) if (lost[tk]) loseShips(type, tk, lost[tk]);   // PATCH_2010_AUDIT — détruits = retirés du hangar
      syncFleetIntegrity(fleet);
      let left = hit - destroyed, damaged = 0;
      for (const tk of ['t3', 't2', 't1']) for (let i = 0; i < fleet.integrity[type][tk].length && left > 0; i++, left--, damaged++)
        fleet.integrity[type][tk][i] = Math.min(fleet.integrity[type][tk][i], 15 + Math.round(Math.random() * 30));
      const o = out.ships[type] || (out.ships[type] = { destroyed: 0, damaged: 0 });
      o.destroyed += destroyed; o.damaged += damaged;
    }
  }
}
function mpApplyDefenseLosses(combat, raidWon) {
  const out = { units: {}, ships: {} };
  const ph1 = combat && combat.phases && combat.phases.phase1, ph2 = combat && combat.phases && combat.phases.phase2;
  if (!ph1) return out;
  try {
    const r1 = ph1.defEffective > 0 ? ph1.atkEffective / ph1.defEffective : 9;
    const p1 = (raidWon || ph1.won) ? _defLossPct(DEF_LOSS.ORBIT_LOST, r1, false) : _defLossPct(DEF_LOSS.HELD, r1, true);
    _defHitUnits(DEF_TURRETS, p1, out);
    _defHitOrbitalFleets(p1, out);
    if (ph2) {
      const r2 = ph2.defEffective > 0 ? ph2.atkEffective / ph2.defEffective : 9;
      _defHitUnits(DEF_SOLDIERS, ph2.won ? _defLossPct(DEF_LOSS.GROUND_LOST, r2, false) : _defLossPct(DEF_LOSS.HELD, r2, true), out);
    }
  } catch (e) { console.warn('[MP] pertes défense', e); }
  return out;
}
function _defLossLines(L) {
  if (!L) return [];
  const rows = [], SN = { tanker: 'Tankers en orbite', fregate: 'Frégates en orbite', cuirasse: 'Cuirassés en orbite' };
  for (const [k, v] of Object.entries(L.units || {})) rows.push([(DEFENSE_UNITS[k] && DEFENSE_UNITS[k].name) || k, v]);
  for (const [k, v] of Object.entries(L.ships || {})) rows.push([SN[k] || k, v]);
  return rows;
}

function mpApplyRaidAgainstMe(raid) {   // PATCH_2010_WORLDS : le raid frappe la planète visée (capitale ou colonie)
  // PATCH_2010_AUDIT — pas d'intégration pendant une restauration cloud (la partie va être rechargée : le raid serait marqué vu sans être sauvegardé)
  if (window._sbResetting || (window.SBCloud && (SBCloud._conflict || SBCloud._switching))) return false;
  if (!raid || !raid.id) return false;
  if (Array.isArray(G.mpRaidsApplied) && G.mpRaidsApplied.includes(raid.id)) return true;
  let ok;
  if (typeof sbWithWorld !== 'function') ok = _mpApplyRaidAgainstHome(raid);
  else {
    const col = (G.worlds || []).find(w => w.kind === 'colony' && raid && w.coord && w.coord === raid.defender_address);
    ok = sbWithWorld(col ? col.id : 'home', () => _mpApplyRaidAgainstHome(raid));
  }
  if (ok) {
    if (!Array.isArray(G.mpRaidsApplied)) G.mpRaidsApplied = [];
    if (!G.mpRaidsApplied.includes(raid.id)) { G.mpRaidsApplied.push(raid.id); if (G.mpRaidsApplied.length > 200) G.mpRaidsApplied.splice(0, G.mpRaidsApplied.length - 200); }
    if (typeof saveGame === 'function' && saveGame() === false) return false;   // non sauvegardé : on ne marque pas le raid vu
    // rendu APRÈS le retour sur la planète affichée (sinon la colonie restait à l'écran)
    try { if (window.SBAftermath && SBAftermath.refresh) SBAftermath.refresh(); } catch (e) {}
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
  return ok;
}
function _mpApplyRaidAgainstHome(raid) {
  if (!raid || !raid.id) return false;
  if ((G.reports || []).some(r => r.mpRaidId === raid.id)) return true;   // déjà intégré
  const res = raid.result || {};
  if (raid.status === 'aborted' || res.outcome === 'aborted') return true;   // aucun combat : rien à intégrer
  // PATCH_1411_DEPW — la colonie visée (base de pillage 50 %). Définition retirée par erreur le 30/10 : le rapport de défense plantait,
  // le raid n'était jamais marqué vu et ses pertes étaient réappliquées à chaque relève.
  const _depW = (G.worlds || []).find(w => w && w.kind === 'colony' && w.id === G.activeWorld);
  const won = res.outcome === 'victory';
  const loot = Object.assign({ metal: 0, energie: 0, cristal: 0 }, won ? (res.loot || {}) : {});
  for (const k of ['metal', 'energie', 'cristal']) {   // 30/10 : le stock de la planète attaquée (capitale ou colonie)
    if (G.res[k]) G.res[k].v = Math.max(0, (G.res[k].v || 0) - (loot[k] || 0));
  }
  let damagedName = null;
  if (won && res.damaged_building) {
    const upIdx = (typeof QUEUES !== 'undefined' && QUEUES.capital && QUEUES.capital.upgrade) ? QUEUES.capital.upgrade.parcelIdx : -1;
    const p = (G.planet.parcels || []).find((q, qi) => q && q.building === res.damaged_building && q.state === 'built' && !q.damaged && qi !== upIdx);
    if (p) { mpDamageParcel(p, raid.attacker_pseudo); damagedName = p.n || _MP_BUILDING_LABEL(p.building); }
  }
  const combat = res.combat || null;
  const defLosses = mpApplyDefenseLosses(combat, won);
  if (!G.reports) G.reports = [];
  G.reports.unshift({
    id: 'rpt-def-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    kind: 'defense', mpRaidId: raid.id,
    fleetName: 'Raid de ' + (raid.attacker_pseudo || 'commandant inconnu'), targetName: ((G.planet && G.planet.name) || mpWorldSnapshot().planet_name || 'ta colonie'), worldId: G.activeWorld || 'home',
    intent: { label: won ? 'Raid subi · défense enfoncée' : 'Raid repoussé', icon: '' },
    doctrine: { color: won ? 'var(--red)' : 'var(--green)' },
    startedAt: Date.parse(raid.departed_at) || null, returnedAt: Date.parse(raid.resolved_at) || Date.now(), read: false,
    defense: {
      won: !won, attacker: raid.attacker_pseudo, attackerAddress: raid.attacker_address, fleetName: raid.fleet_name || '',
      garrisons: Array.isArray(res.garrisons) ? res.garrisons.slice(0, 3).map(x => ({ owner: String(x.owner || '').slice(0, 24), fleet: String(x.fleet || '').slice(0, 40), def: Math.max(0, Math.floor(Number(x.def) || 0)) })) : null,   // PATCH_2110_GARNISON
      loot, damagedName, losses: defLosses, lootPct: Number(res.loot_pct) || (_depW ? 0.5 : 0.3), lootBase: _depW ? 0.5 : 0.3,   // PATCH_2110_LOOTBASE : base 50 % (dépôt colonial) / 30 % (capitale)
      atk: combat && combat.phases && combat.phases.phase1 ? combat.phases.phase1.atkEffective : null,
      def: combat && combat.phases && combat.phases.phase1 ? combat.phases.phase1.defEffective : null,
      landed: !!(combat && combat.phases && combat.phases.phase2 && combat.phases.phase2.won),
      groundHeld: !!(combat && combat.phases && combat.phases.phase2 && !combat.phases.phase2.won),
    },
  });
  // APRÈS L'ATTAQUE (13/10) : fête si la défense tient, dévastation sinon ; rapport ouvert automatiquement
  if (window.SBAftermath) {
    const _ph = combat && combat.phases && combat.phases.phase2;
    try { SBAftermath.onRaid({ defended: !won, landed: !!(_ph && _ph.won), groundHeld: !!(_ph && !_ph.won), reportId: G.reports[0] && G.reports[0].id }); } catch (e) { console.warn('[aftermath]', e); }
  }
  try { sbEmpBountyPaid(res, raid.attacker_pseudo); } catch (e) {}   // PATCH_2210_EMPIRE
  const lootTxt = ['metal', 'energie', 'cristal'].filter(k => loot[k] > 0).map(k => `${fmt(loot[k])} ${tileInfo(k).label.toLowerCase()}`).join(' · ');
  toast(won
    ? `⚠ Raid de ${raid.attacker_pseudo} : ${lootTxt || 'rien'} pillé${damagedName ? ' · ' + damagedName + ' abîmé' : ''}`
    : `Raid de ${raid.attacker_pseudo} repoussé`);
  return true;
}

// Bâtiment abîmé : la moitié de sa production s'arrête jusqu'à réparation
function _mpTierProd(p) {
  return (BUILDING_TIERS[p.building] && BUILDING_TIERS[p.building][p.lvl || 1] && BUILDING_TIERS[p.building][p.lvl || 1].prod)
    || (BUILDINGS[p.building] && BUILDINGS[p.building].prod) || {};
}
function mpDamageParcel(p, byPseudo) {
  if (!p || p.damaged) return;
  p.damaged = true;
  p.damagedAt = Date.now();
  p.damagedBy = byPseudo || null;
  p.damageLoss = {};
  for (const [res, rate] of Object.entries(_mpTierProd(p))) {
    if (G.res[res] && G.res[res].rate !== undefined) { G.res[res].rate -= rate / 2; p.damageLoss[res] = rate / 2; }
  }
}
// REPAIR_1110 — réparer = jouer : une partie de match-3 sur le bâtiment, palier I atteint
function mpStartRepair(idx) {
  const p = G.planet.parcels[idx];
  if (!p || !p.damaged) return;
  if (typeof window.startM3 === 'function') window.startM3(idx, 'Réparation');
  else toast('Match-3 indisponible pour le moment');
}
function mpRepairCost(p) {
  const tier = (BUILDING_TIERS[p.building] && BUILDING_TIERS[p.building][p.lvl || 1]) || {};
  const out = {};
  for (const [res, q] of Object.entries(tier.cost || { metal: 200 })) out[res] = Math.max(1, Math.ceil(q * 0.25));
  return out;
}
function mpRepairParcel(idx, opts) {
  const p = G.planet.parcels[idx];
  if (!p || !p.damaged) return;
  if (!(opts && opts.free)) {
    const cost = mpRepairCost(p);
    if (!canAffordCost(cost)) { toast('Ressources insuffisantes'); return; }
    for (const [res, q] of Object.entries(cost)) G.res[res].v -= q;
  }
  const loss = p.damageLoss || Object.fromEntries(Object.entries(_mpTierProd(p)).map(([r, v]) => [r, v / 2]));
  for (const [res, v] of Object.entries(loss)) {
    if (G.res[res] && G.res[res].rate !== undefined) G.res[res].rate += v;
  }
  p.damageLoss = null;
  p.damaged = false;
  p.damagedAt = null;
  p.damagedBy = null;
  toast(`${p.n || _MP_BUILDING_LABEL(p.building)} réparé`);
  if (typeof saveGame === 'function') saveGame();
  const bd = document.getElementById('scr-building-detail');
  if (bd && !bd.classList.contains('hidden')) renderBuildingDetail();
}
function mpIngestFlags(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!G.reports) G.reports = [];
  const fresh = [];
  for (const f of rows) {
    const known = G.reports.find(r => r.mpFlagId === f.id);
    if (known) { known.flag.replied = known.flag.replied || !!f.replied; continue; }
    const def = MP_FLAG_BY_KEY[f.flag_key];
    if (!def) continue;
    G.reports.unshift({
      id: 'rpt-flag-' + f.id, kind: 'flag', mpFlagId: f.id,
      fleetName: '⚑ ' + (f.from_pseudo || 'Commandant'), targetName: def.label,
      intent: { label: MP_FLAG_CONTEXT[f.context] || '', icon: '' }, doctrine: { color: def.color },
      returnedAt: Date.parse(f.created_at) || Date.now(), read: !!f.seen,
      flag: { from: f.from_pseudo, address: f.from_address || null, planet: f.from_planet || null, key: f.flag_key, context: f.context, at: Date.parse(f.created_at) || Date.now(), replied: !!f.replied },
    });
    if (f.from_address && typeof mergeRealWorlds === 'function') {
      const sysKey = String(f.from_address).split('-').slice(0, 3).join('-');
      mergeRealWorlds(sysKey, [{ address: f.from_address, pseudo: f.from_pseudo, planet_name: f.from_planet }], { noReport: true });   // NIVEAU_0811 : niveau inconnu, pas « 1 »
    }
    if (!f.seen) fresh.push(f);
  }
  if (fresh.length) {
    const f = fresh[0];
    toast(`⚑ ${f.from_pseudo} hisse un pavillon : « ${(MP_FLAG_BY_KEY[f.flag_key] || {}).label || ''} »${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`);
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
  return fresh;
}
function _mpFlagChips(onclickFn, disabledKeys) {
  return PLAYER_MESSAGE_FLAGS.map(f => {
    const key = MP_FLAG_KEY[f.id];
    const off = disabledKeys && disabledKeys.includes(key);
    return `<div ${off ? '' : `onclick="${onclickFn}('${key}')"`} style="padding:10px 12px;margin-bottom:6px;background:rgba(20,25,30,.9);border:1px solid ${f.color}40;border-radius:8px;${off ? 'opacity:.45' : 'cursor:pointer'}">
      <div style="font-size:12px;color:${f.color};font-weight:600">${f.label}</div>
      <div style="font-size:10px;color:var(--mut);margin-top:2px">${f.desc}</div></div>`;
  }).join('');
}
function renderFlagReportDetail(r) {
  const fl = r.flag || {};
  const def = MP_FLAG_BY_KEY[fl.key] || {};
  document.getElementById('report-detail-title').textContent = 'PAVILLON';
  document.getElementById('report-detail-meta').textContent = `${fl.from || '?'} · ${new Date(fl.at || r.returnedAt).toLocaleString('fr-FR')}`;
  const el = document.getElementById('report-detail-content');
  if (!el) return;
  const canReply = !fl.replied && !fl.tooOld && window.SBMP && window.SBMP.ready();   // PATCH_1510_FLAGS : plus de délai de 24 h
  el.innerHTML = `
    <div style="margin:0 16px 14px;padding:22px 18px;border:1px solid ${(def.color || '#5fffe8')}55;border-radius:12px;background:rgba(20,25,30,.6);text-align:center">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase">Pavillon hissé ${MP_FLAG_CONTEXT[fl.context] || ''}</div>
      <div style="font-size:22px;color:${def.color || '#e6f0ff'};font-weight:700;margin:12px 0 6px;font-family:'Charter','Iowan Old Style',Georgia,serif">« ${def.label || fl.key} »</div>
      <div style="font-size:13px;color:#e6f0ff">${fl.from || 'Un commandant'}${fl.planet ? ` · ${fl.planet}` : ''}</div>
      ${fl.address ? `<div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace;margin-top:4px">${fl.address} · ajouté à ton carnet</div>` : ''}
    </div>
    <div style="margin:0 16px 14px">
      ${fl.replied ? `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:10px">Tu as répondu à ce pavillon.</div>`
        : canReply ? `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Répondre · une fois</div>${_mpFlagChips(`mpReplyFlag.bind(null,'${r.id}')`)}`
        : `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:10px">${fl.tooOld ? 'Le registre refuse encore les réponses tardives (mise à jour du serveur à passer). Envoie un tanker en vigie chez lui pour rouvrir le canal.' : 'Registre hors ligne pour le moment.'}</div>`}
    </div>`;
}
async function mpReplyFlag(reportId, key) {
  const r = (G.reports || []).find(x => x.id === reportId);
  if (!r || !r.flag || r.flag.replied || !window.SBMP) return;
  if (!(await _mpConfirmFlag(key, r.flag.from))) return;
  try {
    await window.SBMP.replyFlag(r.mpFlagId, key);
    r.flag.replied = true;
    toast(`Réponse hissée : « ${(MP_FLAG_BY_KEY[key] || {}).label || key} »`); _mpRelRefreshSoon();
    if (typeof saveGame === 'function') saveGame();
  } catch (e) { toast(_mpFlagErr(e)); if (/already_replied/.test(String(e && e.message))) r.flag.replied = true; if (/flag_too_old/.test(String(e && e.message))) r.flag.tooOld = true; }
  renderFlagReportDetail(r);
}
// Défenseur → assaillant, depuis le rapport de défense
async function mpFlagAttacker(reportId, key) {
  const r = (G.reports || []).find(x => x.id === reportId);
  const d = r && r.defense;
  if (!d || d.flagSent || !d.attackerAddress || !window.SBMP) return;
  if (!(await _mpConfirmFlag(key, d.attacker))) return;
  try {
    await window.SBMP.sendFlag(d.attackerAddress, key, 'raid');
    d.flagSent = key;
    toast(`Pavillon « ${(MP_FLAG_BY_KEY[key] || {}).label || key} » envoyé à ${d.attacker}`); _mpRelRefreshSoon();
    if (typeof saveGame === 'function') saveGame();
  } catch (e) { toast(_mpFlagErr(e)); }
  renderDefenseReportDetail(r);
}
// PATCH_2110_PAV_FIX — après un pavillon : relations et pactes relus tout de suite (pas au prochain tour de veille)
function _mpRelRefreshSoon() {
  if (!window.SBMP) return;
  setTimeout(() => { try { SBMP.pollRelations && SBMP.pollRelations(true); SBMP.pollOrbits && SBMP.pollOrbits(); } catch (e) {} }, 1500);
}
function _mpDiploErr(e) {
  const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_DIPLO_ERRORS[c]);
  return code ? MP_DIPLO_ERRORS[code] : 'Le registre ne répond pas, réessaie';
}
function _mpDiplo() {
  if (!G.mpDiplo || typeof G.mpDiplo !== 'object') G.mpDiplo = {};
  if (!G.mpDiplo.seen) G.mpDiplo.seen = {};
  if (!G.mpDiplo.pacts) G.mpDiplo.pacts = {};
  return G.mpDiplo;
}
// Pacte ouvert (proposé ou actif) avec le commandant de cette adresse — dernière image connue du registre
function mpPactWith(address, pseudo) {
  if (!address && !pseudo) return null;
  const all = Object.values(_mpDiplo().pacts);
  const same = k => (address && k.otherAddress === address) || (pseudo && k.otherPseudo === pseudo);   // PATCH_2110_PAVILLONS : une colonie du même commandant
  return all.find(k => k.status === 'active' && same(k))
      || all.find(k => k.status === 'proposed' && same(k)) || null;
}
// PATCH_2110_PAVILLONS — relations officielles (ennemi, accord commercial), relevées au registre chaque minute
function mpRelWith(address, pseudo, kind) {
  const r = (G.mpRelations || []).find(r => (!kind || r.kind === kind) && ((address && (r.addresses || []).includes(address)) || (pseudo && r.pseudo === pseudo))) || null;
  if (r || (kind && kind !== 'trade') || typeof mpAllyMember !== 'function') return r;
  // PATCH_2110_ALLIANCES — entre alliés, l'accord commercial est automatique
  const m = mpAllyMember(address, pseudo);
  return m ? { kind: 'trade', pseudo: m.pseudo, addresses: m.addresses, byMe: false, ally: true, since: m.joined_at, until: null } : null;
}
function mpIngestRelations(rows) {
  const prev = Array.isArray(G.mpRelations) ? G.mpRelations : null;
  const key = r => r.kind + ':' + r.pseudo;
  if (prev) {
    const before = new Set(prev.map(key)), after = new Set(rows.map(key));
    for (const r of rows) if (!before.has(key(r))) {
      toast(r.kind === 'enemy' ? (r.byMe ? `⚔ ${r.pseudo} est désormais ton ennemi déclaré` : `⚔ ${r.pseudo} t'a déclaré ennemi`) : `⚑ Accord commercial avec ${r.pseudo} · 7 jours`);
      if (r.kind === 'trade') setTimeout(() => mpTradeOffer(r.pseudo), 1200);   // PATCH_2110_COMMERCE
    }
    for (const r of prev) if (!after.has(key(r))) {
      toast(r.kind === 'enemy' ? `☮ Paix conclue avec ${r.pseudo} : la rivalité est levée` : `Accord commercial avec ${r.pseudo} terminé`);
    }
  }
  const changed = JSON.stringify(prev) !== JSON.stringify(rows);
  G.mpRelations = rows;
  if (changed) { try { saveGame(); } catch (e) {} try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {} }
}
function mpRelBadge(address, pseudo) {
  const e = mpRelWith(address, pseudo, 'enemy'), t = mpRelWith(address, pseudo, 'trade');
  const al = typeof mpAllyMember === 'function' && mpAllyMember(address, pseudo);
  return (al ? ` <span style="color:${mpAlly().alliance.color};font-weight:600">· Allié</span>` : '') + (e ? ' <span style="color:#ff4d4d;font-weight:600">· Ennemi</span>' : '') + (t && !al ? ' <span style="color:#ffc864">· Partenaire commercial</span>' : '');
}
function mpTradePrice(c) {
  return Math.floor(['metal', 'energie', 'cristal'].reduce((s, k) => s + Math.max(0, Math.floor(Number(c && c[k]) || 0)) * MP_TRADE_PRICE[k], 0));
}
function mpTradeSurplus() {
  const o = {};
  for (const k of ['metal', 'energie', 'cristal']) { const r = G.res && G.res[k]; o[k] = r ? Math.max(0, Math.floor(r.v - r.max * MP_TRADE_SURPLUS)) : 0; }
  return o;
}
function mpTradeCap(pseudo) {
  const c = (G.mpTradeCaps || {})[pseudo];
  return Number.isFinite(c) ? c : MP_TRADE_CAP_DEFAULT;
}
async function mpTradeSetCap(key) {
  const tr = mpRelWith(key, key, 'trade'), pseudo = tr ? tr.pseudo : key;
  if (typeof sbPrompt !== 'function') return;
  const v = await sbPrompt({ title: 'Plafond d\'achat', body: `Combien de CG au plus par livraison de <strong>${_esc(pseudo)}</strong> ?<br><br>Au-delà, son tanker repart avec le reste de sa cale.`,
    placeholder: String(mpTradeCap(pseudo)), confirmLabel: 'Valider', maxLength: 7 });
  if (v == null) return;
  const n = Math.max(0, Math.min(1000000, Math.floor(Number(String(v).replace(/[^\d]/g, '')) || 0)));
  if (!G.mpTradeCaps) G.mpTradeCaps = {};
  G.mpTradeCaps[pseudo] = n;
  toast(`Plafond d'achat chez ${pseudo} : ${fmt(n)} CG par livraison`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
// Ouvre le tanker, cale déjà chargée du surplus (les ressources les plus chères d'abord)
function mpTradeDeliver(key) {
  const tr = mpRelWith(key, key, 'trade');
  if (!tr || !(tr.addresses || []).length) { toast('Pas d\'accord commercial en cours avec ce commandant'); return; }
  const addr = tr.addresses[0], pseudo = tr.pseudo;
  if (typeof findPlanetByCoord === 'function' && !findPlanetByCoord(addr)) _mpMergeSender(addr, pseudo);
  if (tankerAvailability(null) <= 0) { toast('Aucun tanker disponible'); return; }
  openTankerCompose(addr);
  const c = G.tankerComposing;
  if (!c || c.destination !== addr) return;
  c.trade = { pseudo, address: addr };
  if (!c.realPlayer) c.realPlayer = { address: addr, pseudo };
  _mpTradeFill(c);
  if (typeof renderTankerCompose === 'function') renderTankerCompose();
}
function _mpTradeFill(c) {
  const cap = _composeCargoMax(c);
  const s = mpTradeSurplus();
  let free = cap;
  c.cargo.resources = { metal: 0, energie: 0, cristal: 0 };
  for (const k of ['cristal', 'energie', 'metal']) { const q = Math.min(s[k], free); c.cargo.resources[k] = q; free -= q; }
}
// À la signature d'un accord : proposer tout de suite une livraison
async function mpTradeOffer(pseudo) {
  const s = mpTradeSurplus();
  if (_mpCargoSum(s) <= 0 || tankerAvailability(null) <= 0 || typeof sbConfirm !== 'function') return;
  const ok = await sbConfirm({ title: 'Accord commercial',
    body: `Accord signé avec <strong>${_esc(pseudo)}</strong> pour 7 jours.<br><br>Ton surplus (au-delà de 70 % de tes silos) : ${_mpResLine(s)}.<br><br>Le livrer maintenant ? Il te paie au prix du milieu du marché (métal 2,5 · énergie 3,5 · cristal 8,5 CG), le tanker rentre avec les CG.`,
    confirmLabel: 'Préparer le tanker', cancelLabel: 'Plus tard' });
  if (ok) mpTradeDeliver(pseudo);
}
// Arrivée chez le partenaire : la livraison est inscrite, le tanker attend d'être payé
function mpTradeArrival(mission) {
  const f = typeof computeRouteLootFactor === 'function' ? computeRouteLootFactor(mission) : 1;
  const res = (mission.cargo && mission.cargo.resources) || {};
  mission.mpOffered = {};
  for (const k of ['metal', 'energie', 'cristal']) mission.mpOffered[k] = Math.max(0, Math.floor((res[k] || 0) * f));
  mission.status = 'trade_wait';
  mission.tradeWaitSince = Date.now();
  toast(`${mission.tankerName} chez ${mission.mpTrade.pseudo} · livraison proposée : ${_mpResLine(mission.mpOffered)}`);
  if (typeof saveGame === 'function') saveGame();
  mpTradeRegister(mission);
}
async function mpTradeRegister(mission) {
  if (!mission || mission.mpTradeId || mission.status !== 'trade_wait' || _mpTradeBusy.has(mission.id)) return;
  if (!window.SBMP || !window.SBMP.ready()) return;
  _mpTradeBusy.add(mission.id);
  try {
    const d = await window.SBMP.tradeArrive(mission.mpTrade.address, mission.id, mission.tankerName, mission.mpOffered || {});
    if (d && d.id) mission.mpTradeId = d.id;
    if (typeof saveGame === 'function') saveGame();
    setTimeout(() => { try { SBMP.pollTrade(true); } catch (e) {} }, 1500);
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/no_trade|target_unknown|target_self|trade_rate/.test(msg)) {
      mpTradeReturn(mission, null, /no_trade/.test(msg) ? 'L\'accord commercial est terminé' : /trade_rate/.test(msg) ? '12 livraisons par jour au plus' : 'Ce commandant n\'est plus au registre');
    } else console.warn('[commerce] inscription :', msg);
  } finally { _mpTradeBusy.delete(mission.id); }
}
// Issue d'une livraison : le tanker rentre avec les CG et ce qui n'a pas été acheté
function mpTradeReturn(m, d, why) {
  if (!m || m.status !== 'trade_wait') return;
  const sold = (d && d.status === 'settled') ? d.bought : { metal: 0, energie: 0, cristal: 0 };
  const res = (m.cargo && m.cargo.resources) || {};
  const back = {};
  // la taxe de la voie ne s'applique qu'à ce qui est livré : vendu = cale × facteur, le reste rentre intact
  const f = typeof computeRouteLootFactor === 'function' ? (computeRouteLootFactor(m) || 1) : 1;
  for (const k of ['metal', 'energie', 'cristal']) back[k] = Math.max(0, (res[k] || 0) - ((sold[k] || 0) > 0 ? Math.ceil((sold[k] || 0) / f) : 0));
  if (m.cargo) m.cargo.resources = back;
  m.mpTradeTax = (d && d.status === 'settled') ? Math.max(0, d.tax_cg || 0) : 0;   // PATCH_2410_PACIFIQUE : 20 % entre pacifique et conquérant
  m.mpTradeCG = (d && d.status === 'settled') ? Math.max(0, d.paid_cg - m.mpTradeTax) : 0;
  m.mpTradeResult = { sold, paid: m.mpTradeCG, tax: m.mpTradeTax, expired: !!(d && d.status === 'expired'), why: why || null };
  const now = Date.now();
  m.status = 'returning';
  m.cancelledAt = now;
  m.returnArrivalAt = now + Math.max(60000, (m.arrivalAt || now) - (m.departedAt || now));
  const who = m.mpTrade.pseudo;
  toast(why ? `${m.tankerName} : ${why} · retour avec la cale`
    : d && d.status === 'expired' ? `${who} n'a pas répondu en 12 h : ${m.tankerName} rentre avec sa cale`
    : _mpCargoSum(sold) > 0 ? `${who} a acheté ${_mpResLine(sold)} · +${fmt(m.mpTradeCG)} CG au retour de ${m.tankerName}${m.mpTradeTax ? ` (taxe pacifique −${fmt(m.mpTradeTax)} CG)` : ''}`
    : `${who} n'a rien pu acheter (CG, plafond ou silos) : ${m.tankerName} rentre avec sa cale`);
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
// Retour au port : les CG de la vente (appelé par handleTankerReturnFromCancellation)
function mpTradeCashIn(m) {
  if (!m || !m.mpTrade || !m.mpTradeResult || m.mpTradeCashed) return;
  m.mpTradeCashed = true;
  const r = m.mpTradeResult;
  if (r.paid > 0) G.credits = (G.credits || 0) + r.paid;
  const back = (m.cargo && m.cargo.resources) || {};
  _mpDiploReport('trade_sold', { pseudo: m.mpTrade.pseudo, address: m.mpTrade.address, tanker: m.tankerName, sold: r.sold, paid: r.paid, back, expired: r.expired, why: r.why }, 'trs-' + m.id);
}
// Acheteur : ce que je peux payer (CG disponibles, plafond pour ce partenaire, place dans les silos)
function _mpTradeWant(d) {
  const budget = Math.max(0, Math.min(Math.floor(G.credits || 0), mpTradeCap(d.seller_pseudo)));
  const want = {};
  for (const k of ['metal', 'energie', 'cristal']) {
    const r = G.res && G.res[k];
    const room = r ? Math.max(0, Math.floor(r.max - r.v)) : 0;
    want[k] = Math.min(d.cargo[k] || 0, room);
  }
  const cost = mpTradePrice(want);
  if (cost > budget) {
    const f = cost > 0 ? budget / cost : 0;
    for (const k of ['metal', 'energie', 'cristal']) want[k] = Math.floor(want[k] * f);
  }
  return want;
}
async function _mpTradeBuy(d) {
  const L = _mpLedger('trd:' + d.id);
  if (L && L.settled) return;
  if (_mpTradeBusy.has(d.id)) return;
  _mpTradeBusy.add(d.id);
  try {
    const res = await window.SBMP.tradeSettle(d.id, _mpTradeWant(d));
    if (res) _mpTradeApplyBuy(res);
  } catch (e) { console.warn('[commerce] règlement :', String(e && e.message || e)); }
  finally { _mpTradeBusy.delete(d.id); }
}
function _mpTradeApplyBuy(d) {
  if (!d || d.status !== 'settled') return;
  const key = 'trd:' + d.id;
  const L = _mpLedger(key);
  if (L && L.settled) { if (!d.buyer_applied) window.SBMP.tradeDone(d.id); return; }
  if (d.buyer_applied) { _mpLedgerSet(key, { settled: true }); return; }
  G.credits = Math.max(0, (G.credits || 0) - d.paid_cg);
  _mpPay(d.bought, +1, true);
  _mpLedgerSet(key, { settled: true });
  _mpDiploReport('trade_bought', { pseudo: d.seller_pseudo, address: d.seller_address, tanker: d.tanker, offered: d.cargo, bought: d.bought, paid: d.paid_cg }, 'trb-' + d.id);
  toast(_mpCargoSum(d.bought) > 0 ? `Livraison de ${d.seller_pseudo} : +${_mpResLine(d.bought)} · −${fmt(d.paid_cg)} CG` : `Livraison de ${d.seller_pseudo} : rien acheté (CG, plafond ou silos)`);
  if (typeof saveGame === 'function') saveGame();
  window.SBMP.tradeDone(d.id);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
// Relève du registre (toutes les 20 s au plus, à chaque tour de veille)
async function mpIngestTrade(rows, meId) {
  for (const m of G.tankerMissions || []) if (m.status === 'trade_wait' && !m.mpTradeId) mpTradeRegister(m);
  for (const d of rows) {
    if (d.buyer_id === meId) {
      if (d.status === 'waiting') await _mpTradeBuy(d);
      else if (d.status === 'settled' && !d.buyer_applied) _mpTradeApplyBuy(d);
    }
    if (d.seller_id === meId && d.status !== 'waiting') {
      const m = (G.tankerMissions || []).find(x => x.id === d.mission);
      if (m && m.status === 'trade_wait') mpTradeReturn(m, d);
      if (!m || m.status !== 'trade_wait') window.SBMP.tradeDone(d.id);
    }
  }
}
function mpTradeBlockHtml(addr, pseudo) {
  const tr = mpRelWith(addr, pseudo, 'trade');
  if (!tr) return '';
  const pending = (G.tankerMissions || []).filter(m => m.mpTrade && m.mpTrade.pseudo === tr.pseudo && ['in_transit', 'trade_wait', 'returning'].includes(m.status));
  const s = mpTradeSurplus();
  return `<div style="margin-top:8px;font-size:11px;color:var(--mut);line-height:1.5">
      Surplus livrable : ${_mpCargoSum(s) > 0 ? `<span style="color:#ffc864">${_mpResLine(s)}</span> (≈ ${fmt(mpTradePrice(s))} CG)` : 'aucun (rien au-delà de 70 % de tes silos)'}<br>
      Tu achètes ses livraisons jusqu'à <span style="color:#e6f0ff">${fmt(mpTradeCap(tr.pseudo))} CG</span> chacune · <a onclick="mpTradeSetCap('${addr}')" style="color:#ffc864;text-decoration:underline;cursor:pointer">modifier</a>
      ${pending.length ? `<br>${pending.map(m => `${m.tankerName} : ${m.status === 'in_transit' ? 'en route' : m.status === 'trade_wait' ? 'attend son paiement' : 'rentre'}`).join(' · ')}` : ''}
    </div>
    <div style="display:flex;margin-top:8px">${_mpDiploBtn('Livrer le surplus', `mpTradeDeliver('${addr}')`)}</div>`;
}
function _mpAllyErr(e) {
  const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_ALLY_ERRORS[c]);
  return code ? MP_ALLY_ERRORS[code] : 'Le registre ne répond pas, réessaie';
}
function mpAlly() { return G.mpAlliance || { alliance: null, members: [], invites: [], sent: [], messages: [] }; }
function mpAllyMember(address, pseudo) {
  const A = mpAlly();
  if (!A.alliance) return null;
  return A.members.find(m => !m.me && ((address && (m.addresses || []).includes(address)) || (pseudo && m.pseudo === pseudo))) || null;
}
function mpAllyTag(address) { return (G.mpAllianceTags || {})[address] || null; }
function mpAllyBadge(address) {
  const t = mpAllyTag(address);
  return t ? ` <span style="color:${t.color};font-weight:600">[${_esc(t.alliance)}]</span>` : '';
}
function mpIngestAlliance(st, tags) {
  const prev = G.mpAlliance || null;
  if (tags) { const o = {}; for (const t of tags) o[t.address] = { alliance: t.alliance, color: t.color }; G.mpAllianceTags = o; }
  // nouvelles invitations
  for (const i of st.invites) {
    if (prev && (prev.invites || []).some(x => x.id === i.id)) continue;
    _mpDiploReport('alliance_invite', { pseudo: i.by, address: i.by_address, inviteId: i.id, alliance: i.alliance, color: i.color, members: i.members, state: 'pending' }, 'ainv-' + i.id);
    toast(`⚑ ${i.by} t'invite dans l'alliance ${i.alliance}`);
  }
  if (prev) {
    const was = prev.alliance, now = st.alliance;
    if (was && !now && !G._mpAllyLeaving) toast(`Tu ne fais plus partie de l'alliance ${was.name}`);
    if (!was && now) toast(`Tu as rejoint l'alliance ${now.name}`);
    if (was && now && was.id === now.id) {
      const before = new Set(prev.members.map(m => m.pseudo)), after = new Set(st.members.map(m => m.pseudo));
      for (const m of st.members) if (!before.has(m.pseudo)) toast(`⚑ ${m.pseudo} rejoint ${now.name}`);
      for (const m of prev.members) if (!after.has(m.pseudo)) toast(`${m.pseudo} a quitté ${now.name}`);
      if (!was.leader && now.leader) toast(`Tu es désormais chef de ${now.name}`);
      const seen = new Set((prev.messages || []).map(x => x.id));
      const fresh = st.messages.filter(x => !seen.has(x.id) && !x.mine);
      if (fresh.length) { G.mpAllyUnread = (G.mpAllyUnread || 0) + fresh.length; if (!document.getElementById('sb-ally-sheet')) toast(`💬 ${fresh[fresh.length - 1].pseudo} (${now.name}) : ${fresh[fresh.length - 1].body.slice(0, 60)}`); }
    }
  }
  G._mpAllyLeaving = false;
  const changed = JSON.stringify(prev) !== JSON.stringify(st);
  G.mpAlliance = st;
  if (changed) {
    try { saveGame(); } catch (e) {}
    if (document.getElementById('sb-ally-sheet')) mpAllyRender();
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
  }
}
function _mpAllyResync() { setTimeout(() => { try { SBMP.pollAlliance(true); SBMP.pollRelations && SBMP.pollRelations(true); } catch (e) {} }, 600); }
function mpAllyCanFound() {
  return !mpAlly().alliance && Object.values(_mpDiplo().pacts).some(k => k.status === 'active' && k.anchor);
}
async function mpAllyFound() {
  if (_mpAllyBusy || !window.SBMP || !SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  if (!mpAllyCanFound()) { toast(MP_ALLY_ERRORS.alliance_needs_pact); return; }
  if ((G.credits || 0) < MP_ALLY_COST) { toast(`Fonder une alliance coûte ${fmt(MP_ALLY_COST)} CG`); return; }
  const name = await sbPrompt({ title: 'Fonder une alliance', body: `Son nom, visible de tous (3 à 24 caractères).<br><br>Coût : <strong>${fmt(MP_ALLY_COST)} CG</strong>. Tu en deviens le chef ; ${MP_ALLY_MAX} membres au plus.`,
    placeholder: 'ex. Ligue d\'Alphard', confirmLabel: 'Fonder', maxLength: 24 });
  if (name == null || !String(name).trim()) return;
  const color = MP_ALLY_COLORS[Math.floor(Math.random() * MP_ALLY_COLORS.length)];
  _mpAllyBusy = true;
  try {
    await SBMP.allianceFound(String(name).trim(), color);
    G.credits = Math.max(0, (G.credits || 0) - MP_ALLY_COST);
    if (typeof saveGame === 'function') saveGame();
    toast(`Alliance ${String(name).trim()} fondée · −${fmt(MP_ALLY_COST)} CG`);
    await SBMP.pollAlliance(true);
    mpOpenAlliance();
  } catch (e) { toast(_mpAllyErr(e)); }
  finally { _mpAllyBusy = false; }
}
async function mpAllyInvite(address) {
  if (_mpAllyBusy || !window.SBMP || !SBMP.ready()) return;
  _mpAllyBusy = true;
  try { await SBMP.allianceInvite(address); toast('Invitation envoyée'); _mpAllyResync(); }
  catch (e) { toast(_mpAllyErr(e)); }
  finally { _mpAllyBusy = false; }
}
async function mpAllyAnswer(inviteId, accept) {
  if (_mpAllyBusy || !window.SBMP || !SBMP.ready()) return;
  const inv = mpAlly().invites.find(i => i.id === inviteId);
  if (accept && inv && !(await sbConfirmWarning('Rejoindre ' + inv.alliance, `Rejoindre l'alliance <strong>${_esc(inv.alliance)}</strong> (${inv.members} membre${inv.members > 1 ? 's' : ''}) ?<br><br>Entre membres : ni raid ni abordage, accord commercial et canal commun. Si tu pars, tu ne pourras pas attaquer un ancien allié pendant 24 h.`, 'Rejoindre'))) return;
  _mpAllyBusy = true;
  try {
    const st = await SBMP.allianceAnswer(inviteId, accept);
    const rep = (G.reports || []).find(r => r.id === 'rpt-diplo-ainv-' + inviteId);
    if (rep) rep.diplo.state = st;
    toast(st === 'accepted' ? 'Bienvenue dans l\'alliance' : st === 'declined' ? 'Invitation déclinée' : 'Cette invitation a expiré');
    _mpAllyResync();
  } catch (e) { toast(_mpAllyErr(e)); }
  finally { _mpAllyBusy = false; if (typeof renderReportDetail === 'function') try { renderReportDetail(); } catch (e) {} }
}
async function mpAllyLeave() {
  const A = mpAlly(); if (!A.alliance || _mpAllyBusy) return;
  const ok = await sbConfirmWarning('Quitter ' + A.alliance.name, `Quitter l'alliance <strong>${_esc(A.alliance.name)}</strong> ?<br><br>Le comptoir le saura. Pendant 24 h, ni toi ni tes anciens alliés ne pourrez vous attaquer.${A.alliance.leader && A.members.length > 1 ? '<br><br>Le membre le plus ancien deviendra chef.' : A.members.length <= 1 ? '<br><br>Tu es le dernier membre : l\'alliance sera dissoute.' : ''}`, 'Quitter');
  if (!ok) return;
  _mpAllyBusy = true;
  try { G._mpAllyLeaving = true; await SBMP.allianceLeave(); toast(`Tu as quitté ${A.alliance.name}`); _mpAllyResync(); }
  catch (e) { G._mpAllyLeaving = false; toast(_mpAllyErr(e)); }
  finally { _mpAllyBusy = false; }
}
async function mpAllyKick(address) {
  const A = mpAlly(); const m = A.members.find(x => x.address === address);
  if (!A.alliance || !A.alliance.leader || !m || _mpAllyBusy) return;
  const ok = await sbConfirmWarning('Exclure ' + m.pseudo, `Exclure <strong>${_esc(m.pseudo)}</strong> de ${_esc(A.alliance.name)} ?<br><br>Le comptoir le saura. Pendant 24 h, aucune attaque possible entre vous.`, 'Exclure');
  if (!ok) return;
  _mpAllyBusy = true;
  try { await SBMP.allianceKick(address); toast(`${m.pseudo} exclu`); _mpAllyResync(); }
  catch (e) { toast(_mpAllyErr(e)); }
  finally { _mpAllyBusy = false; }
}
async function mpAllyCancelInvite(id) {
  try { await SBMP.allianceCancelInvite(id); _mpAllyResync(); } catch (e) { toast(_mpAllyErr(e)); }
}
async function mpAllySend() {
  const el = document.getElementById('sb-ally-input'); if (!el) return;
  const body = el.value.trim(); if (!body) return;
  try { await SBMP.allianceChat(body); el.value = ''; await SBMP.pollAlliance(true); }
  catch (e) { toast(_mpAllyErr(e)); }
}
function mpOpenAlliance() {
  let ov = document.getElementById('sb-ally-sheet');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'sb-ally-sheet';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(2,6,12,.62);display:flex;align-items:flex-end';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }
  G.mpAllyUnread = 0;
  mpAllyRender();
  if (window.SBMP && SBMP.ready()) SBMP.pollAlliance(true);
}
function mpAllyRender() {
  const ov = document.getElementById('sb-ally-sheet'); if (!ov) return;
  const A = mpAlly(), al = A.alliance;
  const btn = (label, on, tone) => _mpDiploBtn(label, on, tone);
  let body = '';
  if (!al) {
    body += `<div style="font-size:12px;color:var(--mut);line-height:1.6;margin-bottom:12px">Tu n'es dans aucune alliance.<br>Entre membres : ni raid ni abordage, accord commercial automatique, canal commun. ${MP_ALLY_MAX} membres au plus.</div>`;
    for (const i of A.invites) body += `<div style="padding:12px;border:1px solid ${i.color}66;border-radius:8px;margin-bottom:10px"><div style="font-size:13px;color:${i.color};font-weight:600">${_esc(i.alliance)}</div><div style="font-size:11px;color:var(--mut);margin:3px 0 10px">Invitation de ${_esc(i.by)} · ${i.members} membre${i.members > 1 ? 's' : ''}</div><div style="display:flex;gap:8px">${btn('Rejoindre', `mpAllyAnswer('${i.id}',true)`)}${btn('Décliner', `mpAllyAnswer('${i.id}',false)`, 'mut')}</div></div>`;
    body += mpAllyCanFound()
      ? `<div style="display:flex">${btn(`Fonder une alliance · ${fmt(MP_ALLY_COST)} CG`, 'mpAllyFound()')}</div>`
      : `<div style="font-size:11px;color:var(--mut);font-style:italic">Pour fonder une alliance, il faut d'abord un pacte d'ambassade actif avec un commandant (un tanker en orbite chez lui, pacte signé).</div>`;
  } else {
    body += `<div style="font-size:11px;color:var(--mut);margin-bottom:10px">${A.members.length}/${MP_ALLY_MAX} membres${al.leader ? ' · tu es le chef' : ''}</div>`;
    body += A.members.map(m => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:#e6f0ff">${m.leader ? '★ ' : ''}${_esc(m.pseudo)}${m.me ? ' <span style="color:var(--mut);font-size:11px">(toi)</span>' : ''}</div>
        <div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${m.address || ''}</div></div>
        ${!m.me && m.address ? `<button onclick="document.getElementById('sb-ally-sheet').remove();openPlanetDetail('${m.address}')" style="background:none;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-size:10px;padding:5px 8px;font-family:inherit">fiche</button>` : ''}
        ${al.leader && !m.me && m.address ? `<button onclick="mpAllyKick('${m.address}')" style="background:none;border:1px solid rgba(255,138,138,.45);color:#ff8a8a;border-radius:6px;font-size:10px;padding:5px 8px;font-family:inherit">exclure</button>` : ''}
      </div>`).join('');
    if (A.sent.length) body += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:14px 0 6px">Invitations en attente</div>` + A.sent.map(i => `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e6f0ff;padding:4px 0">${_esc(i.pseudo)} <a onclick="mpAllyCancelInvite('${i.id}')" style="color:var(--mut);text-decoration:underline;cursor:pointer;font-size:11px">retirer</a></div>`).join('');
    if (al.leader) body += `<div style="font-size:11px;color:var(--mut);margin-top:10px;line-height:1.5">Pour inviter : ouvre la fiche d'un commandant chez qui un membre a un tanker en ambassade.</div>`;
    body += mpGarSheetHtml();
    body += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:16px 0 6px">Canal de l'alliance</div>
      <div id="sb-ally-msgs" style="max-height:32vh;overflow-y:auto;font-size:12px;line-height:1.5;padding:4px 0">${A.messages.length ? A.messages.map(x => `<div style="margin-bottom:6px"><span style="color:${x.mine ? 'var(--mut)' : al.color}">${_esc(x.pseudo)}</span> <span style="color:#e6f0ff">${_esc(x.body)}</span></div>`).join('') : '<div style="color:var(--mut);font-style:italic">Aucun message.</div>'}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="sb-ally-input" maxlength="280" placeholder="Message à l'alliance" onkeydown="if(event.key==='Enter')mpAllySend()" style="flex:1;padding:10px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;color:#e6f0ff;font-family:inherit;font-size:13px"><button onclick="mpAllySend()" style="padding:0 14px;background:rgba(95,255,232,.08);border:1px solid rgba(95,255,232,.45);color:#5fffe8;border-radius:8px;font-family:inherit">Envoyer</button></div>
      <div style="display:flex;margin-top:14px">${btn('Quitter l\'alliance', 'mpAllyLeave()', 'red')}</div>`;
  }
  const keep = document.getElementById('sb-ally-input'), draft = keep ? keep.value : '';
  ov.innerHTML = `<div style="width:100%;max-height:88vh;overflow-y:auto;background:#0b1016;border-top:1px solid ${al ? al.color + '88' : 'var(--border)'};border-radius:16px 16px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom))">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div><div style="font-size:10px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase">Alliance</div><div style="font-size:18px;color:${al ? al.color : '#e6f0ff'};font-weight:600">${al ? _esc(al.name) : 'Aucune'}</div></div>
      <button onclick="document.getElementById('sb-ally-sheet').remove()" style="background:none;border:1px solid var(--border);color:var(--mut);border-radius:8px;padding:6px 10px;font-family:inherit">Fermer</button>
    </div>${body}</div>`;
  const inp = document.getElementById('sb-ally-input'); if (inp && draft) inp.value = draft;
  const box = document.getElementById('sb-ally-msgs'); if (box) box.scrollTop = box.scrollHeight;
}
// Carte « Alliance » en tête de l'onglet Joueurs
function mpAllyCardHtml() {
  const A = mpAlly(), al = A.alliance;
  const unread = G.mpAllyUnread ? ` <span style="color:#ffc864">· ${G.mpAllyUnread} message${G.mpAllyUnread > 1 ? 's' : ''}</span>` : '';
  const sub = al ? `${A.members.length}/${MP_ALLY_MAX} membres${al.leader ? ' · chef' : ''}${unread}`
    : A.invites.length ? `${A.invites.length} invitation${A.invites.length > 1 ? 's' : ''} en attente` : 'Aucune alliance';
  return `<div onclick="mpOpenAlliance()" style="margin:8px 16px 4px;padding:12px 14px;border:1px solid ${al ? al.color + '77' : 'var(--border)'};border-radius:8px;background:rgba(95,255,232,.03);cursor:pointer;display:flex;align-items:center;gap:10px">
    <div style="flex:1"><div style="font-size:10px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase">Alliance</div>
    <div style="font-size:14px;color:${al ? al.color : '#e6f0ff'};font-weight:600;margin-top:2px">${al ? _esc(al.name) : (A.invites.length ? 'Invitation reçue' : 'Fonder ou rejoindre')}</div>
    <div style="font-size:11px;color:var(--mut);margin-top:2px">${sub}</div></div>${icon('chevronRight', { size: 14 })}</div>`;
}
// Bloc sur la fiche d'un commandant (ambassade)
function mpAllyEmbassyHtml(addr, pseudo) {
  const A = mpAlly(), al = A.alliance, mem = mpAllyMember(addr, pseudo), tag = mpAllyTag(addr);
  if (mem) {
    const mine = (G.fleet.prepared || []).filter(f => f.garrison && f.garrison.address && (mem.addresses || []).includes(f.garrison.address));
    return `<div style="margin-top:8px;font-size:12px;color:${al.color}">★ Allié · ${_esc(al.name)}</div><div style="font-size:11px;color:var(--mut);margin-top:2px">Ni raid ni abordage entre vous · accord commercial · canal de l'alliance</div>`
      + (mine.length ? `<div style="font-size:11px;color:#5fffe8;margin-top:4px">${mine.map(f => _esc(f.name) + ' · ' + _mpGarPhaseText(f)).join('<br>')}</div>` : '')
      + `<div style="display:flex;margin-top:8px">${_mpDiploBtn('Envoyer une flotte en garnison', `mpGarrisonStart('${addr}')`)}</div>`;
  }
  if (tag) return `<div style="margin-top:8px;font-size:12px;color:${tag.color}">Membre de l'alliance ${_esc(tag.alliance)}</div>`;
  if (al && al.leader) {
    const sent = A.sent.some(i => i.address === addr);
    return sent ? `<div style="margin-top:8px;font-size:11px;color:var(--mut)">Invitation dans ${_esc(al.name)} envoyée</div>`
      : `<div style="display:flex;margin-top:8px">${_mpDiploBtn('Inviter dans ' + _esc(al.name), `mpAllyInvite('${addr}')`)}</div>`;
  }
  if (!al && mpAllyCanFound()) return `<div style="display:flex;margin-top:8px">${_mpDiploBtn(`Fonder une alliance · ${fmt(MP_ALLY_COST)} CG`, 'mpAllyFound()')}</div>`;
  return '';
}
async function mpGarrisonStart(address) {
  const mem = mpAllyMember(address);
  if (!mem) { toast(MP_ALLY_ERRORS.not_ally); return; }
  if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  const fleets = (G.fleet.prepared || []).filter(f => (f.status || 'prepared') === 'deployed' && _sbMine(f) && !f.repair);
  if (!fleets.length) { toast('Aucune flotte en orbite : déploie d\'abord une flotte'); return; }
  const travel = mpRaidTravelMs({ mpAddress: address });
  const sector = String(address).split('-')[1];
  // garnison : moitié prix d'une mission (service rendu à un allié, sans butin) — décision d'Adrien 21/10
  const fuelOf = f => { try { return Math.max(50, Math.round(computeMissionFuelCost(f, { distanceMult: typeof _carnetDistanceMult === 'function' ? _carnetDistanceMult(sector) : 1 }) * 0.5)); } catch (e) { return 0; } };
  const pick = fleets.length === 1 ? { f: fleets[0] } : await _mpChoose('Garnison chez ' + _esc(mem.pseudo), fleets.map(f => ({ f, label: _esc(f.name), sub: `${['tanker', 'fregate', 'cuirasse'].reduce((s, t) => s + countShipsByType(f.composition, t), 0)} vaisseaux · ${fmt(fuelOf(f))} énergie` })));
  if (!pick) return;
  const f = pick.f, fuel = fuelOf(f);
  if ((G.res.energie.v || 0) < fuel) { toast(`Énergie insuffisante : ${fmt(fuel)} requis`); return; }
  const _ns = ((f.soldiers && f.soldiers.garde) || 0) + ((f.soldiers && f.soldiers.lourd) || 0);
  if (_ns > 0) {   // une garnison combat en orbite : les soldats débarquent et défendent ta planète
    const okS = await sbConfirm({ title: 'Les soldats restent au sol', body: `Une garnison combat en orbite chez ton allié.<br><br>Les <strong>${_ns} soldat${_ns > 1 ? 's' : ''}</strong> de ${_esc(f.name)} retournent à la caserne et défendent ta planète pendant son absence.`, confirmLabel: 'Débarquer et continuer', cancelLabel: 'Annuler' });
    if (!okS) return;
    f.soldiers = Object.assign({}, f.soldiers, { garde: 0, lourd: 0 });
    if (typeof syncFleetIntegrity === 'function') syncFleetIntegrity(f);
  }
  const ok = await sbConfirmWarning('Garnison chez ' + mem.pseudo,
    `Envoyer <strong>${_esc(f.name)}</strong> en garnison chez <strong>${_esc(mem.pseudo)}</strong> ?<br><br>Trajet ${Math.round(travel / 60000)} min · ${fmt(fuel)} énergie.`
    + `<br><br>En orbite chez lui, elle combat avec ses défenses si un raid arrive. Elle reste à toi : tu paies ses pertes (la moitié des vaisseaux si l'orbite tombe, un dixième si le raid est repoussé).`
    + `<br><br><em>Pendant ce temps, elle ne protège plus ta planète. Tu peux la rappeler à tout moment (trajet retour).</em>`, 'Envoyer');
  if (!ok || _mpGarBusy.has(f.id)) return;
  if (!(await mpPeaceGuard('Envoyer cette flotte en garnison'))) return;   // PATCH_2410_PACIFIQUE
  _mpGarBusy.add(f.id);
  try {
    await mpPublishFleetsNow();   // ANTITRICHE_0811 (v47) : la garnison se lit au registre
    const p = _mpFleetPayload(f); p.soldiers = { garde: 0, lourd: 0 };
    const g = await SBMP.garrisonPost(address, f.id, f.name, p, travel);
    mpPeaceRenounce();   // PATCH_2410_PACIFIQUE
    const now = Date.now();
    G.res.energie.v = Math.max(0, G.res.energie.v - fuel);
    f.status = 'in_mission';
    f.missionStartedAt = now; f.missionEndsAt = null; f.missionTargetId = null; f.missionFuelSpent = fuel;
    f.garrison = { address, pseudo: mem.pseudo, phase: 'going', world: G.activeWorld || 'home', departedAt: now, arrivesAt: Date.parse(g.arrives_at) || now + travel, travelMs: travel, mpGarrisonId: g.id };
    if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
    toast(`${f.name} part en garnison chez ${mem.pseudo} · ${Math.round(travel / 60000)} min`);
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  } catch (e) { toast(_mpAllyErr(e)); }
  finally { _mpGarBusy.delete(f.id); }
}
function _mpGarPhaseText(f) {
  const a = f.garrison; if (!a) return '';
  const now = Date.now();
  if (a.phase === 'going') return `Arrivée chez ${a.pseudo} dans ${formatMissionTimer(Math.max(0, a.arrivesAt - now))}`;
  if (a.phase === 'returning') return `Retour dans ${formatMissionTimer(Math.max(0, a.returnsAt - now))}`;
  return `En garnison chez ${a.pseudo}`;
}
function _mpGarTick(f, now) {
  const a = f.garrison;
  if (a.phase === 'going' && now >= a.arrivesAt) {
    a.phase = 'posted';
    toast(`${f.name} en garnison chez ${a.pseudo}`);
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
  if (a.phase === 'returning' && now >= a.returnsAt) {
    toast(`${f.name} est rentrée de garnison`);
    delete f.garrison;
    f.status = 'deployed';
    f.missionStartedAt = null; f.missionFuelSpent = null;
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  const el = document.getElementById('fleet-detail-garrison-timer');
  if (el && f.id === selectedFleetId) el.textContent = _mpGarPhaseText(f);
  return false;
}
// la composition du registre fait foi (pertes subies en garnison) : on s'aligne, une seule fois par vaisseau perdu
function _mpGarApplyLosses(f, g) {
  let any = false;
  for (const ty of ['tanker', 'fregate', 'cuirasse']) for (const t of ['t1', 't2', 't3']) {
    const n = (f.composition[ty] && f.composition[ty][t]) || 0, s = (g.composition[ty] && g.composition[ty][t]) || 0;
    if (s < n) { f.composition[ty][t] = s; const _l = n - s; (typeof sbWithWorld === 'function' ? sbWithWorld : (w, fn) => fn())(f.world || 'home', () => loseShips(ty, t, _l)); any = true; }   // hangar de la planète de la flotte
  }
  if (any && typeof syncFleetIntegrity === 'function') try { syncFleetIntegrity(f); } catch (e) {}
  return any;
}
function _mpGarStartReturn(f, why) {
  const a = f.garrison; if (!a || a.phase === 'returning') return;
  const now = Date.now();
  const back = a.phase === 'going' ? Math.max(5000, now - a.departedAt) : a.travelMs;
  a.phase = 'returning'; a.returnsAt = now + back;
  if (why) toast(`${f.name} : ${why} · retour dans ${Math.round(back / 60000)} min`);
}
async function mpGarrisonRecall(fleetId) {
  const f = (G.fleet.prepared || []).find(x => x.id === fleetId);
  const a = f && f.garrison;
  if (!a || a.phase === 'returning' || _mpGarBusy.has(fleetId)) return;
  if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  const ok = await sbConfirmWarning('Rappeler ' + f.name, `Rappeler <strong>${_esc(f.name)}</strong> de chez <strong>${_esc(a.pseudo)}</strong> ?<br><br>Il ne sera plus protégé par elle. Retour dans ~${Math.round((a.phase === 'going' ? Date.now() - a.departedAt : a.travelMs) / 60000)} min.`, 'Rappeler');
  if (!ok) return;
  _mpGarBusy.add(fleetId);
  try {
    const g = await SBMP.garrisonRecall(a.mpGarrisonId);
    _mpGarApplyLosses(f, g);
    _mpGarStartReturn(f);
    toast(`${f.name} quitte la garnison chez ${a.pseudo}`);
    if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  } catch (e) {
    if (/garrison_unknown/.test(String(e && e.message))) { _mpGarStartReturn(f); if (typeof saveGame === 'function') saveGame(); }
    else toast(_mpAllyErr(e));
  } finally { _mpGarBusy.delete(fleetId); }
}
function mpIngestGarrisons(mine, hosted) {
  const prevHosted = JSON.stringify(G.mpGarHosted || []);
  G.mpGarHosted = hosted;
  let dirty = prevHosted !== JSON.stringify(hosted);
  // garnison inconnue du registre (levée depuis longtemps, jeu fermé) : la flotte rentre
  const ids = new Set(mine.map(g => g.id));
  for (const f of G.fleet.prepared || []) if (f.garrison && f.garrison.mpGarrisonId && f.garrison.phase !== 'returning' && !ids.has(f.garrison.mpGarrisonId)) {
    _mpGarStartReturn(f, 'garnison levée'); dirty = true;
    if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
  }
  for (const g of mine) {
    const f = (G.fleet.prepared || []).find(x => x.garrison && x.garrison.mpGarrisonId === g.id);
    if (f) {
      if (_mpGarApplyLosses(f, g)) dirty = true;
      if (g.last_raid && !g.losses_seen) {
        _mpDiploReport('garrison_hit', { pseudo: f.garrison.pseudo, address: f.garrison.address, fleet: f.name, attacker: g.last_raid.attacker, victory: g.last_raid.victory, lost: g.last_raid.lost, destroyed: g.left_reason === 'destroyed' }, 'gar-' + g.id + '-' + (g.last_raid.at || ''));
        toast(`⚔ ${f.name} a combattu chez ${f.garrison.pseudo} : raid de ${g.last_raid.attacker} ${g.last_raid.victory ? 'victorieux' : 'repoussé'}`);
        dirty = true;
      }
      if (g.left_at && f.garrison.phase !== 'returning') {
        _mpGarStartReturn(f, g.left_reason === 'destroyed' ? 'détruite en garnison' : g.left_reason === 'alliance' ? 'l\'alliance est rompue' : 'garnison levée');
        if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
        dirty = true;
      }
    }
    if (!g.losses_seen) SBMP.garrisonSeen(g.id);
  }
  if (dirty) {
    if (typeof saveGame === 'function') saveGame();
    if (document.getElementById('sb-ally-sheet')) mpAllyRender();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
}
function _mpGarLostLine(lost) {
  const parts = [];
  for (const ty of ['tanker', 'fregate', 'cuirasse']) for (const t of ['t1', 't2', 't3']) {
    const n = (lost && lost[ty] && lost[ty][t]) || 0;
    if (n) parts.push(`${n} ${(SHIP_TIERS[ty] && SHIP_TIERS[ty][t.slice(1)] && SHIP_TIERS[ty][t.slice(1)].name) || ty}`);
  }
  return parts.join(' · ') || 'aucune perte';
}
function mpGarSheetHtml() {
  const mine = (G.fleet.prepared || []).filter(f => f.garrison && _sbMine(f));
  const hosted = G.mpGarHosted || [];
  let h = '';
  if (mine.length) h += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:16px 0 6px">Tes flottes en garnison</div>` + mine.map(f => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#e6f0ff;padding:5px 0">${_esc(f.name)} <span style="color:var(--mut);font-size:11px">${_mpGarPhaseText(f)}</span></div>`).join('');
  if (hosted.length) h += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:16px 0 6px">Flottes alliées qui te gardent</div>` + hosted.map(g => `<div style="font-size:12px;color:#e6f0ff;padding:4px 0">${_esc(g.fleet_name)} de ${_esc(g.owner_pseudo)} <span style="color:var(--mut);font-size:11px">· ${fmt(g.def)} def${Date.parse(g.arrives_at) > Date.now() ? ' · en route' : ''}${(G.worlds || []).length > 1 ? ' · ' + (g.host_address || '') : ''}</span></div>`).join('');
  return h;
}

function _mpCargoSum(c) { return ['metal', 'energie', 'cristal'].reduce((s, k) => s + Math.max(0, Math.floor(Number(c && c[k]) || 0)), 0); }
function _mpDiploReport(type, d, key) {
  if (!G.reports) G.reports = [];
  const id = 'rpt-diplo-' + key;
  const known = G.reports.find(r => r.id === id);
  if (known) return known;
  const T = MP_DIPLO_TYPES[type];
  const r = {
    id, kind: 'diplo', fleetName: '⚑ ' + (d.pseudo || 'Commandant'), targetName: T.list,
    intent: { label: T.sub, icon: '' }, doctrine: { color: T.color },
    returnedAt: Date.now(), read: false, diplo: Object.assign({ type }, d),
  };
  G.reports.unshift(r);
  return r;
}
function _mpMergeSender(address, pseudo) {
  if (!address || typeof mergeRealWorlds !== 'function') return;
  mergeRealWorlds(String(address).split('-').slice(0, 3).join('-'), [{ address, pseudo, planet_name: null }], { noReport: true });   // NIVEAU_0811 : niveau inconnu, pas « 1 »
}
// Créditer une cale acceptée dans MA partie — une seule fois (registre local + drapeau du registre)
function mpCreditOrbitCargo(o) {
  const key = 'orb:' + o.id;
  const L = _mpLedger(key);
  if (L && L.settled) {
    // déjà crédité ici : on s'assure que le registre le sait (le drapeau protège les autres appareils)
    if (o.cargo_applied) { if (!L.applied) _mpLedgerSet(key, { applied: true }); }
    else if (window.SBMP) window.SBMP.orbitApplied(o.id);
    return false;
  }
  if (o.cargo_applied) { _mpLedgerSet(key, { settled: true, applied: true }); return false; }
  _mpPay(o.cargo, +1, true);
  _mpLedgerSet(key, { settled: true });
  if (typeof saveGame === 'function') saveGame();
  if (window.SBMP) window.SBMP.orbitApplied(o.id);
  return true;
}
// Inscrire au registre un tanker arrivé en orbite chez un commandant (réessayé à chaque relève)
async function mpOrbitRegister(mission) {
  if (!mission || mission.mpPresenceId || !mission.mpTarget || mission.status !== 'orbital_relay') return;
  if (_mpOrbitRegistering.has(mission.id) || !window.SBMP || !window.SBMP.ready()) return;
  _mpOrbitRegistering.add(mission.id);
  try {
    const res = mission.mpOffered || (mission.cargo && mission.cargo.resources) || {};
    const pid = await window.SBMP.orbitArrive(mission.mpTarget.address, mission.id, mission.tankerName, {
      metal: res.metal || 0, energie: res.energie || 0, cristal: res.cristal || 0 }, !!mission.mpLossApplied);   // PIRATERIE_1210
    mission.mpPresenceId = pid;
    // rappelé pendant l'inscription : on ferme aussitôt l'ambassade au registre
    if (mission.status !== 'orbital_relay') { try { await window.SBMP.orbitLeave(pid); } catch (e) {} }
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/target_unknown|target_self|orbit_rate|orbit_quota/.test(msg)) {
      // monde disparu du registre, ou trop d'ambassades : le tanker fait demi-tour avec sa cale
      const now = Date.now();
      mission.status = 'returning';
      mission.cancelledAt = now;
      mission.returnArrivalAt = now + Math.max(60000, (mission.arrivalAt || now) - (mission.departedAt || now));
      toast(`${mission.tankerName} : ${_mpDiploErr(e)} · retour avec la cale`);
      if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
      if (typeof saveGame === 'function') saveGame();
    } else console.warn('[ambassade] inscription :', msg);
  } finally { _mpOrbitRegistering.delete(mission.id); }
}
// Arrivée d'un tanker chez un vrai commandant : l'ambassade ouvre, la cale est offerte
function mpOrbitArrival(mission) {
  // La voie (taxe, rencontre) ne s'applique qu'à ce qui est livré : refusée ou rappelée, la cale rentre intacte
  const f = typeof computeRouteLootFactor === 'function' ? computeRouteLootFactor(mission) : 1;
  const res = (mission.cargo && mission.cargo.resources) || {};
  mission.mpOffered = {};
  for (const rk of ['metal', 'energie', 'cristal']) mission.mpOffered[rk] = Math.max(0, Math.floor((res[rk] || 0) * f));
  mission.status = 'orbital_relay';
  const hasCargo = _mpCargoSum(mission.mpOffered) > 0;
  toast(`${mission.tankerName} en orbite chez ${mission.mpTarget.pseudo} · ambassade ouverte${hasCargo ? ' · cale offerte' : ''}`);
  mpOrbitRegister(mission);
}
// Relève du registre : ambassades (les miennes et celles chez moi) et pactes
async function mpIngestOrbits(orbits, pacts, meId) {
  const D = _mpDiplo();
  let dirty = false;
  const missions = G.tankerMissions || [];
  // 1. Mes ambassades
  for (const m of missions) {
    if (m.status !== 'orbital_relay' || !m.mpTarget || m.mpPresenceId) continue;
    const o = orbits.find(x => x.user_id === meId && x.mission_id === m.id);
    if (o) { m.mpPresenceId = o.id; dirty = true; } else mpOrbitRegister(m);
  }
  for (const o of orbits) {
    if (o.user_id !== meId) continue;
    const m = missions.find(x => x.id === o.mission_id);
    if (m && m.mpTarget) {
      if (o.cargo_state === 'accepted' && !m.mpCargoDelivered) {
        m.mpCargoDelivered = true;
        const res = Object.assign({}, m.mpOffered || (m.cargo && m.cargo.resources) || {});
        if (m.cargo) m.cargo.resources = { metal: 0, energie: 0, cristal: 0 };
        _mpDiploReport('cargo_accepted', { pseudo: o.target_pseudo, address: o.target_address, tanker: o.tanker_name, cargo: o.cargo || res }, 'acc-' + o.id);
        toast(`${o.target_pseudo} a accepté la cale de ${o.tanker_name} : ${_mpResLine(o.cargo || res)} livrés`);
        dirty = true;
      } else if (o.cargo_state === 'refused' && !o.left_at && !m.mpCargoRefused) {
        m.mpCargoRefused = true;
        _mpDiploReport('cargo_refused', { pseudo: o.target_pseudo, address: o.target_address, tanker: o.tanker_name, cargo: o.cargo }, 'ref-' + o.id);
        toast(`${o.target_pseudo} a refusé la cale de ${o.tanker_name} · rappelle le tanker pour la récupérer`);
        dirty = true;
      }
    }
  }
  // 2. Ambassades chez moi
  for (const o of orbits) {
    if (o.target_id !== meId) continue;
    if (!D.seen['o:' + o.id]) {
      D.seen['o:' + o.id] = Date.now();
      dirty = true;
      if (!o.left_at) {
        _mpMergeSender(o.owner_address, o.owner_pseudo);
        _mpDiploReport('embassy_in', { presenceId: o.id, pseudo: o.owner_pseudo, address: o.owner_address, tanker: o.tanker_name, cargo: o.cargo, state: o.cargo_state, gone: false }, 'in-' + o.id);
        toast(`⚑ ${o.owner_pseudo} : tanker ${o.tanker_name} en orbite${o.cargo_state === 'offered' ? ' · une cale t\'est offerte' : ''}`);
      }
    }
    let rep = (G.reports || []).find(r => r.id === 'rpt-diplo-in-' + o.id);
    if (!rep && !o.left_at && o.cargo_state === 'offered') {   // rapport évincé (60 au plus) : la cale reste à portée de réponse
      rep = _mpDiploReport('embassy_in', { presenceId: o.id, pseudo: o.owner_pseudo, address: o.owner_address, tanker: o.tanker_name, cargo: o.cargo, state: o.cargo_state, gone: false }, 'in-' + o.id);
      dirty = true;
    }
    if (rep && (rep.diplo.state !== o.cargo_state || rep.diplo.gone !== !!o.left_at)) { rep.diplo.state = o.cargo_state; rep.diplo.gone = !!o.left_at; dirty = true; }
    if (o.cargo_state === 'accepted' && mpCreditOrbitCargo(o)) dirty = true;
  }
  // CHAT_1310 — ambassades ouvertes chez moi : chacune ouvre un canal de discussion
  _mpEmbIn = orbits.filter(o => o.target_id === meId && !o.left_at && o.owner_address)
    .map(o => ({ presenceId: o.id, address: o.owner_address, pseudo: o.owner_pseudo, tanker: o.tanker_name, cargoState: o.cargo_state, since: Date.parse(o.arrived_at) || Date.now() }));
  if (typeof mpEmbassyRefresh === 'function') mpEmbassyRefresh();
  // 3. Pactes — les pactes ouverts arrivent tous : un pacte ouvert ici mais plus au registre est clos
  const openIds = new Set(pacts.filter(k => k.status === 'proposed' || k.status === 'active').map(k => k.id));
  const seenIds = new Set(pacts.map(k => k.id));
  for (const v of Object.values(D.pacts)) {
    if ((v.status === 'active' || v.status === 'proposed') && !openIds.has(v.id) && !seenIds.has(v.id)) { v.status = 'closed'; v.endedAt = Date.now(); dirty = true; }
  }
  for (const k of pacts) {
    const mine = k.proposer_id === meId;
    const prev = D.pacts[k.id];
    const snap = {
      id: k.id, status: k.status, mine, anchor: k.anchor_presence,
      otherPseudo: mine ? k.partner_pseudo : k.proposer_pseudo, otherAddress: mine ? k.partner_address : k.proposer_address,
      createdAt: Date.parse(k.created_at) || Date.now(), activeAt: Date.parse(k.active_at) || null, endedAt: Date.parse(k.ended_at) || null,
      reason: k.end_reason || null, endedByMe: !!k.ended_by && k.ended_by === meId,
    };
    D.pacts[k.id] = snap;
    const rep = (G.reports || []).find(r => r.id === 'rpt-diplo-prop-' + k.id);
    if (rep && rep.diplo.state !== k.status) { rep.diplo.state = k.status; dirty = true; }
    if (prev && prev.status === k.status) continue;
    dirty = true;
    const d = { pseudo: snap.otherPseudo, address: snap.otherAddress, pactId: k.id, reason: snap.reason };
    if (k.status === 'proposed' && !mine) {
      _mpMergeSender(snap.otherAddress, snap.otherPseudo);
      _mpDiploReport('pact_proposed', Object.assign({ state: 'proposed' }, d), 'prop-' + k.id);
      toast(`⚑ ${snap.otherPseudo} te propose un pacte de non-agression`);
    } else if (k.status === 'active') {
      _mpDiploReport('pact_signed', d, 'sig-' + k.id);
      toast(`Pacte de non-agression signé avec ${snap.otherPseudo}`);
    } else if (k.status === 'broken' && prev && !snap.endedByMe) {
      _mpDiploReport('pact_broken', d, 'brk-' + k.id);
      toast(`⚠ ${snap.otherPseudo} a rompu votre pacte de non-agression`);
    } else if (k.status === 'expired' && prev && prev.status === 'active') {
      // PATCH_2110_PAV_FIX — alliance temporaire (pavillon) arrivée à son terme : les deux côtés sont prévenus
      _mpDiploReport('pact_broken', Object.assign({}, d, { reason: 'expired' }), 'exp-' + k.id);
      toast(`L'alliance temporaire avec ${snap.otherPseudo} est terminée : les raids redeviennent possibles`);
    } else if (k.status === 'declined' && mine && prev) {
      _mpDiploReport('pact_declined', d, 'dec-' + k.id);
      toast(`${snap.otherPseudo} a décliné ton pacte`);
    }
  }
  // Ménage : souvenirs de plus de 30 jours
  const old = Date.now() - 30 * 864e5;
  for (const [k, v] of Object.entries(D.seen)) if (v < old) delete D.seen[k];
  for (const [k, v] of Object.entries(D.pacts)) if (v.status !== 'active' && v.status !== 'proposed' && (v.endedAt || v.createdAt) < old) delete D.pacts[k];
  if (dirty) {
    if (typeof saveGame === 'function') saveGame();
    _mpDiploRefresh();
  }
}
function _mpDiploRefresh() {
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  const rd = document.getElementById('scr-report-detail');
  if (rd && !rd.classList.contains('hidden') && typeof renderReportDetail === 'function') renderReportDetail();
  const rl = document.getElementById('scr-reports');
  if (rl && !rl.classList.contains('hidden') && typeof renderReportsList === 'function') renderReportsList();
}
async function _mpDiploResync() {
  if (window.SBMP && window.SBMP.ready()) { try { await window.SBMP.pollOrbits(); } catch (e) {} }
  _mpDiploRefresh();
}

// Le destinataire répond à la cale offerte
async function mpAnswerOrbit(reportId, accept) {
  const r = (G.reports || []).find(x => x.id === reportId);
  const d = r && r.diplo;
  if (!d || d.state !== 'offered' || d.gone || _mpDiploBusy.has(reportId) || !window.SBMP) return;
  if (!window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  _mpDiploBusy.add(reportId);
  try {
    const cargo = await window.SBMP.orbitAnswer(d.presenceId, accept);
    d.state = accept ? 'accepted' : 'refused';
    if (accept) {
      mpCreditOrbitCargo({ id: d.presenceId, cargo, cargo_applied: false });
      toast(`Cale de ${d.pseudo} acceptée : +${_mpResLine(cargo)}`);
    } else toast(`Cale refusée : elle repartira avec le tanker de ${d.pseudo}`);
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    toast(_mpDiploErr(e));
    await _mpDiploResync();
  } finally { _mpDiploBusy.delete(reportId); }
  renderReportDetail();
}
// Proposer un pacte depuis son ambassade (fiche de la planète)
async function mpProposePact(missionId) {
  const m = (G.tankerMissions || []).find(x => x.id === missionId);
  if (!m || !m.mpTarget || m.status !== 'orbital_relay' || _mpDiploBusy.has(missionId)) return;
  if (!m.mpPresenceId) { toast('Ambassade pas encore inscrite au registre : réessaie dans un instant'); mpOrbitRegister(m); return; }
  if (!window.SBMP || !window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  const ok = await sbConfirmWarning('Pacte de non-agression',
    `Proposer un pacte à <strong>${m.mpTarget.pseudo}</strong> ?<br><br>Tant que <strong>${m.tankerName}</strong> reste en orbite chez lui, aucun de vous deux ne pourra attaquer l'autre.<br><br>Rappeler le tanker romprait le pacte, et tout le comptoir le saurait.<br><br><em>Il a 48 h pour signer.</em>`, 'Proposer');
  if (!ok) return;
  _mpDiploBusy.add(missionId);
  try {
    await window.SBMP.pactPropose(m.mpPresenceId);
    toast(`Pacte proposé à ${m.mpTarget.pseudo}`);
  } catch (e) { toast(_mpDiploErr(e)); }
  finally { _mpDiploBusy.delete(missionId); }
  await _mpDiploResync();
}
// Signer ou décliner (partenaire)
async function mpAnswerPact(pactId, accept) {
  if (_mpDiploBusy.has(pactId) || !window.SBMP) return;
  if (!window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  _mpDiploBusy.add(pactId);
  try {
    const st = await window.SBMP.pactAnswer(pactId, accept);
    toast(st === 'active' ? 'Pacte signé' : st === 'expired' ? 'La proposition a expiré (48 h)' : st === 'withdrawn' ? 'Son ambassade est fermée : proposition retirée' : 'Pacte décliné');
  } catch (e) { toast(_mpDiploErr(e)); }
  finally { _mpDiploBusy.delete(pactId); }
  await _mpDiploResync();
}
// Dénoncer un pacte actif (l'un ou l'autre) ou retirer sa proposition
async function mpEndPact(pactId) {
  const k = _mpDiplo().pacts[pactId];
  if (!k || _mpDiploBusy.has(pactId) || !window.SBMP) return;
  if (!window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  const ok = k.status === 'active'
    ? await sbConfirmWarning('Dénoncer le pacte', `Dénoncer le pacte avec <strong>${k.otherPseudo}</strong> ?<br><br>Les raids redeviennent possibles entre vous, dans les deux sens.<br><br><em>Le comptoir saura que c'est toi.</em>`, 'Dénoncer')
    : await sbConfirmWarning('Retirer la proposition', `Retirer ta proposition de pacte à <strong>${k.otherPseudo}</strong> ?`, 'Retirer');
  if (!ok) return;
  _mpDiploBusy.add(pactId);
  try {
    const st = await window.SBMP.pactEnd(pactId);
    if (st === 'broken') { k.status = 'broken'; k.endedByMe = true; }
    toast(st === 'broken' ? `Pacte avec ${k.otherPseudo} dénoncé` : 'Proposition retirée');
  } catch (e) { toast(_mpDiploErr(e)); }
  finally { _mpDiploBusy.delete(pactId); }
  await _mpDiploResync();
}
// Rappel d'un tanker en ambassade : inscrit au registre (la cale non acceptée rentre, le pacte tombe)
async function mpRecallEmbassy(mission) {
  if (_mpDiploBusy.has(mission.id)) return;
  const pseudo = mission.mpTarget.pseudo;
  const pact = mission.mpPresenceId ? Object.values(_mpDiplo().pacts).find(k => k.anchor === mission.mpPresenceId && (k.status === 'active' || k.status === 'proposed')) : null;
  const res = (mission.cargo && mission.cargo.resources) || {};
  const hasCargo = !mission.mpCargoDelivered && _mpCargoSum(res) > 0;
  if (_mpOrbitRegistering.has(mission.id)) { toast('Inscription au registre en cours : réessaie dans un instant'); return; }
  if (!(window.SBMP && window.SBMP.ready())) { toast('Registre hors ligne : le rappel doit être inscrit au registre, réessaie dans un instant'); return; }
  const returnMs = Math.max(60000, (mission.arrivalAt || 0) - (mission.departedAt || 0));
  const ok = await sbConfirmWarning('Rappeler le tanker',
    `Rappeler <strong>${mission.tankerName}</strong> de chez <strong>${pseudo}</strong> ?<br><br>L'ambassade ferme : plus de canal ni de pavillons.`
    + (hasCargo ? `<br><br>La cale non acceptée (${_mpResLine(res)}) rentre avec lui.` : '')
    + (pact && pact.status === 'active' ? `<br><br><strong style="color:var(--red)">Le pacte de non-agression avec ${pseudo} sera rompu.</strong> Tout le comptoir saura que c'est toi.` : pact ? `<br><br>Ta proposition de pacte sera retirée.` : '')
    + `<br><br><em>Retour dans ~${Math.ceil(returnMs / 60000)} min.</em>`, 'Rappeler');
  if (!ok) return;
  _mpDiploBusy.add(mission.id);
  let state = '';
  try {
    // jamais inscrite (ou réponse perdue) : l'inscription est idempotente, elle rend l'ambassade existante s'il y en a une
    if (!mission.mpPresenceId) {
      const off = mission.mpOffered || res;
      try { mission.mpPresenceId = await window.SBMP.orbitArrive(mission.mpTarget.address, mission.id, mission.tankerName, { metal: off.metal || 0, energie: off.energie || 0, cristal: off.cristal || 0 }, !!mission.mpLossApplied); }
      catch (e) { if (!/orbit_rate|orbit_quota|target_unknown|target_self/.test(String(e && e.message))) throw e; }   // aucune ambassade n'a pu exister
    }
    if (mission.mpPresenceId) state = await window.SBMP.orbitLeave(mission.mpPresenceId);
  } catch (e) {
    if (!/orbit_unknown/.test(String(e && e.message))) { toast(_mpDiploErr(e)); _mpDiploBusy.delete(mission.id); return; }
  }
  _mpDiploBusy.delete(mission.id);
  if (mission.status !== 'orbital_relay') return;
  const now = Date.now();
  if (state === 'accepted' || mission.mpCargoDelivered) {
    mission.mpCargoDelivered = true;
    if (mission.cargo) mission.cargo.resources = { metal: 0, energie: 0, cristal: 0 };
  }
  if (mission.cargo) mission.cargo.soldiers = { garde: 0, lourd: 0 };
  mission.status = 'returning';
  mission.cancelledAt = now;
  mission.returnArrivalAt = now + returnMs;
  if (pact && pact.status === 'active') { pact.status = 'broken'; pact.endedByMe = true; }
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  toast(`${mission.tankerName} quitte l'orbite de ${pseudo}${pact && pact.status === 'broken' ? ' · pacte rompu' : ''}`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function _mpDiploBtn(label, onclick, tone) {
  const c = tone === 'red' ? '255,138,138' : tone === 'mut' ? '206,206,205' : '95,255,232';
  return `<button onclick="${onclick}" style="flex:1;padding:12px;background:rgba(${c},.07);border:1px solid rgba(${c},.45);color:rgb(${c});border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.06em;cursor:pointer">${label}</button>`;
}
function renderDiploReportDetail(r) {
  const d = r.diplo || {};
  const T = MP_DIPLO_TYPES[d.type] || MP_DIPLO_TYPES.embassy_in;
  document.getElementById('report-detail-title').textContent = T.title;
  document.getElementById('report-detail-meta').textContent = `${d.pseudo || '?'} · ${new Date(r.returnedAt).toLocaleString('fr-FR')}`;
  const el = document.getElementById('report-detail-content');
  if (!el) return;
  const box = (inner) => `<div style="margin:0 16px 14px;padding:18px;border:1px solid ${T.color}55;border-radius:12px;background:rgba(20,25,30,.6);font-size:13px;line-height:1.6;color:#e6f0ff">${inner}</div>`;
  const addr = d.address ? `<div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace;margin-top:6px">${d.address} · dans ton carnet</div>` : '';
  const cargoLine = _mpCargoSum(d.cargo) > 0 ? _mpResLine(d.cargo) : '';
  const k = d.pactId ? _mpDiplo().pacts[d.pactId] : null;
  let html = '';
  if (d.type === 'embassy_in') {
    html += box(`${window.SBBlackmarket && SBBlackmarket.shipThumbHtml(d.tanker) ? 'Le vaisseau' : 'Le tanker'} <strong>${d.tanker || '?'}</strong> de <strong>${d.pseudo}</strong> a pris orbite au-dessus de ta colonie. Tant qu'il reste, son ambassade est ouverte : il peut te hisser des pavillons et te proposer un pacte.${addr}`);
    let cargoHtml;
    if (!cargoLine) cargoHtml = `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:8px">Cale vide : une simple présence.</div>`;
    else if (d.state === 'accepted') cargoHtml = `<div style="font-size:12px;color:var(--green);text-align:center;padding:8px">Cale acceptée : +${cargoLine}</div>`;
    else if (d.state === 'refused') cargoHtml = `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:8px">Cale refusée (${cargoLine}) : elle repart avec le tanker.</div>`;
    else if (d.gone || d.state === 'withdrawn') cargoHtml = `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:8px">Le tanker est reparti avec sa cale.</div>`;
    else cargoHtml = `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Cale offerte</div>
      <div style="font-size:15px;color:#ffc864;margin-bottom:12px">${cargoLine}</div>
      <div style="display:flex;gap:8px">${_mpDiploBtn('Accepter', `mpAnswerOrbit('${r.id}',true)`)}${_mpDiploBtn('Refuser', `mpAnswerOrbit('${r.id}',false)`, 'mut')}</div>`;
    html += `<div style="margin:0 16px 14px">${cargoHtml}</div>`;
    if (d.gone) html += `<div style="margin:0 16px 14px;font-size:11px;color:var(--mut);font-style:italic">L'ambassade est fermée.</div>`;
    else if (d.address) html += `<div style="margin:0 16px 14px;display:flex">${_mpDiploBtn('💬 Ouvrir l\'ambassade · discuter' + _mpChatBadge(d.address), `openEmbassy('${d.address}')`)}</div>`;
  } else if (d.type === 'pact_proposed') {
    html += box(`<strong>${d.pseudo}</strong> te propose un <strong>pacte de non-agression</strong>.<br><br>Tant que son tanker reste en orbite chez toi, aucun de vous deux ne peut attaquer l'autre. S'il le rappelle, le pacte tombe, et tout le comptoir le saura. Tu peux aussi le dénoncer à tout moment.${addr}`);
    const st = (k && k.status) || d.state;
    html += `<div style="margin:0 16px 14px">${st === 'proposed'
      ? `<div style="display:flex;gap:8px">${_mpDiploBtn('Signer le pacte', `mpAnswerPact('${d.pactId}',true)`)}${_mpDiploBtn('Décliner', `mpAnswerPact('${d.pactId}',false)`, 'mut')}</div>`
      : `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:8px">${st === 'active' ? 'Pacte signé.' : st === 'declined' ? 'Tu as décliné ce pacte.' : st === 'broken' ? 'Ce pacte a été rompu.' : st === 'expired' ? 'La proposition a expiré.' : 'Proposition retirée : son ambassade est fermée.'}</div>`}</div>`;
  } else if (d.type === 'pact_signed') {
    html += box(`Pacte de non-agression avec <strong>${d.pseudo}</strong>. Aucun raid n'est possible entre vous ${k && !k.anchor ? 'pendant 48 h (alliance temporaire conclue par pavillons)' : 'tant que l\'ambassade reste en orbite'}.${addr}`);
    if (k && k.status === 'active') html += `<div style="margin:0 16px 14px;display:flex">${_mpDiploBtn('Dénoncer le pacte', `mpEndPact('${d.pactId}')`, 'red')}</div>`;
    else if (k) html += `<div style="margin:0 16px 14px;font-size:12px;color:var(--mut);font-style:italic;text-align:center">Ce pacte n'est plus en vigueur.</div>`;
  } else if (d.type === 'pact_broken') {
    html += box(`${d.reason === 'enemy' ? `Une déclaration d'hostilité a rompu le pacte avec <strong>${d.pseudo}</strong>` : d.reason === 'expired' ? `L'alliance temporaire avec <strong>${d.pseudo}</strong> est arrivée à son terme` : `<strong>${d.pseudo}</strong> ${d.reason === 'recall' ? 'a rappelé son ambassade' : 'a dénoncé votre pacte'}`}. Les raids redeviennent possibles entre vous.${addr}`);
  } else if (d.type === 'neighbor') {   // VOISINS_1310
    html += box(`Une signature de commandant se détache du bruit de fond : <strong>${d.pseudo}</strong>${d.planet ? `, sur ${d.planet}` : ''}, niveau estimé ~${d.level || 1}. C'est l'un de tes plus proches voisins.${addr}`)
      + `<div style="margin:0 16px 14px;font-size:12px;color:var(--mut);line-height:1.6">Depuis sa fiche (Carnet ou onglet Joueurs) : envoyer un tanker en ambassade, hisser un pavillon, proposer un pacte… ou préparer un raid.</div>`
      + `<div style="margin:0 16px 14px;display:flex">${_mpDiploBtn('Voir sa planète', `openPlanetDetail('${d.address}')`)}</div>`;
  } else if (d.type === 'garrison_hit') {   // PATCH_2110_GARNISON
    html += box(`<strong>${_esc(d.fleet || '')}</strong>, en garnison chez <strong>${d.pseudo}</strong>, a combattu le raid de <strong>${_esc(d.attacker || '?')}</strong> : ${d.victory ? '<span style="color:#ff8a8a">l\'orbite est tombée</span>' : '<span style="color:var(--green)">raid repoussé</span>'}.<br><br>Pertes : ${_mpGarLostLine(d.lost)}.${d.destroyed ? '<br><br><strong style="color:#ff8a8a">La flotte a été détruite.</strong>' : ''}${addr}`);
  } else if (d.type === 'alliance_invite') {   // PATCH_2110_ALLIANCES
    const pend = mpAlly().invites.some(i => i.id === d.inviteId);
    html += box(`<strong>${d.pseudo}</strong> t'invite dans l'alliance <strong style="color:${d.color || '#5fffe8'}">${_esc(d.alliance || '')}</strong> (${d.members || 1} membre${(d.members || 1) > 1 ? 's' : ''}).<br><br>Entre membres : ni raid ni abordage, accord commercial automatique, canal commun. Le chef seul peut exclure ; si tu pars, aucune attaque entre anciens alliés pendant 24 h.${addr}`)
      + `<div style="margin:0 16px 14px">${pend ? `<div style="display:flex;gap:8px">${_mpDiploBtn('Rejoindre', `mpAllyAnswer('${d.inviteId}',true)`)}${_mpDiploBtn('Décliner', `mpAllyAnswer('${d.inviteId}',false)`, 'mut')}</div>`
        : `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:8px">${d.state === 'accepted' ? 'Tu as rejoint l\'alliance.' : d.state === 'declined' ? 'Invitation déclinée.' : 'Cette invitation n\'est plus valable.'}</div>`}</div>`;
  } else if (d.type === 'trade_sold') {   // PATCH_2110_COMMERCE
    html += box(d.why ? `${d.tanker || 'Ton tanker'} n'a pas pu livrer <strong>${d.pseudo}</strong> : ${d.why}. Il est rentré avec sa cale.${addr}`
      : d.expired ? `<strong>${d.pseudo}</strong> n'a pas répondu en 12 h : ${d.tanker || 'ton tanker'} est rentré avec sa cale.${addr}`
      : _mpCargoSum(d.sold) > 0 ? `<strong>${d.pseudo}</strong> a acheté <span style="color:#ffc864">${_mpResLine(d.sold)}</span>.<br><br>${d.tanker || 'Ton tanker'} est rentré avec <strong style="color:#ffc864">+${fmt(d.paid || 0)} CG</strong>${_mpCargoSum(d.back) > 0 ? ` et le reste de la cale (${_mpResLine(d.back)})` : ''}.${addr}`
      : `<strong>${d.pseudo}</strong> n'a rien pu acheter (CG, plafond ou silos pleins). ${d.tanker || 'Ton tanker'} est rentré avec sa cale.${addr}`);
  } else if (d.type === 'trade_bought') {
    html += box(_mpCargoSum(d.bought) > 0 ? `Le tanker ${d.tanker || ''} de <strong>${d.pseudo}</strong> a livré <span style="color:var(--green)">${_mpResLine(d.bought)}</span>, payés <strong style="color:#ffc864">${fmt(d.paid || 0)} CG</strong> au prix de l'accord.${_mpCargoSum(d.offered) > _mpCargoSum(d.bought) ? `<br><br>Proposé : ${_mpResLine(d.offered)}. Le reste repart avec lui (CG, plafond ou silos).` : ''}${addr}`
      : `Le tanker ${d.tanker || ''} de <strong>${d.pseudo}</strong> proposait ${_mpResLine(d.offered)}, mais tu n'as rien pu acheter (CG, plafond ou silos pleins). Il repart avec sa cale.${addr}`)
      + `<div style="margin:0 16px 14px;font-size:11px;color:var(--mut)">Plafond par livraison : ${fmt(mpTradeCap(d.pseudo))} CG${d.address ? ` · <a onclick="mpTradeSetCap('${d.address}')" style="color:#ffc864;text-decoration:underline;cursor:pointer">modifier</a>` : ''}</div>`;
  } else if (d.type === 'pact_declined') {
    html += box(`<strong>${d.pseudo}</strong> a décliné ton pacte de non-agression.${addr}`);
  } else if (d.type === 'cargo_accepted') {
    html += box(`<strong>${d.pseudo}</strong> a accepté la cale de ${d.tanker || 'ton tanker'} : <span style="color:var(--green)">${cargoLine || 'rien'}</span> livrés. Le tanker reste en orbite : l'ambassade est toujours ouverte.${addr}`);
  } else if (d.type === 'cargo_refused') {
    html += box(`<strong>${d.pseudo}</strong> a refusé la cale de ${d.tanker || 'ton tanker'}${cargoLine ? ` (${cargoLine})` : ''}. Elle reste à bord : rappelle le tanker pour la récupérer.${addr}`);
  }
  el.innerHTML = html;
  // PATCH_0211_AMBASSADEUR — la fiche du vaisseau en orbite, avec son logo
  try { if (d.type === 'embassy_in' && window.SBBlackmarket) SBBlackmarket.fillEnvoy(el, d.presenceId, d.tanker); } catch (e) {}
}

// Bloc « Ambassade » sur la fiche d'une planète tenue par un vrai commandant
function mpEmbassyBlockHtml(p) {
  if (!p || !p.isReal) return '';
  const addr = p.mpAddress || p.coord;
  const m = (G.tankerMissions || []).find(x => x.status === 'orbital_relay' && x.mpTarget && x.destinationPlanetCoord === p.coord);
  const k = mpPactWith(addr, p.playerName);
  const inc = _mpEmbInFor(addr);
  const _en = mpRelWith(addr, p.playerName, 'enemy'), _tr = mpRelWith(addr, p.playerName, 'trade');   // PATCH_2110_PAVILLONS
  const _al = mpAllyEmbassyHtml(addr, p.playerName);   // PATCH_2110_ALLIANCES
  if (!m && !k && !inc && !_en && !_tr && !_al) return '';
  const rows = [];
  if (_al) rows.push(_al);
  if (_en) rows.push(`<div style="font-size:12px;color:#ff4d4d;font-weight:600">⚔ Ennemi déclaré${_en.byMe ? ' (par toi)' : ''}</div><div style="font-size:11px;color:var(--mut);margin-top:2px">Pillage +10 points entre vous · pas de pacte possible · « Paix ? » des deux côtés pour en sortir</div>`);
  if (_tr) rows.push(`<div style="font-size:12px;color:#ffc864;${_al ? 'margin-top:8px' : ''}">⚑ Accord commercial${_tr.ally ? ' (alliance)' : ''}${_tr.until ? ' jusqu\'au ' + new Date(_tr.until).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}</div><div style="font-size:11px;color:var(--mut);margin-top:2px">Tes convois vers lui mieux protégés · canal ouvert</div>` + mpTradeBlockHtml(addr, p.playerName));
  if (inc) rows.push(`<div style="font-size:12px;color:#e6f0ff">Son tanker ${_esc(inc.tanker || '')} est en orbite chez toi</div>`);
  if (m) {
    const res = (m.cargo && m.cargo.resources) || {};
    const off = m.mpOffered || res;
    const cargo = m.mpCargoDelivered ? 'cale livrée' : _mpCargoSum(res) > 0 ? (m.mpCargoRefused ? `cale refusée (${_mpResLine(res)}) · rappelle-le pour la récupérer` : `cale offerte : ${_mpResLine(off)}`) : 'cale vide';
    rows.push(`<div style="font-size:12px;color:#e6f0ff">${m.tankerName} en orbite${m.mpPresenceId ? '' : ' · inscription au registre…'}</div><div style="font-size:11px;color:var(--mut);margin-top:2px">${cargo}</div>`);
  }
  let action = '';
  if (k && k.status === 'active') {
    const since = k.activeAt ? new Date(k.activeAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
    const held = !k.anchor ? 'alliance temporaire · 48 h' : m && k.anchor === m.mpPresenceId ? `tenu par ${m.tankerName}` : k.mine ? 'tenu par ton tanker' : 'tenu par son tanker en orbite chez toi';
    rows.push(`<div style="font-size:12px;color:var(--green);margin-top:8px">Pacte de non-agression actif${since ? ' depuis le ' + since : ''}</div><div style="font-size:11px;color:var(--mut);margin-top:2px">${held}</div>`);
    action = _mpDiploBtn('Dénoncer le pacte', `mpEndPact('${k.id}')`, 'red');
  } else if (k && k.status === 'proposed' && k.mine) {
    rows.push(`<div style="font-size:12px;color:#5fffe8;margin-top:8px">Pacte proposé · en attente de sa signature</div>`);
    action = _mpDiploBtn('Retirer la proposition', `mpEndPact('${k.id}')`, 'mut');
  } else if (k && k.status === 'proposed') {
    rows.push(`<div style="font-size:12px;color:#5fffe8;margin-top:8px">${p.playerName} te propose un pacte de non-agression</div>`);
    action = `${_mpDiploBtn('Signer', `mpAnswerPact('${k.id}',true)`)}${_mpDiploBtn('Décliner', `mpAnswerPact('${k.id}',false)`, 'mut')}`;
  } else if (m && m.mpPresenceId) {
    action = _mpDiploBtn('Proposer un pacte de non-agression', `mpProposePact('${m.id}')`);
  }
  const talk = (m || inc) && !(typeof getCurrentScreen === 'function' && getCurrentScreen() === 'embassy')
    ? `<div style="display:flex;margin-top:10px">${_mpDiploBtn('💬 Ouvrir l\'ambassade · discuter' + _mpChatBadge(addr), `openEmbassy('${addr}')`)}</div>` : '';
  return `<div style="margin-bottom:10px;padding:12px 14px;border:1px solid rgba(95,255,232,.3);border-radius:8px;background:rgba(95,255,232,.04)">
    <div style="font-size:10px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Ambassade</div>
    ${rows.join('')}
    ${action ? `<div style="display:flex;gap:8px;margin-top:10px">${action}</div>` : ''}
    ${talk}
  </div>`;
}
function _mpChatErr(e) {
  const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_CHAT_ERRORS[c]);
  return code ? MP_CHAT_ERRORS[code] : 'Le registre ne répond pas, réessaie';
}
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])); }
function _mpEmbInFor(addr) {
  // plusieurs vaisseaux du même commandant en orbite chez moi (un tanker ET son vaisseau amiral) : on montre le vaisseau d'exception (03/11)
  const all = (_mpEmbIn || []).filter(o => o.address === addr);
  if (!all.length) return null;
  const BM = window.SBBlackmarket;
  if (BM && BM.envoyFaceCached) {
    for (const o of all) if (BM.envoyFaceCached(o.presenceId) === undefined) BM.envoyFace(o.presenceId).then(() => { if (typeof mpEmbassyRefresh === 'function') mpEmbassyRefresh(); }).catch(() => {});
    const face = all.find(o => BM.envoyFaceCached(o.presenceId)); if (face) return face;
    const named = all.find(o => BM.shipThumbHtml(o.tanker)); if (named) return named;
  }
  return all[0];
}
function _mpEmbMine(addr) { return (G.tankerMissions || []).find(x => x.status === 'orbital_relay' && x.mpTarget && x.mpTarget.address === addr) || null; }
function _mpChatBadge(addr) {
  const u = _mpChatUnread[addr];
  return u && u.n ? ` <span style="display:inline-block;min-width:16px;padding:0 5px;border-radius:9px;background:#ff5a48;color:#fff;font-size:10px;line-height:16px;text-align:center;font-weight:600">${u.n}</span>` : '';
}

// relève des non-lus (cloud.js toutes les 15 s) : pastilles, bulle flottante, notification du dernier message
function mpIngestChat(rows) {
  const prev = _mpChatUnread;
  _mpChatUnread = {};
  rows.forEach(r => { _mpChatUnread[r.address] = r; });
  const open = _emb && _emb.address && getCurrentScreen() === 'embassy';
  for (const r of rows) {
    if (open && r.address === _emb.address) { mpEmbassyLoadThread(); continue; }   // déjà sous les yeux
    if (_mpChatToasted[r.address] === r.lastId) continue;
    _mpChatToasted[r.address] = r.lastId;
    if (typeof _mpMergeSender === 'function') _mpMergeSender(r.address, r.pseudo);
    toast(`💬 <b>${_esc(r.pseudo)}</b> : ${_esc(r.last.length > 70 ? r.last.slice(0, 68) + '…' : r.last)}`);
    try { if (typeof _vibrate === 'function') _vibrate([40, 60, 40]); } catch (e) {}
  }
  const changed = JSON.stringify(Object.keys(prev).map(k => k + prev[k].n)) !== JSON.stringify(Object.keys(_mpChatUnread).map(k => k + _mpChatUnread[k].n));
  _mpChatBubble();
  if (changed && !open && typeof refreshCurrentScreen === 'function') {
    const cur = getCurrentScreen();
    if (cur === 'fleet' || cur === 'planet-detail') refreshCurrentScreen();
  }
}
// bulle flottante : messages non lus → un toucher ouvre la conversation
function _mpChatBubble() {
  let b = document.getElementById('sb-chat-bubble');
  const list = Object.values(_mpChatUnread).filter(u => u.n > 0).sort((a, c) => String(c.lastAt).localeCompare(String(a.lastAt)));
  const total = list.reduce((s, u) => s + u.n, 0);
  const onEmb = getCurrentScreen() === 'embassy';
  if (!total || onEmb) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'sb-chat-bubble'; b.setAttribute('aria-label', 'Messages non lus');
    b.style.cssText = 'position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 210px);z-index:8000;width:48px;height:48px;border-radius:50%;border:1px solid rgba(95,255,232,.6);background:rgba(8,20,24,.9);color:#5fffe8;font-size:20px;cursor:pointer;box-shadow:0 0 16px rgba(95,255,232,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:0';
    document.body.appendChild(b);
  }
  b.style.display = '';
  b.innerHTML = `💬<span style="position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff5a48;color:#fff;font-size:11px;line-height:18px;font-weight:600">${total}</span>`;
  b.onclick = () => openEmbassy(list[0].address);
}

function openEmbassy(address) {
  if (!/^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(String(address || ''))) { toast('Ambassade introuvable'); return; }
  _emb.address = address; _emb.sig = ''; _emb.thread = null;
  goto('embassy');
  mpEmbassyRender();
  mpEmbassyLoadThread(true);
  _mpChatBubble();
}
function mpEmbassyRefresh() { if (_emb.address && getCurrentScreen() === 'embassy') mpEmbassyRender(); }

function mpEmbassyRender() {
  const addr = _emb.address; if (!addr) return;
  const m = _mpEmbMine(addr), inc = _mpEmbInFor(addr);
  const planet = typeof findPlanetByCoord === 'function' ? findPlanetByCoord(addr) : null;
  const pseudo = (m && m.mpTarget && m.mpTarget.pseudo) || (inc && inc.pseudo) || (planet && planet.playerName) || (_emb.thread && _emb.thread.pseudo) || '?';
  _emb.pseudo = pseudo;
  document.getElementById('emb-meta').innerHTML = `<span>${_esc(pseudo)}</span><span class="dot"></span><span>${addr}</span>`;
  // état : mon tanker chez lui, le sien chez moi, la cale, le pacte (bloc commun avec la fiche planète)
  let status = '';
  if (planet && planet.isReal && typeof mpEmbassyBlockHtml === 'function') status = mpEmbassyBlockHtml(planet).replace(/^<div style="margin-bottom:10px;padding:12px 14px;border:1px solid rgba\(95,255,232,\.3\);border-radius:8px;background:rgba\(95,255,232,\.04\)">/, '<div>');
  if (!status) {
    const rows = [];
    if (m) rows.push(`<div style="font-size:12px;color:#e6f0ff">${_esc(m.tankerName)} en orbite chez ${_esc(pseudo)}</div>`);
    if (inc) rows.push(`<div data-emb-row="tanker" style="font-size:12px;color:#e6f0ff">${window.SBBlackmarket && SBBlackmarket.shipThumbHtml(inc.tanker) ? '' : 'Son tanker '}${_esc(inc.tanker || '')} est en orbite chez toi</div>`);
    const _post = typeof _mpPostWith === 'function' ? _mpPostWith(addr) : null;   // PATCH_1310_POSTES
    if (_post) rows.push(`<div style="font-size:12px;color:#e6f0ff">Vos postes se font face à <span style="font-family:var(--font-mono)">${_post.system}</span></div>`);
    if (!rows.length) rows.push(`<div style="font-size:12px;color:var(--mut)">Aucun tanker en orbite entre vous : l'ambassade est fermée.</div>`);
    status = `<div class="emb-label">Ambassade</div>${rows.join('')}`;
  }
  document.getElementById('emb-status').innerHTML = status;
  // PATCH_0211_AMBASSADEUR — un vaisseau d'exception en orbite : sa fiche avec le logo
  try { if (window.SBBlackmarket) SBBlackmarket.fillEnvoy(document.getElementById('emb-status'), (m && m.bmEnvoy && m.mpPresenceId) || (inc && inc.presenceId) || null, m && m.bmEnvoy ? null : inc && inc.tanker); } catch (e) {}
  // actions : pavillon, sa planète, rappeler mon tanker
  const acts = [];
  if (planet) acts.push(_mpDiploBtn('⚑ Pavillon', `openMessagePlayer('${addr}')`));
  acts.push(_mpDiploBtn('Sa planète', `openPlanetDetail('${addr}')`, 'mut'));
  if (m) acts.push(_mpDiploBtn('Rappeler', `recallOrbitalTanker('${m.id}')`, 'red'));
  document.getElementById('emb-actions').innerHTML = acts.join('');
  mpEmbassyChannelState();
  mpEmbassyMountHero(m, inc, pseudo);
}
function mpEmbassyChannelState() {
  const addr = _emb.address;
  const open = _emb.thread ? _emb.thread.open : !!(_mpEmbMine(addr) || _mpEmbInFor(addr));
  document.getElementById('emb-dot').classList.toggle('off', !open);
  document.getElementById('emb-chan').textContent = open ? `Canal ouvert avec ${_emb.pseudo || ''}` : 'Canal fermé · aucun tanker en orbite entre vous';
  const input = document.getElementById('emb-input');
  input.disabled = !open; document.getElementById('emb-send').disabled = !open || _emb.busy;
  input.placeholder = open ? `Message à ${_emb.pseudo || ''}…` : 'Envoie un tanker en orbite pour rouvrir le canal';
}
function mpEmbassyRenderMsgs() {
  const box = document.getElementById('emb-msgs'); if (!box) return;
  const t = _emb.thread;
  if (!t) { box.innerHTML = `<div class="emb-empty">Connexion au relais…</div>`; return; }
  if (!t.messages.length) { box.innerHTML = `<div class="emb-empty">${t.open ? `Le canal est ouvert. ${_esc(_emb.pseudo)} lira ton message à son prochain passage.` : 'Aucun message.'}</div>`; return; }
  let day = '', html = '';
  for (const msg of t.messages) {
    const d = new Date(msg.created_at || Date.now());
    const dk = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
    if (dk !== day) { day = dk; html += `<div class="emb-day">${dk}</div>`; }
    const hh = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="emb-msg ${msg.mine ? 'me' : 'them'}">${_esc(msg.body)}<span class="t">${hh}${msg.mine && msg.read_at ? ' · lu' : ''}</span></div>`;
  }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = html;
  if (atBottom || !_emb.scrolled) { box.scrollTop = box.scrollHeight; _emb.scrolled = true; }
}
async function mpEmbassyLoadThread(first) {
  const addr = _emb.address;
  if (!addr || _emb.loading) return;
  if (!window.SBMP || !window.SBMP.ready()) { if (first) { _emb.thread = { open: !!(_mpEmbMine(addr) || _mpEmbInFor(addr)), pseudo: _emb.pseudo, messages: [] }; mpEmbassyRenderMsgs(); } return; }
  _emb.loading = true;
  try {
    const t = await window.SBMP.chatThread(addr);
    if (addr !== _emb.address) return;
    const sig = t.open + ':' + t.messages.map(x => x.id + (x.read_at ? 'r' : '')).join(',');
    _emb.thread = t;
    if (t.pseudo && !_emb.pseudo) _emb.pseudo = t.pseudo;
    if (sig !== _emb.sig) { _emb.sig = sig; mpEmbassyRenderMsgs(); mpEmbassyChannelState(); }
    if (t.messages.some(x => !x.mine && !x.read_at) || (_mpChatUnread[addr] && _mpChatUnread[addr].n)) {
      await window.SBMP.chatSeen(addr);
      delete _mpChatUnread[addr]; _mpChatToasted[addr] = null;
    }
  } catch (e) {
    if (first) { _emb.thread = { open: false, pseudo: _emb.pseudo, messages: [] }; mpEmbassyRenderMsgs(); toast(_mpChatErr(e)); }
  } finally { _emb.loading = false; }
}
async function mpEmbassySend() {
  const input = document.getElementById('emb-input');
  const body = (input.value || '').trim();
  if (!body || _emb.busy || !_emb.address) return;
  if (!window.SBMP || !window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  _emb.busy = true; mpEmbassyChannelState();
  try {
    const msg = await window.SBMP.chatSend(_emb.address, body);
    input.value = ''; input.dispatchEvent(new Event('input'));
    if (!_emb.thread) _emb.thread = { open: true, pseudo: _emb.pseudo, messages: [] };
    _emb.thread.messages.push(msg); _emb.sig = '';
    _emb.scrolled = false; mpEmbassyRenderMsgs();
  } catch (e) {
    toast(_mpChatErr(e));
    if (/chat_closed/.test(String(e && e.message))) { if (_emb.thread) _emb.thread.open = false; }
  } finally { _emb.busy = false; mpEmbassyChannelState(); }
}

// vue héros : le tanker TK-07 en orbite, la planète en contrebas (même scène que le chantier orbital), moteurs coupés
function mpEmbassyMountHero(m, inc, pseudo) {
  const scr = document.getElementById('scr-embassy');
  const scroll = scr.querySelector('.screen-scroll');
  const model = typeof UNIT_SHIP3D_MODELS !== 'undefined' && UNIT_SHIP3D_MODELS.tanker;
  // PATCH_0211_AMBASSADEUR — pas de modèle de tanker au-dessus d'un vaisseau d'exception : c'est sa fiche qui le montre
  // visiteur : c'est le serveur (bm_envoy_face) qui dit si le vaisseau en orbite est un vaisseau d'exception — pas son nom (03/11 : le nom annoncé
  // peut être celui d'un tanker, et l'hôte voyait un TK-07 à la place du vaisseau amiral). Première ouverture : on demande, puis on remonte la vue.
  let _face;
  if (!m && inc && inc.presenceId && window.SBBlackmarket && SBBlackmarket.envoyFaceCached) {
    _face = SBBlackmarket.envoyFaceCached(inc.presenceId);
    if (_face === undefined) SBBlackmarket.envoyFace(inc.presenceId).then(() => { if (!scr.classList.contains('hidden')) mpEmbassyMountHero(m, inc, pseudo); }).catch(() => {});
  }
  const _isEnvoy = (m && m.bmEnvoy) || (!m && inc && window.SBBlackmarket && (!!_face || SBBlackmarket.shipThumbHtml(inc.tanker)));
  if ((!model || !window.WebGLRenderingContext) && !_isEnvoy) { scr.classList.remove('ud-hero', 'ud-ship'); return; }
  if (_emb.hero && (!!_isEnvoy !== !!_emb.heroEnvoy)) { try { _emb.hero.dispose(); } catch (e) {} _emb.hero = null; }   // tanker ↔ vaisseau amiral : on remonte
  let hero = document.getElementById('emb-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'emb-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('emb-space');
  if (!space) { space = document.createElement('div'); space.id = 'emb-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h); }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = ''; space.style.display = '';
  if (!hero.querySelector('.u3d-hint')) hero.insertAdjacentHTML('beforeend', '<div class="u3d-hint"></div>');
  const _faceName = _face && _face.item_id && SBBlackmarket.shipName ? SBBlackmarket.shipName(_face.item_id) : '';
  hero.querySelector('.u3d-hint').textContent = _isEnvoy ? (m ? `${m.tankerName} · vaisseau amiral · en orbite chez ${pseudo}` : `${_faceName || inc.tanker || ''}${_faceName && inc.tanker ? ' · ' + inc.tanker : ''} · vaisseau amiral de ${pseudo} · en orbite chez toi`)
    : m ? `TK-07 ${m.tankerName} · en orbite chez ${pseudo}` : inc ? `TK-07 ${inc.tanker || ''} de ${pseudo} · en orbite chez toi` : `Ambassade de ${pseudo}`;
  requestAnimationFrame(() => {
    const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect();
    if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px');
  });
  if (typeof shipHeroGestures === 'function') shipHeroGestures('scr-embassy', () => _emb.hero);
  if (_emb.hero) return;
  if (_isEnvoy) {   // PATCH_0311 : le vaisseau amiral dans sa vitrine Blackmarket en mode orbite (réacteurs éteints, sans effet de déplacement, planète derrière), avec son logo
    if (typeof fleetShip3D !== 'undefined' && fleetShip3D) { try { fleetShip3D.handle.dispose(); } catch (e) {} fleetShip3D = null; }
    if (typeof bdShip3D !== 'undefined' && bdShip3D) { try { bdShip3D.handle.dispose(); } catch (e) {} bdShip3D = null; }
    hero.classList.remove('u3d-fail', 'u3d-loading');
    _emb.heroEnvoy = true;
    _emb.hero = SBBlackmarket.envoyHero(hero, m && m.bmEnvoy ? m.bmEnvoy.item : null, m ? m.mpPresenceId : inc && inc.presenceId) || null;
    if (!_emb.hero) { hero.style.display = 'none'; space.style.display = 'none'; scr.classList.remove('ud-hero', 'ud-ship'); }
    return;
  }
  _emb.heroEnvoy = false;
  // une seule grosse scène en mémoire (iPhone) : la station du chantier est remontée au retour
  if (typeof fleetShip3D !== 'undefined' && fleetShip3D) { try { fleetShip3D.handle.dispose(); } catch (e) {} fleetShip3D = null; }
  if (typeof bdShip3D !== 'undefined' && bdShip3D) { try { bdShip3D.handle.dispose(); } catch (e) {} bdShip3D = null; }
  hero.classList.remove('u3d-fail'); hero.classList.add('u3d-loading');
  const start = () => {
    if (_emb.hero || document.getElementById('scr-embassy').classList.contains('hidden')) return;
    const base = window.Ship3D.profiles && window.Ship3D.profiles.tk07;
    _emb.hero = window.Ship3D.mount(hero, {
      url: model.url, shiftY: 0.2, orbit: true,
      ship: Object.assign({}, base || {}, { planet: true, plasma: false, nozzles: [], dustSpeed: 0.35 }),
      onReady: () => hero.classList.remove('u3d-loading'),
      onError: () => { hero.classList.remove('u3d-loading'); hero.classList.add('u3d-fail'); },
    });
  };
  if (window.Ship3D) start(); else window.addEventListener('ship3d-ready', start, { once: true });
}
function mpEmbassyUnmount() {
  if (_emb.hero) { try { _emb.hero.dispose(); } catch (e) {} _emb.hero = null; } _emb.heroEnvoy = false; _emb.heroPending = false;
  _mpChatBubble();
}
function _mpPirErr(e) {
  const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_PIRACY_ERRORS[c]);
  return code ? MP_PIRACY_ERRORS[code] : 'Le registre ne répond pas, réessaie';
}
function _mpSys(coord) { const m = String(coord || '').match(/^[A-Z]-[A-Z]-\d{4}/); return m ? m[0] : null; }
function _mpOnline() { return !!(window.SBMP && window.SBMP.ready && window.SBMP.ready()); }
// Balises posées, telles que le registre doit les connaître (3 au plus)
function mpBeaconList() {
  // ROUTES_V2 (03/11) : une flotte postée voit par elle-même — au registre, elle compte comme une balise sur son système
  // (règles de visibilité, interceptions et embuscades automatiques inchangées côté serveur). Elles passent en premier.
  const eyes = ((G.fleet && G.fleet.prepared) || []).filter(f => f.ambush && f.ambush.system && (f.ambush.phase === 'posted' || f.ambush.phase === 'going') && _mpSys(f.ambush.system))
    .map(f => ({ local_id: 'amb-' + String(f.id).slice(0, 60), system: _mpSys(f.ambush.system) }));
  const probes = sbAllProbes().filter(p => p.tier === 'beacon' && p.state === 'deployed' && _mpSys(p.deployedSystem))
    .map(p => ({ local_id: String(p.id), system: _mpSys(p.deployedSystem) }));
  return eyes.concat(probes).slice(0, 21);
}

// Coordonnée d'un dock : déterministe (même dock = même système pour tous les joueurs), dans la zone de test
function mpDockSystem(dock) {
  const key = String((dock && (dock.id || dock.name)) || '');
  if (!key) return null;
  if (window.SBLines && SBLines.fixedPort) { const f = SBLines.fixedPort(key); if (f) return f; }   // PATCH_2210_STATIONS6 — stations lointaines
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `A-${'MNO'[h % 3]}-${1000 + (Math.floor(h / 3) % 9000)}`;
}
function _mpConvoyLeg(m, leg) {
  const res3 = (o) => ({ metal: Math.max(0, Math.floor((o && o.metal) || 0)), energie: Math.max(0, Math.floor((o && o.energie) || 0)), cristal: Math.max(0, Math.floor((o && o.cristal) || 0)) });
  if (m.kind === 'route_run') {
    const route = (G.routes || []).find(r => r.id === m.routeId);
    const arriveAt = leg === 'out' ? m.arrivalAt : m.returnArrivalAt;
    const startAt = leg === 'out' ? m.departedAt : (m.returnDepartedAt || m.cancelledAt || Date.now());
    return { missionId: m.id, leg, kind: 'route', to: mpDockSystem(m.dock), dock: m.dock && m.dock.name, elapsedMs: Date.now() - startAt,
      routeType: (route && route.moodKey === 'imperiale') || m.baliseCover ? 'beacon' : 'direct', knowledge: route ? (route.knowledgeLevel || 0) : 0,   // PATCH_1410_BALISAGE
      protection: leg === 'back' && m.protection ? (m.protection.reduction || 0) : 0, tier: m.tier || 1, tanker: m.tankerName,
      cargo: res3(m.cargo), durationMs: arriveAt - Date.now(), arriveAt };
  }
  if (m.kind === 'dropoff' && m.mpTarget && leg === 'out') {
    return { missionId: m.id, leg, kind: 'embassy', to: m.mpTarget.address, dock: null, routeType: m.routeType === 'beacon' ? 'beacon' : 'direct',
      knowledge: 0, protection: 0, tier: m.tankerTier || 1, tanker: m.tankerName, cargo: res3(m.cargo && m.cargo.resources), elapsedMs: Date.now() - m.departedAt,
      durationMs: m.arrivalAt - Date.now(), arriveAt: m.arrivalAt };
  }
  return null;
}
async function mpConvoyRegister(m, leg) {
  if (!m) return;
  if (!m.mpConvoy) m.mpConvoy = {};
  if (m.mpConvoy[leg] && m.mpConvoy[leg] !== 'pending') return;
  const c = _mpConvoyLeg(m, leg);
  if (!c || !c.to || !c.arriveAt || c.arriveAt - Date.now() < 60000) { delete m.mpConvoy[leg]; return; }   // trop tard pour être vu
  // PATCH_2010_AUDIT — un convoi parti d'une colonie est inscrit depuis la colonie (v20)
  if (m.world && m.world !== 'home') { const w = (G.worlds || []).find(x => x && x.id === m.world); if (w && /^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(w.coord || '')) c.origin = w.coord; }
  m.mpConvoy[leg] = 'pending';
  const key = m.id + ':' + leg;
  if (_mpConvoyBusy.has(key) || !_mpOnline()) return;
  _mpConvoyBusy.add(key);
  try {
    const id = await window.SBMP.convoyStart(c);
    if (!m.mpConvoy || m.mpConvoy[leg] !== 'pending') window.SBMP.convoyEnd(m.id, leg);   // demi-tour pendant l'inscription
    else { m.mpConvoy[leg] = id; if (Array.isArray(m.via)) _mpConvoyRoute(m, leg); }   // PATCH_1310_ROUTES2
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/convoy_invalid|convoy_rate|cargo_invalid/.test(msg) && m.mpConvoy && m.mpConvoy[leg] === 'pending') m.mpConvoy[leg] = 'failed';   // inutile de réessayer
    else console.warn('[convoi] inscription :', msg);
  }
  finally { _mpConvoyBusy.delete(key); }
}
// PATCH_1310_ROUTES2 — appel direct au registre (le module cloud ne connaît pas encore cette fonction)
async function _mpRpc(fn, args) {
  let tok = null;
  try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); tok = a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) {}
  if (!tok) throw new Error('no_session');
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';
  const res = await fetch('https://elupnpdcblztpfywnhjl.supabase.co/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + tok }, body: JSON.stringify(args || {}) });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt.slice(0, 200));
  try { return JSON.parse(txt); } catch (e) { return txt; }
}
async function _mpConvoyRoute(m, leg) {
  if (!m || !Array.isArray(m.via) || (m.mpRouteSent || {})[leg]) return;
  const via = leg === 'back' ? m.via.slice().reverse() : m.via;
  try {
    await _mpRpc('mp_convoy_route', { p_mission: m.id, p_leg: leg, p_via: via, p_own: !!m.ownRouteId });
    m.mpRouteSent = Object.assign({}, m.mpRouteSent, { [leg]: true });
  } catch (e) { console.warn('[convoi] tracé :', String(e && e.message || e)); }
}
// ── PATCH_1310_POSTES — postes de route ──
// Un tanker part par ma route vers une de ses balises et y reste en station : une ambassade miniature.
function _routePostFreeTier() {
  for (const t of [1, 2, 3]) if (tankerAvailability(t) > 0) return t;
  return 0;
}
function launchRoutePost(routeId, sysKey) {
  if (!/^[A-Z]-[A-Z]-\d{4}$/.test(String(sysKey || ''))) return;
  if ((G.tankerMissions || []).some(m => m.kind === 'route_post' && m.targetCoords === sysKey && ['in_transit', 'posted'].includes(m.status))) { toast('Tu as déjà un poste ici'); return; }
  if ((G.tankerMissions || []).filter(m => m.kind === 'route_post' && ['in_transit', 'posted'].includes(m.status)).length >= 3) { toast('3 postes ouverts au plus : rappelle un tanker d\'abord'); return; }
  const tier = _routePostFreeTier();
  if (!tier) { toast('Aucun tanker disponible'); return; }
  const plan = window.SBMap && SBMap.planFor ? SBMap.planFor(sysKey) : null;
  const r = routeId ? (plan && plan.routes.find(x => x.id === routeId)) : null;
  if (routeId && !r) { toast('Route rompue ou introuvable'); return; }
  const now = Date.now();
  const ms = r ? 5 * 60 * 1000 * ROUTE_TYPES.own.durationFactor * Math.max(1, Math.min(3, r.len / Math.max(1, plan.direct.len)))
               : 5 * 60 * 1000 * ROUTE_TYPES.direct.durationFactor;   // PATCH_1410_LIGNES : depuis une balise, voie directe
  const m = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: pickTankerName(), tankerTier: tier, kind: 'route_post',
    targetCoords: sysKey, targetLabel: 'Poste ' + sysKey,
    departedAt: now, arrivalAt: now + ms, status: 'in_transit', routeType: r ? 'own' : 'direct',
    ownRouteId: r ? r.id : null, ownRouteName: r ? r.name : null, via: r ? r.via.slice(0, 24) : ((plan && plan.direct.via) || []).slice(0, 24),
    cargo: { soldiers: { garde: 0, lourd: 0 }, resources: { metal: 0, energie: 0, cristal: 0 } }, riskLossPct: 0,
  };
  if (!Array.isArray(G.tankerMissions)) G.tankerMissions = [];
  G.tankerMissions.push(sbTagWorld(m));
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof saveGame === 'function') saveGame();
  toast(`${m.tankerName} part ouvrir un poste à ${sysKey} · ${formatTankerDuration(ms)}`);
  if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  return m;
}
async function recallRoutePost(missionId) {
  const m = (G.tankerMissions || []).find(x => x.id === missionId && x.kind === 'route_post');
  if (!m || !['posted', 'in_transit'].includes(m.status)) return;
  const others = (G._mpPosts || []).filter(o => o.system === m.targetCoords);
  const ok = await sbConfirm({ title: 'Rappeler ' + m.tankerName + ' ?',
    body: `Le poste de <strong>${m.targetCoords}</strong> ferme.` + (others.length ? `<br><br>Le canal avec ${others.map(o => _esc(o.pseudo)).join(', ')} se refermera (l'historique reste lisible).` : ''),
    confirmLabel: 'Rappeler', cancelLabel: 'Garder le poste' });
  if (!ok) return;
  const now = Date.now(), back = Math.max(60000, (m.arrivalAt - m.departedAt) || 300000);
  const elapsed = m.status === 'in_transit' ? Math.max(0, now - m.departedAt) : back;   // demi-tour : le chemin déjà fait
  m.status = 'returning'; m.returnDepartedAt = now; m.returnArrivalAt = now + Math.min(back, elapsed || back);
  // PATCH_2010_AUDIT — fermeture rejouée par mpPostSync si hors ligne ou en échec (sinon le poste restait ouvert au registre)
  let _closed = false;
  if (_mpOnline()) { try { await _mpRpc('mp_post_close', { p_mission: m.id }); _closed = true; } catch (e) {} }
  if (!_closed) { if (!Array.isArray(G.mpPostsToClose)) G.mpPostsToClose = []; if (!G.mpPostsToClose.includes(m.id)) G.mpPostsToClose.push(m.id); }
  m.mpPostId = null;
  if (typeof saveGame === 'function') saveGame();
  toast(`${m.tankerName} rentre du poste de ${m.targetCoords}`);
  mpPostsPoll(true);
  if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
}
// inscription des postes au registre (rejouée tant qu'elle n'a pas réussi : hors ligne au moment de l'arrivée)
async function mpPostSync() {
  if (!_mpOnline()) return;
  for (const id of (Array.isArray(G.mpPostsToClose) ? G.mpPostsToClose.slice() : [])) {   // PATCH_2010_AUDIT
    try { await _mpRpc('mp_post_close', { p_mission: id }); G.mpPostsToClose = G.mpPostsToClose.filter(x => x !== id); } catch (e) {}
  }
  for (const m of (G.tankerMissions || []).filter(x => x.kind === 'route_post' && x.status === 'posted' && !x.mpPostId)) {
    try {
      m.mpPostId = await _mpRpc('mp_post_open', { p_mission: m.id, p_system: m.targetCoords, p_tanker: m.tankerName, p_route: m.ownRouteName || null });
      if (typeof saveGame === 'function') saveGame();
    } catch (e) { console.warn('[poste] inscription :', String(e && e.message || e)); }
  }
}
async function mpPostsPoll(force) {
  if (!_mpOnline() || (!force && Date.now() - _mpPostsAt < 55000)) return;
  _mpPostsAt = Date.now();
  await mpPostSync();
  try {
    const rows = await _mpRpc('mp_posts_visible', {});
    const clean = (Array.isArray(rows) ? rows : []).filter(r => /^[A-Z]-[A-Z]-\d{4}$/.test(r.system || '') && /^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(r.address || ''))
      .map(r => ({ system: r.system, pseudo: String(r.pseudo || '').slice(0, 20), address: r.address, tanker: String(r.tanker_name || '').slice(0, 24), openedAt: Date.parse(r.opened_at) || Date.now(), met: !!r.met }));
    const was = JSON.stringify(G._mpPosts || []);
    const fresh = clean.filter(r => r.met && !(G._mpPosts || []).some(o => o.met && o.address === r.address && o.system === r.system));
    G._mpPosts = clean;
    for (const r of fresh) toast(`⚑ ${r.pseudo} tient un poste à ${r.system} · canal d'ambassade ouvert`);
    if (was !== JSON.stringify(clean) && window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  } catch (e) { console.warn('[poste] relève :', String(e && e.message || e)); }
}
function _mpPostWith(addr) {
  return (G._mpPosts || []).find(o => o.address === addr && o.met) || null;
}
function mpConvoyEnd(m, leg) {
  if (!m || !m.mpConvoy || !m.mpConvoy[leg] || m.mpConvoy[leg] === 'failed') return;
  delete m.mpConvoy[leg];
  if (_mpOnline()) window.SBMP.convoyEnd(m.id, leg);
}
function _mpPirReport(type, d, key) {
  if (!G.reports) G.reports = [];
  const id = 'rpt-pir-' + key;
  const known = G.reports.find(r => r.id === id);
  if (known) return known;
  const T = MP_PIRACY_TYPES[type];
  const r = { id, kind: 'piracy', fleetName: (d.icon || '⚔') + ' ' + (d.pseudo || 'Pavillon inconnu'), targetName: T.list,
    intent: { label: T.sub, icon: '' }, doctrine: { color: T.color }, returnedAt: Date.now(), read: false, piracy: Object.assign({ type }, d) };
  G.reports.unshift(r);
  return r;
}

// NIVEAU_0811 — niveaux des commandants du carnet : ceux mémorisés à « 1 » (ancien bug des pavillons) sont
// redemandés au registre (mp_world_card, arrondi à 5 comme une sonde Moyenne), au plus une fois par heure et
// par monde, puis l'écran se redessine. Sans registre, rien ne change.
var _mpLevelAskedAt = {};
function mpRefreshCarnetLevels(targets) {
  if (!window.SBMP || !SBMP.ready || !SBMP.ready() || !Array.isArray(targets)) return;
  const now = Date.now();
  const todo = targets.filter(t => t && t.mp && t.mpAddress && (!t.level || t.level <= 1) && now - (_mpLevelAskedAt[t.mpAddress] || 0) > 3600000).slice(0, 8);
  if (!todo.length) return;
  todo.forEach(t => { _mpLevelAskedAt[t.mpAddress] = now; });
  Promise.all(todo.map(t => SBMP.worldCard(t.mpAddress).then(w => w && w.level_estimate > 1 ? { address: t.mpAddress, pseudo: w.pseudo || t.mpPseudo, planet_name: w.planet_name || null, level_estimate: w.level_estimate, last_seen_days: w.last_seen_days } : null).catch(() => null)))
    .then(rows => {
      const got = rows.filter(Boolean);
      if (!got.length) return;
      for (const r of got) mergeRealWorlds(String(r.address).split('-').slice(0, 3).join('-'), [r], { noReport: true });
    });
}
