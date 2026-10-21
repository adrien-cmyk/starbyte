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
    if (window.SBSky) window.SBSky.k = k;   // PATCH_2010_LUMIERE : l'éclairage des bâtiments lit l'heure du ciel
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
    // PATCH_2110_DEVAST_SOMBRE (Adrien) : planète dévastée = ambiance sombre de catastrophe (braise, suie), réglée ici
    // pour ne plus se battre avec aftermath.js (qui teintait les mêmes lumières puis se faisait écraser par le ciel)
    const cat = devCat();
    if (cat > 0) {
      const LC = (c, hex, f) => c.lerp(new T.Color(hex), f);
      if (sc.background && sc.background.isColor) LC(sc.background, 0x0c0403, cat * .85);
      if (sc.fog) LC(sc.fog.color, 0x1a0805, cat * .85);
      if (C.hemi) { LC(C.hemi.color, 0x7a2e14, cat * .7); LC(C.hemi.groundColor, 0x120402, cat * .8); C.hemi.intensity *= 1 - .45 * cat; }
      if (C.key) { LC(C.key.color, 0xff6a2a, cat * .6); C.key.intensity *= 1 - .55 * cat; }
      if (P.renderer) P.renderer.toneMappingExposure *= 1 - .18 * cat;
      if ('environmentIntensity' in sc) sc.environmentIntensity *= 1 - .5 * cat;
    }
    dimLights(sc, L(1, DAY_GLOW));
  }
  function devCat() { try { const d = window.SBAftermath ? SBAftermath.dev : 0; return d > 0 ? .6 + .4 * Math.min(1, d / 50) : 0; } catch (e) { return 0; } }
  // 20/10 (Adrien) : en journée, les lumières des bâtiments baissent (fenêtres, néons, lampes, halos)
  const DAY_GLOW = 0.35;
  let lastF = -1;
  function dimLights(sc, f) {
    lastF = f;
    sc.traverse(o => {
      if (o.isLight && o.userData && o.userData.src) {            // lampes des bâtiments (sources de la réserve de lumières)
        if (o.userData.i0 === undefined) o.userData.i0 = o.intensity;
        o.intensity = o.userData.i0 * f; return;
      }
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.emissive && m.emissiveIntensity !== undefined && (m.emissiveIntensity > 0 || m.userData.e0 !== undefined)) {
          if (m.userData.e0 === undefined) m.userData.e0 = m.emissiveIntensity;
          m.emissiveIntensity = m.userData.e0 * f;
        } else if (m.isMeshBasicMaterial && m.blending === 2) {      // halos additifs
          if (m.userData.o0 === undefined) m.userData.o0 = m.opacity;
          m.opacity = m.userData.o0 * f;
        }
      }
    });
  }
  // PATCH_2110_NUIT_SECOURS (Adrien) : une planète dévastée reste de nuit, même en plein jour — bien plus terrifiant.
  // La nuit tombe dès les premiers dégâts et se lève à mesure que les secours soignent (dévastation → 0).
  function devNight() { try { const d = window.SBAftermath ? SBAftermath.dev : 0; return d > 0 ? Math.min(1, d / 10) : 0; } catch (e) { return 0; } }
  function tick() { try { apply(forced != null ? forced : dayK(new Date()) * (1 - devNight())); } catch (e) { console.warn('[ciel]', e); } }
  setInterval(tick, 30000);
  let _dn = -1; setInterval(() => { const d = devNight() + devCat() * 10; if (d !== _dn) { _dn = d; tick(); } }, 2000);   // PATCH_2110_NUIT_SECOURS : dès que la dévastation change
  const boot = setInterval(() => {
    if (!(window.Planet3D && Planet3D.ready)) return;
    clearInterval(boot);
    // après chaque reconstruction (nouveau bâtiment, avaries…), les nouvelles lumières suivent l'heure
    const P = Planet3D, orig = P._rebuild;
    P._rebuild = function () { const r = orig.apply(this, arguments); try { if (lastF >= 0) dimLights(this.scene, lastF); } catch (e) {} return r; };
    tick();
  }, 1000);
  window.SBSky = { ownsDevast: true, dayK, apply, force(k) { forced = k; tick(); }, auto() { forced = null; tick(); } };
})();
