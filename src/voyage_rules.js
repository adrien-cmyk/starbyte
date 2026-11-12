/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Voyages par corridors · règles pures (aucun DOM, aucun THREE)
   12/11/2026 · étape 4 de la migration de la carte (cahier navigation, décisions E1, E3, E7)

   Ce fichier est concaténé après le générateur de l'univers (bloc `universe-core` de l'Atlas) et le réseau
   candidat (NET) par tools/build-voyage.py, qui écrit src/voyage_core.js. Le serveur (fonction `voyage`) et les
   tests utilisent ce module ; l'Atlas garde son propre code, et un test de parité vérifie qu'ils donnent les
   mêmes longueurs, les mêmes itinéraires et les mêmes devis.

   E1 : durée = longueur ÷ vitesse (12 u/min en vol libre, ×2,5 en corridor), saison de test ÷25.
   E3 : carburant proportionnel à la longueur (35 % en corridor), égal au coût d'aujourd'hui pour 2 400 u.
   E7 : minimum par mission, l'équivalent de 1 200 u de vol libre (durée et carburant).
   ═══════════════════════════════════════════════════════════════════════════ */

export const VOYAGE_RULES = { v: 12, k: 2.5, season: 25, kFuel: .35, Lref: 2400, Lmin: 1200, fuel: { 1: 50, 2: 150, 3: 400 } };

// version du réseau et des règles : un voyage enregistré garde la version avec laquelle il a été calculé
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
export const NET_VERSION = 'net-' + fnv(JSON.stringify(NET)) + '-r' + fnv(JSON.stringify(VOYAGE_RULES)).slice(0, 4);

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ── positions (mêmes calculs que l'Atlas : navPoint, zjParseAddr + localSpotOffset) ──
const _sectors = new Map();
function sectorPos(code, letter) { const s = sectorFromAddress(code, letter), k = s.join(','); let d = _sectors.get(k); if (!d) { d = Float64Array.from(generateSector(s).pos); if (_sectors.size > 24) _sectors.clear(); _sectors.set(k, d); } return d; }
export function systemPos(key) {
  const m = String(key || '').match(/^([A-Z]+)-([A-Z])-(\d{4})$/); if (!m) return null;
  const i = +m[3] - 1; if (i < 0 || i >= PER_SECTOR) return null;
  let d; try { d = sectorPos(m[1], m[2]); } catch (e) { return null; }
  return [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]];
}
// une adresse de planète (W-X-YYYY-ZZ) : l'étoile plus le décalage de l'emplacement ; une adresse de système : l'étoile
export function addressPos(addr) {
  const m = String(addr || '').match(/^([A-Z]+-[A-Z]-\d{4})(?:-(\d{1,2}))?$/); if (!m) return null;
  const p = systemPos(m[1]); if (!p || m[2] == null) return p;
  const sp = +m[2] - 1; if (sp < 0 || sp >= SPOTS.length) return null;
  const o = localSpotOffset(sp); return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
}

// ── courbe de Catmull-Rom centripète : copie fidèle de THREE.CatmullRomCurve3.getPoint (r128), y compris le vecteur
//    temporaire partagé quand les deux bouts sont extrapolés (corridor de deux nœuds) ──
function cubic() { let c0 = 0, c1 = 0, c2 = 0, c3 = 0; const init = (x0, x1, t0, t1) => { c0 = x0; c1 = t0; c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1; c3 = 2 * x0 - 2 * x1 + t0 + t1; };
  return { nonuniform(x0, x1, x2, x3, dt0, dt1, dt2) { let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1, t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2; t1 *= dt1; t2 *= dt1; init(x1, x2, t1, t2); },
    calc(t) { const t2 = t * t, t3 = t2 * t; return c0 + c1 * t + c2 * t2 + c3 * t3; } }; }
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export function catmullPoint(points, t) {
  const l = points.length, p = (l - 1) * t; let ip = Math.floor(p), w = p - ip;
  if (w === 0 && ip === l - 1) { ip = l - 2; w = 1; }
  const tmp = [0, 0, 0]; let p0, p3;
  if (ip > 0) p0 = points[(ip - 1) % l]; else { tmp[0] = points[0][0] - points[1][0] + points[0][0]; tmp[1] = points[0][1] - points[1][1] + points[0][1]; tmp[2] = points[0][2] - points[1][2] + points[0][2]; p0 = tmp; }
  const p1 = points[ip % l], p2 = points[(ip + 1) % l];
  if (ip + 2 < l) p3 = points[(ip + 2) % l]; else { tmp[0] = points[l - 1][0] - points[l - 2][0] + points[l - 1][0]; tmp[1] = points[l - 1][1] - points[l - 2][1] + points[l - 1][1]; tmp[2] = points[l - 1][2] - points[l - 2][2] + points[l - 1][2]; p3 = tmp; }
  let dt0 = Math.pow(dist2(p0, p1), .25), dt1 = Math.pow(dist2(p1, p2), .25), dt2 = Math.pow(dist2(p2, p3), .25);
  if (dt1 < 1e-4) dt1 = 1; if (dt0 < 1e-4) dt0 = dt1; if (dt2 < 1e-4) dt2 = dt1;
  const out = [0, 0, 0]; for (let j = 0; j < 3; j++) { const c = cubic(); c.nonuniform(p0[j], p1[j], p2[j], p3[j], dt0, dt1, dt2); out[j] = c.calc(w); }
  return out;
}

// ── le réseau : nœuds, tronçons mesurés sur les courbes (16 points par tronçon, comme l'Atlas) ──
let _graph = null;
export function voyageGraph() {
  if (_graph) return _graph;
  const B = HOME_SECTOR.map(n => n * SECTOR_SIZE), nodes = {}, edges = [], cors = [];
  for (const n of NET.nodes) nodes[n.id] = { id: n.id, type: n.type, name: n.name, key: n.key, p: systemPos(n.key) };
  for (const c of NET.corridors) {
    const local = c.nodes.map(id => { const p = nodes[id].p; return [p[0] - B[0], p[1] - B[1], p[2] - B[2]]; }), N = c.nodes.length - 1; let L = 0;
    for (let i = 1; i <= N; i++) {
      const pts = []; for (let j = 0; j <= 16; j++) { const v = catmullPoint(local, (i - 1 + j / 16) / N); pts.push([v[0] + B[0], v[1] + B[1], v[2] + B[2]]); }
      let len = 0; for (let j = 1; j < pts.length; j++) len += d3(pts[j], pts[j - 1]);
      const a = c.nodes[i - 1], b = c.nodes[i]; edges.push({ id: c.id + '.' + i, cor: c.id, name: c.name, cls: c.cls, a, b, len, chord: d3(nodes[a].p, nodes[b].p), pts }); L += len;
    }
    cors.push({ id: c.id, name: c.name, cls: c.cls, nodes: c.nodes, len: L });
  }
  return (_graph = { nodes, edges, cors, len: cors.reduce((a, c) => a + c.len, 0), version: NET_VERSION });
}

function leg(type, a, b, len, e, pts) { const cor = type === 'cor', R = VOYAGE_RULES; return { type, a, b, len, min: len / (R.v * (cor ? R.k : 1)), fu: len * (cor ? R.kFuel : 1), edge: e || null, pts }; }
function sum(legs) { const s = { legs, len: 0, min: 0, fu: 0, nCor: 0, lenCor: 0, pts: [] }; for (const l of legs) { s.len += l.len; s.min += l.min; s.fu += l.fu; if (l.type === 'cor') { s.nCor++; s.lenCor += l.len; } s.pts.push(...(s.pts.length ? l.pts.slice(1) : l.pts)); }
  s.sig = legs.map(l => l.a + '>' + l.b + (l.edge ? ':' + l.edge.id : '')).join('|'); return s; }
// itinéraire le plus court en temps (Dijkstra, même ordre de parcours que l'Atlas) ;
// opt.direct : vol libre direct permis ; opt.avoid : tronçons écartés ; opt.only : corridors permis (ceux que la partie connaît)
export function voyagePlan(O, D, opt) {
  opt = opt || {}; const g = voyageGraph(), ids = Object.keys(g.nodes), P = id => id === '@O' ? O.p : id === '@D' ? D.p : g.nodes[id].p, adj = {}, add = (a, l) => (adj[a] = adj[a] || []).push(l);
  for (const e of g.edges) { if (opt.avoid && opt.avoid.has(e.id)) continue; if (opt.only && !opt.only.has(e.cor)) continue; add(e.a, leg('cor', e.a, e.b, e.len, e, e.pts)); add(e.b, leg('cor', e.b, e.a, e.len, e, e.pts.slice().reverse())); }
  for (const n of ids) { add('@O', leg('free', '@O', n, d3(O.p, P(n)), null, [O.p, P(n)])); add(n, leg('free', n, '@D', d3(P(n), D.p), null, [P(n), D.p])); }
  if (opt.direct) add('@O', leg('free', '@O', '@D', d3(O.p, D.p), null, [O.p, D.p]));
  const cost = { '@O': 0 }, prev = {}, done = new Set(), all = ['@O', '@D', ...ids];
  for (;;) { let u = null; for (const k of all) if (!done.has(k) && cost[k] !== undefined && (u === null || cost[k] < cost[u])) u = k; if (u === null || u === '@D') break; done.add(u);
    for (const l of adj[u] || []) { const w = cost[u] + l.min + 1e-9; if (cost[l.b] === undefined || w < cost[l.b]) { cost[l.b] = w; prev[l.b] = l; } } }
  if (!prev['@D']) return null; const legs = []; for (let k = '@D'; k !== '@O'; k = prev[k].a) legs.unshift(prev[k]); return sum(legs.filter(l => l.len > 1e-6));
}
export function voyageDirect(O, D) { return sum([leg('free', '@O', '@D', d3(O.p, D.p), null, [O.p, D.p])]); }
// devis : durée de la saison de test (min), durée « saison normale » (min), carburant ; minimum par mission (E7)
export function voyageQuote(pl, baseFuel) { const C = VOYAGE_RULES, mn = C.Lmin / C.v, norm = Math.max(pl.min, mn), fu = Math.max(pl.fu, C.Lmin); return { test: norm / C.season, norm, fuel: Math.round(baseFuel * fu / C.Lref), floorT: pl.min < mn, floorF: pl.fu < C.Lmin }; }

// ── ce que le serveur calcule pour un tanker : vol libre direct, et le plus rapide par les corridors connus ──
// origin : adresse du monde de départ (planète) ; dest : système d'un port franc du réseau ; tier : 1 à 3 ; known : ids de corridors
export function voyageOptions(origin, dest, tier, known) {
  const op = addressPos(origin), dp = systemPos(dest), t = Math.max(1, Math.min(3, tier | 0 || 1)), base = VOYAGE_RULES.fuel[t];
  if (!op || !dp) return { ok: false, why: 'adresse' };
  const O = { id: '@O', key: origin, p: op }, D = { id: '@D', key: dest, p: dp }, g = voyageGraph();
  const only = Array.isArray(known) ? new Set(known.filter(id => NET.corridors.some(c => c.id === id))) : null;
  const out = [{ k: 'libre', name: 'Vol libre direct', pl: voyageDirect(O, D) }];
  const fast = voyagePlan(O, D, { direct: false, only });
  if (fast && fast.nCor) out.push({ k: 'cor', name: 'Par corridors', pl: fast });
  for (const x of out) x.q = voyageQuote(x.pl, base);
  const dq = out[0].q, best = out.reduce((a, b) => b.q.test < a.q.test ? b : a); for (const x of out) x.best = x === best && (x.k === 'libre' || x.q.test < dq.test * .95);
  return { ok: true, tier: t, net: g.version, plans: out.map(x => ({ k: x.k, name: x.name, best: x.best, len: x.pl.len, min: x.pl.min, nCor: x.pl.nCor, test: x.q.test, norm: x.q.norm, fuel: x.q.fuel, floorT: x.q.floorT, floorF: x.q.floorF,
    legs: x.pl.legs.map(l => ({ t: l.type, a: l.a, b: l.b, len: l.len, e: l.edge ? l.edge.id : null, cor: l.edge ? l.edge.cor : null })),
    via: x.pl.legs.slice(0, -1).map(l => l.b).filter(id => g.nodes[id]).map(id => g.nodes[id].key) })) };
}

// ── étape 5 : heures d'entrée et de sortie sur chaque tronçon de corridor d'un voyage fixé (l'unité d'interception) ──
// Les durées des étapes sont proportionnelles à leurs durées en saison normale ; le minimum par mission les étire d'autant.
export function voyageSegs(plan, depMs, arrMs, originKey, destKey) {
  const g = voyageGraph(), R = VOYAGE_RULES, key = id => id === '@O' ? originKey : id === '@D' ? destKey : (g.nodes[id] ? g.nodes[id].key : null);
  const legs = (plan && plan.legs) || [], mins = legs.map(l => l.len / (R.v * (l.t === 'cor' ? R.k : 1))), tot = mins.reduce((a, b) => a + b, 0) || 1;
  const out = []; let cum = 0;
  legs.forEach((l, i) => { const t0 = depMs + (arrMs - depMs) * cum / tot; cum += mins[i]; const t1 = depMs + (arrMs - depMs) * cum / tot;
    if (l.t === 'cor' && l.e) out.push({ e: l.e, a: key(l.a), b: key(l.b), t0: Math.round(t0), t1: Math.round(t1) }); });
  return out;
}
// ── étape 5 : une flotte vole à la vitesse de son vaisseau le plus lent (décision du 12/11 ; valeurs d'essai, u/min en saison normale) ──
export const FLEET_SPEED = { fregate: 14, cuirasse: 8, tanker: 12 };
export function fleetSpeed(comp) {
  let v = null;
  for (const [ty, sp] of Object.entries(FLEET_SPEED)) { const c = comp && comp[ty], n = c ? (c.t1 | 0) + (c.t2 | 0) + (c.t3 | 0) : 0; if (n > 0) v = v == null ? sp : Math.min(v, sp); }
  return v;
}
// rejoindre un tronçon en vol libre : jusqu'à son point le plus proche (sur la courbe), minimum par mission compris
export function fleetToSegment(comp, fromAddr, edgeId) {
  const v = fleetSpeed(comp), p = addressPos(fromAddr), e = voyageGraph().edges.find(x => x.id === edgeId);
  if (!v || !p || !e) return null;
  let best = 0, bd = Infinity; e.pts.forEach((q, i) => { const d = d3(p, q); if (d < bd) { bd = d; best = i; } });
  const R = VOYAGE_RULES, min = Math.max(bd, R.Lmin) / v;
  return { d: bd, at: best / (e.pts.length - 1), speed: v, norm: min, test: min / R.season, ms: Math.max(60000, Math.round(min / R.season * 60000)) };
}
