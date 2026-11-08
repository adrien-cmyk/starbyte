/* Starbyte — f06_prospection_carnet.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


// Bascule entre les 4 onglets du Centre de prospection (v1.1-d + passe 6)
function setProspectTab(tab) {
  // Compat : si on reçoit 'sonder' (ancien), on redirige vers 'sondes'
  if (tab === 'sonder' || tab === 'sonde') tab = 'sondes';
  // PASSE 6 — Si on demande 'archives' mais l'onglet est caché (pas encore
  // de contenu), retomber sur 'sondes' pour éviter un pane vide visible.
  if (tab === 'archives') {
    const archivesBtn = document.getElementById('prospect-tab-archives');
    if (archivesBtn && archivesBtn.style.display === 'none') {
      tab = 'univers';
    }
  }
  G.prospectTab = tab;
  // 4 onglets : sondes / univers / rapports / archives
  ['sondes', 'univers', 'rapports', 'archives'].forEach(t => {
    const btn = document.getElementById('prospect-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    const pane = document.getElementById('prospect-pane-' + t);
    if (pane) pane.style.display = (t === tab) ? '' : 'none';
  });
  // Cacher les anciens panes
  const oldPane = document.getElementById('prospect-pane-sonde');
  if (oldPane) oldPane.style.display = 'none';
  const oldSonder = document.getElementById('prospect-pane-sonder');
  if (oldSonder) oldSonder.style.display = 'none';

  // Rafraîchir le contenu de l'onglet actif
  if (tab === 'sondes') {
    renderProbesPane();
  } else if (tab === 'univers') {
    // SPACE MAP — la carte remplace la liste « par système » ; dessous : Carnet / Joueurs
    if (!G.universeTab || G.universeTab === 'systems') G.universeTab = 'list';
    if (window.SBMap) SBMap.render();
    renderUniverseScreen();
  } else if (tab === 'rapports') {
    renderProspectRapports();
  } else if (tab === 'archives') {
    // PASSE 6 — render Archives + reset badge à l'ouverture
    if (typeof renderArchivesPane === 'function') renderArchivesPane();
  }
}

// Navigue vers Prospect et ouvre directement le bon onglet (utilisé par les blocs dashboard)
function openProspectAtTab(tab) {
  G.prospectTab = tab || 'sonde';
  goto('prospect');
  // Activer le bon onglet APRÈS le goto (qui rend l'écran avec l'onglet par défaut)
  // setTimeout 0 pour s'exécuter après le tick de rendu
  setTimeout(() => {
    if (typeof setProspectTab === 'function') setProspectTab(G.prospectTab);
  }, 0);
}

// Met à jour le badge "non lus" sur l'onglet Rapports
function updateProspectRapportsBadge() {
  const badge = document.getElementById('prospect-tab-rapports-badge');
  if (!badge) return;
  // Compter : rapports planète non lus + rapports sondes v1.1 non lus + rapports tanker non lus (14/05)
  // + ⚡ Phase 4 P1 : rapports de balise non lus
  const unreadPlanet = collectUnreadReports().length;
  const unreadProbe = (G.probeReports || []).filter(r => !r.read).length;
  const unreadTanker = (G.tankerReports || []).filter(r => !r.read).length;
  const unreadBeacon = (G.beaconReports || []).filter(r => !r.read).length;
  const unreadSignal = typeof sbSignalUnread === 'function' ? sbSignalUnread() : 0;   // ROUTES_V2
  const unread = unreadPlanet + unreadProbe + unreadTanker + unreadBeacon + unreadSignal;
  if (unread > 0) {
    badge.style.display = '';
    badge.textContent = unread;
  } else {
    badge.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════
// PARSER & VALIDATION D'ADRESSE COSMIQUE
// ═══════════════════════════════════════════════════════════════

// Parse une adresse cosmique en ses composants.
// Format v2 (cosmographie ch.15) : W-X-YYYY-Z (4 segments)
//   W = cluster (A-Z, amas)
//   X = sector (A-Z, secteur dans l'amas)
//   YYYY = system (1000-9999)
//   Z = spot (01-99, position dans le système)
//
// Accepte les 4 niveaux partiels :
//   "A"           → { kind:'cluster', cluster:'A' }
//   "A-C"         → { kind:'sector',  cluster:'A', sector:'C' }
//   "A-C-7777"    → { kind:'system',  cluster:'A', sector:'C', system:7777 }
//   "A-C-7777-12" → { kind:'spot',    cluster:'A', sector:'C', system:7777, planet:12 }
//
// Rétrocompatibilité v1 (3 segments) — implicitement Amas A :
//   "C"           → { kind:'sector',  cluster:'A', sector:'C' }
//   "C-7777"      → { kind:'system',  cluster:'A', sector:'C', system:7777 }
//   "C-7777-1"    → { kind:'spot',    cluster:'A', sector:'C', system:7777, planet:1 }
//
// Retourne null si format invalide.
function parseCosmicAddress(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const clean = addr.trim().toUpperCase();
  if (!clean) return null;

  // ─── PASSE 5.1 — Format signature : SIG-XXX (3-4 hex) ───
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  // Reconnu par les sondes Légère (résolution) et Moyenne (verrouillage)
  const mSig = clean.match(/^SIG-([0-9A-F]{3,4})$/);
  if (mSig) {
    return {
      kind: 'signature',
      signatureId: 'SIG-' + mSig[1],
    };
  }

  // ─── Format v2 (4 segments) ───

  // Format spot : W-X-YYYY-Z  (ex. A-C-7777-12)
  const mSpot = clean.match(/^([A-Z])-([A-Z])-(\d{1,4})-(\d{1,2})$/);
  if (mSpot) {
    const z = parseInt(mSpot[4], 10);
    if (z < 1 || z > 99) return null;
    return {
      kind: 'spot',
      cluster: mSpot[1],
      sector: mSpot[2],
      system: parseInt(mSpot[3], 10),
      planet: z,
    };
  }

  // Format système : W-X-YYYY  (ex. A-C-7777)
  const mSystemV2 = clean.match(/^([A-Z])-([A-Z])-(\d{1,4})$/);
  if (mSystemV2) {
    return {
      kind: 'system',
      cluster: mSystemV2[1],
      sector: mSystemV2[2],
      system: parseInt(mSystemV2[3], 10),
    };
  }

  // Format secteur : W-X  (ex. A-C)
  const mSectorV2 = clean.match(/^([A-Z])-([A-Z])$/);
  if (mSectorV2) {
    return {
      kind: 'sector',
      cluster: mSectorV2[1],
      sector: mSectorV2[2],
    };
  }

  // ─── Rétrocompatibilité v1 (3 segments, sans cluster — implicitement A) ───

  // Format planète (legacy v1) : X-XXXX-Z avec Z=1-99
  const mPlanetV1 = clean.match(/^([A-Z])-(\d{1,4})-(\d{1,2})$/);
  if (mPlanetV1) {
    const z = parseInt(mPlanetV1[3], 10);
    if (z < 1 || z > 99) return null;
    return {
      kind: 'spot',
      cluster: 'A',  // Migration implicite vers Amas A
      sector: mPlanetV1[1],
      system: parseInt(mPlanetV1[2], 10),
      planet: z,
    };
  }

  // Format système (legacy v1) : X-XXXX
  const mSystemV1 = clean.match(/^([A-Z])-(\d{1,4})$/);
  if (mSystemV1) {
    return {
      kind: 'system',
      cluster: 'A',
      sector: mSystemV1[1],
      system: parseInt(mSystemV1[2], 10),
    };
  }

  // Format secteur (legacy v1) : X seul
  const mSectorV1 = clean.match(/^([A-Z])$/);
  if (mSectorV1) {
    return {
      kind: 'sector',
      cluster: 'A',
      sector: mSectorV1[1],
    };
  }

  // Format cluster seul : impossible à distinguer du secteur legacy, donc on
  // ne le supporte que via le préfixe explicite — fallback : null
  return null;
}

// Valide une adresse pour un tier donné.
// Retourne { valid: bool, error: string|null, parsed: object|null }
function validateAddressForTier(addr, tier) {
  const cfg = PROBE_TIER_CONFIG[tier];
  if (!cfg) return { valid: false, error: 'Tier inconnu', parsed: null };

  // Vide = autorisé (= aléatoire)
  if (!addr || !addr.trim()) {
    return { valid: true, error: null, parsed: null };
  }

  const parsed = parseCosmicAddress(addr);
  if (!parsed) {
    return {
      valid: false,
      error: `Format invalide. Attendu : W-X, W-X-YYYY ou W-X-YYYY-Z (ex. ${cfg.defaultExample})`,
      parsed: null,
    };
  }

  // Vérifier que le format partiel est compatible avec le tier
  if (!cfg.validPatterns.includes(parsed.kind)) {
    const labels = {
      cluster:   'un amas entier (W)',
      sector:    'un secteur entier (W-X)',
      system:    'un système entier (W-X-YYYY)',
      spot:      'un spot précis (W-X-YYYY-Z)',
      signature: 'une signature (SIG-XXX)',
    };
    const allowed = cfg.validPatterns.map(p => labels[p]).join(', ');
    return {
      valid: false,
      error: `${cfg.label} ne peut cibler que : ${allowed}`,
      parsed,
    };
  }

  // ─── PASSE 5.1 — Validation spécifique aux signatures ───
  if (parsed.kind === 'signature') {
    // La signature doit exister dans G.signatures
    if (!G.signatures || !G.signatures[parsed.signatureId]) {
      return {
        valid: false,
        error: `Signature inconnue. Détecte-la avec une Radar d'abord.`,
        parsed,
        reason: 'unknown_signature',
      };
    }
    const sig = G.signatures[parsed.signatureId];

    // ─── Validation selon tier ───
    // PASSE 5.1 : Légère = résoudre une signature NON résolue
    // PASSE 5.2 : Moyenne = verrouiller une signature résolue FIXE sans adresse
    if (tier === 'light') {
      if (sig.resolved) {
        const resolveType = sig.resolvedType === 'moving' ? 'mouvante' : 'fixe';
        return {
          valid: false,
          error: `Cette signature est déjà résolue (${resolveType}).`,
          parsed,
          reason: 'already_resolved',
        };
      }
      // OK : signature non résolue, la Légère peut la résoudre
      return { valid: true, error: null, parsed };
    }

    if (tier === 'medium') {
      // La Moyenne verrouille des corps orbitaux identifiés (signature résolue fixe)
      if (!sig.resolved) {
        return {
          valid: false,
          error: `Cette signature n'est pas encore résolue. Envoie d'abord une Légère.`,
          parsed,
          reason: 'not_resolved',
        };
      }
      if (sig.resolvedType === 'moving') {
        return {
          valid: false,
          error: `Signature mouvante : utilise un tanker, pas une Moyenne.`,
          parsed,
          reason: 'is_moving',
        };
      }
      if (sig.fixedAddress) {
        return {
          valid: false,
          error: `Cette signature est déjà verrouillée : ${sig.fixedAddress}`,
          parsed,
          reason: 'already_locked',
        };
      }
      // OK : signature résolue fixe SANS adresse → la Moyenne peut verrouiller
      return { valid: true, error: null, parsed };
    }

    // Fallback pour autres tiers (Radar, Furtive)
    return {
      valid: false,
      error: `Ce type de sonde ne peut pas cibler une signature.`,
      parsed,
      reason: 'wrong_tier',
    };
  }

  // Vérifier bornes système (1000-9999) — sauf si trop court, on étend à droite
  if (parsed.system !== undefined && (parsed.system < 1000 || parsed.system > 9999)) {
    return { valid: false, error: 'Numéro de système hors limites (1000-9999)', parsed };
  }

  // ─── Vérifier la portée cartographique du joueur ───
  // Cf. starbyte_gdd_v1/13_sondes_exploration.md (RÈGLES DE PORTÉE)
  // Message volontairement physique ("capteurs actuels"), pas pédagogique :
  // on n'aiguille jamais le joueur vers tel ou tel skill (Pilier 7 + Principe #7).
  if (typeof isInRange === 'function' && !isInRange(parsed)) {
    // 03/11 (retour joueur : « les sondes furtives ne marchent pas depuis la colonie ») : la portée est celle du Laboratoire de la planète
    // affichée (décision du 30/10) — on le dit, et on nomme la planète d'où la cible est à portée, s'il y en a une
    let from = null;
    try {
      const act = G.activeWorld || 'home';
      for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) {
        if (!w || w.id === act) continue;
        const o = w.id === 'home' ? MY_ADDRESS : _sbAddrOf(w.coord);
        if (o && typeof _isInRangeFrom === 'function' && _isInRangeFrom(parsed, o, w.id)) { from = w; break; }
      }
    } catch (e) {}
    const many = Array.isArray(G.worlds) && G.worlds.length > 1;
    return {
      valid: false,
      error: (many ? `Trop loin pour les capteurs de ${(G.planet && G.planet.name) || 'cette planète'}` : 'Trop loin pour les capteurs actuels')
        + (from ? ` · à portée depuis ${from.name || (from.id === 'home' ? 'la capitale' : 'une autre de tes planètes')} : lance-la depuis là-bas` : ''),
      parsed,
      reason: 'out_of_range',  // tag interne pour styler le message différemment
      fromWorld: from ? from.id : null,
    };
  }

  return { valid: true, error: null, parsed };
}

// ─── Onglet "Sondes" — Hangar des sondes (style Caserne) ───
function renderProbesPane() {
  const list = document.getElementById('probes-cards-list');
  if (!list) return;

  const pool = G.probesPool || [];
  const missions = G.probeMissions || [];

  // Header : adresse cosmique + récap
  const myCoord = G.planet?.coordString || '—';
  const onMissionTotal = missions.filter(m => m.status === 'in_transit').length;
  // Compteur de cibles connues (univers mouvant — cf. ch.16 GDD)
  const knownTargets = G.knownTargets || {};
  const knownCount = Object.keys(knownTargets).length;

  const headerHtml = `
    <div style="padding:8px 16px 4px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;gap:12px">
        <div style="min-width:0">
          <div style="font-size:10px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase">${(Array.isArray(G.worlds) && G.worlds.length > 1) ? 'Départ depuis' : 'Adresse de ma planète'}</div>
          <div style="font-family:'SF Mono',monospace;color:var(--cyan);font-size:18px;letter-spacing:.04em;margin-top:2px">${myCoord}</div>
          ${(Array.isArray(G.worlds) && G.worlds.length > 1) ? `<div style="font-size:10px;color:var(--mut);margin-top:3px;line-height:1.4">Sondes communes à tout l'empire : elles partent de la planète affichée.</div>` : ''}
        </div>
        <div style="display:flex;gap:14px;align-items:baseline;flex-shrink:0">
          ${onMissionTotal > 0
            ? `<div style="text-align:right">
                <div style="font-size:10px;color:var(--mut);letter-spacing:.06em">En mission</div>
                <div style="color:var(--amber);font-size:14px;font-family:'SF Mono',monospace;margin-top:2px">⊙ ${onMissionTotal}</div>
              </div>`
            : ''
          }
          ${knownCount > 0
            ? `<div style="text-align:right;cursor:pointer" onclick="setProspectTab('univers')" title="Voir dans l'Univers">
                <div style="font-size:10px;color:var(--mut);letter-spacing:.06em">Cibles connues</div>
                <div style="color:#ffc864;font-size:14px;font-family:'SF Mono',monospace;margin-top:2px">◆ ${knownCount}</div>
              </div>`
            : ''
          }
        </div>
      </div>
    </div>
    ${(() => { const h = _probeQueueHtml(''); return `<div class="probe-queue-live" data-tier="" style="margin:6px 8px 4px;${h ? '' : 'display:none'}">${h}</div>`; })()}
    <div class="section-label" style="margin-top:6px">Hangar des sondes</div>
  `;

  // Chips type "def-comp-row" : 1 par tier
  const chipsHtml = Object.values(PROBE_TIER_CONFIG).map(cfg => {
    const totalInTier = pool.filter(p => p.tier === cfg.key).length;
    const readyInTier = pool.filter(p => p.tier === cfg.key && p.state === 'ready').length;
    const onMissionInTier = missions.filter(m => m.tier === cfg.key && m.status === 'in_transit').length;

    // Skill débloqué ? (TODO: câbler aux vrais skills plus tard)
    const skillUnlocked = true;

    const locked = !skillUnlocked;
    const opacity = locked ? '.4' : '1';

    // Stats line (style def-comp-stats)
    let statsLine;
    if (locked) {
      statsLine = `<span style="color:var(--mut)">Skill requis : ${cfg.skillRequired}</span>`;
    } else if (readyInTier === 0 && totalInTier === 0) {
      statsLine = `<span style="color:var(--mut)">Aucune construite</span>`;
    } else {
      const parts = [`${readyInTier} prête${readyInTier > 1 ? 's' : ''}`];
      if (onMissionInTier > 0) parts.push(`<span style="color:var(--amber)">${onMissionInTier} en mission</span>`);
      statsLine = parts.join(' · ');
    }
    const _inQ = ((QUEUES.prospect && QUEUES.prospect.commands) || []).filter(c => c.unitKey === 'probe_' + cfg.key).length;   // PATCH_2510_PROBE_QUEUE
    if (!locked && _inQ) statsLine += `${statsLine ? ' · ' : ''}<span style="color:${cfg.accent}">${_inQ} en file</span>`;

    // Illustration via getIllustration() — pattern identique aux unités militaires
    // (gère PNG + fallback automatique via pngFallback())
    const pngKey = 'probe_' + cfg.key;
    const iconHtml = getIllustration(pngKey);

    return `
      <div class="def-comp-row" onclick="${locked ? '' : `openProbeDetail('${cfg.key}')`}" style="opacity:${opacity};${locked ? 'cursor:not-allowed' : ''}">
        <div class="def-comp-icon" style="color:${cfg.accent};background:${cfg.accentSoft};border-color:${cfg.accent}55">${iconHtml}</div>
        <div class="def-comp-info">
          <div class="def-comp-name">${cfg.label}<span style="color:var(--mut);font-weight:400;font-size:10px;letter-spacing:.08em;margin-left:8px;text-transform:uppercase">${cfg.sublabel}</span></div>
          <div class="def-comp-stats">${statsLine}</div>
        </div>
        <div class="def-comp-total" style="color:${cfg.accent}">${readyInTier}</div>
        <div class="def-comp-arrow">→</div>
      </div>
    `;
  }).join('');

  list.innerHTML = `
    ${headerHtml}
    <div style="padding:0 8px">
      ${chipsHtml}
    </div>
  `;
}

// ─── Ouvre la fiche détaillée d'un tier de sonde ───
function openProbeDetail(tier) {
  G.probeDetailTier = tier;
  goto('probe-detail');
}

// ─── Auto-format pendant la saisie ───
// Format cible : W-X-YYYY-Z  (4 segments avec auto-tirets)
//   W = cluster (1 lettre A-Z)
//   X = sector  (1 lettre A-Z)
//   YYYY = system (1-4 chiffres, 1000-9999)
//   Z = spot (1-2 chiffres, 01-99)
// Auto-insère les tirets pendant que le joueur tape.
function formatCosmicAddress(raw) {
  if (!raw) return '';
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 0) return '';

  // ─── PASSE 5.1 — Format signature SIG-XXX ───
  // Si l'input commence par SIG, on respecte ce format sans réarranger
  if (clean.startsWith('SIG')) {
    const hex = clean.slice(3, 7).replace(/[^0-9A-F]/g, ''); // 3-4 hex max
    if (hex.length === 0) return 'SIG';
    return 'SIG-' + hex;
  }

  // Lecture séquentielle des caractères
  let i = 0;
  const n = clean.length;

  // Segment 1 (W) : 1 lettre
  if (!/[A-Z]/.test(clean[i])) return '';
  const w = clean[i];
  i++;
  let result = w;
  if (i >= n) return result;

  // Segment 2 (X) : 1 lettre
  // Si le 2e char est un chiffre → format legacy (3 segments) — on laisse passer
  if (/[A-Z]/.test(clean[i])) {
    const x = clean[i];
    i++;
    result += '-' + x;
    if (i >= n) return result;

    // Segment 3 (YYYY) : jusqu'à 4 chiffres
    let digits = '';
    while (i < n && /[0-9]/.test(clean[i]) && digits.length < 4) {
      digits += clean[i];
      i++;
    }
    if (digits.length > 0) result += '-' + digits;
    if (i >= n) return result;

    // Segment 4 (Z) : jusqu'à 2 chiffres (01-99)
    let z = '';
    while (i < n && /[0-9]/.test(clean[i]) && z.length < 2) {
      z += clean[i];
      i++;
    }
    if (z.length > 0) result += '-' + z;
    return result;
  }

  // ─── Fallback legacy v1 (X-YYYY-Z, 3 segments) ───
  // Le 2e char est un chiffre → on garde l'ancien comportement pour rétrocompat
  let digits = '';
  while (i < n && /[0-9]/.test(clean[i]) && digits.length < 4) {
    digits += clean[i];
    i++;
  }
  if (digits.length > 0) result += '-' + digits;
  if (i >= n) return result;

  let z = '';
  while (i < n && /[0-9]/.test(clean[i]) && z.length < 2) {
    z += clean[i];
    i++;
  }
  if (z.length > 0) result += '-' + z;
  return result;
}

// Validation déléguée à validateAddressForTier (qui parse + check tier)
function isValidCosmicAddress(addr, tier) {
  const validation = validateAddressForTier(addr, tier || G.probeDetailTier);
  return validation.valid && validation.parsed !== null;
}

function onCosmicAddressInput(input) {
  // Auto-format pendant la saisie
  const oldVal = input.value;
  const formatted = formatCosmicAddress(oldVal);
  if (formatted !== oldVal) {
    input.value = formatted;
  }
  // Sauvegarder dans probeDispatchState
  const tier = G.probeDetailTier;
  if (probeDispatchState[tier]) {
    probeDispatchState[tier].coord = formatted;
  }
  // Update bouton + message d'erreur
  updateProbeDispatchButton();
}

function setProbeDispatchMode(tier, mode) {
  if (probeDispatchState[tier]) {
    // Compat : 'local' → 'cosmic' (le concept local disparaît, tout est cosmique)
    if (mode === 'local') mode = 'cosmic';
    probeDispatchState[tier].mode = mode;
  }
  renderProbeDetailScreen();
}

// Update du bouton + affichage du message d'erreur sous l'input
function updateProbeDispatchButton() {
  const btn = document.getElementById('probe-dispatch-action-btn');
  const errEl = document.getElementById('probe-address-error');
  const tier = G.probeDetailTier;
  const cfg = PROBE_TIER_CONFIG[tier];
  const state = probeDispatchState[tier];
  const ready = getReadyProbesByTier(tier);

  let canDispatch = ready.length > 0;
  let errorMsg = '';
  let errorReason = '';  // 'out_of_range' = traité comme info (ambre), sinon faute (rouge)

  if (canDispatch && state.mode === 'cosmic') {
    const validation = validateAddressForTier(state.coord, tier);
    if (state.coord && state.coord.trim() && !validation.valid) {
      canDispatch = false;
      errorMsg = validation.error || 'Adresse invalide';
      errorReason = validation.reason || '';
    }
    // Si vide → autorisé (aléatoire)
  }

  if (btn) {
    btn.disabled = !canDispatch;
    // Le style :disabled est géré par CSS .btn-ignition:disabled (opacity .35, pointer-events: none)
    // Plus besoin de toucher opacity/cursor inline (chunk D 14/05).
  }
  if (errEl) {
    if (errorMsg) {
      // Out of range = limite physique, pas une faute du joueur → ambre, pas de ⚠
      // Cf. Principe #7 (silence coûteux) + GDD 13 (RÈGLES DE PORTÉE) :
      // on ne sanctionne pas le joueur d'avoir essayé, on lui dit calmement
      // que ce n'est pas atteignable avec ses capteurs actuels.
      if (errorReason === 'out_of_range') {
        errEl.textContent = errorMsg;
        errEl.style.color = '#ff9d52';  // ambre — pas rouge
        errEl.style.fontStyle = 'italic';
        errEl.style.opacity = '.85';
      } else {
        errEl.textContent = errorMsg;
        errEl.style.color = 'var(--red)';
        errEl.style.fontStyle = '';
        errEl.style.opacity = '';
      }
      errEl.style.display = '';
    } else {
      errEl.style.display = 'none';
    }
  }
}

// ─── Construction d'une sonde depuis la fiche ───
function buildProbeFromDetail() {
  const tier = G.probeDetailTier;
  const cfg = PROBE_TIER_CONFIG[tier];
  if (!cfg) return;

  // Vérifier le coût
  for (const [res, qty] of Object.entries(cfg.cost)) {
    if (!G.res[res] || G.res[res].v < qty) {
      toast(`Ressources insuffisantes : ${qty} ${res}`);
      return;
    }
  }
  // Vérifier quota TOTAL (déjà construites + en file)
  const pool = G.probesPool || [];
  const totalInTier = pool.filter(p => p.tier === tier).length;
  const inQueueForTier = (QUEUES.prospect.commands || []).reduce((acc, cmd) => {
    if (cmd.unitKey === 'probe_' + tier) {
      return acc + (cmd.totalQty - cmd.completed);
    }
    return acc;
  }, 0);
  const effectiveTotal = totalInTier + inQueueForTier;
  if (cfg.quotaMax !== 999 && effectiveTotal >= cfg.quotaMax) {
    toast(`Quota max atteint (${cfg.quotaMax})`);
    return;
  }

  // Déduire le coût (à payer d'avance, comme recruitUnit)
  for (const [res, qty] of Object.entries(cfg.cost)) {
    G.res[res].v -= qty;
  }

  // Mapper le tier → clé pseudo-unit
  const unitKey = 'probe_' + tier;
  const pseudoUnit = PROBE_PSEUDO_UNITS[unitKey];
  if (!pseudoUnit) {
    toast('Erreur interne : pseudo-unit introuvable');
    return;
  }
  const unitDuration = Math.max(1, pseudoUnit.duration || 120);

  // Ajouter à la file de construction
  const command = {
    unitKey,
    probeTier: tier,        // mémorise le tier pour completeUnitProduction
    totalQty: 1,            // 1 sonde à la fois (comme un bâtiment)
    completed: 0,
    currentElapsed: 0,
    unitDuration: unitDuration,
    cost: cfg.cost,
    addedAt: Date.now(),
  };
  QUEUES.prospect.commands.push(command);

  toast(`⌛ ${cfg.label} en construction (${formatTime(unitDuration)})`);

  // Re-render fiche + démarrer ticker
  renderProbeDetailScreen();
  renderDashResGrid && renderDashResGrid();
  startQueueTicker();
}

// ─── Envoi d'une sonde depuis la fiche ───
function dispatchProbeFromDetail() {
  const tier = G.probeDetailTier;
  const cfg = PROBE_TIER_CONFIG[tier];
  if (!cfg) return;

  const state = probeDispatchState[tier];
  let targetCoords = null;

  if (state.mode === 'cosmic') {
    // Vide = aléatoire
    if (state.coord && state.coord.trim()) {
      const validation = validateAddressForTier(state.coord, tier);
      if (!validation.valid) {
        toast(validation.error || 'Adresse invalide');
        return;
      }
      targetCoords = state.coord.trim().toUpperCase();
    } else {
      targetCoords = null; // aléatoire
    }
  } else {
    // mode 'random' : null = aléatoire
    targetCoords = null;
  }

  const mission = launchProbe(tier, targetCoords, 'local', false);
  if (mission) {
    renderProbeDetailScreen();
  }
}

// ─── Rendu de la fiche détaillée d'un tier de sonde ───
function renderProbeDetailScreen() {
  const tier = G.probeDetailTier;
  const cfg = PROBE_TIER_CONFIG[tier];
  if (!cfg) return;

  // SPACE MAP (10/10/2026) — plus de saisie d'adresse ni d'envoi depuis la fiche :
  // Radar → « Balayer » sur la Carte ; Légère / Moyenne → bouton sur une signature
  // (Carte ou Rapports). La balise garde son déploiement ici (cible un système).
  {
    const hide = tier !== 'beacon';
    const dl = document.getElementById('pd-dispatch-label');
    const de = document.getElementById('pd-dispatch');
    if (dl) dl.style.display = hide ? 'none' : '';
    if (de) de.style.display = hide ? 'none' : '';
    let note = document.getElementById('pd-send-note');
    if (!note && de) {
      note = document.createElement('div');
      note.id = 'pd-send-note';
      note.style.cssText = 'margin:10px 16px 0;padding:10px 12px;border:1px dashed var(--line);border-radius:8px;font-size:10px;color:var(--mut);line-height:1.6;letter-spacing:.04em';
      de.parentNode.insertBefore(note, de);
    }
    if (note) {
      note.style.display = hide ? '' : 'none';
      note.innerHTML = tier === 'radar'
        ? `L'envoi se fait depuis la <b style="color:var(--txt)">Carte</b> : touche une zone sombre, puis <b style="color:var(--txt)">Balayer</b>.`
        : `L'envoi se fait depuis une <b style="color:var(--txt)">signature</b>, sur la Carte ou dans un rapport.`;
    }
  }

  // Header
  const title = document.getElementById('pd-title');
  const meta = document.getElementById('pd-meta');
  // ⚡ Phase 4 P1 — Pour la balise, on dit "BALISE" tout court (pas "SONDE BALISE")
  if (title) title.textContent = (tier === 'beacon') ? cfg.label.toUpperCase() : ('SONDE ' + cfg.label.toUpperCase());
  if (meta) meta.innerHTML = `${cfg.sublabel} · <span style="color:${cfg.accent}">${cfg.behaviorLabel}</span>`;

  // Banner — utiliser getIllustration() (style identique aux fiches d'unités)
  const banner = document.getElementById('pd-banner');
  if (banner) banner.style.borderColor = `${cfg.accent}40`;
  const bannerIcon = document.getElementById('pd-icon');
  const bannerName = document.getElementById('pd-name');
  const bannerSub = document.getElementById('pd-sub');
  if (bannerIcon) {
    bannerIcon.innerHTML = getIllustration('probe_' + tier);
    bannerIcon.style.color = cfg.accent;
  }
  if (bannerName) bannerName.textContent = cfg.label;
  if (bannerSub) {
    if (cfg.behavior === 'sacrificial') {
      bannerSub.textContent = 'Brûle à l\'arrivée — détection seulement';
    } else if (cfg.behavior === 'persistent') {
      // ⚡ Phase 4 P1 — Balise reste sur place
      bannerSub.textContent = 'Reste en orbite après le déploiement — surveillance continue';
    } else {
      bannerSub.textContent = 'Revient au pool avec rapport complet';
    }
  }

  // Stats — tailles cohérentes avec les fiches d'unités (pas de chiffre géant)
  const pool = G.probesPool || [];
  const missions = G.probeMissions || [];
  const totalInTier = pool.filter(p => p.tier === tier).length;
  const readyInTier = pool.filter(p => p.tier === tier && p.state === 'ready').length;
  const onMissionInTier = missions.filter(m => m.tier === tier && m.status === 'in_transit').length;

  const statsEl = document.getElementById('pd-stats');
  if (statsEl) {
    const quotaText = cfg.quotaMax === 999 ? 'illimité' : `max ${cfg.quotaMax}`;
    statsEl.innerHTML = `
      <div class="dash-stat-row">
        <span class="lbl">Prêtes au lancement</span>
        <span class="val" style="color:${cfg.accent}">${readyInTier}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">En mission</span>
        <span class="val ${onMissionInTier > 0 ? 'warn' : ''}">${onMissionInTier}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">Quota total</span>
        <span class="val">${totalInTier} / ${quotaText}</span>
      </div>
      <div class="dash-stat-row" style="border-top:1px solid var(--line);padding-top:8px;margin-top:6px">
        <span class="lbl">Durée mission</span>
        <span class="val">${cfg.duration}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">Comportement</span>
        <span class="val" style="font-size:11px">${
          cfg.behavior === 'sacrificial' ? 'Brûle à l\'arrivée'
          : cfg.behavior === 'persistent' ? 'Reste sur place (rappelable)'
          : 'Revient au pool'
        }</span>
      </div>
    `;
  }

  // ─── Missions actives de ce tier (passe 5.4 fix critique) ───
  // Liste avec timer pour chaque mission en cours. Re-render automatique
  // via le passive loop tick (10s) mais on update aussi à l'ouverture
  // de la fiche.
  const activeMissionsForTier = missions.filter(m => m.tier === tier && m.status === 'in_transit');
  const missionsListEl = document.getElementById('pd-active-missions');
  if (missionsListEl) {
    if (activeMissionsForTier.length === 0) {
      missionsListEl.innerHTML = '';
      missionsListEl.style.display = 'none';
    } else {
      missionsListEl.style.display = '';
      missionsListEl.innerHTML = `
        <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px">Missions en cours</div>
        ${activeMissionsForTier.map(m => {
          const remainingMs = Math.max(0, m.arrivalAt - Date.now());
          const totalMs = m.arrivalAt - m.departedAt;
          const elapsedMs = totalMs - remainingMs;
          const pct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
          const remainingSec = Math.floor(remainingMs / 1000);
          const timerText = remainingSec === 0
            ? 'Retour imminent'
            : (remainingSec < 60
                ? `${remainingSec}s`
                : (remainingSec < 3600
                    ? `${Math.floor(remainingSec / 60)}min ${remainingSec % 60}s`
                    : `${Math.floor(remainingSec / 3600)}h ${Math.floor((remainingSec % 3600) / 60)}min`));
          const targetTxt = m.targetCoords
            ? `<span style="font-family:'SF Mono',monospace;font-size:10px;color:${cfg.accent}">${m.targetCoords}</span>`
            : `<span style="color:var(--mut);font-size:10px;font-style:italic">cible aléatoire</span>`;
          return `
            <div style="padding:10px 12px;background:var(--bg-soft);border:1px solid ${cfg.accent}30;border-radius:6px;margin-bottom:6px">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                <span style="font-size:11px;color:var(--text)">${m.targetCoords ? sbDestLabel(m.targetCoords).label : 'cible au hasard'} · ${targetTxt} <span style="color:var(--mut);font-size:10px">· ${m.probeName || 'Sonde'}</span></span>
                <span style="font-size:11px;color:${cfg.accent};font-family:'SF Mono',monospace">${timerText}</span>
              </div>
              <div style="height:3px;background:var(--bg);border-radius:2px;overflow:hidden">
                <div style="width:${pct.toFixed(1)}%;height:100%;background:${cfg.accent};transition:width .3s"></div>
              </div>
            </div>
          `;
        }).join('')}
      `;
    }
  }

  // ⚡ Phase 4 P1 — Liste des balises déployées (uniquement pour tier='beacon')
  const deployedBeaconsEl = document.getElementById('pd-deployed-beacons');
  if (deployedBeaconsEl) {
    if (tier !== 'beacon') {
      deployedBeaconsEl.style.display = 'none';
      deployedBeaconsEl.innerHTML = '';
    } else {
      const deployedBeacons = pool.filter(p => p.tier === 'beacon' && p.state === 'deployed');
      if (deployedBeacons.length === 0) {
        deployedBeaconsEl.style.display = 'none';
        deployedBeaconsEl.innerHTML = '';
      } else {
        deployedBeaconsEl.style.display = '';
        deployedBeaconsEl.innerHTML = `
          <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px">Balises en surveillance</div>
          ${deployedBeacons.map(b => {
            const elapsedMs = Date.now() - (b.deployedAt || Date.now());
            const elapsedMin = Math.floor(elapsedMs / 60000);
            const detCount = b.detectionCount || 0;
            const systemTxt = b.deployedSystem
              ? `<span style="font-family:'SF Mono',monospace;color:${cfg.accent}">${b.deployedSystem}</span>`
              : `<span style="color:var(--mut);font-style:italic">système inconnu</span>`;
            return `
              <div style="padding:10px 12px;background:var(--bg-soft);border:1px solid ${cfg.accent}30;border-radius:6px;margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                  <span style="font-size:11px;color:var(--text)">📡 ${systemTxt}</span>
                  <button onclick="recallBeacon('${b.id}')" style="font-size:10px;padding:4px 10px;background:transparent;border:1px solid ${cfg.accent}60;color:${cfg.accent};border-radius:4px;cursor:pointer;letter-spacing:.04em">Rappeler</button>
                </div>
                <div style="font-size:10px;color:var(--mut)">
                  En orbite depuis ${elapsedMin} min · ${detCount} détection${detCount > 1 ? 's' : ''}
                </div>
              </div>
            `;
          }).join('')}
        `;
      }
    }
  }

  // Description
  const descEl = document.getElementById('pd-desc-text');
  if (descEl) descEl.textContent = cfg.longDescription;

  // Construction section
  const buildEl = document.getElementById('pd-build');
  if (buildEl) {
    const atQuota = cfg.quotaMax !== 999 && totalInTier >= cfg.quotaMax;
    const canAfford = Object.entries(cfg.cost).every(([res, qty]) =>
      G.res && G.res[res] && G.res[res].v >= qty
    );
    const costStr = Object.entries(cfg.cost).map(([res, qty]) => `${qty} ${res}`).join(' · ');

    // ─── Liste des sondes de ce tier en file de construction ───
    // (passe 4.5 — barre de progression visible)
    const inQueueForTier = (QUEUES.prospect.commands || []).filter(
      cmd => cmd.unitKey === 'probe_' + tier
    );
    // PATCH_2510_PROBE_QUEUE : toute la file (pas seulement la première sonde de ce type)
    const _qh = _probeQueueHtml(tier);
    const queueHtml = `<div class="probe-queue-live" data-tier="${tier}" style="margin-top:12px;${_qh ? '' : 'display:none'}">${_qh}</div>`;

    let buildBtn;
    const totalEffective = totalInTier + inQueueForTier.reduce((acc, cmd) => acc + (cmd.totalQty - cmd.completed), 0);
    if (cfg.quotaMax !== 999 && totalEffective >= cfg.quotaMax) {
      buildBtn = `<button class="btn-primary" disabled style="width:100%;padding:13px;opacity:.4;cursor:not-allowed">Quota max atteint (${cfg.quotaMax})</button>`;
    } else if (canAfford) {
      buildBtn = `<button class="btn-primary" onclick="buildProbeFromDetail()" style="width:100%;padding:13px">Construire une sonde ${cfg.label.toLowerCase()}</button>`;
    } else {
      buildBtn = `<button class="btn-primary" disabled style="width:100%;padding:13px;opacity:.4;cursor:not-allowed">Manque : ${costStr}</button>`;
    }

    buildEl.innerHTML = `
      <div class="dash-stat-row">
        <span class="lbl">Coût de construction</span>
        <span class="val">${costStr}</span>
      </div>
      ${queueHtml}
      <div style="margin-top:10px">${buildBtn}</div>
    `;
  }

  // Envoi section — unifiée v1.1-e
  // Plus de "Local" obscur. Juste Aléatoire ou Cosmique, avec format adaptatif au tier.
  // ⚡ Phase 4 P1 — Label adapté pour balise ("Déployer" au lieu de "Envoyer")
  const dispatchLabel = document.getElementById('pd-dispatch-label');
  if (dispatchLabel) {
    dispatchLabel.textContent = (tier === 'beacon') ? 'Déployer une balise' : 'Envoyer une sonde';
  }
  const dispatchEl = document.getElementById('pd-dispatch');
  if (dispatchEl) {
    if (readyInTier === 0) {
      dispatchEl.innerHTML = `
        <div style="padding:6px;text-align:center;color:var(--mut);font-size:12px;line-height:1.6">
          Aucune sonde prête au lancement.<br>
          Construis-en une d'abord.
        </div>
      `;
    } else {
      const state = probeDispatchState[tier];
      // Normaliser : 'local' (legacy) → 'cosmic'
      if (state.mode === 'local') state.mode = 'cosmic';
      const isCosmic = state.mode === 'cosmic';
      const isRandom = state.mode === 'random';

      // Labels des formats acceptés par ce tier (pour aide visuelle)
      const formatLabels = {
        cluster: 'W',
        sector:  'W-X',
        system:  'W-X-YYYY',
        spot:    'W-X-YYYY-Z',
      };
      const formatHelpParts = cfg.validPatterns.map(p => {
        const labels = {
          cluster:   '<span style="color:'+cfg.accent+'">W</span> = amas entier',
          sector:    '<span style="color:'+cfg.accent+'">W-X</span> = secteur entier',
          system:    '<span style="color:'+cfg.accent+'">W-X-YYYY</span> = système entier',
          spot:      '<span style="color:'+cfg.accent+'">W-X-YYYY-Z</span> = spot précis',
          signature: '<span style="color:'+cfg.accent+'">SIG-XXX</span> = signature à résoudre',
        };
        return labels[p];
      }).filter(Boolean);
      const formatHelp = formatHelpParts.join('<br>');

      // Bouton "exemple" cliquable pour pré-remplir
      // L'exemple est généré dynamiquement pour rester dans la portée du joueur :
      // - secteur seul → ton secteur d'origine
      // - système → un système dans ton secteur (autre que le tien)
      // - spot → un spot dans ton système (pas ta planète)
      const exampleAddr = (typeof buildExampleForTier === 'function')
        ? buildExampleForTier(cfg)
        : cfg.defaultExample;
      const exampleBtn = `<button onclick="setProbeAddress('${tier}','${exampleAddr}')" style="background:transparent;border:1px solid ${cfg.accent}40;color:${cfg.accent};font-family:'SF Mono',monospace;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;letter-spacing:.04em">${exampleAddr}</button>`;

      dispatchEl.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button onclick="setProbeDispatchMode('${tier}','random')" style="flex:1;padding:10px;border-radius:8px;border:1px solid ${isRandom ? cfg.accent : 'var(--border)'};background:${isRandom ? cfg.accentSoft : 'transparent'};color:${isRandom ? cfg.accent : 'var(--mut)'};cursor:pointer;font-size:11px;letter-spacing:.06em">Aléatoire</button>
          <button onclick="setProbeDispatchMode('${tier}','cosmic')" style="flex:1;padding:10px;border-radius:8px;border:1px solid ${isCosmic ? cfg.accent : 'var(--border)'};background:${isCosmic ? cfg.accentSoft : 'transparent'};color:${isCosmic ? cfg.accent : 'var(--mut)'};cursor:pointer;font-size:11px;letter-spacing:.06em">Cosmique</button>
        </div>
        ${isCosmic ? `
          ${renderSignaturesListForTier(tier, cfg)}
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
              <span style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Ou taper une adresse</span>
              <span style="font-size:9px;color:var(--mut)">Essayer : ${exampleBtn}</span>
            </div>
            <input type="text" id="probe-cosmic-input" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" value="${state.coord || ''}" oninput="onCosmicAddressInput(this)"
                   maxlength="12" placeholder="${cfg.defaultExample}"
                   style="width:100%;padding:14px;background:var(--bg-soft);border:1px solid var(--border);border-radius:8px;color:${cfg.accent};font-family:'SF Mono',monospace;font-size:18px;text-align:center;letter-spacing:.08em">
            <div id="probe-address-error" style="display:none;font-size:10px;color:var(--red);text-align:center;margin-top:8px;line-height:1.4;padding:0 4px"></div>
            <div style="font-size:9px;color:var(--mut);text-align:left;margin-top:8px;line-height:1.7;padding:0 4px">
              ${formatHelp}
            </div>
            <div style="font-size:9px;color:var(--mut);text-align:center;margin-top:10px;letter-spacing:.04em;font-style:italic;opacity:.7">
              Portée actuelle des capteurs : <span style="color:${cfg.accent};opacity:.85;font-style:normal">${(typeof getRangeLabel === 'function') ? getRangeLabel() : '—'}</span>
            </div>
          </div>
        ` : `
          ${cfg.behavior === 'sacrificial' ? `
            <div style="padding:14px;text-align:center;color:var(--mut);font-size:11px;font-style:italic;line-height:1.6">
              La sonde piochera un point aléatoire dans l'univers connu.
            </div>
            <div style="padding:0 14px 6px;text-align:center;color:#ff9d52;font-size:10px;line-height:1.6;font-style:italic;opacity:.85">
              ⓘ Mode aléatoire — aucune signature ne sera relevée.<br>
              <span style="color:var(--mut);font-style:normal">Cible un système (W-X-YYYY) pour détecter des signatures.</span>
            </div>
          ` : `
            <div style="padding:14px;text-align:center;color:var(--mut);font-size:11px;font-style:italic;line-height:1.5">
              La sonde piochera un système non encore exploré.
            </div>
          `}
        `}
        <div style="margin-top:14px">
          <button id="probe-dispatch-action-btn" class="btn-ignition probe-cta" onclick="dispatchProbeFromDetail()"
                  style="border-color:${cfg.accent}80;color:${cfg.accent};box-shadow:0 0 8px ${cfg.accent}40, inset 0 1px 0 ${cfg.accent}30">
            <span class="ignite-icon" style="color:${cfg.accent};font-size:22px">◇</span>
            <span class="ignite-label">Envoyer la sonde</span>
            <span class="ignite-arrow">→</span>
          </button>
        </div>
      `;
      // Update btn state + erreur (après le DOM)
      setTimeout(updateProbeDispatchButton, 0);
    }
  }
}

// Rend la liste des cibles connues compatibles avec un tier de sonde donné.
// Filtrage : un tier qui accepte 'spot' peut cibler toutes les knownTargets,
// un tier qui n'accepte que 'system' ne voit que les cibles à l'échelle système.
// Cf. PROBE_TIER_CONFIG.validPatterns.
function renderKnownTargetsListForTier(tier, cfg) {
  const targets = G.knownTargets || {};
  const entries = Object.entries(targets);
  if (entries.length === 0) return '';

  // Filtrer les cibles dont le format est compatible avec ce tier
  const acceptsSpot   = cfg.validPatterns.includes('spot');
  const acceptsSystem = cfg.validPatterns.includes('system');
  const compatible = entries.filter(([coord, t]) => {
    // Toutes nos knownTargets sont des spots (univers mouvant), donc on a juste
    // besoin de vérifier que le tier accepte 'spot'.
    return acceptsSpot;
  });

  if (compatible.length === 0) return '';

  // Tri : plus récent en haut
  compatible.sort((a, b) => (b[1].discoveredAt || 0) - (a[1].discoveredAt || 0));
  // Limite affichage à 5 (le reste est dans l'écran Univers)
  const shown = compatible.slice(0, 5);
  const extra = compatible.length - shown.length;

  const rows = shown.map(([coord, t]) => {
    const icon = t.icon || '◆';
    const label = t.label || 'Cible inconnue';
    // Loot estimé (si dispo)
    let lootHint = '';
    if (t.lootEstimate) {
      const r = t.lootEstimate.resource;
      lootHint = ` · ~${t.lootEstimate.min}-${t.lootEstimate.max} ${r}`;
    }
    // Âge (depuis discoveredAt)
    const ageMs = Date.now() - (t.discoveredAt || Date.now());
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const ageLabel = ageDays === 0 ? 'aujourd\'hui' : ageDays === 1 ? 'hier' : `il y a ${ageDays}j`;

    return `
      <div onclick="setProbeAddress('${tier}','${coord}')"
           style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;background:var(--bg-soft);transition:border-color .15s">
        <div style="font-size:18px;line-height:1;flex-shrink:0">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text);line-height:1.3">${label}</div>
          <div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace;letter-spacing:.04em;margin-top:2px">${coord}<span style="color:var(--mut);opacity:.6">${lootHint}</span></div>
        </div>
        <div style="font-size:9px;color:var(--mut);flex-shrink:0;letter-spacing:.05em">${ageLabel}</div>
      </div>
    `;
  }).join('');

  const extraLabel = extra > 0
    ? `<div style="font-size:10px;color:var(--mut);text-align:center;margin-top:6px;font-style:italic">+ ${extra} autre${extra > 1 ? 's' : ''} cible${extra > 1 ? 's' : ''} (voir Univers)</div>`
    : '';

  return `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">
        Cibles connues — ${compatible.length}
      </div>
      ${rows}
      ${extraLabel}
    </div>
  `;
}

// ─── PASSE 5.1 — Liste des signatures disponibles pour ce tier ───
// Cf. starbyte_gdd_v1/17_signatures_resolution.md
// Affichée dans la fiche d'une Sonde Légère (et plus tard Moyenne).
// Permet de cliquer sur une signature pour pré-remplir l'input.
function renderSignaturesListForTier(tier, cfg) {
  // Uniquement si le tier accepte les signatures
  if (!cfg.validPatterns.includes('signature')) return '';
  if (!G.signatures) return '';

  // ─── Filtre selon le tier ───
  // Légère : signatures NON résolues (à résoudre)
  // Moyenne : signatures résolues FIXES sans adresse (à verrouiller)
  let entries;
  let sectionLabel;
  if (tier === 'light') {
    entries = Object.entries(G.signatures).filter(([id, s]) => !s.resolved);
    sectionLabel = 'Signatures à résoudre';
  } else if (tier === 'medium') {
    entries = Object.entries(G.signatures).filter(([id, s]) =>
      s.resolved && s.resolvedType === 'fixed' && !s.fixedAddress
    );
    sectionLabel = 'Signatures à verrouiller';
  } else {
    return '';
  }

  if (entries.length === 0) return '';

  // Tri : plus récent en haut
  entries.sort((a, b) => {
    const aTs = tier === 'light' ? (a[1].detectedAt || 0) : (a[1].resolvedAt || 0);
    const bTs = tier === 'light' ? (b[1].detectedAt || 0) : (b[1].resolvedAt || 0);
    return bTs - aTs;
  });
  const shown = entries.slice(0, 6);
  const extra = entries.length - shown.length;

  const rows = shown.map(([id, sig]) => {
    // Âge depuis détection (ou résolution pour Moyenne)
    const baseTs = tier === 'light' ? (sig.detectedAt || Date.now()) : (sig.resolvedAt || Date.now());
    const ageMs = Date.now() - baseTs;
    const ageH = Math.floor(ageMs / (60 * 60 * 1000));
    const ageD = Math.floor(ageH / 24);
    const ageLabel = ageD > 0 ? `${ageD}j` : (ageH > 0 ? `${ageH}h` : 'récent');

    // Badge "dans le carnet" si applicable
    const carnetBadge = sig.inCarnet
      ? `<span style="font-size:8px;background:rgba(160,200,255,.15);color:#a0c8ff;padding:1px 5px;border-radius:3px;letter-spacing:.06em;margin-left:6px">CARNET</span>`
      : '';

    // Sous-ligne : type + intensité + système (Légère) OU classe + système (Moyenne)
    let subLine;
    if (tier === 'medium') {
      const classLabels = {
        dead_world: 'Monde mort identifié',
        gas_giant:  'Planète gazeuse identifiée',
        habitable:  'Corps habitable identifié',
        lunar:      'Lune stérile identifiée',
        unknown:    'Corps orbital identifié',
      };
      const classLabel = classLabels[sig.fixedClass] || 'Corps orbital identifié';
      subLine = `${classLabel} · <span style="font-family:'SF Mono',monospace">${sig.system}</span>`;
    } else {
      subLine = `${sig.typeLabel} · ${sig.intensity} · <span style="font-family:'SF Mono',monospace">${sig.system}</span>`;
    }

    return `
      <div onclick="setProbeAddress('${tier}','${id}')"
           style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;background:var(--bg-soft);transition:border-color .15s">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:6px">
            <span style="font-family:'SF Mono',monospace;font-size:13px;color:${cfg.accent};letter-spacing:.06em">${id}</span>
            ${carnetBadge}
          </div>
          <div style="font-size:10px;color:var(--mut);margin-top:3px;line-height:1.4">
            ${subLine}
          </div>
        </div>
        <div style="font-size:9px;color:var(--mut);flex-shrink:0;letter-spacing:.05em">${ageLabel}</div>
      </div>
    `;
  }).join('');

  const extraLabel = extra > 0
    ? `<div style="font-size:10px;color:var(--mut);text-align:center;margin-top:6px;font-style:italic">+ ${extra} autre${extra > 1 ? 's' : ''} signature${extra > 1 ? 's' : ''} non listée${extra > 1 ? 's' : ''}</div>`
    : '';

  return `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">
        ${sectionLabel} — ${entries.length}
      </div>
      ${rows}
      ${extraLabel}
    </div>
  `;
}

// Helper : pré-remplir l'adresse (utilisé par le bouton "exemple")
function setProbeAddress(tier, addr) {
  if (probeDispatchState[tier]) {
    probeDispatchState[tier].coord = addr;
    probeDispatchState[tier].mode = 'cosmic';
  }
  renderProbeDetailScreen();
}

function toggleArchives() {
  _archivesUnfolded = !_archivesUnfolded;
  renderProspectRapports();
}

function renderProspectRapports() {
  const list = document.getElementById('prospect-rapports-list');
  if (!list) return;
  try { mpTidyPlayerReports(); } catch (e) {}

  // ─── Collecter tous les rapports (rapports planète + rapports sondes v1.1) ───
  const allReports = [];

  // 1. Rapports de planètes (ancien système)
  for (const sys of Object.values(G.knownSystems || {})) {
    for (const p of sys.planets || []) {
      if (p.report) {
        allReports.push({
          kind: 'planet',
          planet: p,
          system: sys,
          timestamp: p.reportTimestamp || 0,
          unread: !p.reportRead,
        });
      }
    }
  }

  // 2. Rapports de sondes v1.1 (nouveau système : radar, légère, moyenne, furtive, secrets)
  for (const r of (G.probeReports || [])) {
    allReports.push({
      kind: 'probe',
      report: r,
      timestamp: r.createdAt || 0,
      unread: !r.read,
    });
  }

  // 3. Rapports de retour de tanker (chunk feedback 14/05)
  // Cf. feedback Adrien : rapports narratifs cliquables avec ressources ramenées,
  // moteur narratif McCarthy/Foundation/Expanse (déjà codé dans _narrateNarrativeReturn).
  for (const r of (G.tankerReports || [])) {
    allReports.push({
      kind: 'tanker',
      report: r,
      timestamp: r.createdAt || 0,
      unread: !r.read,
    });
  }

  // 4. ⚡ Phase 4 P1 — Rapports de balise (détections passives)
  // Même structure que les autres : kind+report+timestamp+unread
  for (const r of (G.beaconReports || [])) {
    allReports.push({
      kind: 'beacon',
      report: r,
      timestamp: r.createdAt || 0,
      unread: !r.read,
    });
  }

  // PATCH_1510_RAPPORTS_TABS — SONDES | MISSIONS, puis Radar · Légère · Moyenne · Furtive
  const _rt = _rapTabs(allReports);
  const _tabsHtml = _rt.html;
  const _all0 = allReports.length;
  allReports.length = 0; allReports.push(..._rt.list);
  if (allReports.length === 0) {
    list.innerHTML = _tabsHtml + (_rt.tab === 'sondes' ? prospectRuleHtml() : '') + `<div class="empty-line">${_all0 === 0 ? 'Aucun rapport de mission. Envoie une sonde pour collecter des données.' : _rt.tab === 'missions' ? 'Aucun retour de tanker ni passage relevé par tes balises pour l\'instant.' : 'Aucun rapport de ce type.'}</div>`;
    return;
  }

  // Tri par date décroissante (le plus récent en haut)
  allReports.sort((a, b) => b.timestamp - a.timestamp);

  // ─── PASSE 4-sondes-v1.1-c : Auto-archivage ───
  // Top 10 récents toujours visibles + repli "Archives"
  const RECENT_COUNT = 10;
  // 13/10 — systèmes marqués « sans intérêt » sur la carte : leurs rapports filent d'office aux archives
  const _tags = G.systemTags || {};
  const _isSkip = (x) => x.kind === 'probe' && _tags[String((x.report && x.report.targetCoords) || '').toUpperCase().split('-').slice(0, 3).join('-')] === 'skip';
  const _kept = allReports.filter(x => !_isSkip(x)), _skipped = allReports.filter(_isSkip);
  const recents = _kept.slice(0, RECENT_COUNT);
  const archives = _kept.slice(RECENT_COUNT).concat(_skipped);

  const recentsHtml = recents.map(r => swRow(r, renderReportRow(r))).join('');   // PATCH_1610_SWIPE_DELETE

  const archivesHtml = archives.length === 0 ? '' : `
    <div style="margin:14px 16px 4px">
      <div onclick="toggleArchives()" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px dashed var(--border);border-radius:8px;cursor:pointer;color:var(--mut);font-size:11px;letter-spacing:.08em">
        <span>📋 Archives — ${archives.length} rapport${archives.length > 1 ? 's' : ''} plus anciens</span>
        <span style="color:var(--cyan);font-family:'SF Mono',monospace">${_archivesUnfolded ? '▾' : '▸'}</span>
      </div>
    </div>
    ${_archivesUnfolded ? `<div style="padding:0 0 8px">${archives.map(r => swRow(r, renderReportRow(r))).join('')}</div>` : ''}
  `;

  list.innerHTML = _tabsHtml + (_rt.tab === 'sondes' ? prospectRuleHtml() : '') + `<div style="padding:0 0 8px">${recentsHtml}${archivesHtml}</div>`;
}
function _rapSubOf(x) {
  if (x.kind !== 'probe') return 'other';
  const t = x.report && x.report.tier;
  return ['radar', 'light', 'medium', 'stealth'].includes(t) && !x.report.isSecret ? t : 'other';
}
function _rapTabs(all) {
  const sondes = all.filter(x => x.kind === 'probe' || x.kind === 'planet');
  const missions = all.filter(x => x.kind === 'tanker' || x.kind === 'beacon');
  const unread = (arr) => arr.filter(x => x.unread).length;
  let tab = G._rapTab === 'missions' ? 'missions' : 'sondes';
  if (!G._rapTab && !sondes.length && missions.length) tab = 'missions';
  const subs = RAP_SUBS.map(([k, l, c]) => ({ k, l, c, items: sondes.filter(x => _rapSubOf(x) === k) })).filter(o => o.items.length || o.k !== 'other');
  let sub = G._rapSub;
  if (!subs.some(o => o.k === sub && o.items.length)) sub = (subs.find(o => o.items.some(x => x.unread)) || subs.find(o => o.items.length) || subs[0]).k;
  G._rapSub = sub;   // PATCH_1910 — on reste sur l'onglet affiché : lire le dernier non-lu ne doit pas sauter vers un autre onglet
  const badge = (n) => n ? `<i class="rap-n">${n}</i>` : '';
  const fleetUnread = (G.reports || []).filter(r => !r.read).length;
  let html = `<div class="rap-tabs">
      <button class="rap-tab${tab === 'sondes' ? ' on' : ''}" onclick="setRapTab('sondes')"><b>Sondes</b><span>${sondes.length} rapport${sondes.length > 1 ? 's' : ''}</span>${badge(unread(sondes))}</button>
      <button class="rap-tab${tab === 'missions' ? ' on' : ''}" onclick="setRapTab('missions')"><b>Missions</b><span>tankers · balises</span>${badge(unread(missions))}</button>
    </div>`;
  let list;
  if (tab === 'sondes') {
    html += `<div class="rap-subs">${subs.map(o => `<button class="rap-sub${o.k === sub ? ' on' : ''}" style="--c:${o.c}" onclick="setRapSub('${o.k}')">${o.l}${o.items.length ? ` <em>${o.items.length}</em>` : ''}${unread(o.items) ? '<i></i>' : ''}</button>`).join('')}</div>`;
    list = (subs.find(o => o.k === sub) || { items: [] }).items;
  } else {
    const mis = [{ k: 'tankers', l: 'Tankers', c: '#ffc864', items: missions.filter(x => x.kind === 'tanker') },
                 { k: 'balises', l: 'Balises', c: '#a370ff', items: missions.filter(x => x.kind === 'beacon') }];
    let mk = G._rapMis;
    if (!mis.some(o => o.k === mk && o.items.length)) mk = (mis.find(o => o.items.some(x => x.unread)) || mis.find(o => o.items.length) || mis[0]).k;
    if (G._rapMis && mis.some(o => o.k === G._rapMis)) mk = G._rapMis;
    G._rapMis = mk;   // PATCH_1910 — idem
    html += `<div class="rap-subs">${mis.map(o => `<button class="rap-sub${o.k === mk ? ' on' : ''}" style="--c:${o.c}" onclick="setRapMis('${o.k}')">${o.l}${o.items.length ? ` <em>${o.items.length}</em>` : ''}${unread(o.items) ? '<i></i>' : ''}</button>`).join('')}</div>`;
    const cur = mis.find(o => o.k === mk);
    if (mk === 'balises') {
      html += (typeof sbSignalReportHtml === 'function' ? sbSignalReportHtml() : '');   // ROUTES_V2 : le signal d'antenne en attente
      const live = cur.items.filter(x => (x.report.expiresAt || 0) > Date.now()).length;
      html += `<div style="margin:-4px 18px 10px;font-size:10px;color:var(--mut);line-height:1.5">${live ? `<span style="color:#a370ff">${live} fenêtre${live > 1 ? 's' : ''} d'interception ouverte${live > 1 ? 's' : ''}</span> · ` : ''}historique des passages : 24 h, 30 derniers</div>`;
      list = cur.items;
      return { html: _rapCss() + html, list, tab };   // PATCH_1710_BEACON_HISTORY
    }
    list = cur.items;
    if ((G.reports || []).length) html += `<div class="rap-link" onclick="goto('reports')"><span>Rapports de flotte, de pillage et d'ambassade${fleetUnread ? ` · <b>${fleetUnread} non lu${fleetUnread > 1 ? 's' : ''}</b>` : ''}</span><i>→</i></div>`;
  }
  return { html: _rapCss() + html, list, tab };
}
function setRapTab(t) { G._rapTab = t; _archivesUnfolded = false; renderProspectRapports(); }
function setRapMis(k) { G._rapMis = k; _archivesUnfolded = false; renderProspectRapports(); }
function setRapSub(k) { G._rapSub = k; _archivesUnfolded = false; renderProspectRapports(); }
function _rapCss() {
  if (document.getElementById('rap-css')) return '';
  const st = document.createElement('style'); st.id = 'rap-css';
  st.textContent = `
    .rap-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 16px 10px}
    .rap-tab{position:relative;padding:12px 10px 10px;border-radius:12px;border:1px solid rgba(120,160,190,.22);background:rgba(10,16,24,.6);color:#cfdbe4;font:inherit;text-align:center;cursor:pointer}
    .rap-tab b{display:block;font-size:13px;letter-spacing:.2em;text-transform:uppercase;font-weight:600}
    .rap-tab span{display:block;margin-top:3px;font-size:10px;color:var(--mut);letter-spacing:.04em}
    .rap-tab.on{border-color:rgba(95,255,232,.6);background:linear-gradient(180deg,rgba(95,255,232,.14),rgba(95,255,232,.04));color:#5fffe8;box-shadow:0 0 18px rgba(95,255,232,.08)}
    .rap-tab .rap-n{position:absolute;top:-6px;right:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#ffc864;color:#1a1204;font:700 11px/20px 'SF Mono',monospace;font-style:normal}
    .rap-subs{display:flex;gap:6px;margin:0 16px 12px;overflow-x:auto;scrollbar-width:none}
    .rap-subs::-webkit-scrollbar{display:none}
    .rap-sub{position:relative;flex:1 0 auto;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:var(--mut);font:inherit;font-size:11px;letter-spacing:.06em;white-space:nowrap;cursor:pointer}
    .rap-sub em{font-style:normal;opacity:.6;margin-left:3px}
    .rap-sub.on{border-color:var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
    .rap-sub i{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:#ffc864}
    .rap-link{display:flex;justify-content:space-between;align-items:center;margin:0 16px 12px;padding:11px 14px;border:1px solid rgba(255,192,96,.28);border-radius:10px;background:rgba(255,192,96,.05);font-size:11.5px;color:#e6dcc8;cursor:pointer}
    .rap-link b{color:#ffc864;font-weight:600}
    .rap-link i{font-style:normal;color:#ffc864}
    #scr-prospect.sm-world #rapports-section-label{display:none}`;
  document.head.appendChild(st);
  return '';
}
function swRow(entry, html) {
  const id = entry && entry.report && entry.report.id;
  if (!id || !SW_LISTS[entry.kind]) return html;   // fiche de planète : un lieu connu, pas un message
  return `<div class="sw-row" data-sk="${entry.kind}" data-sid="${String(id).replace(/"/g, '')}"><button class="sw-del" aria-label="Supprimer"><span>${typeof icon === 'function' ? icon('trash', { size: 18 }) : ''}</span><i>Supprimer</i></button><div class="sw-in">${html}</div></div>`;
}
function swDelete(kind, id, rowEl) {
  const key = SW_LISTS[kind]; const arr = key && G[key];
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex(r => r && r.id === id);
  if (i < 0) return;
  const [removed] = arr.splice(i, 1);
  if (typeof saveGame === 'function') saveGame();
  const redraw = () => {
    try { if (document.getElementById('prospect-rapports-list') && typeof renderProspectRapports === 'function') renderProspectRapports(); } catch (e) {}
    try { if (typeof renderReportsList === 'function') renderReportsList(); } catch (e) {}
    try { if (typeof updateProspectBadges === 'function') updateProspectBadges(); } catch (e) {}
  };
  if (rowEl) { rowEl.style.height = rowEl.offsetHeight + 'px'; requestAnimationFrame(() => { rowEl.classList.add('sw-gone'); }); setTimeout(redraw, 260); } else redraw();
  toast('Rapport supprimé · <u>Annuler</u>', () => {
    const a = G[key]; if (!Array.isArray(a) || a.some(r => r && r.id === id)) return;
    a.splice(Math.min(i, a.length), 0, removed);
    if (typeof saveGame === 'function') saveGame();
    redraw();
  });
}
function prospectRuleHtml() {
  return `
    <div class="prospect-rule">
      <div class="t">Comment ça marche</div>
      <div><b style="color:#e6f0ff">Radar</b> balaye un système et détecte des <span style="color:var(--text)">signatures</span></div>
      <div><b style="color:#5fcc8a">Légère</b> identifie une signature → <span style="color:var(--text)">veine</span> ou <span style="color:var(--text)">planète</span></div>
      <div><b style="color:#ffc864">Tanker</b> exploite une veine · <b style="color:#9a8aff">Moyenne</b> fixe l'adresse d'une planète</div>
    </div>`;
}

// Disponibilité d'un tier de sonde : prête / en mission / en construction / aucune
function _probeTierStatus(tier) {
  const cfg = PROBE_TIER_CONFIG[tier] || { label: tier };
  if ((G.probesPool || []).some(p => p.tier === tier && p.state === 'ready')) return { ok: true };
  const now = Date.now();
  const m = (G.probeMissions || []).filter(x => x.tier === tier && x.status === 'in_transit').sort((a, b) => a.arrivalAt - b.arrivalAt)[0];
  if (m) return { ok: false, why: `${cfg.label} en mission · retour ${formatTankerDuration(Math.max(0, m.arrivalAt - now))}` };
  const q = (typeof QUEUES !== 'undefined' && QUEUES.prospect && QUEUES.prospect.commands || []).find(c => c.unitKey === 'probe_' + tier);
  if (q) return { ok: false, why: `${cfg.label} en construction · ${formatTime(Math.max(0, (q.unitDuration || 0) - (q.currentElapsed || 0)))}` };
  return { ok: false, build: true, why: `Aucune ${cfg.label} prête` };
}

function _sigBtn(color, label, onclick, sub, soft) {
  const bg = soft ? 'transparent' : `${color}14`;
  return `<div class="sig-next">
    <button onclick="event.stopPropagation();${onclick}" style="border-color:${color}${soft ? '55' : '90'};color:${color};background:${bg}">
      <span class="lab">${label}</span><span class="arr">→</span>
    </button>${sub ? `<div class="sub">${sub}</div>` : ''}
  </div>`;
}
function _sigOff(text, sub) {
  return `<div class="sig-next"><div class="off"><span>${text}</span></div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

// L'action suivante pour une signature, selon son état
function probeSignatureNextAction(sig) {
  if (!sig || sig.ignored) return '';
  const cfgL = PROBE_TIER_CONFIG.light, cfgM = PROBE_TIER_CONFIG.medium;
  const costOf = (cfg) => Object.entries(cfg.cost || {}).map(([k, v]) => `${v} ${(TILES.find(t => t.key === k) || {}).label || k}`).join(' · ');

  // 1. Détectée, pas encore identifiée → Légère
  if (!sig.resolved) {
    const st = _probeTierStatus('light');
    if (st.ok) return _sigBtn('#5fcc8a', `Envoyer une Légère`, `onSendProbeToSignature('light','${sig.id}')`, `Identifie ${sig.id} · ${cfgL.duration}`);
    if (st.build) return _sigBtn('#5fcc8a', `Construire une Légère`, `openProbeDetail('light')`, `${costOf(cfgL)} · puis reviens envoyer sur ${sig.id}`, true);
    return _sigOff(st.why, `Dès son retour, envoie-la sur ${sig.id}`);
  }

  // 2. Identifiée mouvante (veine, épave…) → tanker
  if (sig.resolvedType === 'moving') {
    const key = sig.movingCoordKey;
    const kt = key && G.knownTargets && G.knownTargets[key];
    if (!kt) return _sigOff('Cible exploitée ou expirée');
    if (kt.status === 'engaged') {
      const m = (G.tankerMissions || []).find(x => x.id === kt.tankerMissionId);
      const eta = m ? ` · retour ${formatTankerDuration(Math.max(0, m.arrivalAt - Date.now()))}` : '';
      return _sigOff(`Tanker en route${eta}`);
    }
    const stat = G.fleet?.stationed || {};
    const total = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
    const busy = (G.tankerMissions || []).filter(x => x.status === 'in_transit' || x.status === 'returning').length;
    if (total - busy > 0) return _sigBtn('#ffc864', 'Envoyer un tanker', `onTankerKnownTargetClick('${key}')`, `Ramène le cargo de ${key.split('/').pop() || key}`);
    if (total === 0) return _sigOff('Aucun tanker', 'Construis un tanker au Chantier orbital');
    return _sigOff('Tous les tankers sont en mission');
  }

  // 3. Identifiée fixe, pas encore verrouillée → Moyenne
  if (!sig.fixedAddress) {
    const st = _probeTierStatus('medium');
    if (st.ok) return _sigBtn('#9a8aff', `Envoyer une Moyenne`, `onSendProbeToSignature('medium','${sig.id}')`, `Fixe l'adresse de la planète · ${cfgM.duration}`);
    if (st.build) return _sigBtn('#9a8aff', `Construire une Moyenne`, `openProbeDetail('medium')`, `${costOf(cfgM)} · puis reviens envoyer sur ${sig.id}`, true);
    return _sigOff(st.why, `Dès son retour, envoie-la sur ${sig.id}`);
  }

  // 4. Verrouillée → carnet / fiche
  return _sigBtn('#5fffe8', 'Voir corps céleste', `openPlanetDetail('${sig.fixedAddress}')`, sig.fixedAddress, true);
}

function onTankerReportTargetClick(reportId, targetId) {
  const mission = launchTankerToTarget(reportId, targetId, false);
  if (!mission) return;
  if (typeof saveGame === 'function') saveGame();
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// Que sélectionner sur la Carte pour une coordonnée de rapport ? Signature → la signature ;
// adresse système (W-X-YYYY[-Z]) → le système ; coordonnées locales « 9°-6°-N » → rien.
function mapSelectionFor(coords) {
  const s = String(coords || '').trim().toUpperCase();
  if (/^SIG-/.test(s)) return (G.signatures && G.signatures[s]) ? { kind: 'sig', key: s } : null;
  const m = s.match(/^([A-Z])-([A-Z])-(\d{4})/);
  if (m) {
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    return { kind: key === `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}` ? 'home' : 'system', key };
  }
  return null;
}
// 13/10 — carnet, fiche planète, rapports de balise : tout mène à la carte (le système s'ouvre, l'objet est entouré)
function openPlanetOnMap(coord) {
  const p = (typeof findPlanetByCoord === 'function') ? findPlanetByCoord(coord) : null;
  if (p && p.isMine) return openOnMap('home', `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`);
  openOnMap('planet', (p && p.coord) || coord);
}
// PATCH_1510_CARNET_SIG — une signature sur la carte : elle-même, sinon sa cible, sa planète, son système
function openSigOnMap(id) {
  const sig = (G.signatures || {})[id];
  if (!sig) return;
  const sysOf = (k) => String(k || '').toUpperCase().split('-').slice(0, 3).join('-');
  const has = (fn) => { try { return !!fn(); } catch (e) { return false; } };
  if (sig.fixedAddress && has(() => Object.values(G.knownSystems || {}).some(s => (s.planets || []).some(pl => pl.coord === sig.fixedAddress)))) return openOnMap('planet', sig.fixedAddress);
  if (sig.resolvedType === 'moving' && sig.movingCoordKey && G.knownTargets && G.knownTargets[sig.movingCoordKey]) return openOnMap('target', sig.movingCoordKey);
  if (!sig.resolved) return openOnMap('sig', sig.id);
  openSystemOnMap(sig.system || sig.fixedAddress || sig.movingCoordKey || '');
}
function openSystemOnMap(sys) {
  const m = String(sys || '').toUpperCase().match(/^([A-Z])-([A-Z])-(\d{4})/);
  if (!m) return;
  const key = `${m[1]}-${m[2]}-${m[3]}`, mine = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  openOnMap(key === mine ? 'home' : 'system', key);
}
function openOnMap(kind, key) {
  G.prospectTab = 'univers';
  if (typeof getCurrentScreen === 'function' && getCurrentScreen() !== 'prospect') goto('prospect');
  setProspectTab('univers');
  if (window.SBMap) SBMap.select(kind, key);
  setTimeout(() => document.getElementById('spacemap-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function onSendProbeToSignature(tier, sigId) {
  const mission = launchProbe(tier, sigId, 'local', false);
  if (!mission) return;
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// Rend une ligne de rapport (commune aux deux types : planète + sonde)
function renderReportRow(entry) {
  if (entry.kind === 'planet') {
    const p = entry.planet;
    const tsText = entry.timestamp ? formatReportTimestamp(entry.timestamp) : '';
    return `
      <div class="rapport-row ${entry.unread ? 'unread' : ''}" onclick="openPlanetDetail('${p.coord}')">
        <div class="rapport-dot ${entry.unread ? 'unread' : ''}"></div>
        <div class="rapport-info">
          <div class="rapport-coord">${p.coord}</div>
          <div class="rapport-name">${getPlanetDisplayName(p)}</div>
          ${tsText ? `<div class="rapport-time">${tsText}</div>` : ''}
        </div>
        <div class="rapport-arrow">→</div>
      </div>
    `;
  } else if (entry.kind === 'probe') {
    return renderProbeReportRow(entry.report, entry.unread);
  } else if (entry.kind === 'tanker') {
    return renderTankerReportRow(entry.report, entry.unread);
  } else if (entry.kind === 'beacon') {
    // ⚡ Phase 4 P1 — Rapport de détection de balise
    return renderBeaconReportRow(entry.report, entry.unread);
  }
  return '';
}

// Rend un rapport de sonde — pattern toggle inline (compact ↔ expanded)
// Cf. toggleArchive() pour les rapports ambient des bâtiments — même UX.
// Le badge "MOUVANT" a été retiré : c'est de la mécanique interne, le joueur
// n'a pas besoin de savoir si une cible vient de "l'univers mouvant" ou non.
// Le badge "PLANÈTE" reste : c'est une info diégétique utile.
// 13/10 — Furtive sur un monde habité : niveau, défense, bouclier, activité ; ce qu'il manque dit quoi développer
function _spyPrecision() {
  const lt = (typeof getLaboTier === 'function') ? getLaboTier() : 0;
  return lt >= 3 ? 3 : lt >= 2 ? 2 : 1;
}
async function _spyEnrichReport(report, address, attempt) {
  const coord = String(address || '').toUpperCase().split('/')[0];
  // PATCH_1610_SPY — l'adresse exacte du registre pour ce monde (la coordonnée locale peut différer : numéro de place)
  const known = typeof findPlanetByCoord === 'function' ? findPlanetByCoord(coord) : null;
  const addr = (known && known.mpAddress) || coord;
  const prec = _spyPrecision();
  report.spy = Object.assign({}, report.spy || {}, { address: addr, coord, precision: prec, pending: true, error: false, found: undefined });
  // sans session au registre, il ne répond rien : on attend la connexion (sonde rentrée pendant que le jeu était fermé)
  for (let i = 0; i < 60 && !(window.SBMP && SBMP.ready && SBMP.ready()); i++) await new Promise(r => setTimeout(r, 3000));
  if (!(window.SBMP && SBMP.ready && SBMP.ready())) {
    report.spy = { address: addr, coord, precision: prec, found: false, error: true, offline: true };
    if (typeof saveGame === 'function') saveGame();
    return;
  }
  try {
    let w = typeof SBMP.worldCard === 'function' ? await SBMP.worldCard(addr) : null;
    if (!w && addr !== coord) w = await SBMP.worldCard(coord);
    // un commandant connu à cette adresse mais rien en retour : on réessaie une fois un peu plus tard
    if (!w && known && known.isReal && !attempt) { await new Promise(r => setTimeout(r, 20000)); return _spyEnrichReport(report, address, 1); }
    if (w) {
      const fuzz = (v, pct) => Math.max(0, Math.round(v * (1 + (Math.random() * 2 - 1) * pct)));
      report.spy = {
        address: addr, coord, precision: prec, found: true, pseudo: w.pseudo, planet: w.planet_name,
        level: prec >= 2 ? w.level_estimate : fuzz(w.level_estimate, 0.25),
        defense: prec >= 3 ? w.defense_estimate : fuzz(w.defense_estimate, prec >= 2 ? 0.15 : 0.35),
        shielded: !!w.shielded, lastSeen: prec >= 2 ? w.last_seen_days : null,
        peaceful: !!w.peaceful,   // PATCH_2410_PACIFIQUE
      };
    } else report.spy = { address: addr, coord, precision: prec, found: false, knownPseudo: known && known.isReal ? known.playerName : null };
  } catch (e) { report.spy = { address: addr, coord, precision: prec, found: false, error: true }; }
  if (typeof saveGame === 'function') saveGame();
  if (typeof renderProspectRapports === 'function' && document.getElementById('prospect-rapports-list')) { try { renderProspectRapports(); } catch (e) {} }
}
// PATCH_1610_SPY — en tête du relevé : qui, où, et ce que ça donnerait contre ta meilleure flotte
function _spyRetry(id) {
  const r = (G.probeReports || []).find(x => x.id === id);
  if (!r) return;
  _spyEnrichReport(r, (r.spy && (r.spy.coord || r.spy.address)) || r.targetCoords);
  if (typeof renderProspectRapports === 'function') { try { renderProspectRapports(); } catch (e) {} }
}
function _spySummaryHtml(s) {
  const fleets = ((G.fleet && G.fleet.prepared) || []).filter(f => f && !f.ambush && !f.inMission);
  let best = null, atk = 0;
  for (const f of fleets) { const a = window.SBLines && SBLines.fleetAtk ? SBLines.fleetAtk(f) : 0; if (a > atk) { atk = a; best = f; } }
  let verdict = '';
  if (best && s.defense > 0) {
    const k = atk / s.defense;
    const [txt, col] = k >= 1.5 ? ['avantage net', '#7ed080'] : k >= 1 ? ['combat serré', '#ffc864'] : ['flotte trop faible', '#ff8a8a'];
    verdict = `<div style="margin-top:8px;font-size:11px;color:var(--mut)">Contre <b style="color:var(--text)">${_escapeHtml(best.name || 'ta flotte')}</b> (${fmt(atk)} ATK) : <b style="color:${col}">${txt}</b></div>`;
  } else if (!best) verdict = `<div style="margin-top:8px;font-size:11px;color:var(--mut)">Aucune flotte prête pour comparer.</div>`;
  const acts = `<div style="display:flex;gap:6px;margin:10px 0 6px">
      <button onclick="event.stopPropagation();openSystemOnMap('${_escapeHtml(s.coord || s.address)}')" style="flex:1;padding:8px;border-radius:7px;border:1px solid rgba(255,255,255,.14);background:transparent;color:var(--text);font:inherit;font-size:11px;cursor:pointer">Voir sur la carte</button>
      ${typeof openEmbassy === 'function' ? `<button onclick="event.stopPropagation();openEmbassy('${_escapeHtml(s.address)}')" style="flex:1;padding:8px;border-radius:7px;border:1px solid rgba(255,255,255,.14);background:transparent;color:var(--text);font:inherit;font-size:11px;cursor:pointer">Ambassade</button>` : ''}
    </div>`;
  return `<div style="margin-bottom:8px"><div style="font-size:17px;font-weight:700;color:#ffb0a8">${_escapeHtml(s.pseudo || '—')}</div>
    <div style="font-size:11px;color:var(--mut);margin-top:2px">${_escapeHtml(s.planet || 'Monde habité')} · ${_escapeHtml(s.address)}${s.shielded ? ' · <span style="color:#9fd8ff">bouclier débutant</span>' : ''}${false && s.peaceful ? ' · <span style="color:#9fd8ff">pacifique</span>' : ''}</div>${s.peaceful ? '' : verdict}${acts}</div>`;
}
function _spyBlockHtml(r) {
  const s = r && r.spy;
  if (!s) return '';
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--mut)">${k}</span><span style="color:var(--text);font-family:'SF Mono',monospace">${v}</span></div>`;
  const precTxt = ['', '±35 %', '±15 %', 'exacte'][s.precision] || '';
  let body;
  const _retry = `<button onclick="event.stopPropagation();_spyRetry('${r.id}')" style="margin-top:10px;width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,138,138,.45);background:rgba(255,138,138,.08);color:#ff9a9a;font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Relancer le décodage</button>`;
  if (s.pending) body = `<div style="font-size:11px;color:var(--mut)">Décodage du relevé… ${!(window.SBMP && SBMP.ready && SBMP.ready()) ? 'en attente de la liaison avec le registre.' : ''}</div>`;
  else if (!s.found) body = `<div style="font-size:11px;color:var(--mut);line-height:1.55">${s.offline ? 'Pas de liaison avec le registre au retour de la Furtive : relevé non décodé.' : s.error ? 'Liaison perdue avec la Furtive : relevé illisible.' : s.knownPseudo ? `Le registre ne répond pas pour <b style="color:var(--text)">${_escapeHtml(s.knownPseudo)}</b> à cette adresse : son monde a peut-être changé de place.` : 'Aucun monde habité à cette adresse.'}</div>${_retry}`;
  else body = _spySummaryHtml(s)
    + row('Niveau', '≈ ' + s.level) + row('Défense', '≈ ' + s.defense + ' <span style="color:var(--mut)">(' + precTxt + ')</span>')
    + row('Bouclier débutant', s.shielded ? 'actif' : 'non')
    + row('Dernière activité', s.lastSeen == null ? '<span style="color:var(--mut)">illisible</span>' : (s.lastSeen === 0 ? "aujourd'hui" : 'il y a ' + s.lastSeen + ' j'));
  // ce qu'il manque → ce qu'il faut développer pour mieux espionner
  const next = [];
  if (s.precision < 2) next.push('Laboratoire niv. 2 : défense à ±15 %, niveau exact, dernière activité');
  if (s.precision < 3) next.push('Laboratoire niv. 3 : défense exacte');
  next.push('Stocks et flotte en orbite : illisibles avec la Furtive actuelle (à venir)');
  return `<div style="margin:12px 0 4px;padding:10px 12px;border:1px solid rgba(255,138,138,.28);border-radius:8px;background:rgba(50,15,15,.12)">
    <div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#ff8a8a;margin-bottom:6px">Relevé d'espionnage${precTxt ? ' · précision ' + precTxt : ''}</div>
    ${body}
    <div style="margin-top:8px;font-size:10px;color:var(--mut);line-height:1.6">${next.map(t => '▸ ' + t).join('<br>')}</div>
  </div>`;
}

function renderProbeReportRow(r, isUnread) {
  const tsText = r.createdAt ? formatReportTimestamp(r.createdAt) : '';
  const cfg = PROBE_TIER_CONFIG[r.tier];
  const tierLabel = cfg ? cfg.label : (r.tier || 'sonde');
  const accent = cfg ? cfg.accent : 'var(--mut)';
  const isExpanded = (G._expandedProbeReport === r.id);

  // ─── Label de type (titre ligne 1) ───
  let typeLabel;
  if (r.isSecret) {
    typeLabel = r.isDelayedFollowup ? 'Complément tardif' : 'Rapport';
  } else if (r.tier === 'radar') {
    // PASSE 5.0 : Radar produit des SIGNATURES (cf. GDD chap 17)
    const nSig = (r.signatureIds && r.signatureIds.length) || 0;
    if (r.silent) {
      typeLabel = 'Radar — silence radio';
    } else if (nSig > 0) {
      typeLabel = `Radar — ${nSig} signature${nSig > 1 ? 's' : ''} relevée${nSig > 1 ? 's' : ''}`;
    } else {
      // Legacy : ancien rapport Radar pré-passe 5.0
      typeLabel = 'Radar — signal détecté';
    }
  } else {
    const n = r.targets?.length || 0;
    if (r.universeKind === 'fixed' && n === 0) {
      typeLabel = `${tierLabel} — planète confirmée`;
    } else {
      typeLabel = r.spyOnly || (r.tier === 'stealth' && r.spy && n === 0) ? `${tierLabel} — relevé d'espionnage${r.spy && r.spy.pseudo ? ' · ' + _escapeHtml(r.spy.pseudo) : ''}` : `${tierLabel} — ${n === 0 ? 'rien à signaler' : n + ' cible' + (n > 1 ? 's' : '') + ' détectée' + (n > 1 ? 's' : '')}`;
    }
    // Badge PLANÈTE (info diégétique gardée) — pas de badge MOUVANT
    if (r.universeKind === 'fixed') {
      typeLabel += `<span style="display:inline-block;font-size:8px;background:rgba(95,204,138,.15);color:#5fcc8a;padding:1px 6px;border-radius:3px;letter-spacing:.06em;margin-left:6px;vertical-align:middle">PLANÈTE</span>`;
    }
  }

  // ─── VUE COMPACTE (par défaut) ───
  if (!isExpanded) {
    let previewHtml = '';
    if (r.isSecret) {
      const preview = (r.narrativeOverride || '').split('\n')[0].slice(0, 90);
      previewHtml = `<div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:4px;line-height:1.4">${preview}…</div>`;
    } else if (r.tier === 'radar') {
      // PASSE 5.0 : preview des signatures (juste les IDs SIG-XXX)
      const sigs = r.signaturesData || r.signatureIds || [];
      if (r.silent) {
        previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px;font-style:italic">Aucune transmission reçue.</div>`;
      } else if (sigs.length > 0) {
        const ids = sigs.map(s => typeof s === 'string' ? s : s.id).slice(0, 3).join(' · ');
        const more = sigs.length > 3 ? ` <span style="opacity:.6">+${sigs.length - 3}</span>` : '';
        previewHtml = `<div style="font-size:11px;color:${accent};margin-top:4px;font-family:'SF Mono',monospace">▸ ${ids}${more}</div>`;
      } else {
        // Legacy fallback
        previewHtml = `<div style="font-size:11px;color:${accent};margin-top:4px;font-family:'SF Mono',monospace">▸ Signal à ${r.targetCoords || '—'}</div>`;
      }
    } else {
      const n = r.targets?.length || 0;
      if (r.universeKind === 'fixed' && n === 0) {
        previewHtml = `<div style="font-size:10px;color:var(--mut);margin-top:4px">Corps planétaire à <span style="color:${accent};font-family:'SF Mono',monospace">${r.targetCoords}</span></div>`;
      } else if (n > 0) {
        // Aperçu : juste la 1ère cible
        const t = r.targets[0];
        const more = n > 1 ? ` <span style="color:var(--mut);opacity:.6">+${n - 1} autre${n > 2 ? 's' : ''}</span>` : '';
        previewHtml = `<div style="font-size:10px;color:var(--mut);margin-top:4px;display:flex;align-items:center;gap:5px">${renderIcon(t.icon || '◦', {size:11})} <span>${t.label}${more}</span></div>`;
      } else {
        previewHtml = `<div style="font-size:10px;color:var(--mut);margin-top:4px;font-style:italic">Rien d'exploitable.</div>`;
      }
    }

    return `
      <div class="rapport-row ${isUnread ? 'unread' : ''}" style="cursor:pointer" onclick="toggleProbeReport('${r.id}')">
        <div class="rapport-dot ${isUnread ? 'unread' : ''}" style="background:${accent}"></div>
        <div class="rapport-info">
          <div class="rapport-coord" style="color:${accent};font-size:10px">${typeLabel}</div>
          <div class="rapport-name">${(r.targetCoords || r.sigId) ? sbDestLabel(r.targetCoords || r.sigId).label : (r.sector || '—')}${(r.targetCoords && sbDestLabel(r.targetCoords).coords) ? ` <span style="font-family:'SF Mono',monospace;font-size:10px;opacity:.7">${sbDestLabel(r.targetCoords).coords}</span>` : ''} <span style="color:var(--mut);font-size:10px">· ${r.probeName || 'Sonde'}</span></div>
          ${previewHtml}
          ${tsText ? `<div class="rapport-time">${tsText}</div>` : ''}
        </div>
        <div class="rapport-arrow" style="color:var(--mut);font-size:11px;align-self:center;padding-left:8px;opacity:.5">▾</div>
      </div>
    `;
  }

  // ─── VUE ÉTENDUE (cliqué) ───
  // Header coords + plein détail + bouton replier
  const dateText = r.createdAt ? new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  // Bloc coordonnées
  // 10/10/2026 : les coordonnées sont un lien vers la Carte (signature ou système sélectionné)
  const mapSel = mapSelectionFor(r.targetCoords);
  const coordsStyle = `margin:10px 0 14px;padding:10px;background:var(--bg-1);border:1px solid ${accent}30;border-radius:6px`;
  const coordsAttr = mapSel
    ? `onclick="event.stopPropagation();openOnMap('${mapSel.kind}','${mapSel.key}')" style="cursor:pointer;${coordsStyle}"`
    : `style="${coordsStyle}"`;
  const _spyHtml = _spyBlockHtml(r);
  const coordsHtml = r.targetCoords
    ? `<div ${coordsAttr}>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Coordonnées</div>${mapSel ? `<div style="font-size:9px;color:var(--cyan);letter-spacing:.12em;text-transform:uppercase">Voir sur la carte →</div>` : ''}</div>
        <div style="font-family:'SF Mono',monospace;font-size:16px;color:${accent};letter-spacing:.06em;text-align:center">${r.targetCoords}</div>
      </div>${_spyHtml}`
    : _spyHtml;

  // Corps détaillé
  let fullBodyHtml = '';
  if (r.isSecret) {
    fullBodyHtml = `
      <div style="font-size:12px;color:var(--text);line-height:1.7;font-family:'Charter','Iowan Old Style',Georgia,serif;font-style:italic;white-space:pre-wrap;border-left:3px solid ${accent}40;padding:10px 14px;background:var(--bg);border-radius:4px">${(r.narrativeOverride || '').replace(/</g, '&lt;')}</div>
      ${r.narrativeArchived ? `<div style="font-size:10px;color:var(--mut);margin-top:10px;letter-spacing:.04em;font-style:italic;text-align:right">▸ ${r.narrativeArchived}</div>` : ''}
    `;
  } else if (r.tier === 'radar') {
    if (r.silent) {
      fullBodyHtml = `
        <div style="font-size:11px;color:var(--mut);line-height:1.7;font-style:italic;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:4px">
          Aucune transmission reçue.
          <div style="font-size:10px;opacity:.8;margin-top:6px;font-style:normal">La sonde a atteint la zone visée et brûlé sans relayer de signal. Le bruit de fond cosmique a été enregistré, sans anomalie détectable.</div>
        </div>
      `;
    } else if (Array.isArray(r.signatureIds) && r.signatureIds.length > 0) {
      // ─── PASSE 5.0 : Rapport Radar avec signatures ───
      // Cf. starbyte_gdd_v1/17_signatures_resolution.md (template canonique)

      // Récupérer les signatures vivantes (peut-être supprimées entre temps)
      const liveSigs = r.signatureIds
        .map(sigId => (G.signatures && G.signatures[sigId]) ? G.signatures[sigId] : null)
        .filter(Boolean);

      // Affichage de chaque signature avec actions inline
      const sigsHtml = liveSigs.map((sig, idx) => {
        // État : résolue / dans le carnet / disponible
        let stateBadge = '';
        if (sig.resolved) {
          if (sig.resolvedType === 'fixed') {
            stateBadge = `<span style="font-size:8px;background:rgba(95,255,232,.15);color:#5fffe8;padding:1px 6px;border-radius:3px;letter-spacing:.06em;margin-left:6px">VERROUILLÉE</span>`;
          } else {
            stateBadge = `<span style="font-size:8px;background:rgba(255,200,100,.15);color:#ffc864;padding:1px 6px;border-radius:3px;letter-spacing:.06em;margin-left:6px">RÉSOLUE</span>`;
          }
        } else if (sig.inCarnet) {
          stateBadge = `<span style="font-size:8px;background:rgba(160,200,255,.15);color:#a0c8ff;padding:1px 6px;border-radius:3px;letter-spacing:.06em;margin-left:6px">CARNET</span>`;
        }

        // Actions inline : seulement si non résolue
        let actionsHtml = '';
        if (!sig.resolved) {
          if (sig.inCarnet) {
            actionsHtml = `
              <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
                <button onclick="onSignatureCarnetToggle('${sig.id}')" style="background:transparent;border:1px solid var(--border);color:var(--mut);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:inherit">Retirer du carnet</button>
              </div>
            `;
          } else {
            actionsHtml = `
              <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
                <button onclick="onSignatureCarnetToggle('${sig.id}')" style="background:rgba(160,200,255,.10);border:1px solid #a0c8ff60;color:#a0c8ff;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('fileText', {size:10})} Carnet</button>
                <button onclick="onSignatureIgnore('${sig.id}')" style="background:transparent;border:1px solid var(--border);color:var(--mut);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('trash', {size:11})} Ignorer</button>
              </div>
            `;
          }
        }

        return `
          <div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:4px;margin-bottom:6px">
            <div style="display:flex;align-items:baseline;justify-content:space-between">
              <span style="font-family:'SF Mono',monospace;font-size:13px;color:${accent};letter-spacing:.06em">[${idx + 1}] ${sig.id}</span>
              ${stateBadge}
            </div>
            <div style="font-size:10px;color:var(--mut);margin-top:6px;line-height:1.6;font-family:'SF Mono',monospace">
              Type : <span style="color:var(--text)">${sig.typeLabel}</span><br>
              Intensité : <span style="color:var(--text)">${sig.intensity}</span><br>
              Position : <span style="color:var(--text)">${sig.position}</span><br>
              Interprétation : <span style="color:var(--text)">${sig.interpretation}</span>
            </div>
            ${probeSignatureNextAction(sig)}
            ${actionsHtml}
          </div>
        `;
      }).join('');

      // Footer : résolution gagnée
      const resolutionLine = r.resolutionGain
        ? `<div style="font-size:10px;color:var(--mut);margin-top:10px;letter-spacing:.04em;font-style:italic;text-align:right">Résolution système : +${r.resolutionGain}%</div>`
        : '';

      // Stats finales
      const statsHtml = `
        <div style="font-size:10px;color:var(--mut);margin-top:10px;font-style:italic;line-height:1.5">
          Aucune adresse fixe verrouillée.<br>
          Aucune cible militaire exploitable.
        </div>
      `;

      fullBodyHtml = sigsHtml + statsHtml + resolutionLine;
    } else {
      // Legacy : ancien rapport Radar (pré-passe 5.0) ou sans signatures
      fullBodyHtml = `
        <div style="font-size:11px;color:var(--text);line-height:1.6;padding:10px 14px;background:var(--bg);border:1px solid ${accent}30;border-radius:4px">
          <div style="color:${accent};font-family:'SF Mono',monospace;font-size:12px;margin-bottom:6px">▸ Signal détecté</div>
          <div style="color:var(--mut);font-size:10px;line-height:1.6">Un écho radar a été relayé depuis la zone scannée. La sonde Radar ne peut pas en déterminer la nature. Une sonde Légère permettrait d'en savoir plus.</div>
        </div>
      `;
    }
  } else {
    // ─── PASSE 5.1 — Header signature résolue (si applicable) ───
    let signatureHeader = '';
    // Bannière Carta scientifique — découverte d'une planète dans le système
    // d'origine. Initialisée vide ici pour être en scope partout en bas.
    let cartaBanner = '';
    // 10/10/2026 — Les signatures étaient perdues à chaque rechargement (bug TDZ
    // loadSignatures). Les rapports, eux, survivaient : on réhydrate la signature
    // depuis le rapport pour que ses actions (Moyenne, carnet) fonctionnent.
    if (r.signatureId && r.signatureResolvedAs && typeof rehydrateSignatureFromReport === 'function') {
      rehydrateSignatureFromReport(r);
    }
    if (r.signatureId && r.signatureResolvedAs) {
      const fixedClassLabel = {
        dead_world: 'monde mort',
        gas_giant:  'planète gazeuse',
        habitable:  'habitable',
        lunar:      'lune stérile',
        unknown:    'classe indéterminée',
      };

      // ─── Bannière Carta scientifique (découverte système d'origine) ───
      // Cf. starbyte_gdd_v1/17_signatures_resolution.md
      // Style : communiqué officiel ambre, ton humble/résigné.
      // Si fullyMapped : couleur violette solennelle (déclaration finale).
      if (r.homeSystemSurprise && r.cartaCommunique) {
        const c = r.cartaCommunique;
        const isFinal = !!r.homeSystemFullyMapped;
        const accent = isFinal ? '#9a8aff' : '#fac74c';
        const accentRgba = isFinal ? 'rgba(154,138,255' : 'rgba(250,199,76';
        const sealLabel = isFinal ? '◆ DÉCLARATION OFFICIELLE ◆' : '◆ COMMUNIQUÉ OFFICIEL ◆';
        const bodyHtml = (c.body || '').split('\n\n').map(p =>
          `<p style="margin:0 0 10px 0">${p.replace(/\n/g,'<br>')}</p>`
        ).join('');
        cartaBanner = `
          <div style="margin-bottom:14px;padding:14px 16px;background:${accentRgba},.06);border:1.5px solid ${accent}80;border-radius:6px">
            <div style="font-size:9px;color:${accent};letter-spacing:.18em;text-align:center;margin-bottom:8px;font-family:'SF Mono',monospace">${sealLabel}</div>
            <div style="font-size:12px;color:${accent};font-weight:600;letter-spacing:.04em;text-align:center;text-transform:uppercase;margin-bottom:12px;font-family:'SF Mono',monospace;line-height:1.4">${c.headline}</div>
            <div style="font-size:12px;color:var(--text);line-height:1.65;font-family:'SF Mono',monospace">${bodyHtml}</div>
            ${c.footer ? `
              <div style="margin-top:10px;padding-top:10px;border-top:1px dashed ${accent}40">
                <div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">${c.footer}</div>
              </div>
            ` : ''}
          </div>
        `;
      }

      // ─── Choix du template selon contexte (passe 5.2) ───
      // 3 cas :
      //   A) signatureLocked (Moyenne a verrouillé l'adresse fixe)
      //   B) signatureResolvedAs === 'moving' (Légère a résolu en coord mouvante)
      //   C) signatureResolvedAs === 'fixed' (Légère a identifié un corps orbital sans adresse)
      if (r.signatureLocked) {
        // Cas A — Moyenne a verrouillé une adresse fixe (passe 5.2)
        const gainLine = r.resolutionGain
          ? `<div style="font-size:9px;color:var(--mut);margin-top:10px;letter-spacing:.04em;font-style:italic;text-align:right">Résolution système : +${r.resolutionGain}%</div>`
          : '';
        // Actions : voir le corps céleste + supprimer le rapport
        const actionRow = `
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
            <button onclick="event.stopPropagation();openPlanetDetail('${r.fixedAddress}')" style="background:rgba(95,255,232,.10);border:1px solid #5fffe860;color:#5fffe8;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('map', {size:10})} Voir corps céleste</button>
            <button onclick="event.stopPropagation();onDeleteProbeReport('${r.id}')" style="background:transparent;border:1px solid var(--border);color:var(--mut);font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('trash', {size:12})} Supprimer</button>
          </div>
        `;
        signatureHeader = `
          <div style="margin-bottom:14px;padding:14px 16px;background:var(--bg);border:1px solid #9a8aff60;border-radius:6px">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
              <div style="color:#9a8aff;font-family:'SF Mono',monospace;font-size:12px">${r.signatureId} verrouillée</div>
              <div style="font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase">Adresse fixe révélée</div>
            </div>
            <div style="font-family:'SF Mono',monospace;font-size:16px;color:#9a8aff;margin-top:10px;letter-spacing:.06em;text-align:center;padding:8px;background:rgba(154,138,255,.08);border-radius:4px">${r.fixedAddress}</div>
            <div style="font-size:11px;color:var(--text);margin-top:10px">Classe : <span style="color:#9a8aff">${fixedClassLabel[r.fixedClass] || r.fixedClass}</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:6px;font-style:italic">Cette adresse est maintenant permanente dans ton carnet et ciblable par ta flotte.</div>
            ${gainLine}
            ${carnetRowForSignature(r.signatureId)}
            ${actionRow}
          </div>
        `;
      } else {
        // Cas B et C — Légère a résolu (mouvant ou fixe)
        const resolveLabel = r.signatureResolvedAs === 'moving' ? 'Coordonnée mouvante résolue' : 'Corps orbital identifié';
        const resolveColor = r.signatureResolvedAs === 'moving' ? '#ffc864' : '#5fcc8a';
        const movingCoordLine = r.signatureResolvedAs === 'moving' && r.movingCoord
          ? `<div style="font-family:'SF Mono',monospace;font-size:13px;color:${resolveColor};margin-top:6px;letter-spacing:.04em">${r.movingCoord}</div>`
          : '';
        const fixedClassLine = r.signatureResolvedAs === 'fixed' && r.fixedClass
          ? `<div style="font-size:11px;color:var(--text);margin-top:6px">Classe estimée : <span style="color:${resolveColor}">${fixedClassLabel[r.fixedClass] || r.fixedClass}</span></div>`
          : '';
        // 10/10/2026 : l'action suivante est un bouton (Moyenne), plus une phrase
        const nextActionLine = (r.signatureResolvedAs === 'fixed' && r.signatureId && G.signatures && G.signatures[r.signatureId])
          ? probeSignatureNextAction(G.signatures[r.signatureId])
          : '';
        const gainLine = r.resolutionGain
          ? `<div style="font-size:9px;color:var(--mut);margin-top:10px;letter-spacing:.04em;font-style:italic;text-align:right">Résolution système : +${r.resolutionGain}%</div>`
          : '';

        signatureHeader = `
          <div style="margin-bottom:14px;padding:12px 14px;background:var(--bg);border:1px solid ${resolveColor}30;border-radius:6px">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
              <div style="color:${resolveColor};font-family:'SF Mono',monospace;font-size:12px">${r.signatureId} résolue</div>
              <div style="font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase">${resolveLabel}</div>
            </div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px">Source : ${r.signatureTypeLabel || '—'}</div>
            ${movingCoordLine}
            ${fixedClassLine}
            ${nextActionLine}
            ${gainLine}
            ${carnetRowForSignature(r.signatureId)}
          </div>
        `;
      }
    }

    // PASSE 5.2 — Si verrouillage Moyenne raté (cas anormal : tous slots déjà connus)
    if (r.signatureLockFailed) {
      signatureHeader = `
        <div style="margin-bottom:14px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
          <div style="color:#9a8aff;font-family:'SF Mono',monospace;font-size:12px">${r.signatureId}</div>
          <div style="font-size:11px;color:var(--mut);margin-top:6px;font-style:italic">Verrouillage impossible : aucun corps orbital libre dans ${r.systemAddress}.</div>
        </div>
      `;
    }

    const n = r.targets?.length || 0;
    if (r.universeKind === 'fixed' && n === 0) {
      fullBodyHtml = cartaBanner + signatureHeader + `
        <div style="font-size:11px;color:var(--text);line-height:1.7;padding:10px 14px;background:var(--bg);border:1px solid #5fcc8a30;border-radius:4px">
          <div style="color:#5fcc8a;font-size:11px;margin-bottom:6px;letter-spacing:.06em">▸ Corps planétaire détecté</div>
          <div style="color:var(--mut);font-size:10px;line-height:1.6">La sonde a confirmé la présence d'un corps planétaire à cette adresse. Sa nature exacte n'a pas pu être déterminée avec ce tier de sonde.</div>
        </div>
      `;
    } else if (n > 0) {
      // Compteur tankers disponibles (pour griser ou actif)
      const stat = G.fleet?.stationed || {};
      const totalTankers = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
      const inMission = (G.tankerMissions || []).filter(m => m.status === 'in_transit' || m.status === 'returning').length;
      const availableTankers = tankerAvailability(null);

      fullBodyHtml = cartaBanner + signatureHeader + `
        <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">${n} cible${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''}</div>
        ${r.targets.map(t => {
          const addr = t.cosmicAddress
            ? `<div style="font-family:'SF Mono',monospace;font-size:9px;color:${accent};opacity:.75;margin-top:3px">@ ${t.cosmicAddress}</div>`
            : (t.coordinates ? `<div style="font-family:'SF Mono',monospace;font-size:9px;color:${accent};opacity:.75;margin-top:3px">@ ${t.coordinates}</div>` : '');
          // 10/10/2026 : loot lisible (les cibles aléatoires ont {resource,min,max}, les mouvantes {res: qty})
          const lootText = (le => {
            if (!le) return '';
            if (le.resource !== undefined) {
              const lab = (TILES.find(x => x.key === le.resource) || {}).label || le.resource;
              return `~${le.min}–${le.max} ${lab}`;
            }
            return Object.entries(le).map(([k, v]) => `${v} ${(TILES.find(x => x.key === k) || {}).label || k}`).join(' · ');
          })(t.lootEstimate);
          const loot = lootText
            ? `<div style="font-size:9px;color:var(--mut);margin-top:3px">Loot estimé : ${lootText}</div>`
            : '';

          // ─── Bouton tanker — uniquement si la cible existe dans knownTargets ───
          // Chunk feedback 14/05 : passé en btn-ignition.tanker (taille standard, ~64px)
          // avec illustration tanker.png — cohérent avec la fiche cible mouvante.
          let tankerBtnHtml = '';
          if (t.cosmicAddress && G.knownTargets && G.knownTargets[t.cosmicAddress]) {
            const kt = G.knownTargets[t.cosmicAddress];
            if (kt.status === 'engaged') {
              const mission = (G.tankerMissions || []).find(m => m.id === kt.tankerMissionId);
              let etaText = 'tanker en route';
              if (mission) {
                const remainingMs = Math.max(0, mission.arrivalAt - Date.now());
                const remainingSec = Math.floor(remainingMs / 1000);
                etaText = remainingSec < 60
                  ? `retour ${remainingSec}s`
                  : `retour ${Math.floor(remainingSec / 60)}min`;
              }
              // Chunk feedback 14/05 : remplacer le badge inline emoji par une mini-card
              // avec illustration tanker + style cohérent jaune ambre (pas de discordance visuelle).
              const tankerIconSmall = PNG_ILLUSTRATIONS.tanker
                ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="" style="width:24px;height:24px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'">`
                : `<span style="font-size:18px;display:inline-flex;align-items:center;justify-content:center">${icon('tanker', {size:18})}</span>`;
              const tankerName = mission ? mission.tankerName : 'Engagée';
              tankerBtnHtml = `
                <div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,200,100,.06);border:1px solid rgba(255,200,100,.30);border-radius:6px">
                  ${tankerIconSmall}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:11px;color:#ffc864;font-weight:600">${tankerName}</div>
                    <div style="font-size:9px;color:var(--mut);margin-top:2px;letter-spacing:.06em">EN MISSION · ${etaText}</div>
                  </div>
                </div>
              `;
            } else {
              const canSend = availableTankers > 0;
              const tankerIcon = PNG_ILLUSTRATIONS.tanker
                ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" style="width:100%;height:100%;object-fit:contain${canSend ? '' : ';opacity:.5'}" onerror="pngFallback(this, 'tanker')">`
                : `${icon('tanker', {size:18})}`;
              if (canSend) {
                tankerBtnHtml = `
                  <div style="margin-top:10px">
                    <button class="btn-ignition tanker" onclick="onTankerKnownTargetClick('${t.cosmicAddress}')">
                      <span class="ignite-icon">${tankerIcon}</span>
                      <span class="ignite-label">Envoyer un tanker</span>
                      <span class="ignite-arrow">→</span>
                    </button>
                  </div>
                `;
              } else {
                tankerBtnHtml = `
                  <div style="margin-top:10px">
                    <button class="btn-ignition tanker disabled">
                      <span class="ignite-icon">${tankerIcon}</span>
                      <span class="ignite-label">Aucun tanker disponible</span>
                    </button>
                  </div>
                `;
              }
            }
          } else if (t.cosmicAddress) {
            // ─── Cible consommée par un tanker (chunk feedback 14/05) ───
            // La cible n'est plus dans G.knownTargets → tanker revenu (ou cible expirée).
            // Si on retrouve un rapport tanker correspondant, on affiche un mini-lien cliquable
            // vers ce rapport. Lien bidirectionnel rapport sonde ↔ rapport tanker.
            const matchingTankerReport = (G.tankerReports || []).find(tr =>
              tr.targetCoords === t.cosmicAddress
              && !tr.isLost
              && (tr.sourceProbeReportId === r.id || !tr.sourceProbeReportId)
            );
            if (matchingTankerReport) {
              const tankerIconMini = PNG_ILLUSTRATIONS.tanker
                ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'">`
                : `<span style="font-size:14px;display:inline-flex;align-items:center;justify-content:center">${icon('tanker', {size:14})}</span>`;
              tankerBtnHtml = `
                <div onclick="event.stopPropagation();toggleTankerReport('${matchingTankerReport.id}')" style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,200,100,.08);border:1px solid rgba(255,200,100,.35);border-radius:6px;cursor:pointer">
                  ${tankerIconMini}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:10px;color:#ffc864;letter-spacing:.08em">↳ ${matchingTankerReport.tankerName} · CARGO RÉCUPÉRÉ</div>
                    <div style="font-size:9px;color:var(--mut);margin-top:2px">Voir le rapport →</div>
                  </div>
                </div>
              `;
            } else {
              // Cible expirée sans tanker dispatché
              tankerBtnHtml = `
                <div style="margin-top:10px;padding:6px 10px;background:rgba(60,60,60,.15);border:1px dashed var(--border);border-radius:4px;font-size:10px;color:var(--mut);font-style:italic;text-align:center">
                  Cible exploitée ou expirée
                </div>
              `;
            }
          } else if (t.id && t.status) {
            // ─── 10/10/2026 — Cible d'une sonde envoyée sans signature (coordonnées locales) ───
            // Retour testeurs : « si je clique sur ces coordonnées je devrais avoir une action ».
            // Ces cibles passent par launchTankerToTarget(reportId, targetId) — le bouton avait
            // disparu lors de la refonte des cibles connues (14/05).
            if (t.status === 'pending') {
              if (availableTankers > 0) {
                tankerBtnHtml = _sigBtn('#ffc864', 'Envoyer un tanker', `onTankerReportTargetClick('${r.id}','${t.id}')`,
                  `Ramène le cargo de ${t.coordinates || 'la cible'}${t.tankerDurationMs ? ' · ~' + formatTankerDuration(t.tankerDurationMs) : ''}${t.riskLossPct ? ' · risque ' + t.riskLossPct + '%' : ''}`);
              } else if (totalTankers === 0) {
                tankerBtnHtml = _sigOff('Aucun tanker', 'Construis un tanker au Chantier orbital');
              } else {
                tankerBtnHtml = _sigOff('Tous les tankers sont en mission');
              }
            } else if (t.status === 'tanker_sent') {
              const m = (G.tankerMissions || []).find(x => x.id === t.tankerMissionId);
              const eta = m && m.arrivalAt ? ` · retour ${formatTankerDuration(Math.max(0, m.arrivalAt - Date.now()))}` : '';
              tankerBtnHtml = _sigOff(`${m ? m.tankerName : 'Tanker'} en route${eta}`);
            } else {
              const tr = (G.tankerReports || []).find(x => x.sourceProbeReportId === r.id && x.targetCoords === t.coordinates);
              tankerBtnHtml = tr
                ? _sigBtn('#ffc864', tr.isLost ? 'Tanker perdu · voir le rapport' : 'Cargo récupéré · voir le rapport', `toggleTankerReport('${tr.id}')`, '', true)
                : _sigOff('Cible exploitée');
            }
          }

          return `
            <div style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;margin-bottom:6px">
              <div style="font-size:11px;color:var(--text);display:flex;align-items:center;gap:6px">${renderIcon(t.icon || '◦', {size:12})} <span>${t.label}</span></div>
              ${addr}
              ${loot}
              ${tankerBtnHtml}
            </div>
          `;
        }).join('')}
      `;
    } else if (r.spy) {
      fullBodyHtml = cartaBanner + signatureHeader;   // PATCH_1610_SPY : le relevé suffit
    } else {
      fullBodyHtml = cartaBanner + signatureHeader + `
        <div style="font-size:11px;color:var(--mut);line-height:1.7;font-style:italic;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:4px">
          Rien d'exploitable à ${r.targetCoords || 'cette adresse'}.
        </div>
      `;
    }
  }

  return `
    <div class="rapport-row ${isUnread ? 'unread' : ''}" data-probe-report-id="${r.id}" style="cursor:default;padding-bottom:12px">
      <div class="rapport-dot ${isUnread ? 'unread' : ''}" style="background:${accent}"></div>
      <div class="rapport-info" style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:baseline;cursor:pointer" onclick="toggleProbeReport('${r.id}')">
          <div class="rapport-coord" style="color:${accent};font-size:10px">${typeLabel}</div>
          <div style="color:var(--mut);font-size:10px;font-family:'SF Mono',monospace">${dateText}</div>
        </div>
        <div class="rapport-name" style="margin-top:4px">${(r.targetCoords || r.sigId) ? sbDestLabel(r.targetCoords || r.sigId).label : (r.sector || '—')} <span style="color:var(--mut);font-size:10px">· ${r.probeName || 'Sonde'}</span></div>
        ${coordsHtml}
        ${fullBodyHtml}
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <button onclick="event.stopPropagation();onDeleteProbeReport('${r.id}')" style="background:transparent;border:none;color:var(--mut);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px;opacity:.6">
            ${icon('trash', {size:12})} Supprimer
          </button>
          <button onclick="toggleProbeReport('${r.id}')" style="background:transparent;border:none;color:${accent};font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px;opacity:.7">
            ↑ Replier
          </button>
        </div>
      </div>
    </div>
  `;
}

// Helper : marquer comme lu + re-render
function markProbeReportAsReadAndRerender(reportId) {
  markProbeReportAsRead(reportId);
  renderProspectRapports();
  updateProspectRapportsBadge();
}

// ═══════════════════════════════════════════════════════════════
// TOGGLE RAPPORT SONDE — Inline expand/collapse (passe 4.5)
// ═══════════════════════════════════════════════════════════════
// Reprend exactement le pattern des rapports ambient des bâtiments :
// la liste affiche les rapports compacts, cliquer expand le détail en place.
// Cf. starbyte_gdd_v1/12_ambient_narrative.md + toggleArchive() pour ambient.

function toggleProbeReport(reportId) {
  if (G._expandedProbeReport === reportId) {
    G._expandedProbeReport = null;
  } else {
    G._expandedProbeReport = reportId;
    if (typeof markProbeReportAsRead === 'function') markProbeReportAsRead(reportId);
  }
  // Re-render la liste des rapports dans le Centre de Prospection
  if (typeof renderProspectRapports === 'function') renderProspectRapports();
  if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
}

// ─── Actions sur signatures (passe 5.0) ───
// Cf. starbyte_gdd_v1/17_signatures_resolution.md
// Le joueur choisit explicitement ce qu'il veut suivre (décision verrouillée #15)

function onSignatureCarnetToggle(signatureId) {
  const wasIn = G.signatures && G.signatures[signatureId] && G.signatures[signatureId].inCarnet;
  const isIn = (typeof toggleSignatureInCarnet === 'function')
    ? toggleSignatureInCarnet(signatureId)
    : false;
  if (typeof toast === 'function') {
    toast(isIn ? 'Signature ajoutée au carnet' : 'Signature retirée du carnet');
  }
  // Re-render l'écran courant (Carnet, Rapports, etc.) pour refléter le changement
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// ─── Chunk polish 15/05 : Retirer une signature RÉSOLUE du carnet ───
// Bug d'origine : le carnet filtre `s.inCarnet || s.resolved`. Donc une signature
// résolue avec inCarnet=false est visible. Cliquer "Retirer" appelait
// onSignatureCarnetToggle qui flipait inCarnet de false→true → toast "ajoutée"
// au lieu de "retirée" (et la sig reste visible évidemment, vu qu'elle est résolue).
//
// Fix : pour une sig résolue, "Retirer" = suppression définitive (avec confirm).
async function onCarnetRemoveResolved(signatureId) {
  const sig = G.signatures && G.signatures[signatureId];
  if (!sig) return;
  let what;
  if (sig.resolvedType === 'moving') what = 'cette cible mouvante';
  else if (sig.fixedAddress) what = `le verrou sur ${sig.fixedAddress}`;
  else what = `cette signature identifiée`;
  const ok = await sbConfirmDanger(
    'Retirer du carnet',
    `Supprimer définitivement <strong>${sig.id}</strong> du carnet ?<br><br><em>${what.charAt(0).toUpperCase() + what.slice(1)} ne sera plus accessible depuis ici.</em>`,
    'Retirer'
  );
  if (!ok) return;
  if (typeof deleteSignature === 'function') deleteSignature(signatureId);
  if (typeof toast === 'function') toast('Retirée du carnet');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── PASSE 5.4 / 5.7 — Lancer une sonde depuis le carnet ───
// Navigue vers la fiche du tier approprié et pré-remplit l'adresse avec la signature.
// tier : 'light' (Légère) ou 'medium' (Moyenne)
function onCarnetLaunchProbe(signatureId, tier) {
  if (!G.signatures || !G.signatures[signatureId]) {
    if (typeof toast === 'function') toast('Signature introuvable');
    return;
  }
  const sig = G.signatures[signatureId];

  // Validation rapide : Légère = non résolue ; Moyenne = résolue fixe sans adresse
  if (tier === 'light' && sig.resolved) {
    if (typeof toast === 'function') toast('Cette signature est déjà résolue');
    return;
  }
  if (tier === 'medium') {
    if (!sig.resolved || sig.resolvedType !== 'fixed') {
      if (typeof toast === 'function') toast('La Moyenne ne cible que les signatures résolues fixes');
      return;
    }
    if (sig.fixedAddress) {
      if (typeof toast === 'function') toast('Cette signature est déjà verrouillée');
      return;
    }
  }

  // Pré-remplir l'état dispatch et passer en mode cosmique
  if (typeof probeDispatchState !== 'undefined' && probeDispatchState[tier]) {
    probeDispatchState[tier].mode = 'cosmic';
    probeDispatchState[tier].coord = signatureId;
  }

  // Ouvrir la fiche du tier
  if (typeof openProbeDetail === 'function') {
    openProbeDetail(tier);
  }
}

async function onSignatureIgnore(signatureId) {
  const sig = G.signatures && G.signatures[signatureId];
  const sigLabel = sig ? `${sig.id} (${sig.typeLabel || 'Signature'})` : 'cette signature';
  const ok = await sbConfirmDanger(
    'Ignorer la signature',
    `Supprimer définitivement <strong>${sigLabel}</strong> ?<br><br><em>Elle n'apparaîtra plus dans le carnet ni dans les rapports.</em>`,
    'Ignorer'
  );
  if (!ok) return;
  if (typeof deleteSignature === 'function') {
    deleteSignature(signatureId);
  }
  if (typeof toast === 'function') {
    toast('Signature ignorée');
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// ─── PASSE 5.4 — Supprimer un rapport (faire le ménage) ───
async function onDeleteProbeReport(reportId) {
  if (!Array.isArray(G.probeReports)) return;
  const idx = G.probeReports.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  const r = G.probeReports[idx];
  const label = r.tierLabel || 'Rapport sonde';
  const ok = await sbConfirmDanger(
    'Supprimer le rapport',
    `Supprimer définitivement <strong>${label}</strong> ?<br><br><em>Cette action ne peut pas être annulée.</em>`,
    'Supprimer'
  );
  if (!ok) return;
  G.probeReports.splice(idx, 1);
  if (typeof toast === 'function') toast('Rapport supprimé');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// ═══════════════════════════════════════════════════════════════
// RAPPORT TANKER — chunk feedback 14/05
// ═══════════════════════════════════════════════════════════════
// Cf. feedback Adrien : "rapport cliquable généré avec le moteur narratif
// et qui me dit combien de ressources j'ai ramené — c'est ce qui fait
// que le jeu raconte des histoires."
// Cf. starbyte_gdd_v1/11_design_patterns.md Principe #5 (ton narratif McCarthy /
// Foundation / Expanse / Wire S2) — déjà respecté dans _narrateNarrativeReturn.

function toggleTankerReport(reportId) {
  if (G._expandedTankerReport === reportId) {
    G._expandedTankerReport = null;
  } else {
    G._expandedTankerReport = reportId;
    if (typeof markTankerReportAsRead === 'function') markTankerReportAsRead(reportId);
  }
  if (typeof renderProspectRapports === 'function') renderProspectRapports();
  if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
}

async function onDeleteTankerReport(reportId) {
  if (!Array.isArray(G.tankerReports)) return;
  const idx = G.tankerReports.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  const r = G.tankerReports[idx];
  const label = r.tankerName || 'Rapport tanker';
  const ok = await sbConfirmDanger(
    'Supprimer le rapport',
    `Supprimer définitivement <strong>${label}</strong> ?<br><br><em>Cette action ne peut pas être annulée.</em>`,
    'Supprimer'
  );
  if (!ok) return;
  G.tankerReports.splice(idx, 1);
  if (typeof toast === 'function') toast('Rapport tanker supprimé');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  else if (typeof renderProspectRapports === 'function') renderProspectRapports();
}

// Navigue vers le rapport sonde d'origine (lien bidirectionnel)
function openSourceProbeReport(probeReportId) {
  if (!probeReportId) return;
  // Déplier le rapport sonde d'origine
  G._expandedProbeReport = probeReportId;
  if (typeof markProbeReportAsRead === 'function') markProbeReportAsRead(probeReportId);
  if (typeof renderProspectRapports === 'function') renderProspectRapports();
  // Scroll vers le rapport
  setTimeout(() => {
    const el = document.querySelector(`[data-probe-report-id="${probeReportId}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

// ⚡ Phase 4 P1 — Rendu d'un rapport de détection de balise
// Style cohérent avec les autres rapports (.rapport-row), accent violet de la balise.
// Compact uniquement (pas de vue étendue pour V1 — le rapport est déjà court).
function renderBeaconReportRow(r, isUnread) {
  const tsText = r.createdAt ? formatReportTimestamp(r.createdAt) : '';
  const accent = '#a370ff';  // violet balise (cohérent avec PROBE_TIER_CONFIG.beacon.accent)
  const t = r.target || {};

  // Type label selon la nature du contact détecté
  let typeLabel;
  if (t.type === 'player') {
    typeLabel = 'JOUEUR DÉTECTÉ';
  } else if (t.type === 'wandering') {
    typeLabel = 'CONTACT MOUVANT';
  } else {
    typeLabel = r.line ? 'CONVOI SUR UNE LIGNE' : 'TRANSIT DÉTECTÉ';   // PATCH_1410_LIGNES
  }

  // Identification : selon la confiance
  const confColor = t.confidence >= 70 ? '#5fcc8a' : (t.confidence >= 50 ? '#ffc864' : '#ff7878');

  // Fenêtre d'interception restante (rapport persiste seulement pendant la fenêtre)
  const remainingMs = Math.max(0, r.expiresAt - Date.now());
  const remainingMin = Math.ceil(remainingMs / 60000);
  const windowExpired = remainingMs <= 0;

  // Preview détail (style "Système · contact · cargo")
  const previewHtml = `
    <div style="font-size:11px;color:var(--mut);margin-top:4px">
      <span onclick="event.stopPropagation();openSystemOnMap('${r.systemCoord || ''}')" title="Voir sur la carte" style="color:${accent};font-family:'SF Mono',monospace;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${r.systemCoord || '—'}</span>
      <span style="opacity:.5;margin:0 4px">·</span>
      <span style="color:var(--text)">${t.name}</span>
      <span style="opacity:.5;margin:0 4px">·</span>
      cargo ${t.cargoEstimate} (T${t.tankerTier})
    </div>
    ${(window.SBLines && SBLines.routesOf ? SBLines.routesOf(r.systemCoord || '') : []).slice(0, 2).map(ro => `<div style="font-size:10px;margin-top:3px;color:${ro.color}">↳ ${String(ro.name).replace(/[<>&"]/g, '')} · ${ro.end ? 'arrivée' : ro.start ? 'départ' : 'jalon ' + ro.idx + ' sur ' + ro.n}</div>`).join('')}
    ${r.line ? `<div style="font-size:10px;color:var(--mut);margin-top:3px">${r.line.escort}${r.line.cap ? ` · cap relevé <span onclick="event.stopPropagation();openSystemOnMap('${r.line.cap}')" style="color:#ffd08a;font-family:'SF Mono',monospace;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${r.line.cap}</span>` : ' · se perd vers les marges'}${r.line.nth > 1 ? ` · ${r.line.nth}ᵉ passage observé sur cette ligne` : ''}${r.line.done ? ` · <span style="color:#c9a8ff">${({ robbed: 'abordé par ta flotte', repelled: 'ta flotte a été repoussée', tailed: 'filé par ta flotte', passed: 'laissé passer', tooStrong: 'escorte trop forte : ta flotte l\'a laissé passer' })[r.line.done] || ''}</span>` : (window.SBLines && SBLines.npcReportCan && SBLines.npcReportCan(r) ? ' · <span style="color:#c9a8ff">⚔ ta flotte est là : touche pour décider</span>' : ' · <span style="color:#a370ff">touche pour la suite →</span>')}</div>` : ''}
    <div style="font-size:10px;color:var(--mut);margin-top:3px">
      Confiance <span style="color:${confColor}">${t.confidence}%</span>
      ${windowExpired
        ? '<span style="opacity:.5;margin:0 4px">·</span><span style="color:var(--mut);font-style:italic">fenêtre fermée</span>'
        : `<span style="opacity:.5;margin:0 4px">·</span><span style="color:${accent}">fenêtre ${remainingMin} min</span>`
      }
    </div>
  `;

  return `
    <div class="rapport-row ${isUnread ? 'unread' : ''}" style="cursor:pointer" onclick="markBeaconReportRead('${r.id}')">
      <div class="rapport-dot ${isUnread ? 'unread' : ''}" style="background:${accent}"></div>
      <div class="rapport-info">
        <div class="rapport-coord" style="color:${accent};font-size:10px">${typeLabel}</div>
        ${previewHtml}
        ${tsText ? `<div class="rapport-time" style="color:var(--mut);font-size:9px;margin-top:3px;font-family:'SF Mono',monospace">${tsText}</div>` : ''}
      </div>
      <div class="rapport-arrow" style="color:${accent}">→</div>
    </div>
  `;
}

// ⚡ Phase 4 P1 — Marque un rapport de balise comme lu
// (Pour V1 : pas de vue étendue, juste flag read. Plus tard P5+ : ouvrir
// la fiche d'interception avec les options Détruire/Dévaliser/Capturer/Espionner.)
function markBeaconReportRead(reportId) {
  if (!Array.isArray(G.beaconReports)) return;
  const r = G.beaconReports.find(x => x.id === reportId);
  if (!r) return;
  if (r.mp) {   // PIRATERIE_1210 — vrai convoi : fiche d'interception
    if (!r.read) { r.read = true; if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge(); }
    mpOpenInterceptSheet(reportId);
    return;
  }
  if (r.line && window.SBLines && SBLines.reportSheet) {   // PATCH_1510_REPORT_SHEET — la fiche du passage (et la décision si une flotte est là)
    if (!r.read) { r.read = true; if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge(); if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); }
    SBLines.reportSheet(r);
    return;
  }
  if (!r.read) {
    r.read = true;
    if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
}

function renderTankerReportRow(r, isUnread) {
  const tsText = r.createdAt ? formatReportTimestamp(r.createdAt) : '';
  const isExpanded = (G._expandedTankerReport === r.id);
  const accent = '#ffc864';  // jaune tanker constant

  // ─── Header label (titre ligne 1) ───
  let typeLabel;
  if (r.isLost) {
    typeLabel = 'TANKER PERDU';
  } else if (r.kind === 'dropoff') {
    typeLabel = r.dropoffKind === 'deadly' ? 'CARGO PERDU' : 'TRANSPORT DÉPOSÉ';
  } else if (r.kind === 'garrison_lost') {
    typeLabel = 'TRANSPORT PERDU';
  } else if (r.kind === 'rapatriation') {
    typeLabel = 'TRANSPORT RAPATRIÉ';
  } else if (r.kind === 'route_run') {
    typeLabel = 'RETOUR DE ROUTE';
  } else if (r.kind === 'exploration') {
    // D5.3 : label spécifique exploration (fausse piste / succès)
    typeLabel = r.isLie ? 'FAUSSE PISTE' : 'EXPLORATION';
  } else {
    typeLabel = 'TANKER REVENU';
  }

  // Mini illustration tanker (16x16) à gauche du nom
  const tankerIconMini = PNG_ILLUSTRATIONS.tanker
    ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:5px;${r.isLost ? 'opacity:.4' : ''}" onerror="this.style.display='none'">`
    : '';

  // ─── VUE COMPACTE ───
  if (!isExpanded) {
    let previewHtml = '';
    if (r.isLost) {
      previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px;font-style:italic">${r.targetLabel || 'Cible'} — équipage disparu</div>`;
    } else if (r.kind === 'dropoff') {
      // Preview : que contient la cale déposée
      const cargo = r.cargo || {soldiers:{}, resources:{}};
      const parts = [];
      const totalSoldiers = (cargo.soldiers.garde || 0) + (cargo.soldiers.lourd || 0);
      if (totalSoldiers > 0) parts.push(`${totalSoldiers} soldat${totalSoldiers > 1 ? 's' : ''}`);
      for (const rk of ['metal', 'energie', 'cristal']) {
        if (cargo.resources?.[rk] > 0) {
          parts.push(`${fmt(cargo.resources[rk])} ${rk}`);
        }
      }
      const summary = parts.length ? parts.join(' · ') : 'cale vide';
      const styling = r.dropoffKind === 'deadly' ? 'color:#e87a7a;font-style:italic' : 'color:var(--mut)';
      previewHtml = `<div style="font-size:11px;${styling};margin-top:4px">${r.targetLabel || r.targetCoords} · ${summary}</div>`;
    } else if (r.kind === 'garrison_lost') {
      previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px;font-style:italic">${r.targetLabel || r.targetCoords} — dernier signal</div>`;
    } else if (r.kind === 'rapatriation') {
      const ret = r.loot?.soldiersReturned || {};
      const total = (ret.garde || 0) + (ret.lourd || 0);
      previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px">${r.targetLabel || r.targetCoords} · ${total} soldat${total !== 1 ? 's' : ''} rentré${total !== 1 ? 's' : ''}</div>`;
    } else if (r.kind === 'exploration') {
      // D5.3 : preview spécifique exploration (loot épave, nouveau dock, fausse piste)
      let summary;
      if (r.isLie) {
        summary = `<span style="color:#ff7878">fausse piste</span>`;
      } else if (r.leadType === 'wreck' && r.loot?.resources) {
        const parts = [];
        for (const [k, v] of Object.entries(r.loot.resources)) {
          if (v > 0) parts.push(`<span style="color:${accent}">+${v}</span> ${k}`);
        }
        summary = parts.length > 0 ? parts.slice(0, 3).join(' · ') : 'cale vide';
      } else if (r.leadType === 'dock_coords') {
        summary = `<span style="color:#7aaadc">nouveau dock découvert</span>`;
      } else if (r.leadType === 'wanted_target') {
        summary = `<span style="color:#ff7878">cible localisée</span>`;
      } else {
        summary = 'retour';
      }
      previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px">${r.leadTitle || r.targetLabel || 'Piste'} · ${summary}</div>`;
    } else {
      // Preview des ressources principales ramenées (max 2) — pickup classique
      const loot = r.loot || {};
      const resourceParts = [];
      for (const [k, v] of Object.entries(loot.resources || {}).slice(0, 2)) {
        const info = (typeof tileInfo === 'function') ? tileInfo(k) : null;
        const label = info?.label?.toLowerCase() || k;
        resourceParts.push(`<span style="color:${accent}">+${v}</span> ${label}`);
      }
      if (loot.navigationData) resourceParts.push(`<span style="color:${accent}">+1</span> données nav.`);
      const previewLoot = resourceParts.length > 0 ? resourceParts.join(' · ') : 'cargo vide';
      previewHtml = `<div style="font-size:11px;color:var(--mut);margin-top:4px">${r.targetLabel || 'Cible'} · ${previewLoot}</div>`;
    }

    return `
      <div class="rapport-row ${isUnread ? 'unread' : ''}" style="cursor:pointer" onclick="toggleTankerReport('${r.id}')">
        <div class="rapport-dot ${isUnread ? 'unread' : ''}" style="background:${accent}"></div>
        <div class="rapport-info">
          <div class="rapport-coord" style="color:${accent};font-size:10px">${typeLabel}</div>
          <div class="rapport-name">${tankerIconMini}${r.tankerName || 'Tanker'} · ${r.targetCoords || '—'}</div>
          ${previewHtml}
          ${tsText ? `<div class="rapport-time" style="color:var(--mut);font-size:9px;margin-top:3px;font-family:'SF Mono',monospace">${tsText}</div>` : ''}
        </div>
        <div class="rapport-arrow" style="color:${accent}">→</div>
      </div>
    `;
  }

  // ─── VUE ÉTENDUE — Rapport narratif premium ───

  // Banner header
  const bannerHtml = `
    <div style="margin-bottom:14px;padding:14px 16px;background:linear-gradient(180deg, rgba(80,55,15,.35), rgba(45,30,8,.55));border:1px solid ${accent}45;border-radius:8px;display:flex;align-items:center;gap:12px">
      ${PNG_ILLUSTRATIONS.tanker ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" style="width:40px;height:40px;object-fit:contain;${r.isLost ? 'opacity:.4;filter:grayscale(.6)' : ''}" onerror="this.style.display='none'">` : `<div style="font-size:28px">${icon('tanker', {size:28})}</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:${accent};font-weight:600;letter-spacing:.04em">${r.tankerName || 'Tanker'}</div>
        <div style="font-size:11px;color:var(--mut);margin-top:3px">${r.targetLabel || 'Cible'}</div>
        <div style="font-family:'SF Mono',monospace;font-size:10px;color:${accent};opacity:.75;margin-top:2px">${r.targetCoords || '—'}</div>
      </div>
      ${r.isLost ? `<span style="font-size:9px;background:rgba(176,39,41,.18);color:#e87a7a;padding:3px 8px;border-radius:3px;letter-spacing:.08em">PERDU</span>` : ''}
    </div>
  `;

  // Narrative — style mainframe militaire (cohérent avec rapports de bataille)
  // La narrative contient des marqueurs :
  //   **Titre**         → header monospace ambre
  //   *bilan*           → ligne d'italique gris (méta)
  //   ---               → séparateur
  //   reste             → paragraphes narratifs en italique #e6f0ff
  // Cf. feedback Adrien 18/05 : "même chose que rapports de bataille parce qu'actuellement
  // c'est écrit beaucoup trop petit je n'arrive pas à lire"
  const narrativeHtml = r.narrative ? renderTankerNarrativeStyled(r.narrative, accent) : '';

  // ─── Section CARTE DE ROUTE (Chunk B Phase 1) ───
  // Feedback Adrien 18/05 : "peut-on afficher la carte de route au sommet du rapport stp,
  // c'est tellement important comme découverte que le rapport devrait s'ouvrir directement
  // sur la carte, puis le texte en dessous"
  let routeCardHtml = '';
  const droppedCard = r.loot?.routeCard;
  if (droppedCard) {
    const kindCfg = ROUTE_CARD_KINDS[droppedCard.kind] || ROUTE_CARD_KINDS.clean;
    const qualityBar = Math.max(0, Math.min(100, droppedCard.quality || 0));
    routeCardHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#ffc864;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('map', {size:11, color:'#ffc864'})} Carte de route trouvée</div>
        <div style="padding:14px;background:rgba(255,200,100,.07);border:1px solid rgba(255,200,100,.30);border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <div style="font-size:14px;color:#ffc864;font-weight:600">${droppedCard.name}</div>
            <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">${kindCfg.label}</div>
          </div>
          <div style="font-size:12px;color:var(--text);line-height:1.6;margin-bottom:10px;font-family:'SF Mono',monospace">
            <span style="color:var(--mut)">De :</span> ${droppedCard.originHint}<br>
            <span style="color:var(--mut)">Vers :</span> ${droppedCard.destinationHint}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Qualité</span>
            <div style="flex:1;height:4px;background:var(--bg);border-radius:2px;overflow:hidden">
              <div style="width:${qualityBar}%;height:100%;background:#ffc864"></div>
            </div>
            <span style="font-size:11px;color:#ffc864;font-family:'SF Mono',monospace">${qualityBar}</span>
          </div>
          <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.6;margin-top:8px">${kindCfg.desc}</div>
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,200,100,.15);font-size:10px;color:var(--mut);letter-spacing:.04em">
            Source : <span style="color:var(--text)">${droppedCard.source}</span> · archivée dans la Maison de Commerce
          </div>
        </div>
      </div>
    `;
  }

  // ─── D5.3 fix #1+#3 : Bloc "Flux de cale" (route_run uniquement) ───
  // Affiche le cargo aller → retour + pillage + bénéfice net.
  // Le joueur voit en un coup d'oeil ce qu'il a investi, ce qu'il récupère, ce qu'il a perdu.
  let cargoFlowHtml = '';
  if (r.kind === 'route_run' && !r.isLost && r.cargoInitial) {
    const init = r.cargoInitial;
    const final = r.cargoFinal || { metal:0, energie:0, cristal:0 };
    const pillaged = r.cargoPillaged;
    const balance = r.balance;
    const initTotal = init.metal + init.energie + init.cristal;
    const finalTotal = final.metal + final.energie + final.cristal;

    // Couleurs ressources (cohérent style guide)
    const COL_METAL = '#cececd';
    const COL_ENERGIE = '#ffaf3a';
    const COL_CRISTAL = '#6db032';

    // Helper : barre horizontale segmentée avec proportions selon les unités.
    // On normalise par rapport au MAX(initTotal, finalTotal) pour que les deux barres
    // soient comparables visuellement (perte de 50% = barre 2 moitié plus courte).
    const maxTotal = Math.max(initTotal, finalTotal, 1);
    const renderCargoBar = (cargo, total) => {
      if (total === 0) {
        return `<div style="height:8px;background:rgba(255,255,255,.03);border:1px dashed var(--border);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--mut);font-style:italic">cale vide</div>`;
      }
      const widthPct = (total / maxTotal) * 100;
      const mPct = total > 0 ? (cargo.metal / total) * 100 : 0;
      const ePct = total > 0 ? (cargo.energie / total) * 100 : 0;
      const cPct = total > 0 ? (cargo.cristal / total) * 100 : 0;
      return `
        <div style="height:8px;background:rgba(255,255,255,.04);border-radius:3px;overflow:hidden;position:relative">
          <div style="height:100%;width:${widthPct}%;display:flex">
            ${cargo.metal > 0 ? `<div style="flex:${mPct};background:${COL_METAL}"></div>` : ''}
            ${cargo.energie > 0 ? `<div style="flex:${ePct};background:${COL_ENERGIE}"></div>` : ''}
            ${cargo.cristal > 0 ? `<div style="flex:${cPct};background:${COL_CRISTAL}"></div>` : ''}
          </div>
        </div>
      `;
    };

    // Format texte ressource ligne
    const fmtCargoText = (cargo) => {
      const parts = [];
      if (cargo.metal > 0) parts.push(`<span style="color:${COL_METAL}">${cargo.metal}m</span>`);
      if (cargo.energie > 0) parts.push(`<span style="color:${COL_ENERGIE}">${cargo.energie}e</span>`);
      if (cargo.cristal > 0) parts.push(`<span style="color:${COL_CRISTAL}">${cargo.cristal}c</span>`);
      return parts.length > 0 ? parts.join(' · ') : '<span style="color:var(--mut)">vide</span>';
    };

    // Block départ + retour avec barres horizontales
    const departBlock = `
      <div style="padding:12px;background:rgba(122,170,220,.04);border:1px solid rgba(122,170,220,.25);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span style="font-size:9px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Au départ</span>
          <span style="font-size:11px;color:#7aaadc;font-family:'SF Mono',monospace;font-weight:600">${initTotal} u.</span>
        </div>
        ${renderCargoBar(init, initTotal)}
        <div style="margin-top:6px;font-size:11px;font-family:'SF Mono',monospace">${fmtCargoText(init)}</div>
      </div>
    `;

    const retourColor = finalTotal < initTotal ? '#e87a7a' : '#78c88c';
    const retourBgRgb = finalTotal < initTotal ? '232,122,122' : '120,200,140';
    const retourBlock = `
      <div style="padding:12px;background:rgba(${retourBgRgb},.04);border:1px solid rgba(${retourBgRgb},.25);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span style="font-size:9px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Au retour (cale restante)</span>
          <span style="font-size:11px;color:${retourColor};font-family:'SF Mono',monospace;font-weight:600">${finalTotal} u.</span>
        </div>
        ${renderCargoBar(final, finalTotal)}
        <div style="margin-top:6px;font-size:11px;font-family:'SF Mono',monospace">${fmtCargoText(final)}</div>
      </div>
    `;

    // Bloc pillage : barre rouge si pillé
    let pillageHtml = '';
    if (pillaged) {
      const pillagedPct = pillaged.pct;
      pillageHtml = `
        <div style="margin-top:8px;padding:12px;background:rgba(255,120,120,.06);border:1px solid rgba(255,120,120,.30);border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span style="font-size:9px;color:#e87a7a;letter-spacing:.1em;text-transform:uppercase">⚠ Cargo détourné par l'équipage</span>
            <span style="font-size:13px;color:#e87a7a;font-family:'SF Mono',monospace;font-weight:600">−${pillaged.amount} u.</span>
          </div>
          <div style="height:8px;background:rgba(255,255,255,.04);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pillagedPct}%;background:linear-gradient(90deg,#b02729,#e87a7a)"></div>
          </div>
          <div style="margin-top:6px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">
            Équipage ${pillaged.palier}${pillaged.isDrunk ? ' et ivre' : ''} · ${pillagedPct}% du cargo "volatilisé"
          </div>
        </div>
      `;
    }

    // Bénéfice net (avec barres comparatives investi vs récupéré)
    let balanceHtml = '';
    if (balance) {
      const isProfit = balance.netUnits >= 0;
      const profitColor = isProfit ? '#78c88c' : '#e87a7a';
      const profitSign = isProfit ? '+' : '';
      // Barre comparative : investi (gris) vs récupéré (vert) en parallèle
      const maxBar = Math.max(balance.initialUnits, balance.returnedUnits, 1);
      const investedW = (balance.initialUnits / maxBar) * 100;
      const returnedW = (balance.returnedUnits / maxBar) * 100;
      balanceHtml = `
        <div style="margin-top:8px;padding:12px;background:rgba(${isProfit ? '120,200,140' : '232,122,122'},.06);border:1px solid rgba(${isProfit ? '120,200,140' : '232,122,122'},.30);border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <span style="font-size:9px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Bilan ressources</span>
            <span style="font-size:14px;font-weight:600;color:${profitColor};font-family:'SF Mono',monospace">${profitSign}${balance.netUnits} u.</span>
          </div>

          <div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mut);margin-bottom:2px">
              <span>INVESTI</span><span style="font-family:'SF Mono',monospace">${balance.initialUnits} u.</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.04);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${investedW}%;background:#7aaadc;opacity:.7"></div>
            </div>
          </div>

          <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mut);margin-bottom:2px">
              <span>RAMENÉ (butin + cale)</span><span style="font-family:'SF Mono',monospace">${balance.returnedUnits} u.</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.04);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${returnedW}%;background:${profitColor}"></div>
            </div>
          </div>

          <div style="padding-top:6px;border-top:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;font-size:10px;color:var(--mut)">
            <span>Crédits gagnés</span>
            <span style="color:#ffc864;font-family:'SF Mono',monospace">+${balance.credits} CG</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mut);margin-top:2px">
            <span>Carburant brûlé</span>
            <span style="color:#7aaadc;font-family:'SF Mono',monospace">−${balance.fuelSpent}</span>
          </div>
        </div>
      `;
    }

    cargoFlowHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:#ffc864;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('cargo', {size:11, color:'#ffc864'}) || '📦'} Flux de cale</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${departBlock}
          ${retourBlock}
        </div>
        ${pillageHtml}
        ${balanceHtml}
      </div>
    `;
  }

  // Section RAMENÉ (dopamine, gros chiffres)
  let lootHtml = '';
  if (!r.isLost && r.loot) {
    const loot = r.loot;
    const lootRows = [];
    for (const [k, v] of Object.entries(loot.resources || {})) {
      const info = (typeof tileInfo === 'function') ? tileInfo(k) : null;
      const label = info?.label || k;
      const color = info?.color || accent;
      lootRows.push(`
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--border)">
          <span style="font-size:11px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase">${label}</span>
          <span style="font-size:18px;font-weight:600;color:${color};font-family:'SF Mono',monospace">+${v}</span>
        </div>
      `);
    }
    if (loot.navigationData) {
      lootRows.push(`
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--border)">
          <span style="font-size:11px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase">Données nav.</span>
          <span style="font-size:18px;font-weight:600;color:#9a8aff;font-family:'SF Mono',monospace">+${loot.navigationData}</span>
        </div>
      `);
    }
    if (loot.legendDrop) {
      // PASSE 6 : ligne dédiée pour fragment / objet témoin / coord partielle
      const t = loot.legendDrop.type;
      const dropLabel = t === 'fragment' ? 'Fragment' : t === 'relic' ? 'Objet témoin' : 'Coord. partielle';
      const dropValue = t === 'fragment' ? '1 fragment archivé'
        : t === 'relic' ? '1 objet indexé'
        : '1 coord. à résoudre';
      lootRows.push(`
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--border);cursor:pointer" onclick="(typeof setProspectTab==='function')&&(setProspectTab('archives'))" title="Voir dans Archives">
          <span style="font-size:11px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase">${dropLabel}</span>
          <span style="font-size:13px;color:var(--legend-accent, ${accent});font-style:italic">${dropValue} →</span>
        </div>
      `);
    }

    if (lootRows.length > 0) {
      lootHtml = `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('gem', {size:11})} Cargo récupéré</div>
          <div style="padding:0 14px;background:var(--bg);border:1px solid ${accent}30;border-radius:6px">
            ${lootRows.join('')}
          </div>
        </div>
      `;
    } else {
      lootHtml = `
        <div style="margin-bottom:14px;padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:6px;font-size:11px;color:var(--mut);font-style:italic;text-align:center">
          Cargo vide.
        </div>
      `;
    }
  }

  // ─── Section CARGO LIVRÉ (rapports dropoff uniquement) ───
  // Style butin d'attaque : encart coloré, lignes type "+88 métal" en gros
  // avec couleur de la ressource. Pour soldats : "+8 soldats" en ambre.
  // Si la route a modifié le cargo (taxe, bonus, perte) : note en bas.
  let deliveredHtml = '';
  if (r.kind === 'dropoff' && !r.isLost && r.cargo) {
    const cargo = r.cargo;
    const metal = cargo.resources?.metal || 0;
    const energie = cargo.resources?.energie || 0;
    const cristal = cargo.resources?.cristal || 0;
    const garde = cargo.soldiers?.garde || 0;
    const lourd = cargo.soldiers?.lourd || 0;
    const total = metal + energie + cristal + garde + lourd;

    // Cas A — Veille orbitale pure (tanker vide en orbite)
    if (total === 0 && r.dropoffKind !== 'deadly') {
      deliveredHtml = `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;color:#5fcc8a;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('satellite', {size:11, color:'#5fcc8a'})} Veille orbitale</div>
          <div style="padding:14px;background:rgba(95,204,138,.06);border:1px solid rgba(95,204,138,.20);border-radius:6px;font-size:12px;color:var(--mut);font-style:italic;text-align:center;line-height:1.6">
            Aucune cargaison déposée — le tanker observe.
          </div>
        </div>
      `;
    }
    // Cas B — Cargaison perdue (planète mortelle)
    else if (r.dropoffKind === 'deadly') {
      deliveredHtml = `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;color:#e87a7a;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('warning', {size:11, color:'#e87a7a'})} Cargaison perdue</div>
          <div style="padding:14px;background:rgba(176,39,41,.08);border:1px solid rgba(176,39,41,.25);border-radius:6px;font-size:12px;color:#e87a7a;font-style:italic;text-align:center">
            Tout ce qui était à bord a été pulvérisé à l'arrivée.
          </div>
        </div>
      `;
    }
    // Cas C — Cargaison livrée normalement (style butin attaque)
    else {
      const rows = [];
      if (metal > 0)   rows.push(`<div style="color:#cececd;font-size:18px;font-weight:600;font-family:'SF Mono',monospace">+${fmt(metal)} <span style="font-size:13px;font-weight:400;color:var(--mut);text-transform:lowercase">métal</span></div>`);
      if (energie > 0) rows.push(`<div style="color:#ffaf3a;font-size:18px;font-weight:600;font-family:'SF Mono',monospace">+${fmt(energie)} <span style="font-size:13px;font-weight:400;color:var(--mut);text-transform:lowercase">énergie</span></div>`);
      if (cristal > 0) rows.push(`<div style="color:#6db032;font-size:18px;font-weight:600;font-family:'SF Mono',monospace">+${fmt(cristal)} <span style="font-size:13px;font-weight:400;color:var(--mut);text-transform:lowercase">cristal</span></div>`);
      if (garde > 0)   rows.push(`<div style="color:#ffc864;font-size:18px;font-weight:600;font-family:'SF Mono',monospace">+${garde} <span style="font-size:13px;font-weight:400;color:var(--mut);text-transform:lowercase">garde${garde > 1 ? 's' : ''}</span></div>`);
      if (lourd > 0)   rows.push(`<div style="color:#ffc864;font-size:18px;font-weight:600;font-family:'SF Mono',monospace">+${lourd} <span style="font-size:13px;font-weight:400;color:var(--mut);text-transform:lowercase">soldat${lourd > 1 ? 's' : ''} lourd${lourd > 1 ? 's' : ''}</span></div>`);

      // Note delta : si route a modifié, montrer ce qui a été envoyé vs arrivé
      let deltaNote = '';
      const rf = r.routeFactor || 1.0;
      if (Math.abs(rf - 1.0) > 0.001) {
        const orig = r.cargoOriginal || {};
        const totalOrig = (orig.resources?.metal||0)+(orig.resources?.energie||0)+(orig.resources?.cristal||0)+(orig.soldiers?.garde||0)+(orig.soldiers?.lourd||0);
        const pct = Math.round((rf - 1.0) * 100);
        if (rf > 1.0) {
          deltaNote = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(95,204,138,.20);font-size:11px;color:#5fcc8a;font-style:italic">Bonus de rencontre : +${pct}% sur le cargo envoyé (initial ${fmt(totalOrig)})</div>`;
        } else if (r.routeType === 'beacon') {
          deltaNote = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.20);font-size:11px;color:#ffc864;font-style:italic">Taxe impériale : ${pct}% sur le cargo envoyé (initial ${fmt(totalOrig)})</div>`;
        } else {
          deltaNote = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(176,39,41,.20);font-size:11px;color:#e87a7a;font-style:italic">Perte en route : ${pct}% sur le cargo envoyé (initial ${fmt(totalOrig)})</div>`;
        }
      }

      deliveredHtml = `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${icon('package', {size:11})} Cargo livré à ${r.targetCoords}</div>
          <div style="padding:14px 16px;background:rgba(80,55,15,.10);border:1px solid rgba(255,192,96,.20);border-radius:6px;display:flex;flex-direction:column;gap:8px">
            ${rows.join('')}
            ${deltaNote}
          </div>
        </div>
      `;
    }
  }

  // Lien vers le rapport sonde d'origine (bidirectionnel)
  let originHtml = '';
  if (r.sourceProbeReportId) {
    const sourceReport = (G.probeReports || []).find(rp => rp.id === r.sourceProbeReportId);
    if (sourceReport) {
      const sourceCfg = PROBE_TIER_CONFIG[sourceReport.tier];
      const sourceTierLabel = sourceCfg ? sourceCfg.label : sourceReport.tier;
      const sigSuffix = r.sourceSignatureId ? ` · ${r.sourceSignatureId}` : '';
      originHtml = `
        <div style="margin-bottom:14px;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="openSourceProbeReport('${r.sourceProbeReportId}')">
          <div>
            <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">↳ Origine</div>
            <div style="font-size:11px;color:var(--text);margin-top:3px">Rapport ${sourceTierLabel} · ${sourceReport.probeName || 'Sonde'}${sigSuffix}</div>
          </div>
          <div style="color:var(--mut);font-size:14px">→</div>
        </div>
      `;
    }
  }

  // ─── Section CARTE DE ROUTE déplacée plus haut (juste après bannière) — feedback 18/05 ───

  return `
    <div class="rapport-row ${isUnread ? 'unread' : ''}" data-tanker-report-id="${r.id}" style="cursor:default;padding-bottom:12px">
      <div class="rapport-dot ${isUnread ? 'unread' : ''}" style="background:${accent}"></div>
      <div class="rapport-info" style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:baseline;cursor:pointer" onclick="toggleTankerReport('${r.id}')">
          <div class="rapport-coord" style="color:${accent};font-size:10px">${typeLabel}</div>
          <div style="color:var(--mut);font-size:10px;font-family:'SF Mono',monospace">${tsText}</div>
        </div>
        <div class="rapport-name" style="margin-top:4px">${tankerIconMini}${r.tankerName || 'Tanker'}</div>
        <div style="margin-top:12px">
          ${bannerHtml}
          ${sbDockFoundHtml(r)}
          ${routeCardHtml}
          ${cargoFlowHtml}
          ${narrativeHtml}
          ${lootHtml}
          ${deliveredHtml}
          ${originHtml}
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <button onclick="event.stopPropagation();onDeleteTankerReport('${r.id}')" style="background:transparent;border:none;color:var(--mut);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px;opacity:.6">
              ${icon('trash', {size:12})} Supprimer
            </button>
            <button onclick="toggleTankerReport('${r.id}')" style="background:transparent;border:none;color:${accent};font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px;opacity:.7">
              ↑ Replier
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Parse une narrative au format Markdown léger et la rend en style mainframe militaire.
// Format reconnu :
//   **Titre**                    → header monospace ambre (style ═══ TITRE ═══)
//   *bilan métadata*             → ligne d'italique gris (méta du trajet)
//   ---                          → séparateur visuel (border-top)
//   reste                        → paragraphe narratif en italique #e6f0ff, taille lisible
// Cf. feedback Adrien 18/05 : la narrative doit être au format des rapports militaires
// (capture 3) — monospace, plus gros, mise en page mainframe.
function renderTankerNarrativeStyled(narrative, accent) {
  if (!narrative) return '';
  const safe = narrative.replace(/</g, '&lt;');
  // Split sur les blocs séparés par ---
  const blocks = safe.split(/\n---\n/);
  const renderedBlocks = blocks.map(block => {
    // Détecter les patterns au début du bloc
    const lines = block.split('\n');
    let html = '';
    let paragraphBuffer = [];

    const flushParagraph = () => {
      if (paragraphBuffer.length === 0) return;
      const text = paragraphBuffer.join('\n').trim();
      if (text) {
        html += `<div style="font-style:italic;color:#e6f0ff;font-size:14.5px;line-height:1.9;padding:8px 0 12px;white-space:pre-line;letter-spacing:.005em">${text}</div>`;
      }
      paragraphBuffer = [];
    };

    for (const line of lines) {
      // Titre **xxx**
      const titleMatch = line.match(/^\*\*(.+?)\*\*\s*$/);
      if (titleMatch) {
        flushParagraph();
        html += `<div style="color:${accent};font-size:12px;letter-spacing:.18em;margin:8px 0 12px;text-transform:uppercase;font-family:'SF Mono',monospace;line-height:1.4">═══ ${titleMatch[1]} ═══</div>`;
        continue;
      }
      // Bilan *xxx*  (sur sa propre ligne)
      const bilanMatch = line.match(/^\*([^*].+[^*])\*\s*$/);
      if (bilanMatch) {
        flushParagraph();
        html += `<div style="font-size:12px;color:var(--mut);font-family:'SF Mono',monospace;line-height:1.7;margin-bottom:12px;padding-left:2px;letter-spacing:.02em">▸ ${bilanMatch[1]}</div>`;
        continue;
      }
      // Ligne vide : flush
      if (line.trim() === '') {
        if (paragraphBuffer.length > 0) {
          paragraphBuffer.push('');
        }
        continue;
      }
      paragraphBuffer.push(line);
    }
    flushParagraph();
    return html;
  });

  // Joindre les blocs avec une bordure pointillée style mainframe (équivalent du ---)
  const joined = renderedBlocks.join(
    `<div style="border-top:1px dashed ${accent}25;margin:14px 0"></div>`
  );

  // Container global avec léger fond et border gauche tanker
  return `
    <div style="margin-bottom:14px;padding:16px 18px;background:rgba(0,0,0,.18);border:1px solid ${accent}30;border-left:3px solid ${accent}70;border-radius:6px">
      ${joined}
    </div>
  `;
}

// Formate un timestamp (ms) en texte relatif lisible (il y a Xmin/Xh/Xj)
function formatReportTimestamp(ts) {
  const elapsed = Math.floor((Date.now() - ts) / 1000);
  if (elapsed < 60) return 'il y a ' + elapsed + 's';
  if (elapsed < 3600) return 'il y a ' + Math.floor(elapsed / 60) + ' min';
  if (elapsed < 86400) return 'il y a ' + Math.floor(elapsed / 3600) + ' h';
  return 'il y a ' + Math.floor(elapsed / 86400) + ' j';
}

function onAddressChange() {
  const sectorIn = document.getElementById('addr-sector');
  const systemIn = document.getElementById('addr-system');
  if (!sectorIn || !systemIn) return;

  let sector = sectorIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  let system = systemIn.value.replace(/[^0-9]/g, '').slice(0, 4);
  sectorIn.value = sector;
  systemIn.value = system;

  const validateEl = document.getElementById('addr-validate');

  if (!sector || !system) {
    validateEl.innerHTML = `<span class="err">Adresse incomplète</span>`;
    updateDispatchBtn(false);
    return;
  }

  // Calcul de la distance simplifié (différence absolue de système, en restant dans son secteur)
  const distance = computeDistance(sector, parseInt(system));
  const range = PROBE_LEVELS.range.values[G.probe.rangeIdx];

  if (distance < 0) {
    validateEl.innerHTML = `<span class="err">Secteur ${sector} hors de portée</span>`;
    updateDispatchBtn(false);
    return;
  }

  if (distance === 0) {
    validateEl.innerHTML = `<span class="err">C'est ton propre système</span>`;
    updateDispatchBtn(false);
    return;
  }

  if (distance > range) {
    validateEl.innerHTML = `Distance estimée : <b>${distance} systèmes</b><br>Portée actuelle : <b class="err">${range} systèmes</b><br><span class="err">Hors de portée. Améliore la portée.</span>`;
    updateDispatchBtn(false);
    return;
  }

  const baseDuration = distance * 8; // 8s par système (proto rapide)
  const speedMult = PROBE_LEVELS.speed.values[G.probe.speedIdx];
  const finalDuration = Math.round(baseDuration / speedMult);

  validateEl.innerHTML = `
    Distance estimée : <b>${distance} système${distance > 1 ? 's' : ''}</b><br>
    Portée actuelle : <b class="ok">${range} systèmes ${icon('check', {size:11, color:'#5fcc8a'})}</b><br>
    Durée du voyage : <b>${formatTime(finalDuration)}</b>
  `;
  updateDispatchBtn(true, finalDuration);
}

function computeDistance(sector, system) { const MY_ADDRESS = sbOrigin();   // PATCH_2010_DEPART : depuis la planète affichée
  // Même secteur : différence directe de numéro de système
  // Secteur adjacent : on simplifie en ajoutant 50 systèmes
  if (sector === MY_ADDRESS.sector) {
    return Math.abs(system - MY_ADDRESS.system);
  }
  // Voisinage de secteur (lettres adjacentes)
  const myLetter = MY_ADDRESS.sector.charCodeAt(0);
  const targetLetter = sector.charCodeAt(0);
  const letterDiff = Math.abs(myLetter - targetLetter);
  if (letterDiff <= 2) {
    return Math.abs(system - MY_ADDRESS.system) + letterDiff * 50;
  }
  return -1; // Trop loin (à terme, secteurs adjacents seront définis plus précisément)
}

function updateDispatchBtn(enabled, duration) {
  const btn = document.getElementById('probe-dispatch-btn');
  if (!btn) return;
  btn.classList.toggle('disabled', !enabled);
  if (enabled) {
    btn.textContent = G.probeMode === 'manual'
      ? `Envoyer la sonde${duration ? ' · ' + formatTime(duration) : ''}`
      : 'Lancer en exploration aveugle';
  } else {
    btn.textContent = 'Envoyer la sonde';
  }
}

function upgradeProbe(stat) {
  const idxField = stat + 'Idx';
  const lvl = G.probe[idxField];
  const maxLvl = PROBE_LEVELS[stat].values.length;
  if (lvl >= maxLvl - 1) return;
  const cost = PROBE_UPGRADE_COSTS[stat][lvl];
  for (const [res, qty] of Object.entries(cost)) {
    if (!G.res[res] || G.res[res].v < qty) {
      toast('Ressources insuffisantes');
      return;
    }
  }
  for (const [res, qty] of Object.entries(cost)) {
    G.res[res].v -= qty;
  }
  G.probe[idxField]++;
  toast(`Sonde améliorée — ${PROBE_LEVELS[stat].labels[lvl + 1]}`);
  renderProspectScreen();
}

function dispatchProbe() {
  if (G.probe.state !== 'ready') {
    toast('Sonde déjà en mission');
    return;
  }

  let destSector, destSystem;

  if (G.probeMode === 'manual') {
    destSector = document.getElementById('addr-sector').value.toUpperCase();
    destSystem = parseInt(document.getElementById('addr-system').value);
    if (!destSector || !destSystem) {
      toast('Adresse incomplète');
      return;
    }
    const distance = computeDistance(destSector, destSystem);
    const range = PROBE_LEVELS.range.values[G.probe.rangeIdx];
    if (distance <= 0 || distance > range) {
      toast('Destination invalide');
      return;
    }
  } else {
    // Mode aveugle : pioche un système aléatoire dans la portée
    const range = PROBE_LEVELS.range.values[G.probe.rangeIdx];
    let attempts = 0;
    do {
      destSector = MY_ADDRESS.sector;
      const offset = Math.floor((Math.random() * 2 - 1) * range);
      destSystem = MY_ADDRESS.system + offset;
      attempts++;
    } while ((destSystem === MY_ADDRESS.system || destSystem < 1000 || destSystem > 9999) && attempts < 10);
  }

  const distance = computeDistance(destSector, destSystem);
  const baseDuration = distance * 8;
  const speedMult = PROBE_LEVELS.speed.values[G.probe.speedIdx];
  const finalDuration = Math.round(baseDuration / speedMult);

  G.probe.state = 'mission';
  G.probe.mission = {
    destinationSector: destSector,
    destinationSystem: destSystem,
    destinationCoord: `${destSector}-${destSystem}`,
    returnAt: Date.now() + finalDuration * 1000,
    mode: G.probeMode,
  };

  toast(`Sonde lancée vers ${destSector}-${destSystem}`);
  startProbeTicker();
  renderProspectScreen();

  // Programmer le retour
  setTimeout(() => {
    completeProbeMission();
  }, finalDuration * 1000);
}

function completeProbeMission() {
  if (!G.probe.mission) return;
  const m = G.probe.mission;

  // Générer les planètes découvertes
  // Note : système legacy — pas de cluster source, donc Amas A par défaut
  const destCluster = m.destinationCluster || 'A';
  const discoveredPlanets = generateDiscoveredSystem(m.destinationSector, m.destinationSystem, destCluster);

  // Ajouter aux systèmes connus — format unifié W-X-YYYY
  const sysKey = `${destCluster}-${m.destinationSector}-${m.destinationSystem}`;
  if (!G.knownSystems[sysKey]) {
    G.knownSystems[sysKey] = {
      cluster: destCluster,
      sector: m.destinationSector,
      system: m.destinationSystem,
      planets: [],
      discoveredAt: Date.now(),
      isMine: false,
    };
  }
  G.knownSystems[sysKey].planets = discoveredPlanets;
  G.knownSystems[sysKey].discoveredAt = Date.now();

  // Marquer la sonde comme dispo + clear mission
  G.probe.state = 'ready';
  G.probe.mission = null;

  toast(`Sonde de retour · ${discoveredPlanets.length} planète${discoveredPlanets.length > 1 ? 's' : ''} dans ${sysKey}`);

  if (!document.getElementById('scr-prospect').classList.contains('hidden')) {
    renderProspectScreen();
  }
  if (!document.getElementById('scr-dashboard').classList.contains('hidden')) {
    renderDashboard();
  }
}

function generateDiscoveredSystem(sector, system, cluster) {
  // Génération alignée sur l'univers fixe (chap 16 du GDD) :
  //   • Les 3 slots planète sont déterministes via getPlanetSlotsInSystem()
  //   • Le type de chaque slot est déterministe via getPlanetTypeForSlot()
  //   • Les noms de joueurs restent pseudo-aléatoires (placeholder multi)
  cluster = cluster || 'A';
  const addrKey = { cluster, sector, system };
  const slots = getPlanetSlotsInSystem(addrKey);
  const sysKeyStr = `${cluster}-${sector}-${system}`;

  // PRNG dérivé du seed pour les détails non-déterministes (nom joueur, niveau)
  const seed = _hashSeed('discoverDetails:' + sysKeyStr);
  const rng = _mulberry32(seed);

  const planets = [];
  for (const slot of slots) {
    const typeNum = getPlanetTypeForSlot(addrKey, slot);
    const coord = `${sysKeyStr}-${String(slot).padStart(2, '0')}`;

    let pdata;
    if (typeNum === 2) {
      pdata = {
        name: 'Planète morte',
        type: 'dead',
        desc: 'Aucune activité thermique',
        report: makeReport('dead', sector, system, slot, null, null, cluster),
        reportRead: false,
        playerName: null,
      };
    } else if (typeNum === 4) {
      pdata = {
        name: 'Géante gazeuse',
        type: 'gas',
        desc: 'Atmosphère dense, non habitable',
        report: makeReport('gas', sector, system, slot, null, null, cluster),
        reportRead: false,
        playerName: null,
      };
    } else {
      // Type 3 : habitable → libre OU joueur placeholder (~20% joueurs)
      const r = rng();
      if (r <= 0.20 && mpIsTestZone(cluster, sector)) {
        // BOTS_1110 — commandant automate (même tirage pour tous les joueurs)
        const bk = _botPick(rng);
        const bp = BOT_PROFILES[bk];
        const bname = bp.names[Math.floor(rng() * bp.names.length)];
        pdata = {
          name: 'Monde automate',
          type: 'player',
          desc: `Commandant automate : ${bname} · Niv. ~${bp.level}`,
          report: makeReport('player', sector, system, slot, bname, bp.level, cluster),
          reportRead: false,
          playerName: bname,
          playerLevel: bp.level,
          isBot: true,
          botType: bk,
        };
      } else if (r > 0.20 || mpIsTestZone(cluster, sector)) {
        pdata = {
          name: 'Planète vide',
          type: 'empty',
          desc: 'Habitable, libre de toute occupation',
          report: makeReport('empty', sector, system, slot, null, null, cluster),
          reportRead: false,
          playerName: null,
        };
      } else {
        const fakeNames = ['ZERATH', 'BERSEK89', 'LYS-ORBITAL', 'ANUBIS34', 'XERATH', 'KORVUS-9'];
        const name = fakeNames[Math.floor(rng() * fakeNames.length)];
        const lvl = 100 + Math.floor(rng() * 1500);
        pdata = {
          name: 'Planète occupée',
          type: 'player',
          desc: `Joueur : ${name} · Niv. ~${lvl}`,
          report: makeReport('player', sector, system, slot, name, lvl, cluster),
          reportRead: false,
          playerName: name,
          playerLevel: lvl,
        };
      }
    }

    planets.push({
      coord: coord,
      cluster: cluster,
      sector: sector,
      system: system,
      index: slot,
      isMine: false,
      reportTimestamp: Date.now(),
      ...pdata,
    });
  }
  return planets;
}

function makeReport(type, sector, system, idx, playerName, playerLvl, cluster) {
  cluster = cluster || 'A';
  const sysCoord = `${cluster}-${sector}-${system}`;
  const planetCoord = `${sysCoord}-${String(idx).padStart(2, '0')}`;
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const reports = {
    dead: `
      <div class="report-head">
        <div class="report-title">Sonde ${G.probe.name}</div>
        <div class="report-meta">${planetCoord} · ${date}</div>
      </div>
      <div class="report-section">
        <div class="report-divider">— PLANÈTE INACTIVE —</div>
        Aucune activité thermique détectée.<br>
        Atmosphère absente. Surface stérile.<br>
        Recyclable à long terme — pas de menace.
      </div>
    `,
    gas: `
      <div class="report-head">
        <div class="report-title">Sonde ${G.probe.name}</div>
        <div class="report-meta">${planetCoord} · ${date}</div>
      </div>
      <div class="report-section">
        <div class="report-divider">— GÉANTE GAZEUSE —</div>
        Composition : <span class="report-data">hydrogène (84%) · hélium (15%)</span><br>
        Pression atmosphérique extrême.<br>
        Hélium-3 récupérable avec collecteurs orbitaux.
      </div>
    `,
    empty: `
      <div class="report-head">
        <div class="report-title">Sonde ${G.probe.name}</div>
        <div class="report-meta">${planetCoord} · ${date}</div>
      </div>
      <div class="report-section">
        <div class="report-divider">— PLANÈTE LIBRE —</div>
        Surface habitable. Atmosphère stable.<br>
        Aucune occupation détectée.<br>
        <span class="report-data">Colonisable</span> avec un Vaisseau Colonial.
      </div>
      <div class="report-section">
        Ressources estimées : <span class="report-data">métal abondant · eau</span>
      </div>
    `,
    player: `
      <div class="report-head">
        <div class="report-title">Sonde ${G.probe.name}</div>
        <div class="report-meta">${planetCoord} · ${date}</div>
      </div>
      <div class="report-section">
        <div class="report-divider">— SIGNAL ACTIF —</div>
        Joueur : <span class="report-data">${playerName}</span><br>
        Niveau planète estimé : <span class="report-data">~${playerLvl}</span><br>
        Défenses : <span class="report-warning">${playerLvl > 800 ? 'élevées' : 'modérées'}</span><br>
        ${playerLvl > 800 ? `<span class="report-warning" style="display:inline-flex;align-items:center;gap:5px">${icon('warning', {size:11, color:'#e87a7a'})} Approche déconseillée.</span>` : 'Cible viable pour raid coordonné.'}
      </div>
    `,
  };
  return reports[type] || reports.dead;
}
function startProbeTicker() {
  if (probeTicker) return;
  probeTicker = setInterval(() => {
    if (G.probe.state !== 'mission') {
      clearInterval(probeTicker);
      probeTicker = null;
      return;
    }
    const cd = document.getElementById('probe-countdown');
    if (cd && G.probe.mission) {
      const remaining = Math.max(0, Math.round((G.probe.mission.returnAt - Date.now()) / 1000));
      cd.textContent = formatTime(remaining);
    }
    if (!document.getElementById('scr-dashboard').classList.contains('hidden')) {
      const fleetBlock = document.getElementById('dash-fleet-block');
      if (fleetBlock && fleetBlock.querySelector('.val[style*="amber"]')) {
        renderDashboard();
      }
    }
  }, 1000);
}

/* ═══════════ UNIVERSE SCREEN ═══════════ */

function setUniverseTab(tab) {
  G.universeTab = tab;
  const sysBtn = document.getElementById('uni-subtab-systems');
  const listBtn = document.getElementById('uni-subtab-list');
  const playersBtn = document.getElementById('uni-subtab-players');
  if (sysBtn) sysBtn.classList.toggle('active', tab === 'systems');
  if (listBtn) listBtn.classList.toggle('active', tab === 'list');
  if (playersBtn) playersBtn.classList.toggle('active', tab === 'players');
  renderUniverseScreen();
}

function renderUniverseScreen() {
  // ═══════════════════════════════════════════════════════════════
  // PASSE 5.4 — Vue Univers à horizon
  // ═══════════════════════════════════════════════════════════════
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  // Cf. décision verrouillée #10, #16
  //
  // Le joueur voit :
  //   - Onglet "Par système" : ses systèmes connus (résolus ou avec signatures détectées)
  //   - Onglet "Carnet" : signatures inCarnet + adresses fixes verrouillées
  //
  // Les planètes non-découvertes restent invisibles. Au démarrage, seul
  // KERATH-VII est connu + 1 signature d'amorce.

  const sysCount = Object.keys(G.knownSystems).length;
  const planetCount = Object.values(G.knownSystems).reduce((s, sys) => s + sys.planets.length, 0);
  const sigCount = G.signatures ? Object.values(G.signatures).filter(s => !s.resolved).length : 0;
  // Cibles connues — univers mouvant (cf. ch.16 GDD)
  const knownTargets = G.knownTargets || {};
  const targetCount = Object.keys(knownTargets).length;

  // Header stats
  const statsEl = document.getElementById('prospect-universe-stats');
  if (statsEl) {
    const parts = [];
    parts.push(`${sysCount} système${sysCount > 1 ? 's' : ''}`);
    parts.push(`${planetCount} planète${planetCount > 1 ? 's' : ''} répertoriée${planetCount > 1 ? 's' : ''}`);
    if (sigCount > 0) parts.push(`${sigCount} signature${sigCount > 1 ? 's' : ''}`);
    if (targetCount > 0) parts.push(`${targetCount} cible${targetCount > 1 ? 's' : ''}`);
    statsEl.innerHTML = parts.join(' <span class="dot" style="margin:0 6px"></span> ');
  }

  const content = document.getElementById('universe-content');
  if (!content) return;

  if (G.universeTab === 'systems') {
    // ─── Vue PAR SYSTÈME ───
    // Affiche les systèmes connus avec leurs planètes découvertes
    // ET les signatures non-résolues du système

    // Grouper les systèmes par secteur
    const bySector = {};
    for (const sys of Object.values(G.knownSystems)) {
      if (!bySector[sys.sector]) bySector[sys.sector] = [];
      bySector[sys.sector].push(sys);
    }

    // PASSE 5.4 fix — Cibles mouvantes retirées d'ici :
    // accessibles via le Carnet (chaque signature résolue mouvante a son bouton 🚛 Tanker)
    // Évite la friction "épave d'astronef léger" sans contexte ni action.

    const sectorNames = Object.keys(bySector).sort();
    if (sectorNames.length === 0 && sigCount === 0) {
      content.innerHTML = `<div class="empty-line">Univers inexploré. Envoie une sonde Radar pour commencer.</div>`;
      return;
    }

    const sectorsHtml = sectorNames.map(sector => {
      const systems = bySector[sector].sort((a, b) => a.system - b.system);
      return `
        <div class="uni-sector">
          <div class="uni-sector-head">SECTEUR ${sector}</div>
          ${systems.map(sys => renderSystemCardWithSignatures(sys)).join('')}
        </div>
      `;
    }).join('');

    content.innerHTML = sectorsHtml;
  } else if (G.universeTab === 'players') {
    // ─── Vue JOUEURS (passe 16/05 — vision joueurs connus) ───
    // Liste tous les joueurs connus (planètes occupées détectées),
    // pour les retrouver vite sans fouiller les secteurs.
    content.innerHTML = renderKnownPlayersView();
  } else {
    // ─── Vue CARNET (passe 5.4) ───
    // Affiche : signatures inCarnet + adresses fixes verrouillées
    content.innerHTML = renderCarnetView();
  }
}

// ─── PASSE 5.4 — Rendu carte système avec signatures ───
// Affiche les planètes connues du système + signatures non-résolues
function renderSystemCardWithSignatures(sys) {
  const sysAddress = `${sys.cluster}-${sys.sector}-${sys.system}`;
  const isMine = sys.isMine;

  // PASSE 5.4 fix — État accordéon : un seul système ouvert à la fois
  // Par défaut le système du joueur est ouvert, les autres fermés.
  if (G.expandedSystem === undefined) {
    G.expandedSystem = isMine ? sysAddress : null;
    // Note : pour le tout premier render, on initialise dès qu'on voit "mon" système
  }
  const isExpanded = G.expandedSystem === sysAddress;

  // Trouver les signatures non-résolues de ce système
  const sysSignatures = G.signatures
    ? Object.values(G.signatures).filter(s => s.system === sysAddress && !s.resolved)
    : [];

  // Header : adresse système + badge
  const myBadge = isMine
    ? `<span style="font-size:9px;background:rgba(95,255,232,.15);color:#5fffe8;padding:2px 8px;border-radius:4px;letter-spacing:.06em">MON SYSTÈME</span>`
    : '';

  // PASSE 5.7 — Jauge de résolution du système (toujours visible)
  const resolution = (typeof getSystemResolution === 'function')
    ? getSystemResolution(sysAddress)
    : 0;
  let resColor = 'var(--mut)';
  if (resolution >= 100) resColor = '#5fffe8';
  else if (resolution >= 70) resColor = '#9a8aff';
  else if (resolution >= 30) resColor = '#a0c8ff';

  // PASSE 5.6 — Indicateur météo cosmique
  const weatherNoise = (typeof getSystemWeather === 'function') ? getSystemWeather(sysAddress) : 0;
  const weatherCat = (typeof getWeatherCategory === 'function') ? getWeatherCategory(weatherNoise) : null;
  const weatherInline = weatherCat
    ? `<span style="font-size:9px;color:${weatherCat.color};letter-spacing:.04em">${weatherCat.icon} ${weatherCat.label}</span>`
    : '';

  // Indicateurs compacts pour le header fermé
  const sigCountForHeader = sysSignatures.length;
  const planetCount = sys.planets.length;
  const chevron = isExpanded ? '▲' : '▼';

  // ─── Header (toujours visible, cliquable pour toggle) ───
  // Quand ouvert : background plus marqué pour bien séparer du contenu suivant
  const headerHtml = `
    <div onclick="toggleSystemExpanded('${sysAddress}')" style="cursor:pointer;padding:12px 14px;background:rgba(95,255,232,${isExpanded ? '.08' : '.03'});border-bottom:${isExpanded ? '1px solid var(--border)' : '0'};display:flex;align-items:center;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-family:'SF Mono',monospace;font-size:14px;color:#5fffe8;letter-spacing:.06em">${sysAddress}</span>
          ${myBadge}
        </div>
        <!-- Jauge résolution compacte -->
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:2px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${resolution}%;background:${resColor};transition:width .35s ease"></div>
          </div>
          <span style="font-size:10px;color:${resColor};font-family:'SF Mono',monospace;flex-shrink:0">${resolution}%</span>
        </div>
        <!-- Méta compacte : météo + compteurs -->
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;font-size:9px;color:var(--mut);letter-spacing:.04em">
          ${weatherInline}
          ${planetCount > 0 ? `<span>${planetCount} planète${planetCount > 1 ? 's' : ''}</span>` : ''}
          ${sigCountForHeader > 0 ? `<span style="color:#5fffe8">${sigCountForHeader} signature${sigCountForHeader > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <div style="flex-shrink:0;color:var(--mut);font-size:11px;padding:4px 8px">${chevron}</div>
    </div>
  `;

  // ─── Contenu détaillé (visible seulement si ouvert) ───
  let detailHtml = '';
  if (isExpanded) {
    // Lignes planètes
    const planetsHtml = sys.planets.map(p => {
      const slotLabel = String(p.index).padStart(2, '0');
      let stateBadge = '';
      if (p.isMine) {
        stateBadge = `<span style="font-size:9px;background:rgba(95,255,232,.10);color:#5fffe8;padding:1px 8px;border-radius:4px;letter-spacing:.06em;border:1px solid #5fffe860">MOI</span>`;
      } else if (p.type === 'dead') {
        stateBadge = `<span style="font-size:9px;background:rgba(120,120,120,.15);color:var(--mut);padding:1px 8px;border-radius:4px;letter-spacing:.06em">MORTE</span>`;
      } else if (p.type === 'gas') {
        stateBadge = `<span style="font-size:9px;background:rgba(154,138,255,.15);color:#9a8aff;padding:1px 8px;border-radius:4px;letter-spacing:.06em">GAZ</span>`;
      } else if (p.type === 'lunar') {
        stateBadge = `<span style="font-size:9px;background:rgba(180,180,180,.10);color:#888;padding:1px 8px;border-radius:4px;letter-spacing:.06em">LUNE</span>`;
      } else if (p.type === 'habitable') {
        // Distinguer libre vs occupée par un joueur (feedback V3 16/05 #6)
        if (p.playerName) {
          stateBadge = `<span style="font-size:9px;background:rgba(255,138,138,.15);color:#ff8a8a;padding:1px 8px;border-radius:4px;letter-spacing:.06em">${_escapeHtml(p.playerName)}</span>`;
        } else {
          stateBadge = `<span style="font-size:9px;background:rgba(255,200,100,.15);color:#ffc864;padding:1px 8px;border-radius:4px;letter-spacing:.06em">LIBRE</span>`;
        }
      }

      return `
        <div onclick="openPlanetDetail('${p.coord}')" style="display:flex;align-items:flex-start;gap:14px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer">
          <div style="flex-shrink:0;font-family:'SF Mono',monospace;font-size:10px;color:#5fffe8;letter-spacing:.04em;width:90px">${sysAddress}-${slotLabel}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);line-height:1.3">${getPlanetDisplayName(p)}</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${p.desc}</div>
          </div>
          <div style="flex-shrink:0">${stateBadge}</div>
        </div>
      `;
    }).join('');

    // Lignes signatures
    const sigsHtml = sysSignatures.map(sig => {
      const carnetBadge = sig.inCarnet
        ? `<span style="font-size:8px;background:rgba(160,200,255,.15);color:#a0c8ff;padding:1px 6px;border-radius:3px;letter-spacing:.06em;margin-left:6px">CARNET</span>`
        : '';
      return `
        <div style="display:flex;align-items:flex-start;gap:14px;padding:10px 12px;border-bottom:1px solid var(--border);background:rgba(95,255,232,.03)">
          <div style="flex-shrink:0;font-family:'SF Mono',monospace;font-size:11px;color:#5fffe8;letter-spacing:.04em;width:90px">${sig.id}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:var(--text);line-height:1.3;font-style:italic">${sig.typeLabel} · ${sig.intensity}</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${sig.interpretation} · ${sig.position}</div>
          </div>
          <div style="flex-shrink:0;font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase">Signature${carnetBadge}</div>
        </div>
      `;
    }).join('');

    // Footer : indication corps non identifiés
    const totalSlots = (typeof getAllCelestialSlotsInSystem === 'function')
      ? getAllCelestialSlotsInSystem({ cluster: sys.cluster, sector: sys.sector, system: sys.system }).length
      : 3;
    let incompleteHtml = '';
    if (sys.planets.length < totalSlots) {
      const missing = totalSlots - sys.planets.length;
      incompleteHtml = `
        <div style="padding:8px 12px;font-size:10px;color:var(--mut);font-style:italic;text-align:center">
          ${missing} corps orbital${missing > 1 ? 'aux' : ''} non identifié${missing > 1 ? 's' : ''} · sondes requises
        </div>
      `;
    }

    detailHtml = planetsHtml + sigsHtml + incompleteHtml;
  }

  return `
    <div class="uni-sys" style="border:1px solid var(--border);border-radius:8px;margin:0 16px 10px;overflow:hidden">
      ${headerHtml}
      ${detailHtml}
    </div>
  `;
}

// PASSE 5.4 fix — Toggle accordéon des systèmes
// Si on clique sur le système déjà ouvert, on le ferme.
// Sinon on ouvre le nouveau (et ferme implicitement l'ancien).
function toggleSystemExpanded(sysAddress) {
  if (G.expandedSystem === sysAddress) {
    G.expandedSystem = null;
  } else {
    G.expandedSystem = sysAddress;
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── PASSE 16/05 — Vue Joueurs ───
// Affiche tous les joueurs connus (planètes occupées détectées via sonde ou cheat),
// pour retrouver vite un joueur sans fouiller secteur par secteur.
function renderKnownPlayersView() {
  // Collecter toutes les planètes joueur de G.knownSystems
  const playerPlanets = [];
  for (const sys of Object.values(G.knownSystems || {})) {
    for (const p of (sys.planets || [])) {
      if (p.playerName && !p.isMine) {
        playerPlanets.push(p);
      }
    }
  }

  if (playerPlanets.length === 0) {
    return mpAllyCardHtml() + sbEmpStatusHtml() + `
      <div style="padding:40px 24px;text-align:center;color:var(--mut);font-size:12px;line-height:1.7">
        <div style="font-size:32px;opacity:.4;margin-bottom:12px;display:flex;align-items:center;justify-content:center">${icon('shield', {size:32})}</div>
        <div style="font-style:italic">Aucun joueur connu.</div>
        <div style="font-size:10px;margin-top:8px;opacity:.7">Sonde une planète habitée pour la lister ici.</div>
      </div>
    `;
  }

  // Trier par niveau de joueur descendant (les plus puissants en haut)
  playerPlanets.sort((a, b) => (b.playerLevel || 0) - (a.playerLevel || 0));

  const rows = playerPlanets.map(p => {
    const lvl = p.playerLevel ? `niv. ${p.playerLevel}` : 'niveau inconnu';
    const planetName = p.name || 'monde sans nom';
    return `
      <div onclick="openPlanetDetail('${p.coord}')" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:rgba(220,80,80,.03)">
        <div style="flex-shrink:0;width:38px;height:38px;border-radius:50%;background:rgba(220,80,80,.10);border:1px solid rgba(220,80,80,.30);display:flex;align-items:center;justify-content:center;color:#ff8a8a">
          ${icon('shield', {size:18})}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;color:#ff8a8a;font-weight:500;line-height:1.2">${_escapeHtml(p.playerName)}${mpAllyBadge(p.mpAddress || p.coord)}${sbWantedBadge(p.mpAddress || p.coord)}</div>
          <div style="font-size:10px;color:var(--mut);margin-top:3px;font-family:'SF Mono',monospace"><span onclick="event.stopPropagation();openPlanetOnMap('${p.coord}')" title="Voir sur la carte" style="color:var(--cyan);cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${p.coord}</span> · ${_escapeHtml(planetName)} · ${lvl}</div>
        </div>
        <div style="flex-shrink:0;color:var(--mut)">${icon('chevronRight', {size:14})}</div>
      </div>
    `;
  }).join('');

  return mpAllyCardHtml() + sbEmpStatusHtml() + `
    <div style="padding:8px 0 12px;font-size:10px;color:var(--mut);letter-spacing:.10em;text-transform:uppercase;text-align:center">
      ${playerPlanets.length} joueur${playerPlanets.length > 1 ? 's' : ''} connu${playerPlanets.length > 1 ? 's' : ''}
    </div>
    ${rows}
    <div style="padding:14px 18px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">
      Touche un joueur pour ouvrir sa fiche planète. Tu peux y envoyer un tanker — pour le commerce, le don, ou ouvrir un canal de contact. Aucun joueur n'est un ennemi par défaut.
    </div>
  `;
}

// ─── PASSE 5.4 — Vue Carnet ───
// Affiche : signatures inCarnet + adresses fixes verrouillées
function renderCarnetView() {
  const signatures = G.signatures || {};
  // Signatures suivies (inCarnet + résolues, ce qui mérite suivi)
  // 10/10/2026 — choix explicite du joueur (décision #15) : inCarnet,
  // ou adresse verrouillée par Moyenne (permanente).
  const carnetSigs = Object.values(signatures).filter(s => s.inCarnet || (s.resolved && s.fixedAddress));

  // ─── Joueurs connus : parcourir G.knownSystems et collecter les planètes
  // avec playerName non-null (autres joueurs détectés/cheat) ───
  const knownPlayers = [];
  if (G.knownSystems) {
    for (const sysKey in G.knownSystems) {
      const sys = G.knownSystems[sysKey];
      if (!sys.planets) continue;
      for (const p of sys.planets) {
        if (p.playerName && !p.isMine) {
          knownPlayers.push(p);
        }
      }
    }
  }
  // Tri : par niveau décroissant
  knownPlayers.sort((a, b) => (b.playerLevel || 0) - (a.playerLevel || 0));

  // Section "Joueurs connus" — toujours en haut du Carnet
  let playersSection = '';
  if (knownPlayers.length > 0) {
    const playerRows = knownPlayers.map(p => {
      const lvl = p.playerLevel || '—';
      const ptype = PLANET_TYPES[p.type];
      const ptypeLabel = ptype?.label || p.type || '';
      return `
        <div onclick="openPlanetDetail('${p.coord}')" style="padding:12px 14px;border:1px solid rgba(255,138,138,.30);border-radius:8px;margin:0 16px 8px;background:rgba(50,15,15,.15);cursor:pointer">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;color:#ff8a8a;font-weight:600;letter-spacing:.04em">${_escapeHtml(p.playerName)}</span>
            <span style="font-size:9px;color:var(--mut);font-family:'SF Mono',monospace">Niv. ${lvl}</span>
          </div>
          <div style="font-size:11px;color:var(--text);margin-bottom:2px">${_escapeHtml(p.name || p.coord)}</div>
          <div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace"><span onclick="event.stopPropagation();openPlanetOnMap('${p.coord}')" title="Voir sur la carte" style="color:var(--cyan);cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${p.coord}</span> · ${ptypeLabel}</div>
        </div>
      `;
    }).join('');
    playersSection = `
      <div style="padding:12px 16px 6px;font-size:10px;color:#ff8a8a;letter-spacing:.1em;text-transform:uppercase;opacity:.8">
        ${knownPlayers.length} joueur${knownPlayers.length > 1 ? 's' : ''} connu${knownPlayers.length > 1 ? 's' : ''}
      </div>
      ${playerRows}
    `;
  }

  if (carnetSigs.length === 0 && knownPlayers.length === 0) {
    return `
      <div style="padding:40px 24px;text-align:center;color:var(--mut);font-size:12px;line-height:1.7">
        <div style="font-size:32px;opacity:.4;margin-bottom:12px;display:flex;align-items:center;justify-content:center">${icon('fileText', {size:32})}</div>
        <div style="font-style:italic">Carnet vide.</div>
        <div style="font-size:10px;margin-top:8px;opacity:.7">Marque les signatures que tu veux suivre depuis tes rapports.</div>
      </div>
    `;
  }

  if (carnetSigs.length === 0) {
    // Pas de signatures, mais joueurs présents → afficher uniquement la section joueurs
    return playersSection;
  }

  // Trier : résolues d'abord, puis non-résolues, puis par date
  carnetSigs.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? -1 : 1;
    return (b.detectedAt || 0) - (a.detectedAt || 0);
  });

  const rows = carnetSigs.map(sig => {
    let statusLine = '';
    let actionLine = '';
    // Chunk polish 15/05 : bouton Retirer dans le carnet (fix bug "ajoute au lieu de retirer")
    // - Si signature résolue : suppression définitive (avec confirm) via onCarnetRemoveResolved
    //   (sinon flip inCarnet ne marche pas — la sig reste visible car résolue)
    // - Si signature non résolue : flip inCarnet (peut être remise par la suite)
    const removeBtnHtml = sig.resolved
      ? `<button onclick="onCarnetRemoveResolved('${sig.id}')" style="background:transparent;border:1px solid var(--border);color:var(--mut);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:inherit">Retirer</button>`
      : `<button onclick="onSignatureCarnetToggle('${sig.id}')" style="background:transparent;border:1px solid var(--border);color:var(--mut);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:inherit">Retirer</button>`;

    if (!sig.resolved) {
      // ─── Signature non résolue ───
      const ageMs = Date.now() - (sig.detectedAt || Date.now());
      const ageH = Math.floor(ageMs / (60 * 60 * 1000));
      const ageD = Math.floor(ageH / 24);
      const ageLabel = ageD > 0 ? `${ageD}j` : (ageH > 0 ? `${ageH}h` : 'récent');
      statusLine = `<div style="font-size:10px;color:var(--mut);margin-top:2px">${sig.typeLabel} · ${sig.intensity} · <span style="font-family:'SF Mono',monospace">${sig.system}</span> · ${ageLabel}</div>`;
      actionLine = `
        <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end;align-items:center">
          <button onclick="onCarnetLaunchProbe('${sig.id}','light')" style="background:rgba(95,204,138,.10);border:1px solid #5fcc8a60;color:#5fcc8a;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('satellite', {size:10})} Légère</button>
          ${removeBtnHtml}
        </div>
      `;
    } else if (sig.resolvedType === 'moving') {
      // ─── Signature résolue mouvante ───
      const kt = G.knownTargets && G.knownTargets[sig.movingCoordKey];
      const inEngaged = kt?.status === 'engaged';
      const consumed = !kt; // cible déjà exploitée par un tanker (supprimée de knownTargets)
      let statusBadge;
      if (consumed)       statusBadge = `<span style="color:var(--mut);display:inline-flex;align-items:center;gap:4px">${icon('check', {size:11})} Cible exploitée</span>`;
      else if (inEngaged) statusBadge = `<span style="color:#ffc864">${icon('tanker', {size:12})} Tanker en route</span>`;
      else                statusBadge = `<span style="color:#ffc864">Cible exploitable</span>`;
      statusLine = `
        <div style="font-size:10px;color:var(--mut);margin-top:2px">${sig.typeLabel}</div>
        <div style="font-family:'SF Mono',monospace;font-size:11px;color:${consumed ? 'var(--mut)' : '#ffc864'};margin-top:4px;letter-spacing:.04em;${consumed ? 'text-decoration:line-through;opacity:.6' : ''}">${sig.movingCoordKey}</div>
        <div style="font-size:10px;margin-top:4px">${statusBadge}</div>
      `;
      // Actions selon état : Voir + (Tanker si applicable) + Retirer
      // Le bouton Voir ouvre la fiche cible mouvante (passe 5.4 fix #8)
      const viewBtn = `<button onclick="openMovingTargetDetail('${sig.movingCoordKey}')" style="background:rgba(255,200,100,.10);border:1px solid #ffc86460;color:#ffc864;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('map', {size:12})} Voir</button>`;
      const removeBtn = removeBtnHtml;
      if (consumed) {
        actionLine = `
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end">
            ${viewBtn}
            ${removeBtn}
          </div>
        `;
      } else if (!inEngaged) {
        const tankerBtn = `<button onclick="onTankerKnownTargetClick('${sig.movingCoordKey}')" style="background:rgba(255,200,100,.12);border:1px solid #ffc864;color:#ffc864;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('tanker', {size:12})} Tanker</button>`;
        actionLine = `
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end">
            ${viewBtn}
            ${tankerBtn}
            ${removeBtn}
          </div>
        `;
      } else {
        actionLine = `
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end">
            ${viewBtn}
            ${removeBtn}
          </div>
        `;
      }
    } else if (sig.resolvedType === 'fixed') {
      // ─── Signature résolue fixe ───
      const fixedClassLabel = {
        dead_world: 'Monde mort',
        gas_giant:  'Planète gazeuse',
        habitable:  'Habitable',
        lunar:      'Lune stérile',
        unknown:    'Classe indéterminée',
      };
      if (sig.fixedAddress) {
        // Verrouillée : adresse révélée
        statusLine = `
          <div style="font-size:10px;color:var(--mut);margin-top:2px">${fixedClassLabel[sig.fixedClass] || 'Corps orbital'}</div>
          <div style="font-family:'SF Mono',monospace;font-size:11px;color:#5fffe8;margin-top:4px;letter-spacing:.04em">${sig.fixedAddress}</div>
          <div style="font-size:10px;color:#5fffe8;margin-top:4px;display:flex;align-items:center;gap:5px">${icon('check', {size:11, color:'#5fffe8'})} Adresse verrouillée</div>
        `;
        // Action : voir le corps céleste + retirer
        actionLine = `
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end">
            <button onclick="openPlanetDetail('${sig.fixedAddress}')" style="background:rgba(95,255,232,.10);border:1px solid #5fffe860;color:#5fffe8;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px">${icon('map', {size:10})} Voir</button>
            ${removeBtnHtml}
          </div>
        `;
      } else {
        // Identifiée mais pas encore verrouillée
        statusLine = `
          <div style="font-size:10px;color:var(--mut);margin-top:2px">${fixedClassLabel[sig.fixedClass] || 'Corps orbital'} · <span style="font-family:'SF Mono',monospace">${sig.system}</span></div>
          <div style="font-size:10px;color:#ffc864;margin-top:4px;font-style:italic">→ Sonde Moyenne requise pour verrouiller</div>
        `;
        // Action : envoyer Moyenne + retirer
        actionLine = `
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end">
            <button onclick="onCarnetLaunchProbe('${sig.id}','medium')" style="background:rgba(154,138,255,.10);border:1px solid #9a8aff60;color:#9a8aff;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit">${icon('satellite', {size:10})} Moyenne</button>
            ${removeBtnHtml}
          </div>
        `;
      }
    }

    return `
      <div id="carnet-sig-${sig.id}" onclick="if(!event.target.closest('button'))openSigOnMap('${sig.id}')" style="padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin:0 16px 8px;background:var(--bg-soft);cursor:pointer">
        <div style="display:flex;align-items:baseline;justify-content:space-between">
          <span style="font-family:'SF Mono',monospace;font-size:13px;color:#5fffe8;letter-spacing:.06em">${sig.id} <span style="font-family:inherit;font-size:10px;color:var(--mut);letter-spacing:.04em">carte →</span></span>
          ${sig.resolved
            ? (sig.resolvedType === 'moving'
                ? `<span style="font-size:8px;background:rgba(255,200,100,.15);color:#ffc864;padding:1px 6px;border-radius:3px;letter-spacing:.06em">RÉSOLUE</span>`
                : (sig.fixedAddress
                    ? `<span style="font-size:8px;background:rgba(95,255,232,.15);color:#5fffe8;padding:1px 6px;border-radius:3px;letter-spacing:.06em">VERROUILLÉE</span>`
                    : `<span style="font-size:8px;background:rgba(255,200,100,.15);color:#ffc864;padding:1px 6px;border-radius:3px;letter-spacing:.06em">IDENTIFIÉE</span>`
                  )
              )
            : `<span style="font-size:8px;background:rgba(160,200,255,.15);color:#a0c8ff;padding:1px 6px;border-radius:3px;letter-spacing:.06em">SUIVIE</span>`
          }
        </div>
        ${statusLine}
        ${actionLine}
      </div>
    `;
  }).join('');

  return `
    ${playersSection}
    <div style="padding:12px 16px;font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">
      ${carnetSigs.length} signature${carnetSigs.length > 1 ? 's' : ''} suivie${carnetSigs.length > 1 ? 's' : ''}
    </div>
    ${rows}
    <div style="margin:4px 16px 12px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">Les adresses verrouillées et les joueurs connus sont proposés comme cibles à l'envoi d'une flotte.</div>
  `;
}

// ─── 10/10/2026 — Ouvre le carnet (Centre de prospection › Carte › Carnet)
// et fait défiler jusqu'à la signature demandée.
function openCarnetAddresses(signatureId) {
  G.universeTab = 'list';
  openProspectAtTab('univers');
  setTimeout(() => {
    if (typeof setUniverseTab === 'function') setUniverseTab('list');
    const el = signatureId ? document.getElementById('carnet-sig-' + signatureId) : document.getElementById('universe-content');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (signatureId) {
      el.style.transition = 'box-shadow .4s';
      el.style.boxShadow = '0 0 0 1px #a0c8ff, 0 0 18px rgba(160,200,255,.35)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1800);
    }
  }, 160);
}

// ─── 10/10/2026 — Ligne « carnet » d'un rapport de signature résolue :
// état (dans le carnet / pas encore) + action (Ajouter / Ouvrir le carnet).
function carnetRowForSignature(signatureId) {
  const sig = G.signatures && G.signatures[signatureId];
  if (!sig) return '';
  const btn = "font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px";
  if (sig.inCarnet) {
    return `
      <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span style="font-size:10px;color:#a0c8ff;display:inline-flex;align-items:center;gap:5px">${icon('check', {size:11, color:'#a0c8ff'})} Dans le carnet</span>
        <button onclick="event.stopPropagation();openCarnetAddresses('${sig.id}')" style="${btn};background:rgba(160,200,255,.10);border:1px solid #a0c8ff60;color:#a0c8ff">${icon('fileText', {size:11})} Ouvrir le carnet</button>
      </div>`;
  }
  return `
      <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span style="font-size:10px;color:var(--mut);font-style:italic">Pas encore dans le carnet</span>
        <button onclick="event.stopPropagation();onSignatureCarnetToggle('${sig.id}')" style="${btn};background:rgba(160,200,255,.12);border:1px solid #a0c8ff;color:#a0c8ff">${icon('fileText', {size:11})} Ajouter au carnet</button>
      </div>`;
}

// Rend la section "Cibles connues" de l'écran Univers (univers mouvant)
// Cf. starbyte_gdd_v1/16_deux_univers.md
function renderKnownTargetsSection(targets) {
  const entries = Object.entries(targets);
  // Tri : disponibles d'abord, puis engagées ; intra-groupe par récence
  entries.sort((a, b) => {
    const aEng = a[1].status === 'engaged' ? 1 : 0;
    const bEng = b[1].status === 'engaged' ? 1 : 0;
    if (aEng !== bEng) return aEng - bEng;
    return (b[1].discoveredAt || 0) - (a[1].discoveredAt || 0);
  });

  // Comptage tankers dispo (pour griser le bouton si aucun)
  const stat = G.fleet?.stationed || {};
  const totalTankers = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
  const inMission = (G.tankerMissions || []).filter(m => m.status === 'in_transit' || m.status === 'returning').length;
  const availableTankers = tankerAvailability(null);

  const rows = entries.map(([coord, t]) => {
    const icon = t.icon || '◆';
    const label = t.label || 'Cible inconnue';
    const isEngaged = t.status === 'engaged';
    let lootHint = '';
    if (t.lootEstimate) {
      lootHint = `<div style="font-size:9px;color:var(--mut);margin-top:2px">~${t.lootEstimate.min}-${t.lootEstimate.max} ${t.lootEstimate.resource}</div>`;
    }
    const ageMs = Date.now() - (t.discoveredAt || Date.now());
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const ttlDays = Math.max(0, Math.ceil(((t.expiresAt || 0) - Date.now()) / (24 * 60 * 60 * 1000)));
    const ageLabel = ageDays === 0 ? 'auj.' : ageDays === 1 ? 'hier' : `${ageDays}j`;
    const ttlLabel = ttlDays <= 1 ? 'expire bientôt' : `expire ${ttlDays}j`;

    // ─── État engagée : retour du tanker, ETA visible ───
    let footerHtml;
    if (isEngaged) {
      // Retrouver la mission tanker associée
      const mission = (G.tankerMissions || []).find(m => m.id === t.tankerMissionId);
      let etaHtml = '<span style="color:var(--mut)">tanker en route</span>';
      if (mission) {
        const remainingMs = Math.max(0, mission.arrivalAt - Date.now());
        const remainingSec = Math.floor(remainingMs / 1000);
        const remainingTxt = remainingSec < 60
          ? `${remainingSec}s`
          : remainingSec < 3600
            ? `${Math.floor(remainingSec / 60)}min ${remainingSec % 60}s`
            : `${Math.floor(remainingSec / 3600)}h${Math.floor((remainingSec % 3600) / 60).toString().padStart(2, '0')}`;
        etaHtml = `<span style="color:#ffc864">${mission.tankerName} · retour ${remainingTxt}</span>`;
      }
      footerHtml = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:10px;display:flex;align-items:center;justify-content:space-between">
          <span style="color:var(--mut);font-style:italic;display:inline-flex;align-items:center;gap:5px">${icon('tanker', {size:11})} Engagée</span>
          ${etaHtml}
        </div>
      `;
    } else {
      const canSend = availableTankers > 0;
      const btnStyle = canSend
        ? `background:rgba(255,200,100,.12);border:1px solid #ffc864;color:#ffc864;cursor:pointer`
        : `background:transparent;border:1px solid var(--border);color:var(--mut);cursor:not-allowed;opacity:.5`;
      const tipText = canSend
        ? `Envoyer un tanker (durée 5-10 min)`
        : `Aucun tanker disponible`;
      footerHtml = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);text-align:right">
          <button ${canSend ? `onclick="onTankerKnownTargetClick('${coord}')"` : 'disabled'} style="${btnStyle};font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:6px;font-family:inherit" title="${tipText}">
            ${icon('tanker', {size:12})} Envoyer un tanker
          </button>
        </div>
      `;
    }

    // Style global selon état
    const containerStyle = isEngaged
      ? `display:flex;flex-direction:column;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:rgba(60,60,60,.15);opacity:.7`
      : `display:flex;flex-direction:column;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:rgba(255,200,100,.04)`;

    return `
      <div style="${containerStyle}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:20px;line-height:1;flex-shrink:0">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:var(--text);line-height:1.3">${label}</div>
            <div style="font-size:10px;color:#ffc864;font-family:'SF Mono',monospace;letter-spacing:.04em;margin-top:2px">${coord}</div>
            ${lootHint}
          </div>
          <div style="font-size:9px;color:var(--mut);flex-shrink:0;text-align:right;line-height:1.4">
            <div>${ageLabel}</div>
            <div style="color:${ttlDays <= 1 ? 'var(--red)' : 'var(--mut)'};opacity:.8">${ttlLabel}</div>
          </div>
        </div>
        ${footerHtml}
      </div>
    `;
  }).join('');

  // En-tête : compte des tankers disponibles si au moins une cible dispo
  const availableCount = entries.filter(([, t]) => t.status !== 'engaged').length;
  const headerInfo = availableCount > 0
    ? `<span style="color:${availableTankers > 0 ? 'var(--mut)' : 'var(--red)'};text-transform:none;letter-spacing:0;font-size:10px">${icon('tanker', {size:12})} ${availableTankers} tanker${availableTankers > 1 ? 's' : ''} dispo</span>`
    : '';

  return `
    <div style="margin:0 16px 14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:8px 0">
        <div style="font-size:10px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase">
          Cibles connues
        </div>
        ${headerInfo}
      </div>
      ${rows}
      <div style="font-size:9px;color:var(--mut);margin-top:6px;font-style:italic;line-height:1.4">
        Les cibles disparaissent après 7 jours ou quand un tanker les exploite. Re-sonde une zone pour découvrir de nouvelles cibles.
      </div>
    </div>
  `;
}

// Handler clic "Envoyer un tanker" depuis section Univers
function onTankerKnownTargetClick(coordKey) {
  const mission = launchTankerToKnownTarget(coordKey);
  if (mission) {
    // Re-render écran Univers pour montrer l'état "engagée"
    if (typeof renderUniverseScreen === 'function') renderUniverseScreen();
    // Re-render écran Prospect aussi si visible
    if (typeof renderProspectRapports === 'function') renderProspectRapports();
  }
}

function renderSystemCard(sys) {
  const isMine = sys.isMine;
  // Format unifié W-X-YYYY (cluster fallback 'A' pour anciennes saves)
  const cluster = sys.cluster || 'A';
  const sysKey = `${cluster}-${sys.sector}-${sys.system}`;
  const ago = isMine ? '' : timeAgo(sys.discoveredAt);
  return `
    <div class="uni-system ${isMine ? 'mine' : ''}">
      <div class="uni-system-head">
        <span class="uni-system-id">${sysKey}</span>
        <span class="uni-system-meta">${isMine ? 'MON SYSTÈME' : 'Sondé ' + ago}</span>
      </div>
      ${sys.planets.map(p => renderPlanetEntry(p, false)).join('')}
    </div>
  `;
}
