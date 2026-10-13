/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Performance chez les joueurs (13/10/2026)

   1. Mesure, sans rien gêner : images par seconde par écran, saccades (> 100 ms),
      temps de chargement, appareil, et délai des échanges avec le registre (Supabase).
   2. Résumé envoyé toutes les 3 minutes (et quand l'app passe en arrière-plan) : mp_perf_report.
   3. Qualité automatique : si l'appareil peine (< 26 images/s pendant 8 s), la 3D s'allège
      (résolution plafonnée, puis halo lumineux coupé) ; quand ça redevient fluide (≥ 50 images/s
      pendant 30 s), la qualité remonte d'un cran. La connexion n'y change rien : elle ne ralentit
      que les échanges avec les autres commandants (signalés à part).
   4. Réglages : qualité Auto / Haute / Économe, et compteur d'images (diagnostic).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SBPerf) return;

  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  const cfg = {
    lowFps: 26, lowSecs: 8,          // on allège sous 26 images/s pendant 8 s
    highFps: 50, highSecs: 30,       // on remonte à 50 images/s pendant 30 s
    holdAfterBounceMs: 10 * 60e3,    // remonté puis redescendu en moins de 90 s : on reste au niveau bas 10 min
    flushMs: 3 * 60e3,
    hitchMs: 100,
  };
  const CAPS = [Infinity, 1.25, 1.0];   // plafond de densité de pixels par niveau
  const NAMES = ['Haute', 'Moyenne', 'Économe'];

  const st = {
    mode: LS('sb_quality_mode') || 'auto',          // 'auto' | 'high' | 'eco'
    level: Math.max(0, Math.min(2, parseInt(LS('sb_quality_level') || '0', 10) || 0)),
    holdUntil: 0, lastUpAt: 0,
    secs: [],                                        // images/s des dernières secondes (écran visible)
    buckets: {},                                     // écran → { frames:[…fps par seconde], hitches, secs }
    net: { t: [], err: 0, n: 0 },
    loadMs: null,
    session: Math.random().toString(36).slice(2, 10),
    fpsOn: LS('sb_fps_counter') === '1',
  };
  const effLevel = () => st.mode === 'high' ? 0 : st.mode === 'eco' ? 2 : st.level;

  /* ── 1. images par seconde ── */
  let last = 0, count = 0, secStart = 0, resumeAt = 0;
  const curScreen = () => { try { return (typeof getCurrentScreen === 'function' && getCurrentScreen()) || 'autre'; } catch (e) { return 'autre'; } };
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.visibilityState === 'hidden') { last = 0; return; }
    if (!last) { last = now; secStart = now; count = 0; resumeAt = now + 1500; return; }
    const dt = now - last; last = now;
    if (now < resumeAt) { secStart = now; count = 0; return; }   // reprise : on laisse le navigateur se remettre
    count++;
    const b = bucket();
    if (dt > cfg.hitchMs && dt < 5000) b.hitches++;
    if (now - secStart >= 1000) {
      const fps = count * 1000 / (now - secStart);
      secStart = now; count = 0;
      b.frames.push(fps); b.secs++;
      if (b.frames.length > 900) b.frames.splice(0, 300);
      st.secs.push(fps); if (st.secs.length > 60) st.secs.shift();
      autoQuality(now);
      drawCounter(fps);
    }
  }
  function bucket() {
    const k = curScreen();
    return st.buckets[k] || (st.buckets[k] = { frames: [], hitches: 0, secs: 0 });
  }
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

  /* ── 2. qualité automatique ── */
  function autoQuality(now) {
    if (st.mode !== 'auto') return;
    const lastN = (n) => st.secs.slice(-n);
    const low = lastN(cfg.lowSecs), high = lastN(cfg.highSecs);
    if (st.level < 2 && low.length >= cfg.lowSecs && median(low) < cfg.lowFps) {
      if (now - st.lastUpAt < 90e3) st.holdUntil = Date.now() + cfg.holdAfterBounceMs;   // ça rebondit : on se calme
      setLevel(st.level + 1, 'auto');
      st.secs = [];
    } else if (st.level > 0 && Date.now() > st.holdUntil && high.length >= cfg.highSecs && median(high) >= cfg.highFps) {
      st.lastUpAt = now;
      setLevel(st.level - 1, 'auto');
      st.secs = [];
    }
  }
  function setLevel(l, why) {
    l = Math.max(0, Math.min(2, l));
    if (l === st.level) return;
    st.level = l; LS('sb_quality_level', String(l));
    applyQuality();
    if (why === 'auto') console.info('[qualité] auto →', NAMES[l]);
    renderSettings();
  }
  function setMode(m) {
    st.mode = m; LS('sb_quality_mode', m);
    applyQuality(); renderSettings();
  }

  // Les moteurs 3D partagent window.SB3D.THREE. Dans three r18x, setPixelRatio est posé sur chaque instance
  // par le constructeur (this.setPixelRatio = …) : un accesseur sur le prototype l'intercepte au vol,
  // ce qui donne la liste des moteurs et la main sur leur densité de pixels. Le halo (UnrealBloomPass) est une classe.
  const renderers = new Set(), blooms = new Set();   // WeakRef → moteurs encore vivants
  let patched = false;
  function patch3D(S) {
    S = S || window.SB3D;
    if (patched || !S || !S.THREE || !S.THREE.WebGLRenderer) return;
    patched = true;
    try {
      Object.defineProperty(S.THREE.WebGLRenderer.prototype, 'setPixelRatio', {
        configurable: true,
        set(fn) { this._sbPR = fn; renderers.add(new WeakRef(this)); },
        get() {
          const self = this, fn = this._sbPR;
          if (!fn) return undefined;
          return function (v) { self._sbWantPR = v; return fn.call(self, Math.min(v, CAPS[effLevel()])); };
        },
      });
    } catch (e) { console.warn('[qualité] moteur 3D non piloté :', e); }
    if (S.UnrealBloomPass && S.UnrealBloomPass.prototype && S.UnrealBloomPass.prototype.render) {
      const B = S.UnrealBloomPass.prototype, origB = B.render;
      B.render = function () {
        if (!this._sbSeen) { this._sbSeen = true; blooms.add(new WeakRef(this)); if (effLevel() >= 2) this.enabled = false; }
        return origB.apply(this, arguments);
      };
    }
  }
  function applyQuality() {
    patch3D();
    const L = effLevel(), cap = CAPS[L];
    for (const w of renderers) {
      const r = w.deref();
      if (!r) { renderers.delete(w); continue; }
      try { if (r._sbPR && r._sbWantPR != null) r._sbPR.call(r, Math.min(r._sbWantPR, cap)); } catch (e) { renderers.delete(w); }
    }
    for (const w of blooms) { const bl = w.deref(); if (!bl) blooms.delete(w); else bl.enabled = L < 2; }
    document.documentElement.dataset.sbQuality = String(L);
  }
  // planet3d pose window.SB3D au chargement : on se branche à cet instant, avant la création des moteurs
  if (window.SB3D) patch3D(window.SB3D);
  else {
    let _sb3d;
    try {
      Object.defineProperty(window, 'SB3D', { configurable: true, enumerable: true,
        get() { return _sb3d; },
        set(v) { _sb3d = v; patch3D(v); } });
    } catch (e) { const w = setInterval(() => { if (window.SB3D) { patch3D(); clearInterval(w); } }, 100); }
  }

  /* ── 3. délai des échanges avec le registre ── */
  const _fetch = window.fetch && window.fetch.bind(window);
  let slowWarned = false;
  if (_fetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/supabase\.co/.test(url) || /perf_report/.test(url)) return _fetch(input, init);
      const t0 = performance.now();
      return _fetch(input, init).then((res) => {
        note(performance.now() - t0, !res.ok && res.status >= 500); return res;
      }, (err) => { note(performance.now() - t0, true); throw err; });
    };
  }
  function note(ms, failed) {
    st.net.n++; if (failed) st.net.err++;
    st.net.t.push(ms); if (st.net.t.length > 400) st.net.t.splice(0, 100);
    const recent = st.net.t.slice(-12);
    if (!slowWarned && recent.length >= 12 && median(recent) > 1500) {
      slowWarned = true;
      if (typeof toast === 'function') toast('Connexion lente : les échanges avec les autres commandants peuvent tarder');
    }
  }

  /* ── 4. chargement et appareil ── */
  window.addEventListener('load', () => { st.loadMs = Math.round(performance.now()); });
  function device() {
    const ua = navigator.userAgent || '';
    const ios = (ua.match(/OS (\d+)[_.](\d+)/) || []);
    let tz = null; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    return {
      os: /iPhone|iPad|iPod/.test(ua) ? 'iOS ' + (ios[1] ? ios[1] + '.' + ios[2] : '?') : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'autre',
      model: /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? ((ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1] || 'Android') : 'ordinateur',
      screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
      cores: navigator.hardwareConcurrency || null,
      mem: navigator.deviceMemory || null,
      standalone: !!(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
      tz,
    };
  }

  /* ── 5. envoi du résumé ── */
  let lastFlush = Date.now(), flushing = false;
  async function flush(force) {
    if (flushing || (!force && Date.now() - lastFlush < cfg.flushMs)) return;
    if (typeof _mpRpc !== 'function' || !(window.SBMP && window.SBMP.ready && window.SBMP.ready())) return;
    const rows = [];
    const net = st.net.t.slice();
    for (const [scr, b] of Object.entries(st.buckets)) {
      if (b.secs < 5) continue;
      rows.push({ screen: String(scr).slice(0, 30), seconds: b.secs, fps_med: round1(median(b.frames)), fps_p5: round1(pct(b.frames, 0.05)), hitches: b.hitches });
    }
    if (!rows.length && !net.length) { lastFlush = Date.now(); return; }
    flushing = true;
    try {
      await _mpRpc('mp_perf_report', {
        p_session: st.session, p_device: device(), p_quality: effLevel(), p_mode: st.mode, p_load_ms: st.loadMs,
        p_net: { med: net.length ? Math.round(median(net)) : null, p95: net.length ? Math.round(pct(net, 0.95)) : null, n: st.net.n, err: st.net.err },
        p_rows: rows,
      });
      st.buckets = {}; st.net = { t: [], err: 0, n: 0 }; st.loadMs = null;
      lastFlush = Date.now();
    } catch (e) { lastFlush = Date.now() - cfg.flushMs + 60e3; /* on réessaie dans une minute */ }
    finally { flushing = false; }
  }
  const round1 = (v) => v == null ? null : Math.round(v * 10) / 10;
  setInterval(() => flush(false), 30e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

  /* ── 6. compteur d'images (diagnostic) ── */
  let counter = null;
  function drawCounter(fps) {
    if (!st.fpsOn) { if (counter) { counter.remove(); counter = null; } return; }
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'sb-fps';
      counter.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 6px);z-index:9600;pointer-events:none;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.55);font:600 10px/1.2 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.04em';
      document.body.appendChild(counter);
    }
    const net = st.net.t.slice(-10), nm = net.length ? Math.round(median(net)) : null;
    counter.style.color = fps < cfg.lowFps ? '#ff8a8a' : fps < 45 ? '#ffc864' : '#7ed080';
    counter.textContent = `${Math.round(fps)} img/s · ${NAMES[effLevel()]}${st.mode === 'auto' ? ' (auto)' : ''}${nm != null ? ' · réseau ' + nm + ' ms' : ''}`;
  }

  /* ── 7. réglages ── */
  function renderSettings() {
    const slot = document.getElementById('dash-cloud-slot');
    if (!slot) return;
    const anchor = slot.closest('.w-cloud') || slot;   // Réglages : juste après le bloc Sauvegarde
    if (!anchor.parentNode) return;
    let el = document.getElementById('sb-perf-slot');
    if (!el || el.previousElementSibling !== anchor) {
      if (el) el.remove();
      el = document.createElement('div'); el.id = 'sb-perf-slot'; el.className = anchor.className || '';
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
    const b = (m, l) => `<button onclick="SBPerf.setMode('${m}')" style="flex:1;padding:9px 0;border-radius:8px;border:1px solid ${st.mode === m ? 'rgba(230,240,255,.65)' : 'rgba(150,170,185,.25)'};background:${st.mode === m ? 'rgba(230,240,255,.08)' : 'transparent'};color:${st.mode === m ? '#e6f0ff' : 'rgba(210,220,228,.75)'};font:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">${l}</button>`;
    const html = `<div class="section-label">Performance</div>
      <div class="dash-section-card">
        <div style="font-size:12px;color:#c8d2d6;margin-bottom:8px">Qualité de la 3D : <strong style="color:#e6f0ff">${NAMES[effLevel()]}</strong>${st.mode === 'auto' ? ' · réglée automatiquement' : ''}</div>
        <div style="display:flex;gap:6px">${b('auto', 'Auto')}${b('high', 'Haute')}${b('eco', 'Économe')}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:8px;line-height:1.5">Auto : la 3D s'allège quand l'appareil peine et remonte dès que c'est fluide.</div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:#c8d2d6;cursor:pointer">
          <input type="checkbox" style="accent-color:#c8d2d6" ${st.fpsOn ? 'checked' : ''} onchange="SBPerf.setCounter(this.checked)"> Compteur d'images (diagnostic)
        </label>
      </div>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  setInterval(renderSettings, 1500);

  window.SBPerf = {
    cfg, get level() { return effLevel(); }, get mode() { return st.mode; },
    setMode, setLevel, applyQuality, flush: () => flush(true),
    setCounter(on) { st.fpsOn = !!on; LS('sb_fps_counter', on ? '1' : null); if (!on) drawCounter(60); },
    _st: st, _auto: autoQuality, _renderers: () => [...renderers].map(w => w.deref()).filter(Boolean).length,
  };
  requestAnimationFrame(frame);
})();
