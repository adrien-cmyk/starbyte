/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Skills des bâtiments (16/10/2026, retour joueur : « pas clair comment les obtenir »)
   Décisions d'Adrien (16/10) :
   · le TIER du bâtiment rend le skill « Disponible » ; on l'APPREND (coût + courte recherche), depuis la fiche du
     bâtiment ou depuis l'arbre technologique ;
   · le match-3 du Labo et de la Centrale peut en faire DÉCOUVRIR un gratuitement (bloc scellé cassé) ;
   · l'arbre technologique devient VIVANT : chaque famille montre ses skills, leur état et le bouton Apprendre.
   Règle : un skill listé ici a un effet réel dans le jeu (production, match-3, durées, défense).
   API : window.SBSkills — has, prodMult, m3Mult, durMult, defense, learn, grant, dropPool, buildingHtml, familyHtml…
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SBSkills) return;

  // fx : prod (production passive, par ressource ou all), m3 (gains du match-3), dur (durées : build, troops, ships, probes),
  //      def (défense : flat, pct, soldiers)
  const SKILLS = [
    // Extraction — Mine
    { key: 'forage',      b: 'mine',       tier: 1, name: 'Forage profond',        icon: 'pickaxe',   effect: '+25 % de métal gagné au match-3', fx: { m3: { metal: 0.25 } } },
    { key: 'strates',     b: 'mine',       tier: 2, name: 'Strates profondes',     icon: 'pickaxe',   effect: '+15 % de production passive de métal', fx: { prod: { metal: 0.15 } } },
    { key: 'nano',        b: 'mine',       tier: 3, name: 'Nano-extraction',       icon: 'pickaxe',   effect: '+25 % de production passive de métal (cumulé avec Strates : +40 %)', req: 'strates', fx: { prod: { metal: 0.25 } } },
    // Énergie — Centrale
    { key: 'cellules',    b: 'centrale',   tier: 1, name: 'Cellules solaires',     icon: 'zap',       effect: '+15 % de production passive d\'énergie', fx: { prod: { energie: 0.15 } } },
    { key: 'supra',       b: 'centrale',   tier: 2, name: 'Supraconducteurs',      icon: 'zap',       effect: 'Chantiers et améliorations de bâtiments 15 % plus rapides', req: 'cellules', fx: { dur: { build: 0.15 } } },
    { key: 'fission',     b: 'centrale',   tier: 3, name: 'Fission contrôlée',     icon: 'zap',       effect: '+30 % d\'énergie gagnée au match-3', fx: { m3: { energie: 0.30 } } },
    // Recherche — Laboratoire
    { key: 'cristallo',   b: 'labo',       tier: 1, name: 'Cristallographie',      icon: 'gem',       effect: '+25 % de cristal gagné au match-3', fx: { m3: { cristal: 0.25 } } },
    { key: 'analyse',     b: 'labo',       tier: 2, name: 'Analyse de terrain',    icon: 'microscope', effect: '+15 % de production passive de cristal', fx: { prod: { cristal: 0.15 } } },
    { key: 'synthese',    b: 'labo',       tier: 3, name: 'Synthèse de matrices',  icon: 'gem',       effect: '+5 % de production passive de toutes les ressources', req: 'cristallo', fx: { prod: { all: 0.05 } } },
    // Militaire — Caserne, Chantier orbital
    { key: 'recrutement', b: 'caserne',    tier: 1, name: 'Recrutement éclair',    icon: 'sword',     effect: 'Formation des soldats 30 % plus rapide', fx: { dur: { troops: 0.30 } } },
    { key: 'cohesion',    b: 'caserne',    tier: 2, name: 'Cohésion d\'unités',    icon: 'shield',    effect: '+10 % de défense pour les soldats au sol', req: 'recrutement', fx: { def: { soldiers: 0.10 } } },
    { key: 'propulsion',  b: 'shipyard',   tier: 1, name: 'Propulsion ionique',    icon: 'rocket',    effect: 'Sondes 30 % plus rapides en mission', fx: { dur: { probes: 0.30 } } },
    { key: 'chaines',     b: 'shipyard',   tier: 2, name: 'Chaînes d\'assemblage', icon: 'rocket',    effect: 'Vaisseaux et sondes construits 20 % plus vite', fx: { dur: { ships: 0.20 } } },
    // Défense — Bunker
    { key: 'boucliers',   b: 'turret',     tier: 1, name: 'Boucliers de base',     icon: 'shield',    effect: '+500 de défense planétaire', fx: { def: { flat: 500 } } },
    { key: 'blindage',    b: 'turret',     tier: 2, name: 'Blindage planétaire',   icon: 'shield',    effect: '+15 % de défense planétaire totale', req: 'boucliers', fx: { def: { pct: 0.15 } } },
    // Commerce — Comptoir, Raffinerie
    { key: 'negoce',      b: 'comptoir',   tier: 1, name: 'Négoce structuré',      icon: 'coin',      effect: '+20 % de crédits galactiques', fx: { prod: { credits: 0.20 } } },
    { key: 'courtiers',   b: 'comptoir',   tier: 2, name: 'Réseau de courtiers',   icon: 'coin',      effect: '+25 % de crédits galactiques (cumulé avec Négoce : +45 %)', req: 'negoce', fx: { prod: { credits: 0.25 } } },
    { key: 'craquage',    b: 'raffinerie', tier: 1, name: 'Craquage catalytique',  icon: 'zap',       effect: '+20 % de production de carburant', fx: { prod: { fuel: 0.20 } } },
  ];
  const BY = Object.fromEntries(SKILLS.map(s => [s.key, s]));
  const BUILD_NAME = { mine: 'Mine', centrale: 'Centrale', labo: 'Laboratoire', caserne: 'Caserne', shipyard: 'Chantier orbital', turret: 'Bunker', comptoir: 'Comptoir', raffinerie: 'Raffinerie' };
  const THE = { mine: 'ta mine', centrale: 'ta centrale', labo: 'ton laboratoire', caserne: 'ta caserne', shipyard: 'ton chantier orbital', turret: 'ton bunker', comptoir: 'ton comptoir', raffinerie: 'ta raffinerie' };
  const FAMILY = { mine: 'extraction', centrale: 'energie', labo: 'recherche', caserne: 'militaire', shipyard: 'militaire', turret: 'defense', comptoir: 'commerce', raffinerie: 'commerce' };
  // apprendre : coût et durée de la recherche selon le tier du skill
  const COST = { 1: { metal: 300, cristal: 120 }, 2: { metal: 1500, energie: 500, cristal: 400 }, 3: { metal: 6000, energie: 2000, cristal: 1500 } };
  const DUR_MIN = { 1: 10, 2: 30, 3: 120 };
  // anciennes découvertes du match-3 (jamais appliquées) → les skills équivalents
  const LEGACY = { cristallographie: 'cristallo', analyse_terrain: 'analyse', synthese_matrices: 'synthese', cellules_solaires: 'cellules', supraconducteurs: 'supra', fission_controlee: 'fission' };

  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const G_ = () => (typeof G !== 'undefined' ? G : null);
  function learned() {
    const g = G_(); if (!g) return {};
    if (!g.skillsLearned || typeof g.skillsLearned !== 'object') g.skillsLearned = {};
    if (!g._skillsMigrated) {   // une fois : ce que le match-3 avait fait tomber devient enfin réel
      g._skillsMigrated = 1;
      for (const s of g.unlockedSkills || []) { const k = LEGACY[s && s.id]; if (k && !g.skillsLearned[k]) g.skillsLearned[k] = { at: Date.now(), via: 'match-3' }; }
    }
    return g.skillsLearned;
  }
  const has = (k) => !!learned()[k];
  function buildingTier(b) {
    const g = G_(); let t = 0;
    for (const p of (g && g.planet && g.planet.parcels) || []) if (p && p.building === b && p.state === 'built') t = Math.max(t, p.lvl || 1);
    return t;
  }
  // état d'un skill : learned | research | available | tier (bâtiment trop bas) | req (skill prérequis manquant)
  function stateOf(s) {
    const g = G_();
    if (has(s.key)) return 'learned';
    if (g && g.research && g.research.key === s.key) return 'research';
    if (buildingTier(s.b) < s.tier) return 'tier';
    if (s.req && !has(s.req)) return 'req';
    return 'available';
  }

  /* ── effets ── */
  const sumFx = (sec, k) => SKILLS.reduce((a, s) => a + (has(s.key) && s.fx[sec] && s.fx[sec][k] ? s.fx[sec][k] : 0), 0);
  function prodMult(res) { return 1 + sumFx('prod', res) + (['metal', 'energie', 'cristal', 'biomass'].includes(res) ? sumFx('prod', 'all') : 0); }
  function m3Mult(res) { return 1 + sumFx('m3', res); }
  function durMult(kind) { return SKILLS.reduce((a, s) => a * (has(s.key) && s.fx.dur && s.fx.dur[kind] ? 1 - s.fx.dur[kind] : 1), 1); }
  function defense(total, soldierPart) {
    const extraSoldiers = (soldierPart || 0) * sumFx('def', 'soldiers');
    return Math.round((total + extraSoldiers + sumFx('def', 'flat')) * (1 + sumFx('def', 'pct')));
  }
  // gains d'une partie de match-3 : bonus des skills, et la ligne à afficher
  function applyM3(score) {
    const lines = [];
    for (const k of Object.keys(score || {})) {
      const m = m3Mult(k);
      if (m > 1 && score[k] >= 1) {
        const extra = Math.round(score[k] * (m - 1));
        score[k] += extra;
        const by = SKILLS.filter(s => has(s.key) && s.fx.m3 && s.fx.m3[k]).map(s => s.name).join(', ');
        lines.push({ res: k, extra, by });
      }
    }
    return lines;
  }

  /* ── apprendre ── */
  const fmtDur = (min) => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}`;
  const resLabel = (k) => (typeof tileInfo === 'function' && tileInfo(k) ? tileInfo(k).label : k);
  const costLine = (c) => Object.entries(c).map(([k, v]) => `${typeof fmt === 'function' ? fmt(v) : v} ${resLabel(k).toLowerCase()}`).join(' · ');
  const canPay = (c) => Object.entries(c).every(([k, v]) => G.res[k] && G.res[k].v >= v);
  function learn(key) {
    const s = BY[key]; if (!s) return;
    const st = stateOf(s);
    const say = (t) => { if (typeof toast === 'function') toast(t); };
    if (st === 'learned') return say(`${s.name} : déjà acquis`);
    if (st === 'tier') return say(`${s.name} : ${BUILD_NAME[s.b]} niveau ${s.tier} requis`);
    if (st === 'req') return say(`${s.name} : apprends d'abord ${BY[s.req].name}`);
    if (G.research) return say(`Une recherche est déjà en cours : ${(BY[G.research.key] || {}).name || ''}`);
    const c = COST[s.tier];
    if (!canPay(c)) return say(`Ressources insuffisantes : ${costLine(c)}`);
    for (const [k, v] of Object.entries(c)) G.res[k].v -= v;
    const now = Date.now();
    G.research = { key, startedAt: now, endsAt: now + DUR_MIN[s.tier] * 60000 };
    say(`Recherche lancée : ${s.name} · ${fmtDur(DUR_MIN[s.tier])}`);
    if (typeof saveGame === 'function') saveGame();
    refresh();
  }
  function grant(key, via) {
    const s = BY[key]; if (!s || has(key)) return false;
    learned()[key] = { at: Date.now(), via: via || 'recherche' };
    if (G.research && G.research.key === key) G.research = null;
    if (typeof toast === 'function') toast(`Skill acquis : ${s.name} · ${s.effect}`);
    if (typeof saveGame === 'function') saveGame();
    refresh();
    return true;
  }
  // le match-3 d'un bâtiment peut faire découvrir un de ses skills disponibles (bloc scellé cassé)
  function dropPool(parcel) {
    if (!parcel || !parcel.building) return [];
    return SKILLS.filter(s => s.b === parcel.building && stateOf(s) === 'available').map(s => ({ id: s.key, label: s.name, desc: s.effect }));
  }

  /* ── horloge : fin de recherche, nouveaux skills disponibles ── */
  function tick() {
    const g = G_(); if (!g || !g.res) return;
    if (g.research && Date.now() >= g.research.endsAt) grant(g.research.key, 'recherche');
    // prévenir une fois quand un skill devient disponible (le joueur doit savoir qu'il peut l'apprendre)
    if (!g._skillsSeen || typeof g._skillsSeen !== 'object') g._skillsSeen = {};
    const fresh = SKILLS.filter(s => stateOf(s) === 'available' && !g._skillsSeen[s.key]);
    if (fresh.length) {
      for (const s of fresh) g._skillsSeen[s.key] = Date.now();
      const s = fresh[0];
      if (typeof toast === 'function') toast(`Nouveau skill disponible : ${s.name} (${BUILD_NAME[s.b]}) · apprends-le sur la fiche du bâtiment${fresh.length > 1 ? ` · +${fresh.length - 1}` : ''}`);
      if (typeof saveGame === 'function') saveGame();
    }
  }
  setInterval(() => { try { tick(); } catch (e) {} }, 2000);
  function refresh() {
    try {
      const cur = typeof getCurrentScreen === 'function' ? getCurrentScreen() : null;
      if (cur === 'building-detail' && typeof renderBuildingDetail === 'function') renderBuildingDetail();
      else if (cur === 'tech-tree' && typeof renderTechTree === 'function') renderTechTree();
    } catch (e) {}
  }

  /* ── affichage ── */
  function css() {
    if (document.getElementById('skills-css')) return;
    const st = document.createElement('style'); st.id = 'skills-css';
    st.textContent = `
      .sk-how{font-size:11px;color:var(--mut);line-height:1.55;padding:2px 0 10px;border-bottom:1px solid var(--line)}
      .sk-how b{color:var(--txt);font-weight:500}
      .sk-row{padding:11px 0;border-bottom:1px solid var(--line)}
      .sk-row:last-of-type{border-bottom:0}
      .sk-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .sk-name{font-size:13px;color:var(--txt);display:flex;align-items:center;gap:6px}
      .sk-fx{font-size:11px;color:var(--mut);margin-top:3px;line-height:1.45}
      .sk-st{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;padding-top:2px}
      .sk-st.learned{color:var(--green)} .sk-st.available{color:var(--amber)} .sk-st.research{color:#ffc864} .sk-st.tier,.sk-st.req{color:var(--mut)}
      .sk-why{font-size:10.5px;color:var(--mut);margin-top:5px;font-style:italic}
      .sk-learn{margin-top:9px;width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,192,96,.45);background:rgba(255,192,96,.08);color:var(--amber);font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;display:flex;justify-content:space-between;gap:10px}
      .sk-learn span{letter-spacing:0;text-transform:none;color:var(--mut);font-size:11px}
      .sk-learn.off{opacity:.55;cursor:not-allowed}
      .sk-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:8px}
      .sk-bar b{display:block;height:100%;background:#ffc864}
      .sk-fam{margin-top:12px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.12)}
      .sk-fam-t{font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}`;
    document.head.appendChild(st);
  }
  const ic = (name) => (typeof icon === 'function' ? icon(name, { size: 13 }) : '');
  function rowHtml(s, opts) {
    const st = stateOf(s), now = Date.now();
    const label = { learned: 'Acquis', research: 'En recherche', available: 'Disponible', tier: `${BUILD_NAME[s.b]} niv. ${s.tier}`, req: 'Prérequis' }[st];
    let extra = '';
    if (st === 'tier') extra = `<div class="sk-why">Monte ${opts && opts.here ? 'ce bâtiment' : THE[s.b]} au niveau ${s.tier} pour le débloquer.</div>`;
    else if (st === 'req') extra = `<div class="sk-why">Apprends d'abord « ${esc(BY[s.req].name)} ».</div>`;
    else if (st === 'research') {
      const r = G.research, pct = Math.min(100, Math.round((now - r.startedAt) / Math.max(1, r.endsAt - r.startedAt) * 100));
      const left = Math.max(1, Math.round((r.endsAt - now) / 60000));
      extra = `<div class="sk-bar"><b style="width:${pct}%"></b></div><div class="sk-why">Recherche en cours · ${fmtDur(left)} restante${left > 1 ? 's' : ''}</div>`;
    } else if (st === 'available') {
      const c = COST[s.tier], busy = !!G.research, ok = !busy && canPay(c);
      extra = `<button class="sk-learn${ok ? '' : ' off'}" onclick="event.stopPropagation();SBSkills.learn('${s.key}')">Apprendre<span>${busy ? 'une recherche est en cours' : costLine(c) + ' · ' + fmtDur(DUR_MIN[s.tier])}</span></button>`;
    } else if (st === 'learned') {
      const via = learned()[s.key] && learned()[s.key].via;
      if (via === 'match-3') extra = `<div class="sk-why">Découvert au match-3.</div>`;
    }
    return `<div class="sk-row"><div class="sk-top"><div><div class="sk-name">${ic(s.icon)} <span>${esc(s.name)}</span>${opts && opts.showBuilding ? ` <span style="font-size:10px;color:var(--mut)">· ${BUILD_NAME[s.b]}</span>` : ''}</div><div class="sk-fx">${esc(s.effect)}</div></div><div class="sk-st ${st}">${label}</div></div>${extra}</div>`;
  }
  // fiche d'un bâtiment : ses skills, comment les obtenir, et le lien vers l'arbre
  function buildingHtml(b) {
    css();
    const list = SKILLS.filter(s => s.b === b);
    if (!list.length) return '';
    const m3 = (b === 'labo' || b === 'centrale') ? ' Le match-3 de ce bâtiment peut aussi t\'en faire <b>découvrir</b> un gratuitement.' : '';
    return `<div class="sk-how">Chaque niveau du bâtiment rend un skill <b>disponible</b>. Tu l'<b>apprends</b> ici : un coût, puis une courte recherche. Une recherche à la fois.${m3}</div>`
      + list.map(s => rowHtml(s, { here: true })).join('')
      + `<div style="margin-top:12px;text-align:center"><button onclick="SBSkills.openTree('${FAMILY[b] || ''}')" style="background:transparent;border:none;color:var(--cyan);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;padding:6px">Voir l'arbre complet →</button></div>`;
  }
  // arbre : les skills d'une famille
  function familyHtml(catKey, color) {
    css();
    const list = SKILLS.filter(s => FAMILY[s.b] === catKey);
    if (!list.length) return '';
    return `<div class="sk-fam" id="sk-fam-${catKey}"><div class="sk-fam-t" style="color:${color || 'var(--mut)'}">Skills · à apprendre</div>${list.map(s => rowHtml(s, { showBuilding: true })).join('')}</div>`;
  }
  function familyCount(catKey) {
    const list = SKILLS.filter(s => FAMILY[s.b] === catKey);
    return { total: list.length, learned: list.filter(s => has(s.key)).length };
  }
  function openTree(catKey) {
    if (typeof goto === 'function') goto('tech-tree');
    setTimeout(() => {
      const el = catKey && document.getElementById('tt-cat-' + catKey);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  window.SBSkills = { SKILLS, has, stateOf, prodMult, m3Mult, durMult, defense, applyM3, learn, grant, dropPool, buildingHtml, familyHtml, familyCount, openTree, buildingTier, tick };
})();
