/* ══ CARTE PAR ZONES · GRILLE tac-2 ═══════════════════════════════════════════
   Une zone = un prisme hexagonal du monde, identifiant « tac-2:q:r:k ».
   240 u entre centres voisins, couches de 200 u (8 par niveau de secteur, une
   couche ne chevauche jamais deux niveaux). Bornes : yMin ≤ y < yMax. Arrondi
   cubique figé (correction de la plus grande erreur, ordre x, y, z).
   Ces valeurs sont gelées : les changer déplace toutes les zones déjà sondées. */
const TAC_GRID=Object.freeze({version:'tac-2',S:240,H:200,X0:0,Y0:0,Z0:0});
const TQ3=Math.sqrt(3),TAC_R=TAC_GRID.S/TQ3;
function tacLayerOf(y){return Math.floor((y-TAC_GRID.Y0)/TAC_GRID.H)}
function tacLayerY(k){return[TAC_GRID.Y0+k*TAC_GRID.H,TAC_GRID.Y0+(k+1)*TAC_GRID.H]}
function tacRound(qf,rf){const x=qf,z=rf,y=-x-z;let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return[rx|0,rz|0]}
function tacCellOf(x,z){const rf=2*(z-TAC_GRID.Z0)/(TAC_GRID.S*TQ3),qf=(x-TAC_GRID.X0)/TAC_GRID.S-rf/2;return tacRound(qf,rf)}
function tacCellCenter(q,r){return[TAC_GRID.X0+TAC_GRID.S*(q+r/2),TAC_GRID.Z0+TAC_GRID.S*TQ3/2*r]}
const tacCid=(q,r)=>(q+32768)*65536+(r+32768);
const zoneId=(q,r,k)=>TAC_GRID.version+':'+q+':'+r+':'+k;
const zoneParse=id=>{const a=String(id).split(':');return a.length===4&&a[0]===TAC_GRID.version?{q:+a[1],r:+a[2],k:+a[3]}:null};
const zoneOfPoint=p=>{const c=tacCellOf(p[0],p[2]);return zoneId(c[0],c[1],tacLayerOf(p[1]))};
const zoneCenter=(q,r,k)=>{const[cx,cz]=tacCellCenter(q,r),[a,b]=tacLayerY(k);return[cx,(a+b)/2,cz]};
const HEX_DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
function hexRing(q,r,n){if(n===0)return[[q,r]];const out=[];let x=q+HEX_DIRS[4][0]*n,y=r+HEX_DIRS[4][1]*n;for(let i=0;i<6;i++)for(let j=0;j<n;j++){out.push([x,y]);x+=HEX_DIRS[i][0];y+=HEX_DIRS[i][1]}return out}

/* ── données par secteur (mêmes positions que l'atlas) ── */
const tacSecs=new Map(),TAC_SEC_LIMIT=64;let tacKeep=new Set();
function tacIngest(s,d){const n=PER_SECTOR,cid=new Float64Array(n),byL=new Map();
 for(let i=0;i<n;i++){const c=tacCellOf(d.pos[i*3],d.pos[i*3+2]);cid[i]=tacCid(c[0],c[1]);const k=tacLayerOf(d.pos[i*3+1]);let a=byL.get(k);if(!a)byL.set(k,a=[]);a.push(i)}
 for(const[k,a]of byL)byL.set(k,Int32Array.from(a));
 const o={s:s.slice(),key:keyOf(s),pos:d.pos,cid,byL,cells:new Map(),used:performance.now()};tacSecs.set(o.key,o);tacTrim();return o}
function tacTrim(){if(tacSecs.size<=TAC_SEC_LIMIT)return;const old=[...tacSecs.values()].filter(o=>!tacKeep.has(o.key)).sort((a,b)=>a.used-b.used);for(const o of old){if(tacSecs.size<=TAC_SEC_LIMIT-8)break;tacSecs.delete(o.key)}}
function tacSecData(s,sync){const k=keyOf(s);let o=tacSecs.get(k);if(o){o.used=performance.now();return o}if(s.some(n=>Math.abs(n)>SECTOR_LIMIT))return null;const d=cache.get(k)||(sync?generateSector(s):null);return d?tacIngest(s,d):null}
function tacLayerCells(o,k){let m=o.cells.get(k);if(m)return m;m=new Map();const a=o.byL.get(k);if(a)for(const i of a){const c=o.cid[i];let l=m.get(c);if(!l)m.set(c,l=[]);l.push(i)}o.cells.set(k,m);return m}
function tacPrismSectors(q,r,k){const[cx,cz]=tacCellCenter(q,r),sy=Math.floor(tacLayerY(k)[0]/SECTOR_SIZE),out=[];
 for(let sx=Math.floor((cx-TAC_R)/SECTOR_SIZE);sx<=Math.floor((cx+TAC_R)/SECTOR_SIZE);sx++)for(let sz=Math.floor((cz-TAC_R)/SECTOR_SIZE);sz<=Math.floor((cz+TAC_R)/SECTOR_SIZE);sz++)out.push([sx,sy,sz]);return out}
// systèmes d'une zone ; null si une partie n'est pas chargée (jamais « vide » par défaut)
function tacPrismSystems(q,r,k,sync){const cid=tacCid(q,r),out=[];for(const s of tacPrismSectors(q,r,k)){if(s.some(n=>Math.abs(n)>SECTOR_LIMIT))continue;const o=tacSecData(s,sync);if(!o)return null;const l=tacLayerCells(o,k).get(cid);if(l)for(const i of l)out.push({s:o.s,i,key:sysKey(o.s,i),p:[o.pos[i*3],o.pos[i*3+1],o.pos[i*3+2]]})}return out}
function tacSysOfKey(key){const a=String(key).split('-');let s;try{s=sectorFromAddress(a[0],a[1])}catch(e){return null}const i=+a[2]-1;if(!(i>=0&&i<PER_SECTOR))return null;return{s,i,key:a.slice(0,3).join('-')}}
function tacPosOfKey(key,sync){const r=tacSysOfKey(key);if(!r)return null;const o=tacSecData(r.s,sync);return o?[o.pos[r.i*3],o.pos[r.i*3+1],o.pos[r.i*3+2]]:null}
const tacHstr=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h>>>0};
