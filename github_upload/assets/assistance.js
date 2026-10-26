/* Assistance de bord dans le jeu (26/10, Adrien) — le même assistant IA que starbyte.online, ouvert depuis la cloche.
   La conversation part vers https://starbyte.online/api/chat.php (clé et consignes restent sur le serveur, CORS ouvert
   à play.starbyte.online). Une courte ligne de contexte (niveau de planète, Centre, ressources) accompagne chaque question
   pour que l'assistant réponde sur la partie du joueur ; rien d'autre ne quitte le jeu. */
(function () {
  'use strict';
  const API = 'https://starbyte.online/api/chat.php';
  const SUPPORT = 'empire@starbyte.online';
  const GREET = 'Bonjour, commandant. Une question sur une règle, un bâtiment, un coût, ou tu es bloqué quelque part ? Je t’explique.';
  const SUG = ['Comment débloquer le vaisseau colonial ?', 'Comment ouvrir de nouvelles parcelles ?', 'À quoi servent les balises ?'];
  let history = [], busy = false;

  // l'API n'accepte que les pages de starbyte.online (et le test local, qui la verra refuser)
  const available = () => /(^|\.)starbyte\.online$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.floor(n || 0).toLocaleString('fr-CH');

  function context() {
    try {
      const g = (typeof G !== 'undefined' && G) || window.G || {}, r = g.res || {}, p = g.planet || {};
      const res = ['metal', 'energie', 'cristal', 'biomass', 'artefact'].filter((k) => r[k])
        .map((k) => `${k} ${fmt(r[k].v)}${r[k].max ? '/' + fmt(r[k].max) : ''}`).join(', ');
      const blds = (p.parcels || []).filter((x) => x && x.building).map((x) => x.building + (x.lvl > 1 ? ' T' + x.lvl : ''));
      return `[Contexte envoyé par le jeu : planète niveau ${p.level || 0}, Centre de commandement niveau ${(g.skills && g.skills.capitalLevel) || 1}, ressources ${res || '?'}, bâtiments ${blds.slice(0, 10).join(', ') || 'aucun'}]`;
    } catch (e) { return ''; }
  }

  function card() {
    if (!available()) return '';
    return `<div id="sb-ab-card" onclick="SBAssist.open()" style="margin:10px 12px 4px;padding:12px 14px;border-radius:12px;border:1px solid rgba(110,200,255,.35);background:rgba(10,40,60,.32);cursor:pointer">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="font-size:10px;letter-spacing:.14em;font-weight:700;color:#7fd0ff">ASSISTANCE DE BORD</div>
        <div style="font-size:11px;color:#bfe6ff">Poser une question ›</div></div>
      <div style="font-size:11px;color:rgba(220,228,240,.65);margin-top:6px">Règles, coûts, blocages : l’assistant répond tout de suite, sans rien te dévoiler des secrets de l’univers.</div></div>`;
  }

  function css() {
    if (document.getElementById('sb-ab-css')) return;
    const st = document.createElement('style'); st.id = 'sb-ab-css';
    st.textContent = `#sb-ab{position:fixed;inset:0;z-index:9001}
      #sb-ab .ab-bg{position:absolute;inset:0;background:rgba(2,4,8,.6)}
      #sb-ab .ab-sh{position:absolute;left:0;right:0;bottom:0;height:min(84vh,720px);display:flex;flex-direction:column;background:#0a1018;border-top:1px solid rgba(110,200,255,.35);border-radius:16px 16px 0 0;padding-bottom:var(--sab,0px)}
      #sb-ab .ab-hd{display:flex;align-items:center;gap:10px;padding:16px 16px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
      #sb-ab .ab-tt{flex:1;font-weight:800;letter-spacing:.14em;font-size:13px;color:#e6f0ff}
      #sb-ab .ab-tt small{display:block;font-weight:500;letter-spacing:.04em;font-size:10px;color:#7f93a8;margin-top:2px}
      #sb-ab .ab-x{background:none;border:0;color:#9aa6b4;font-size:26px;line-height:1;padding:0 4px;cursor:pointer}
      #sb-ab .ab-log{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px}
      #sb-ab .ab-m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
      #sb-ab .ab-m.bot{align-self:flex-start;background:#132131;color:#dfe9f4;border-bottom-left-radius:4px}
      #sb-ab .ab-m.me{align-self:flex-end;background:#1d4d72;color:#fff;border-bottom-right-radius:4px}
      #sb-ab .ab-m.err{background:#2a1513;color:#ffcfc7}
      #sb-ab .ab-m a.sup{display:inline-block;margin-top:8px;padding:6px 12px;border-radius:14px;border:1px solid rgba(255,177,90,.5);color:#ffcf96;text-decoration:none;font-size:12px}
      #sb-ab .ab-ty{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#132131;border-radius:14px}
      #sb-ab .ab-ty i{width:6px;height:6px;border-radius:50%;background:#7fd0ff;opacity:.4;animation:abT 1s infinite}
      #sb-ab .ab-ty i:nth-child(2){animation-delay:.15s}#sb-ab .ab-ty i:nth-child(3){animation-delay:.3s}
      @keyframes abT{50%{opacity:1;transform:translateY(-2px)}}
      #sb-ab .ab-sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}
      #sb-ab .ab-sug button{background:rgba(110,200,255,.08);border:1px solid rgba(110,200,255,.3);color:#bfe6ff;border-radius:14px;padding:6px 10px;font-size:12px;cursor:pointer}
      #sb-ab form{display:flex;gap:8px;padding:8px 12px 12px;border-top:1px solid rgba(255,255,255,.06)}
      #sb-ab textarea{flex:1;resize:none;min-height:40px;max-height:120px;padding:10px 12px;border-radius:12px;border:1px solid rgba(110,200,255,.3);background:#0f1923;color:#e6f0ff;font:inherit;font-size:16px;line-height:1.3}
      #sb-ab form button{min-width:64px;border:0;border-radius:12px;background:#2f8fd0;color:#fff;font-weight:700;font-size:13px;cursor:pointer}
      #sb-ab form button:disabled{opacity:.5}`;
    document.head.appendChild(st);
  }

  function bubble(role, text, opts) {
    const log = document.querySelector('#sb-ab .ab-log'); if (!log) return;
    const b = document.createElement('div');
    b.className = 'ab-m ' + (role === 'user' ? 'me' : 'bot') + (opts && opts.err ? ' err' : '');
    b.textContent = text;
    if (opts && opts.support) {
      const pseudo = (window.SBMP && SBMP.world && SBMP.world.pseudo) || '';
      const convo = history.slice(-6).map((m) => (m.role === 'user' ? 'Moi : ' : 'Assistance : ') + m.content).join('\n\n').slice(0, 1500);
      const a = document.createElement('a'); a.className = 'sup'; a.textContent = 'Contacter le support';
      a.href = `mailto:${SUPPORT}?subject=${encodeURIComponent('Starbyte · aide' + (pseudo ? ' · ' + pseudo : ''))}&body=${encodeURIComponent((pseudo ? 'Commandant : ' + pseudo + '\n\n' : '') + 'Mon problème :\n\n\n---\n' + convo)}`;
      b.appendChild(document.createElement('br')); b.appendChild(a);
    }
    log.appendChild(b); log.scrollTop = log.scrollHeight;
  }

  function send(q) {
    q = String(q || '').trim(); if (!q || busy) return;
    busy = true;
    const sug = document.querySelector('#sb-ab .ab-sug'); if (sug) sug.remove();
    const btn = document.querySelector('#sb-ab form button'); if (btn) btn.disabled = true;
    bubble('user', q); history.push({ role: 'user', content: q });
    const log = document.querySelector('#sb-ab .ab-log');
    const t = document.createElement('div'); t.className = 'ab-ty'; t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); log.scrollTop = log.scrollHeight;
    // contexte de la partie collé à la dernière question seulement (l'historique reste celui du joueur)
    const msgs = history.slice(-8).map((m, i, a) => (i === a.length - 1 ? { role: m.role, content: m.content.slice(0, 480) + '\n\n' + context().slice(0, 300) } : m));
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    const fail = (m) => { t.remove(); history.pop(); bubble('assistant', m, { err: true, support: true }); };
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }), signal: ctl.signal })
      .then((r) => r.json().catch(() => ({ error: 'bad' })))
      .then((d) => {
        if (d && d.reply) {
          t.remove();
          let txt = d.reply; const sup = /\[SUPPORT\]/.test(txt);
          txt = txt.replace(/\s*\[SUPPORT\]\s*/g, ' ').trim();
          history.push({ role: 'assistant', content: txt });
          bubble('assistant', txt, { support: sup });
        } else fail(d && d.error === 'rate_limit' ? 'Tu as posé beaucoup de questions en peu de temps. Réessaie dans un moment.' : 'L’assistant est momentanément indisponible. Tu peux écrire au support.');
      })
      .catch(() => fail('L’assistant ne répond pas (réseau ?). Réessaie dans un moment, ou écris au support.'))
      .then(() => { clearTimeout(timer); busy = false; if (btn) btn.disabled = false; });
  }

  function close() { const o = document.getElementById('sb-ab'); if (o) o.remove(); }
  function open() {
    if (typeof sbNotifClose === 'function') sbNotifClose();
    css(); close();
    const o = document.createElement('div'); o.id = 'sb-ab';
    o.innerHTML = `<div class="ab-bg"></div><div class="ab-sh">
      <div class="ab-hd"><div class="ab-tt">ASSISTANCE DE BORD<small>Assistant IA de Starbyte · peut se tromper, le jeu fait foi</small></div><button class="ab-x" aria-label="Fermer">×</button></div>
      <div class="ab-log"></div>
      ${history.length ? '' : `<div class="ab-sug">${SUG.map((s) => `<button type="button">${esc(s)}</button>`).join('')}</div>`}
      <form><textarea rows="1" placeholder="Ta question…" maxlength="700" enterkeyhint="send"></textarea><button type="submit">Envoyer</button></form></div>`;
    document.body.appendChild(o);
    o.querySelector('.ab-bg').onclick = close; o.querySelector('.ab-x').onclick = close;
    if (!history.length) bubble('assistant', GREET);
    else history.forEach((m) => bubble(m.role, m.content));
    const ta = o.querySelector('textarea'), form = o.querySelector('form');
    form.onsubmit = (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ta.style.height = ''; send(q); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    const sg = o.querySelector('.ab-sug'); if (sg) sg.onclick = (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); };
  }

  window.SBAssist = { card, open, close, available };
})();
