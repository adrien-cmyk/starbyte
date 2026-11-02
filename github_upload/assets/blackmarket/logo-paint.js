/* Starbyte — Atelier des logos (GDD claude/starbyte_GDD_atelier_logos.md)
   Le logo est peint DANS le shader de la coque : aucune géométrie ajoutée, soudures, patine et lumière passent par-dessus.
   Chargé seulement quand la vitrine est ouverte avec ?lg=1 : le catalogue reste strictement inchangé.
   Emplacements : c = centre, u/v = sens de lecture du logo, w = largeur, d = profondeur (au-delà, on ne peint plus). */
const side = (id, label, x, y, z, w, d, tilt = 0) => {
  const s = Math.sin(tilt * Math.PI / 180), k = Math.cos(tilt * Math.PI / 180);
  return [{ id, label, c: [x, y, z], u: [0, -s, -k], v: [0, k, -s], w, d }, { id, label, c: [-x, y, z], u: [0, -s, k], v: [0, k, s], w, d }];
};
export const SLOTS = {
  requiem: [...side('tour', 'Tour', 30, 82, -115, 90, 75), ...side('flanc', 'Flanc', 52, -4, 235, 150, 75)],
  'arc-ecarlate': [
    { id: 'aile', label: 'Aile', c: [276, 70, 4], u: [-.77, 0, -.64], v: [-.64, 0, .77], w: 245, d: 130 },
    { id: 'aile', label: 'Aile', c: [-276, 70, 4], u: [-.77, 0, .64], v: [.64, 0, .77], w: 245, d: 130 },
  ],
  souverain: [...side('flanc', 'Flanc', 95, 8, 380, 290, 40), { id: 'ventre', label: 'Ventre', c: [0, -75, 65], u: [1, 0, 0], v: [0, 0, 1], w: 185, d: 30 }],
  vertige: side('lame', 'Lame', 30, 395, 255, 190, 70, -12),
  'brise-monde': [{ id: 'pont', label: 'Pont', c: [0, 63, 200], u: [0, 0, -1], v: [-1, 0, 0], w: 300, d: 16 }],
  fulgurant: side('flanc', 'Flanc', 220, 5, 40, 260, 90),
  triumvirat: [{ id: 'coque', label: 'Coque', c: [0, 42, 200], u: [0, 0, -1], v: [-1, 0, 0], w: 125, d: 28 }],
  bernard: [...side('flanc', 'Flanc', 228, 20, -180, 240, 90), { id: 'front', label: 'Front', c: [0, 138, 318], u: [-1, 0, 0], v: [0, 0, 1], w: 120, d: 40 }],
};

export function createLogoPaint(THREE, shipId) {
  const slots = SLOTS[shipId] || [];
  const N = slots.length;
  const blank = document.createElement('canvas'); blank.width = blank.height = 2;
  const uni = {
    uLogo: { value: new THREE.CanvasTexture(blank) },
    uLC: { value: slots.map(s => new THREE.Vector3(...s.c)) },
    uLU: { value: slots.map(() => new THREE.Vector3()) },
    uLV: { value: slots.map(() => new THREE.Vector3()) },
    uLN: { value: slots.map(() => new THREE.Vector3()) },
    uLD: { value: slots.map(s => s.d) },
    uLOn: { value: slots.map(() => 0) },
  };
  let aspect = 1;
  function layout() {
    slots.forEach((s, i) => {
      const u = new THREE.Vector3(...s.u).normalize(), v = new THREE.Vector3(...s.v).normalize();
      uni.uLU.value[i].copy(u).multiplyScalar(1 / s.w);
      uni.uLV.value[i].copy(v).multiplyScalar(aspect / s.w);
      uni.uLN.value[i].crossVectors(u, v).normalize();
    });
  }
  layout();
  const DECL = N ? `uniform sampler2D uLogo; uniform vec3 uLC[${N}], uLU[${N}], uLV[${N}], uLN[${N}]; uniform float uLD[${N}], uLOn[${N}]; vec3 logoGlow = vec3(0.);` : 'vec3 logoGlow = vec3(0.);';
  // L'orientation vient de la face vue (dérivées), pas des normales : certaines plaques ont des normales inversées.
  const APPLY = N ? `{
    vec3 lN = normalize(cross(dFdx(vOP), dFdy(vOP)));
    for (int i = 0; i < ${N}; i++) {
      vec3 d = vOP - uLC[i];
      vec2 luv = vec2(dot(d, uLU[i]), dot(d, uLV[i])) + .5;
      vec4 lt = texture2D(uLogo, luv);
      float lin = step(0., luv.x) * step(luv.x, 1.) * step(0., luv.y) * step(luv.y, 1.);
      float lm = lin * uLOn[i] * step(abs(dot(d, uLN[i])), uLD[i]) * smoothstep(.15, .4, dot(lN, uLN[i]));
      diffuseColor.rgb = mix(diffuseColor.rgb, lt.rgb, lt.a * lm);
      logoGlow = mix(logoGlow, lt.rgb * .22, lt.a * lm);
    }
  }` : '';
  const glow = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += logoGlow;'); };
  function wrap(mat) { const f = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { f.call(mat, sh, r); glow(sh); }; }
  function only(mat) {   // matériaux de coque sans patine : ils reçoivent quand même la peinture
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;\n' + DECL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + APPLY);
      glow(sh);
    };
  }
  const paintable = (mat) => !mat.transparent && (!mat.emissive || mat.emissive.r + mat.emissive.g + mat.emissive.b < .01) && !/NAV|STROBE|GLOW|FEU/.test(mat.name);

  let env = null, img = null, outline = true, on = [], fly = null;
  function buildTexture() {
    const W = img.naturalWidth, H = img.naturalHeight, pad = Math.round(Math.max(W, H) * .03);
    const cv = document.createElement('canvas'); cv.width = W + pad * 2; cv.height = H + pad * 2;
    const g = cv.getContext('2d');
    if (outline) {   // contour sombre : un logo clair ne disparaît pas sur une coque blanche
      const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
      const sg = sil.getContext('2d'); sg.drawImage(img, 0, 0);
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#15181d'; sg.fillRect(0, 0, W, H);
      const r = Math.max(W, H) * .012;
      for (let k = 0; k < 2; k++) for (let a = 0; a < 24; a++) {
        const q = (k + 1) / 2 * r;
        g.drawImage(sil, pad + Math.cos(a / 24 * 6.283) * q, pad + Math.sin(a / 24 * 6.283) * q);
      }
    }
    g.drawImage(img, pad, pad);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    if (env) t.anisotropy = env.renderer.capabilities.getMaxAnisotropy();
    uni.uLogo.value.dispose(); uni.uLogo.value = t;
    aspect = cv.width / cv.height; layout();
  }
  function applyOn() { slots.forEach((s, i) => { uni.uLOn.value[i] = img && on.includes(s.id) ? 1 : 0; }); }
  let token = 0;
  async function setLogo(o) {
    const t = ++token;
    outline = o.outline !== false; on = Array.isArray(o.slots) ? o.slots : [];
    if (!o.url) { img = null; applyOn(); return; }
    if (img && img.dataset.u === o.url) { buildTexture(); applyOn(); return; }
    const i = new Image(); i.crossOrigin = 'anonymous'; i.dataset.u = o.url;
    await new Promise((ok, ko) => { i.onload = ok; i.onerror = ko; i.src = o.url; });
    if (t !== token) return;
    img = i; buildTexture(); applyOn();
  }
  function view(id) {
    const s = slots.find(x => x.id === id); if (!s || !env) return null;
    const { camera, S } = env;
    const at = new THREE.Vector3(...s.c).multiplyScalar(S);
    const u = new THREE.Vector3(...s.u).normalize(), v = new THREE.Vector3(...s.v).normalize(), n = new THREE.Vector3().crossVectors(u, v).normalize();
    const dist = s.w * S * (camera.aspect < .8 ? 2.5 : 1.7) + .2;
    const pos = at.clone();
    if (Math.abs(n.y) > .5) pos.addScaledVector(n, dist * .8).addScaledVector(v, n.y < 0 ? dist * .6 : -dist * .6);
    else pos.addScaledVector(n, dist).addScaledVector(u, -dist * .22).add(new THREE.Vector3(0, dist * .12, 0));
    return { pos, at };
  }
  function focus(id) {
    const w = view(id); if (!w) return;
    const { camera, controls } = env;
    controls.autoRotate = false; window.__logoHold = true;
    fly = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: w.pos, q1: w.at };
  }
  const tick = () => {
    if (fly) {
      const t = Math.min(1, (performance.now() - fly.t0) / 1100), k = t * t * (3 - 2 * t);
      env.camera.position.lerpVectors(fly.p0, fly.p1, k); env.controls.target.lerpVectors(fly.q0, fly.q1, k);
      if (t >= 1) fly = null;
    }
    requestAnimationFrame(tick);
  };
  function attach(e) {
    env = e; tick();
    e.controls.addEventListener('start', () => { fly = null; window.__logoHold = false; });
    addEventListener('message', (ev) => {
      if (ev.origin !== location.origin || !ev.data) return;
      if (ev.data.bmLogo) setLogo(ev.data.bmLogo).then(() => { if (ev.data.bmLogo.focus) focus(ev.data.bmLogo.focus); }).catch(() => {});
      if (ev.data.bmFocus) focus(ev.data.bmFocus);
    });
    const list = []; slots.forEach(s => { if (!list.some(x => x.id === s.id)) list.push({ id: s.id, label: s.label }); });
    const hello = () => { try { parent.postMessage({ bmReady: shipId, slots: list }, location.origin); } catch (err) {} };
    hello();
  }
  return { uni, DECL, APPLY, wrap, only, paintable, attach, setLogo, focus, view };
}
