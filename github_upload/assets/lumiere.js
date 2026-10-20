// PATCH_2010_LUMIERE — éclairage architectural des bâtiments (Adrien 20/10 : « les lumières doivent servir l'architecture »)
// 1. les anneaux et lignes néon décoratifs sont éteints (bandes autour des tours et cylindres, cadres, lignes de façade) ;
// 2. ne restent que les sources utiles : entrées (ambre), baies techniques, réacteurs, balises (blanc froid / cyan),
//    fenêtres rares ; le rouge est réservé aux défenses ;
// 3. la nuit, les façades sont éclairées par le bas : projecteurs au sol, faisceaux rasants qui montent et s'éteignent
//    avec la hauteur, halo léger au pied ; le jour, cet éclairage disparaît.
(function () {
  'use strict';
  const COL = { cool: 0xd8e6ff, cyan: 0x63d2ff, amber: 0xffae5c, red: 0xff3526, glass: 0x9cc2ff };
  const EI  = { cool: 1.5, cyan: 1.7, amber: 1.8, red: 1.7, glass: 0.32 };
  const ROLE = ['cool', 'cyan', 'amber', 'red', 'glass'];           // index du groupe de matériau ; 5 = éteint (retiré)
  const UP = {                                                       // couleur et force des projecteurs selon le bâtiment
    infra: { c: 0xdbe7ff, g: 2.4 }, warm: { c: 0xffc58a, g: 2.4 }, defense: { c: 0xe4ebff, g: 2.2 }
  };
  const SPOT_OFF = Math.PI / 6, NSPOT = 6;
  const kindOf = n => {
    n = (n || '').toUpperCase();
    if (/BUNKER|TURRET/.test(n)) return 'defense';
    if (/COMMAND|CASERNE|COMPTOIR/.test(n)) return 'warm';
    return 'infra';
  };
  let T = null, P = null;
  const uNight = { value: 1 };
  const geoCache = new Map(), matCache = new Map(), footCache = new Map();
  let emitMats = null, pools = null, poolMat = null;

  // ───────── matériaux des sources utiles ─────────
  function emitters(base) {
    if (emitMats) return emitMats;
    emitMats = ROLE.map(r => {
      const m = new T.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.5, metalness: 0.2 });
      m.name = 'MAT_LUM_' + r.toUpperCase();
      m.emissive = new T.Color(COL[r]);
      m.userData.e0 = EI[r];
      m.emissiveIntensity = EI[r];
      m.toneMapped = base ? base.toneMapped : true;
      return m;
    });
    return emitMats;
  }

  const glassCache = new Map();
  function glassOf(m) {
    let g = glassCache.get(m.uuid); if (g) return g;
    g = m.clone(); g.name = (m.name || 'MAT') + '_LUM_VEILLE';
    const c = m.emissive.clone(), hsl = {}; c.getHSL(hsl);
    if (hsl.h > 0.2 && hsl.h < 0.45 || hsl.h > 0.7 && hsl.h < 0.95) c.setHSL(0.6, 0.35, Math.min(0.7, hsl.l));  // vert, violet → bleu froid
    g.emissive = c;
    const e0 = (m.userData.e0 !== undefined ? m.userData.e0 : m.emissiveIntensity) * 0.28;
    g.userData = Object.assign({}, m.userData, { e0 }); g.emissiveIntensity = e0;
    glassCache.set(m.uuid, g);
    return g;
  }

  // ───────── tri des pièces lumineuses d'un maillage ─────────
  function hueRole(hex, kind) {
    const c = new T.Color(hex), r = c.r, g = c.g, b = c.b;
    if (r > 0.6 && g < 0.25 && b < 0.25) return kind === 'defense' ? 3 : 2;   // rouge → défense, sinon ambre
    if (r > g && g > b) return 2;                                            // chaud → ambre
    if (b >= r && b >= g * 0.9) return 1;                                    // bleu / cyan → cyan
    return 0;                                                                // vert, violet… → blanc froid
  }
  function classify(geo, M, hex, kind) {
    const pos = geo.attributes.position, n = pos.count;
    const idx = geo.index ? geo.index.array : null, tc = idx ? idx.length / 3 : n / 3;
    const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
    const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
    const vi = t => idx ? [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
    for (let t = 0; t < tc; t++) { const [a, b, c] = vi(t); u(a, b); u(b, c); }
    const P3 = new Float32Array(n * 3), v = new T.Vector3(), seen = new Map();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M); P3[i * 3] = v.x; P3[i * 3 + 1] = v.y; P3[i * 3 + 2] = v.z;
      const k = Math.round(v.x * 40) + ',' + Math.round(v.y * 40) + ',' + Math.round(v.z * 40);
      if (seen.has(k)) u(i, seen.get(k)); else seen.set(k, i);
    }
    const comp = new Map();
    for (let i = 0; i < n; i++) { const r = f(i); let c = comp.get(r); if (!c) comp.set(r, c = { vs: [], area: 0 }); c.vs.push(i); }
    for (let t = 0; t < tc; t++) {
      const [a, b, c] = vi(t), C = comp.get(f(a));
      const ax = P3[b * 3] - P3[a * 3], az = P3[b * 3 + 2] - P3[a * 3 + 2], bx = P3[c * 3] - P3[a * 3], bz = P3[c * 3 + 2] - P3[a * 3 + 2];
      C.area += Math.abs(ax * bz - az * bx) / 2;
    }
    const base = hueRole(hex, kind);
    const list = [];
    for (const [root, C] of comp) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const i of C.vs) { const x = P3[i * 3], y = P3[i * 3 + 1], z = P3[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const w = Math.max(sx, sz), dm = Math.min(sx, sz), R = w / 2 || 1;
      let mn = 1e9; for (const i of C.vs) { const d = Math.hypot(P3[i * 3] - cx, P3[i * 3 + 2] - cz); if (d < mn) mn = d; }
      const hollow = mn / R, fill = C.area / Math.max(0.01, sx * sz);
      list.push({ root, sx, sy, sz, w, dm, y0, y1, hollow, fill, key: sx.toFixed(1) + ':' + sy.toFixed(1) + ':' + sz.toFixed(1) });
    }
    const same = new Map(); list.forEach(c => same.set(c.key, (same.get(c.key) || 0) + 1));
    const rank = new Map(), role = new Map();
    for (const c of list) {
      let r = base;
      const ring = c.dm >= 2.2 && c.sy <= 1.0 && c.hollow > 0.55 && c.fill < 0.4;         // anneau, cadre
      const slab = c.y0 > 2.5 && c.sy >= 0.2 && c.dm >= 2.0 && c.sy <= Math.max(1.0, 0.25 * c.dm) && c.w > 1.4 * c.sy; // bague autour d'une tour
      const line = c.w >= 3 && c.dm < 0.6 && c.sy < 0.8;                               // ligne néon horizontale
      const strip = c.sy >= 4 && c.w < 2.2;                                           // ligne néon verticale
      const round = c.dm / c.w > 0.8;
      const tube = round && c.sy >= 1.2 && c.hollow > 0.6 && c.dm >= 2.5 && c.fill < 0.4;        // manchon, colonne lumineuse
      const sign = c.dm < 0.5 && c.w >= 4 && c.sy >= 2 && c.sy <= 5 && c.w >= 1.5 * c.sy;                                // écran, enseigne
      const pane = c.sy >= 5 && c.dm < 0.8;                                           // grande vitre verticale
      const volume = c.w >= 5 && c.sy >= 3 || pane;                                          // dôme, verrière
      const door = (c.dm < 0.8 || (c.fill < 0.2 && !round)) && c.sy >= 1.4 && c.sy <= 4.6 && c.w >= 0.8 && c.w <= 6 && c.y0 < 12;
      if (door && !line) r = (kind === 'defense' && base === 3) ? 3 : 2;
      else if (ring || slab || line || strip || tube) r = 5;
      else if (sign) r = base === 1 ? 1 : (kind === 'defense' && base === 3 ? 3 : (base === 0 ? 0 : 2));
      else if (volume) r = 4;
      else if (door) r = (kind === 'defense' && base === 3) ? 3 : 2;
      else if (c.w < 2.6 && c.sy < 2.6) {                                             // petites pièces : fenêtres, voyants, balises
        const k = (rank.get(c.key) || 0); rank.set(c.key, k + 1);
        if (same.get(c.key) >= 4 && k % (same.get(c.key) >= 8 ? 5 : 3) !== 0) r = 5;                                // fenêtres rares
        else if (c.y1 > 12 && c.w < 1.2) r = kind === 'defense' ? 3 : 0;                // balise haute
      } else if (c.sy < 0.6 && c.fill >= 0.4) {                                        // plaque, fosse, réacteur
        r = base === 2 ? 2 : 1;
      } else r = base === 3 && kind !== 'defense' ? 2 : base;
      role.set(c.root, r);
    }
    // reconstruction : triangles regroupés par rôle, rôle 5 retiré
    const buckets = [[], [], [], [], []];
    for (let t = 0; t < tc; t++) { const tri = vi(t); const r = role.get(f(tri[0])); if (r < 5) buckets[r].push(tri[0], tri[1], tri[2]); }
    const g = new T.BufferGeometry();
    for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
    const all = []; let start = 0;
    buckets.forEach((b, r) => { if (!b.length) return; for (const x of b) all.push(x); g.addGroup(start, b.length, r); start += b.length; });
    g.setIndex(all);
    g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
    if (!g.boundingSphere) g.computeBoundingSphere();
    g.userData.lum = true;
    return g;
  }

  // ───────── projecteurs : éclairage rasant par le bas dans les matériaux des façades ─────────
  const GLSL_HEX = `
    varying vec3 vLumW; varying vec3 vLumN;
    uniform float uLumNight; uniform vec3 uLumCol; uniform float uLumGain;
    vec2 lumHex(vec2 p){
      float R=28.867513; float q=(0.57735027*p.x-0.33333333*p.y)/R; float r=(0.66666667*p.y)/R; float s=-q-r;
      vec3 c=vec3(q,r,s); vec3 rc=floor(c+0.5); vec3 d=abs(rc-c);
      if(d.x>d.y&&d.x>d.z) rc.x=-rc.y-rc.z; else if(d.y>d.z) rc.y=-rc.x-rc.z;
      return vec2(R*1.7320508*(rc.x+rc.y*0.5), R*1.5*rc.y);
    }
    vec3 lumUp(vec3 alb){
      if(uLumNight<0.01) return vec3(0.0);
      vec2 r=vLumW.xz-lumHex(vLumW.xz); float d=max(length(r),0.001); vec2 rd=r/d;
      float h=max(vLumW.y-0.4,0.0);
      vec3 n=normalize(vLumN);
      float side=1.0-abs(n.y);
      vec2 nx=n.xz/max(length(n.xz),0.001);
      float outw=clamp(dot(nx,rd)*0.75+0.25,0.0,1.0);
      float face=side*outw+clamp(-n.y,0.0,1.0)*0.9;
      float seg=1.0471976; float a=atan(r.y,r.x)-${SPOT_OFF.toFixed(6)}; float da=a-seg*floor(a/seg+0.5);
      float arc=da*d; float wid=1.3+h*0.30;
      float lobe=exp(-arc*arc/(wid*wid));
      float fall=exp(-h/7.0);
      float foot=0.10*exp(-h/3.0);
      float I=(lobe*fall*(0.35+0.65*smoothstep(0.0,2.5,h))+foot)*face;
      vec3 ab=alb/(alb+0.35); return uLumCol*I*uLumNight*uLumGain*(ab*0.55+0.11);
    }`;
  function upMat(m, kind) {
    const key = m.uuid + ':' + kind;
    let c = matCache.get(key); if (c) return c;
    c = m.clone();
    c.userData = Object.assign({}, m.userData, { lumUp: kind });
    const U = { uLumNight: uNight, uLumCol: { value: new T.Color(UP[kind].c) }, uLumGain: { value: UP[kind].g } };
    c.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLumW; varying vec3 vLumN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 lw=modelMatrix*vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n lw=modelMatrix*instanceMatrix*vec4(transformed,1.0);\n#endif\n vLumW=lw.xyz; vLumN=normalize(mat3(modelMatrix)*objectNormal); }');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_HEX)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += lumUp(diffuseColor.rgb);');
    };
    c.customProgramCacheKey = () => 'lum-up-1';
    matCache.set(key, c);
    return c;
  }

  // ───────── pied des bâtiments : où poser les projecteurs ─────────
  function footprint(root, inv) {
    const key = root.name || root.uuid;
    if (footCache.has(key)) return footCache.get(key);
    const ext = new Array(NSPOT).fill(0), v = new T.Vector3(), M = new T.Matrix4();
    let rmax = 0;
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      M.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        if (v.y > 7) continue;
        const d = Math.hypot(v.x, v.z); if (d > 25) continue;
        if (d > rmax) rmax = d;
        let a = Math.atan2(v.z, v.x) - SPOT_OFF; const k = ((Math.round(a / (Math.PI / 3)) % NSPOT) + NSPOT) % NSPOT;
        const da = a - Math.round(a / (Math.PI / 3)) * (Math.PI / 3);
        if (Math.abs(da) < 0.38 && d > ext[k]) ext[k] = d;
      }
    });
    const out = ext.map(e => Math.min(22, Math.max(4, e || rmax * 0.7)));
    footCache.set(key, out);
    return out;
  }

  // ───────── halos au sol (un seul InstancedMesh) ─────────
  function ensurePools() {
    if (pools) return;
    poolMat = new T.ShaderMaterial({
      uniforms: { uNight: uNight },
      vertexShader: `varying vec2 vUv; varying vec3 vCol;
        void main(){ vUv=uv; vCol=vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vCol=instanceColor;
        #endif
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uNight; varying vec2 vUv; varying vec3 vCol;
        void main(){ vec2 p=vUv*2.0-1.0;
          float pool=exp(-(p.x*p.x)/0.10-(p.y-0.15)*(p.y-0.15)/0.07);
          float spill=exp(-(p.x*p.x)/0.35-(p.y*p.y)/0.25);
          float fix=exp(-(p.x*p.x+(p.y+0.35)*(p.y+0.35))/0.0018);
          float a=(pool*0.30+spill*0.08+fix*0.5)*uNight;
          if(a<0.004) discard;
          gl_FragColor=vec4(vCol*a,1.0); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false
    });
    poolMat.name = 'MAT_LUM_POOL';
    const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    pools = new T.InstancedMesh(g, poolMat, 64 * NSPOT);
    pools.name = 'SB_LUM_POOLS'; pools.frustumCulled = false; pools.renderOrder = 3; pools.count = 0;
    pools.instanceColor = new T.InstancedBufferAttribute(new Float32Array(64 * NSPOT * 3), 3);
  }

  // ───────── habillage après chaque reconstruction ─────────
  function dress() {
    if (!P || !P.buildGroup) return;
    ensurePools();
    emitters();
    const inv = new T.Matrix4(), M = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1), p = new T.Vector3(), Y = new T.Vector3(0, 1, 0), m4 = new T.Matrix4();
    let n = 0;
    const parcels = (window.G && G.planet && G.planet.parcels) || [];
    for (const root of P.buildGroup.children) {
      if (!root.isObject3D) continue;
      const pi = root.userData && root.userData.parcel, pc = parcels[pi];
      const dark = pc && pc.recycleEndsAt;                        // recyclage : tout reste éteint
      const kind = kindOf(root.name);
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      const meshes = []; root.traverse(o => { if (o.isMesh && o.material) meshes.push(o); });
      let lit = false;
      for (const o of meshes) {
        const m = o.material;
        if (Array.isArray(m) || o.geometry.userData.lum) { if (o.geometry.userData.lum) lit = true; continue; }
        const emis = m.emissive && m.emissiveIntensity > 0.3 && m.emissive.getHex() > 0 && !m.transparent;
        if (emis) {
          if (dark) continue;
          lit = true;
          const key = o.geometry.uuid + ':' + kind + ':' + m.emissive.getHex();
          let g = geoCache.get(key);
          if (!g) { M.multiplyMatrices(inv, o.matrixWorld); g = classify(o.geometry, M, m.emissive.getHex(), kind); geoCache.set(key, g); }
          o.geometry = g;
          o.material = emitMats.slice();
          o.material[4] = glassOf(m);                             // volumes (tour, dôme) : on garde le dessin d'origine, en veilleuse
          if (o.userData.dmgMat) o.material = o.material.map(x => { const k = x.clone(); k.userData.e0 = x.userData.e0 * 0.25; k.emissiveIntensity *= 0.25; return k; });
          o.castShadow = false;
        } else if (!dark && m.isMeshStandardMaterial && !m.transparent && !(m.emissive && m.emissiveIntensity > 0.3 && m.emissive.getHex() > 0)) {
          o.material = upMat(m, kind);
        }
      }
      // projecteurs au sol
      if (!dark && root.name && /^SB_/.test(root.name) && n < 64 * NSPOT - NSPOT) {
        const ext = footprint(root, inv);
        const cx = root.position.x, cz = root.position.z, col = new T.Color(UP[kind].c);
        root.parent.updateMatrixWorld(true);
        const base = new T.Vector3(); root.getWorldPosition(base);
        for (let k = 0; k < NSPOT; k++) {
          const a = SPOT_OFF + k * Math.PI / 3, dx = Math.cos(a), dz = Math.sin(a), r = ext[k] + 0.9;
          p.set(base.x + dx * r, base.y + 0.18, base.z + dz * r);
          q.setFromAxisAngle(Y, -a - Math.PI / 2);        // l'axe y local du halo pointe vers le bâtiment
          s.set(6.0, 1, 5.0);
          m4.compose(p, q, s);
          pools.setMatrixAt(n, m4); pools.setColorAt(n, col); n++;
        }
      }
    }
    pools.count = n;
    pools.instanceMatrix.needsUpdate = true; if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    if (pools.parent !== P.scene) P.scene.add(pools);
    applyNight();
  }

  function nightK() {
    const S = window.SBSky; let k = S && typeof S.k === 'number' ? S.k : (S && S.dayK ? S.dayK(new Date()) : 0);
    return 1 - Math.min(1, Math.max(0, (k - 0.05) / 0.6));
  }
  function applyNight() {
    const nk = nightK(); uNight.value = nk;
    const f = window.SBSky && typeof SBSky.k === 'number' ? 1 + (0.35 - 1) * SBSky.k : 1;
    if (emitMats) emitMats.forEach(m => { m.emissiveIntensity = m.userData.e0 * f; });
  }

  function hook() {
    P = window.Planet3D;
    if (!P || !P.ready || !P.buildGroup || !window.SB3D || !SB3D.THREE) return false;
    T = SB3D.THREE;
    const orig = P._rebuild;
    P._rebuild = function () { const r = orig.apply(this, arguments); try { dress(); } catch (e) { console.warn('[lumière]', e); } return r; };
    try { dress(); } catch (e) { console.warn('[lumière]', e); }
    setInterval(applyNight, 5000);
    window.SBLum = { dress, applyNight, uNight };
    return true;
  }
  const t = setInterval(() => { if (hook()) clearInterval(t); }, 500);
})();
