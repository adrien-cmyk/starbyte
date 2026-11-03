/* Starbyte — fond orbital partagé de toutes les vues orbitales (03/11, Adrien : photographie spatiale)
   Panorama équirectangulaire 5120 × 2560 (tools/sky/orbit_bake.py : six faces Cycles ; orbit_equirect.py : assemblage + post) : planète immense en orbite basse, nuages en relief,
   soleil blanc doré haut-gauche avec halo et rayons, liseré atmosphérique bleu, espace noir aux étoiles rares.
   Repère cuit : la caméra regarde -Z, le soleil visible est 12° à gauche et 12° au-dessus (l'horizon 35° au-dessous). Chaque vue tourne le ciel autour de Y pour
   que son axe de départ retrouve ce cadrage, et aligne sa lumière clé sur le soleil (sunDir).
   Les JPEG sont pré-compensés pour l'ACES de three.js (exposition 1) et stockés à mi-échelle (gain 2 dans le shader) : l'image à l'écran est l'image cuite. */
export const SUN_CANON = [-0.2034, 0.2079, -0.9568];   // soleil visible du fond : 12° à gauche de -Z, 12° au-dessus de l'horizontale cuite
export function createOrbitSky(THREE, opts = {}) {
  const base = opts.base || new URL('./', import.meta.url).href, version = opts.version || '20261103c';   // les JPEG vivent à côté de ce module
  const fwd = opts.forward || [0, 0, -1];
  const th = Math.atan2(fwd[0], -fwd[2]);                       // rotation monde → repère cuit (autour de Y)
  // bascule : les caméras des fiches plongent de ~15° vers le vaisseau et l'horizon cuit est 35° sous l'horizontale ; on incline le ciel
  // autour de l'axe droit de la vue de départ pour que la courbure traverse le bas de l'image (référence) : un peu plus en paysage (champ vertical 40°)
  // qu'en portrait (54°). fit(aspect) recale à chaque redimensionnement.
  const yaw = new THREE.Matrix4().makeRotationY(th);
  const pitchFor = (a) => opts.pitch != null ? opts.pitch : -(6 + 5 * Math.min(1, Math.max(0, (a - 0.6) / 0.8)));
  let pitch = pitchFor(opts.aspect || (typeof innerWidth !== 'undefined' ? innerWidth / innerHeight : 1)) * Math.PI / 180;
  const toBaked = new THREE.Matrix4().makeRotationX(pitch).multiply(yaw);
  const toWorld = toBaked.clone().invert();
  const sunDir = new THREE.Vector3(...SUN_CANON).applyMatrix4(toWorld).normalize();
  const uni = { uSky: { value: null }, uRot: { value: new THREE.Matrix3().setFromMatrix4(toBaked) }, uOn: { value: 0 }, uDim: { value: opts.dim != null ? opts.dim : 1 } };
  const R = opts.radius || 280;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(R * 2, R * 2, R * 2), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: uni,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform sampler2D uSky; uniform mat3 uRot; uniform float uOn, uDim; varying vec3 vDir;
      void main(){ vec3 d = normalize(uRot * vDir);
        vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);   // panorama : colonne centrale = -Z, haut = +Y
        vec4 c = texture2D(uSky, uv); gl_FragColor = vec4(c.rgb * (2.0 * uOn * uDim), 1.0); }`   // GAIN 2 : les JPEG sont stockés à mi-échelle (plage > 1 pour l'ACES),
  }));
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'orbitSky';
  // une seule image équirectangulaire (5120 × 2560) : aucune couture (six faces séparées donnaient des raccords visibles sur iOS)
  const tex = new THREE.TextureLoader().setPath(base).load(`orbit_pano.jpg?v=${version}`, () => { uni.uOn.value = 1; if (opts.onLoad) opts.onLoad(tex); }, undefined, (e) => { console.warn('[OrbitSky]', e); if (opts.onError) opts.onError(e); });
  tex.colorSpace = THREE.SRGBColorSpace; uni.uSky.value = tex;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;   // le tour se referme derrière la vue, sans trait
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;   // vue en agrandissement : pas de mipmaps (et pas de trait au raccord)
  tex.flipY = true;
  // position de départ caméra de la vue (direction cible → caméra), pour poser une lumière clé cohérente : sunDir
  function fit(aspect) {
    pitch = pitchFor(aspect) * Math.PI / 180;
    toBaked.makeRotationX(pitch).multiply(yaw); toWorld.copy(toBaked).invert(); uni.uRot.value.setFromMatrix4(toBaked);
    sunDir.set(...SUN_CANON).applyMatrix4(toWorld).normalize();
  }
  return { mesh, texture: tex, sunDir, rotation: th, fit, uniforms: uni, dispose() { tex.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } };
}
// direction de départ d'une vue (du vaisseau vers la caméra) → axe de visée horizontal
export function forwardFrom(camDir) { const f = [-camDir[0], 0, -camDir[2]]; const l = Math.hypot(f[0], f[2]) || 1; return [f[0] / l, 0, f[2] / l]; }
