/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Sauvegarde cloud (Supabase)
   Septembre 2026 · v1.0

   Source : sb-build/src/cloud.js → bundle minifié assets/cloud.js (esbuild).

   Principe :
   - Le jeu continue de sauvegarder dans localStorage (rapide, hors-ligne).
   - Ce module réplique la partie dans Supabase (table public.saves, une ligne
     par joueur, protégée par RLS) et la restaure sur un autre appareil.
   - Chaque joueur reçoit d'abord un compte ANONYME (aucune friction). Il peut
     ensuite « sécuriser » sa partie en liant un email (code à 6 chiffres),
     ce qui permet de la retrouver sur un autre téléphone.
   - Conflits : la sauvegarde la plus récente (savedAt) gagne.

   Points de branchement dans index.html (commentés « CLOUD ») :
     saveGame() → SBCloud.queue() · deleteSave() → reset cloud
     écran de bienvenue → « J'ai déjà une partie » · dashboard → #dash-cloud-slot
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://elupnpdcblztpfywnhjl.supabase.co';
const SB_KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';   // clé publique (faite pour être dans le client)

const MAIN_KEY = 'starbyte_savegame';
// Stores secondaires du jeu (hors snapshot principal) à répliquer avec la partie
const EXTRA_KEYS = [
  'starbyte_my_address', 'starbyte_known_targets', 'starbyte_signatures', 'starbyte_system_resolution',
  'starbyte_legend_v1', 'starbyte_home_discoveries', 'starbyte_planet_custom_names',
];
const RESET_FLAG = 'starbyte_cloud_reset';
// Dernière version de la partie connue comme synchronisée avec le cloud SUR CET APPAREIL (savedAt).
// Si le cloud a bougé depuis, c'est qu'un autre appareil a joué : on reprend sa partie au lieu de l'écraser.
const BASE_KEY = 'starbyte_cloud_base';
// REVIEW_1110 — textes venus d'autres joueurs : jamais de balise ni de guillemet
const clean = (s, max = 60) => String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').slice(0, max);
const ADDR_RE = /^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/;
const cleanRow = (r, fields) => { if (!r) return r; const o = { ...r }; fields.forEach((f) => { if (o[f] != null) o[f] = clean(o[f]); }); return o; };
const cleanRes = (o) => {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of ['metal', 'energie', 'cristal']) { const v = Math.floor(Number(o[k]) || 0); if (v > 0 && v <= 100000) out[k] = v; }
  if (typeof o.address === 'string' && ADDR_RE.test(o.address)) out.address = o.address;
  return out;
};
// AMBASSADES_1210 — cale offerte : bornée (jamais écartée), trois ressources
const cleanCargo = (o) => {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of ['metal', 'energie', 'cristal']) { const v = Math.floor(Number(o[k]) || 0); if (v > 0) out[k] = Math.min(v, 150000); }
  return out;
};
const cleanOrbit = (o) => {
  const r = { ...cleanRow(o, ['owner_pseudo', 'target_pseudo', 'tanker_name', 'mission_id', 'cargo_state']), cargo: cleanCargo(o.cargo) };
  if (!ADDR_RE.test(r.owner_address || '')) r.owner_address = null;
  if (!ADDR_RE.test(r.target_address || '')) r.target_address = null;
  return r;
};
const cleanPact = (k) => {
  const r = cleanRow(k, ['proposer_pseudo', 'partner_pseudo', 'status', 'end_reason']);
  if (!ADDR_RE.test(r.proposer_address || '')) r.proposer_address = null;
  if (!ADDR_RE.test(r.partner_address || '')) r.partner_address = null;
  return r;
};
// PIRATERIE_1210 — systèmes « A-N-3709 », lignes de balise et de convoi
const SYS_RE = /^[A-Z]-[A-Z]-\d{4}$/;
const cleanScan = (r) => {
  const o = { ...cleanRow(r, ['pseudo', 'cargo_hint', 'leg', 'dock_name', 'route_type']) };
  if (!SYS_RE.test(o.system || '')) o.system = null;
  if (o.address && !ADDR_RE.test(o.address)) o.address = null;
  o.confidence = Math.max(0, Math.min(100, Math.floor(Number(o.confidence) || 0)));
  o.tanker_tier = Math.max(1, Math.min(3, Math.floor(Number(o.tanker_tier) || 1)));
  return o;
};
const cleanConvoy = (c) => {
  const o = { ...cleanRow(c, ['pseudo', 'pirate_pseudo', 'dock_name', 'tanker_name', 'mission_id', 'leg', 'kind', 'status', 'outcome', 'loss_mode']), loot: cleanCargo(c.loot), cargo: cleanCargo(c.cargo) };
  if (!SYS_RE.test(o.from_system || '')) o.from_system = null;
  if (!SYS_RE.test(o.intercept_system || '')) o.intercept_system = null;
  if (!SYS_RE.test(o.to_system || '')) o.to_system = null;
  return o;
};
// cale de butin d'une flotte : plusieurs abordages, plusieurs tankers T3 → bornée large, jamais écartée
const cleanHold = (o) => {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of ['metal', 'energie', 'cristal']) { const v = Math.floor(Number(o[k]) || 0); if (v > 0) out[k] = Math.min(v, 1e8); }
  return out;
};
const cleanFleetComp = (f) => {
  const comp = {};
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    comp[type] = {};
    for (const t of ['t1', 't2', 't3']) comp[type][t] = Math.max(0, Math.floor(Number(f?.composition?.[type]?.[t]) || 0));
  }
  return comp;
};
const cleanDeal = (d) => ({ ...cleanRow(d, ['from_pseudo', 'to_pseudo', 'message_key', 'dock_id']), offer: cleanRes(d.offer), ask: cleanRes(d.ask) });
const cleanRaid = (r) => cleanRow(r, ['attacker_pseudo', 'defender_pseudo', 'fleet_name', 'attacker_address', 'defender_address']);
const getBase = () => { try { return +localStorage.getItem(BASE_KEY) || 0; } catch (e) { return 0; } };
const setBase = (t) => { try { if (t) localStorage.setItem(BASE_KEY, String(t)); else localStorage.removeItem(BASE_KEY); } catch (e) {} };
const PUSH_DELAY = 4000;

const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'starbyte_auth' },
});

function say(msg) { if (typeof toast === 'function') toast(msg); }
function readLocal() {
  try { return JSON.parse(localStorage.getItem(MAIN_KEY) || 'null'); } catch (e) { return null; }
}
function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// sbPrompt du jeu + attributs de clavier adaptés (email / code), remis à zéro ensuite
function ask(opts, attrs) {
  const p = sbPrompt(opts);
  const el = document.getElementById('sb-modal-input');
  if (el) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return p.then((v) => { if (el) Object.keys(attrs).forEach((k) => el.removeAttribute(k)); return v ? v.trim() : v; });
}
const EMAIL_ATTRS = { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false' };
const CODE_ATTRS = { inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*' };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

const SBCloud = {
  status: 'init',        // init | ok | offline | error
  user: null,
  lastPushAt: 0,
  _timer: null,
  _pushing: false,

  _listening: false,
  _initing: false,
  _listen() {
    if (this._listening) return;
    this._listening = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.user) return;
      if (document.visibilityState === 'hidden') this.flush();
      else this.reconcile().catch((e) => console.warn('[SBCloud] reprise :', e));   // retour dans l'app : une autre machine a pu jouer
    });
    sb.auth.onAuthStateChange((_e, s) => { if (s && !this._switching) this.user = s.user; this.renderDash(); });
  },

  async init() {
    if (this._initing || this.status === 'ok') return;
    this._initing = true;
    try {
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      this.user = session.user;

      // Reset demandé depuis le panneau CHEAT : on efface aussi la copie cloud
      // (le drapeau n'est retiré que si l'effacement a vraiment eu lieu, sinon le cloud ressusciterait la partie)
      if (localStorage.getItem(RESET_FLAG)) {
        const { error } = await sb.from('saves').delete().eq('user_id', this.user.id);
        if (error) throw error;
        localStorage.removeItem(RESET_FLAG);
        try { localStorage.removeItem(BASE_KEY); } catch (e) {}
      }

      this._listen();
      await this.reconcile();
      this.status = 'ok';
      setTimeout(() => SBMP.ensure(), 1500);          // multijoueur v0 : registre des mondes
    } catch (e) {
      console.warn('[SBCloud] cloud indisponible, partie locale uniquement :', e);
      this.status = navigator.onLine === false ? 'offline' : 'error';
      // nouvelle tentative : retour du réseau, ou dans une minute
      window.addEventListener('online', () => this.init(), { once: true });
      setTimeout(() => this.init(), 60000);
    } finally {
      this._initing = false;
    }
    this.renderDash();
  },

  // Compare local et cloud : applique le cloud s'il est plus récent, sinon pousse le local
  async reconcile({ preferCloud = false } = {}) {
    if (!this.user) return;
    const { data: row, error } = await sb.from('saves').select('data, updated_at').eq('user_id', this.user.id).maybeSingle();
    if (error) throw error;
    const local = readLocal();
    const localAt = (local && local.savedAt) || 0;
    const cloudSave = row && row.data && row.data.savegame;
    const cloudAt = (cloudSave && cloudSave.savedAt) || 0;
    const base = getBase();
    // Avec une base connue : le cloud a-t-il été réécrit depuis notre dernière synchro ? (comparaison exacte,
    // indépendante des horloges des appareils). Sans base (ancienne installation) : la plus récente gagne, comme avant.
    const cloudWins = cloudSave && (preferCloud || !local || (!this._reconciled && window._sbBootLoaded === false && !localStorage.getItem('starbyte_cloud_reset')) || (base ? cloudAt !== base : cloudAt > localAt + 1000));
    if (cloudWins) {
      if (typeof SAVE_VERSION !== 'undefined' && cloudSave.saveVersion !== SAVE_VERSION) {
        console.warn('[SBCloud] version de sauvegarde cloud différente, ignorée');
        return;
      }
      this.apply(row.data);
      return;
    }
    this._reconciled = true;
    if (local && (!cloudSave || localAt > cloudAt)) await this.push();
    else if (cloudSave) { this.lastPushAt = cloudAt; setBase(cloudAt); }
  },

  // Écrit la partie cloud dans localStorage puis recharge le jeu dessus
  apply(payload) {
    window._sbResetting = true;                     // empêche saveGame() d'écraser pendant le rechargement
    localStorage.setItem(MAIN_KEY, JSON.stringify(payload.savegame));
    setBase(payload.savegame && payload.savegame.savedAt);
    const stores = payload.stores || {};
    EXTRA_KEYS.forEach((k) => {
      if (stores[k] != null) localStorage.setItem(k, stores[k]);
      else localStorage.removeItem(k);
    });
    sessionStorage.setItem('starbyte_cloud_restored', '1');
    location.reload();
  },

  // Appelé par saveGame() : envoi groupé quelques secondes plus tard
  queue() {
    if (!this.user || this._switching || this._conflict) return;
    if (document.visibilityState === 'hidden') return;   // l'envoi de fermeture passe par flush()
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), PUSH_DELAY);
  },

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const s = readLocal();
    if (s && s.savedAt && s.savedAt !== this.lastPushAt) this.push();
  },

  async push() {
    if (!this.user || this._switching || this._conflict || !this._reconciled) return;
    if (this._pushing) { this._again = true; return; }   // un envoi en cours : on renverra juste après
    const savegame = readLocal();
    if (!savegame) return;
    this._pushing = true;
    this._again = false;
    try {
      // Garde-fou multi-appareils : si un autre appareil a écrit depuis notre dernière synchro, ne pas l'écraser
      const base = getBase();
      if (base) {
        const { data: cur, error: e0 } = await sb.from('saves').select('saved_at:data->savegame->>savedAt').eq('user_id', this.user.id).maybeSingle();
        if (e0) throw e0;
        const curAt = cur ? +cur.saved_at : 0;
        if (curAt !== base) {
          this._pushing = false;
          this._onConflict(!!cur);
          return;
        }
      }
      const stores = {};
      EXTRA_KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v != null) stores[k] = v; });
      const { error } = await sb.from('saves').upsert({
        user_id: this.user.id,
        data: { v: 1, savegame, stores },
        save_version: savegame.saveVersion || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      this.lastPushAt = savegame.savedAt || Date.now();
      setBase(savegame.savedAt);
      this.status = 'ok';
      SBMP.publish();
    } catch (e) {
      console.warn('[SBCloud] envoi impossible :', e);
      this.status = navigator.onLine === false ? 'offline' : 'error';
      clearTimeout(this._retry);
      this._retry = setTimeout(() => this.queue(), 30000);   // nouvel essai automatique
    } finally {
      this._pushing = false;
      this.renderDash();
      if (this._again) { this._again = false; this.queue(); }
    }
  },

  // Un autre appareil a écrit la partie (ou l'a réinitialisée) pendant qu'on jouait ici
  async _onConflict(cloudExists) {
    if (this._conflict) return;
    this._conflict = true;
    let reprendre = false;
    if (typeof sbConfirm === 'function') {
      reprendre = await sbConfirm({
        title: 'Partie jouée ailleurs',
        body: cloudExists
          ? 'Ta partie a avancé sur un <strong>autre appareil</strong>.<br><br>Reprendre cette version-là ? Sinon, celle de cet appareil la remplacera.'
          : 'Ta partie a été <strong>réinitialisée</strong> sur un autre appareil.<br><br>Recharger ? Sinon, la partie de cet appareil sera conservée et renvoyée.',
        confirmLabel: cloudExists ? 'Reprendre l\'autre' : 'Recharger', cancelLabel: 'Garder celle-ci',
      });
    }
    if (reprendre) { if (cloudExists) await this.reconcile({ preferCloud: true }); else { window._sbResetting = true; location.reload(); } return; }
    // Garder celle-ci : on prend la version cloud actuelle comme base, puis on écrase
    try {
      const { data: cur } = await sb.from('saves').select('saved_at:data->savegame->>savedAt').eq('user_id', this.user.id).maybeSingle();
      setBase(cur ? +cur.saved_at : 0);
    } catch (e) { /* le prochain envoi recomparera */ }
    this._conflict = false;
    this.push();
  },

  /* ─────────────── Compte : lier un email / récupérer une partie ─────────────── */

  isLinked() { return !!(this.user && this.user.email && !this.user.is_anonymous); },

  // Joueur anonyme → ajoute un email (code à 6 chiffres) : la partie devient récupérable partout
  async linkFlow() {
    if (this.status !== 'ok') { say('Sauvegarde cloud indisponible pour le moment'); return; }
    const email = await ask({
      title: 'Sécuriser ma partie',
      body: 'Ta partie est sauvegardée dans le cloud. Ajoute ton email pour la retrouver sur un autre appareil.<br><br>Tu recevras un code à 6 chiffres.',
      placeholder: 'ton@email.ch', confirmLabel: 'Recevoir le code', maxLength: 120,
    }, EMAIL_ATTRS);
    if (!email) return;
    if (!isEmail(email)) { say('Adresse email invalide'); return; }
    const { error } = await sb.auth.updateUser({ email });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        const go = await sbConfirm({
          title: 'Email déjà utilisé',
          body: `<strong>${email}</strong> possède déjà une partie. Veux-tu la récupérer sur cet appareil ? La partie actuelle de cet appareil sera remplacée.`,
          confirmLabel: 'Récupérer', cancelLabel: 'Annuler',
        });
        if (go) this.restoreFlow(email);
        return;
      }
      say(this._errMsg(error)); return;
    }
    const code = await this._askCode(email);
    if (!code) return;
    const { data, error: e2 } = await sb.auth.verifyOtp({ email, token: code, type: 'email_change' });
    if (e2) { say(this._errMsg(e2)); return; }
    if (data && data.user) this.user = data.user;
    await this.push();
    say('Partie liée à ' + email);
    this.renderDash();
  },

  // Nouvel appareil : se connecter avec l'email lié et reprendre la partie
  async restoreFlow(presetEmail) {
    const email = presetEmail || await ask({
      title: 'Récupérer ma partie',
      body: 'Entre l\'email lié à ta partie. Tu recevras un code à 6 chiffres.',
      placeholder: 'ton@email.ch', confirmLabel: 'Recevoir le code', maxLength: 120,
    }, EMAIL_ATTRS);
    if (!email) return;
    if (!isEmail(email)) { say('Adresse email invalide'); return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      say(/not found|signups not allowed|Signups/i.test(error.message) ? 'Aucune partie liée à cet email' : this._errMsg(error));
      return;
    }
    const code = await this._askCode(email);
    if (!code) return;
    this._switching = true;
    clearTimeout(this._timer); this._timer = null;
    const { data, error: e2 } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
    if (e2) { this._switching = false; say(this._errMsg(e2)); return; }
    this.user = data.user;
    this.status = 'ok';
    try {
      const { data: row } = await sb.from('saves').select('data').eq('user_id', this.user.id).maybeSingle();
      if (row && row.data && row.data.savegame) { this.apply(row.data); return; }
      this._switching = false;
      say('Connecté · aucune partie trouvée, la partie de cet appareil sera envoyée');
      await this.push();
    } catch (e) { say('Récupération impossible, réessaie'); }
    this._switching = false;
    this.renderDash();
  },

  _askCode(email) {
    return ask({
      title: 'Code de vérification',
      body: `Un code à 6 chiffres a été envoyé à <strong>${email}</strong>. Vérifie aussi les indésirables.`,
      placeholder: '123456', confirmLabel: 'Valider', maxLength: 10,
    }, CODE_ATTRS).then((c) => (c ? c.replace(/\D/g, '') : null));
  },

  _errMsg(e) {
    const m = (e && e.message) || '';
    if (/rate|limit|seconds/i.test(m)) return 'Trop de demandes, réessaie dans une minute';
    if (/expired|invalid/i.test(m)) return 'Code invalide ou expiré';
    if (/not authorized|authorized/i.test(m)) return 'Envoi d\'email non configuré (SMTP)';
    return 'Erreur : ' + m;
  },

  /* ─────────────── Affichage ─────────────── */

  // PROFIL_1310 — Réglages : le commandant (pseudo, planète, niveau, adresse) et la sauvegarde (email lié)
  renderDash() {
    const linked = this.isLinked();
    try { document.body.classList.toggle('sb-unlinked', this.status === 'ok' && !linked); } catch (e) {}
    const slot = document.getElementById('dash-cloud-slot');
    if (!slot) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '');
    const w = SBMP.world;
    let snap = null;
    try { snap = typeof mpWorldSnapshot === 'function' ? mpWorldSnapshot() : null; } catch (e) {}
    const planet = (typeof G !== 'undefined' && G.planet && G.planet.name) || (w && w.planet_name) || (snap && snap.planet_name) || '—';
    const level = snap ? snap.level : (w && w.level) || 1;
    const row = (lbl, val, action) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="font-size:10px;color:#7d8a93;letter-spacing:.12em;text-transform:uppercase">${lbl}</span>
        <span style="display:flex;align-items:center;gap:8px;min-width:0"><span style="font-size:13px;color:#e6f0ff;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</span>${action || ''}</span></div>`;
    const btn = (kind, locked) => locked
      ? `<span style="font-size:9px;color:#5c6870;letter-spacing:.08em" title="Déjà modifié une fois">définitif</span>`
      : `<button onclick="sbRenameProfile('${kind}')" style="padding:4px 8px;background:transparent;border:1px solid rgba(95,168,232,.45);color:#5fa8e8;border-radius:5px;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap">Modifier · 1×</button>`;
    const profile = `
      <div class="section-label">Commandant</div>
      <div class="dash-section-card" style="padding:4px 14px">
        ${row('Pseudo', esc(w ? w.pseudo : ((typeof G !== 'undefined' && G.profile && G.profile.captainName) || '—')), w ? btn('pseudo', !!w.pseudo_renamed) : '')}
        ${row('Planète', esc(planet), w ? btn('planet', !!w.planet_renamed) : '')}
        ${row('Niveau', String(level))}
        ${w ? row('Adresse', `<span style="font-family:'JetBrains Mono',monospace;font-size:12px">${esc(w.address)}</span>`) : ''}
      </div>`;
    let save;
    if (this.status === 'ok' && linked) {
      save = `<div class="dash-section-card"><div style="font-size:12px;color:#7ed080">✓ Email lié · <span style="color:#e6f0ff">${esc(this.user.email)}</span></div>
        <div style="margin-top:4px;font-size:11px;color:#7d8a93;font-family:'JetBrains Mono',monospace">Cloud actif${this.lastPushAt ? ' · ' + hhmm(this.lastPushAt) : ''}</div></div>`;
    } else if (this.status === 'ok') {
      save = `<div class="dash-section-card clickable" id="dash-cloud-block" style="border-color:rgba(255,80,64,.55);background:rgba(255,80,64,.08)">
        <div style="font-size:13px;color:#ff6a5a;font-weight:600">Aucun email lié</div>
        <div style="margin-top:4px;font-size:11px;color:#ffb3aa;line-height:1.5">Sans email, ta partie est perdue si tu changes d'appareil ou effaces ton navigateur.</div>
        <div style="margin-top:8px;font-size:12px;color:#ff6a5a;text-decoration:underline">Lier un email maintenant</div></div>`;
    } else {
      save = `<div class="dash-section-card"><div style="font-size:12px;color:#c8d2d6;font-family:'JetBrains Mono',monospace">${this.status === 'init' ? 'Connexion au cloud…' : 'Hors-ligne · partie sauvegardée sur cet appareil'}</div></div>`;
    }
    slot.innerHTML = profile + `<div class="section-label">Sauvegarde</div>` + save;
    const block = slot.querySelector('#dash-cloud-block');
    if (block) block.addEventListener('click', () => this.linkFlow());
  },

};

/* ═══════════════════════════════════════════════════════════════
   MULTIJOUEUR v0 — registre des mondes (GDD starbyte_GDD_multijoueur_v0.md)
   Tables et fonctions : supabase/schema_mp_v0.sql
   ═══════════════════════════════════════════════════════════════ */
const TEST_SECTORS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');   // 22/10 : univers ouvert (tout l'amas A)
const PSEUDO_RE = /^[A-Za-zÀ-ÿ0-9 _.'-]{3,20}$/;
const RELOC_FLAG = 'starbyte_mp_relocated';

const SBMP = {
  world: null,          // ma ligne du registre
  _ensuring: false,

  ready() { return !!SBCloud.user && !!this.world; },

  // Retrouver mon monde, ou le créer (pseudo + adresse dans la zone de test)
  async ensure() {
    if (this._ensuring || !SBCloud.user) return;
    this._ensuring = true;
    try {
      const { data: w, error } = await sb.from('worlds').select('*').eq('user_id', SBCloud.user.id).maybeSingle();
      if (error) { console.warn('[SBMP] registre indisponible :', error.message); return; }
      if (w) { this.world = w; await this._align(w.address); this.watch(); return; }
      await this._create();
    } catch (e) {
      console.warn('[SBMP] ensure :', e);
    } finally {
      this._ensuring = false;
    }
  },

  async _create() {
    // attendre la fin de l'accueil (le joueur peut y restaurer une partie existante)
    for (let i = 0; i < 180; i++) {
      const w = document.getElementById('scr-welcome');
      if (!w || w.classList.contains('hidden')) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (SBCloud._switching || window._sbResetting) return;
    const current = typeof mpMyAddressString === 'function' ? mpMyAddressString() : null;
    let pseudo = await this._askPseudo();
    if (!pseudo) return;                                  // refusé : on redemandera au prochain lancement
    for (let i = 0; i < 15; i++) {
      const addr = (i === 0 && current && /^A-[A-Z]-/.test(current)) ? current : this._candidate();
      const snap = typeof mpWorldSnapshot === 'function' ? mpWorldSnapshot() : {};
      const { data, error } = await sb.rpc('mp_claim_world', { p_address: addr, p_pseudo: pseudo, p_planet_name: snap.planet_name || null });
      if (!error) { this.world = data; await this._align(data.address); this.watch(); return; }
      const m = error.message || '';
      if (/pseudo_taken/.test(m)) { pseudo = await this._askPseudo('Ce nom est déjà porté par un autre commandant. Choisis-en un autre.'); if (!pseudo) return; continue; }
      if (/pseudo_invalid/.test(m)) { pseudo = await this._askPseudo('Ce nom n\'est pas valide (3 à 20 caractères).'); if (!pseudo) return; continue; }
      if (/address_taken|address_outside/.test(m)) continue;
      console.warn('[SBMP] création du monde impossible :', m);
      return;
    }
  },

  // Adresse libre au hasard dans la zone de test (planète = emplacement du milieu, comme le jeu)
  _candidate() {
    const sector = TEST_SECTORS[Math.floor(Math.random() * TEST_SECTORS.length)];
    const system = 1000 + Math.floor(Math.random() * 9000);
    const slots = typeof getPlanetSlotsInSystem === 'function' ? getPlanetSlotsInSystem({ cluster: 'A', sector, system }) : [];
    const planet = slots[1] !== undefined ? slots[1] : (slots[0] || 50);
    return `A-${sector}-${system}-${String(planet).padStart(2, '0')}`;
  },

  async _askPseudo(why) {
    if (typeof sbPrompt !== 'function') return null;
    for (let tries = 0; tries < 3; tries++) {
      const v = await sbPrompt({
        title: 'Ton nom de commandant',
        body: (why ? why + '<br><br>' : '') + 'L\'univers de Starbyte devient commun : les autres joueurs te connaîtront sous ce nom.<br><br>3 à 20 caractères.',
        placeholder: 'ex. Kerath', confirmLabel: 'Valider', maxLength: 20,
      });
      if (v == null) return null;
      const name = String(v).trim();
      if (PSEUDO_RE.test(name)) return name;
      why = 'Lettres, chiffres, espaces, - _ . et \' seulement, 3 à 20 caractères.';
    }
    return null;
  },

  // Le registre fait foi : si l'adresse locale diffère, la colonie déménage (une seule fois)
  async _align(address) {
    const local = typeof mpMyAddressString === 'function' ? mpMyAddressString() : null;
    if (!local || local === address) { this.publish(); this._afterReloc(); return; }
    relocateHome(address);
    await SBCloud.push();
    sessionStorage.setItem(RELOC_FLAG, address);
    location.reload();
  },

  _afterReloc() {
    const a = sessionStorage.getItem(RELOC_FLAG);
    if (!a) return;
    sessionStorage.removeItem(RELOC_FLAG);
    const sector = a.split('-')[1];
    if (typeof sbConfirm === 'function') {
      sbConfirm({
        title: 'Colonie relocalisée',
        body: `Pour la saison de test, ta colonie rejoint les autres commandants dans le <strong>secteur ${sector}</strong> (${a}).<br><br>Tu gardes tout : bâtiments, ressources, flottes, rapports. Sonde les systèmes voisins pour les trouver.`,
        confirmLabel: 'Compris', cancelLabel: 'Fermer',
      });
    } else say(`Colonie relocalisée : ${a}`);
  },

  // Publier ce que les autres peuvent savoir de mon monde (appelé après chaque sauvegarde cloud)
  async publish() {
    if (!this.world || typeof mpWorldSnapshot !== 'function') return;
    const snap = mpWorldSnapshot();
    const now = new Date().toISOString();
    const { error } = await sb.from('worlds').update({ ...snap, updated_at: now, last_seen: now }).eq('user_id', SBCloud.user.id);
    if (error) console.warn('[SBMP] publication :', error.message);
    else if (typeof mpGrowthCheck === 'function') mpGrowthCheck(snap.level, snap.planet_name);
    try { if (typeof sbPublishColonies === 'function') sbPublishColonies(sb); } catch (x) {}   // v18/v23 : dépôts des colonies
  },

  // Une sonde est arrivée dans un système : y a-t-il de vrais mondes ?
  async onProbeArrived(target) {
    try {
      if (!SBCloud.user) return false;
      const sysKey = String(target).split('/')[0].split('-').slice(0, 3).join('-');
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) return;
      const { data, error } = await sb.rpc('mp_probe_system', { p_system: sysKey });
      if (error) { console.warn('[SBMP] sonde :', error.message); return; }
      const rows = (data || []).filter((w) => ADDR_RE.test(w.address)).map((w) => cleanRow(w, ['pseudo', 'planet_name']));
      if (rows.length && typeof mergeRealWorlds === 'function') mergeRealWorlds(sysKey, rows);
      return true;
    } catch (e) { console.warn('[SBMP] sonde :', e); return false; }
  },

  async worldCard(address) {
    const { data, error } = await sb.rpc('mp_world_card', { p_address: address });
    if (error) throw error;
    return (data && data[0]) || null;
  },

  // ─── Raids entre commandants (étape 2, 11/10) ───
  // Lancer : le registre vérifie la cible (bouclier, niveau, raid déjà en route) et fixe l'heure d'arrivée.
  async launchRaid(address, fleet, fleetName) {
    const origin = typeof sbOriginCoord === 'function' ? sbOriginCoord() : null;   // v19 : départ depuis une colonie
    const { data, error } = await sb.rpc('mp_launch_raid', origin
      ? { p_target_address: address, p_fleet: fleet, p_fleet_name: fleetName || null, p_origin_address: origin }
      : { p_target_address: address, p_fleet: fleet, p_fleet_name: fleetName || null });
    if (error) throw new Error(error.message || 'launch_failed');
    return data;
  },

  // Demander au serveur de résoudre les raids arrivés (n'importe quel joueur peut le déclencher ;
  // le serveur résout tous les raids dus, avec ses propres données).
  _lastResolve: 0,
  async resolveDue(force) {
    if (!this.ready()) return null;
    const now = Date.now();
    if (!force && now - this._lastResolve < 20000) return null;
    this._lastResolve = now;
    try {
      const { data, error } = await sb.functions.invoke('resolve-raids', { body: {} });
      if (error) { console.warn('[SBMP] résolution des raids :', error.message || error); return null; }
      return data;
    } catch (e) { console.warn('[SBMP] résolution des raids :', e); return null; }
  },

  // undefined = erreur réseau (réessayer) ; null = le raid n'existe pas
  async getRaid(id) {
    const { data, error } = await sb.from('raids').select('*').eq('id', id).maybeSingle();
    if (error) { console.warn('[SBMP] raid :', error.message); return undefined; }
    return data ? cleanRaid(data) : null;
  },

  async raidSeen(id) {
    const { error } = await sb.rpc('mp_raid_seen', { p_raid: id });
    if (error) console.warn('[SBMP] raid vu :', error.message);
  },

  // ─── Bar des docks (étape 3, 11/10) ───
  _presence: {},          // mission tanker → id de présence au registre du dock
  _dock: {},              // mission tanker → { convoys, at }
  _dockAt: {},
  _seenDeals: new Set(),
  deals: [],
  rumors: [],
  presenceFor(missionId) { return this._presence[missionId] || null; },
  dockState(missionId) { return this._dock[missionId] || null; },

  // Mes tankers amarrés ↔ registre du dock. Un départ ne supprime rien (les marchés en cours
  // restent lisibles) : la présence est simplement close à l'instant du départ.
  async syncDock() {
    if (!this.ready() || this._syncingDock || typeof mpDockPresenceWanted !== 'function') return;
    this._syncingDock = true;
    try {
      const me = SBCloud.user.id;
      const want = mpDockPresenceWanted();
      const nowIso = new Date().toISOString();
      if (want.length) {
        const rows = want.map((w) => ({ ...w, user_id: me, pseudo: this.world.pseudo, updated_at: nowIso }));
        const { data: up, error } = await sb.from('dock_presence').upsert(rows, { onConflict: 'user_id,mission_id' }).select('id, mission_id');
        if (error) throw error;
        (up || []).forEach((r) => { this._presence[r.mission_id] = r.id; });
      }
      const keep = new Set(want.map((w) => w.mission_id));
      const { data: open, error: e2 } = await sb.from('dock_presence').select('id, mission_id').eq('user_id', me).gt('leaves_at', nowIso);
      if (e2) throw e2;
      const stale = (open || []).filter((r) => !keep.has(r.mission_id)).map((r) => r.id);
      if (stale.length) {
        await sb.from('dock_presence').update({ leaves_at: nowIso, updated_at: nowIso }).in('id', stale);
        for (const d of this.deals.filter((x) => x.status === 'open' && x.from_id === me && stale.includes(x.from_presence))) {
          try { await this.answerDeal(d.id, 'cancelled'); } catch (e) { /* déjà répondu : le relevé suivant réglera */ }
        }
        await this.pollDeals();
      }
      Object.keys(this._presence).forEach((k) => { if (!keep.has(k)) { delete this._presence[k]; delete this._dock[k]; } });
    } catch (e) {
      console.warn('[SBMP] registre du dock :', (e && e.message) || e);
    } finally {
      this._syncingDock = false;
    }
  },

  // Relecture du dock affiché (convois, marchés, rumeurs) — au plus toutes les 15 s
  async refreshDock(mission, force) {
    if (!this.ready() || !mission || typeof mpDockIdForMission !== 'function') return;
    const now = Date.now();
    if (!force && now - (this._dockAt[mission.id] || 0) < 15000) return;
    this._dockAt[mission.id] = now;
    try {
      await this.syncDock();
      if (this._presence[mission.id]) {
        const { data, error } = await sb.rpc('mp_dock_convoys', { p_dock_id: mpDockIdForMission(mission) });
        if (error) throw error;
        this._dock[mission.id] = { convoys: (data || []).map((c) => cleanRow(c, ['pseudo', 'tanker_name', 'provenance', 'cargo_hint', 'crew_state'])), at: now };
      }
      await this.pollDeals();
      await this.loadRumors();
    } catch (e) {
      console.warn('[SBMP] dock :', (e && e.message) || e);
    }
    if (typeof mpOnDockData === 'function') mpOnDockData(mission.id);
  },

  async pollDeals() {
    if (!this.ready()) return;
    const me = SBCloud.user.id;
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data, error } = await sb.from('dock_deals').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
    if (error) { console.warn('[SBMP] marchés :', error.message); return; }
    this.deals = (data || []).map(cleanDeal);
    let fresh = 0;
    for (const d of this.deals) {
      if (d.status === 'open' && d.to_id === me && !this._seenDeals.has(d.id) && Date.parse(d.expires_at) > Date.now()) {
        this._seenDeals.add(d.id);
        if (!fresh++) say(`⚑ ${d.from_pseudo} te propose un marché au dock`);
      }
      if (typeof mpSettleDeal === 'function' && mpSettleDeal(d, me)) await this.dealApplied(d.id);
    }
  },

  async loadRumors() {
    if (!this.ready() || Date.now() - (this._rumorsAt || 0) < 60000) return;
    this._rumorsAt = Date.now();
    const { data, error } = await sb.from('rumors').select('*').eq('season', this.world.season).order('created_at', { ascending: false }).limit(6);
    if (!error) this.rumors = (data || []).map((r) => cleanRow(r, ['actor', 'target', 'sector']));
  },

  async proposeDeal(myPresence, theirPresence, kind, offer, ask, key) {
    const { data, error } = await sb.rpc('mp_propose_deal', { p_my_presence: myPresence, p_their_presence: theirPresence, p_kind: kind, p_offer: offer, p_ask: ask, p_message_key: key });
    if (error) throw new Error(error.message);
    return data ? cleanDeal(data) : data;
  },
  async answerDeal(id, answer) {
    const { data, error } = await sb.rpc('mp_answer_deal', { p_deal: id, p_answer: answer });
    if (error) throw new Error(error.message);
    return data ? cleanDeal(data) : data;
  },
  async dealApplied(id) {
    const { error } = await sb.rpc('mp_deal_applied', { p_deal: id });
    if (error) console.warn('[SBMP] marché appliqué :', error.message);
  },
  // Rumeurs : événements de MA partie racontés au comptoir (5 par jour, filtré par le registre)
  async reportEvent(kind, target, payload) {
    try {
      const { error } = await sb.rpc('mp_report_event', { p_kind: kind, p_target: target ? String(target).slice(0, 60) : null, p_payload: payload || {} });
      if (error) console.warn('[SBMP] rumeur :', error.message);
    } catch (e) { console.warn('[SBMP] rumeur :', e); }
  },

  // ─── Pavillons (11/10) ───
  async sendFlag(address, key, context) {
    const { error } = await sb.rpc('mp_send_flag', { p_to_address: address, p_flag_key: key, p_context: context || 'orbit' });
    if (error) throw new Error(error.message);
  },
  async sendFlagDock(myPresence, theirPresence, key) {
    const { error } = await sb.rpc('mp_send_flag_dock', { p_my_presence: myPresence, p_their_presence: theirPresence, p_flag_key: key });
    if (error) throw new Error(error.message);
  },
  async replyFlag(id, key) {
    const { error } = await sb.rpc('mp_reply_flag', { p_flag: id, p_flag_key: key });
    if (error) throw new Error(error.message);
  },
  async pollFlags() {
    if (!this.ready()) return;
    const { data, error } = await sb.rpc('mp_flag_inbox');
    if (error) { if (!this._flagWarned) { this._flagWarned = true; console.warn('[SBMP] pavillons :', error.message); } return; }
    const rows = (data || []).map((f) => {
      const r = cleanRow(f, ['from_pseudo', 'from_planet', 'flag_key', 'context']);
      if (r.from_address && !ADDR_RE.test(r.from_address)) r.from_address = null;
      return r;
    });
    const fresh = typeof mpIngestFlags === 'function' ? mpIngestFlags(rows) : [];
    if (fresh.length) await sb.rpc('mp_flags_seen', { p_ids: fresh.map((f) => f.id) });
  },

  // ─── Ambassades orbitales, livraisons et pactes (12/10) ───
  orbits: [],
  pacts: [],
  async orbitArrive(address, missionId, tankerName, cargo, lossApplied) {
    const { data, error } = await sb.rpc('mp_orbit_arrive', { p_to_address: address, p_mission: missionId, p_tanker: tankerName || '', p_cargo: cargo || {}, p_loss_applied: !!lossApplied });
    if (error) throw new Error(error.message);
    return data;
  },
  async orbitAnswer(id, accept) {
    const { data, error } = await sb.rpc('mp_orbit_answer', { p_presence: id, p_accept: !!accept });
    if (error) throw new Error(error.message);
    return cleanCargo(data);
  },
  async orbitApplied(id) {
    const { error } = await sb.rpc('mp_orbit_applied', { p_presence: id });
    if (error) console.warn('[SBMP] livraison appliquée :', error.message);
  },
  async orbitLeave(id) {
    const { data, error } = await sb.rpc('mp_orbit_leave', { p_presence: id });
    if (error) throw new Error(error.message);
    return String(data || '');
  },
  async pactPropose(presenceId) {
    const { data, error } = await sb.rpc('mp_pact_propose', { p_presence: presenceId });
    if (error) throw new Error(error.message);
    return data;
  },
  async pactAnswer(id, accept) {
    const { data, error } = await sb.rpc('mp_pact_answer', { p_pact: id, p_accept: !!accept });
    if (error) throw new Error(error.message);
    return String(data || '');
  },
  async pactEnd(id) {
    const { data, error } = await sb.rpc('mp_pact_end', { p_pact: id });
    if (error) throw new Error(error.message);
    return String(data || '');
  },
  // ─── Chat d'ambassade (13/10) : texte brut, affiché sans HTML côté jeu ───
  _cleanMsg(m) {
    return { id: clean(m && m.id, 40), mine: !!(m && m.mine), pseudo: clean(m && m.pseudo, 24),
      body: String((m && m.body) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 280),
      created_at: (m && m.created_at) || null, read_at: (m && m.read_at) || null };
  },
  async chatSend(address, body) {
    const { data, error } = await sb.rpc('mp_chat_send', { p_to_address: address, p_body: String(body || '').slice(0, 400) });
    if (error) throw new Error(error.message);
    return this._cleanMsg(data);
  },
  async chatThread(address) {
    const { data, error } = await sb.rpc('mp_chat_thread', { p_with_address: address, p_limit: 80 });
    if (error) throw new Error(error.message);
    return { open: !!(data && data.open), pseudo: clean(data && data.pseudo, 24), messages: ((data && data.messages) || []).map((m) => this._cleanMsg(m)) };
  },
  async chatSeen(address) {
    const { error } = await sb.rpc('mp_chat_seen', { p_with_address: address });
    if (error) console.warn('[SBMP] chat lu :', error.message);
  },
  async pollChat() {
    if (!this.ready() || this._chatBusy) return;
    this._chatBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_chat_unread');
      if (error) { if (!this._chatWarned) { this._chatWarned = true; console.warn('[SBMP] chat :', error.message); } return; }
      this._chatWarned = false;
      const rows = (data || []).filter((r) => ADDR_RE.test(r.address || '')).map((r) => ({ address: r.address, pseudo: clean(r.pseudo, 24),
        n: Math.max(0, Math.floor(Number(r.n) || 0)), last: String(r.last_body || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 280), lastAt: r.last_at || null, lastId: clean(r.last_id, 40) }));
      if (typeof mpIngestChat === 'function') mpIngestChat(rows);
    } catch (e) { console.warn('[SBMP] chat :', e); }
    finally { this._chatBusy = false; }
  },

  async pollOrbits() {
    if (!this.ready() || this._orbitsBusy) return;
    this._orbitsBusy = true;
    try {
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19) + 'Z';
      // ambassades ouvertes et pactes ouverts : tous (pas de limite) ; clos : les 7 derniers jours
      const [o, oc, k, kc] = await Promise.all([
        sb.from('orbit_presence').select('*').is('left_at', null),
        sb.from('orbit_presence').select('*').gt('left_at', since).order('left_at', { ascending: false }).limit(50),
        sb.from('pacts').select('*').in('status', ['proposed', 'active']),
        sb.from('pacts').select('*').gt('ended_at', since).order('ended_at', { ascending: false }).limit(50),
      ]);
      const err = o.error || oc.error || k.error || kc.error;
      if (err) {
        if (!this._orbitWarned) { this._orbitWarned = true; console.warn('[SBMP] ambassades :', err.message); }
        return;
      }
      this._orbitWarned = false;
      const uniq = (rows) => { const seen = new Set(); return rows.filter((r) => r && !seen.has(r.id) && seen.add(r.id)); };
      this.orbits = uniq([...(o.data || []), ...(oc.data || [])]).map(cleanOrbit);
      this.pacts = uniq([...(k.data || []), ...(kc.data || [])]).map(cleanPact);
      if (typeof mpIngestOrbits === 'function') await mpIngestOrbits(this.orbits, this.pacts, SBCloud.user.id);
    } catch (e) { console.warn('[SBMP] ambassades :', e); }
    finally { this._orbitsBusy = false; }
  },

  // ─── Balises & piraterie (12/10) ───
  scanRows: [],
  async convoyStart(c) {
    const args = {
      p_mission: c.missionId, p_leg: c.leg, p_kind: c.kind, p_to: c.to, p_dock: c.dock || null,
      p_route_type: c.routeType || 'direct', p_knowledge: c.knowledge || 0, p_protection: c.protection || 0,
      p_tier: c.tier || 1, p_tanker: c.tanker || '', p_cargo: c.cargo || {}, p_duration_ms: Math.max(0, Math.round(c.durationMs || 0)),
      p_elapsed_ms: Math.max(0, Math.round(c.elapsedMs || 0)) };
    if (c.origin) args.p_origin_address = c.origin;   // v20 : convoi parti d'une colonie
    let { data, error } = await sb.rpc('mp_convoy_start', args);
    // registre sans p_origin_address (ancien schéma) : on réessaie sans
    if (error && c.origin && /p_origin_address|PGRST202|Could not find|function/i.test(error.message || '')) { delete args.p_origin_address; ({ data, error } = await sb.rpc('mp_convoy_start', args)); }
    if (error) throw new Error(error.message);
    return data;
  },
  async convoyEnd(missionId, leg) {
    const { error } = await sb.rpc('mp_convoy_end', { p_mission: missionId, p_leg: leg });
    if (error) console.warn('[SBMP] convoi :', error.message);
  },
  async beaconsSync(list) {
    const { error } = await sb.rpc('mp_beacons_sync', { p_list: list || [] });
    if (error) throw new Error(error.message);
  },
  async ambushPost(fleetId, name, system, fleet) {
    const { data, error } = await sb.rpc('mp_ambush_post', { p_fleet_id: fleetId, p_fleet_name: name || '', p_system: system, p_fleet: fleet });
    if (error) throw new Error(error.message);
    return data;
  },
  async ambushLeave(id) {
    const { data, error } = await sb.rpc('mp_ambush_leave', { p_ambush: id });
    if (error) throw new Error(error.message);
    return { composition: cleanFleetComp(data?.fleet), hold: cleanHold(data?.hold) };
  },
  async ambushLeaveFleet(fleetId) {
    const { data, error } = await sb.rpc('mp_ambush_leave_fleet', { p_fleet_id: fleetId });
    if (error) throw new Error(error.message);
    return data ? { composition: cleanFleetComp(data.fleet), hold: cleanHold(data.hold) } : null;
  },
  async spy(convoyId, system) {
    const { data, error } = await sb.rpc('mp_spy', { p_convoy: convoyId, p_system: system });
    if (error) throw new Error(error.message);
    const o = cleanRow(data || {}, ['pseudo', 'dock_name', 'leg', 'kind']);
    if (o.address && !ADDR_RE.test(o.address)) o.address = null;
    if (!SYS_RE.test(o.from_system || '')) o.from_system = null;
    if (!SYS_RE.test(o.to_system || '')) o.to_system = null;
    return o;
  },
  async intercept(convoyId, system, fleetId) {
    const { data, error } = await sb.rpc('mp_intercept', { p_convoy: convoyId, p_system: system, p_fleet_id: fleetId });
    if (error) throw new Error(error.message);
    this.resolveDue(true);
    return data;
  },
  async pollPiracy() {
    if (!this.ready() || this._piracyBusy) return;
    this._piracyBusy = true;
    try {
      const me = SBCloud.user.id;
      if (typeof mpBeaconList === 'function') { try { await this.beaconsSync(mpBeaconList()); } catch (e) { if (!this._pirWarned) { this._pirWarned = true; console.warn('[SBMP] balises :', e.message || e); } return; } }
      const [sc, cv, it, am] = await Promise.all([
        sb.rpc('mp_beacon_scan'),
        sb.from('convoys').select('*').eq('user_id', me).in('status', ['intercepted', 'escaped']).eq('seen', false).limit(30),
        sb.from('intercepts').select('id, status, result, created_at, resolved_at, seen').eq('pirate_id', me).or('status.neq.done,seen.eq.false').limit(30),
        sb.from('ambushes').select('*').eq('user_id', me).is('left_at', null),
      ]);
      const err = sc.error || cv.error || it.error || am.error;
      if (err) { if (!this._pirWarned) { this._pirWarned = true; console.warn('[SBMP] piraterie :', err.message); } return; }
      this._pirWarned = false;
      this.scanRows = (sc.data || []).map(cleanScan).filter((r) => r.system && r.convoy_id);
      const convoys = (cv.data || []).map(cleanConvoy);
      const intercepts = (it.data || []).map((r) => {
        const res = r.result || {};
        const o = { id: r.id, status: r.status, seen: r.seen, resolved_at: r.resolved_at,
          outcome: clean(res.outcome, 20), victim: clean(res.victim), dock_name: clean(res.dock_name), leg: clean(res.leg, 8), kind: clean(res.kind, 12),
          victim_address: ADDR_RE.test(res.victim_address || '') ? res.victim_address : null,
          system: SYS_RE.test(res.system || '') ? res.system : null, fleet_id: clean(res.fleet_id, 80),
          loot: cleanHold(res.loot), losses: res.losses && typeof res.losses === 'object' ? { fregate: cleanFleetComp({ composition: res.losses }).fregate, cuirasse: cleanFleetComp({ composition: res.losses }).cuirasse, tanker: cleanFleetComp({ composition: res.losses }).tanker } : null };
        return o;
      });
      const ambushes = (am.data || []).map((a) => ({ id: a.id, fleet_id: clean(a.fleet_id, 80), system: SYS_RE.test(a.system || '') ? a.system : null,
        composition: cleanFleetComp(a.fleet), hold: cleanHold(a.hold) }));
      if (intercepts.some((i) => i.status !== 'done')) this.resolveDue();
      if (typeof mpIngestPiracy === 'function') await mpIngestPiracy({ scan: this.scanRows, convoys, intercepts, ambushes }, me);
    } catch (e) { console.warn('[SBMP] piraterie :', e); }
    finally { this._piracyBusy = false; }
  },
  async convoySeen(id) {
    const { error } = await sb.rpc('mp_convoy_seen', { p_convoy: id });
    if (error) console.warn('[SBMP] convoi vu :', error.message);
  },
  async interceptSeen(id) {
    const { error } = await sb.rpc('mp_intercept_seen', { p_intercept: id });
    if (error) console.warn('[SBMP] interception vue :', error.message);
  },

  // ─── Voisins signalés (13/10) : les commandants les plus proches entrent au carnet ───
  async pollNeighbors(force) {
    if (!this.ready() || this._nbBusy) return;
    if (!force && Date.now() - (this._nbAt || 0) < 10 * 60000) return;
    this._nbBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_neighbors', { p_limit: 3 });
      if (error) { if (!this._nbWarned) { this._nbWarned = true; console.warn('[SBMP] voisins :', error.message); } return; }
      this._nbAt = Date.now();
      const rows = (data || []).filter((r) => ADDR_RE.test(r.address || '')).map((r) => cleanRow(r, ['pseudo', 'planet_name']));
      if (typeof mpIngestNeighbors === 'function') mpIngestNeighbors(rows);
    } catch (e) { console.warn('[SBMP] voisins :', e); }
    finally { this._nbBusy = false; }
  },

  // PROFIL_1310 — pseudo et nom de planète : une seule modification chacun (le registre y veille)
  async rename(pseudo, planet) {
    const { data, error } = await sb.rpc('mp_rename', { p_pseudo: pseudo || null, p_planet: planet || null });
    if (error) throw new Error(error.message);
    if (data) this.world = data;
    return data;
  },

  async barLead(known) {
    const { data, error } = await sb.rpc('mp_bar_lead', { p_known_addresses: known || [] });
    if (error) throw new Error(error.message);
    const r = data && data[0];
    return r && ADDR_RE.test(r.address) ? cleanRow(r, ['pseudo', 'planet_name']) : null;
  },

  // Veille du défenseur : flottes hostiles en approche, raids subis à intégrer.
  _warned: new Set(),
  _watching: false,
  watch() {
    if (this._watching) return;
    this._watching = true;
    const tick = () => { if (document.visibilityState !== 'hidden') {
      this.pollRaids(); this.pollMyRaids();
      if (!SBCloud._conflict && !SBCloud._switching && !window._sbResetting) this.publish();
      this.syncDock(); this.pollDeals(); this.pollFlags(); this.pollRelations(); this.pollTrade(); this.pollAlliance(); this.pollGarrisons();
      this.pollOrbits(); this.pollPiracy(); this.pollNeighbors(); this.pollChat(); } };
    // chat : relève des non-lus plus fréquente (15 s), seulement à l'écran
    setInterval(() => { if (document.visibilityState !== 'hidden') this.pollChat(); }, 15000);
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    tick();
  },
  // ─── Relations (v24), commerce (v25), alliances (v26), garnisons (v26), mes raids orphelins ───
  async pollRelations(force) {
    if (!this.ready() || this._relBusy || (!force && Date.now() - (this._relAt || 0) < 55000)) return;
    this._relBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_relations');
      if (error) { if (!this._relWarned) { this._relWarned = true; console.warn('[SBMP] relations :', error.message); } return; }
      this._relAt = Date.now();
      const rows = (data || []).filter((r) => r && (r.kind === 'enemy' || r.kind === 'trade')).map((r) => ({
        kind: r.kind, pseudo: clean(r.other_pseudo, 24), addresses: (r.addresses || []).filter((a) => ADDR_RE.test(a || '')),
        byMe: !!r.by_me, since: r.since || null, until: r.until || null }));
      if (typeof mpIngestRelations === 'function') mpIngestRelations(rows);
    } catch (e) { console.warn('[SBMP] relations :', e); }
    finally { this._relBusy = false; }
  },
  async tradeArrive(toAddress, missionId, tanker, cargo) {
    const { data, error } = await sb.rpc('mp_trade_arrive', { p_to_address: toAddress, p_mission: missionId, p_tanker: tanker || '', p_cargo: cargo || {} });
    if (error) throw new Error(error.message);
    return this._cleanTrade(data);
  },
  async tradeSettle(id, bought) {
    const { data, error } = await sb.rpc('mp_trade_settle', { p_id: id, p_bought: bought || {} });
    if (error) throw new Error(error.message);
    return this._cleanTrade(data);
  },
  async tradeDone(id) {
    const { error } = await sb.rpc('mp_trade_done', { p_id: id });
    if (error) console.warn('[SBMP] commerce :', error.message);
  },
  _cleanTrade(t) {
    if (!t || typeof t !== 'object') return null;
    const res = (c) => { const o = {}; for (const k of ['metal', 'energie', 'cristal']) o[k] = Math.max(0, Math.floor(Number(c && c[k]) || 0)); return o; };
    return {
      id: clean(t.id, 40), seller_id: clean(t.seller_id, 40), buyer_id: clean(t.buyer_id, 40),
      seller_pseudo: clean(t.seller_pseudo, 24), buyer_pseudo: clean(t.buyer_pseudo, 24),
      seller_address: ADDR_RE.test(t.seller_address || '') ? t.seller_address : null,
      buyer_address: ADDR_RE.test(t.buyer_address || '') ? t.buyer_address : null,
      mission: clean(t.mission, 80), tanker: clean(t.tanker, 40), cargo: res(t.cargo), bought: res(t.bought),
      paid_cg: Math.max(0, Math.floor(Number(t.paid_cg) || 0)), status: clean(t.status, 12),
      created_at: t.created_at || null, settled_at: t.settled_at || null, buyer_applied: !!t.buyer_applied, seller_seen: !!t.seller_seen,
    };
  },
  async pollTrade(force) {
    if (!this.ready() || this._tradeBusy || (!force && Date.now() - (this._tradeAt || 0) < 20000)) return;
    this._tradeBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_trade_poll');
      if (error) { if (!this._tradeWarned) { this._tradeWarned = true; console.warn('[SBMP] commerce :', error.message); } return; }
      this._tradeAt = Date.now();
      const rows = (data || []).map((r) => this._cleanTrade(r)).filter((r) => r && r.id);
      if (typeof mpIngestTrade === 'function') await mpIngestTrade(rows, SBCloud.user.id);
    } catch (e) { console.warn('[SBMP] commerce :', e); }
    finally { this._tradeBusy = false; }
  },
  async _arpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw new Error(error.message);
    return data;
  },
  allianceFound(name, color) { return this._arpc('mp_alliance_found', { p_name: String(name || '').slice(0, 24), p_color: color || null }); },
  allianceInvite(address) { return this._arpc('mp_alliance_invite', { p_address: address }); },
  allianceAnswer(inviteId, accept) { return this._arpc('mp_alliance_answer', { p_invite: inviteId, p_accept: !!accept }); },
  allianceLeave() { return this._arpc('mp_alliance_leave'); },
  allianceKick(address) { return this._arpc('mp_alliance_kick', { p_address: address }); },
  allianceCancelInvite(inviteId) { return this._arpc('mp_alliance_cancel_invite', { p_invite: inviteId }); },
  allianceChat(body) { return this._arpc('mp_alliance_chat_send', { p_body: String(body || '').slice(0, 280) }); },
  _cleanAlliance(d) {
    d = d && typeof d === 'object' ? d : {};
    const color = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#5fffe8');
    const alliance = d.alliance ? { id: clean(d.alliance.id, 40), name: clean(d.alliance.name, 24), color: color(d.alliance.color), leader: !!d.alliance.leader, created_at: d.alliance.created_at || null } : null;
    const members = (d.members || []).map((m) => ({ pseudo: clean(m.pseudo, 24), address: ADDR_RE.test(m.address || '') ? m.address : null, me: !!m.me, leader: !!m.leader, joined_at: m.joined_at || null, addresses: (m.addresses || []).filter((a) => ADDR_RE.test(a || '')) }));
    const invites = (d.invites || []).map((i) => ({ id: clean(i.id, 40), alliance: clean(i.alliance, 24), color: color(i.color), by: clean(i.by, 24), by_address: ADDR_RE.test(i.by_address || '') ? i.by_address : null, members: Math.max(0, Math.floor(Number(i.members) || 0)), created_at: i.created_at || null }));
    const sent = (d.sent || []).map((x) => ({ id: clean(x.id, 40), pseudo: clean(x.pseudo, 24), address: ADDR_RE.test(x.address || '') ? x.address : null, created_at: x.created_at || null }));
    const messages = (d.messages || []).map((m) => ({ id: clean(m.id, 40), pseudo: clean(m.pseudo, 24), mine: !!m.mine, body: String(m.body || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 280), created_at: m.created_at || null }));
    return { alliance, members, invites, sent, messages };
  },
  async pollAlliance(force) {
    if (!this.ready() || this._allyBusy || (!force && Date.now() - (this._allyAt || 0) < 30000)) return;
    this._allyBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_alliance_state');
      if (error) { if (!this._allyWarned) { this._allyWarned = true; console.warn('[SBMP] alliance :', error.message); } return; }
      this._allyAt = Date.now();
      let tags = null;
      if (force || Date.now() - (this._tagsAt || 0) > 300000) {
        const { data: t, error: te } = await sb.rpc('mp_alliance_tags');
        if (!te) { this._tagsAt = Date.now(); tags = (t || []).filter((a) => ADDR_RE.test(a.address || '')).map((a) => ({ address: a.address, alliance: clean(a.alliance, 24), color: /^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : '#5fffe8' })); }
      }
      if (typeof mpIngestAlliance === 'function') mpIngestAlliance(this._cleanAlliance(data), tags);
    } catch (e) { console.warn('[SBMP] alliance :', e); }
    finally { this._allyBusy = false; }
  },
  _cleanGar(g) {
    const comp = (c) => { const o = {}; for (const type of ['tanker', 'fregate', 'cuirasse']) { o[type] = {}; for (const t of ['t1', 't2', 't3']) o[type][t] = Math.max(0, Math.floor(Number(c && c[type] && c[type][t]) || 0)); } return o; };
    return {
      id: clean(g.id, 40), owner_pseudo: clean(g.owner_pseudo, 24), host_pseudo: clean(g.host_pseudo, 24),
      host_address: ADDR_RE.test(g.host_address || '') ? g.host_address : null,
      fleet_id: clean(g.fleet_id, 80), fleet_name: clean(g.fleet_name, 40), composition: comp(g.composition),
      arrives_at: g.arrives_at || null, left_at: g.left_at || null, left_reason: clean(g.left_reason, 16), losses_seen: g.losses_seen !== false,
      last_raid: g.last_raid && typeof g.last_raid === 'object' ? { attacker: clean(g.last_raid.attacker, 24), victory: !!g.last_raid.victory, lost: comp(g.last_raid.lost), at: g.last_raid.at || null } : null,
      def: Math.max(0, Math.floor(Number(g.def) || 0)),
    };
  },
  async garrisonPost(hostAddress, fleetId, fleetName, fleet, travelMs) {
    const d = await this._arpc('mp_garrison_post', { p_host_address: hostAddress, p_fleet_id: fleetId, p_fleet_name: fleetName || '', p_fleet: fleet, p_travel_ms: Math.max(0, Math.round(travelMs || 0)) });
    return this._cleanGar(d || {});
  },
  async garrisonRecall(id) {
    const d = await this._arpc('mp_garrison_recall', { p_id: id });
    return this._cleanGar(d || {});
  },
  garrisonSeen(id) { return this._arpc('mp_garrison_seen', { p_id: id }).catch((e) => console.warn('[SBMP] garnison :', e.message)); },
  async pollGarrisons(force) {
    if (!this.ready() || this._garBusy || (!force && Date.now() - (this._garAt || 0) < 30000)) return;
    this._garBusy = true;
    try {
      const { data, error } = await sb.rpc('mp_garrisons');
      if (error) { if (!this._garWarned) { this._garWarned = true; console.warn('[SBMP] garnisons :', error.message); } return; }
      this._garAt = Date.now();
      const mine = ((data && data.mine) || []).map((g) => this._cleanGar(g));
      const hosted = ((data && data.hosted) || []).map((g) => this._cleanGar(g));
      if (typeof mpIngestGarrisons === 'function') mpIngestGarrisons(mine, hosted);
    } catch (e) { console.warn('[SBMP] garnisons :', e); }
    finally { this._garBusy = false; }
  },
  // Raids lancés par moi que le jeu ne connaît plus (sauvegarde restaurée) : le jeu les réadopte
  async pollMyRaids() {
    if (!this.ready() || this._myRaidsBusy) return;
    this._myRaidsBusy = true;
    try {
      const { data, error } = await sb.from('raids')
        .select('id, status, fleet_name, attacker_address, defender_address, defender_pseudo, departed_at, arrives_at, returns_at')
        .eq('attacker_id', SBCloud.user.id).eq('attacker_seen', false).order('departed_at', { ascending: false }).limit(30);
      if (error) { console.warn('[SBMP] mes raids :', error.message); return; }
      if (typeof mpAdoptOrphanRaids === 'function') mpAdoptOrphanRaids((data || []).map(cleanRaid));
    } catch (e) { console.warn('[SBMP] mes raids :', e); }
    finally { this._myRaidsBusy = false; }
  },
  async pollRaids() {
    if (!this.ready()) return;
    const me = SBCloud.user.id;
    try {
      const { data: incoming } = await sb.from('raids')
        .select('id, attacker_pseudo, fleet_name, arrives_at, status, defender_address')
        .eq('defender_id', me).in('status', ['enroute', 'resolving']);
      let due = false;
      for (const r0 of incoming || []) {
        const r = cleanRaid(r0);
        const t = Date.parse(r.arrives_at);
        if (t <= Date.now()) { due = true; continue; }
        if (!this._warned.has(r.id)) {
          this._warned.add(r.id);
          const hh = new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          say(`⚠ Flotte hostile de ${r.attacker_pseudo} en approche · arrivée ${hh}`);
        }
      }
      if (typeof mpRenderIncoming === 'function') mpRenderIncoming((incoming || []).map(cleanRaid));
      if (due) await this.resolveDue();
      const { data: hits } = await sb.from('raids').select('*')
        .eq('defender_id', me).in('status', ['resolved', 'aborted']).eq('defender_seen', false)
        .order('resolved_at', { ascending: true });
      let applied = false;
      for (const r0 of hits || []) {
        const r = cleanRaid(r0);
        if (typeof mpApplyRaidAgainstMe === 'function' && mpApplyRaidAgainstMe(r)) { applied = true; await this.raidSeen(r.id); }
      }
      if (applied) SBCloud.push();
    } catch (e) { console.warn('[SBMP] veille des raids :', e); }
  },
};
window.SBMP = SBMP;

window.SBCloud = SBCloud;
if (sessionStorage.getItem('starbyte_cloud_restored')) {
  sessionStorage.removeItem('starbyte_cloud_restored');
  setTimeout(() => say('Partie récupérée depuis le cloud'), 800);
}
SBCloud.init();
