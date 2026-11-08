/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Vitrine 3D d'unité (UNIT-07 · Garde planétaire)
   Septembre 2026 · v1.0 — Octobre 2026 · v2.0 (modèle riggé + animations de vitrine)

   Petite scène « showroom » : le soldat sur un socle sobre. Il joue UNIT07_IDLE en boucle ;
   glisser horizontalement le fait tourner et il reste à l'angle choisi (pas de rotation auto).
   Après 5–8 s sans interaction : UNIT07_SCAN (ou, plus rarement, UNIT07_INSPECT), puis retour à l'Idle.
   Un tap sur le soldat joue UNIT07_READY. Si le modèle riggé manque, retour au modèle statique. Un seul renderer WebGL partagé, déplacé d'un
   conteneur à l'autre (fiche Défense du monde, fiche détail de l'unité).
   Pause automatique quand le conteneur n'est plus visible, libération
   de la boucle quand il quitte le DOM.
   Three.js vient de window.SB3D (bundle planet3d.js) — rien d'embarqué ici.

   v3.0 (11 oct. 2026) : vitrine multi-unités (table UNITS) — Garde (UNIT-07, riggé) et Soldat lourd
   (RED PHALANX, statique posé fusil en main, shader d'usure métal piloté par la couleur de sommet WEAR).
   Mode « héros » : conteneur `.u3d-hero` plein écran (fiche d'unité), sujet cadré dans le haut de l'écran.
   v3.1 (11 oct. 2026) : décor héros façon lookdev (sol mouillé réfléchissant, piliers néon, caisses, bannière, brume,
   poussières, contre-jours rouges, bloom) ; cadrage mesuré dans le DOM (bande entre l'en-tête et les cartes).
   ═══════════════════════════════════════════════════════════════════════════ */

const MODEL_URL = 'assets/3d/sb_soldier_v3_rig.glb';     // riggé + animé (unit07_rig.py --anims)
const MODEL_STATIC = 'assets/3d/sb_soldier_v3.glb';       // repli sans animation

// Unités présentables en vitrine. h = hauteur à cadrer (m, socle compris) ; rim = intensité du contre-jour rouge.
const UNITS = {
  garde: { url: MODEL_URL, fallback: MODEL_STATIC, rigged: true, h: 2.55, rim: 2.4, footOut: 30, orbit: true },   // pied droit ouvert de 30° (appliqué après l'animation)
  tourelle_lourde: { url: 'assets/3d/sb_turret_pd3h.glb?v=20261011a', h: 2.1, rim: 1.5, zoom: 1.22, wear: true, yaw: 3.5, scale: 0.42, plinth: false, turret: true },
  tourelle: { url: 'assets/3d/sb_turret_pd3.glb?v=20261011a', h: 2.0, rim: 1.5, zoom: 1.22, wear: true, yaw: 3.5, scale: 0.42, plinth: false, turret: true, decor: 'planet' },
  lourd: { url: 'assets/3d/sb_heavy_rp.glb?v=20261011b', h: 2.75, wd: 1.85, rim: 3.6, wear: true, yaw: 0.2, banner: true, orbit: true },
};

// RED PHALANX : couleurs / rugosités / métal (+ intensité d'usure des arêtes `w`) — rp_game.py exporte des matériaux nus
const MAT_RP = {
  M_RP_RED: { c: 0x8e1015, r: 0.36, m: 0.25, w: 0.9 }, M_RP_ARMOR: { c: 0x2c2f35, r: 0.42, m: 0.7, w: 0.75 },
  M_RP_STEEL: { c: 0x767b84, r: 0.3, m: 0.92, w: 0.4 }, M_SOL_GUNMETAL: { c: 0x26292e, r: 0.34, m: 0.92, w: 0.55 },
  M_RP_BLACK: { c: 0x15161a, r: 0.5, m: 0.5, w: 0.4 }, M_SOL_SUIT: { c: 0x131418, r: 0.72, m: 0.15, w: 0.12 },
  M_RP_POUCH: { c: 0x2e2a28, r: 0.72, m: 0.05, w: 0.2 }, M_RP_POUCH_LT: { c: 0x3a3532, r: 0.66, m: 0.05, w: 0.25 },
  M_TU_GUNMETAL: { c: 0x45474c, r: 0.42, m: 0.85, w: 0.55 }, M_TU_DARK: { c: 0x26282c, r: 0.46, m: 0.8, w: 0.45 },
  M_TU_STEEL: { c: 0x6f737a, r: 0.32, m: 0.95, w: 0.1 }, M_TU_BLACK: { c: 0x121315, r: 0.6, m: 0.4, w: 0.15 },
  M_TU_CERAMIC: { c: 0x8f8b85, r: 0.6, m: 0.1, w: 0.3 },
  M_RP_WHITE: { c: 0xd8d8d4, r: 0.4, m: 0.05, w: 0.5 }, M_RP_VISOR: { c: 0x050506, r: 0.05, m: 0.3, w: 0 },
};

// Les rugosités Blender passent par des nœuds (bruit) et ne sont pas exportées : on les fixe ici.
const MAT = {
  M_SOL_WHITE: { r: 0.52 }, M_SOL_RED: { r: 0.56 }, M_SOL_SUIT: { r: 0.82, m: 0.0 },
  M_SOL_DARK: { r: 0.5 }, M_SOL_METAL: { r: 0.38 }, M_SOL_GUNMETAL: { r: 0.3 },
  M_SOL_VISOR: { r: 0.06, m: 0.5 }, M_SOL_GRIPTAPE: { r: 0.85 },
  // matériaux du lookdev (couleurs / rugosités pilotées par nœuds dans Blender → fixées ici)
  M_ARMOR_WHITE: { c: 0xd2cfc8, r: 0.42, m: 0.0 }, M_ARMOR_RED: { c: 0x7e0c13, r: 0.3, m: 0.4 },
  M_UNDERSUIT_BLACK: { c: 0x17181e, r: 0.88, m: 0.0 }, M_GUNMETAL: { c: 0x3a3e45, r: 0.32, m: 0.95 },
  M_GUNMETAL_DARK: { c: 0x15171b, r: 0.42, m: 0.7 }, M_VISOR_BLACK: { c: 0x05070a, r: 0.04, m: 0.0 },
  M_VISOR_HELMET: { c: 0x05070a, r: 0.03, m: 0.0, e: 0x3a0503, ei: 1.0 },
};

const waitSB3D = () => new Promise((res) => {
  if (window.SB3D) return res(window.SB3D);
  const t = setInterval(() => { if (window.SB3D) { clearInterval(t); res(window.SB3D); } }, 150);
});

// Fusion par matériau : ~430 pièces → une dizaine d'appels de dessin (important sur iPhone)
function mergeByMaterial(T, root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const k = o.material.name || o.material.uuid;
    if (!groups.has(k)) groups.set(k, { mat: o.material, parts: [] });
    groups.get(k).parts.push(o);
  });
  const out = new T.Group();
  const nm = new T.Matrix3();
  for (const { mat, parts } of groups.values()) {
    let nv = 0, ni = 0;
    parts.forEach((o) => { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    const v = new T.Vector3();
    for (const o of parts) {
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], (vo + i) * 3);
        if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3); }
      }
      if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
      else { for (let i = 0; i < P.count; i++) idx[io + i] = vo + i; io += P.count; }
      vo += P.count;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    tuneMat(mat);
    const mesh = new T.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

function tuneMat(mat) {
  const t = MAT[mat.name];
  if (t) {
    if (t.c != null) mat.color.setHex(t.c);
    mat.roughness = t.r; if (t.m != null) mat.metalness = t.m;
    if (t.e != null) { mat.emissive.setHex(t.e); mat.emissiveIntensity = t.ei; }
  }
  mat.toneMapped = true;
}

// Usure « métal lourd » : la couleur de sommet WEAR (convexité calculée dans Blender) éclaircit les arêtes vives
// en métal nu (cassé par un bruit), assombrit et matifie les creux (crasse). Pas de texture : léger sur iPhone.
function wearMat(mat, w) {
  mat.vertexColors = false;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = { value: w };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 color;\nvarying float vW; varying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = color.r; vP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWear; varying float vW; varying vec3 vP;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float sbEdge, sbCav;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float nb = n3(vP * 34.0) * 0.6 + n3(vP * 90.0) * 0.4;
        sbEdge = smoothstep(0.6, 0.86, vW) * smoothstep(0.32, 0.62, nb) * uWear;
        sbCav = (1.0 - smoothstep(0.12, 0.42, vW)) * 0.55;
        float grime = smoothstep(0.45, 0.8, n3(vP * 3.5));
        diffuseColor.rgb *= (1.0 - sbCav) * (1.0 - 0.22 * grime);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.65), sbEdge);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(roughnessFactor + 0.18 * sbCav, 0.26, sbEdge), 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, sbEdge);');
  };
  mat.customProgramCacheKey = () => 'sbwear' + w;
  mat.needsUpdate = true;
}

function tuneRP(mat) {
  if (mat.userData.tuned) return;                    // matériau partagé par plusieurs maillages : réglé une seule fois
  mat.userData.tuned = true;
  const t = MAT_RP[mat.name];
  if (t) {
    mat.color.setHex(t.c); mat.roughness = t.r; mat.metalness = t.m;
    if (t.w) wearMat(mat, t.w);
  } else if (/GLOW/.test(mat.name)) {
    mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 1) * 2.2;   // visière / LED : lisibles malgré le tone mapping
    mat.userData.base = mat.emissiveIntensity;
  }
  mat.toneMapped = true;
}

// Ombre de contact douce (dégradé radial) — moins coûteuse qu'une ombre portée sur le socle
function contactShadow(T) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(0.55, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(new T.PlaneGeometry(1.25, 1.25), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003;
  return m;
}

// Socle : disque gunmetal biseauté + rainures + fin liseré rouge très discret (lookdev)
function plinth(T) {
  const g = new T.Group();
  const top = new T.Mesh(new T.CylinderGeometry(0.62, 0.66, 0.05, 48), new T.MeshStandardMaterial({ color: 0x14181e, metalness: 0.7, roughness: 0.42 }));
  top.position.y = -0.025; top.receiveShadow = true; g.add(top);
  const base = new T.Mesh(new T.CylinderGeometry(0.68, 0.7, 0.04, 48), new T.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.5, roughness: 0.6 }));
  base.position.y = -0.07; g.add(base);
  const ring = new T.Mesh(new T.TorusGeometry(0.645, 0.0035, 6, 96), new T.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0.42 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.049; g.add(ring);
  for (const rr of [0.33, 0.43]) {
    const gr = new T.Mesh(new T.TorusGeometry(rr, 0.0018, 4, 96), new T.MeshBasicMaterial({ color: 0x05070a }));
    gr.rotation.x = Math.PI / 2; gr.position.y = 0.0005; g.add(gr);
  }
  return g;
}


// ── Décor « hangar Red Phalanx » (mode héros) — reprise légère du lookdev Blender (rp_lookdev.py) :
//    sol mouillé réfléchissant, piliers à néons rouges, caisses, bannière, brume, poussières, contre-jours rouges.
//    Coordonnées three : le soldat regarde +Z ; le décor est placé derrière lui (Z < 0) et resserré pour l'écran portrait.

// Sol réfléchissant (portage compact de three/addons Reflector) : reflet rendu à basse résolution,
// troublé par un bruit (flaques nettes / béton mat) + joints de dalles.
function wetFloor(T, size) {
  const rt = new T.WebGLRenderTarget(256, 256, { type: T.HalfFloatType });
  const tm = new T.Matrix4();
  const mat = new T.ShaderMaterial({
    fog: true,
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { tDiffuse: { value: null }, textureMatrix: { value: null }, base: { value: new T.Color(0x0b0c0f) } }]),
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vXZ;
      #include <fog_pars_vertex>
      void main(){ vUv = textureMatrix * vec4(position,1.0); vXZ = (modelMatrix * vec4(position,1.0)).xz;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 base; varying vec4 vUv; varying vec2 vXZ;
      #include <fog_pars_fragment>
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float wet = smoothstep(0.42, 0.7, vn(vXZ*0.75)*0.62 + vn(vXZ*2.6)*0.38);
        vec2 t = abs(fract(vXZ/vec2(1.6,1.1)) - 0.5); float seam = smoothstep(0.488, 0.497, max(t.x, t.y));
        vec2 d = (vec2(vn(vXZ*11.0), vn(vXZ*11.0+7.3)) - 0.5) * mix(0.05, 0.006, wet);
        vec2 uv = vUv.xy / vUv.w;
        vec3 r = texture2D(tDiffuse, uv + d).rgb * 0.5
               + texture2D(tDiffuse, uv + d*2.5 + vec2(0.0035, 0.0)).rgb * 0.25
               + texture2D(tDiffuse, uv - d*2.5 - vec2(0.0, 0.0035)).rgb * 0.25;
        float refl = mix(0.35, 0.95, wet) * (1.0 - seam*0.8);
        vec3 col = base * (0.65 + 0.7*vn(vXZ*5.0)) * (1.0 - seam*0.5) + r * refl;
        col += vec3(1.0, 0.82, 0.7) * 0.05 * exp(-dot(vXZ - vec2(-0.3, 0.6), vXZ - vec2(-0.3, 0.6)) * 0.35);   // flaque de lumière de la clé
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.tDiffuse.value = rt.texture; mat.uniforms.textureMatrix.value = tm;
  const m = new T.Mesh(new T.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  const plane = new T.Plane(), normal = new T.Vector3(), wp = new T.Vector3(), cp = new T.Vector3(), rot = new T.Matrix4(),
    look = new T.Vector3(), view = new T.Vector3(), target = new T.Vector3(), clip = new T.Vector4(), q = new T.Vector4(),
    vcam = new T.PerspectiveCamera();
  m.userData.rt = rt;
  m.onBeforeRender = (renderer, scene, camera) => {
    if (m.userData.busy) return;
    wp.setFromMatrixPosition(m.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(m.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(wp, cp); if (view.dot(normal) > 0) return;
    view.reflect(normal).negate().add(wp);
    rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cp);
    target.subVectors(wp, look).reflect(normal).negate().add(wp);
    vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); vcam.lookAt(target);
    vcam.far = camera.far; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(m.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, wp).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = vcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    m.visible = false; m.userData.busy = true;
    const cur = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, vcam);
    renderer.shadowMap.autoUpdate = sh; renderer.setRenderTarget(cur);
    m.visible = true; m.userData.busy = false;
  };
  return m;
}

// Texture radiale (halo / brume)
function radialTex(T, stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

// Bannière : tissu rouge sombre, liseré, emblème (fer de lance dans un chevron) — dessiné au canvas
function bannerTex(T) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 640;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#2a0507'); g.addColorStop(0.5, '#4a080b'); g.addColorStop(1, '#2a0507');
  x.fillStyle = g; x.fillRect(0, 0, 256, 640);
  for (let i = 0; i < 256; i += 3) { x.fillStyle = `rgba(0,0,0,${0.05 + 0.08 * Math.abs(Math.sin(i * 0.11))})`; x.fillRect(i, 0, 1, 640); }  // plis
  x.strokeStyle = '#8a6a4a'; x.lineWidth = 5; x.strokeRect(14, 10, 228, 560);
  x.fillStyle = '#c9b48a';
  x.beginPath(); x.moveTo(128, 120); x.lineTo(176, 250); x.lineTo(140, 230); x.lineTo(140, 360); x.lineTo(116, 360); x.lineTo(116, 230); x.lineTo(80, 250); x.closePath(); x.fill();
  x.lineWidth = 10; x.strokeStyle = '#c9b48a';
  x.beginPath(); x.moveTo(62, 330); x.lineTo(128, 400); x.lineTo(194, 330); x.stroke();
  x.beginPath(); x.moveTo(62, 380); x.lineTo(128, 450); x.lineTo(194, 380); x.stroke();
  x.font = 'bold 22px monospace'; x.textAlign = 'center'; x.fillText('RED PHALANX', 128, 520);
  // bas en queue d'aronde
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.moveTo(0, 640); x.lineTo(128, 590); x.lineTo(256, 640); x.closePath(); x.fill();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

function buildSet(T) {
  const g = new T.Group(); g.name = 'U3D_SET';
  const dark = new T.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.65 });
  const darker = new T.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6, metalness: 0.5 });
  const neon = new T.MeshBasicMaterial({ color: new T.Color(1.0, 0.07, 0.025).multiplyScalar(5) });
  const neonSoft = new T.MeshBasicMaterial({ color: new T.Color(1.0, 0.1, 0.04).multiplyScalar(2.2) });
  const halo = new T.SpriteMaterial({ map: radialTex(T, [[0, 'rgba(255,60,30,.34)'], [0.35, 'rgba(255,30,15,.09)'], [1, 'rgba(255,20,10,0)']]),
    blending: T.AdditiveBlending, depthWrite: false, transparent: true });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const glows = [];
  // piliers (lookdev : 0,7 × 7 m) + bandes néon verticales sur la face avant + halo
  const PIL = [[-1.45, -3.2, 0.25], [1.55, -4.1, -0.3], [-2.4, -6.4, 0.1], [2.55, -7.4, -0.2], [-0.35, -9.5, 0]];
  for (const [x, z, ry] of PIL) {
    const p = box(0.6, 7, 0.6, dark, x, 3.5, z, ry);
    const f = new T.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(0.305);
    for (const [y, l] of [[2.6, 0.9], [1.1, 0.4]]) {
      const s = box(0.06, l, 0.02, neon, x + f.x, y, z + f.z, ry); glows.push(s);
    }
    box(0.64, 0.12, 0.64, darker, x, 0.06, z, ry);
    box(0.66, 0.08, 0.66, darker, x, 4.6, z, ry);
    const sp = new T.Sprite(halo); sp.scale.set(1.6, 2.4, 1); sp.position.set(x + f.x * 1.3, 2.3, z + f.z * 1.3); g.add(sp);
    void p;
  }
  // caisses + filet lumineux
  const CR = [[-1.05, -1.3, 0.8, 0.35], [-1.55, -0.55, 0.62, -0.2], [1.2, -1.15, 0.9, 0.25], [1.75, -0.3, 0.6, -0.4], [0.95, -2.6, 0.7, 0.1]];
  for (const [x, z, s, ry] of CR) {
    box(s, s * 0.82, s, dark, x, s * 0.41, z, ry);
    box(s * 0.86, 0.03, s * 0.86, darker, x, s * 0.82 + 0.015, z, ry);
    const f = new T.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(s * 0.5 + 0.006);
    box(s * 0.55, 0.025, 0.012, neonSoft, x + f.x, s * 0.62, z + f.z, ry);
  }
  // fines lignes néon au sol (lookdev : bandes au sol derrière le socle)
  for (const x of [-0.75, 0.75]) box(0.035, 0.012, 2.2, neonSoft, x, 0.006, -2.4);
  // bannière suspendue (derrière, à droite) + barre
  const bn = new T.Mesh(new T.PlaneGeometry(0.95, 2.4), new T.MeshStandardMaterial({ map: bannerTex(T), roughness: 0.85, metalness: 0, transparent: true, alphaTest: 0.5, side: T.DoubleSide }));
  bn.position.set(0.55, 3.0, -3.6); bn.rotation.y = -0.22; g.add(bn);
  const bar = box(1.15, 0.05, 0.05, dark, 0.55, 4.22, -3.6, -0.22);
  // brume rouge de fond + voile bas
  const fogTex = radialTex(T, [[0, 'rgba(150,18,12,.3)'], [0.5, 'rgba(80,9,7,.1)'], [1, 'rgba(40,4,4,0)']]);
  const back = new T.Mesh(new T.PlaneGeometry(14, 9), new T.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  back.position.set(0, 3.2, -11); g.add(back);
  const low = new T.Mesh(new T.PlaneGeometry(12, 2.2), new T.MeshBasicMaterial({ map: radialTex(T, [[0, 'rgba(120,110,120,.16)'], [1, 'rgba(60,60,70,0)']]), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  low.position.set(0, 0.5, -2.2); g.add(low);
  // poussières en suspension
  const N = 140, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 5; pos[i * 3 + 1] = Math.random() * 3.6; pos[i * 3 + 2] = -Math.random() * 6 + 1.2; }
  const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
  const dust = new T.Points(pg, new T.PointsMaterial({ size: 0.018, color: 0xffb8a0, transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending }));
  g.add(dust);
  // sol mouillé
  const floor = wetFloor(T, 40); g.add(floor);
  // éclairage d'ambiance des néons (deux ponctuelles rouges seulement — budget mobile)
  const p1 = new T.PointLight(0xff2a14, 4, 6, 2); p1.position.set(-1.3, 1.8, -2.6);
  const p2 = new T.PointLight(0xff2a14, 3.5, 6, 2); p2.position.set(1.4, 1.6, -3.4);
  g.add(p1, p2);
  g.userData = { floor, dust, glows, neon, banner: [bn, bar] };
  return g;
}

// ── Décor « planète » (vue Défense, fiche de la tourelle) : unité posée sur une plaque hexagonale du kit de la carte
//    (sb_kit.glb : plaque, cadre, nœuds lumineux, conifères, rochers), sol de mousse, forêt dense en arrière-plan, brume de nuit.
function groundTex(T) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1d2a1c'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const r = Math.random();
    x.fillStyle = r < 0.45 ? `rgba(46,64,38,${0.25 + Math.random() * 0.4})` : r < 0.75 ? `rgba(58,52,40,${0.2 + Math.random() * 0.35})` : `rgba(18,26,18,${0.3 + Math.random() * 0.4})`;
    const w = 2 + Math.random() * 9; x.fillRect(Math.random() * 256, Math.random() * 256, w, w * (0.4 + Math.random()));
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(14, 14);
  return t;
}

// Géométries procédurales détaillées (sapins étagés à branches irrégulières, rochers moussus, touffes d'herbe)
function mergeGeos(T, list) {
  list = list.map((g0) => (g0.index ? g0.toNonIndexed() : g0));
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('color', new T.BufferAttribute(col, 3));
  return out;
}
function paint(T, g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), v = new T.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = fn(v); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new T.BufferAttribute(c, 3));
  return g;
}
function spruceGeo(T, seed, H = 1) {
  let k = seed; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const parts = [];
  const trunk = new T.CylinderGeometry(0.012 * H, 0.03 * H, 0.3 * H, 5); trunk.translate(0, 0.15 * H, 0);
  parts.push(paint(T, trunk, () => [0.02, 0.014, 0.01]));
  const tiers = 15;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const rad = (0.17 * (1 - f) + 0.015) * H * (0.85 + r() * 0.3), h = (0.12 - 0.05 * f) * H, y = (0.1 + f * 0.86) * H;
    const g = new T.ConeGeometry(rad, h, 11, 1, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0) {
        const jag = (i % 2 ? 1.25 : 0.7) * (0.8 + r() * 0.4);
        p.setX(i, p.getX(i) * jag); p.setZ(i, p.getZ(i) * jag); p.setY(i, p.getY(i) - (jag - 0.8) * 0.05 * H);
      }
    }
    g.translate(0, y + h / 2, 0);
    parts.push(paint(T, g, (v) => { const o = Math.min(1, Math.hypot(v.x, v.z) / rad); const l = 0.5 + 0.5 * o; return [0.012 * l, 0.03 * l, 0.022 * l]; }));
  }
  const tip = new T.ConeGeometry(0.02 * H, 0.1 * H, 5); tip.translate(0, 1.0 * H, 0); parts.push(paint(T, tip, () => [0.012, 0.03, 0.02]));
  return mergeGeos(T, parts);
}
function cloudSkyTex(T) {
  const W = 1024, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#05070f'); gr.addColorStop(0.3, '#0b1226'); gr.addColorStop(0.5, '#141d34'); gr.addColorStop(0.62, '#0c1222'); gr.addColorStop(1, '#05070c');
  x.fillStyle = gr; x.fillRect(0, 0, W, Hh);
  let k = 91; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {                                    // nuages : amas doux éclairés par la lune, plus denses vers l'horizon
    const y = Hh * (0.12 + r() * 0.36), px = r() * W, rr = 18 + r() * 70 * (0.6 + (y / Hh));
    const gg = x.createRadialGradient(px, y, 0, px, y, rr);
    const a = 0.05 + r() * 0.08;
    gg.addColorStop(0, `rgba(110,125,160,${a})`); gg.addColorStop(0.6, `rgba(60,72,100,${a * 0.6})`); gg.addColorStop(1, 'rgba(20,25,40,0)');
    x.fillStyle = gg; x.fillRect(px - rr, y - rr, rr * 2, rr * 2);
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function pineGeo(T, seed, tiers = 7, H = 1) {
  let k = seed; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const parts = [];
  const trunk = new T.CylinderGeometry(0.035 * H, 0.06 * H, 0.42 * H, 6); trunk.translate(0, 0.21 * H, 0);
  parts.push(paint(T, trunk, () => [0.035, 0.022, 0.015]));
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const rad = (0.42 - 0.33 * f) * H * (0.9 + r() * 0.2), h = (0.34 - 0.08 * f) * H, y = (0.22 + f * 0.7) * H;
    const seg = 9 + Math.floor(r() * 3);
    const g = new T.ConeGeometry(rad, h, seg, 2, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      if (yy < h / 2 - 1e-4) {                          // anneaux bas : branches irrégulières, pointes tombantes
        const jag = (i % 2 ? 1.18 : 0.86) * (0.88 + r() * 0.24);
        p.setX(i, p.getX(i) * jag); p.setZ(i, p.getZ(i) * jag);
        if (yy < -h / 2 + 1e-4) p.setY(i, yy - (jag - 0.9) * 0.12 * H);
      }
    }
    g.translate(0, y + h / 2, 0);
    parts.push(paint(T, g, (v) => {
      const inner = Math.min(1, Math.hypot(v.x, v.z) / rad);       // creux sombre, pointes plus claires
      const lit = 0.55 + 0.45 * inner + 0.15 * f;
      return [0.008 * lit, 0.04 * lit, 0.022 * lit];
    }));
  }
  return mergeGeos(T, parts);
}
function rockGeo(T, seed) {
  let k = seed; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const g = new T.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new T.Vector3();
  const disp = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!disp.has(key)) disp.set(key, 0.75 + r() * 0.45);
    const d = disp.get(key); p.setXYZ(i, v.x * d * 1.25, Math.max(-0.2, v.y * d * 0.7), v.z * d);
  }
  return paint(T, g, (q) => q.y > 0.35 ? [0.03, 0.05, 0.025] : [0.06, 0.065, 0.07]);  // dessus moussu
}
function grassGeo(T) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, h = 0.18 + (i % 3) * 0.07;
    const g = new T.BufferGeometry();
    const x = Math.cos(a) * 0.03, z = Math.sin(a) * 0.03, lx = Math.cos(a) * 0.09, lz = Math.sin(a) * 0.09;
    g.setAttribute('position', new T.BufferAttribute(new Float32Array([x - 0.012, 0, z, x + 0.012, 0, z, lx, h, lz]), 3));
    parts.push(paint(T, g, (v) => v.y > 0.05 ? [0.06, 0.09, 0.03] : [0.02, 0.03, 0.015]));
  }
  return mergeGeos(T, parts);
}
function skyTex(T) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#04070d'); g.addColorStop(0.55, '#0a1620'); g.addColorStop(0.78, '#123038'); g.addColorStop(1, '#0c1a1d');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

function buildPlanetSet(T, kit) {
  const g = new T.Group(); g.name = 'U3D_PLANET';
  const get = (n) => kit.getObjectByName(n);
  const ground = new T.Mesh(new T.CircleGeometry(70, 72), new T.MeshStandardMaterial({ map: groundTex(T), roughness: 0.96, metalness: 0, envMapIntensity: 0.05, color: 0x30363a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; g.add(ground);
  // plaques hexagonales (pointe vers ±z) : 27,7 unités de rayon dans le kit → 1,2 m ici
  const s = 1.2 / 27.7, sy = s * 1.6;
  const nodesMat = new T.MeshBasicMaterial({ color: new T.Color(0.22, 0.72, 1.0).multiplyScalar(3.2) });
  const proto = new T.Group();
  const deck = new T.MeshStandardMaterial({ color: 0x07090c, metalness: 0.7, roughness: 0.22, envMapIntensity: 0.6 });   // dalle mouillée       // MAT_DECK de la carte
  const armor = new T.MeshStandardMaterial({ color: 0x161a1f, metalness: 0.8, roughness: 0.35, envMapIntensity: 0.5 });      // MAT_ARMOR_DARK
  for (const n of ['KIT_PLATE', 'KIT_FRAME', 'KIT_NODES']) {
    const src = get(n); if (!src) continue;
    src.traverse((o) => {
      if (!o.isMesh) return;
      const m = new T.Mesh(o.geometry, n === 'KIT_NODES' ? nodesMat : n === 'KIT_FRAME' ? armor : deck);
      m.receiveShadow = true; m.castShadow = n === 'KIT_FRAME'; proto.add(m);
    });
  }
  proto.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMapIntensity = 0.6; } });
  const dx = 48 * s, dz = 41.57 * s;
  const HEX = [[0, 0], [2, 0], [-2, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];   // plateforme compacte (le sol mouillé fait le reste)
  HEX.forEach(([i, j], k) => {
    const h = proto.clone(); h.scale.set(s, sy, s);
    if (k % 2 === 1) h.children.forEach((c) => { if (c.material === nodesMat) c.visible = false; });   // un hexagone sur deux sans nœuds lumineux
    h.position.set(i * dx / 2, -0.36 * sy - (i || j ? 0.02 : 0), j * dz);
    g.add(h);
  });
  // végétation instanciée (un InstancedMesh par sous-maillage) — forêt en couronne, plus dense derrière
  const rnd = (() => { let k = 7; return () => ((k = (k * 16807) % 2147483647) / 2147483647); })();
  const scatter = (name, n, smin, smax, rmin, rmax, back = 0.7) => {
    const src = get(name); if (!src) return;
    const parts = []; src.updateMatrixWorld(true);
    src.traverse((o) => { if (o.isMesh) parts.push(o); });
    const mats = [];
    for (let k = 0; k < n; k++) {
      let x, z, tries = 0;
      do {
        const a = rnd() * Math.PI * 2, r = rmin + Math.sqrt(rnd()) * (rmax - rmin);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        if (z > 0 && rnd() < back) z = -z;                               // la forêt se masse derrière le sujet
        tries++;
      } while (tries < 16 && ((z > 1.5 && Math.abs(x) < 5) || (z < 1 && z > -11 && Math.abs(x) < 1.8 + 0.1 * -z) || Math.hypot(x, z) < 2.6));
      const sc = smin + rnd() * (smax - smin);
      mats.push(new T.Matrix4().compose(new T.Vector3(x, -0.03, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6.28),
        new T.Vector3(sc, sc * (0.85 + rnd() * 0.35), sc)));
    }
    for (const p of parts) {
      p.material.envMapIntensity = 0.05; if (p.material.color) p.material.color.multiplyScalar(0.35);
      const im = new T.InstancedMesh(p.geometry, p.material, mats.length);
      const rel = p.matrixWorld;
      mats.forEach((m, k) => im.setMatrixAt(k, m.clone().multiply(rel)));
      im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
    }
  };
  // sapins procéduraux détaillés (3 variantes, teinte par instance), feuillus du kit en appoint, rochers, herbe, buissons
  const place = (geo, mat, n, smin, smax, rmin, rmax, back, tint) => {
    const im = new T.InstancedMesh(geo, mat, n); const m4 = new T.Matrix4(), col = new T.Color();
    for (let k = 0; k < n; k++) {
      let x, z, tries = 0;
      do {
        const a = rnd() * Math.PI * 2, r = rmin + Math.sqrt(rnd()) * (rmax - rmin);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        if (z > 0 && rnd() < back) z = -z;
        tries++;
      } while (tries < 24 && ((z > 1.5 && Math.abs(x) < 6) || (z < 1 && z > -22 && Math.abs(x) < 3.2 + 0.18 * -z) || Math.hypot(x, z) < rmin));
      const sc = smin + rnd() * (smax - smin);
      m4.compose(new T.Vector3(x, -0.03, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6.28),
        new T.Vector3(sc * (0.9 + rnd() * 0.2), sc * (0.85 + rnd() * 0.35), sc * (0.9 + rnd() * 0.2)));
      im.setMatrixAt(k, m4);
      if (tint) { col.setHSL(tint[0] + (rnd() - 0.5) * tint[1], 0.35, 0.42 + rnd() * tint[2]); im.setColorAt(k, col); }
    }
    im.frustumCulled = false; im.receiveShadow = true; g.add(im); return im;
  };
  const vegMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true, envMapIntensity: 0, color: 0x161c1a });
  for (let v = 0; v < 3; v++) place(spruceGeo(T, 11 + v * 97, 1), vegMat, 100, 5, 8.5, 10, 40, 0.88, [0.38, 0.05, 0.1]);
  place(spruceGeo(T, 501, 1), vegMat, 26, 3.2, 5.2, 9.5, 14, 0.85, [0.38, 0.05, 0.1]);   // jeunes épicéas en lisière de clairière
  const rockMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, flatShading: true, envMapIntensity: 0.05, color: 0x6a6a6a });
  for (let v = 0; v < 2; v++) place(rockGeo(T, 33 + v * 71), rockMat, 8, 0.1, 0.3, 3.5, 12, 0.5, null);
  const grassMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide, envMapIntensity: 0 });
  place(grassGeo(T), grassMat, 420, 0.7, 1.4, 2.2, 9, 0.85, [0.25, 0.08, 0.12]);
  // montagnes lointaines (silhouette au-delà de la brume) + étoiles
  const mg = new T.BufferGeometry(), mp = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const h0 = 5 + 4 * Math.abs(Math.sin(i * 0.37)) + 3 * Math.abs(Math.sin(i * 1.13 + 1)), h1 = 5 + 4 * Math.abs(Math.sin((i + 1) * 0.37)) + 3 * Math.abs(Math.sin((i + 1) * 1.13 + 1));
    const R0 = 48;
    const P = (a, y) => [Math.cos(a) * R0, y, Math.sin(a) * R0];
    mp.push(...P(a0, -1), ...P(a1, -1), ...P(a1, h1), ...P(a0, -1), ...P(a1, h1), ...P(a0, h0));
  }
  mg.setAttribute('position', new T.BufferAttribute(new Float32Array(mp), 3));
  const mtn = new T.Mesh(mg, new T.MeshBasicMaterial({ color: 0x0f2226, fog: false, side: T.DoubleSide })); void mtn;   // ancienne crête unie remplacée par les trois chaînes
  const sp = [];
  for (let i = 0; i < 260; i++) { const a = rnd() * 6.28, e = 0.18 + rnd() * 1.2; sp.push(Math.cos(a) * Math.cos(e) * 60, Math.sin(e) * 60, Math.sin(a) * Math.cos(e) * 60); }
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(new Float32Array(sp), 3));
  g.add(new T.Points(sg, new T.PointsMaterial({ color: 0xcfe0ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false })));
  // lucioles cyan (animées dans la boucle)
  const fp = new Float32Array(30 * 3);
  for (let i = 0; i < 30; i++) { fp[i * 3] = (rnd() - 0.5) * 9; fp[i * 3 + 1] = 0.2 + rnd() * 2.2; fp[i * 3 + 2] = -rnd() * 8 + 1.5; }
  const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(fp, 3));
  const flies = new T.Points(fg, new T.PointsMaterial({ color: 0x7ff6ff, size: 0.035, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(flies);
  // lueurs cyan des nœuds (2 ponctuelles) — rappel de la carte de nuit
  const p1 = new T.PointLight(0x46c8ff, 2.2, 5, 2); p1.position.set(1.4, 0.5, -0.8);
  const p2 = new T.PointLight(0x46c8ff, 1.6, 5, 2); p2.position.set(-1.6, 0.5, -1.2);
  g.add(p1, p2);
  // ciel nocturne nuageux (dôme) — remplace le fond uni
  const dome = new T.Mesh(new T.SphereGeometry(95, 48, 24), new T.MeshBasicMaterial({ map: cloudSkyTex(T), side: T.BackSide, fog: false, depthWrite: false }));
  dome.rotation.y = 2.2; g.add(dome);
  // reliefs montagneux : trois chaînes en perspective atmosphérique, crêtes nettes, neige pâle sur la plus lointaine
  const range = (R0, base, amp, seed, cBot, cTop, snow) => {
    const N = 360, pos = [], cols = [];
    const f = (k) => {
      const a = k / N * 6.283;
      const v = 0.45 * Math.pow(Math.abs(Math.sin(a * 3 + seed)), 1.4) + 0.28 * Math.pow(Math.abs(Math.sin(a * 7.3 + seed * 2.1)), 1.8)
        + 0.14 * Math.abs(Math.sin(a * 19 + seed * 3)) + 0.08 * Math.abs(Math.sin(a * 53 + seed)) + 0.05 * Math.abs(Math.sin(a * 131));
      return base + amp * v;
    };
    const b0 = new T.Color(cBot), t0 = new T.Color(cTop), sn = new T.Color(snow || cTop), tmp = new T.Color();
    const col = (y) => { const k = Math.max(0, Math.min(1, (y + 2) / (base + amp + 2))); tmp.copy(b0).lerp(t0, Math.pow(k, 1.5)); return tmp; };
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 6.283, a1 = (i + 1) / N * 6.283, h0 = f(i), h1 = f(i + 1);
      const P = (a, y) => [Math.cos(a) * R0, y, Math.sin(a) * R0];
      pos.push(...P(a0, -2), ...P(a1, -2), ...P(a1, h1), ...P(a0, -2), ...P(a1, h1), ...P(a0, h0));
      for (const y of [-2, -2, h1, -2, h1, h0]) { const c = col(y); cols.push(c.r, c.g, c.b); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(cols), 3));
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide, toneMapped: false }));
    m.rotation.y = seed; g.add(m);
  };
  range(80, 6, 28, 0.4, 0x0a1224, 0x2c3c5e, 0x46546e);   // lointaine : bleu nuit, crêtes éclairées par la lune, neige pâle
  range(68, 3, 16, 1.7, 0x060a16, 0x0f172c);             // médiane
  range(56, 1, 8, 2.9, 0x04070d, 0x0a1220);              // contreforts sombres
  // nappe de brume au pied des montagnes (sépare le fond de la forêt)
  const hz = new T.Mesh(new T.CylinderGeometry(50, 50, 7, 64, 1, true), new T.MeshBasicMaterial({ map: (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(70,90,130,.45)'); gr.addColorStop(0.6, 'rgba(40,52,80,.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 4, 128); return new T.CanvasTexture(c); })(),
    transparent: true, side: T.BackSide, depthWrite: false, fog: false, blending: T.AdditiveBlending, opacity: 0.55 }));
  hz.position.y = 3.2; void hz;          // voile de pied retiré (bande blanchâtre)
  // lueur rouge derrière la forêt (gauche) : halo + ponctuelle qui rougit troncs et brume
  const redHalo = new T.Sprite(new T.SpriteMaterial({ map: radialTex(T, [[0, 'rgba(255,60,30,.55)'], [0.4, 'rgba(200,30,20,.2)'], [1, 'rgba(120,10,10,0)']]),
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  redHalo.scale.set(20, 9, 1); redHalo.position.set(-11, 2.2, -20); g.add(redHalo);
  const redL = new T.PointLight(0xff2a14, 9, 18, 1.4); redL.position.set(-8, 2.0, -12); g.add(redL);
  // sol mouillé réfléchissant (reflets des balises, de l'unité et de la forêt)
  const wet = wetFloor(T, 44); wet.position.y = 0.006; wet.material.uniforms.base.value.setHex(0x05070a); wet.userData.rt.setSize(512, 512); g.add(wet);
  // balises lumineuses blanc-cyan autour de la plateforme
  const lampMat = new T.MeshBasicMaterial({ color: new T.Color(0.75, 0.95, 1).multiplyScalar(2.6) });
  const lampBody = new T.MeshStandardMaterial({ color: 0x15191d, metalness: 0.6, roughness: 0.5 });
  for (const [a, rr] of [[0.95, 1.7], [2.3, 1.75], [3.6, 2.4], [4.9, 2.5], [5.5, 2.3]]) {   // moitié moins de balises
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const b = new T.Mesh(new T.BoxGeometry(0.17, 0.08, 0.11), lampBody); b.position.set(x, 0.04, z); b.rotation.y = -a; g.add(b);
    const l = new T.Mesh(new T.BoxGeometry(0.14, 0.035, 0.115), lampMat); l.position.set(x, 0.065, z); l.rotation.y = -a; g.add(l);
  }
  // conteneurs militaires (gauche) et poste de garde (droite) à éclairages blancs, tour à balise rouge
  const steel = new T.MeshStandardMaterial({ color: 0x1a1f24, metalness: 0.7, roughness: 0.55 });
  const strip = new T.MeshBasicMaterial({ color: new T.Color(1, 0.98, 0.94).multiplyScalar(2.2) });
  const redM = new T.MeshBasicMaterial({ color: new T.Color(1, 0.1, 0.05).multiplyScalar(6) });
  const cont = new T.Group(); cont.position.set(-6.8, 0, -7.0); cont.rotation.y = 0.75; g.add(cont);
  const cb = new T.Mesh(new T.BoxGeometry(2.8, 1.1, 1.0), steel); cb.position.y = 0.55; cont.add(cb);
  for (let i = -3; i <= 3; i++) { const rib = new T.Mesh(new T.BoxGeometry(0.05, 1.08, 1.04), steel); rib.position.set(i * 0.4, 0.55, 0); cont.add(rib); }
  const cl = new T.Mesh(new T.BoxGeometry(0.42, 0.06, 0.02), strip); cl.position.set(-0.6, 0.62, 0.51); cont.add(cl);
  const cb2 = new T.Mesh(new T.BoxGeometry(1.4, 0.8, 0.9), steel); cb2.position.set(1.7, 0.4, -0.9); cb2.rotation.y = 0.5; cont.add(cb2);
  const post = new T.Group(); post.position.set(7.0, 0, -8.2); post.rotation.y = -0.4; g.add(post);
  const pb = new T.Mesh(new T.BoxGeometry(2.2, 1.7, 1.6), steel); pb.position.y = 0.85; post.add(pb);
  const roof = new T.Mesh(new T.BoxGeometry(2.4, 0.12, 1.8), steel); roof.position.y = 1.76; post.add(roof);
  for (const xx of [-0.55, 0.45]) { const w = new T.Mesh(new T.BoxGeometry(0.28, 0.42, 0.02), strip); w.position.set(xx, 1.0, 0.81); post.add(w); }
  const lamp2 = new T.Mesh(new T.BoxGeometry(0.3, 0.05, 0.05), strip); lamp2.position.set(0, 1.62, 0.82); post.add(lamp2);
  const tower = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, 4.6, 6), steel); tower.position.set(0.9, 2.3, -0.4); post.add(tower);
  const tstrip = new T.Mesh(new T.BoxGeometry(0.04, 1.0, 0.04), strip); tstrip.position.set(0.97, 3.0, -0.33); post.add(tstrip);
  const beacon = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), redM); beacon.position.set(0.9, 4.66, -0.4); post.add(beacon);
  const beacon2 = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), redM); beacon2.position.set(-5.6, 3.6, -7.5); g.add(beacon2);
  const mast2 = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 3.6, 5), steel); mast2.position.set(-5.6, 1.8, -7.5); g.add(mast2);
  const ws = new T.Mesh(new T.BoxGeometry(0.03, 0.7, 0.03), strip); ws.position.set(-5.56, 2.3, -7.46); g.add(ws);
  const postL = new T.PointLight(0xdfe8ff, 2, 6, 2); postL.position.set(6.4, 1.5, -6.9); g.add(postL);
  // rochers sombres près de la plateforme (droite) + herbes de premier plan (sombres, en amorce)
  const rockM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: true, color: 0x6a6a6a, envMapIntensity: 0.2 });
  for (const [x, z, sc] of [[2.9, -1.2, 0.5], [3.4, -0.4, 0.32], [-2.4, -0.6, 0.3]]) { const m = new T.Mesh(rockGeo(T, 13 + x * 7), rockM); m.position.set(x, 0.05, z); m.scale.setScalar(sc); g.add(m); }
  const fgMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: T.DoubleSide, color: 0x2a332e });
  const fgGeo = grassGeo(T);
  const fgr = new T.InstancedMesh(fgGeo, fgMat, 26); const m4 = new T.Matrix4();
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, x = side * (1.1 + rnd() * 1.4), z = 2.2 + rnd() * 1.6, sc = 0.7 + rnd() * 0.7;
    m4.compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6.3), new T.Vector3(sc, sc * 1.3, sc)); fgr.setMatrixAt(i, m4);
  }
  g.add(fgr);
  // brume au sol bleutée (dérive) + nappe rouge à gauche
  const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 80; i++) { const px = rnd() * 256, py = rnd() * 256, r0 = 18 + rnd() * 55;
      const gr = x.createRadialGradient(px, py, 0, px, py, r0); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(px - r0, py - r0, r0 * 2, r0 * 2); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
  const mists = [];
  for (const [y, z, x0, w, o, col] of [[0.1, -1, 0, 16, 0.06, 0x6f90b0], [0.5, -7, -6, 14, 0.1, 0xff4a30]]) {
    const t = mistTex.clone(); t.needsUpdate = true; t.repeat.set(w / 9, w / 9);
    const m = new T.Mesh(new T.PlaneGeometry(w, w), new T.MeshBasicMaterial({ map: t, color: col, transparent: true, opacity: o, depthWrite: false, blending: T.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x0, y, z); g.add(m); mists.push(m);
  }
  g.userData = { nodesMat, flies, mists, blinks: [beacon, beacon2], wet, sky: null };
  return g;
}

export const SBUnit3D = {
  _p: null,        // promesse d'init
  host: null,      // conteneur courant
  running: false,

  async _init() {
    const S = await waitSB3D();
    const T = S.THREE;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.AgXToneMapping; r.toneMappingExposure = 1.25;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'u3d-canvas';
    this.T = T; this.r = r;

    const scene = new T.Scene();
    const pm = new T.PMREMGenerator(r);
    scene.environment = pm.fromScene(new S.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pm.dispose();

    scene.add(new T.HemisphereLight(0x8fa6c8, 0x0a0c10, 0.42));
    const key = new T.DirectionalLight(0xfffaf2, 3.6);
    key.position.set(2.2, 3.4, 2.6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 1, far: 10 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    const rim = new T.DirectionalLight(0xff3020, 2.4); rim.position.set(2.6, 1.7, -2.0);        // rim rouge douce
    const back = new T.DirectionalLight(0x40d0ff, 0.9); back.position.set(-2.4, 1.5, -2.4);    // rim cyan très subtile
    const fill = new T.DirectionalLight(0xc8d4ff, 0.3); fill.position.set(-2.5, 0.6, 2.0);
    scene.add(key, rim, back, fill);

    const turn = new T.Group(); scene.add(turn);
    this.plinthG = plinth(T); this.shadowG = contactShadow(T);
    turn.add(this.plinthG, this.shadowG);
    this.scene = scene; this.turn = turn;

    const cam = new T.PerspectiveCamera(22, 1, 0.1, 200);
    this.cam = cam;

    // Décor héros (masqué hors plein écran) + contre-jour rouge gauche + post-traitement bloom si disponible
    const set = buildSet(T); set.position.y = -0.09; set.visible = false; scene.add(set);
    const rimL = new T.DirectionalLight(0xff2e14, 0); rimL.position.set(-2.8, 2.4, -2.4); scene.add(rimL);
    this.set = set; this.rimL = rimL; this.key = key; this.back = back; this.fill = fill;
    this.hemi = scene.children.find((o) => o.isHemisphereLight);
    this.fog = new T.FogExp2(0x07080b, 0.055);
    if (S.EffectComposer && S.UnrealBloomPass) {
      const comp = new S.EffectComposer(r);
      comp.addPass(new S.RenderPass(scene, cam));
      this.bloom = new S.UnrealBloomPass(new T.Vector2(256, 256), 0.45, 0.5, 1.4);
      comp.addPass(this.bloom);
      comp.addPass(new S.OutputPass());
      this.comp = comp;
    }

    this.S = S; this.rim = rim;
    this.units = {};
    // Interaction « 2 tonnes » : le doigt déplace une cible d'angle ; le modèle la rattrape par un ressort lourd
    // (démarrage lent, vitesse plafonnée, glisse longue au lâcher, léger tassement en fin de course).
    // Un tap (sans glisser) : UNIT07_READY (garde) / impulsion de visière (lourd).
    // Plein écran : les gestes sont écoutés sur l'écran (la page défile verticalement, le glisser horizontal fait tourner) ;
    // vitrine compacte : sur le canvas.
    this.yaw = 0.45; this.yawT = 0.45; this.w = 0; this.tv = 0; this.lastTouch = -1e9;
    this.zoom = 1; this.zoomT = 1;                       // pincer pour dézoomer un peu (1 … 1,5)
    let drag = null, pinch = null;
    const ptrs = new Map();
    const dist = () => { const p = [...ptrs.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    const down = (e) => {
      if (this._isHero) {
        if (e.target.closest && e.target.closest('button, a, input, .dash-section-card, .info, .card')) return;
        const sp = this.host && this.host.parentElement && this.host.parentElement.querySelector('.ud-hero-space, .space');
        if (sp && e.clientY > sp.getBoundingClientRect().bottom) return;     // sous la bande : ce sont les cartes
      }
      const now = performance.now();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { pinch = { d0: dist(), z0: this.zoomT }; drag = null; return; }   // deux doigts : zoom, pas de rotation
      drag = { x: e.clientX, x0: e.clientX, y0: e.clientY, t: now, t0: now, v: 0 }; this.tv = 0; this._schedule();
    };
    const move = (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        this.zoomT = Math.max(1, Math.min(1.5, pinch.z0 * pinch.d0 / Math.max(20, dist())));
        this.lastTouch = performance.now(); return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, now = performance.now();
      const d = dx * 0.0075;
      this.yawT += d; drag.v = drag.v * 0.6 + 0.4 * (d / Math.max(8, now - drag.t) * 1000);   // rad/s lissé
      drag.x = e.clientX; drag.t = now; this.lastTouch = now;
    };
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      if (!drag) return;
      const tap = e.type === 'pointerup' && Math.abs(drag.x - drag.x0) < 6 && Math.abs(e.clientY - drag.y0) < 6 && performance.now() - drag.t0 < 350;
      if (tap) { if (this.acts) this.play('UNIT07_READY'); else this.pulse = performance.now(); }
      if (performance.now() - drag.t < 90) this.tv = Math.max(-2, Math.min(2, drag.v));     // élan conservé au lâcher
      drag = null; this.lastTouch = performance.now(); this._schedule();
    };
    const wheel = (e) => { e.preventDefault(); this.zoomT = Math.max(1, Math.min(1.5, this.zoomT * (1 + e.deltaY * 0.0012))); };
    this._input = { down, move, up, wheel, el: null };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return this;
  },

  // Charge (une seule fois) le modèle d'une unité ; garde : riggé + clips, sinon statique fusionné par matériau
  async _load(key) {
    if (this.units[key]) return this.units[key];
    const U = UNITS[key], T = this.T, loader = new this.S.GLTFLoader();
    const e = { key, model: null };
    let gltf = null;
    try { gltf = await loader.loadAsync(U.url); } catch (err) { console.warn('[SBUnit3D] modèle indisponible', U.url, err); }
    if (U.rigged && gltf && gltf.animations && gltf.animations.length) {
      const model = gltf.scene; const mats = {};
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
        tuneMat(o.material); mats[o.material.name] = o.material;
      });
      e.model = model;
      e.mixer = new T.AnimationMixer(model);
      e.acts = {};
      for (const c of gltf.animations) e.acts[c.name] = e.mixer.clipAction(c);
      for (const k of ['UNIT07_SCAN', 'UNIT07_READY', 'UNIT07_INSPECT']) {
        const a = e.acts[k]; if (a) { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; }
      }
      e.base = e.acts.UNIT07_IDLE; e.base.play();
      e.mixer.addEventListener('finished', (ev) => { if (ev.action === this.cur) this._toIdle(); });
      e.glow = { visor: mats.M_EMISSIVE_RED_VISOR, wrist: mats.M_EMISSIVE_WRIST };
      e.footR = model.getObjectByName('foot_R') || null;
      for (const m of Object.values(e.glow)) if (m) m.userData.base = m.emissiveIntensity;
    } else if (U.wear && gltf) {
      const model = gltf.scene; const glows = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        tuneRP(o.material);
        if (/GLOW_RED|GLOW_CORE/.test(o.material.name) && !glows.includes(o.material)) glows.push(o.material);
      });
      e.model = model; e.glows = glows;
      if (U.scale) model.scale.setScalar(U.scale);
      if (U.plinth === false) model.position.y = -0.09;            // posé au sol (le socle d'ancrage remplace le plinthe)
      e.baseY = model.position.y;
      if (U.turret) {
        // tourelle PD-3 : hiérarchie animable exportée par pd_game.py
        const n = (k) => model.getObjectByName(k);
        e.rig = { yaw: n('TU_YAW'), pitch: n('TU_PITCH'), sensor: n('TU_SENSOR'), barrels: [] };
        model.traverse((o) => { if (/^TU_BARREL_(UL|UR|LL|LR)$/.test(o.name)) e.rig.barrels.push(o); });
        const ord = ['TU_BARREL_UL', 'TU_BARREL_LR', 'TU_BARREL_UR', 'TU_BARREL_LL'];          // tir alterné en croix
        e.rig.barrels.sort((p, q) => ord.indexOf(p.name) - ord.indexOf(q.name));
        for (const b of e.rig.barrels) b.userData.z0 = b.position.z;
      }
    } else {
      if (!gltf) gltf = await loader.loadAsync(U.fallback);
      e.model = mergeByMaterial(T, gltf.scene);
    }
    this.turn.add(e.model);
    const bb = new T.Box3().setFromObject(e.model), sz = bb.getSize(new T.Vector3());
    e.top = bb.max.y; e.wd = Math.max(sz.x, sz.z);          // hauteur / emprise réelles (cadrage héros)
    e.model.visible = false;
    this.units[key] = e;
    return e;
  },

  // Active une unité : visibilité, animations, éclairage
  _use(e) {
    for (const u of Object.values(this.units)) u.model.visible = (u === e);
    if (this.e === e) return;
    if (this.cur && this.e && this.e.base) { this.cur.stop(); this.e.base.reset().play(); }
    this.e = e; this.cur = null; this.curName = null;
    this.mixer = e.mixer || null; this.acts = e.acts || null; this.base = e.base || null; this._glow = e.glow || null;
    this._isHero = null;                         // réapplique l'éclairage pour cette unité
    for (const o of this.set.userData.banner) o.visible = UNITS[e.key].banner === true;   // bannière Red Phalanx : soldat lourd seulement
    this.plinthG.visible = UNITS[e.key].plinth !== false;
    this.shadowG.scale.setScalar(UNITS[e.key].turret ? 1.75 : 1);
    this.pulse = 0; this._w = 0;
  },

  // Joue une animation ponctuelle puis revient à l'Idle (fondus courts, jamais deux à la fois)
  play(name) {
    const a = this.acts && this.acts[name];
    if (!a || this.cur) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
    this.base.crossFadeTo(a, 0.45, false);
    this.cur = a; this.curName = name;
  },
  _toIdle() {
    const a = this.cur; if (!a) return;
    this.base.reset(); this.base.setEffectiveWeight(1); this.base.play();
    a.crossFadeTo(this.base, 0.5, false);
    this.cur = null; this.curName = null; this._schedule();
  },
  // Après 5–8 s sans interaction : SCAN (3 fois sur 4) ou INSPECT
  _schedule() { this.nextAuto = performance.now() + 5000 + Math.random() * 3000; },
  _autoplay(now) {
    if (!this.mixer || this.cur || now < this.nextAuto) return;
    this.play(Math.random() < 0.75 ? 'UNIT07_SCAN' : 'UNIT07_INSPECT');
  },
  // Signaux lumineux synchronisés : pulse de visière (SCAN), clignement du poignet (INSPECT)
  _glowFx() {
    const g = this._glow; if (!g) return;
    const t = this.cur ? this.cur.time : -1;
    if (g.visor) {
      const k = this.curName === 'UNIT07_SCAN' ? Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 1.9) / 1.4)))) : 0;
      g.visor.emissiveIntensity = g.visor.userData.base * (1 + 0.8 * k);
    }
    if (g.wrist) {
      const on = this.curName === 'UNIT07_INSPECT' && t > 1.6 && t < 3.4;
      const k = on ? 0.5 + 0.5 * Math.sin((t - 1.6) * Math.PI * 2 * 1.6) : 0;
      g.wrist.emissiveIntensity = g.wrist.userData.base * (1 + 1.6 * k);
    }
  },

  // Pied droit ouvert vers l'extérieur : rotation autour de la verticale du modèle, à la cheville (tête de l'os),
  // recalculée à chaque image par-dessus les clips (qui animent foot_R).
  _footOut() {
    const e = this.e, deg = e && UNITS[e.key].footOut; if (!deg || !e.footR) return;
    const T = this.T, b = e.footR, p = b.parent;
    const v = this._fv || (this._fv = { q: new T.Quaternion(), qp: new T.Quaternion(), r: new T.Quaternion(), up: new T.Vector3(0, 1, 0), pos: new T.Vector3(), inv: new T.Matrix4() });
    e.model.updateMatrixWorld(true);
    // côté du pied dans le repère du modèle (soldat face +Z) : ouvrir = tourner la pointe vers ce côté
    v.inv.copy(e.model.matrixWorld).invert();
    v.pos.setFromMatrixPosition(b.matrixWorld).applyMatrix4(v.inv);
    const ang = Math.sign(v.pos.x || -1) * deg * Math.PI / 180;
    v.up.set(0, 1, 0).transformDirection(e.model.matrixWorld);
    b.getWorldQuaternion(v.q); p.getWorldQuaternion(v.qp);
    v.r.setFromAxisAngle(v.up, ang);
    b.quaternion.copy(v.qp.invert().multiply(v.r.multiply(v.q)));
    b.updateMatrixWorld(true);
  },

  // Monte la vitrine dans `host` (un conteneur avec une hauteur CSS)
  async mount(host, key = 'garde', opts = {}) {
    if (!host) return;
    if (!UNITS[key]) key = 'garde';
    const decor = opts.decor || UNITS[key].decor || 'hangar';
    if (decor !== this._decor) { this._decor = decor; this._isHero = null; this._w = 0; }
    this.host = host;
    host.classList.add('u3d-loading');
    this._req = key;
    try {
      await (this._p || (this._p = this._init()));
      if (decor === 'planet') await this._planet();
      const e = await this._load(key);
      if (this._req !== key || this.host !== host) return;      // une autre unité a été demandée entretemps
      this._use(e);
    }
    catch (e) { console.warn('[SBUnit3D]', e); host.classList.remove('u3d-loading'); host.classList.add('u3d-fail'); this._p = null; return; }
    if (this.host !== host) return;              // un autre montage a pris la main entretemps
    host.classList.remove('u3d-loading');
    if (this.r.domElement.parentNode !== host || this._key !== key) {
      if (this.r.domElement.parentNode !== host) host.appendChild(this.r.domElement);
      this.yaw = this.yawT = UNITS[key].yaw ?? 0.45; this.w = 0; this.tv = 0; this.zoom = this.zoomT = 1; this.lastTouch = performance.now() - 1300; this._schedule();
    }
    this._key = key;
    this._resize();
    this._bind(host.classList.contains('u3d-hero') ? host.parentElement : this.r.domElement);
    if (!this.running) { this.running = true; this._t = performance.now(); requestAnimationFrame(this._loop); }
  },

  _bind(el) {
    const I = this._input; if (!el || I.el === el) return;
    if (I.el) { I.el.removeEventListener('pointerdown', I.down); I.el.style.touchAction = ''; }
    if (I.el) I.el.removeEventListener('wheel', I.wheel);
    I.el = el; el.addEventListener('pointerdown', I.down); el.addEventListener('wheel', I.wheel, { passive: false });
    if (el === this.r.domElement) el.style.touchAction = 'pan-y';
  },

  unmount(host) {
    if (host && this.host !== host) return;
    this.host = null; this.running = false;
    if (this._input && this._input.el) { this._input.el.removeEventListener('pointerdown', this._input.down); this._input.el = null; }
    if (this.r && this.r.domElement.parentNode) this.r.domElement.remove();
  },

  _resize() {
    const h = this.host; if (!h) return;
    const w = h.clientWidth, ht = h.clientHeight;
    if (!w || !ht) return false;
    if (this._w !== w || this._h !== ht) {
      this._w = w; this._h = ht;
      this.r.setSize(w, ht, false);
      this.r.domElement.style.width = '100%'; this.r.domElement.style.height = '100%';
      const cam = this.cam; cam.aspect = w / ht;
      const U = UNITS[(this.e && this.e.key) || 'garde'];
      const hero = h.classList.contains('u3d-hero');
      const ctx = hero || h.classList.contains('u3d-ctx');          // décor sans plein écran (vue Défense de la carte)
      this._hero(ctx);
      if (ctx) {
        // Cadrage héros : le sujet est centré dans la bande libre entre l'en-tête (titre + méta) et le haut des cartes,
        // mesurées dans le DOM (indépendant de la hauteur réelle de l'en-tête / safe-area). Vue en boîte : bande fixe sous la légende.
        const band = hero ? this._band(ht) : [ht * 0.2, ht * 0.97];
        const bandH = Math.max(120, band[1] - band[0]);
        cam.fov = 34;
        const tf = 2 * Math.tan(cam.fov * Math.PI / 360);
        const top = (this.e && this.e.top) || U.h, H = top + 0.16;   // socle compris
        const wd = Math.min(U.wdCap || 1.4, ((this.e && this.e.wd) || 1.2) * 0.8);
        const fit = Math.max(H / (tf * (bandH * 0.92) / ht), wd / (tf * cam.aspect)) * (U.zoom || 1);
        const cy = top * 0.5;
        const low = this._decor === 'planet';
        cam.position.set(0, top * (low ? 0.3 : 0.4), fit);
        cam.lookAt(0, cy, 0);
        this._camBase = { pos: cam.position.clone(), tgt: new this.T.Vector3(0, cy, 0), fit };
        cam.clearViewOffset(); cam.updateProjectionMatrix();
        // où tombe le centre du sujet à l'écran, puis décalage de la fenêtre de vue pour le poser au milieu de la bande
        cam.updateMatrixWorld(true);
        const pY = (y) => (1 - new this.T.Vector3(0, y, 0).project(cam).y) / 2 * ht;
        const ySub = (pY(top) + pY(-0.09)) / 2, yBand = (band[0] + band[1]) / 2;     // milieu réel tête–pieds à l'écran
        cam.setViewOffset(w, ht, 0, ySub - yBand, w, ht);
        h.style.setProperty('--u3d-band', Math.round(ht - band[1]) + 'px');
        if (this.pfog) { this.pfog.near = fit + 4; this.pfog.far = fit + 40; }
        if (this.comp) {
          const pr = this.r.getPixelRatio();
          this.comp.setPixelRatio(pr); this.comp.setSize(w, ht);
          this.bloom.resolution.set(w / 2, ht / 2);
        }
        this.set.userData.floor.userData.rt.setSize(Math.round(w * 0.5), Math.round(ht * 0.5));
      } else {
        cam.fov = 22;
        const tf = 2 * Math.tan(cam.fov * Math.PI / 360);
        const fit = Math.max(U.h / tf, (U.wd || 1.2) / (tf * cam.aspect));
        cam.position.set(0, U.h * 0.51, fit + 0.35);
        cam.lookAt(0, U.h * 0.365, 0);
        this._camBase = { pos: cam.position.clone(), tgt: new this.T.Vector3(0, U.h * 0.365, 0), fit };
        cam.clearViewOffset();
      }
      cam.updateProjectionMatrix();
    }
    return true;
  },

  // Bande libre [haut, bas] en px dans le conteneur : sous l'en-tête `.head`, au-dessus du premier bloc après #ud-hero-space
  _band(ht) {
    const host = this.host, top0 = host.getBoundingClientRect().top;
    const scr = host.parentElement;
    const head = scr && scr.querySelector('.head');
    const sp = scr && (scr.querySelector('.ud-hero-space') || scr.querySelector('.space'));
    const sc = sp && sp.closest('.screen-scroll, .scroll');
    const st = sc ? sc.scrollTop : 0;
    let a = ht * 0.16, b = ht * 0.62;
    if (head) a = head.getBoundingClientRect().bottom - top0 + st + 10;
    if (sp) b = sp.getBoundingClientRect().bottom - top0 + st - 34;      // place pour « en service » au-dessus des cartes
    if (!(b - a > 140)) { a = ht * 0.16; b = ht * 0.62; }
    return [a, Math.min(b, ht)];
  },

  // Bascule décor héros ↔ vitrine compacte (fond CSS transparent)
  // Décor planète : chargé une seule fois (kit de la carte)
  _planet() {
    if (this._pp) return this._pp;
    const T = this.T;
    this._pp = new this.S.GLTFLoader().loadAsync('assets/3d/sb_kit.glb').then((g) => {
      const ps = buildPlanetSet(T, g.scene); ps.visible = false; this.scene.add(ps); this.pset = ps;
      this.pfog = new T.Fog(0x0d1424, 8, 40);                       // linéaire, recalé sur la distance caméra
    }).catch((e) => { console.warn('[SBUnit3D] kit planète indisponible', e); this._pp = null; });
    return this._pp;
  },

  _hero(on) {
    const planet = on && this._decor === 'planet' && !!this.pset;
    const mode = on ? (planet ? 'planet' : 'hangar') : 'off';
    if (this._isHero === on && this._mode === mode) return;
    this._isHero = on; this._mode = mode;
    const sc = this.scene, U = UNITS[(this.e && this.e.key) || 'garde'];
    this.set.visible = on && !planet;
    if (this.pset) this.pset.visible = planet;
    sc.fog = on ? (planet ? this.pfog : this.fog) : null;
    const bg = planet ? 0x0c1a1d : 0x050608;
    sc.background = on ? new this.T.Color(planet ? 0x05070c : bg) : null;
    this.r.setClearColor(on ? bg : 0x000000, on ? 1 : 0);
    // planète : la plaque hexagonale remplace le socle ; tourelle posée sur la plaque
    if (this.e) {
      this.plinthG.visible = !planet && U.plinth !== false;
      this.shadowG.visible = true;
      if (U.plinth === false) this.e.model.position.y = planet ? 0 : -0.09;
    }
    if (this.hemi) { this.hemi.color.setHex(planet ? 0x7a9aa8 : 0x8fa6c8); this.hemi.groundColor.setHex(planet ? 0x10180e : 0x0a0c10); }
    if (planet) {
      // nuit : clé froide de face, contre-jour blanc-cyan franc (détache la silhouette), accent rouge arrière-gauche
      this.key.position.set(1.6, 4.0, 4.4); this.key.color.setHex(0xdfe8ff); this.key.intensity = 2.3;
      this.rim.position.set(1.2, 3.4, -4.2); this.rim.color.setHex(0xcfe6ff); this.rim.intensity = 3.2;
      this.rimL.position.set(-3.4, 2.0, -2.6); this.rimL.color.setHex(0xff3220); this.rimL.intensity = 1.2;
      this.back.intensity = 0.0; this.fill.color.setHex(0x7088c0); this.fill.position.set(-2.6, 1.0, 3.6); this.fill.intensity = 0.35;
      if (this.hemi) { this.hemi.color.setHex(0x55668a); this.hemi.groundColor.setHex(0x080a0e); this.hemi.intensity = 0.16; }
      if (this.bloom) { this.bloom.strength = 0.22; this.bloom.radius = 0.08; this.bloom.threshold = 1.6; }
      this.r.toneMappingExposure = 1.1;
      this.scene.environmentIntensity = 0.16;          // reflets d'environnement faibles : la nuit reste profonde
      return;
    }
    this.rim.color.setHex(0xff3020); this.rimL.color.setHex(0xff2e14); this.rimL.position.set(-2.8, 2.4, -2.4); this.r.toneMappingExposure = 1.25;
    if (this.bloom) { this.bloom.strength = 0.45; this.bloom.radius = 0.5; this.bloom.threshold = 1.4; }
    // lumières : clé chaude depuis l'avant-gauche + deux contre-jours rouges francs (lookdev) / réglage vitrine d'origine
    if (on) {
      this.key.position.set(-2.6, 4.2, 3.4); this.key.color.setHex(0xffe9d6); this.key.intensity = 3.4;
      this.rim.position.set(2.8, 2.6, -2.6); this.rim.intensity = U.rim * 1.5; this.rimL.intensity = U.rim * 1.25;
      this.back.intensity = 0.15; this.fill.color.setHex(0x8ca6ff); this.fill.position.set(2.6, 1.3, 3.6); this.fill.intensity = 0.45;
      if (this.hemi) this.hemi.intensity = 0.22;
      this.scene.environmentIntensity = 0.28;
    } else {
      this.key.position.set(2.2, 3.4, 2.6); this.key.color.setHex(0xfffaf2); this.key.intensity = 3.6;
      this.rim.position.set(2.6, 1.7, -2.0); this.rim.intensity = U.rim; this.rimL.intensity = 0;
      this.back.intensity = 0.9; this.fill.color.setHex(0xc8d4ff); this.fill.position.set(-2.5, 0.6, 2.0); this.fill.intensity = 0.3;
      if (this.hemi) this.hemi.intensity = 0.42;
      this.scene.environmentIntensity = 0.35;
    }
  },

  _loop: null,
};

SBUnit3D._loop = function loop(now) {
  const U = SBUnit3D;
  if (!U.running) return;
  if (!U.host || !U.host.isConnected) { U.unmount(); return; }
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - U._t) / 1000); U._t = now;
  // pause si le conteneur est masqué (fiche fermée, autre écran)
  if (!U.host.getClientRects().length || document.hidden) return;
  if (!U._resize()) return;
  // ressort lourd : cible (doigt + glisse) → angle affiché ; raideur faible, amortissement sous-critique, vitesse plafonnée
  if (U.tv) { U.yawT += U.tv * dt; U.tv *= Math.exp(-dt * 1.8); if (Math.abs(U.tv) < 0.01) U.tv = 0; }
  { const k = 3.2, c = 3.0, wmax = 1.9, n = Math.ceil(dt / 0.008), h = dt / n;
    for (let i = 0; i < n; i++) { U.w += (k * (U.yawT - U.yaw) - c * U.w) * h; U.w = Math.max(-wmax, Math.min(wmax, U.w)); U.yaw += U.w * h; } }
  // Vue planète, garde et soldat lourd : l'unité reste fixe et c'est la caméra qui tourne autour d'elle (hauteur constante)
  const orbit = U._mode === 'planet' && U.e && UNITS[U.e.key].orbit;
  const yaw0 = (U.e && UNITS[U.e.key].yaw) ?? 0.45;
  U.turn.rotation.y = orbit ? yaw0 : U.yaw;
  if (U._camBase) {
    U.zoom += (U.zoomT - U.zoom) * Math.min(1, dt * 7);
    const b = U._camBase;
    U.cam.position.copy(b.pos).sub(b.tgt).multiplyScalar(U.zoom);
    if (orbit) { U.cam.position.applyAxisAngle(U._yAxis || (U._yAxis = new U.T.Vector3(0, 1, 0)), -(U.yaw - yaw0)); }
    U.cam.position.add(b.tgt);
    U.cam.lookAt(b.tgt);
    if (U.pfog && U._mode === 'planet') { U.pfog.near = b.fit * U.zoom + 4; U.pfog.far = b.fit * U.zoom + 40; }
  }
  if (U.mixer) { U._autoplay(now); U.mixer.update(dt); U._glowFx(); U._footOut(); }
  else if (U.e && U.e.rig) {
    // Tourelle : veille (balayage lent du capteur, léger roulis d'azimut et d'élévation) ; tap = rafale (recul alterné des 4 tubes)
    const t = now / 1000, r = U.e.rig, f = U.pulse ? (now - U.pulse) / 1000 : 9;
    if (r.yaw) r.yaw.rotation.y = 0.14 * Math.sin(t * 0.23);
    if (r.pitch) r.pitch.rotation.x = 0.05 + 0.04 * Math.sin(t * 0.31) + (f < 1.2 ? 0.03 * Math.exp(-f * 3) : 0);
    if (r.sensor) r.sensor.rotation.y = 0.55 * Math.sin(t * 0.6);
    let fl = 0;
    r.barrels.forEach((b, i) => {
      const ph = f - i * 0.085;
      const k = ph > 0 && ph < 0.6 ? Math.exp(-ph * 9) * Math.min(1, ph * 40) : 0;
      b.position.z = b.userData.z0 + 0.32 * k; fl = Math.max(fl, k);
    });
    for (const m of U.e.glows) m.emissiveIntensity = m.userData.base * (0.92 + 0.08 * Math.sin(t * 2.0) + 2.2 * fl);
  }
  else if (U.e && U.e.glows) {
    // Soldat lourd : respiration très légère + visière qui pulse (plus fort après un tap)
    const t = now / 1000;
    U.e.model.position.y = 0.006 * Math.sin(t * 1.6);
    const k = U.pulse ? Math.max(0, 1 - (now - U.pulse) / 900) : 0;
    for (const m of U.e.glows) m.emissiveIntensity = m.userData.base * (0.9 + 0.1 * Math.sin(t * 2.4) + 1.4 * k);
  }
  if (U._isHero) {
    const d = U.set.userData, t = now / 1000;
    d.dust.rotation.y = Math.sin(t * 0.05) * 0.2; d.dust.position.y = (t * 0.03) % 0.4 - 0.2;
    d.neon.color.setRGB(1.0, 0.07, 0.025).multiplyScalar(4.6 + 0.4 * Math.sin(t * 1.3) + (Math.sin(t * 23) > 0.985 ? -2.5 : 0));
  }
  if (U._mode === 'planet' && U.pset) {
    const f = U.pset.userData.flies, t = now / 1000;
    f.rotation.y = Math.sin(t * 0.07) * 0.25; f.position.y = Math.sin(t * 0.5) * 0.08;
    f.material.opacity = 0.6 + 0.3 * Math.sin(t * 2.3);
    const d = U.pset.userData;
    d.nodesMat.color.setRGB(0.22, 0.72, 1.0).multiplyScalar(1.3 + 0.25 * Math.sin(t * 1.7));
    d.mists.forEach((m, i) => { m.material.map.offset.set(t * (0.005 + i * 0.002), t * 0.002 * (i + 1)); });
    d.blinks.forEach((b, i) => { b.visible = ((t + i * 0.6) % 1.8) < 0.25; });
  }
  if (U._isHero && U.comp) U.comp.render(dt); else U.r.render(U.scene, U.cam);
};

// Styles de la vitrine (fond, légende, états)
const css = document.createElement('style');
css.textContent = `
  .u3d { position:relative; overflow:hidden; border-radius:12px; border:1px solid rgba(120,160,190,.14);
    background: radial-gradient(120% 90% at 50% 38%, rgba(40,58,80,.55), rgba(8,12,18,.0) 62%), linear-gradient(to bottom, #0b1119, #06090d); }
  .u3d .u3d-canvas { position:absolute; inset:0; display:block; cursor:grab; }
  .u3d .u3d-canvas:active { cursor:grabbing; }
  .u3d-cap { position:absolute; left:14px; top:12px; z-index:2; pointer-events:none; line-height:1.35; }
  .u3d-cap b { display:block; font:600 10px/1.2 var(--font-mono, monospace); letter-spacing:.26em; color:#e6eef3; }
  .u3d-cap span { display:block; font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:rgba(190,205,215,.6); }
  .u3d-stat { position:absolute; right:14px; top:12px; z-index:2; pointer-events:none; text-align:right; }
  .u3d-stat b { display:block; font:600 18px/1 var(--font-mono, monospace); color:#e6eef3; }
  .u3d-stat span { font-size:8.5px; letter-spacing:.18em; text-transform:uppercase; color:rgba(190,205,215,.55); }
  .u3d-hint { position:absolute; left:0; right:0; bottom:9px; z-index:2; pointer-events:none; text-align:center; font-size:8.5px; letter-spacing:.2em; text-transform:uppercase; color:rgba(170,190,205,.38); }
  .u3d.u3d-hero { position:absolute; inset:0; border:0; border-radius:0; z-index:0;
    background: radial-gradient(90% 55% at 50% 30%, rgba(90,22,20,.38), rgba(8,12,18,0) 70%), linear-gradient(to bottom, #0b1016, #05070a 70%); }
  .u3d.u3d-hero::before { content:''; position:absolute; left:0; right:0; bottom:0; height:calc(var(--u3d-band, 40%) - 10px); z-index:1; pointer-events:none;
    background:linear-gradient(to bottom, rgba(5,6,8,0), rgba(5,6,8,.7) 30%, #050608 75%); }
  .u3d.u3d-hero::after { content:''; position:absolute; left:0; right:0; top:0; height:22%; z-index:1; pointer-events:none;
    background:linear-gradient(to bottom, rgba(5,6,8,.75), rgba(5,6,8,0)); }
  .u3d.u3d-hero .u3d-stat { top:auto; bottom:calc(var(--u3d-band, 40%) + 2px); right:16px; }
  .u3d.u3d-hero .u3d-stat b { font-size:30px; }
  .u3d.u3d-hero .u3d-hint { bottom:calc(var(--u3d-band, 40%) + 6px); left:16px; right:auto; text-align:left; }
  .u3d.u3d-loading::after { content:'CHARGEMENT'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:9px; letter-spacing:.3em; color:rgba(170,190,205,.45); }
  .u3d.u3d-fail::after { content:'APERÇU 3D INDISPONIBLE'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:9px; letter-spacing:.24em; color:rgba(170,190,205,.45); }
`;
document.head.appendChild(css);

window.SBUnit3D = SBUnit3D;
