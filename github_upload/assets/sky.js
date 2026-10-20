// PATCH_2010_CIEL — la planète suit l'heure réelle : nuit bleue (actuelle) ↔ jour d'aube chaude
(function () {
  const NIGHT = { bg: 0x0b1622, sky: 0x4d6f99, ground: 0x0b120b, hemi: 1.1, key: 0xa9c4ff, keyI: 2.4, pos: [150, 240, 170], exp: 1.05, env: 0.6, bloom: 0.45, fogN: 520, fogF: 1250 };
  const DAY   = { bg: 0xb9b0a4, sky: 0xf4e6dc, ground: 0x4f5a42, hemi: 2.0, key: 0xffd8ae, keyI: 4.0, pos: [240, 175, 80], exp: 1.28, env: 1.0, bloom: 0.24, fogN: 620, fogF: 1700 };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 0 = nuit, 1 = jour. Lever 5 h 30 → 8 h, coucher 18 h 30 → 21 h (heure locale du joueur)
  function dayK(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    return Math.min(smooth(5.5, 8, h), 1 - smooth(18.5, 21, h));
  }
  let C = null, forced = null;
  function lerpHex(T, a, b, k) { return new T.Color(a).lerp(new T.Color(b), k); }
  function apply(k) {
    const P = window.Planet3D;
    if (!P || !P.ready || !P.scene) return;
    const T = window.SB3D && window.SB3D.THREE; if (!T) return;
    const sc = P.scene;
    if (!C) {
      C = {};
      sc.children.forEach(o => { if (o.isHemisphereLight) C.hemi = o; else if (o.isDirectionalLight && o.castShadow) C.key = o; });
    }
    const L = (a, b) => a + (b - a) * k;
    const bg = lerpHex(T, NIGHT.bg, DAY.bg, k);
    if (sc.background && sc.background.isColor) sc.background.copy(bg);
    if (sc.fog) { sc.fog.color.copy(bg); sc.fog.near = L(NIGHT.fogN, DAY.fogN); sc.fog.far = L(NIGHT.fogF, DAY.fogF); }
    if (C.hemi) { C.hemi.color.copy(lerpHex(T, NIGHT.sky, DAY.sky, k)); C.hemi.groundColor.copy(lerpHex(T, NIGHT.ground, DAY.ground, k)); C.hemi.intensity = L(NIGHT.hemi, DAY.hemi); }
    if (C.key) { C.key.color.copy(lerpHex(T, NIGHT.key, DAY.key, k)); C.key.intensity = L(NIGHT.keyI, DAY.keyI); C.key.position.set(L(NIGHT.pos[0], DAY.pos[0]), L(NIGHT.pos[1], DAY.pos[1]), L(NIGHT.pos[2], DAY.pos[2])); }
    if (P.renderer) P.renderer.toneMappingExposure = L(NIGHT.exp, DAY.exp);
    if ('environmentIntensity' in sc) sc.environmentIntensity = L(NIGHT.env, DAY.env);
    if (P.bloom) P.bloom.strength = L(NIGHT.bloom, DAY.bloom);
  }
  function tick() { try { apply(forced != null ? forced : dayK(new Date())); } catch (e) { console.warn('[ciel]', e); } }
  setInterval(tick, 30000);
  const boot = setInterval(() => { if (window.Planet3D && Planet3D.ready) { clearInterval(boot); tick(); } }, 1000);
  window.SBSky = { dayK, apply, force(k) { forced = k; tick(); }, auto() { forced = null; tick(); } };
})();
