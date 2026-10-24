/* Starbyte — Bruitages (SFX_2410, 24/10/2026, demande d'Adrien : « essayons un peu de son »)
   Sons synthétisés en direct (Web Audio) : rien à télécharger. Esprit « cockpit premium » : doux, cristallins, feutrés.
   - match-3 : sobre (24/10) : petits bruits de pierre et de gravats, coups sourds à hauteur fixe, explosions de mine lointaines ;
     ni mélodie ni moteur, rien qui monte en hauteur
   - planète : construction terminée ; flotte et tanker de retour ; léger « tic » sur les boutons
   - iPhone : le son ne démarre qu'après un toucher ; les bruitages respectent le bouton silencieux et se mêlent
     à la musique du joueur (session « ambient ») ; la radio de bord garde sa session « playback ».
   - réglage : panneau de la radio de bord (Bruitages oui/non + volume), mémorisé sur l'appareil.
   API : SBSfx.play(nom), SBSfx.m3Step(étape du match-3), SBSfx.on / SBSfx.setOn(bool). */
(function () {
  if (window.SBSfx) return;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sb_sfx_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sb_sfx_' + k, JSON.stringify(v)); } catch (e) {} },
  };
  let on = !!store.get('on', true);
  let vol = Math.max(0, Math.min(1, +store.get('vol', 0.7) || 0));
  let ctx = null, master = null, verbIn = null, noiseBuf = null;

  function impulse(c, sec, decay) {
    const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = vol * 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 1.8, 2.8);
    const vg = ctx.createGain(); vg.gain.value = 0.28; verb.connect(vg); vg.connect(master); verbIn = verb;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // iPhone : bruitages = session « ambient » (bouton silencieux respecté, la musique du joueur continue) ; la radio = « playback »
  function session() {
    try {
      if (!navigator.audioSession) return;
      const want = (window.SBRadio && window.SBRadio.playing) ? 'playback' : 'ambient';
      if (navigator.audioSession.type !== want) navigator.audioSession.type = want;
    } catch (e) {}
  }
  function unlock() {
    if (!on) return;
    const c = ensure(); if (!c) return;
    session();
    if (c.state !== 'running') { try { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  }
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { const r = document.hidden ? ctx.suspend() : (on ? ctx.resume() : null); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  });
  function ready() { return on && !document.hidden && ctx && ctx.state === 'running'; }

  // ── voix ──
  function out(node, rev, pan) {
    let n = node;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; }
    n.connect(master);
    if (rev > 0 && verbIn) { const s = ctx.createGain(); s.gain.value = rev; n.connect(s); s.connect(verbIn); }
  }
  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(o) {
    const t = o.t != null ? o.t : ctx.currentTime, a = o.a || 0.004, d = o.d || 0.25;
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + a + d * (o.glide || 1));
    const g = ctx.createGain(); env(g, t, a, d, o.g || 0.2);
    let n = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.7; g.connect(f); n = f; }
    osc.connect(g); out(n, o.rev || 0, o.pan || 0);
    osc.start(t); osc.stop(t + a + d + 0.05);
  }
  function noise(o) {
    const t = o.t != null ? o.t : ctx.currentTime, a = o.a || 0.003, d = o.d || 0.15;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1200, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    const g = ctx.createGain(); env(g, t, a, d, o.g || 0.1);
    src.connect(f); f.connect(g); out(g, o.rev || 0, o.pan || 0);
    src.start(t, Math.random() * 0.5); src.stop(t + a + d + 0.05);
  }
  // cloche de verre : fondamentale + partiel inharmonique qui s'éteint plus vite
  function bell(f, t, g, d, rev, pan) {
    tone({ f, t, a: 0.003, d: d || 0.5, g: g || 0.16, rev: rev == null ? 0.35 : rev, pan });
    tone({ f: f * 2.76, t, a: 0.002, d: (d || 0.5) * 0.35, g: (g || 0.16) * 0.28, rev: rev == null ? 0.35 : rev, pan });
    tone({ f: f * 2.0, t, a: 0.002, d: (d || 0.5) * 0.6, g: (g || 0.16) * 0.12, rev: 0, pan });
  }
  // ── batterie (match-3 : uniquement des drums, décision d'Adrien 24/10) ──
  // ── petits bruits de chantier / forage (match-3, 24/10) : moteur de foreuse, cliquet, vérin, gravats, mini-explosions ──
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MX = {
    // moteur de foreuse : sifflement aigu de perceuse électrique (deux ondes légèrement désaccordées, filtre passe-bande)
    // + grincement de la mèche sur la roche ; léger tremblement doux (pas de hachage grave, qui sonnait comme un pet)
    motor(t, f1, f2, d, g, chop) {
      const F1 = Math.max(260, f1 * 4.5), F2 = Math.max(260, f2 * 4.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(F1 * 2, t); bp.frequency.exponentialRampToValueAtTime(Math.min(6000, F2 * 2), t + d);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
      const trem = ctx.createGain(); trem.gain.value = 0.85;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(14 + (chop || 38) * 0.25, t);
      const lg = ctx.createGain(); lg.gain.value = 0.15; lfo.connect(lg); lg.connect(trem.gain);
      const v = ctx.createGain(); v.gain.setValueAtTime(0.0001, t);
      v.gain.exponentialRampToValueAtTime(g, t + Math.min(0.04, d * 0.25)); v.gain.setValueAtTime(g, t + d * 0.7);
      v.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const oscs = [0, 7].map(det => { const o = ctx.createOscillator(); o.type = 'square'; o.detune.value = det;
        o.frequency.setValueAtTime(F1, t); o.frequency.exponentialRampToValueAtTime(F2, t + d); o.connect(bp); return o; });
      bp.connect(hp); hp.connect(trem); trem.connect(v); out(v, 0.06, 0);
      noise({ t, filter: 'bandpass', f: 3200, f2: 4200, q: 2, a: 0.02, d: d * 0.9, g: g * 0.35 });   // la mèche mord la roche
      oscs.forEach(o => { o.start(t); o.stop(t + d + 0.05); }); lfo.start(t); lfo.stop(t + d + 0.05);
    },
    // version sobre (24/10) : rien qui « chante » — coups sourds à hauteur fixe, pierre, gravats, air
    thud(t, g) { tone({ f: 68, t, a: 0.003, d: 0.07, g, lp: 300 }); noise({ t, filter: 'lowpass', f: 600, q: 0.7, a: 0.002, d: 0.06, g: g * 0.6 }); },
    tap(t, g, f) { noise({ t, filter: 'bandpass', f: f || rnd(1100, 1400), q: 3, a: 0.001, d: 0.014, g: g * 3.5 }); },
    trickle(t, d, g) { MX.gravel(t, Math.round(d * 40), d, g); },
    // gravats : grains de poussière et de cailloux
    gravel(t, n, d, g) {
      for (let k = 0; k < n; k++) noise({ t: t + Math.random() * d, filter: 'lowpass', f: rnd(1200, 3200), q: 0.8, a: 0.001, d: rnd(0.006, 0.02), g: g * rnd(0.5, 1), pan: rnd(-0.5, 0.5) });
    },
    // coup de pioche / bloc qui tombe
    chunk(t, g) {
      tone({ f: rnd(85, 110), f2: 50, t, a: 0.002, d: 0.09, g: g, glide: 0.5, lp: 500 });
      noise({ t, filter: 'bandpass', f: rnd(500, 750), q: 1.5, a: 0.001, d: 0.05, g: g * 0.8 });
    },
    // déclic d'outil (cliquet, verrou)
    click(t, g) { noise({ t, filter: 'bandpass', f: rnd(2300, 2900), q: 4, a: 0.001, d: 0.012, g }); tone({ f: 180, t, type: 'triangle', a: 0.001, d: 0.02, g: g * 0.4 }); },
    // vérin hydraulique : sifflement d'air
    hiss(t, d, g) { noise({ t, filter: 'highpass', f: 2600, q: 0.6, a: 0.02, d, g, rev: 0.1 }); },
    // mini-explosion de mine : coup grave + grondement + gravats
    blast(t, g, len) {
      tone({ f: 55, t, a: 0.004, d: 0.2 * len, g, lp: 250 });
      noise({ t, filter: 'lowpass', f: 900, f2: 180, q: 0.7, a: 0.004, d: 0.5 * len, g: g * 0.7, rev: 0.2 });
      MX.gravel(t + 0.06, Math.round(8 * len), 0.35 * len, g * 0.25);
    },
  };
  const DR = { crash() {} };   // ancien jeu de batterie, retiré

  // gamme pentatonique (do majeur) : les alignements montent avec la cascade
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  const note = (i) => 523.25 * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, i))] / 12);

  const SOUNDS = {
    tap(t) { tone({ f: 1500, f2: 950, t, a: 0.002, d: 0.04, g: 0.09 }); },
    // match-3 : sobre — pierre, gravats, coups sourds (aucune hauteur qui monte)
    swap(t) { MX.tap(t, 0.16); },
    nope(t) { MX.tap(t, 0.07, 700); MX.tap(t + 0.09, 0.06, 650); },
    bonus(t) { MX.tap(t, 0.06); MX.tap(t + 0.07, 0.06); },
    tier(t) { MX.thud(t, 0.22); MX.trickle(t + 0.04, 0.4, 0.035); },
    tier3(t) { MX.blast(t, 0.3, 1.2); MX.trickle(t + 0.3, 0.7, 0.03); },
    finish(t) { MX.trickle(t, 0.5, 0.03); MX.thud(t + 0.35, 0.18); },
    build(t) {
      bell(523.3, t, 0.14, 0.7, 0.4); bell(784, t + 0.16, 0.14, 1.0, 0.45);
      tone({ f: 130.8, t, a: 0.08, d: 0.9, g: 0.06, rev: 0.3 });
    },
    dock(t) {
      noise({ t, filter: 'lowpass', f: 1400, f2: 300, a: 0.15, d: 0.5, g: 0.06, rev: 0.2 });
      tone({ f: 220, t: t + 0.1, a: 0.02, d: 0.35, g: 0.09, rev: 0.3 });
      tone({ f: 330, t: t + 0.28, a: 0.02, d: 0.5, g: 0.08, rev: 0.35 });
    },
    fleet(t) {
      tone({ f: 110, t, type: 'sawtooth', a: 0.12, d: 0.7, g: 0.07, lp: 700, rev: 0.3 });
      tone({ f: 165, t: t + 0.05, type: 'sawtooth', a: 0.12, d: 0.7, g: 0.05, lp: 700, rev: 0.3 });
      bell(659.3, t + 0.25, 0.08, 0.8, 0.45);
    },
    charge(t) { MX.blast(t, 0.24, 0.7); },
    core(t) { MX.blast(t, 0.32, 1.1); },
    forge(t) { MX.hiss(t, 0.1, 0.05); },
    crack(t) { MX.gravel(t, 4, 0.05, 0.15); },
    tick(t) { MX.gravel(t, 2, 0.02, 0.12); },
  };

  const last = {};
  const GAP = { tap: 0.05, swap: 0.05, crack: 0.04, tick: 0.04, build: 0.6, dock: 0.8, fleet: 0.8 };
  function play(name, delay) {
    if (!ready() || !SOUNDS[name]) return;
    const t = ctx.currentTime + (delay || 0);
    if (last[name] && t - last[name] < (GAP[name] || 0.02)) return;
    last[name] = t;
    session();
    try { SOUNDS[name](t); } catch (e) {}
  }

  // une étape du match-3 : { cascade, runs, maxRun, created, blasts, rocksCracked, rocksBroken }
  function m3Step(e, delay) {
    if (!ready() || !e) return;
    session();
    try {
      const t = ctx.currentTime + 0.02 + (delay || 0);
      const c = Math.max(0, e.cascade | 0);
      const runs = Array.isArray(e.runs) ? e.runs.length : 0;
      // un coup sourd et quelques gravats ; la cascade ne change pas de hauteur, seulement un peu plus de matière
      MX.thud(t, 0.14 + Math.min(c, 4) * 0.015);
      MX.gravel(t + 0.015, 2 + runs + Math.min(c, 4), 0.07, 0.04);
      const blasts = Array.isArray(e.blasts) ? e.blasts : [];
      blasts.slice(0, 2).forEach((b, k) => (b && b.kind === 'charge' ? SOUNDS.charge : SOUNDS.core)(t + 0.03 + k * 0.12));
      if (Array.isArray(e.created) && e.created.length) SOUNDS.forge(t + 0.1);
      const broken = Array.isArray(e.rocksBroken) ? e.rocksBroken.length : 0;
      const cracked = Array.isArray(e.rocksCracked) ? e.rocksCracked.length : 0;
      for (let k = 0; k < Math.min(broken, 3); k++) SOUNDS.crack(t + 0.04 + k * 0.035);
      if (!broken && cracked) SOUNDS.tick(t + 0.04);
    } catch (err) {}
  }

  // léger « tic » sur les boutons de l'interface
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('button, .btn, .btn-ghost, .btn-nuke, [role="button"]');
    if (b && !b.disabled) play('tap');
  }, { capture: true, passive: true });

  function setOn(v) {
    on = !!v; store.set('on', on);
    if (on) unlock(); else if (ctx) { try { const r = ctx.suspend(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
    refreshUi();
  }
  function setVol(v) {
    vol = Math.max(0, Math.min(1, +v || 0)); store.set('vol', vol);
    if (master) master.gain.value = vol * 0.55;
  }

  // ── réglage dans le panneau de la radio de bord ──
  function refreshUi() {
    const r = document.getElementById('sb-sfx-row'); if (!r) return;
    const b = r.querySelector('button'); b.textContent = on ? 'Activés' : 'Coupés'; b.classList.toggle('on', on);
    r.querySelector('input').disabled = !on;
  }
  function mountUi() {
    const panel = document.getElementById('sb-radio');
    if (!panel || document.getElementById('sb-sfx-row')) return;
    const st = document.createElement('style');
    st.textContent = `#sb-sfx-row { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(150,190,220,.12); }
      #sb-sfx-row span { flex:1; font-size:12px; color:rgba(220,230,238,.85); }
      #sb-sfx-row button { padding:6px 12px; border-radius:8px; border:1px solid rgba(150,190,220,.25); background:transparent; color:rgba(200,215,225,.7); font:inherit; font-size:11px; letter-spacing:.08em; cursor:pointer; }
      #sb-sfx-row button.on { border-color:rgba(255,177,90,.55); color:#ffb15a; background:rgba(60,35,10,.35); }
      #sb-sfx-row input { width:80px; }`;
    document.head.appendChild(st);
    const row = document.createElement('div'); row.id = 'sb-sfx-row';
    row.innerHTML = '<span>Bruitages du jeu</span><input type="range" min="0" max="1" step="0.05" aria-label="Volume des bruitages"><button type="button"></button>';
    const now = panel.querySelector('.now');
    if (now && now.nextSibling) panel.insertBefore(row, now.nextSibling); else panel.appendChild(row);
    const inp = row.querySelector('input'); inp.value = vol;
    inp.addEventListener('input', (e) => setVol(e.target.value));
    inp.addEventListener('change', () => play('build'));
    row.querySelector('button').addEventListener('click', () => { setOn(!on); if (on) setTimeout(() => play('build'), 60); });
    refreshUi();
  }
  setInterval(mountUi, 1500); mountUi();

  window.SBSfx = { play, m3Step, setOn, setVol, get on() { return on; } };
})();
