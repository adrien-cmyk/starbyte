/* Starbyte — Inviter des commandants (PARRAINAGE_2410, décision d'Adrien 24/10)
   Chaque commandant a un lien personnel (play.starbyte.online/?ref=CODE). Quand 5 appareils différents
   (pas les siens) ouvrent son lien, il gagne 2 500 métal, une seule fois. Serveur : schema_mp_v30_parrainage.sql.
   - visiteur : le code du lien est mis de côté puis envoyé au registre (même sans compte), une fois par appareil ;
   - joueur : carte « Inviter des commandants » en tête de la cloche, partage natif / WhatsApp / copie du lien. */
(function () {
  if (window.SBInvite) return;
  const API = 'https://elupnpdcblztpfywnhjl.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';
  const SITE = 'https://play.starbyte.online/';
  const GOAL = 5, REWARD = 2500;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, '');
  const fmtN = (n) => (typeof fmt === 'function' ? fmt(n) : String(n));

  function device() {
    let d = ls.get('sb_device', null);
    if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      d = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
      ls.set('sb_device', d);
    }
    return d;
  }
  function token() {
    try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) { return null; }
  }
  async function rpc(fn, args, anon) {
    const tok = token();
    if (!tok && !anon) throw new Error('no_session');
    const h = { 'Content-Type': 'application/json', apikey: KEY };
    if (tok) h.Authorization = 'Bearer ' + tok;
    const r = await fetch(API + fn, { method: 'POST', headers: h, body: JSON.stringify(args || {}) });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt.slice(0, 200));
    try { return JSON.parse(txt); } catch (e) { return txt; }
  }

  // ── visiteur : le lien ouvert ──
  (function capture() {
    try {
      const u = new URL(location.href);
      const code = String(u.searchParams.get('ref') || '').toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(code)) {
        const done = ls.get('sb_ref_done', []);
        if (!done.includes(code)) ls.set('sb_ref_pending', { code, tries: 0 });
        u.searchParams.delete('ref');
        history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
      }
    } catch (e) {}
  })();
  async function sendPending() {
    const p = ls.get('sb_ref_pending', null);
    if (!p || !p.code) return;
    if ((p.tries || 0) >= 8) { ls.set('sb_ref_pending', null); return; }
    ls.set('sb_ref_pending', { code: p.code, tries: (p.tries || 0) + 1 });
    try {
      await rpc('mp_ref_open', { p_code: p.code, p_device: device() }, true);
      ls.set('sb_ref_pending', null);
      const done = ls.get('sb_ref_done', []); done.push(p.code); ls.set('sb_ref_done', done.slice(-20));
    } catch (e) { /* hors ligne ou registre pas encore à jour : on réessaie au prochain lancement */ }
  }
  setTimeout(sendPending, 2500);

  // ── joueur : mon lien, ma progression, la récompense ──
  let cached = ls.get('sb_ref_state', null), pending = null, lastAt = 0, lastErr = '';
  // une seule demande à la fois : un second appel attend la réponse de la première (au lieu de repartir les mains vides)
  function refresh() {
    if (!token()) return Promise.resolve(cached);
    if (pending) return pending;
    lastAt = Date.now();
    pending = (async () => {
      try {
        const s = await rpc('mp_ref_state', { p_device: device() });
        if (s && s.code) { cached = s; ls.set('sb_ref_state', s); lastErr = ''; }
        await maybeClaim();
      } catch (e) { lastErr = String(e && e.message || e); console.warn('[invitation]', lastErr); }
      finally { pending = null; }
      return cached;
    })();
    return pending;
  }
  async function maybeClaim() {
    const G0 = (typeof G !== 'undefined') ? G : null;
    if (!G0 || G0.refRewardGiven || !cached) return;
    if (!cached.claimed && (cached.count || 0) < GOAL) return;
    let r = null;
    try { r = await rpc('mp_ref_claim', {}); } catch (e) { return; }
    if (!r || !r.ok || G0.refRewardGiven) return;
    G0.refRewardGiven = true;
    if (typeof _mpPay === 'function') _mpPay({ metal: REWARD }, +1, true);
    else if (G0.res && G0.res.metal) G0.res.metal.v = (G0.res.metal.v || 0) + REWARD;
    cached = Object.assign({}, cached, { claimed: true }); ls.set('sb_ref_state', cached);
    if (typeof saveGame === 'function') saveGame();
    if (window.SBSfx) SBSfx.play('build');
    if (typeof toast === 'function') toast(`Ton appel a été entendu : ${GOAL} appareils ont ouvert ton lien · +${fmtN(REWARD)} métal`);
    if (typeof refreshCurrentScreen === 'function') { try { refreshCurrentScreen(); } catch (e) {} }
    renderCard();
  }
  setTimeout(refresh, 8000);
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);

  function link() { return cached && cached.code ? SITE + '?ref=' + cached.code : SITE; }
  function message() { return `Rejoins-moi dans Starbyte ! L'univers vient de s'ouvrir : c'est maintenant que naissent les empires. Arrive parmi les premiers et deviens l'un des commandants les plus puissants de l'amas. L'aventure commence ici : ${link()}`; }

  function progressHtml(s) {
    const n = Math.min(GOAL, (s && s.count) || 0), done = !!(s && s.claimed) || (typeof G !== 'undefined' && G && G.refRewardGiven);
    const dots = Array.from({ length: GOAL }, (_, i) => `<span style="flex:1;height:5px;border-radius:3px;background:${done || i < n ? '#ffb15a' : 'rgba(255,255,255,.12)'}"></span>`).join('');
    return `<div style="display:flex;gap:4px;margin:10px 0 6px">${dots}</div>
      <div style="font-size:11px;color:rgba(220,228,240,.65)">${done ? `Récompense reçue : +${fmtN(REWARD)} métal. Merci, commandant.`
        : `${n} / ${GOAL} appareils ont ouvert ton lien · <b style="color:#ffb15a">+${fmtN(REWARD)} métal</b> à ${GOAL}`}</div>`;
  }
  // carte en tête de la cloche
  function card() {
    if (!token()) return '';
    if (Date.now() - lastAt > 30000) setTimeout(() => refresh().then(renderCard), 0);   // progression à jour à l'ouverture de la cloche
    return `<div id="sb-invite-card" onclick="SBInvite.open()" style="margin:10px 12px 4px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,177,90,.35);background:rgba(60,35,10,.28);cursor:pointer">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="font-size:10px;letter-spacing:.14em;font-weight:700;color:#ffb15a">INVITER DES COMMANDANTS</div>
        <div style="font-size:11px;color:#ffd2a0">Partager ›</div></div>
      ${progressHtml(cached)}</div>`;
  }
  function renderCard() { const c = document.getElementById('sb-invite-card'); if (c) c.outerHTML = card(); }

  function close() { const o = document.getElementById('sb-invite'); if (o) o.remove(); }
  async function open() {
    if (typeof sbNotifClose === 'function') sbNotifClose();
    if (!token()) { if (typeof toast === 'function') toast('Connecte-toi au registre pour inviter des commandants'); return; }
    if (!cached || !cached.code) await refresh();
    if (!cached || !cached.code) {
      const missing = /PGRST202|Could not find the function|mp_ref_state/.test(lastErr);
      if (typeof toast === 'function') toast(missing ? 'Les invitations ne sont pas encore ouvertes sur le registre : reviens un peu plus tard'
        : /JWT|401|expired/i.test(lastErr) ? 'Ta session a expiré : relance le jeu puis réessaie'
        : 'Le registre ne répond pas, réessaie dans un instant');
      return;
    }
    close();
    const o = document.createElement('div'); o.id = 'sb-invite';
    o.style.cssText = 'position:fixed;inset:0;z-index:9100';
    const btn = (id, label, primary) => `<button id="${id}" type="button" style="width:100%;padding:13px;border-radius:10px;font:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;
      ${primary ? 'border:1px solid rgba(255,177,90,.6);background:rgba(255,177,90,.16);color:#ffd2a0' : 'border:1px solid rgba(255,255,255,.14);background:transparent;color:#e6f0ff'}">${label}</button>`;
    o.innerHTML = `<div data-x style="position:absolute;inset:0;background:rgba(2,4,8,.6)"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;background:#0a1018;border-top:1px solid rgba(255,177,90,.35);border-radius:16px 16px 0 0;padding:18px 16px calc(18px + var(--sab, 0px))">
        <div style="display:flex;align-items:center"><div style="flex:1;font-weight:800;letter-spacing:.14em;font-size:13px;color:#e6f0ff">INVITER DES COMMANDANTS</div>
          <button data-x type="button" aria-label="Fermer" style="background:none;border:0;color:#9aa6b4;font-size:24px;line-height:1;padding:0 4px">×</button></div>
        <div style="font-size:12px;color:rgba(220,228,240,.75);line-height:1.55;margin-top:10px">Envoie ton lien à tes amis. Quand <b>${GOAL} appareils différents</b> l'ont ouvert, tu reçois <b style="color:#ffb15a">${fmtN(REWARD)} métal</b>, une seule fois.</div>
        ${progressHtml(cached)}
        <div style="margin:12px 0;padding:10px 12px;border-radius:9px;background:rgba(255,255,255,.04);font-family:'JetBrains Mono',monospace;font-size:12px;color:#ffd2a0;word-break:break-all">${esc(link())}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${navigator.share ? btn('sbi-share', 'Partager', true) : ''}
          ${btn('sbi-wa', 'WhatsApp', !navigator.share)}
          ${btn('sbi-copy', 'Copier le lien', false)}
        </div>
        <div style="font-size:11px;color:rgba(220,228,240,.5);line-height:1.5;margin-top:10px">WhatsApp limite chaque envoi à 5 conversations : partage plusieurs fois, ou passe par une liste de diffusion, un groupe ou ton statut.</div></div>`;
    document.body.appendChild(o);
    o.querySelectorAll('[data-x]').forEach(x => x.addEventListener('click', close));
    const sh = o.querySelector('#sbi-share');
    if (sh) sh.addEventListener('click', async () => {
      try { await navigator.share({ title: 'Starbyte', text: message().replace(' ' + link(), ''), url: link() }); } catch (e) {}
    });
    o.querySelector('#sbi-wa').addEventListener('click', () => { window.open('https://wa.me/?text=' + encodeURIComponent(message()), '_blank'); });
    o.querySelector('#sbi-copy').addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(message()); ok = true; } catch (e) {}
      if (typeof toast === 'function') toast(ok ? 'Lien copié : colle-le dans ton message' : link());
    });
  }

  // ── popups de lancement : une seule par lancement ; l'email passe avant l'invitation ──
  function calmMoment() {
    const pl = document.getElementById('scr-planet');
    if (!pl || pl.classList.contains('hidden') || document.hidden) return false;
    if (typeof G === 'undefined' || !G || !G.tuto || !G.tuto.done) return false;   // pas pendant les premiers pas
    if (typeof _sbModalType !== 'undefined' && _sbModalType) return false;          // une autre fenêtre est ouverte
    if (document.getElementById('sb-notif') || document.getElementById('sb-invite')) return false;
    return true;
  }

  // « N'oublie pas de lier un email » : tant que la partie n'est pas liée, au plus une fois tous les 2 jours
  (function emailPopup() {
    const EVERY = 2 * 24 * 3600 * 1000;
    if (Date.now() - (ls.get('sb_mail_pop', 0) || 0) < EVERY) return;
    let tries = 0;
    window._sbMailPending = true;                                                       // l'invitation attend son tour
    const tryShow = async () => {
      const C = window.SBCloud;
      if (C && C.status === 'ok' && C.isLinked && C.isLinked()) { window._sbMailPending = false; return; }   // déjà liée : rien à dire
      if (++tries > 40 || window._sbLaunchPopup) { window._sbMailPending = false; return; }
      if (!C || C.status !== 'ok' || !calmMoment()) { setTimeout(tryShow, 15000); return; }
      window._sbLaunchPopup = 'email'; window._sbMailPending = false;
      ls.set('sb_mail_pop', Date.now());
      const ok = typeof sbConfirm === 'function' ? await sbConfirm({
        title: 'Sauvegarde ta partie',
        body: `N'oublie pas de <b>lier un email</b> à ta partie.<br><br>Sans email, si tu changes de téléphone ou si tu effaces le navigateur, ton empire est perdu. Avec un email, tu le retrouves partout, sur tous tes appareils.`,
        confirmLabel: 'Lier un email', cancelLabel: 'Plus tard',
      }) : false;
      if (ok && C.linkFlow) C.linkFlow();
    };
    setTimeout(tryShow, 18000);
  })();

  // « Tu aimes Starbyte ? » : aux 3 premiers lancements, puis une fois par mois
  (function invitePopup() {
    const MONTH = 30 * 24 * 3600 * 1000;
    const st = ls.get('sb_inv_pop', { n: 0, last: 0 });
    const due = (st.n || 0) < 3 || Date.now() - (st.last || 0) >= MONTH;
    if (!due) return;
    let tries = 0;
    const tryShow = async () => {
      if (++tries > 40 || window._sbLaunchPopup) return;   // ~10 min sans moment calme, ou l'email est passé avant : prochain lancement
      if (window._sbMailPending || !calmMoment() || !token()) { setTimeout(tryShow, 15000); return; }
      window._sbLaunchPopup = 'invite';
      ls.set('sb_inv_pop', { n: (st.n || 0) + 1, last: Date.now() });
      const done = (cached && cached.claimed) || (typeof G !== 'undefined' && G && G.refRewardGiven);
      const ok = typeof sbConfirm === 'function' ? await sbConfirm({
        title: 'Tu aimes Starbyte ?',
        body: `Envoie le jeu à tous tes amis pour qu'ils te rejoignent dans l'amas. L'univers vient de s'ouvrir : ensemble, vous serez parmi les premiers empires.`
          + (done ? '' : `<br><br>Quand <b>${GOAL} appareils</b> auront ouvert ton lien, tu recevras <b style="color:#ffb15a">${fmtN(REWARD)} métal</b>.`),
        confirmLabel: 'Inviter mes amis', cancelLabel: 'Plus tard',
      }) : false;
      if (ok) open();
    };
    setTimeout(tryShow, 20000);
  })();

  window.SBInvite = { open, close, card, refresh, link, get state() { return cached; } };
})();
