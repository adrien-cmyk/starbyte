/* ══ CARTE PAR ZONES · APPLICATION (jeu, compte de test) ══════════════════════
   Cahier « Prospection par zones et continuité Atlas / Tactique » v2.0.
   Ouverte par le jeu (assets/zones_test.js, objet parent.SBZones) dans un cadre plein écran.
   - un seul compte : ses vrais mondes (capitale, colonies), ses vraies signatures ;
   - la zone hexagonale est l'unité de décision ; les étoiles ordinaires sont du décor ;
   - profondeur automatique (couche du monde, de l'objet ou de la zone affichés) ;
   - une seule action principale : « Sonder cette zone » (une vraie Radar du hangar) ;
   - la même sélection (zone ou objet + zone) dans l'Atlas et dans la Tactique. */
const ZH=(()=>{try{return window.parent!==window&&parent.SBZones?parent.SBZones:null}catch(e){return null}})();
const zj={mode:'tac',cx:0,cz:0,k:0,upp:2.6,sel:null,origin:'home',snap:null,snapT:0,dirty:true,hits:[],chips:[],anim:false,lastDraw:0,
 view:'home',list:null,sheet:mobile?'sum':'full',yp:null,ws:[],objs:[],objsT:0,regionMap:new Map(),block:null,pendingLaunch:null};
const ZJ_UPP=[.6,9],zjReduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const zjCv=$('tac-overlay'),zjCtx=zjCv.getContext('2d');let zjDpr=1,zjHatch=null,zjStripe=null;
const zjFmt=n=>Math.round(n).toLocaleString('fr-CH');
const zjEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function zjDur(ms){const m=Math.max(0,Math.round(ms/60000));if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return h+' h '+String(r).padStart(2,'0')}
function zjClock(t){const d=new Date(t);return d.getHours()+' h '+String(d.getMinutes()).padStart(2,'0')}

/* ── données du jeu ── */
function zjParseAddr(coord){const m=String(coord||'').match(/^([A-Z]+)-([A-Z])-(\d{4})(?:-(\d{1,2}))?$/);if(!m)return null;let s;try{s=sectorFromAddress(m[1],m[2])}catch(e){return null}
 return{s,i:+m[3]-1,spot:m[4]?+m[4]-1:39,key:m[1]+'-'+m[2]+'-'+m[3]}}
function zjRefresh(force){if(!ZH)return;const now=performance.now();if(!force&&now-zj.snapT<3500)return;zj.snapT=now;
 try{zj.snap=ZH.state()}catch(e){console.warn('[zones] état',e);return}
 zj.ws=zj.snap.worlds.map(w=>{const a=zjParseAddr(w.coord);return a?{...w,...a}:null}).filter(Boolean);
 for(const w of zj.ws){const o=tacSecData(w.s,true);const sp=localSpotOffset(w.spot);w.p=[o.pos[w.i*3]+sp[0],o.pos[w.i*3+1]+sp[1],o.pos[w.i*3+2]+sp[2]];w.zone=zoneOfPoint(w.p)}
 if(!zj.ws.some(w=>w.id===zj.origin))zj.origin=(zj.ws[0]||{}).id||'home';
 zj.regionMap=new Map();const R=zj.snap.zp&&zj.snap.zp.region;if(R)for(const z of R.zones)zj.regionMap.set(z.id,z);
 zj.objsT=0;zj.dirty=true;if(zj.view!=='choix')zjSheet()}
const zjWorld=id=>zj.ws.find(w=>w.id===id)||zj.ws[0];
const zjHome=()=>zj.ws.find(w=>w.kind==='home')||zj.ws[0];
function zjZoneState(id){const z=zj.snap&&zj.snap.zp&&zj.snap.zp.zones[id],m=zj.snap&&zj.snap.missions.find(x=>x.zone===id);
 if(m)return{st:'mission',m};if(z&&z.st==='done')return{st:'done',z};return{st:'todo'}}
const ZJ_SIG_LABEL={asteroides:'Champ d’astéroïdes',cristal:'Veine cristalline',epave:'Épave',debris:'Débris de combat',cargo:'Cargo abandonné',sonde_ancienne:'Sonde ancienne',anomalie:'Anomalie magnétique',signal:'Signal radio'};
const ZJ_CLASS={habitable:'Corps habitable',dead_world:'Monde mort',gas_giant:'Planète gazeuse',unknown:'Corps non classé'};
function zjSigName(g){if(!g.resolved)return'Signature '+g.id+' · '+(g.typeLabel||'inconnue');if(g.resolvedType==='moving')return(g.target&&g.target.label)||'Cible récupérable';if(g.fixedAddress)return'Planète '+g.fixedAddress;return ZJ_CLASS[g.fixedClass]||'Corps orbital'}

/* ── objets importants : mondes, stations, signatures, sondes en vol (les étoiles n'en font pas partie) ── */
const zjPosCache=new Map();
function zjPosOf(key){let p=zjPosCache.get(key);if(p===undefined){const r=tacSysOfKey(key);if(r){const d=cache.get(keyOf(r.s))||generateSector(r.s);p=[d.pos[r.i*3],d.pos[r.i*3+1],d.pos[r.i*3+2]]}else p=null;zjPosCache.set(key,p)}return p}
function zjObjects(){if(performance.now()-zj.objsT<1000&&zj.objs.length)return zj.objs;const out=[];
 for(const w of zj.ws)out.push({type:'world',id:'world:'+w.id,name:w.name,sub:(w.kind==='home'?'Ma planète':'Ma colonie')+' · '+w.coord,key:w.key,p:w.p,w});
 for(const st of CARNET_ST){const p=zjPosOf(st.key);if(p)out.push({type:'station',id:'st:'+st.key,name:st.name,sub:'Port franc · '+st.key,key:st.key,p})}
 if(zj.snap)for(const g of zj.snap.sigs){const p=zjPosOf(g.system);if(!p)continue;out.push({type:'sig',id:'sig:'+g.id,name:zjSigName(g),sub:g.system,key:g.system,p,g})}
 for(const o of out)o.zone=zoneOfPoint(o.p);zj.objs=out;zj.objsT=performance.now();return out}
function zjMissionPos(m){const w=zjWorld(m.world),z=zoneParse(m.zone);if(!w||!z)return null;const c=zoneCenter(z.q,z.r,z.k),now=Date.now(),f=Math.max(0,Math.min(1,(now-m.departedAt)/Math.max(1,m.arrivalAt-m.departedAt)));
 return[w.p[0]+(c[0]-w.p[0])*f,w.p[1]+(c[1]-w.p[1])*f,w.p[2]+(c[2]-w.p[2])*f]}

/* ── région de test : 30 zones, contenu fixé une seule fois (décision D9, proposée) ── */
const ZJ_KINDS={asteroides:{sigType:'mineral_dense',as:'moving'},cristal:{sigType:'mineral_dense',as:'moving'},epave:{sigType:'metallic_echo',as:'moving'},debris:{sigType:'metallic_echo',as:'moving'},
 cargo:{sigType:'metallic_echo',as:'moving'},sonde_ancienne:{sigType:'heat_point',as:'moving'},anomalie:{sigType:'unstable_field',as:'moving'},habitable:{sigType:'heat_point',as:'fixed',fixedClass:'habitable'}};
function zjRng(seed){let t=tacHstr(seed)>>>0;return()=>{t=(t+0x6d2b79f5)>>>0;let x=Math.imul(t^(t>>>15),1|t);x^=x+Math.imul(x^(x>>>7),61|x);return((x^(x>>>14))>>>0)/4294967296}}
function zjShuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function zjMakeRegion(){const home=zjHome(),col=zj.ws.find(w=>w.kind==='colony');if(!home)return null;
 const[qH,rH]=tacCellOf(home.p[0],home.p[2]),kH=tacLayerOf(home.p[1]),seen=new Set(),zones=[];
 const add=(q,r,k,grp)=>{const id=zoneId(q,r,k);if(seen.has(id))return false;seen.add(id);zones.push({id,q,r,k,grp});return true};
 add(qH,rH,kH,'A0');for(const[q,r]of hexRing(qH,rH,1))add(q,r,kH,'A1');for(const[q,r]of hexRing(qH,rH,2))add(q,r,kH,'A2');
 let qC=qH,rC=rH,kC=kH;
 if(col){[qC,rC]=tacCellOf(col.p[0],col.p[2]);kC=tacLayerOf(col.p[1]);add(qC,rC,kC,'B');for(const[q,r]of hexRing(qC,rC,1))add(q,r,kC,'B')}
 const ring3=hexRing(qH,rH,3);let f=0;while(zones.length<26&&f<ring3.length){add(ring3[f][0],ring3[f][1],kH,'B');f++}
 add(qH,rH,kH+1,'C');add(qH,rH,kH-1,'C');if(col){add(qC,rC,kC+1,'C');add(qC,rC,kC-1,'C')}else{const[q,r]=hexRing(qH,rH,1)[0];add(q,r,kH+1,'C');add(q,r,kH-1,'C')}
 while(zones.length<30&&f<ring3.length){add(ring3[f][0],ring3[f][1],kH,'C');f++}
 zones.length=Math.min(zones.length,30);
 const seed=home.coord,rng=zjRng(seed+'|cat'),R='rien',C='commun',X='choix';
 const tmpl={A0:[R],A1:[R,R,C,C,C,X],A2:[R,R,R,R,R,C,C,C,C,C,X,X],B:[R,R,R,C,C,X,X],C:[R,C,C,X]};
 const pools={};for(const g in tmpl)pools[g]=zjShuffle(tmpl[g],rng);
 // une zone reçoit la prochaine catégorie de son groupe ; ce qui manque (zones dédoublonnées) est complété pour garder 12 / 12 / 6
 const need={rien:12,commun:12,choix:6};for(const z of zones){const pool=pools[z.grp]||[];z.cat=pool.length?pool.shift():null;if(z.cat)need[z.cat]--}
 const rest=zjShuffle([...Array(Math.max(0,need.rien)).fill(R),...Array(Math.max(0,need.commun)).fill(C),...Array(Math.max(0,need.choix)).fill(X)],rng);for(const z of zones)if(!z.cat)z.cat=rest.shift()||R;
 const communs=zjShuffle(['asteroides','asteroides','asteroides','asteroides','asteroides','asteroides','cristal','cristal','cristal','epave','epave','epave'],zjRng(seed+'|c'));
 const choixA=zones.filter(z=>z.cat===X&&(z.grp==='A1'||z.grp==='A2')),choixB=zones.filter(z=>z.cat===X&&z.grp==='B'),others=zjShuffle(['anomalie','debris','sonde_ancienne','cargo'],zjRng(seed+'|x'));
 const hab=new Set();if(choixA[0])hab.add(choixA[0].id);if(choixB[0])hab.add(choixB[0].id);else if(choixA[1])hab.add(choixA[1].id);
 const extra=['habitable','habitable'].slice(hab.size);
 for(const z of zones){if(z.cat===C)z.kind=communs.shift()||'asteroides';else if(z.cat===X)z.kind=hab.has(z.id)?'habitable':(others.shift()||extra.shift()||'debris')}
 // chaque contenu est posé sur un vrai système de la zone, accepté par les règles du jeu (portée, emplacement habitable)
 const avoid=new Set([...zj.ws.map(w=>w.key),...CARNET_ST.map(s=>s.key)]),notes=[];
 const sysOf=z=>{if(z._sys)return z._sys;const c=zoneCenter(z.q,z.r,z.k),l=(tacPrismSystems(z.q,z.r,z.k,true)||[]).filter(x=>!avoid.has(x.key));
  l.sort((a,b)=>Math.hypot(a.p[0]-c[0],a.p[1]-c[1],a.p[2]-c[2])-Math.hypot(b.p[0]-c[0],b.p[1]-c[1],b.p[2]-c[2]));return z._sys=l};
 const place=(z,kind)=>{const ok=sysOf(z).filter(x=>{try{const v=ZH.check(x.key,kind);return v.radar&&(kind!=='habitable'||v.habitable)}catch(e){return false}});return ok.length?ok[Math.floor(zjRng(seed+'|s|'+z.id)()*ok.length)]:null};
 const setC=(z,cat,kind,pick)=>{z.cat=cat;z.anchor=pick.key;z.content={cat,kind,sys:pick.key,...ZJ_KINDS[kind]}};
 const failed=[];
 for(const z of zones){const l=sysOf(z);z.n=l.length;z.anchor=(l[0]||{}).key||home.key;if(z.cat===R){z.content={cat:R};continue}const pick=place(z,z.kind);if(pick)setC(z,z.cat,z.kind,pick);else failed.push(z)}
 // un contenu sans système compatible (hors portée selon les règles du jeu) passe dans une zone vide qui en a un, sinon il est abandonné et noté
 for(const z of failed){const cat=z.cat,kind=z.kind;let moved=null;
  for(const c of zones){if(c.cat!==R||c.grp==='A0'||c.content.moved)continue;const pick=place(c,kind);if(pick){setC(c,cat,kind,pick);c.content.moved=z.id;moved=c;break}}
  z.cat=R;z.content={cat:R};notes.push(z.id+' : aucun système à portée pour « '+kind+' »'+(moved?', contenu déplacé en '+moved.id:', contenu abandonné'))}
 for(const z of zones){delete z.kind;delete z._sys}
 return{grid:TAC_GRID.version,seed,createdAt:Date.now(),home:home.coord,colony:col?col.coord:null,zones,notes}}

/* ── caméra orthographique : la même scène, vue de dessus, sur la tranche active ── */
const zjCam=new T.OrthographicCamera(-1,1,1,-1,1,400000);zjCam.up.set(0,0,-1);
const zjRender0=renderer.render.bind(renderer);
renderer.render=function(sc,cam){if(zj.mode==='tac'&&cam===camera){zjPlaceCam();return zjRender0(sc,zjCam)}return zjRender0(sc,cam)};
function zjPlaceCam(){const W=innerWidth,H=innerHeight,[a,b]=tacLayerY(zj.k),ym=(a+b)/2;zjCam.left=-W/2*zj.upp;zjCam.right=W/2*zj.upp;zjCam.top=H/2*zj.upp;zjCam.bottom=-H/2*zj.upp;
 zjCam.position.set(zj.cx-origin.x,ym+150000-origin.y,zj.cz-origin.z);zjCam.lookAt(zj.cx-origin.x,ym-origin.y,zj.cz-origin.z);zjCam.updateProjectionMatrix();zjCam.updateMatrixWorld()}
const zjHidden=[];function zjSceneVisible(on){if(!on){zjHidden.length=0;for(const o of [sectorRoot,distant,systemGroup])if(o&&o.visible){o.visible=false;zjHidden.push(o)}}else{for(const o of zjHidden)o.visible=true;zjHidden.length=0}}
function zjView(){const W=innerWidth,H=innerHeight,u=zj.upp;return{W,H,x0:zj.cx-W/2*u,x1:zj.cx+W/2*u,z0:zj.cz-H/2*u,z1:zj.cz+H/2*u}}
const zjW=(px,py)=>[zj.cx+(px-innerWidth/2)*zj.upp,zj.cz+(py-innerHeight/2)*zj.upp];
const zjInSlice=(y,k=zj.k)=>{const[a,b]=tacLayerY(k);return y>=a&&y<b};

/* ── chargement des secteurs de l'emprise ── */
const zjAsked=new Map();
function zjNeedSectors(v){v=v||zjView();const m=400,[a]=tacLayerY(zj.k),sy=Math.floor(a/SECTOR_SIZE),out=[];
 for(let sx=Math.floor((v.x0-m)/SECTOR_SIZE);sx<=Math.floor((v.x1+m)/SECTOR_SIZE);sx++)for(let sz=Math.floor((v.z0-m)/SECTOR_SIZE);sz<=Math.floor((v.z1+m)/SECTOR_SIZE);sz++){const s=[sx,sy,sz];if(!s.some(n=>Math.abs(n)>SECTOR_LIMIT))out.push(s)}return out}
function zjLoad(){const need=zjNeedSectors(),keys=new Set(need.map(keyOf));tacKeep=keys;let ch=false,syncDone=false;
 for(let j=queue.length-1;j>=0;j--){const k=keyOf(queue[j]);if(!keys.has(k)){requested.delete(k);queue.splice(j,1)}}
 for(const k of [...zjAsked.keys()])if(!keys.has(k))zjAsked.delete(k);
 for(const s of need){const k=keyOf(s);if(tacSecs.has(k)){tacSecs.get(k).used=performance.now();continue}
  if(cache.has(k)){tacIngest(s,cache.get(k));zjAsked.delete(k);ch=true;continue}
  const t=zjAsked.get(k);if(!t){zjAsked.set(k,performance.now());requestSector(s,true)}
  else if(!syncDone&&performance.now()-t>1500){tacIngest(s,generateSector(s));zjAsked.delete(k);syncDone=true;ch=true}}
 if(ch)zj.dirty=true;return need.every(s=>tacSecs.has(keyOf(s)))}

/* ── motifs et hexagones ── */
function zjPatterns(){const mk=f=>{const c=document.createElement('canvas');c.width=c.height=12;const x=c.getContext('2d');f(x);return zjCtx.createPattern(c,'repeat')};
 zjHatch=mk(x=>{x.strokeStyle='rgba(205,195,255,.26)';x.lineWidth=1;x.beginPath();x.moveTo(-1,13);x.lineTo(13,-1);x.stroke()});
 zjStripe=mk(x=>{x.fillStyle='rgba(120,145,200,.26)';x.beginPath();x.moveTo(0,0);x.lineTo(6,0);x.lineTo(0,6);x.fill();x.beginPath();x.moveTo(12,6);x.lineTo(12,12);x.lineTo(6,12);x.fill()})}
const ZJ_HEX=[...Array(6)].map((_,i)=>{const a=Math.PI/180*(60*i-30);return[Math.cos(a)*TAC_R,Math.sin(a)*TAC_R]});
function zjHexPath(c,X,Y,s){c.moveTo(X+ZJ_HEX[0][0]*s,Y+ZJ_HEX[0][1]*s);for(let i=1;i<6;i++)c.lineTo(X+ZJ_HEX[i][0]*s,Y+ZJ_HEX[i][1]*s);c.lineTo(X+ZJ_HEX[0][0]*s,Y+ZJ_HEX[0][1]*s);c.lineTo(X+ZJ_HEX[1][0]*s,Y+ZJ_HEX[1][1]*s)}
function zjPatShift(p,ox,oy){try{p.setTransform(new DOMMatrix().translate(ox,oy))}catch(e){}}
function zjInsets(){const r=id=>{const e=$(id);if(!e)return null;const b=e.getBoundingClientRect();return b.width&&b.height?b:null},top=Math.max(56,...['zj-top','zj-depth'].map(r).filter(Boolean).map(b=>b.bottom))+8,s=r('zj-sheet');
 let bottom=innerHeight-12;if(s&&mobile)bottom=Math.min(bottom,s.top-8);return{top,bottom,left:mobile?8:(s?s.right+8:8),right:innerWidth-8}}
const zjHomeK=()=>{const h=zjHome();return h?tacLayerOf(h.p[1]):0};
function zjCtxLabel(){const ws=zj.ws.filter(w=>tacLayerOf(w.p[1])===zj.k);if(ws.length)return'Au niveau de '+ws.map(w=>w.name).join(' et ');
 if(zj.sel&&zj.sel.type==='station'&&tacLayerOf(zj.sel.p[1])===zj.k)return'Au niveau de la station';
 const d=zj.k-zjHomeK(),h=zjHome();return(d>0?'Au-dessus':'Au-dessous')+' de '+(h?h.name:'ma planète')+' · '+Math.abs(d)+' couche'+(Math.abs(d)>1?'s':'')}

/* ══ DESSIN DE LA TACTIQUE ══ */
function zjDraw(){const c=zjCtx,W=innerWidth,H=innerHeight,inv=1/zj.upp,v=zjView(),[y0,y1]=tacLayerY(zj.k),hexPx=TAC_GRID.S*inv,ins=zjInsets(),hits=[],chips=[],t=performance.now()/1000,now=Date.now();
 const sx=X=>(X-zj.cx)*inv+W/2,sy=Z=>(Z-zj.cz)*inv+H/2,mapOpen=ins.bottom-ins.top>=80;zj.anim=false;
 c.setTransform(zjDpr,0,0,zjDpr,0,0);c.clearRect(0,0,W,H);
 const need=zjNeedSectors(v),SS=SECTOR_SIZE,loadedAt=new Set();for(const s of need)if(tacSecs.has(keyOf(s)))loadedAt.add(s[0]*1e6+s[2]);
 const cellLoaded=(cx,cz)=>{for(let a=Math.floor((cx-TAC_R)/SS);a<=Math.floor((cx+TAC_R)/SS);a++)for(let b=Math.floor((cz-TAC_R)/SS);b<=Math.floor((cz+TAC_R)/SS);b++){if(Math.abs(a)>SECTOR_LIMIT||Math.abs(b)>SECTOR_LIMIT)continue;if(!loadedAt.has(a*1e6+b))return false}return true};
 // 1. zones visibles
 const rowH=TAC_GRID.S*TQ3/2,cells=[];
 for(let r=Math.floor((v.z0-TAC_R)/rowH)-1;r<=Math.ceil((v.z1+TAC_R)/rowH)+1;r++){const q0=Math.floor(v.x0/TAC_GRID.S-r/2)-1,q1=Math.ceil(v.x1/TAC_GRID.S-r/2)+1;
  for(let q=q0;q<=q1;q++){const[cx,cz]=tacCellCenter(q,r),X=sx(cx),Y=sy(cz);if(X<-hexPx||X>W+hexPx||Y<-hexPx||Y>H+hexPx)continue;const id=zoneId(q,r,zj.k),reg=zj.regionMap.get(id);
   cells.push({q,r,X,Y,cx,cz,id,reg,loaded:cellLoaded(cx,cz),st:reg?zjZoneState(id):null})}}
 // 2. fond : voile sur les étoiles
 c.fillStyle='rgba(3,4,12,.55)';c.fillRect(0,0,W,H);
 // 3. étoiles de la tranche : du décor, jamais une cible
 let drawn=0;const rr=Math.max(1.1,Math.min(2.6,inv*2.4));c.fillStyle='rgba(222,226,245,.6)';
 for(const s of need){const o=tacSecs.get(keyOf(s));const a=o&&o.byL.get(zj.k);if(!a)continue;const step=a.length>2600&&inv<.35?2:1;
  for(let j=0;j<a.length;j+=step){const i=a[j],X=sx(o.pos[i*3]),Y=sy(o.pos[i*3+2]);if(X<-4||X>W+4||Y<-4||Y>H+4)continue;c.fillRect(X-rr/2,Y-rr/2,rr,rr);drawn++}}
 zj.shown=drawn;
 // 4. zones non chargées : rayures, jamais « vides »
 const unl=cells.filter(e=>!e.loaded);if(unl.length){zj.anim=!zjReduce;zjPatShift(zjStripe,zjReduce?0:(t*14)%12,0);c.fillStyle=zjStripe;c.beginPath();for(const e of unl)zjHexPath(c,e.X,e.Y,inv);c.fill()}
 // 5. grille
 if(hexPx>=14){c.beginPath();for(const e of cells)zjHexPath(c,e.X,e.Y,inv);c.strokeStyle='rgba(175,155,255,'+Math.min(.16,.05+(hexPx-14)/500)+')';c.lineWidth=1;c.stroke()}
 // 6. région de test : Non sondée (hachures), En mission (anneau), Sondée (plein + ✓) — motif, symbole et texte
 const reg=cells.filter(e=>e.reg&&e.loaded);
 if(reg.length){zjPatShift(zjHatch,(-zj.cx*inv)%12,(-zj.cz*inv)%12);c.beginPath();for(const e of reg)if(e.st.st==='todo')zjHexPath(c,e.X,e.Y,inv*.96);c.fillStyle=zjHatch;c.fill();
  for(const e of reg){const st=e.st.st;c.beginPath();zjHexPath(c,e.X,e.Y,inv*.94);
   if(st==='todo'){c.strokeStyle='rgba(190,175,255,.55)';c.lineWidth=1.2;c.setLineDash([4,4]);c.stroke();c.setLineDash([])}
   else if(st==='done'){const n=(e.st.z.found||[]).length;c.fillStyle=n?'rgba(255,207,150,.10)':'rgba(225,228,255,.06)';c.fill();c.strokeStyle=n?'rgba(255,207,150,.75)':'rgba(225,228,255,.6)';c.lineWidth=1.4;c.stroke()}
   else{zj.anim=!zjReduce;const p=zjReduce?.5:(t*1.3)%1;c.strokeStyle='#b29aff';c.lineWidth=1.8;c.stroke();c.beginPath();c.arc(e.X,e.Y,Math.max(6,TAC_R*inv*(.2+.45*p)),0,6.283);c.strokeStyle='rgba(205,190,255,'+(.9-.7*p)+')';c.lineWidth=1.5;c.stroke()}
   if(hexPx>=48){c.font='600 10px ui-monospace,SFMono-Regular,monospace';c.textAlign='center';c.textBaseline='middle';const ty=e.Y+TAC_R*inv*.55;
    if(st==='done'){const n=(e.st.z.found||[]).length;c.fillStyle=n?'#ffd9a8':'#e6e8ff';c.fillText(n?'✓ '+n+' SIGNAL':'✓ SILENCE',e.X,ty)}
    else if(st==='mission'){c.fillStyle='#e6dcff';c.fillText('EN MISSION · '+zjDur(e.st.m.arrivalAt-now),e.X,ty)}}}}
 // 7. sélection de zone
 const sz=zj.sel&&zj.sel.type==='zone'?zoneParse(zj.sel.zone):null;
 if(sz&&sz.k===zj.k){const[cx,cz]=tacCellCenter(sz.q,sz.r),X=sx(cx),Y=sy(cz);c.beginPath();zjHexPath(c,X,Y,inv*.98);c.strokeStyle='#ffffff';c.lineWidth=2.6;c.stroke();c.beginPath();zjHexPath(c,X,Y,inv*1.06);c.strokeStyle='rgba(255,255,255,.28)';c.lineWidth=1.2;c.stroke()}
 // 8. objets importants : seules cibles touchables
 const ind=[],labs=[];const labOk=(x,y,w)=>{if(labs.some(r=>x<r[0]+r[2]&&x+w>r[0]&&Math.abs(y-r[1])<13))return false;labs.push([x,y,w]);return true};
 for(const o of zjObjects().slice().sort((a,b)=>(a.type==='world'?0:a.type==='station'?1:2)-(b.type==='world'?0:b.type==='station'?1:2))){if(!zjInSlice(o.p[1])){if(o.type==='world'||(zj.sel&&zj.sel.id===o.id))ind.push(o);continue}
  const X=sx(o.p[0]),Y=sy(o.p[2]);if(X<-30||X>W+30||Y<-30||Y>H+30)continue;
  if(o.type==='world'){c.strokeStyle='#80e6d3';c.lineWidth=2;c.beginPath();c.arc(X,Y,8,0,6.283);c.stroke();c.fillStyle='#80e6d3';c.beginPath();c.arc(X,Y,3,0,6.283);c.fill();c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=(o.w.kind==='home'?'MA PLANÈTE · ':'MA COLONIE · ')+o.name;if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
  else if(o.type==='station'){c.fillStyle='#0b0c1c';c.strokeStyle='#ffcf96';c.lineWidth=2;c.beginPath();c.arc(X,Y,7,0,6.283);c.fill();c.stroke();c.fillStyle='#ffcf96';c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=o.name.toUpperCase();if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
  else{const g=o.g,d=7;c.beginPath();c.moveTo(X,Y-d);c.lineTo(X+d,Y);c.lineTo(X,Y+d);c.lineTo(X-d,Y);c.closePath();c.fillStyle='#0b0c1c';c.fill();
   c.strokeStyle=!g.resolved?'#f2f0ff':g.resolvedType==='moving'?'#ffc864':g.fixedAddress?'#9fe0a0':'#b29aff';c.lineWidth=1.8;c.stroke();if(!g.resolved){c.fillStyle='#f2f0ff';c.font='700 9px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('?',X,Y+.5)}
   if(hexPx>=60){c.fillStyle='#ece8ff';c.font='10px system-ui';c.textAlign='left';c.textBaseline='middle';if(labOk(X+11,Y,c.measureText(o.name).width))c.fillText(o.name,X+11,Y)}}
  hits.push({x:X,y:Y,o})}
 // 9. Radars en vol (position issue des horodatages)
 if(zj.snap)for(const m of zj.snap.missions){const p=zjMissionPos(m);if(!p||!zjInSlice(p[1]))continue;const X=sx(p[0]),Y=sy(p[2]);if(X<-10||X>W+10||Y<-10||Y>H+10)continue;zj.anim=!zjReduce||zj.anim;
  c.fillStyle='#e6f0ff';c.beginPath();c.moveTo(X,Y-6);c.lineTo(X+5,Y+4);c.lineTo(X-5,Y+4);c.closePath();c.fill()}
 // 10. halo de l'objet sélectionné
 if(zj.sel&&zj.sel.p&&zj.sel.type!=='zone'&&zjInSlice(zj.sel.p[1])){const X=sx(zj.sel.p[0]),Y=sy(zj.sel.p[2]);c.strokeStyle='#fff';c.lineWidth=1.6;c.beginPath();c.arc(X,Y,14,0,6.283);c.stroke();c.strokeStyle='rgba(255,255,255,.3)';c.beginPath();c.arc(X,Y,21,0,6.283);c.stroke()}
 // 11. indicateurs des lieux importants hors tranche (cadrage explicite vers leur profondeur)
 const placed=[];if(mapOpen)for(const o of ind){const dk=tacLayerOf(o.p[1])-zj.k,lab=(o.type==='world'?(o.w.kind==='home'?'Ma planète ':'Ma colonie '):'Sélection · ')+o.name+' · '+(dk>0?'au-dessus':'au-dessous');
  let X=sx(o.p[0]),Y=sy(o.p[2]);const inside=X>ins.left+10&&X<ins.right-10&&Y>ins.top+10&&Y<ins.bottom-10;c.font='600 10px system-ui';const tw=c.measureText(lab).width+(inside?16:30),bh=30;
  let bx=inside?X+14:Math.min(Math.max(X-tw/2,ins.left+4),ins.right-tw-4),by=inside?Y-bh/2:Math.min(Math.max(Y-bh/2,ins.top+4),ins.bottom-bh-4);
  for(let g=0;g<8&&placed.some(r=>bx<r[0]+r[2]&&bx+tw>r[0]&&by<r[1]+r[3]+4&&by+bh+4>r[1]);g++)by=by+bh+6>ins.bottom-bh?by-(bh+6)*(g+1):by+bh+6;placed.push([bx,by,tw,bh]);
  if(inside){c.setLineDash([3,3]);c.strokeStyle='#80e6d3';c.lineWidth=1.3;c.beginPath();c.arc(X,Y,9,0,6.283);c.stroke();c.setLineDash([])}
  c.fillStyle='rgba(12,12,29,.94)';c.strokeStyle='#80e6d3';c.lineWidth=1;c.beginPath();c.roundRect?c.roundRect(bx,by,tw,bh,8):c.rect(bx,by,tw,bh);c.fill();c.stroke();c.fillStyle='#bff3e9';c.textAlign='left';c.textBaseline='middle';
  c.fillText((inside?'':(X<ins.left+10?'← ':X>ins.right-10?'→ ':Y<ins.top+10?'↑ ':'↓ '))+lab,bx+8,by+bh/2);chips.push({x:bx,y:by-7,w:tw,h:bh+14,o})}
 zj.hits=hits;zj.chips=chips;zj.lastDraw=performance.now();zj.dirty=false;zjDepthUI()}

/* ── toucher : objet important d'abord, sinon la zone ; un pincement ne produit jamais de toucher ── */
function zjPick(px,py){for(const ch of zj.chips)if(px>=ch.x&&px<=ch.x+ch.w&&py>=ch.y&&py<=ch.y+ch.h)return{chip:ch};
 const near=zj.hits.map(h=>({h,d:Math.hypot(h.x-px,h.y-py)})).filter(a=>a.d<=22).sort((a,b)=>a.d-b.d);return{list:near}}
function zjTap(px,py){const r=zjPick(px,py);
 if(r.chip){zjFocus(r.chip.o);return}
 const l=r.list;if(l.length){const close=l.filter(a=>a.d<=l[0].d+10);if(close.length===1)return zjSelectObj(close[0].h.o);zj.list=close.map(a=>a.h.o);zjOpen('choix');return}
 const[wx,wz]=zjW(px,py),[q,rr]=tacCellOf(wx,wz);zjSelectZone(zoneId(q,rr,zj.k))}
function zjCenterOn(p,force){if(zj.mode!=='tac')return;const ins=zjInsets(),W=innerWidth,H=innerHeight,X=(p[0]-zj.cx)/zj.upp+W/2,Y=(p[2]-zj.cz)/zj.upp+H/2,pad=Math.min(60,TAC_R/zj.upp);
 if(!force&&X>ins.left+pad&&X<ins.right-pad&&Y>ins.top+pad&&Y<ins.bottom-pad)return;const tx=(ins.left+ins.right)/2,ty=(ins.top+ins.bottom)/2;zj.cx=p[0]-(tx-W/2)*zj.upp;zj.cz=p[2]-(ty-H/2)*zj.upp;zj.dirty=true}
function zjSelectZone(id,fromCode){zj.sel={type:'zone',zone:id};const z=zoneParse(id);zj.sel.p=zoneCenter(z.q,z.r,z.k);if(zj.mode==='tac'&&z.k!==zj.k)zj.k=z.k;zj.dirty=true;zjMarkAtlasSel();zjOpen('zone');
 if(zj.mode==='tac')zjCenterOn(zj.sel.p,false);else if(fromCode)flyTo(vector(zj.sel.p),Math.max(420,Math.min(1400,distance)))}
function zjSelectObj(o){zj.sel={type:o.type,id:o.id,p:o.p,zone:o.zone,name:o.name};zj.dirty=true;zjMarkAtlasSel();zjOpen('obj');zjCenterOn(o.p,false)}
function zjFocus(o){zj.k=tacLayerOf(o.p[1]);if(o.type==='world')zj.origin=o.w.id;zjSelectObj(o);zjCenterOn(o.p,true)}

/* ── gestes de la tactique ── */
const zjPtr=new Map();let zjG=null;
zjCv.addEventListener('pointerdown',e=>{zjCv.setPointerCapture(e.pointerId);zjPtr.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(zjPtr.size===1)zjG={x:e.clientX,y:e.clientY,t:performance.now(),moved:false,multi:false};
 else if(zjPtr.size===2&&zjG){zjG.multi=true;const a=[...zjPtr.values()];zjG.pd=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1;zjG.pm=[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2]}});
zjCv.addEventListener('pointermove',e=>{if(!zjPtr.has(e.pointerId)||!zjG)return;const prev=zjPtr.get(e.pointerId);zjPtr.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(zjPtr.size>=2){const a=[...zjPtr.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,m=[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2],[wx,wz]=zjW(zjG.pm[0],zjG.pm[1]);
  zj.upp=Math.max(ZJ_UPP[0],Math.min(ZJ_UPP[1],zj.upp*zjG.pd/d));zj.cx=wx-(m[0]-innerWidth/2)*zj.upp;zj.cz=wz-(m[1]-innerHeight/2)*zj.upp;zjG.pd=d;zjG.pm=m;zjG.moved=true;zj.dirty=true;return}
 if(Math.hypot(e.clientX-zjG.x,e.clientY-zjG.y)>7)zjG.moved=true;if(!zjG.moved)return;
 zj.cx-=(e.clientX-prev.x)*zj.upp;zj.cz-=(e.clientY-prev.y)*zj.upp;zj.dirty=true});
function zjUp(e){if(!zjPtr.has(e.pointerId))return;zjPtr.delete(e.pointerId);if(zjPtr.size||!zjG)return;const g=zjG;zjG=null;if(e.type==='pointercancel'||g.multi)return;if(!g.moved&&performance.now()-g.t<700)zjTap(e.clientX,e.clientY)}
zjCv.addEventListener('pointerup',zjUp);zjCv.addEventListener('pointercancel',zjUp);
zjCv.addEventListener('wheel',e=>{e.preventDefault();zjZoom(Math.exp(e.deltaY*.0015),e.clientX,e.clientY)},{passive:false});
zjCv.addEventListener('contextmenu',e=>e.preventDefault());
function zjZoom(f,px,py){const W=innerWidth,H=innerHeight;px=px==null?W/2:px;py=py==null?H/2:py;const[wx,wz]=zjW(px,py);zj.upp=Math.max(ZJ_UPP[0],Math.min(ZJ_UPP[1],zj.upp*f));zj.cx=wx-(px-W/2)*zj.upp;zj.cz=wz-(py-H/2)*zj.upp;zj.dirty=true}
function zjSetLayer(k){if(k===zj.k)return;zj.k=k;zj.dirty=true;zjSheet()}
function zjDepthUI(){const R=zj.snap&&zj.snap.zp&&zj.snap.zp.region;let up=0,dn=0;if(R)for(const z of R.zones){if(z.k>zj.k)up++;else if(z.k<zj.k)dn++}
 $('zj-ctx').textContent=zjCtxLabel();$('zj-up').title=up?up+' zone'+(up>1?'s':'')+' de test au-dessus':'Couche du dessus';$('zj-down').title=dn?dn+' zone'+(dn>1?'s':'')+' de test au-dessous':'Couche du dessous';
 $('zj-up-n').textContent=up?up:'';$('zj-down-n').textContent=dn?dn:''}

/* ══ ATLAS : marqueurs des objets importants (icône et nom = même cible), volume de la zone ══ */
const zjMarks=$('zj-marks');let zjMarkEls=new Map(),zjZoneMesh=null;
function zjAtlasMarks(){if(zj.mode!=='atlas'){if(zjMarkEls.size){zjMarks.innerHTML='';zjMarkEls.clear()}return}
 const w=innerWidth,h=innerHeight,pts=[];
 for(const o of zjObjects()){const v=new T.Vector3(o.p[0],o.p[1],o.p[2]),q=toLocal(v).project(camera),dist=v.distanceTo(target);
  if(!(q.z>-1&&q.z<1&&Math.abs(q.x)<1&&Math.abs(q.y)<1)||dist>(o.type==='world'||(zj.sel&&zj.sel.id===o.id)?9000:3200))continue;pts.push({o,x:(q.x*.5+.5)*w,y:(-q.y*.5+.5)*h})}
 // objets qui se recouvrent : un seul marqueur, qui ouvre une courte liste
 const groups=[];for(const p of pts.sort((a,b)=>(a.o.type==='world'?0:1)-(b.o.type==='world'?0:1))){const g=groups.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<28);if(g)g.items.push(p.o);else groups.push({x:p.x,y:p.y,items:[p.o]})}
 const keep=new Set();
 for(const g of groups){const key=g.items.map(o=>o.id).sort().join('|');keep.add(key);let el=zjMarkEls.get(key);
  if(!el){el=document.createElement('button');el.className='zj-mark';const o=g.items[0];
   el.classList.add('t-'+(g.items.length>1?'many':o.type));
   el.innerHTML='<i></i><b>'+zjEsc(g.items.length>1?g.items.length+' lieux':(o.type==='world'?(o.w.kind==='home'?'Ma planète · ':'Ma colonie · ')+o.name:o.name))+'</b>';
   el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('pointerup',e=>e.stopPropagation());
   el.addEventListener('click',e=>{e.stopPropagation();if(g.items.length>1){zj.list=g.items.slice();zjOpen('choix')}else zjSelectObj(g.items[0])});
   zjMarks.appendChild(el);zjMarkEls.set(key,el)}
  // un libellé ne passe jamais sous les commandes de droite : il bascule à gauche de son icône
  const wd=el.offsetWidth||0,left=g.x+wd-22>innerWidth-62;el.classList.toggle('left',left);
  el.style.transform='translate('+Math.round(left?g.x-wd+44:g.x)+'px,'+Math.round(g.y)+'px)';el.classList.toggle('sel',!!(zj.sel&&g.items.some(o=>o.id===zj.sel.id)))}
 for(const[k,el]of zjMarkEls)if(!keep.has(k)){el.remove();zjMarkEls.delete(k)}}
function zjMarkAtlasSel(){if(zjZoneMesh){scene.remove(zjZoneMesh);disposeObject(zjZoneMesh);zjZoneMesh=null}
 const id=zj.sel&&zj.sel.zone;const z=id&&zoneParse(id);if(!z)return;const[cx,cz]=tacCellCenter(z.q,z.r),[a,b]=tacLayerY(z.k),pts=[];
 for(let i=0;i<6;i++){const p0=ZJ_HEX[i],p1=ZJ_HEX[(i+1)%6];for(const y of [a,b])pts.push(cx+p0[0],y,cz+p0[1],cx+p1[0],y,cz+p1[1]);pts.push(cx+p0[0],a,cz+p0[1],cx+p0[0],b,cz+p0[1])}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
 zjZoneMesh=new T.LineSegments(g,new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.85,depthWrite:false}));zjZoneMesh.userData.global=true;zjZoneMesh.renderOrder=5;scene.add(zjZoneMesh)}
function zjAtlasTap(){if(zj.sel){zj.sel=null;zjMarkAtlasSel();zj.dirty=true;zjOpen('home')}}

/* ── changement de mode : la sélection et sa profondeur sont conservées ── */
function zjSetMode(m){if(m===zj.mode)return;
 if(m==='atlas'){const p=zj.sel&&zj.sel.p?zj.sel.p:[zj.cx,(tacLayerY(zj.k)[0]+tacLayerY(zj.k)[1])/2,zj.cz];zj.mode='atlas';document.body.classList.remove('zj-tac');zjSceneVisible(true);travel=null;
  target.set(p[0],p[1],p[2]);const d=Math.max(160,Math.min(6000,zj.upp*innerHeight/(2*Math.tan(camera.fov*Math.PI/360))));distance=wantedDistance=Math.min(d,1500);
  if(zj.yp){wantedYaw=zj.yp.yaw;wantedPitch=zj.yp.pitch}else{wantedPitch=.55}rebase();updateStreaming(true)}
 else{zj.yp={yaw:wantedYaw,pitch:wantedPitch};zj.mode='tac';document.body.classList.add('zj-tac');if(focused)closeSystem();zjSceneVisible(false);travel=null;
  const p=zj.sel&&zj.sel.p?zj.sel.p:[target.x,target.y,target.z];zj.cx=p[0];zj.cz=p[2];zj.k=tacLayerOf(p[1]);
  const h=Math.tan(camera.fov*Math.PI/360)*2*distance/innerHeight;zj.upp=Math.max(1.6,Math.min(4,h))}
 $('zj-m-atlas').classList.toggle('on',zj.mode==='atlas');$('zj-m-tac').classList.toggle('on',zj.mode==='tac');zjMarkAtlasSel();zj.dirty=true;zjSheet()}

/* ══ FEUILLE : courte, une action principale ══ */
function zjOpen(v){zj.view=v;if(mobile&&zj.sheet==='min'&&v!=='home')zj.sheet='sum';zjSheet()}
function zjSheetState(s){zj.sheet=s;$('zj-sheet').dataset.state=s;zj.dirty=true}
function zjEstimate(zoneIdStr){const z=zoneParse(zoneIdStr),w=zjWorld(zj.origin);if(!z||!w)return null;const c=zoneCenter(z.q,z.r,z.k),dist=Math.hypot(c[0]-w.p[0],c[1]-w.p[1],c[2]-w.p[2]);
 const range=Math.max(1,(zj.snap.ranges[w.id]||1))*SECTOR_SIZE,dur=(5+5*Math.min(1,dist/range))*60e3;return{w,dist,range,dur,inRange:dist<=range}}
function zjZoneHtml(){const id=zj.sel.zone,reg=zj.regionMap.get(id),st=zjZoneState(id),z=zoneParse(id),e=zjEstimate(id),w=e&&e.w,hg=w&&zj.snap.hangars[w.id];
 let h='<div class="zj-kind">ZONE '+zjEsc(z.q+' · '+z.r)+' · '+zjEsc(zjCtxShort(z.k))+'</div>';
 if(!reg){h+='<h3>Hors de la région de test</h3><p class="zj-muted">Le test se limite à 30 zones autour de vos mondes, au contenu fixé et aux coûts maîtrisés. Les zones de test sont hachurées.</p>';return{h,f:''}}
 const label={todo:'Non sondée',mission:'En mission',done:'Sondée'}[st.st];h+='<h3>'+label+'</h3>';
 let f='';
 if(st.st==='todo'){
  h+='<dl class="zj-dl"><dt>Départ</dt><dd>'+zjEsc(w.name)+(zj.ws.length>1?' <button class="zj-link" data-a="worlds">changer</button>':'')+'</dd>';
  h+='<dt>Durée</dt><dd>'+zjDur(e.dur)+' <small>· '+zjFmt(e.dist)+' u</small></dd>';
  h+='<dt>Coût</dt><dd>'+(hg.radar?'1 Radar du hangar de '+zjEsc(w.name)+' <small>('+hg.radar+' prête'+(hg.radar>1?'s':'')+')</small>':'Aucune Radar prête à '+zjEsc(w.name))+'</dd></dl>';
  if(!e.inRange)f='<button class="zj-primary" disabled>Hors de portée depuis '+zjEsc(w.name)+'</button>';
  else if(!hg.radar)f='<p class="zj-muted">Une Radar se fabrique au Centre de prospection : 30 métal, 30 s. Le jeu ne la fabrique jamais à votre place.</p><button class="zj-primary" data-a="build-radar">Fabriquer une Radar</button>';
  else f='<button class="zj-primary" data-a="launch">Sonder cette zone</button>'}
 else if(st.st==='mission'){h+='<dl class="zj-dl"><dt>Radar</dt><dd>'+zjEsc(st.m.probeName||'Radar')+' · depuis '+zjEsc(zjWorld(st.m.world).name)+'</dd><dt>Arrivée</dt><dd>dans '+zjDur(st.m.arrivalAt-Date.now())+' <small>('+zjClock(st.m.arrivalAt)+')</small></dd></dl><p class="zj-muted">Vous pouvez quitter : le résultat sera là à votre retour.</p>'}
 else{const found=(st.z.found||[]).map(id=>zj.snap.sigs.find(g=>g.id===id)).filter(Boolean);
  h+='<p class="zj-muted">Sondée à '+zjClock(st.z.at)+'. '+(found.length?'Ce que la zone a révélé :':'Silence radio : rien de relevé dans ce volume.')+'</p>';
  for(const g of found){const a=ZH.sigAction(g.id,st.z.world||zj.origin);h+='<div class="zj-find"><div><b>'+zjEsc(zjSigName(g))+'</b><small>'+zjEsc(g.system)+(g.resolved?'':' · '+zjEsc(g.intensity||''))+'</small></div>'+zjActBtn(a,g.id,st.z.world)+'</div>'}}
 return{h,f}}
const zjCtxShort=k=>{const d=k-zjHomeK();return d===0?'niveau de ma planète':(d>0?'+':'−')+Math.abs(d)+' couche'+(Math.abs(d)>1?'s':'')};
function zjActBtn(a,arg,wid){if(!a||a.kind==='off')return'<span class="zj-off">'+zjEsc(a?a.label:'')+(a&&a.sub?'<small>'+zjEsc(a.sub)+'</small>':'')+'</span>';
 const x=a.kind==='tanker'||a.kind==='planet'?a.key:arg;return'<button class="zj-act" data-a="act" data-k="'+a.kind+'" data-x="'+zjEsc(x)+'" data-w="'+zjEsc(wid||zj.origin)+'">'+zjEsc(a.label)+(a.sub?'<small>'+zjEsc(a.sub)+'</small>':'')+'</button>'}
function zjObjHtml(){const o=zjObjects().find(x=>x.id===zj.sel.id);if(!o)return{h:'<p class="zj-muted">Objet introuvable.</p>',f:''};const z=zoneParse(o.zone);
 let h='<div class="zj-kind">'+({world:'MON MONDE',station:'PORT FRANC',sig:'SIGNATURE'}[o.type]||'LIEU')+'</div><h3>'+zjEsc(o.name)+'</h3><dl class="zj-dl"><dt>Adresse</dt><dd>'+zjEsc(o.type==='world'?o.w.coord:o.key)+'</dd><dt>Zone</dt><dd>'+zjEsc(z.q+' · '+z.r+' · '+zjCtxShort(z.k))+(zj.regionMap.has(o.zone)?' <small>· région de test</small>':'')+'</dd></dl>',f='';
 if(o.type==='world'){f=o.w.id===zj.origin?'<p class="zj-muted">Les sondages partent de ce monde.</p>':'<button class="zj-primary" data-a="origin" data-w="'+zjEsc(o.w.id)+'">Lancer les sondages depuis '+zjEsc(o.name)+'</button>'}
 if(o.type==='sig'){const a=ZH.sigAction(o.g.id,zj.origin);f=zjActBtn(a,o.g.id,zj.origin)}
 f+='<button class="zj-second" data-a="zone" data-z="'+zjEsc(o.zone)+'">Voir sa zone</button>';return{h,f}}
function zjHomeHtml(){const R=zj.snap&&zj.snap.zp&&zj.snap.zp.region,zs=zj.snap?zj.snap.zp.zones:{},done=Object.values(zs).filter(z=>z.st==='done'),finds=done.reduce((a,z)=>a+(z.found||[]).length,0),miss=zj.snap?zj.snap.missions.length:0,w=zjWorld(zj.origin),hg=w&&zj.snap.hangars[w.id];
 let h='<div class="zj-kind">PROSPECTION PAR ZONES · TEST</div><h3>Touchez une zone voisine</h3><p class="zj-muted">Les zones hachurées forment la région de test. Une zone se sonde avec une seule Radar, quel que soit le nombre d’étoiles qu’elle contient.</p>';
 if(R)h+='<div class="zj-stats"><div><b>'+done.length+'/'+R.zones.length+'</b><small>zones sondées</small></div><div><b>'+finds+'</b><small>signaux</small></div><div><b>'+miss+'</b><small>en vol</small></div><div><b>'+(hg?hg.radar:0)+'</b><small>Radars à '+zjEsc(w?w.name:'')+'</small></div></div>';
 h+='<div class="zj-legend"><span><i class="h"></i>Non sondée</span><span><i class="m"></i>En mission</span><span><i class="d"></i>Sondée</span><span><i class="s"></i>Signature</span></div>';return{h,f:''}}
function zjChoiceHtml(){let h='<div class="zj-kind">PLUSIEURS LIEUX ICI</div><h3>Lequel ?</h3>';for(const o of zj.list||[])h+='<button class="zj-row" data-a="pick" data-id="'+zjEsc(o.id)+'"><b>'+zjEsc(o.name)+'</b><small>'+zjEsc(o.sub||'')+'</small></button>';return{h,f:''}}
function zjWorldsHtml(){let h='<div class="zj-kind">MES MONDES</div><h3>Choisir un monde</h3><p class="zj-muted">Recentre la carte et fixe le départ des sondages. Aucun changement de compte.</p>';
 for(const w of zj.ws){const hg=zj.snap.hangars[w.id]||{};h+='<button class="zj-row'+(w.id===zj.origin?' on':'')+'" data-a="world" data-w="'+zjEsc(w.id)+'"><b>'+zjEsc(w.name)+' · '+(w.kind==='home'?'capitale':'colonie')+'</b><small>'+zjEsc(w.coord)+' · '+(hg.radar||0)+' Radar'+((hg.radar||0)>1?'s':'')+' prête'+((hg.radar||0)>1?'s':'')+'</small></button>'}return{h,f:''}}
function zjSheet(){if(!zj.snap){return}let r;
 if(zj.view==='zone'&&zj.sel&&zj.sel.type==='zone')r=zjZoneHtml();else if(zj.view==='obj'&&zj.sel&&zj.sel.id)r=zjObjHtml();else if(zj.view==='choix')r=zjChoiceHtml();else if(zj.view==='worlds')r=zjWorldsHtml();else{zj.view='home';r=zjHomeHtml()}
 const ae=document.activeElement;if(ae&&$('zj-sheet').contains(ae)&&ae.tagName==='INPUT')return;
 $('zj-sh-body').innerHTML=r.h;$('zj-sh-foot').innerHTML=r.f||'';$('zj-sh-back').hidden=zj.view==='home';$('zj-sheet').dataset.state=zj.sheet}
$('zj-sheet').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='launch')return zjLaunch(b);
 if(a==='build-radar'){ZH.act('build-radar',null,zj.origin);return}
 if(a==='act'){if(b.disabled)return;b.disabled=true;const res=ZH.act(b.dataset.k,b.dataset.x,b.dataset.w);if(res&&res.why)toast(res.why);zjRefresh(true);return}
 if(a==='origin'||a==='world'){zj.origin=b.dataset.w;const w=zjWorld(zj.origin);if(a==='world'){zj.k=tacLayerOf(w.p[1]);if(zj.mode==='atlas'){flyTo(vector(w.p),900)}}toast('Départ des sondages : '+w.name);zj.dirty=true;zjOpen('home');if(a==='world')zjCenterOn(w.p,true);zjDepthUI();return}
 if(a==='zone')return zjSelectZone(b.dataset.z,true);
 if(a==='pick'){const o=(zj.list||[]).find(x=>x.id===b.dataset.id);if(o)zjSelectObj(o);return}
 if(a==='worlds')return zjOpen('worlds')});
function zjLaunch(b){if(!zj.sel||zj.sel.type!=='zone')return;if(b)b.disabled=true;const id=zj.sel.zone,e=zjEstimate(id);if(!e)return;
 const r=ZH.launch({zone:id,world:e.w.id,dist:e.dist,range:e.range,label:'Zone '+id.split(':').slice(1,3).join(' · ')});
 if(!r.ok){toast(r.why==='noradar'?'Aucune Radar prête à '+e.w.name+'.':r.why);zjRefresh(true);return}
 toast(r.already?'Mission déjà en vol pour cette zone.':'Radar lancée · arrivée dans '+zjDur(r.arrivalAt-Date.now())+'.');zjRefresh(true)}

/* ── commandes du haut ── */
$('zj-m-atlas').onclick=()=>zjSetMode('atlas');$('zj-m-tac').onclick=()=>zjSetMode('tac');
$('zj-worlds').onclick=()=>zjOpen('worlds');$('zj-close').onclick=()=>{try{ZH.close()}catch(e){}};
$('zj-up').onclick=()=>zjSetLayer(zj.k+1);$('zj-down').onclick=()=>zjSetLayer(zj.k-1);
$('zj-zin').onclick=()=>{if(zj.mode==='tac')zjZoom(1/1.35);else wantedDistance=Math.max(14,wantedDistance/1.35)};
$('zj-zout').onclick=()=>{if(zj.mode==='tac')zjZoom(1.35);else wantedDistance=Math.min(6500,wantedDistance*1.35)};
$('zj-home').onclick=()=>{const w=zjWorld(zj.origin);if(!w)return;if(zj.mode==='tac'){zj.k=tacLayerOf(w.p[1]);zj.upp=mobile?2.6:2.2;zjCenterOn(w.p,true)}else flyTo(vector(w.p),900);zjSheet()};
$('zj-sh-back').onclick=()=>{zj.sel=null;zjMarkAtlasSel();zj.dirty=true;zjOpen('home')};
$('zj-sh-tog').onclick=()=>zjSheetState(zj.sheet==='full'?'min':zj.sheet==='min'?'sum':'full');

/* ── image par image ── */
function zjViewOffset(){const sh=$('zj-sheet').getBoundingClientRect(),want=zj.mode==='atlas'&&mobile&&zj.sheet!=='min'?Math.round(Math.max(0,innerHeight-sh.top)/2):0;
 if(want===zj.vo)return;zj.vo=want;if(want)camera.setViewOffset(innerWidth,innerHeight,0,want,innerWidth,innerHeight);else camera.clearViewOffset();camera.updateProjectionMatrix()}
function zjFrame(){zjRefresh(false);zjViewOffset();for(const g of [navRoot,navSel,navAmb])g.visible=false;
 if(zjZoneMesh){const z=zoneParse(zj.sel&&zj.sel.zone);if(z)zjZoneMesh.position.set(-origin.x,-origin.y,-origin.z);zjZoneMesh.visible=zj.mode==='atlas'}
 zjAtlasMarks();if(zj.mode!=='tac')return;
 const[a,b]=tacLayerY(zj.k);target.set(zj.cx,(a+b)/2,zj.cz);travel=null;zjLoad();
 const now=performance.now();if(zj.dirty||(zj.anim&&now-zj.lastDraw>(mobile?60:40))||now-zj.lastDraw>1000)zjDraw();
 if(zj.view==='zone'&&now-(zj.sheetT||0)>1000){zj.sheetT=now;const st=zj.sel&&zj.sel.zone?zjZoneState(zj.sel.zone).st:null;if(st==='mission')zjSheet()}}
function zjResize(){zj.vo=null;zjDpr=Math.min(2,devicePixelRatio||1);zjCv.width=Math.round(innerWidth*zjDpr);zjCv.height=Math.round(innerHeight*zjDpr);zjCv.style.width=innerWidth+'px';zjCv.style.height=innerHeight+'px';zj.dirty=true}
addEventListener('resize',zjResize);

/* ── démarrage : les mondes du compte remplacent les joueurs de démonstration ── */
function zjBoot(){zjPatterns();zjResize();
 if(!ZH){$('zj-block').hidden=false;$('zj-block').querySelector('p').textContent='Cette carte s’ouvre depuis le jeu, avec le compte de test (Centre de prospection, bouton « Zones · test »).';return false}
 zjRefresh(true);const home=zjHome();if(!home){$('zj-block').hidden=false;$('zj-block').querySelector('p').textContent='Aucune adresse de monde valide dans la partie : la carte ne peut pas se placer. Rien n’est inventé.';return false}
 players.length=0;players.push({name:'Moi',world:home.name,sector:home.s,index:home.i,spot:home.spot,color:'#80e6d3',point:null});
 for(let j=0;j<3;j++)HOME_SECTOR[j]=home.s[j];target.set(home.p[0],home.p[1],home.p[2]);
 known.clear();for(const w of zj.ws)known.add(sysKey(w.s,w.i));for(const g of zj.snap.sigs)known.add(g.system);
 zj.origin=home.id;zj.cx=home.p[0];zj.cz=home.p[2];zj.k=tacLayerOf(home.p[1]);zj.upp=mobile?2.6:2.2;
 // région de test : créée une seule fois, puis toujours relue telle quelle
 if(!zj.snap.zp.region){const reg=zjMakeRegion();if(reg){const r=ZH.saveRegion(reg);if(r&&r.ok)zjRefresh(true)}}
 document.body.classList.add('zj-tac');zjSceneVisible(false);$('zj-m-tac').classList.add('on');zjSheetState(zj.sheet);zjOpen('home');zjCenterOn(home.p,true);
 try{ZH.onChange(()=>zjRefresh(true))}catch(e){}
 return true}
const zjBooted=zjBoot();
window.STARBYTE_ZONES={zj,refresh:zjRefresh,draw:()=>zjDraw(),tap:zjTap,pick:zjPick,setMode:zjSetMode,selectZone:zjSelectZone,objects:zjObjects,estimate:zjEstimate,
 cellOf:tacCellOf,center:tacCellCenter,layerOf:tacLayerOf,zoneOfPoint,zoneParse,sx:X=>(X-zj.cx)/zj.upp+innerWidth/2,sy:Z=>(Z-zj.cz)/zj.upp+innerHeight/2,load:zjLoad,
 atlasFocus:(p,d)=>{target.set(p[0],p[1],p[2]);distance=wantedDistance=d||500;travel=null;rebase();updateStreaming(true)},atlasTap:(x,y)=>pick(x,y),
 atlasState:()=>({sel:zj.sel,target:[target.x,target.y,target.z],mesh:!!zjZoneMesh,marks:[...zjMarkEls.values()].map(e=>{const r=e.getBoundingClientRect();return{t:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}})})};
