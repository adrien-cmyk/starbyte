/* Starbyte — Radio de bord (juke-box). Bouton rond au-dessus de « Recentrer » sur la carte planète,
   panneau de stations par ambiance : Galaxie (bande originale « Awesome Mix »), Jazz, Mexique.
   Stations sélectionnées à la main + stations en direct de l'annuaire libre radio-browser.info (HTTPS uniquement).
   iOS : le son ne démarre qu'après un appui du joueur (c'est toujours le cas ici). */
(function () {
  const CURATED = {
    galaxie: [
      { name: 'Left Coast 70s', sub: 'SomaFM · rock & soft 70s', url: 'https://ice2.somafm.com/seventies-128-mp3' },
      { name: 'FIP Groove', sub: 'Radio France · soul, funk', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3' },
      { name: 'FIP Rock', sub: 'Radio France · rock', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3' },
      { name: 'Space Station Soma', sub: 'SomaFM · ambient spatial', url: 'https://ice2.somafm.com/spacestation-128-mp3' },
      { name: 'Secret Agent', sub: 'SomaFM · espionnage lounge', url: 'https://ice2.somafm.com/secretagent-128-mp3' },
    ],
    jazz: [
      { name: 'Radio Swiss Jazz', sub: 'SRG SSR · jazz & soul', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
      { name: 'FIP Jazz', sub: 'Radio France · jazz', url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' },
      { name: 'TSF Jazz', sub: 'Paris · jazz', url: 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3' },
      { name: 'Sonic Universe', sub: 'SomaFM · jazz moderne', url: 'https://ice2.somafm.com/sonicuniverse-128-mp3' },
    ],
    mexique: [
      { name: 'FIP Monde', sub: 'Radio France · musiques du monde', url: 'https://icecast.radiofrance.fr/fipworld-midfi.mp3' },
    ],
  };
  const CATS = [
    { key: 'galaxie', label: 'Galaxie', hint: 'Awesome Mix', query: 'tag=70s&order=clickcount&reverse=true' },
    { key: 'jazz', label: 'Jazz', hint: 'Swing, soul', query: 'tag=jazz&order=clickcount&reverse=true' },
    { key: 'mexique', label: 'Mexique', hint: 'Ranchera, mariachi', query: 'countrycode=MX&order=clickcount&reverse=true' },
  ];
  const MIRRORS = ['de1', 'nl1', 'at1', 'fi1'];
  const live = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sb-radio-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sb-radio-' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const audio = new Audio(); audio.preload = 'none';
  audio.volume = store.get('vol', 0.7);
  let current = null, cat = store.get('cat', 'galaxie');

  const css = `
  #sb-radio-btn { position:absolute; right:12px; bottom:calc(var(--sab, 0px) + 146px); z-index:20; width:44px; height:44px; padding:10px;
    border-radius:50%; background:rgba(10,16,24,.66); border:1px solid rgba(150,190,220,.25); color:rgba(200,215,225,.85); cursor:pointer;
    display:grid; place-items:center; -webkit-tap-highlight-color:transparent; }
  #sb-radio-btn.on { color:#ffb15a; border-color:rgba(255,177,90,.6); box-shadow:0 0 14px rgba(255,150,60,.35); }
  #sb-radio-btn.on .wave { animation: sbRadioWave 1.4s ease-in-out infinite; }
  @keyframes sbRadioWave { 50% { opacity:.35; } }
  #sb-radio { position:fixed; left:0; right:0; bottom:0; z-index:9000; padding:16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
    background:rgba(8,12,18,.96); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-top:1px solid rgba(150,190,220,.18);
    border-radius:16px 16px 0 0; transform:translateY(105%); transition:transform .28s ease; max-height:72vh; display:flex; flex-direction:column; gap:12px;
    font-family:inherit; color:#e8ecf1; }
  #sb-radio.open { transform:none; }
  #sb-radio .hd { display:flex; align-items:center; gap:10px; }
  #sb-radio .hd b { font-size:12px; letter-spacing:.18em; text-transform:uppercase; flex:1; }
  #sb-radio .x { background:none; border:0; color:rgba(200,215,225,.7); font-size:22px; line-height:1; padding:4px 8px; cursor:pointer; }
  #sb-radio .now { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,.04); }
  #sb-radio .now .t { flex:1; min-width:0; }
  #sb-radio .now .n { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #sb-radio .now .s { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:rgba(190,208,220,.6); margin-top:2px; }
  #sb-radio .pp { width:40px; height:40px; border-radius:50%; border:1px solid rgba(255,177,90,.5); background:rgba(60,35,10,.6); color:#ffb15a; font-size:15px; cursor:pointer; }
  #sb-radio input[type=range] { width:90px; accent-color:#ffb15a; }
  #sb-radio .tabs { display:flex; gap:6px; }
  #sb-radio .tabs button { flex:1; padding:9px 6px; border-radius:9px; border:1px solid rgba(150,190,220,.18); background:transparent; color:rgba(200,215,225,.75);
    font-size:11px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
  #sb-radio .tabs button.on { border-color:rgba(255,177,90,.55); color:#ffb15a; background:rgba(60,35,10,.35); }
  #sb-radio .tabs small { display:block; font-size:9px; letter-spacing:.06em; text-transform:none; opacity:.6; margin-top:2px; }
  #sb-radio .list { overflow-y:auto; -webkit-overflow-scrolling:touch; display:flex; flex-direction:column; gap:4px; min-height:0; }
  #sb-radio .st { display:flex; align-items:center; gap:10px; text-align:left; padding:10px 12px; border-radius:9px; border:1px solid transparent;
    background:rgba(255,255,255,.025); color:inherit; cursor:pointer; font:inherit; }
  #sb-radio .st.on { border-color:rgba(255,177,90,.45); background:rgba(60,35,10,.3); }
  #sb-radio .st .n { font-size:13px; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #sb-radio .st .s { font-size:10px; color:rgba(190,208,220,.55); white-space:nowrap; }
  #sb-radio .sep { font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:rgba(190,208,220,.5); padding:8px 2px 2px; }
  #sb-radio .msg { font-size:11px; color:rgba(190,208,220,.55); padding:6px 2px; }`;
  const ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="9" width="18" height="11" rx="2"/><circle cx="15.5" cy="14.5" r="2.6"/><line x1="6.5" y1="13" x2="10.5" y2="13"/><line x1="6.5" y1="16" x2="10.5" y2="16"/>
    <line x1="7" y1="9" x2="17" y2="3.5"/><path class="wave" d="M19 3.5a5 5 0 0 1 2 2.5"/></svg>`;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const panel = el(`<div id="sb-radio" role="dialog" aria-label="Radio de bord">
    <div class="hd"><b>Radio de bord</b><button class="x" aria-label="Fermer">×</button></div>
    <div class="now"><button class="pp" aria-label="Lecture">▶</button><div class="t"><div class="n">Aucune station</div><div class="s">Choisis une station</div></div>
      <input type="range" min="0" max="1" step="0.05" aria-label="Volume"></div>
    <div class="tabs"></div><div class="list"></div></div>`);
  document.body.appendChild(panel);
  const $ = (s) => panel.querySelector(s);
  $('input').value = audio.volume;
  $('input').addEventListener('input', (e) => { audio.volume = +e.target.value; store.set('vol', audio.volume); });
  $('.x').addEventListener('click', () => panel.classList.remove('open'));
  $('.pp').addEventListener('click', () => { if (!current) { const f = (CURATED[cat] || [])[0]; if (f) play(f); return; } if (audio.paused) play(current); else stop(); });
  document.addEventListener('pointerdown', (e) => { if (panel.classList.contains('open') && !panel.contains(e.target) && !(e.target.closest && e.target.closest('#sb-radio-btn'))) panel.classList.remove('open'); }, true);

  function toast(m) { if (typeof window.toast === 'function') window.toast(m); }
  function refreshNow() {
    $('.now .n').textContent = current ? current.name : 'Aucune station';
    $('.now .s').textContent = current ? (audio.paused ? 'En pause' : 'En direct · ' + (current.sub || '')) : 'Choisis une station';
    $('.pp').textContent = current && !audio.paused ? '❚❚' : '▶';
    const b = document.getElementById('sb-radio-btn'); if (b) b.classList.toggle('on', !!current && !audio.paused);
    panel.querySelectorAll('.st').forEach(x => x.classList.toggle('on', !!current && x.dataset.url === current.url));
  }
  function play(s) {
    current = s; store.set('last', s);
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // SFX_2410 : la radio garde sa session lecture
    audio.src = s.url; audio.load();
    audio.play().then(refreshNow).catch(() => { toast('Station indisponible — essaie une autre'); refreshNow(); });
    refreshNow();
  }
  function stop() { audio.pause(); refreshNow(); }
  audio.addEventListener('playing', refreshNow); audio.addEventListener('pause', refreshNow);
  audio.addEventListener('error', () => { if (current && audio.src) { toast(`${current.name} : flux indisponible`); } refreshNow(); });
  if ('mediaSession' in navigator) { try { navigator.mediaSession.setActionHandler('pause', stop); navigator.mediaSession.setActionHandler('play', () => current && play(current)); } catch (e) {} }

  async function fetchLive(c) {
    if (live[c.key]) return live[c.key];
    for (const m of MIRRORS) {
      try {
        const r = await fetch(`https://${m}.api.radio-browser.info/json/stations/search?${c.query}&hidebroken=true&is_https=true&limit=40`, { headers: { 'Accept': 'application/json' } });
        if (!r.ok) continue;
        const js = await r.json();
        const seen = new Set((CURATED[c.key] || []).map(s => s.url));
        live[c.key] = js.filter(s => /^https:/.test(s.url_resolved || '') && !seen.has(s.url_resolved) && (seen.add(s.url_resolved), true))
          .slice(0, 20).map(s => ({ name: (s.name || '').trim() || 'Station', sub: [s.state || s.country, s.codec].filter(Boolean).join(' · '), url: s.url_resolved }));
        return live[c.key];
      } catch (e) { /* miroir suivant */ }
    }
    return (live[c.key] = []);
  }
  function row(s) {
    const b = el(`<button class="st"><span class="n"></span><span class="s"></span></button>`);
    b.dataset.url = s.url; b.querySelector('.n').textContent = s.name; b.querySelector('.s').textContent = s.sub || '';
    b.addEventListener('click', () => play(s)); return b;
  }
  async function renderList() {
    const tabs = $('.tabs'); tabs.innerHTML = '';
    CATS.forEach(c => { const b = el(`<button>${c.label}<small>${c.hint}</small></button>`); b.classList.toggle('on', c.key === cat); b.onclick = () => { cat = c.key; store.set('cat', cat); renderList(); }; tabs.appendChild(b); });
    const list = $('.list'); list.innerHTML = '';
    const c = CATS.find(x => x.key === cat);
    (CURATED[cat] || []).forEach(s => list.appendChild(row(s)));
    list.appendChild(el(`<div class="sep">En direct de l'annuaire mondial</div>`));
    const msg = el(`<div class="msg">Recherche des stations…</div>`); list.appendChild(msg);
    const more = await fetchLive(c);
    if (cat !== c.key) return;
    msg.remove();
    if (!more.length) list.appendChild(el(`<div class="msg">Annuaire injoignable pour le moment.</div>`));
    more.forEach(s => list.appendChild(row(s)));
    refreshNow();
  }
  function open() { panel.classList.add('open'); renderList(); }
  const last = store.get('last', null); if (last && last.url) current = last;

  // bouton : posé à côté de « Recentrer » (même conteneur que la carte) dès qu'il existe
  function mountBtn() {
    if (document.getElementById('sb-radio-btn')) return;
    const center = document.querySelector('.w-center');
    if (!center || !center.parentNode) return;
    const b = el(`<button id="sb-radio-btn" aria-label="Radio">${ICON}</button>`);
    b.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.contains('open') ? panel.classList.remove('open') : open(); });
    center.parentNode.insertBefore(b, center);
    refreshNow();
  }
  setInterval(mountBtn, 800); mountBtn();
  window.SBRadio = { open, play, stop, get current() { return current; }, get playing() { return !!current && !audio.paused; } };
})();
