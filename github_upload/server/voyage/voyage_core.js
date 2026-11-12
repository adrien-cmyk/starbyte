/* GÉNÉRÉ par tools/build-voyage.py — ne pas modifier à la main.
   1) générateur de l'univers (copie exacte du bloc universe-core de l'Atlas) ; 2) réseau candidat ; 3) src/voyage_rules.js */
const WORLD_SEED=41071990,SECTOR_SIZE=1600,PER_SECTOR=9999,SECTOR_LIMIT=10000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{let t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function hash3(x,y,z,s=0){let h=Math.imul(x|0,0x1f123bb5)^Math.imul(y|0,0x5f356495)^Math.imul(z|0,0x6c8e9cf5)^s^WORLD_SEED;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return(h^(h>>>16))>>>0}
function randomOf(seed){return()=>{seed=(seed+0x6d2b79f5)>>>0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296}}
function noise3(x,y,z){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);let out=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)out+=hash3(ix+a,iy+b,iz+c,71)/4294967295*(a?u:1-u)*(b?v:1-v)*(c?w:1-w);return out}
function fbm3(x,y,z){let sum=0,amp=.55,total=0;for(let i=0;i<4;i++){sum+=noise3(x,y,z)*amp;total+=amp;x=x*2.03+17.1;y=y*2.03-8.7;z=z*2.03+11.3;amp*=.48}return sum/total}
function density(x,y,z){const warp=noise3(x*.00037,y*.00037,z*.00037)*260;const n=fbm3((x+warp)*.00105,y*.00105,(z-warp)*.00105);return .055+.945*Math.pow(smoothstep(.31,.72,n),2)}
const clusterOf=(x,y,z)=>[Math.floor((9*x+3*y-z+13)/26),Math.floor((x+9*y-3*z+13)/26),Math.floor((-3*x-y+9*z+13)/26)];
const SECTOR_OFFSETS=[];
for(let z=-5;z<=5;z++)for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++)if(clusterOf(x,y,z).every(n=>n===0))SECTOR_OFFSETS.push([x,y,z]);
function zig(n){return n>=0?2*n:-2*n-1}function unzig(n){return n%2===0?n/2:-(n+1)/2}
function pairBig(a,b){let s=a+b;return s*(s+1n)/2n+b}
function unpairBig(n){let low=0n,high=1n;while(high*(high+1n)/2n<=n)high*=2n;while(low+1n<high){const m=(low+high)/2n;if(m*(m+1n)/2n<=n)low=m;else high=m}const b=n-low*(low+1n)/2n;return[low-b,b]}
function letters(n){let s='';n+=1n;while(n>0n){n-=1n;s=String.fromCharCode(65+Number(n%26n))+s;n/=26n}return s}
function letterIndex(s){let n=0n;for(const c of s)n=n*26n+BigInt(c.charCodeAt(0)-64);return n-1n}
function clusterCode(a){return letters(pairBig(pairBig(BigInt(zig(a[0])),BigInt(zig(a[1]))),BigInt(zig(a[2]))))}
function decodeCluster(s){const [ab,c]=unpairBig(letterIndex(s)),[a,b]=unpairBig(ab);return[unzig(Number(a)),unzig(Number(b)),unzig(Number(c))]}
function sectorAddress(s){const [u,v,w]=clusterOf(...s),base=[3*u-v,3*v+w,u+3*w];const o=s.map((a,i)=>a-base[i]);const letter=SECTOR_OFFSETS.findIndex(a=>a.every((n,i)=>n===o[i]));if(letter<0)throw Error('Secteur sans adresse');return clusterCode([u,v,w])+'-'+String.fromCharCode(65+letter)}
function sectorFromAddress(code,letter){const [u,v,w]=decodeCluster(code),o=SECTOR_OFFSETS[letter.charCodeAt(0)-65];if(!o)throw Error('Lettre de secteur invalide');const s=[3*u-v+o[0],3*v+w+o[1],u+3*w+o[2]];if(s.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>SECTOR_LIMIT))throw Error('Adresse hors de la plage de ce prototype');return s}
function generateSector(s){const rand=randomOf(hash3(...s,103)),used=new Set(),pos=new Float64Array(PER_SECTOR*3),den=new Float32Array(PER_SECTOR);let count=0,tries=0;const V=48,step=SECTOR_SIZE/V;while(count<PER_SECTOR){tries++;const ix=Math.floor(rand()*V),iy=Math.floor(rand()*V),iz=Math.floor(rand()*V),id=ix+V*(iy+V*iz);if(used.has(id))continue;const x=s[0]*SECTOR_SIZE+(ix+.12+.76*rand())*step,y=s[1]*SECTOR_SIZE+(iy+.12+.76*rand())*step,z=s[2]*SECTOR_SIZE+(iz+.12+.76*rand())*step;const d=density(x,y,z);if(rand()>d)continue;used.add(id);pos[count*3]=x;pos[count*3+1]=y;pos[count*3+2]=z;den[count]=d;count++}return{pos,den,tries}}
const SPOTS=[];for(let r=-5;r<=5;r++)for(let q=-5;q<=5;q++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=5)SPOTS.push([q,r]);SPOTS.sort((a,b)=>Math.max(Math.abs(a[0]),Math.abs(a[1]),Math.abs(a[0]+a[1]))-Math.max(Math.abs(b[0]),Math.abs(b[1]),Math.abs(b[0]+b[1]))||a[1]-b[1]||a[0]-b[0]);const OUTER=[];for(let r=-6;r<=6;r++)for(let q=-6;q<=6;q++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===6)OUTER.push([q,r]);OUTER.sort((a,b)=>Math.atan2(a[1]*.866,a[0]+a[1]*.5)-Math.atan2(b[1]*.866,b[0]+b[1]*.5));for(let i=0;i<8;i++)SPOTS.push(OUTER[Math.floor(i*OUTER.length/8)]);
const HOME_SECTOR=SECTOR_OFFSETS[14].slice(),OTHER_SECTOR=[HOME_SECTOR[0]+1,HOME_SECTOR[1],HOME_SECTOR[2]];
function sysKey(s,i){return sectorAddress(s)+'-'+String(i+1).padStart(4,'0')}
function planetSpots(s,i){const special=(s.every((a,j)=>a===HOME_SECTOR[j])&&i===6385)||(s.every((a,j)=>a===OTHER_SECTOR[j])&&i===1172);const rnd=randomOf(hash3(...s,i+501));let n=Math.floor(rnd()*4),out=[];if(special){n=Math.max(1,n);out.push(39)}while(out.length<n){let a=7+Math.floor(rnd()*92);if(!out.includes(a))out.push(a)}return out}
function localSpotOffset(index){const [q,r]=SPOTS[index];return[(q+r*.5)*3.8,0,r*.866025403784*3.8]}

const NET={"nodes":[{"id":"sanct","type":"station","name":"Sanctuaire du Linceul des Cendres","key":"A-O-8715"},{"id":"refuge","type":"station","name":"Refuge de Brest","key":"A-N-8096"},{"id":"noire","type":"station","name":"Station O’Neill Série Noire","key":"A-N-1556"},{"id":"akhet","type":"station","name":"Au pied du tombeau d’Akhet","key":"A-K-4227"},{"id":"crown","type":"station","name":"The Drifting Crown","key":"A-M-3340"},{"id":"veyra","type":"station","name":"Sous le regard de Veyra","key":"A-L-8388"},{"id":"J1","type":"jonction","name":"Jonction J1","key":"A-N-9388"},{"id":"J2","type":"jonction","name":"Jonction J2","key":"A-N-7586"},{"id":"R1","type":"relais","name":"Relais R1","key":"A-O-1427"},{"id":"R2","type":"relais","name":"Relais R2","key":"A-N-7595"},{"id":"R3","type":"relais","name":"Relais R3","key":"A-N-9950"},{"id":"R4","type":"relais","name":"Relais R4","key":"A-N-2190"},{"id":"R5","type":"relais","name":"Relais R5","key":"A-N-6629"},{"id":"R6","type":"relais","name":"Relais R6","key":"A-N-1996"},{"id":"R7","type":"relais","name":"Relais R7","key":"A-M-1979"},{"id":"R8","type":"relais","name":"Relais R8","key":"A-K-5365"},{"id":"R9","type":"relais","name":"Relais R9","key":"A-K-0757"},{"id":"R10","type":"relais","name":"Relais R10","key":"A-L-7382"}],"corridors":[{"id":"C1","name":"La Vieille Voie du Linceul","cls":"imperial","nodes":["sanct","R1","J1"]},{"id":"C2","name":"La Piste des Glaces","cls":"marchand","nodes":["J1","refuge","R2","R3","R4","crown"]},{"id":"C3","name":"La Voie Noire","cls":"arme","nodes":["J1","R5","noire","R6","J2"]},{"id":"C4","name":"La Route des Gardiens","cls":"imperial","nodes":["J2","akhet"]},{"id":"C5","name":"La Saigne de la Couronne","cls":"pirate","nodes":["akhet","R7","crown"]},{"id":"C6","name":"La Ligne du Regard","cls":"pirate","nodes":["J2","R8","R9","R10","veyra"]}]};

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

export { NET, generateSector, sectorFromAddress, sectorAddress, SPOTS, localSpotOffset, HOME_SECTOR, SECTOR_SIZE, PER_SECTOR };
