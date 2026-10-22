/* Starbyte — service worker (PATCH_2210_PWA)
   - la page (index.html) : réseau d'abord, pour recevoir chaque mise à jour ; cache si pas de réseau
   - fichiers versionnés (?v=…) : cache d'abord (une nouvelle version = une nouvelle adresse)
   - modèles 3D, textures, images non versionnés : cache immédiat + rafraîchissement en arrière-plan
   - rien d'autre que ce site (registre Supabase, polices…) ne passe par ici */
const CACHE = 'starbyte-v2';   // v2 : purge des réponses « page en construction » mises en cache à la place des scripts
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
const isPage = (req, url) => req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
async function putClean(cache, req, res) {
  // une seule version par fichier : on retire les anciennes ?v= du même chemin
  const url = new URL(req.url);
  if (url.search) for (const k of await cache.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k); }
  await cache.put(req, res);
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.headers.has('range')) return;   // musique de la radio, vidéos : lecture en flux, pas de cache
  if (isPage(req, url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(new Request(url.origin + url.pathname.replace(/index\.html$/, '')), res.clone());
        return res;
      } catch (err) {
        return (await cache.match(new Request(url.origin + url.pathname.replace(/index\.html$/, '')))) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let hit = await cache.match(req);
    if (hit && /text\/html/i.test(hit.headers.get('content-type') || '') && !/\.html?$/i.test(url.pathname)) { await cache.delete(req); hit = null; }
    const versioned = /[?&]v=/.test(url.search);
    // une page HTML renvoyée à la place d'un script, d'un modèle 3D ou d'une image (page d'attente de l'hébergeur,
    // erreur déguisée en 200) ne doit jamais être gardée : elle casserait le jeu jusqu'à la prochaine version
    const wrongType = (res) => /text\/html/i.test(res.headers.get('content-type') || '') && !/\.html?$/i.test(url.pathname);
    const refresh = () => fetch(req).then((res) => { if (res && res.status === 200 && res.type === 'basic' && !wrongType(res)) putClean(cache, req, res.clone()).catch(() => {}); return res; }).catch(() => null);
    if (hit) { if (!versioned) e.waitUntil(refresh()); return hit; }
    const res = await refresh();
    return res || Response.error();
  })());
});
