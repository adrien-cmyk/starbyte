/* Starbyte — fond orbital partagé de toutes les vues orbitales (03/11, Adrien : photographie spatiale)
   Cubemap 6 × 2048 cuite en Cycles (tools/sky/orbit_bake.py + orbit_post.py dans le dépôt) : planète immense en orbite basse, nuages en relief,
   soleil blanc doré haut-gauche avec halo et rayons, liseré atmosphérique bleu, espace noir aux étoiles rares.
   Repère cuit : la caméra regarde -Z, le soleil est 35° à gauche et 30° au-dessus. Chaque vue tourne le ciel autour de Y pour
   que son axe de départ retrouve ce cadrage, et aligne sa lumière clé sur le soleil (sunDir).
   Les JPEG sont pré-compensés pour l'ACES de three.js (exposition 1) et stockés à mi-échelle (gain 2 dans le shader) : l'image à l'écran est l'image cuite. */
export const SUN_CANON = [-0.497, 0.5, -0.709];
export const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
export function createOrbitSky(THREE, opts = {}) {
  const base = opts.base || new URL('./', import.meta.url).href, version = opts.version || '20261103';   // les JPEG vivent à côté de ce module
  const fwd = opts.forward || [0, 0, -1];
  const th = Math.atan2(fwd[0], -fwd[2]);                       // rotation monde → repère cuit (autour de Y)
  const toBaked = new THREE.Matrix4().makeRotationY(th), toWorld = new THREE.Matrix4().makeRotationY(-th);
  const sunDir = new THREE.Vector3(...SUN_CANON).applyMatrix4(toWorld).normalize();
  const uni = { uSky: { value: null }, uRot: { value: new THREE.Matrix3().setFromMatrix4(toBaked) }, uOn: { value: 0 }, uDim: { value: opts.dim != null ? opts.dim : 1 } };
  const R = opts.radius || 280;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(R * 2, R * 2, R * 2), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: uni,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform samplerCube uSky; uniform mat3 uRot; uniform float uOn, uDim; varying vec3 vDir;
      void main(){ vec3 d = normalize(uRot * vDir); vec4 c = textureCube(uSky, vec3(-d.x, d.y, d.z)); gl_FragColor = vec4(c.rgb * (2.0 * uOn * uDim), 1.0); }`   // GAIN 2 : les JPEG sont stockés à mi-échelle (plage > 1 pour l'ACES),
  }));
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'orbitSky';
  const tex = new THREE.CubeTextureLoader().setPath(base).load(FACES.map(f => `orbit_${f}.jpg?v=${version}`), () => { uni.uOn.value = 1; if (opts.onLoad) opts.onLoad(tex); }, undefined, (e) => { console.warn('[OrbitSky]', e); if (opts.onError) opts.onError(e); });
  tex.colorSpace = THREE.SRGBColorSpace; uni.uSky.value = tex;
  // position de départ caméra de la vue (direction cible → caméra), pour poser une lumière clé cohérente : sunDir
  return { mesh, texture: tex, sunDir, rotation: th, uniforms: uni, dispose() { tex.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } };
}
// direction de départ d'une vue (du vaisseau vers la caméra) → axe de visée horizontal
export function forwardFrom(camDir) { const f = [-camDir[0], 0, -camDir[2]]; const l = Math.hypot(f[0], f[2]) || 1; return [f[0] / l, 0, f[2] / l]; }
