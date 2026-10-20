// PATCH_2010_FLUIDITE — la planète 3D, plus légère sur téléphone (Adrien 20/10 : 11 images/s chez une joueuse)
// 1. les ombres ne sont recalculées que 4 fois par seconde (et à chaque reconstruction), au lieu de chaque image :
//    le passage des ombres redessinait toute la planète une deuxième fois à chaque image ;
// 2. sur téléphone, quand personne ne touche la carte, la planète tourne à 30 images/s au lieu de 60 ;
//    dès qu'on touche, qu'on glisse ou qu'une caméra se déplace, elle repasse à pleine vitesse.
(function () {
  'use strict';
  const MOBILE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
  const SHADOW_MS = 250, IDLE_MS = 2000, IDLE_FRAME_MS = 31;
  function hook() {
    const P = window.Planet3D;
    if (!P || !P.ready || !P.renderer) return false;
    const R = P.renderer;
    let lastShadow = 0, lastInput = performance.now(), lastFrame = 0;
    const poke = () => { lastInput = performance.now(); };
    // ombres à la demande
    R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = true;
    const origRebuild = P._rebuild;
    P._rebuild = function () { const r = origRebuild.apply(this, arguments); R.shadowMap.needsUpdate = true; poke(); return r; };
    // entrées : doigt, molette, caméra qui bouge
    const el = R.domElement;
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(ev, poke, { passive: true });
    if (P.controls && P.controls.addEventListener) P.controls.addEventListener('change', poke);
    const origFrame = P._frame;
    P._frame = function () {
      const now = performance.now();
      const busy = this._focusAnim || now - lastInput < IDLE_MS;
      if (MOBILE && !busy && now - lastFrame < IDLE_FRAME_MS) return;   // 30 images/s au repos
      lastFrame = now;
      if (now - lastShadow > SHADOW_MS || busy && now - lastShadow > 120) { R.shadowMap.needsUpdate = true; lastShadow = now; }
      return origFrame.apply(this, arguments);
    };
    window.SBFluid = { poke, mobile: MOBILE };
    return true;
  }
  const t = setInterval(() => { if (hook()) clearInterval(t); }, 500);
})();
