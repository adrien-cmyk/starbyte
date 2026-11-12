/* ══ CARTE PAR ZONES · APPLICATION (jeu, compte de test) ══════════════════════
   Cahier « Prospection par zones et continuité Atlas / Tactique » v2.0.
   Ouverte par le jeu (assets/zones_test.js, objet parent.SBZones) dans un cadre plein écran.
   - un seul compte : ses vrais mondes (capitale, colonies), ses vraies signatures ;
   - la zone hexagonale est l'unité de décision ; les étoiles ordinaires sont du décor ;
   - profondeur automatique (couche du monde, de l'objet ou de la zone affichés) ;
   - une seule action principale : « Sonder cette zone » (une vraie Radar du hangar) ;
   - la même sélection (zone ou objet + zone) dans l'Atlas et dans la Tactique. */
const ZH=(()=>{try{if(window.parent!==window&&parent.SBZones)return parent.SBZones}catch(e){}return window.SB_ZONES_EMBED?zjEmbedShim():null})();
// fichier HTML exporté (« Télécharger cette carte ») : la partie lue est figée dans la page, rien ne part, rien ne s'écrit
function zjEmbedShim(){const no=()=>({ok:false,why:'Lecture seule'});return{embed:true,state:()=>null,close(){},check:()=>({radar:false,habitable:false}),onChange:()=>()=>{},
 sigAction:()=>({kind:'off',label:''}),act:no,launch:no,saveRegion:no}}
const zj={mode:'tac',cx:0,cz:0,k:0,upp:2.6,sel:null,origin:'home',snap:null,snapT:0,dirty:true,hits:[],chips:[],anim:false,lastDraw:0,
 view:'home',list:null,sheet:mobile?'sum':'full',yp:null,ws:[],objs:[],objsT:0,regionMap:new Map(),block:null,pendingLaunch:null};
zj.cor={on:false,g:null,ctx:null,plans:null,pick:0};   // corridors : prévisualisation d'essai (voir plus bas)
const ZJ_UPP=[.6,9],zjReduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const zjCv=$('tac-overlay'),zjCtx=zjCv.getContext('2d');let zjDpr=1,zjHatch=null,zjStripe=null;
const zjFmt=n=>Math.round(n).toLocaleString('fr-CH');
const zjEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function zjDur(ms){const m=Math.max(0,Math.round(ms/60000));if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return h+' h '+String(r).padStart(2,'0')}
function zjClock(t){const d=new Date(t);return d.getHours()+' h '+String(d.getMinutes()).padStart(2,'0')}

/* ── données du jeu ── */
function zjParseAddr(coord){const m=String(coord||'').match(/^([A-Z]+)-([A-Z])-(\d{4})(?:-(\d{1,2}))?$/);if(!m)return null;let s;try{s=sectorFromAddress(m[1],m[2])}catch(e){return null}
 return{s,i:+m[3]-1,spot:m[4]?+m[4]-1:null,key:m[1]+'-'+m[2]+'-'+m[3]}}
function zjRefresh(force){if(!ZH)return;const now=performance.now();if(!force&&now-zj.snapT<3500)return;zj.snapT=now;
 if(zj.peek)zj.snap=zj.peek.snap;else try{zj.snap=ZH.state()}catch(e){console.warn('[zones] état',e);return}
 zj.ws=zj.snap.worlds.map(w=>{const a=zjParseAddr(w.coord);return a?{...w,...a}:null}).filter(Boolean);
 for(const w of zj.ws){const o=tacSecData(w.s,true);const sp=w.spot==null?[0,0,0]:localSpotOffset(w.spot);w.p=[o.pos[w.i*3]+sp[0],o.pos[w.i*3+1]+sp[1],o.pos[w.i*3+2]+sp[2]];w.zone=zoneOfPoint(w.p)}
 if(!zj.ws.some(w=>w.id===zj.origin))zj.origin=(zj.ws[0]||{}).id||'home';
 try{zj.tr=zjTrBuild(zj.snap.travels)}catch(e){console.warn('[zones] missions',e);zj.tr=[]}
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
function zjPosOf(key){let p=zjPosCache.get(key);if(p===undefined){p=tacPosOfKey(key,true)||null;zjPosCache.set(key,p)}return p}
const zjMine=k=>zj.peek?(k==='home'?'Sa capitale':'Sa colonie'):(k==='home'?'Ma planète':'Ma colonie');
function zjObjects(){if(performance.now()-zj.objsT<1000&&zj.objs.length)return zj.objs;const out=[];
 for(const w of zj.ws)out.push({type:'world',id:'world:'+w.id,name:w.name,sub:zjMine(w.kind)+' · '+w.coord,key:w.key,p:w.p,w});
 const mig=zjMig();
 if(mig){for(const pt of zj.snap.ports||[]){const p=zjPosOf(pt.sys);if(!p)continue;const c=CARNET_ST.find(x=>x.key===pt.sys);out.push({type:'station',id:'st:'+pt.sys,name:pt.name||(c&&c.name)||pt.sys,sub:(pt.label||'Port franc')+' · '+pt.sys,key:pt.sys,p,port:pt})}}   // la connaissance se gagne : seuls les ports découverts dans la partie
 else for(const st of CARNET_ST){const p=zjPosOf(st.key);if(p)out.push({type:'station',id:'st:'+st.key,name:st.name,sub:'Port franc · '+st.key,key:st.key,p})}
 if(zj.snap)for(const g of zj.snap.sigs){const p=zjPosOf(g.system);if(!p)continue;out.push({type:'sig',id:'sig:'+g.id,name:zjSigName(g),sub:g.system,key:g.system,p,g})}
 if(mig){const tg=zj.snap.tags||{},taken=new Set(out.filter(o=>o.type!=='sig').map(o=>o.key));   // étape 1 : les systèmes balayés, avec leurs emplacements (règle du jeu)
  for(const k of zj.snap.systems||[]){if(taken.has(k.sys))continue;const p=zjPosOf(k.sys);if(!p)continue;taken.add(k.sys);out.push({type:'sys',id:'sys:'+k.sys,name:'Système '+k.sys,sub:(k.planets.length?k.planets.length+' emplacement'+(k.planets.length>1?'s':''):'balayé')+' · '+k.sys,key:k.sys,p,k,tag:tg[k.sys]||null})}
  // étape 2 : une balise posée sur un système qui n'est pas encore sur la carte y ajoute ce système
  // étape 3 : les commandants connus de la partie (mondes balayés, relations, alliance)
  const CM=new Map();for(const c of zj.snap.cmd||[]){if(!CM.has(c.sys))CM.set(c.sys,[]);CM.get(c.sys).push(c)}
  for(const[sys,L]of CM){if(taken.has(sys)||out.some(o=>o.key===sys&&o.type==='sys'))continue;if(out.some(o=>o.key===sys&&o.type!=='sig'))continue;const p=zjPosOf(sys);if(!p)continue;taken.add(sys);out.push({type:'sys',id:'sys:'+sys,name:'Système '+sys,sub:sys,key:sys,p,k:{sys,at:null,planets:[],unknown:true},tag:tg[sys]||null})}
  for(const o of out)if(o.type==='sys'&&CM.has(o.key)){o.cmd=CM.get(o.key);o.name=[...new Set(o.cmd.map(c=>c.pseudo))].join(' · ');o.sub='Commandant · '+o.key}
  const B=zj.snap.beacons;if(B)for(const b of [...B.list,...B.going]){if(taken.has(b.sys)||out.some(o=>o.key===b.sys))continue;const p=zjPosOf(b.sys);if(!p)continue;taken.add(b.sys);out.push({type:'sys',id:'sys:'+b.sys,name:'Système '+b.sys,sub:'balise · '+b.sys,key:b.sys,p,k:{sys:b.sys,at:null,planets:[],unknown:true},tag:tg[b.sys]||null})}}
 for(const o of out)o.zone=zoneOfPoint(o.p);zj.objs=out;zj.objsT=performance.now();return out}
function zjMissionPos(m){const w=zjWorld(m.world),z=zoneParse(m.zone);if(!w||!z)return null;const c=zoneCenter(z.q,z.r,z.k),now=Date.now(),f=Math.max(0,Math.min(1,(now-m.departedAt)/Math.max(1,m.arrivalAt-m.departedAt)));
 return[w.p[0]+(c[0]-w.p[0])*f,w.p[1]+(c[1]-w.p[1])*f,w.p[2]+(c[2]-w.p[2])*f]}

/* ── région de test : 30 zones, contenu fixé une seule fois (décision D9, proposée) ── */
const ZJ_KINDS={asteroides:{sigType:'mineral_dense',as:'moving'},cristal:{sigType:'mineral_dense',as:'moving'},epave:{sigType:'metallic_echo',as:'moving'},debris:{sigType:'metallic_echo',as:'moving'},
 cargo:{sigType:'metallic_echo',as:'moving'},sonde_ancienne:{sigType:'heat_point',as:'moving'},anomalie:{sigType:'unstable_field',as:'moving'},habitable:{sigType:'heat_point',as:'fixed',fixedClass:'habitable'}};
function zjRng(seed){let t=tacHstr(seed)>>>0;return()=>{t=(t+0x6d2b79f5)>>>0;let x=Math.imul(t^(t>>>15),1|t);x^=x+Math.imul(x^(x>>>7),61|x);return((x^(x>>>14))>>>0)/4294967296}}
function zjShuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function zjMakeRegion(chk){chk=chk||((key,kind)=>ZH.check(key,kind));const home=zjHome(),col=zj.ws.find(w=>w.kind==='colony');if(!home)return null;
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
 const place=(z,kind)=>{const ok=sysOf(z).filter(x=>{try{const v=chk(x.key,kind);return v.radar&&(kind!=='habitable'||v.habitable)}catch(e){return false}});return ok.length?ok[Math.floor(zjRng(seed+'|s|'+z.id)()*ok.length)]:null};
 const setC=(z,cat,kind,pick)=>{z.cat=cat;z.anchor=pick.key;z.content={cat,kind,sys:pick.key,...ZJ_KINDS[kind]}};
 const failed=[];
 for(const z of zones){const l=sysOf(z);z.n=l.length;z.anchor=(l[0]||{}).key||home.key;if(z.cat===R){z.content={cat:R};continue}const pick=place(z,z.kind);if(pick)setC(z,z.cat,z.kind,pick);else failed.push(z)}
 // un contenu sans système compatible (hors portée selon les règles du jeu) passe dans une zone vide qui en a un, sinon il est abandonné et noté
 for(const z of failed){const cat=z.cat,kind=z.kind;let moved=null;
  for(const c of zones){if(c.cat!==R||c.grp==='A0'||c.content.moved)continue;const pick=place(c,kind);if(pick){setC(c,cat,kind,pick);c.content.moved=z.id;moved=c;break}}
  z.cat=R;z.content={cat:R};notes.push(z.id+' : aucun système à portée pour « '+kind+' »'+(moved?', contenu déplacé en '+moved.id:', contenu abandonné'))}
 for(const z of zones){delete z.kind;delete z._sys}
 return{grid:TAC_GRID.version,seed,createdAt:Date.now(),home:home.coord,colony:col?col.coord:null,zones,notes}}

/* ── 12/11 : univers ouvert (compte migré). Une zone hors de l'ancienne région reçoit un contenu tiré de son seul identifiant
   (même zone, même tirage : l'univers est le même pour tous), dans les proportions de la région : rien 40 %, commun 40 %, choix 20 %.
   Il est posé sur un vrai système du volume ; un corps habitable seulement là où les règles du jeu ont un emplacement habitable. ── */
const zjOpenCache=new Map();
function zjZoneContent(id){if(zjOpenCache.has(id))return zjOpenCache.get(id);const z=zoneParse(id);if(!z)return null;const L=tacPrismSystems(z.q,z.r,z.k,true);if(!L)return null;
 const avoid=new Set([...zj.ws.map(w=>w.key),...CARNET_ST.map(x=>x.key)]),c=zoneCenter(z.q,z.r,z.k),d=x=>Math.hypot(x.p[0]-c[0],x.p[1]-c[1],x.p[2]-c[2]),l=L.filter(x=>!avoid.has(x.key)).sort((a,b)=>d(a)-d(b));
 const rng=zjRng('univers|'+TAC_GRID.version+'|'+id),r=rng(),r2=rng(),r3=rng(),anchor=(l[0]||L[0]||{}).key||null;let out={cat:'rien',anchor};
 if(r>=.4&&l.length){const commun=r<.8;let kind=commun?(r2<.5?'asteroides':r2<.75?'cristal':'epave'):(r2<.3?'habitable':['anomalie','debris','sonde_ancienne','cargo'][Math.min(3,Math.floor((r2-.3)/.7*4))]),cand=l;
  if(kind==='habitable'){cand=l.filter(x=>{try{return ZH.check(x.key,'habitable').habitable}catch(e){return false}});if(!cand.length){kind='debris';cand=l}}
  const pick=cand[Math.floor(r3*cand.length)];out={cat:commun?'commun':'choix',kind,sys:pick.key,anchor,...ZJ_KINDS[kind]}}
 zjOpenCache.set(id,out);return out}

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
 let bottom=innerHeight-12;if(s&&mobile)bottom=Math.min(bottom,s.top-8);const zm=r('zj-zoom');return{top,bottom,left:mobile?8:(s?s.right+8:8),right:zm?zm.left-8:innerWidth-8}}
const zjHomeK=()=>{const h=zjHome();return h?tacLayerOf(h.p[1]):0};
function zjCtxLabel(){const ws=zj.ws.filter(w=>tacLayerOf(w.p[1])===zj.k);if(ws.length)return'Au niveau de '+ws.map(w=>w.name).join(' et ');
 if(zj.sel&&zj.sel.type==='station'&&tacLayerOf(zj.sel.p[1])===zj.k)return'Au niveau de la station';
 const d=zj.k-zjHomeK(),h=zjHome();return(d>0?'Au-dessus':'Au-dessous')+' de '+(h?h.name:'ma planète')+' · '+Math.abs(d)+' couche'+(Math.abs(d)>1?'s':'')}

/* ══ DESSIN DE LA TACTIQUE ══ */
const zjSegD=(px,py,l)=>{const dx=l.x2-l.x1,dy=l.y2-l.y1,L=dx*dx+dy*dy||1,u=Math.max(0,Math.min(1,((px-l.x1)*dx+(py-l.y1)*dy)/L));return Math.hypot(l.x1+u*dx-px,l.y1+u*dy-py)};
function zjDraw(){const mig=zjMig();const c=zjCtx,W=innerWidth,H=innerHeight,inv=1/zj.upp,v=zjView(),[y0,y1]=tacLayerY(zj.k),hexPx=TAC_GRID.S*inv,ins=zjInsets(),hits=[],chips=[],lines=[],t=performance.now()/1000,now=Date.now();
 const sx=X=>(X-zj.cx)*inv+W/2,sy=Z=>(Z-zj.cz)*inv+H/2,mapOpen=ins.bottom-ins.top>=80;zj.anim=false;
 c.setTransform(zjDpr,0,0,zjDpr,0,0);c.clearRect(0,0,W,H);
 const need=zjNeedSectors(v),SS=SECTOR_SIZE,loadedAt=new Set();for(const s of need)if(tacSecs.has(keyOf(s)))loadedAt.add(s[0]*1e6+s[2]);
 const cellLoaded=(cx,cz)=>{for(let a=Math.floor((cx-TAC_R)/SS);a<=Math.floor((cx+TAC_R)/SS);a++)for(let b=Math.floor((cz-TAC_R)/SS);b<=Math.floor((cz+TAC_R)/SS);b++){if(Math.abs(a)>SECTOR_LIMIT||Math.abs(b)>SECTOR_LIMIT)continue;if(!loadedAt.has(a*1e6+b))return false}return true};
 // 1. zones visibles
 const rowH=TAC_GRID.S*TQ3/2,cells=[];
 for(let r=Math.floor((v.z0-TAC_R)/rowH)-1;r<=Math.ceil((v.z1+TAC_R)/rowH)+1;r++){const q0=Math.floor(v.x0/TAC_GRID.S-r/2)-1,q1=Math.ceil(v.x1/TAC_GRID.S-r/2)+1;
  for(let q=q0;q<=q1;q++){const[cx,cz]=tacCellCenter(q,r),X=sx(cx),Y=sy(cz);if(X<-hexPx||X>W+hexPx||Y<-hexPx||Y>H+hexPx)continue;const id=zoneId(q,r,zj.k),rg=zj.regionMap.get(id),st0=(rg||mig)?zjZoneState(id):null,reg=rg||(mig&&st0.st!=='todo'?{open:true}:null);
   cells.push({q,r,X,Y,cx,cz,id,reg,loaded:cellLoaded(cx,cz),st:reg?st0:null})}}
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
 // 5b. lecture d'une autre partie : zones où ce commandant connaît déjà des systèmes (ancienne prospection)
 if(zj.peek){const kn=cells.filter(e=>e.loaded&&zj.peek.explored.has(e.id));if(kn.length){c.beginPath();for(const e of kn)zjHexPath(c,e.X,e.Y,inv*.9);c.fillStyle='rgba(128,230,211,.13)';c.fill();c.strokeStyle='rgba(128,230,211,.5)';c.lineWidth=1;c.stroke();
  if(hexPx>=70){c.font='600 9px ui-monospace,SFMono-Regular,monospace';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#bff3e9';for(const e of kn){const n=zj.peek.explored.get(e.id);c.fillText(n+' CONNU'+(n>1?'S':''),e.X,e.Y+TAC_R*inv*.55)}}}}
 // 6. région de test : Non sondée (hachures), En mission (anneau), Sondée (plein + ✓) — motif, symbole et texte
 const reg=cells.filter(e=>e.reg&&e.loaded);
 if(reg.length){if(!mig){zjPatShift(zjHatch,(-zj.cx*inv)%12,(-zj.cz*inv)%12);c.beginPath();for(const e of reg)if(e.st.st==='todo')zjHexPath(c,e.X,e.Y,inv*.96);c.fillStyle=zjHatch;c.fill()}
  for(const e of reg){const st=e.st.st;c.beginPath();zjHexPath(c,e.X,e.Y,inv*.94);
   if(st==='todo'){if(mig)continue;c.strokeStyle='rgba(190,175,255,.55)';c.lineWidth=1.2;c.setLineDash([4,4]);c.stroke();c.setLineDash([])}
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
 const zjOrd=o=>o.type==='world'?0:o.type==='station'?1:o.type==='sig'?2:o.cmd?2.5:3;
 for(const o of zjObjects().slice().sort((a,b)=>zjOrd(a)-zjOrd(b))){if(!zjInSlice(o.p[1])){if(o.type==='world'||(zj.sel&&zj.sel.id===o.id))ind.push(o);continue}
  const X=sx(o.p[0]),Y=sy(o.p[2]);if(X<-30||X>W+30||Y<-30||Y>H+30)continue;
  if(o.type==='world'&&mig&&(zj.snap.incoming||[]).some(r=>zjRaidHits(r,o.w))){zj.anim=!zjReduce||zj.anim;const q=zjReduce?.5:(t*1.1)%1;c.strokeStyle='rgba(255,90,77,'+(.95-.7*q)+')';c.lineWidth=2;c.beginPath();c.arc(X,Y,10+12*q,0,6.283);c.stroke()}
  if(o.type==='world'){c.strokeStyle='#80e6d3';c.lineWidth=2;c.beginPath();c.arc(X,Y,8,0,6.283);c.stroke();c.fillStyle='#80e6d3';c.beginPath();c.arc(X,Y,3,0,6.283);c.fill();c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=zjMine(o.w.kind).toUpperCase()+' · '+o.name;if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
  else if(o.type==='station'){c.fillStyle='#0b0c1c';c.strokeStyle='#ffcf96';c.lineWidth=2;c.beginPath();c.arc(X,Y,7,0,6.283);c.fill();c.stroke();c.fillStyle='#ffcf96';c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=o.name.toUpperCase();if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
  else if(o.type==='sys'&&o.cmd){const col=zjCmdCol(o.cmd);c.fillStyle='#0b0c1c';c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.arc(X,Y,6.5,0,6.283);c.fill();c.stroke();c.fillStyle=col;c.beginPath();c.arc(X,Y,2.2,0,6.283);c.fill();
   c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=o.name.toUpperCase();if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
  else if(o.type==='sys'){const col=o.tag==='star'?'#ffc864':o.tag==='skip'?'rgba(255,106,90,.8)':'rgba(214,224,242,.9)';c.fillStyle='#0b0c1c';c.fillRect(X-4,Y-4,8,8);c.strokeStyle=col;c.lineWidth=1.4;c.strokeRect(X-3.5,Y-3.5,7,7);
   if(o.tag==='star'){c.fillStyle=col;c.fillRect(X-1.5,Y-1.5,3,3)}if(hexPx>=70||(zj.sel&&zj.sel.id===o.id)){c.fillStyle=col;c.font='500 9px ui-monospace,SFMono-Regular,monospace';c.textAlign='left';c.textBaseline='middle';if(labOk(X+9,Y,c.measureText(o.key).width))c.fillText(o.key,X+9,Y)}}
  else{const g=o.g,d=7;c.beginPath();c.moveTo(X,Y-d);c.lineTo(X+d,Y);c.lineTo(X,Y+d);c.lineTo(X-d,Y);c.closePath();c.fillStyle='#0b0c1c';c.fill();
   c.strokeStyle=!g.resolved?'#f2f0ff':g.resolvedType==='moving'?'#ffc864':g.fixedAddress?'#9fe0a0':'#b29aff';c.lineWidth=1.8;c.stroke();if(!g.resolved){c.fillStyle='#f2f0ff';c.font='700 9px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('?',X,Y+.5)}
   if(hexPx>=60){c.fillStyle='#ece8ff';c.font='10px system-ui';c.textAlign='left';c.textBaseline='middle';if(labOk(X+11,Y,c.measureText(o.name).width))c.fillText(o.name,X+11,Y)}}
  if(mig&&zj.snap.beacons){const bc=zjBc(o.key);if(bc&&(bc.here||bc.going)){c.save();c.strokeStyle='#c4a8ff';c.lineWidth=1.6;if(bc.going)c.setLineDash([3,3]);c.beginPath();c.arc(X,Y,13,0,6.283);c.stroke();c.restore()}}
  hits.push({x:X,y:Y,o})}
 // 9a. réseau de corridors candidat (prévisualisation d'essai, GDD navigation § 9)
 zjCorDrawTac(c,sx,sy,y0,y1,lines);
 // 9b. missions suivables : tracé projeté de la mission choisie (parcouru plein, restant en tirets), repère orienté touchable
 {const now=Date.now(),selTr=zj.sel&&zj.sel.type==='travel'?zj.sel.id:null;
  for(const tr of zj.tr){if(!tr.ok)continue;const st=zjTrState(tr,now),isSel=tr.id===selTr;
   if(isSel&&tr.pts.length>1){const P=tr.pts,cut=st.along*tr.L;c.save();c.lineWidth=2;c.strokeStyle='rgba(159,211,255,.55)';c.setLineDash([6,5]);c.beginPath();P.forEach((q,j)=>j?c.lineTo(sx(q[0]),sy(q[2])):c.moveTo(sx(q[0]),sy(q[2])));c.stroke();c.setLineDash([]);
    c.strokeStyle='#d7ecff';c.beginPath();if(st.phase==='back'){c.moveTo(sx(P[P.length-1][0]),sy(P[P.length-1][2]))}else{c.moveTo(sx(P[0][0]),sy(P[0][2]));for(let j=1;j<P.length&&tr.cum[j]<=cut;j++)c.lineTo(sx(P[j][0]),sy(P[j][2]))}c.lineTo(sx(st.p[0]),sy(st.p[2]));c.stroke();
    for(const q of P.slice(1,-1)){const X=sx(q[0]),Y=sy(q[2]);c.strokeStyle='#9fd3ff';c.lineWidth=1.4;c.strokeRect(X-3,Y-3,6,6)}c.restore();
    for(let j=1;j<P.length;j++)lines.push({x1:sx(P[j-1][0]),y1:sy(P[j-1][2]),x2:sx(P[j][0]),y2:sy(P[j][2]),o:{type:'travel',id:tr.id}})}
   const o={type:'travel',id:tr.id,name:tr.name,p:st.p};if(!zjInSlice(st.p[1])){if(isSel)ind.push(o);continue}
   const X=sx(st.p[0]),Y=sy(st.p[2]);if(X<-30||X>W+30||Y<-30||Y>H+30)continue;const a=Math.atan2(st.dir?st.dir[2]:1,st.dir?st.dir[0]:0);
   c.save();c.translate(X,Y);c.rotate(a);c.beginPath();c.moveTo(9,0);c.lineTo(-6,6);c.lineTo(-3,0);c.lineTo(-6,-6);c.closePath();c.fillStyle=isSel?'#ffffff':tr.hostile?'#ff6a5a':'#9fd3ff';c.fill();c.restore();
   if(isSel||hexPx>=40||tr.hostile){c.fillStyle=tr.hostile?'#ffb0a8':'#cfe9ff';c.font='600 10px system-ui';c.textAlign='left';c.textBaseline='middle';const t=tr.name.toUpperCase()+' · '+(ZJ_TR_KIND[tr.kind]||'');if(labOk(X+12,Y,c.measureText(t).width))c.fillText(t,X+12,Y)}
   hits.push({x:X,y:Y,o})}}
 // 9. Radars en vol (position issue des horodatages)
 if(zj.snap)for(const m of zj.snap.missions){if(zj.tr.some(t=>t.ok&&t.id==='pr:'+m.id))continue;const p=zjMissionPos(m);if(!p||!zjInSlice(p[1]))continue;const X=sx(p[0]),Y=sy(p[2]);if(X<-10||X>W+10||Y<-10||Y>H+10)continue;zj.anim=!zjReduce||zj.anim;
  c.fillStyle='#e6f0ff';c.beginPath();c.moveTo(X,Y-6);c.lineTo(X+5,Y+4);c.lineTo(X-5,Y+4);c.closePath();c.fill()}
 // 10. halo de l'objet sélectionné
 if(zj.sel&&zj.sel.p&&zj.sel.type!=='zone'&&zjInSlice(zj.sel.p[1])){const X=sx(zj.sel.p[0]),Y=sy(zj.sel.p[2]);c.strokeStyle='#fff';c.lineWidth=1.6;c.beginPath();c.arc(X,Y,14,0,6.283);c.stroke();c.strokeStyle='rgba(255,255,255,.3)';c.beginPath();c.arc(X,Y,21,0,6.283);c.stroke()}
 // 11. indicateurs des lieux importants hors tranche (cadrage explicite vers leur profondeur)
 const placed=[];if(mapOpen)for(const o of ind){const dk=tacLayerOf(o.p[1])-zj.k,lab=(o.type==='world'?zjMine(o.w.kind)+' ':'Sélection · ')+o.name+' · '+(dk>0?'au-dessus':'au-dessous');
  let X=sx(o.p[0]),Y=sy(o.p[2]);const inside=X>ins.left+10&&X<ins.right-10&&Y>ins.top+10&&Y<ins.bottom-10;c.font='600 10px system-ui';const tw=c.measureText(lab).width+(inside?16:30),bh=30;
  let bx=inside?X+14:Math.min(Math.max(X-tw/2,ins.left+4),ins.right-tw-4),by=inside?Y-bh/2:Math.min(Math.max(Y-bh/2,ins.top+4),ins.bottom-bh-4);
  for(let g=0;g<8&&placed.some(r=>bx<r[0]+r[2]&&bx+tw>r[0]&&by<r[1]+r[3]+4&&by+bh+4>r[1]);g++)by=by+bh+6>ins.bottom-bh?by-(bh+6)*(g+1):by+bh+6;placed.push([bx,by,tw,bh]);
  if(inside){c.setLineDash([3,3]);c.strokeStyle='#80e6d3';c.lineWidth=1.3;c.beginPath();c.arc(X,Y,9,0,6.283);c.stroke();c.setLineDash([])}
  c.fillStyle='rgba(12,12,29,.94)';c.strokeStyle='#80e6d3';c.lineWidth=1;c.beginPath();c.roundRect?c.roundRect(bx,by,tw,bh,8):c.rect(bx,by,tw,bh);c.fill();c.stroke();c.fillStyle='#bff3e9';c.textAlign='left';c.textBaseline='middle';
  c.fillText((inside?'':(X<ins.left+10?'← ':X>ins.right-10?'→ ':Y<ins.top+10?'↑ ':'↓ '))+lab,bx+8,by+bh/2);chips.push({x:bx,y:by-7,w:tw,h:bh+14,o})}
 zj.hits=hits;zj.chips=chips;zj.lines=lines;zj.lastDraw=performance.now();zj.dirty=false;zjDepthUI()}

/* ── toucher : objet important d'abord, sinon la zone ; un pincement ne produit jamais de toucher ── */
function zjPick(px,py){for(const ch of zj.chips)if(px>=ch.x&&px<=ch.x+ch.w&&py>=ch.y&&py<=ch.y+ch.h)return{chip:ch};
 const near=zj.hits.map(h=>({h,d:Math.hypot(h.x-px,h.y-py)})).filter(a=>a.d<=22).sort((a,b)=>a.d-b.d);return{list:near}}
function zjTap(px,py){const r=zjPick(px,py);
 if(r.chip){zjFocus(r.chip.o);return}
 const l=r.list;if(l.length){const close=l.filter(a=>a.d<=l[0].d+10);if(close.length===1)return zjSelectObj(close[0].h.o);zj.list=close.map(a=>a.h.o);zjOpen('choix');return}
 const ln=(zj.lines||[]).map(l=>({l,d:zjSegD(px,py,l)})).filter(a=>a.d<=12).sort((a,b)=>a.d-b.d)[0];   // un tracé touché : la mission ou le tronçon, pas la zone dessous
 if(ln){if(ln.l.o.type==='travel')return zjSelectTravel(ln.l.o.id);if(ln.l.o.type==='seg')return zjSelectSeg(ln.l.o.id)}
 const[wx,wz]=zjW(px,py),[q,rr]=tacCellOf(wx,wz);zjSelectZone(zoneId(q,rr,zj.k))}
function zjCenterOn(p,force){if(zj.mode!=='tac')return;const ins=zjInsets(),W=innerWidth,H=innerHeight,X=(p[0]-zj.cx)/zj.upp+W/2,Y=(p[2]-zj.cz)/zj.upp+H/2,pad=Math.min(60,TAC_R/zj.upp);
 if(!force&&X>ins.left+pad&&X<ins.right-pad&&Y>ins.top+pad&&Y<ins.bottom-pad)return;const tx=(ins.left+ins.right)/2,ty=(ins.top+ins.bottom)/2;zj.cx=p[0]-(tx-W/2)*zj.upp;zj.cz=p[2]-(ty-H/2)*zj.upp;zj.dirty=true}
function zjSelectZone(id,fromCode){zj.follow=null;zjTrObsDispose();zj.sel={type:'zone',zone:id};if(zj.mode==='atlas'){zjObsDispose();zj.pres.level='zone';zj.pres.zone=id;zj.pres.hold=false}const z=zoneParse(id);zj.sel.p=zoneCenter(z.q,z.r,z.k);if(zj.mode==='tac'&&z.k!==zj.k)zj.k=z.k;zj.dirty=true;zjMarkAtlasSel();zjOpen('zone');
 if(zj.mode==='tac')zjCenterOn(zj.sel.p,false);else if(fromCode)flyTo(vector(zj.sel.p),Math.max(420,Math.min(1400,distance)))}
function zjSelectObj(o){if(o&&o.type==='travel')return zjSelectTravel(o.id);zj.follow=null;zjTrObsDispose();zj.sel={type:o.type,id:o.id,p:o.p,zone:o.zone,name:o.name,key:o.key};zj.dirty=true;zjMarkAtlasSel();zjOpen('obj');if(zj.mode==='atlas'){if(o.type==='sys'){zjObsDispose();zj.pres.level='zone';zj.pres.zone=o.zone;flyTo(vector(o.p),Math.max(260,Math.min(900,distance)))}else zjObserve(o)}else zjCenterOn(o.p,false)}
function zjFocus(o){zj.k=tacLayerOf(o.p[1]);zjSelectObj(o);zjCenterOn(o.p,true)}

/* ── gestes de la tactique ── */
const zjPtr=new Map();let zjG=null;
zjCv.addEventListener('pointerdown',e=>{zjCv.setPointerCapture(e.pointerId);zjPtr.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(zjPtr.size===1)zjG={x:e.clientX,y:e.clientY,t:performance.now(),moved:false,multi:false};
 else if(zjPtr.size===2&&zjG){zjG.multi=true;const a=[...zjPtr.values()];zjG.pd=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1;zjG.pm=[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2]}});
zjCv.addEventListener('pointermove',e=>{if(!zjPtr.has(e.pointerId)||!zjG)return;const prev=zjPtr.get(e.pointerId);zjPtr.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(zjPtr.size>=2){const a=[...zjPtr.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,m=[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2],[wx,wz]=zjW(zjG.pm[0],zjG.pm[1]);
  zj.upp=Math.max(ZJ_UPP[0],Math.min(ZJ_UPP[1],zj.upp*zjG.pd/d));zj.cx=wx-(m[0]-innerWidth/2)*zj.upp;zj.cz=wz-(m[1]-innerHeight/2)*zj.upp;zjG.pd=d;zjG.pm=m;zjG.moved=true;zj.dirty=true;return}
 if(Math.hypot(e.clientX-zjG.x,e.clientY-zjG.y)>7)zjG.moved=true;if(!zjG.moved)return;zjOnPan();
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
 // 1. filtre de contexte selon la présentation, 2. regroupement et budget de libellés (§ 7.5)
 const w=innerWidth,h=innerHeight,L=zj.pres.level,selId=zj.sel&&zj.sel.type!=='zone'?zj.sel.id:null,close=L==='object'||L==='system'||L==='travel',pts=[];
 let pool=zjObjects().filter(o=>o.type!=='sys'||o.cmd||o.id===selId||(L==='zone'&&o.zone===zj.pres.zone));
 if(L==='object'||L==='travel')pool=pool.filter(o=>o.id===selId);
 else if(L==='system')pool=pool.filter(o=>o.id===selId||(zjObs&&o.key===zjObs.key));
 else if(L==='zone')pool=pool.filter(o=>o.zone===zj.pres.zone||o.type==='world');
 const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
 const ins=zjInsets();
 for(const o of pool){const v=new T.Vector3(o.p[0],o.p[1],o.p[2]),q=toLocal(v).project(camera),dist=v.distanceTo(target);
  if(!(q.z>-1&&q.z<1&&Math.abs(q.x)<1.05&&Math.abs(q.y)<1.05))continue;
  {const sx=(q.x*.5+.5)*w,sy=(-q.y*.5+.5)*h;if(o.id!==selId&&(sy<ins.top-4||sy>ins.bottom+4||sx>ins.right+20||sx<ins.left-20))continue}
  if(L==='neighbourhood'&&dist>(o.type==='world'||o.id===selId?9000:3200))continue;
  const pt={o,x:(q.x*.5+.5)*w,y:(-q.y*.5+.5)*h,sel:o.id===selId,dim:L==='zone'&&o.zone!==zj.pres.zone};
  // en gros plan, le nom se place sous le modèle (un seul libellé, nom et adresse complète)
  if(close&&zjObs&&(o.id===zjObs.id||zjObs.others.some(a=>a.id===o.id))){const R=o.id===zjObs.id?zjObs.R:ZJ_OBJ_R.world*.9,e=toLocal(v.clone().addScaledVector(right,R)).project(camera),rp=Math.abs((e.x-q.x)*.5*w);pt.y+=rp+14;pt.solo=true}
  pts.push(pt)}
 if(L==='system'&&zjObs&&zjObs.star){const v=vector(zjObs.anchor),q=toLocal(v).project(camera);if(q.z>-1&&q.z<1){const sx=(q.x*.5+.5)*w,sy=(-q.y*.5+.5)*h;let n=0;
  if(zjObs.star.visible)pts.push({o:{type:'star',id:'star:'+zjObs.key,name:'Étoile · '+zjObs.key},x:sx,y:sy+26,solo:true,decor:true}),n++;
  for(const p of pts)if(!p.solo&&p.o.id!==selId&&Math.hypot(p.o.p[0]-zjObs.anchor[0],p.o.p[1]-zjObs.anchor[1],p.o.p[2]-zjObs.anchor[2])<.5){p.x=sx;p.y=sy+26+n*30;p.solo=true;n++}}}
 const sp=pts.find(p=>p.sel);if(sp&&!close)for(const p of pts)if(p!==sp&&!p.solo&&Math.hypot(p.x-sp.x,p.y-sp.y)<30)p.hide=true;
 for(let i=pts.length-1;i>=0;i--)if(pts[i].hide)pts.splice(i,1);
 // missions : la sélectionnée (nom sous le modèle) ; au voisinage, les autres comme repères de priorité « missions »
 {const now=Date.now(),selTr=zj.sel&&zj.sel.type==='travel'?zj.sel.id:null;
  for(const tr of zj.tr){if(!tr.ok)continue;if(L==='travel'?tr.id!==selTr:L!=='neighbourhood')continue;const st=zjTrState(tr,now),v=new T.Vector3(st.p[0],st.p[1],st.p[2]),q=toLocal(v).project(camera);if(!(q.z>-1&&q.z<1&&Math.abs(q.x)<1.05&&Math.abs(q.y)<1.05))continue;
   const pt={o:{type:'travel',id:tr.id,name:tr.name+' · '+(ZJ_TR_KIND[tr.kind]||'').toLowerCase(),p:st.p,tr},x:(q.x*.5+.5)*w,y:(-q.y*.5+.5)*h,sel:tr.id===selTr};
   if(pt.sel&&zjTrObs){const r=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),e=toLocal(v.clone().addScaledVector(r,1.1)).project(camera);pt.y+=Math.max(14,Math.abs((e.x-q.x)*.5*w)+12);pt.solo=true}
   pts.push(pt);
   if(pt.sel)for(const [lab,q3] of [['Départ · ',tr.pts[0]],['Vers · ',tr.pts[tr.pts.length-1]]]){const qq=toLocal(vector(q3)).project(camera);if(qq.z>-1&&qq.z<1&&Math.abs(qq.x)<1&&Math.abs(qq.y)<1)pts.push({o:{type:'star',id:'tr:'+lab+tr.id,name:lab+(lab[0]==='D'?(zj.ws.find(x=>x.coord===tr.from)||{}).name||tr.from:(tr.toLabel||tr.to))},x:(qq.x*.5+.5)*w,y:(-qq.y*.5+.5)*h+16,solo:true,decor:true})}}}
 const rank=p=>p.sel?0:p.o.type==='world'?1:p.o.type==='station'?2:p.o.type==='travel'?3:p.o.type==='star'?4:5;pts.sort((a,b)=>rank(a)-rank(b));
 // la cible sélectionnée n'est jamais absorbée dans un groupe « n lieux »
 const groups=[];for(const p of pts){const g=!p.sel&&!p.solo&&groups.find(g=>!g.sel&&!g.solo&&Math.hypot(g.x-p.x,g.y-p.y)<28);if(g)g.items.push(p.o);else groups.push({x:p.x,y:p.y,items:[p.o],sel:p.sel,solo:p.solo,dim:p.dim,decor:p.decor})}
 const budget=L==='object'?1:L==='travel'?3:L==='system'?4:L==='zone'?6:(mobile?8:14);let named=0;const placed=[];
 const keep=new Set();
 for(const g of groups){const o=g.items[0],many=g.items.length>1,lab=g.sel||named<budget;if(lab)named++;
  const key=L+'|'+(g.solo?'s|':'')+g.items.map(o=>o.id).sort().join('|');keep.add(key);let el=zjMarkEls.get(key);
  if(!el){el=document.createElement('button');el.className='zj-mark';el.classList.add('t-'+(many?'many':o.type==='sys'&&o.cmd?'cmd':o.type));if(!many&&o.type==='travel'&&o.tr&&o.tr.hostile)el.classList.add('hostile');if(g.solo)el.classList.add('solo');if(g.decor){el.classList.add('decor');el.tabIndex=-1}
   const full=g.solo&&o.type!=='star'?(o.type==='world'?o.w.coord:o.type==='travel'?(o.tr.to?'vers '+o.tr.to:''):o.key):'';
   el.innerHTML='<i></i><b>'+zjEsc(many?g.items.length+' lieux':(o.type==='world'&&!g.solo?zjMine(o.w.kind)+' · '+o.name:o.name))+(full?' <small>· '+zjEsc(full)+'</small>':'')+'</b>';
   if(!g.decor){el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('pointerup',e=>e.stopPropagation());
    el.addEventListener('click',e=>{e.stopPropagation();if(g.items.length>1){zj.list=g.items.slice();zjOpen('choix')}else if(zj.sel&&zj.sel.id===g.items[0].id)zjOpen(g.items[0].type==='travel'?'travel':'obj');else zjSelectObj(g.items[0])})}
   zjMarks.appendChild(el);zjMarkEls.set(key,el)}
  el.classList.toggle('nolab',!lab);el.classList.toggle('dim',!!g.dim);
  const wd=el.offsetWidth||0;let x=g.x;
  if(g.solo){x=Math.max(8,Math.min(innerWidth-70-wd,g.x-wd/2));el.classList.remove('left');const ht=el.offsetHeight||30;
   for(let k=0;k<6;k++){const hit=placed.find(r=>x<r.x+r.w+4&&x+wd+4>r.x&&g.y<r.y+r.h+3&&g.y+ht+3>r.y);if(!hit)break;g.y=hit.y+hit.h+4}placed.push({x,y:g.y,w:wd,h:ht})}
  else{const roomR=innerWidth-62-(g.x-22),roomL=g.x+22-4,left=wd>roomR&&roomL>roomR;el.classList.toggle('left',left);if(left)x=g.x-wd+44}
  el.style.transform='translate('+Math.round(x)+'px,'+Math.round(g.y)+'px)';el.classList.toggle('sel',!!g.sel)}
 for(const[k,el]of zjMarkEls)if(!keep.has(k)){el.remove();zjMarkEls.delete(k)}}
function zjMarkAtlasSel(){if(zjZoneMesh){scene.remove(zjZoneMesh);disposeObject(zjZoneMesh);zjZoneMesh=null}
 const id=zj.sel&&zj.sel.type==='zone'&&zj.sel.zone;const z=id&&zoneParse(id);if(!z)return;const[cx,cz]=tacCellCenter(z.q,z.r),[a,b]=tacLayerY(z.k),pts=[];
 for(let i=0;i<6;i++){const p0=ZJ_HEX[i],p1=ZJ_HEX[(i+1)%6];for(const y of [a,b])pts.push(cx+p0[0],y,cz+p0[1],cx+p1[0],y,cz+p1[1]);pts.push(cx+p0[0],a,cz+p0[1],cx+p0[0],b,cz+p0[1])}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
 zjZoneMesh=new T.LineSegments(g,new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.85,depthWrite:false}));zjZoneMesh.userData.global=true;zjZoneMesh.renderOrder=5;scene.add(zjZoneMesh)}
function zjAtlasTap(x,y){const L=zj.pres.level;
 if(L==='travel'){if(zjTrObs&&x!=null){raycaster.setFromCamera(new T.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),camera);if(raycaster.intersectObject(zjTrObs.veh,true).length)zjOpen('travel')}return}
 if(zjObs&&x!=null&&(L==='object'||L==='system')){raycaster.setFromCamera(new T.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),camera);const h=raycaster.intersectObjects(zjObs.pick,true)[0];
  if(h){let m=h.object;while(m&&!m.userData.zjId)m=m.parent;const id=m&&m.userData.zjId;if(id===zjObs.id)return zjOpen('obj');const o=id&&zjObjects().find(a=>a.id===id);if(o)return zjSelectObj(o)}}
 if(L==='object'||L==='system')return;   // gros plan : le vide ne change pas l'objet regardé
 // 12/11 (Adrien) : « quand je touche dans le vide ça devrait sélectionner quelque chose quand même » : la zone sous le doigt,
 // comme en Tactique. Les repères (mondes, ports, commandants, missions) passent avant : ce sont des boutons au-dessus de la carte.
 const id=zjAtlasZoneAt(x,y);if(id)return zjSelectZone(id);
 if(zj.sel){zj.sel=null;zjMarkAtlasSel();zj.dirty=true;zjOpen('home')}}
// la zone sous le doigt : celle de l'étoile touchée (la plus proche le long du regard), sinon le point du plan horizontal du centre de vue
function zjAtlasZoneAt(x,y){if(x==null)return null;raycaster.setFromCamera(new T.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),camera);
 raycaster.params.Points.threshold=Math.max(2,Math.min(30,distance*.007));let p=null;
 try{const hit=raycaster.intersectObjects([...sectors.values()])[0];if(hit){const s=hit.object.userData.sector,v=s&&getPoint(s,hit.index);if(v)p=[v.x,v.y,v.z]}}catch(e){}
 if(!p){const pl=new T.Plane(new T.Vector3(0,1,0),-(target.y-origin.y)),o=new T.Vector3();if(raycaster.ray.intersectPlane(pl,o)){o.add(origin);p=[o.x,o.y,o.z]}}
 return p?zoneOfPoint(p):null}

/* ══ OBSERVER (cahier « Observer une planète, son système et son voisinage », 11 nov.) ══
   Deux états distincts : ce qui est sélectionné (zj.sel) et la façon de le présenter dans l'Atlas (zj.pres).
   Monde, port ou signature : gros plan de l'objet (Objet) ; au dézoom, son système (Système), puis le Voisinage.
   Une zone : son volume. Le modèle 3D est une présentation : il ne déplace rien dans les données, ne change ni
   l'origine des sondages ni les distances de jeu, et son apparence est un aperçu générique stable (graine = adresse). */
const ZJ_OBJ_R={world:1.2,station:1.15,sig:.75};
zj.pres={level:'neighbourhood',zone:null,back:null,hold:false};
let zjObs=null;const zjTexCache=new Map();
function zjHashStr(t){let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function zjGenericTex(seed){const r=randomOf(seed%2147483647||1),c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d'),img=x.createImageData(256,128),ox=r()*90+3,oy=r()*90+7,oz=r()*90+11;
 for(let y=0;y<128;y++)for(let i=0;i<256;i++){const a=i/256*Math.PI*2,b=y/128*Math.PI,sy=Math.cos(b),sx=Math.sin(b)*Math.cos(a),sz=Math.sin(b)*Math.sin(a),n=fbm3(sx*2.4+ox,sy*2.4+oy,sz*2.4+oz),v=70+n*78,j=(y*256+i)*4;
  img.data[j]=v*.86;img.data[j+1]=v*.9;img.data[j+2]=v*1.07;img.data[j+3]=255}
 x.putImageData(img,0,0);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return t}
function zjTex(seed){let t=zjTexCache.get(seed);if(t){zjTexCache.delete(seed);zjTexCache.set(seed,t);return t}t=zjGenericTex(seed);zjTexCache.set(seed,t);return t}
function zjTexTrim(){const use=zjObs?zjObs.tex:new Set();for(const k of [...zjTexCache.keys()]){if(zjTexCache.size<=8)break;if(!use.has(k)){zjTexCache.get(k).dispose();zjTexCache.delete(k)}}}
// ancre globale du système (position commune) ; la position de l'objet en vient, décalée de son spot s'il en a un
function zjObjAnchor(o){if(o.type==='world'){const d=tacSecData(o.w.s,true);return[d.pos[o.w.i*3],d.pos[o.w.i*3+1],d.pos[o.w.i*3+2]]}return o.p.slice()}
// distance de caméra pour qu'une sphère de rayon R occupe la fraction f de la largeur utile (§ 9.1)
function zjFrameDist(R,f){const ins=zjInsets(),tv=Math.tan(camera.fov*Math.PI/360),th=tv*innerWidth/innerHeight,rw=Math.max(.2,(ins.right-ins.left)/innerWidth),rh=Math.max(.2,(ins.bottom-ins.top)/innerHeight);
 const a=Math.min(Math.atan(f*rw*th),Math.atan(Math.min(.8,f*1.5)*rh*tv));return R/Math.sin(a)}
function zjPlanetMesh(w,R,tex){const k=zjHashStr(w.coord);tex.add(k);const mat=new T.MeshStandardMaterial({map:zjTex(k),roughness:.9,metalness:0});mat.userData.shared=true;
 const m=new T.Mesh(new T.SphereGeometry(R,40,28),mat);m.add(new T.Mesh(new T.SphereGeometry(R*1.07,28,18),new T.MeshBasicMaterial({color:0xaab4dd,transparent:true,opacity:.07,side:T.BackSide,blending:T.AdditiveBlending,depthWrite:false})));return m}
function zjDisposeTree(o){if(o.userData&&o.userData.zjModel)return;for(const c of o.children)zjDisposeTree(c);if(o.geometry)o.geometry.dispose();if(o.material)for(const m of [].concat(o.material)){if(m.map&&!m.userData.shared)m.map.dispose();m.dispose()}}
function zjObsDispose(){if(!zjObs)return;scene.remove(zjObs.group);zjDisposeTree(zjObs.group);zjObs=null}
function zjObsBuild(o){zjObsDispose();const anchor=zjObjAnchor(o),R=ZJ_OBJ_R[o.type]||1,g=new T.Group(),rel=p=>[p[0]-anchor[0],p[1]-anchor[1],p[2]-anchor[2]],tex=new Set(),pick=[],others=[];
 g.add(new T.AmbientLight(0xa9b6ee,.17));const sun=new T.PointLight(0xffe2c4,2.1,0,0);g.add(sun);
 const atAnchor=Math.hypot(...rel(o.p))<4;let star=null;
 if(!atAnchor){star=new T.Mesh(new T.SphereGeometry(1.25,28,18),new T.MeshBasicMaterial({color:0xffd9aa,transparent:true,opacity:0}));star.add(new T.Mesh(new T.SphereGeometry(1.9,24,16),new T.MeshBasicMaterial({color:0xffc09b,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false})));star.visible=false;g.add(star)}
 else sun.position.set(-9,6,7);   // rattaché au système sans spot : lumière de présentation, aucun spot inventé
 let main;
 if(o.type==='world')main=zjPlanetMesh(o.w,R,tex);
 else if(o.type==='station'){main=new T.Group();const mat=new T.MeshStandardMaterial({color:0xffcf96,roughness:.5,metalness:.4});main.add(new T.Mesh(new T.TorusGeometry(R,R*.16,12,44),mat));const core=new T.Mesh(new T.CylinderGeometry(R*.22,R*.22,R*1.6,16),mat.clone());core.rotation.x=Math.PI/2;main.add(core);main.rotation.x=.9}
 else{main=new T.Mesh(new T.OctahedronGeometry(R,0),new T.MeshBasicMaterial({color:0xf2f0ff,wireframe:true}));main.add(new T.Mesh(new T.SphereGeometry(R*1.45,20,14),new T.MeshBasicMaterial({color:0xb29aff,transparent:true,opacity:.07,blending:T.AdditiveBlending,depthWrite:false})))}
 main.position.set(...rel(o.p));main.userData.zjId=o.id;g.add(main);pick.push(main);
 // autres objets connus du même système (même identifiant de système, pas un rayon) : visibles au niveau Système
 const local=zjObjects().filter(x=>x.id!==o.id&&x.key===o.key);
 for(const x of local)if(x.type==='world'){const m=zjPlanetMesh(x.w,ZJ_OBJ_R.world*.9,tex);m.position.set(...rel(x.p));m.userData.zjId=x.id;m.visible=false;g.add(m);pick.push(m);others.push({id:x.id,mesh:m})}
 scene.add(g);const sysR=Math.max(6,...[o,...local].map(x=>Math.hypot(...rel(x.p))))+3;
 zjObs={id:o.id,type:o.type,key:o.key,addr:o.type==='world'?o.w.coord:o.key,group:g,anchor,p:o.p.slice(),R,star,main,others,pick,sysR,tex,dObj:0,dSys:0,built:performance.now()};
 zjObsDistances();zjTexTrim();zjObsModel();return zjObs}
/* ─── Modèles du jeu (cahier v1.2 § 24.1) ───
   Le catalogue vient du jeu (parent.SBZones.models : STATION_UI + mpDockSystem pour les stations, Formation3D pour les
   vaisseaux) : la page n'en tient aucune liste. Chargement à la demande (GLTFLoader r128 + décodeur meshopt du jeu),
   instances qui partagent géométries et matériaux, au plus 6 modèles gardés. En attente, en échec ou dans un fichier
   exporté, le substitut générique reste en place avec le nom, l'adresse et le type connus. */
const zjM={cat:undefined,lib:null,cache:new Map(),env:null,loads:0,fails:0};
function zjCat(){if(zjM.cat!==undefined)return zjM.cat;let c=null;try{c=ZH&&!ZH.embed&&ZH.models?ZH.models():null}catch(e){c=null}
 zjM.cat=c&&((c.stations&&c.stations.length)||(c.ships&&Object.keys(c.ships).length))?c:null;return zjM.cat}
function zjStModel(key){const c=zjCat();return c&&c.stations.find(x=>x.sys===key)||null}
function zjLib(){if(zjM.lib)return zjM.lib;const c=zjCat();if(!c)return Promise.reject(new Error('catalogue du jeu absent'));
 const p=new Promise((ok,ko)=>{if(T.GLTFLoader)return ok();const sc=document.createElement('script');sc.src='vendor/gltf_r128.js?v=r128a';sc.onload=()=>ok();sc.onerror=()=>ko(new Error('chargeur indisponible'));document.head.appendChild(sc)})
  .then(()=>import(c.meshopt).then(m=>m.MeshoptDecoder,()=>null))
  .then(dec=>{if(!T.GLTFLoader)throw new Error('chargeur indisponible');const L=new T.GLTFLoader();if(dec)L.setMeshoptDecoder(dec);
   if(!zjM.env)try{const pm=new T.PMREMGenerator(renderer);zjM.env=pm.fromScene(new T.RoomEnvironment(),.04).texture;pm.dispose()}catch(e){zjM.env=null}   // reflets pour les métaux, sur ces modèles seulement
   return L});
 zjM.lib=p;p.catch(()=>{if(zjM.lib===p)zjM.lib=null});return p}
// matériaux : intensité émissive du modèle (KHR_materials_emissive_strength, lue dans le fichier), reflets ; gabarit mesuré
function zjPrepModel(g){const root=g.scene,json=g.parser&&g.parser.json||{},es={};
 for(const m of json.materials||[]){const x=m.extensions&&m.extensions.KHR_materials_emissive_strength;if(x&&m.name)es[m.name]=x.emissiveStrength}
 root.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=true;for(const m of [].concat(o.material)){if(!m)continue;if(es[m.name]!=null)m.emissiveIntensity=Math.min(4,es[m.name]);if(zjM.env&&m.isMeshStandardMaterial){m.envMap=zjM.env;m.envMapIntensity=.55}}});
 root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root),c=b.getCenter(new T.Vector3()),z=b.getSize(new T.Vector3());
 root.userData.zjBox={c,z,r:z.length()/2};return root}
function zjModel(url){let e=zjM.cache.get(url);if(e){zjM.cache.delete(url);zjM.cache.set(url,e);return e.p}
 e={p:null,root:null,t:performance.now()};zjM.cache.set(url,e);
 e.p=zjLib().then(L=>/\.glb\.gz(\?|$)/.test(url)
   ?fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(async ab=>{const u8=new Uint8Array(ab);   // vaisseaux d'exception : glb gzip (ou déjà décompressé par le serveur)
     const buf=(u8[0]===0x1f&&u8[1]===0x8b)?await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():ab;return new Promise((ok,ko)=>L.parse(buf,'',ok,ko))})
   :new Promise((ok,ko)=>L.load(url,ok,undefined,ko)))
  .then(g=>{e.root=zjPrepModel(g);e.ms=Math.round(performance.now()-e.t);zjM.loads++;zjModelTrim();return e.root});
 e.p.catch(()=>{zjM.fails++;if(zjM.cache.get(url)===e)zjM.cache.delete(url)});zjModelTrim();return e.p}
function zjModelsInUse(){const u=new Set();for(const ob of [zjObs,zjTrObs])if(ob&&ob.urls)for(const x of ob.urls)u.add(x);return u}
function zjModelTrim(){const use=zjModelsInUse();for(const [k,e] of [...zjM.cache]){if(zjM.cache.size<=6)break;if(use.has(k)||!e.root)continue;zjDisposeModel(e.root);zjM.cache.delete(k)}}
function zjDisposeModel(root){const seen=new Set();root.traverse(o=>{if(o.geometry)o.geometry.dispose();for(const m of o.material?[].concat(o.material):[]){if(seen.has(m))continue;seen.add(m);for(const k in m)if(m[k]&&m[k].isTexture&&m[k]!==zjM.env)m[k].dispose();m.dispose()}})}
// une instance du modèle : clone léger (géométries et matériaux partagés), centrée, mise à la taille de présentation
// fit.R : rayon de la sphère englobante ; fit.len : longueur (axe z du modèle). nose : la proue (+z du modèle) tournée vers −z
function zjModelInst(root,fit,nose){const b=root.userData.zjBox,k=fit.len?fit.len/Math.max(1e-6,b.z.z):fit.R/Math.max(1e-6,b.r),inner=root.clone(true),w=new T.Group();
 inner.scale.setScalar(k);inner.position.set(-b.c.x*k,-b.c.y*k,-b.c.z*k);w.add(inner);w.userData.zjModel=true;if(nose)w.rotation.y=Math.PI;return w}
const zjCode=c=>String(c||'').toUpperCase().replace(/^([A-Z]+)(\d+)$/,'$1-$2'),zjModelName=x=>x?(x.title||'')+(x.code?' · '+zjCode(x.code):''):'';
function zjObsModel(){const ob=zjObs;if(!ob||ob.type!=='station')return;const sm=zjStModel(ob.key);
 if(!sm){ob.model={st:zjCat()?'none':ZH&&ZH.embed?'file':'nocat'};return}
 ob.model={st:'loading',info:sm};ob.urls=[sm.url];
 zjModel(sm.url).then(root=>{if(zjObs!==ob)return;const w=zjModelInst(root,{R:ob.R*1.05});w.position.copy(ob.main.position);w.userData.zjId=ob.id;
  ob.group.remove(ob.main);zjDisposeTree(ob.main);ob.group.add(w);const i=ob.pick.indexOf(ob.main);if(i>=0)ob.pick[i]=w;ob.main=w;ob.model.st='ok';zj.dirty=true;if(zj.view==='obj')zjSheet()},
  err=>{if(zjObs!==ob)return;ob.model={st:'fail',info:sm,why:String(err&&err.message||err).slice(0,80)};if(zj.view==='obj')zjSheet()})}
function zjModelLine(ob,what){const m=ob&&ob.model;if(!m)return'';
 if(m.st==='ok')return'<p class="zj-muted">Modèle du jeu : <b>'+zjEsc(m.label||zjModelName(m.info))+'</b>. Nom, adresse et position sont ceux de la partie.</p>';
 if(m.st==='loading')return'<p class="zj-muted">Chargement du modèle '+zjEsc(m.label||zjModelName(m.info))+'… En attendant, silhouette générique.</p>';
 if(m.st==='fail')return'<p class="zj-muted">Modèle '+zjEsc(m.label||zjModelName(m.info))+' indisponible ici ('+zjEsc(m.why||'chargement')+') : silhouette générique, identité exacte.</p>';
 if(m.st==='file')return'<p class="zj-muted">Fichier exporté : les modèles 3D restent dans le jeu. Silhouette générique, identité exacte.</p>';
 if(m.st==='nocat')return'<p class="zj-muted">Catalogue des modèles du jeu non lu : silhouette générique, identité exacte.</p>';
 return'<p class="zj-muted">'+zjEsc(what||'Cet objet')+' n’a pas de modèle dans le catalogue du jeu : silhouette générique, identité exacte.</p>'}
function zjObsDistances(){if(!zjObs)return;const old=zjObs.dObj;zjObs.dObj=zjFrameDist(zjObs.R*1.1,mobile?.42:.34);if(old&&zj.pres.level==='object'&&Math.abs(wantedDistance-old)<old*.06)wantedDistance=zjObs.dObj;zjObs.dSys=Math.max(zjObs.dObj*3.4,zjFrameDist(zjObs.sysR,.8))}
// observer : la cible devient le sujet de l'Atlas ; rien n'est lancé, rien n'est écrit
function zjObserve(o,opt){opt=opt||{};if(!o)return;const P=zj.pres;
 if(zj.mode==='atlas'&&!opt.fromTac&&(P.level==='neighbourhood'||P.level==='zone'))P.back={t:[target.x,target.y,target.z],d:Math.max(wantedDistance,300),yaw:wantedYaw,pitch:wantedPitch};
 else if(!P.back||opt.fromTac)P.back={t:o.p.slice(),d:900,yaw:wantedYaw,pitch:.55};
 zjMarkAtlasSel();zjObsBuild(o);P.level='object';P.zone=o.zone;P.hold=false;
 if(zjReduce){travel=null;target.set(o.p[0],o.p[1],o.p[2]);distance=wantedDistance=zjObs.dObj}
 else{flyTo(vector(o.p),zjObs.dObj);if(opt.fromTac)distance=Math.min(distance,420)}
 // orientation : l'étoile éclaire la face vue de trois quarts et, au dézoom, apparaît à côté de l'objet (jamais devant)
 if(zjObs.star){const dx=zjObs.anchor[0]-o.p[0],dz=zjObs.anchor[2]-o.p[2];let y=Math.atan2(dx,dz)+.9;while(y-wantedYaw>Math.PI)y-=2*Math.PI;while(wantedYaw-y>Math.PI)y+=2*Math.PI;wantedYaw=y;if(zjReduce)yaw=y}
 wantedPitch=.3;rebase();zj.dirty=true;zjSheet()}
function zjBackNeighbourhood(){const b=zj.pres.back;zj.pres.level='neighbourhood';zj.pres.hold=true;
 if(b){flyTo(vector(b.t),Math.max(b.d,zjObs?zjObs.dSys*3:600));wantedYaw=b.yaw;wantedPitch=b.pitch}else flyTo(target.clone(),900);zj.dirty=true;zjSheet()}
// niveau de présentation selon la distance et la place de la cible, avec des seuils d'entrée et de sortie distincts
function zjPresUpdate(){if(zj.mode!=='atlas')return;const P=zj.pres,before=P.level;
 if(!zj.sel)P.level='neighbourhood';
 else if(zj.sel.type==='travel')P.level='travel';
 else if(zj.sel.type==='zone'){const z=zoneParse(zj.sel.zone),c=z&&zoneCenter(z.q,z.r,z.k);P.level=c&&target.distanceTo(vector(c))<450?'zone':'neighbourhood';P.zone=zj.sel.zone}   // une zone quittée en vue libre rend les repères
 else if(zjObs&&zjObs.id===zj.sel.id){const dT=target.distanceTo(vector(zjObs.p)),near=target.distanceTo(vector(zjObs.anchor))<zjObs.sysR*2.2,onObj=dT<zjObs.R*2;
  if(P.hold){if(wantedDistance>=zjObs.dSys*2.4&&distance>=zjObs.dSys*2.2||!near)P.hold=false;P.level='neighbourhood'}
  else if(!near)P.level='neighbourhood';
  else if(P.level==='object'){if(distance>zjObs.dObj*3.2||dT>zjObs.R*3)P.level='system'}
  else if(P.level==='system'){if(distance>zjObs.dSys*2.4)P.level='neighbourhood';else if(onObj&&distance<zjObs.dObj*2.2)P.level='object'}
  else if(distance<zjObs.dSys*1.6)P.level=onObj&&distance<zjObs.dObj*2.2?'object':'system'}
 else P.level='neighbourhood';
 if(P.level!==before){zj.dirty=true;if(zj.view==='obj'||zj.view==='home')zjSheet()}}
function zjObsFrame(){if(!zjObs)return;const g=zjObs.group;g.position.set(zjObs.anchor[0]-origin.x,zjObs.anchor[1]-origin.y,zjObs.anchor[2]-origin.z);g.visible=zj.mode==='atlas';if(!g.visible)return;
 // l'étoile et les autres objets du système apparaissent progressivement en quittant le gros plan
 // fonctions continues de la distance (aucun saut au changement de niveau) ; au cadrage de référence, tout vaut 0
 const cl=v=>Math.max(0,Math.min(1,v)),f=cl((distance-zjObs.dObj*1.8)/(zjObs.dObj*1.6));zjObs.f=cl((distance-zjObs.dObj*1.6)/(zjObs.dObj*2.5));
 if(zjObs.star){zjObs.star.visible=f>.01;zjObs.star.material.opacity=f;zjObs.star.children[0].material.opacity=.14*f}
 for(const a of zjObs.others)a.mesh.visible=f>.3;
 if(zjObs.type==='world')zjObs.main.rotation.y+=.0012;else zjObs.main.rotation.y+=.004}
const zjLookV=new T.Vector3();
function zjLook(){zjLookV.set(0,0,0);if(zj.mode==='atlas'&&zjObs&&zjObs.star&&zjObs.f>0)zjLookV.set(zjObs.anchor[0]-zjObs.p[0],zjObs.anchor[1]-zjObs.p[1],zjObs.anchor[2]-zjObs.p[2]).multiplyScalar(.5*zjObs.f);return zjLookV}
const zjMinD=()=>zj.mode==='atlas'&&zjObs&&(zj.pres.level==='object'||zj.pres.level==='system')?zjObs.R*1.7:14;
const zjNoPan=()=>zj.mode==='atlas'&&zj.pres.level==='object';
function zjObsLabel(o){if(o.type==='station')return'Observer le port';if(o.type==='sig')return'Observer la signature';
 return zj.peek?(o.w.kind==='home'?'Observer sa capitale':'Observer sa colonie'):(o.w.kind==='home'?'Observer ma planète':'Observer ma colonie')}

/* ══ SUIVRE UNE MISSION (cahier « Observer » v1.1, § 18) ══
   Les missions sont celles de la partie (tankers, sondes, flottes en embuscade, arches), lues sans rien modifier.
   Leur position est ESTIMÉE à partir des horaires enregistrés : le long des jalons connus d'une ligne, ou en ligne
   droite pour un vol direct. Le suivi est un état de caméra : l'arrêter libère la caméra, la mission continue.
   Une partie lue (export, autre commandant) n'en présente aucune : rien n'est inventé. */
zj.tr=[];zj.follow=null;let zjTrObs=null;
const ZJ_TR_KIND={tanker:'TANKER',probe:'SONDE',fleet:'FLOTTE',ark:'ARCHE'},ZJ_FL_KIND={embuscade:'EMBUSCADE',garnison:'GARNISON',raid:'RAID',mission:'MISSION',imperial:'EXPÉDITION IMPÉRIALE'};
function zjAddrPos(a){const x=zjParseAddr(a);if(!x)return null;if(x.spot==null)return zjPosOf(x.key);const d=tacSecData(x.s,true),sp=localSpotOffset(x.spot);return[d.pos[x.i*3]+sp[0],d.pos[x.i*3+1]+sp[1],d.pos[x.i*3+2]+sp[2]]}
function zjTrBuild(list){const out=[];for(const t of list||[]){let pts=[],ok=!!t.from&&!!t.to;
  if(ok){const w=zj.ws.find(x=>x.coord===t.from);pts.push(w?w.p:zjAddrPos(t.from));for(const v of t.via||[])pts.push(zjAddrPos(v));pts.push(zjAddrPos(t.to));ok=pts.every(Boolean)}
  const P=ok?pts.filter((q,i)=>!i||Math.hypot(q[0]-pts[i-1][0],q[1]-pts[i-1][1],q[2]-pts[i-1][2])>.01):[],cum=[0];
  for(let i=1;i<P.length;i++)cum.push(cum[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1],P[i][2]-P[i-1][2]));
  out.push({...t,pts:P,cum,L:cum[cum.length-1]||0,ok:ok&&P.length>=1})}return out}
function zjAlong(tr,f){const P=tr.pts;if(P.length<2)return{p:P[0].slice(),dir:[0,0,1]};const d=Math.max(0,Math.min(1,f))*tr.L;let i=1;while(i<P.length-1&&tr.cum[i]<d)i++;
 const a=P[i-1],b=P[i],seg=tr.cum[i]-tr.cum[i-1]||1,u=Math.max(0,Math.min(1,(d-tr.cum[i-1])/seg)),dir=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];return{p:[a[0]+dir[0]*u,a[1]+dir[1]*u,a[2]+dir[2]*u],dir,seg:i}}
// phase en cours et position à l'instant t (horaires absolus : rien ne dépend d'un chronomètre local)
function zjTrState(tr,t){const ph=(tr.phases||[]).filter(q=>q&&q.t0!=null);if(!ph.length)return{phase:'out',f:0,along:0,done:false,p:tr.ok?tr.pts[0].slice():null,dir:[0,0,1],eta:null,end:null};
 let cur=ph[ph.length-1];for(const q of ph)if(q.t1==null||t<q.t1){cur=q;break}
 const dur=(cur.t1==null?cur.t0:cur.t1)-cur.t0,f=cur.t1==null?1:dur<=0?1:Math.max(0,Math.min(1,(t-cur.t0)/dur));let along;
 if(cur.dir==='out')along=f;else if(cur.dir==='stay')along=1;
 else{const o=ph[0],turn=o.dir==='out'&&cur.t0<o.t1&&o.t1>o.t0?Math.max(0,Math.min(1,(cur.t0-o.t0)/(o.t1-o.t0))):1;along=turn*(1-f)}   // demi-tour en route : le retour part du point atteint
 const last=ph[ph.length-1],a=tr.ok?zjAlong(tr,along):null;
 return{phase:cur.dir,f,along,done:last.t1!=null&&t>=last.t1,p:a&&a.p,dir:a&&(cur.dir==='back'?a.dir.map(v=>-v):a.dir),eta:cur.t1,end:last.t1}}
const zjLeft=t=>{const m=Math.round((t-Date.now())/60000);return m>0?(m>=120?'dans '+Math.round(m/60)+' h':'dans '+m+' min'):m===0?'maintenant':'dépassée'};
const zjTrFind=id=>zj.tr.find(x=>x.id===id);
function zjTrDest(tr){if(!tr.to)return null;const sys=tr.to.split('-').slice(0,3).join('-');return zjObjects().find(o=>o.type==='world'?o.w.coord===tr.to:o.key===sys)||null}
function zjSelectTravel(id){const tr=zjTrFind(id);if(!tr)return;if(zj.follow&&zj.follow.id!==id)zj.follow=null;zj.sel={type:'travel',id,name:tr.name};zjObsDispose();zjMarkAtlasSel();zj.dirty=true;
 if(zj.mode==='atlas'){zj.pres.level='travel';if(tr.ok){zjTrObsBuild(tr);const st=zjTrState(tr,Date.now());flyTo(vector(st.p),Math.max(zjFrameDist(zjTrR(tr),.45),Math.min(wantedDistance,700)))}}
 else if(tr.ok){const st=zjTrState(tr,Date.now());zj.k=tacLayerOf(st.p[1]);zjCenterOn(st.p,false);zjDepthUI()}zjOpen('travel')}
function zjFollow(id){const tr=zjTrFind(id);if(!tr||!tr.ok)return false;zj.sel={type:'travel',id,name:tr.name};zj.follow={id,on:true,susp:false,ended:false,arrived:false,t:performance.now(),engage:performance.now()+(zjReduce?0:950)};
 if(zj.mode!=='atlas'){zjSetMode('atlas');return true}
 zjObsDispose();zjMarkAtlasSel();zj.pres.level='travel';zjTrObsBuild(tr);const st=zjTrState(tr,Date.now()),d=zjFrameDist(zjTrR(tr),mobile?.42:.34);
 if(zjReduce){travel=null;target.set(st.p[0],st.p[1],st.p[2]);distance=wantedDistance=d}else flyTo(vector(st.p),d);rebase();zj.dirty=true;zjOpen('travel');return true}
function zjFollowResume(){const F=zj.follow;if(!F)return;F.susp=false;F.on=!F.ended;F.engage=performance.now()+(zjReduce?0:700);const tr=zjTrFind(F.id);if(tr&&tr.ok&&zj.mode==='atlas'){const st=zjTrState(tr,Date.now());if(zjReduce){target.set(st.p[0],st.p[1],st.p[2])}else flyTo(vector(st.p),wantedDistance)}zjSheet()}
function zjFollowStop(){if(zj.follow){zj.follow.on=false;zj.follow.susp=false;zj.follow.stopped=true}zjSheet()}
function zjOnPan(){const F=zj.follow;if(F&&F.on&&!F.susp){F.susp=true;zjSheet()}}
// pincer en suivi : seule la distance change ; si les deux doigts glissent nettement (> 48 px), c'est un déplacement libre
function zjPinchPan(dx,dy){const F=zj.follow;if(F&&F.on&&!F.susp){const t=performance.now();if(t-(F.pt||0)>400)F.pa=0;F.pt=t;F.pa=(F.pa||0)+Math.hypot(dx,dy);if(F.pa<48)return}pan(dx,dy)}
// voir le trajet entier : le suivi est suspendu, la mission continue
function zjTravelFit(){const tr=zjTrFind(zj.sel&&zj.sel.id);if(!tr||!tr.ok)return;if(zj.follow&&zj.follow.on)zj.follow.susp=true;const P=tr.pts,c=[0,1,2].map(j=>(Math.min(...P.map(q=>q[j]))+Math.max(...P.map(q=>q[j])))/2),R=Math.max(40,...P.map(q=>Math.hypot(q[0]-c[0],q[1]-c[1],q[2]-c[2])));
 if(zj.mode==='atlas'){flyTo(vector(c),Math.min(6400,zjFrameDist(R*1.1,.86)))}else{const ins=zjInsets(),ext=Math.max(...P.map(q=>Math.abs(q[0]-c[0])),...P.map(q=>Math.abs(q[2]-c[2])))*2.3;zj.upp=Math.max(ZJ_UPP[0],Math.min(ZJ_UPP[1],ext/Math.min(ins.right-ins.left,ins.bottom-ins.top)));zjCenterOn(c,true)}zjSheet()}
function zjTrObsDispose(){if(!zjTrObs)return;scene.remove(zjTrObs.group);zjDisposeTree(zjTrObs.group);zjTrObs=null}
function zjTrObsBuild(tr){zjTrObsDispose();if(!tr.ok)return;const o=tr.pts[0],g=new T.Group(),loc=q=>new T.Vector3(q[0]-o[0],q[1]-o[1],q[2]-o[2]);
 const path=new T.Line(new T.BufferGeometry().setFromPoints(tr.pts.map(loc)),new T.LineDashedMaterial({color:0x9fd3ff,dashSize:6,gapSize:5,transparent:true,opacity:.55,depthWrite:false}));path.computeLineDistances();g.add(path);
 const done=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xd7ecff,transparent:true,opacity:.95,depthWrite:false}));g.add(done);
 for(const q of tr.pts.slice(1,-1)){const n=new T.Mesh(new T.OctahedronGeometry(.9,0),new T.MeshBasicMaterial({color:0x9fd3ff,wireframe:true,transparent:true,opacity:.7}));n.position.copy(loc(q));g.add(n)}   // jalons
 g.add(new T.AmbientLight(0xb8c4ff,.55));const dl=new T.DirectionalLight(0xffffff,1.1);dl.position.set(4,6,3);g.add(dl);
 const v=new T.Group(),hull=new T.MeshStandardMaterial({color:tr.kind==='fleet'?0xd9ccff:tr.kind==='probe'?0xf2f0ff:0xffd28a,roughness:.45,metalness:.5});
 if(tr.kind==='fleet'){for(const [x,z] of [[0,.9],[-.8,-.5],[.8,-.5]]){const c=new T.Mesh(new T.ConeGeometry(.32,1.1,10),hull);c.rotation.x=Math.PI/2;c.position.set(x,0,z);v.add(c)}}
 else if(tr.kind==='probe'){const c=new T.Mesh(new T.OctahedronGeometry(.45,0),hull);v.add(c)}
 else{const b=new T.Mesh(new T.CylinderGeometry(.42,.42,1.7,16),hull);b.rotation.x=Math.PI/2;v.add(b);for(const z of [-.85,.85]){const e=new T.Mesh(new T.SphereGeometry(.42,14,10),hull);e.position.z=z;v.add(e)}const n=new T.Mesh(new T.ConeGeometry(.2,.5,10),new T.MeshBasicMaterial({color:0x9fd3ff}));n.rotation.x=-Math.PI/2;n.position.z=-1.35;v.add(n)}   // tanker : coque + tuyère
 v.userData.zjTr=tr.id;g.add(v);scene.add(g);zjTrObs={id:tr.id,group:g,o,veh:v,done,last:0};zjTrModel(tr)}
/* vaisseaux de la mission (§ 24.1) : le type réel — tanker TK-07, ou le vaisseau d'exception parti en ambassade.
   Flotte connue (la tienne) : un modèle par type présent, au plus 5, en petite formation ; l'effectif complet est dans la fiche.
   Loin, seule la tête reste dessinée, puis plus rien (le repère de la carte prend le relais) : ressources bornées. */
const ZJ_SHIP_FR={cuirasse:['cuirassé','cuirassés'],fregate:['frégate','frégates'],tanker:['tanker','tankers']},ZJ_SLOTS=[[0,0,0],[-1.8,.25,2],[1.8,-.25,2],[0,.45,3.8],[-3.4,0,4]];
const zjTrR=tr=>tr&&tr.kind==='fleet'?4.4:2.4;
function zjFleetCount(tr){const by={};let n=0;for(const k of ['cuirasse','fregate','tanker']){const c=tr.comp&&tr.comp[k]||{},m=(c.t1||0)+(c.t2||0)+(c.t3||0);if(m){by[k]=m;n+=m}}const pr=(tr.premium||[]).length;return{by,pr,n:n+pr}}
function zjTrSample(tr){const c=zjCat();if(!c||!c.ships)return[];const S=c.ships,ref=(S.cuirasse&&S.cuirasse.len)||290,out=[];
 if(tr.kind==='tanker'){if(tr.envoy&&c.bmUrl){const u=c.bmUrl(tr.envoy.item);if(u)return[{url:u,len:2.3,label:(tr.envoy.name||tr.envoy.item)+' · vaisseau d’exception'}]}
  return S.tanker?[{url:S.tanker.url,len:2,label:'Tanker · '+zjCode(S.tanker.code)}]:[]}
 if(tr.kind==='fleet'){for(const p of (tr.premium||[]).slice(0,2)){const u=c.bmUrl&&c.bmUrl(p.item);if(u)out.push({url:u,len:2.4,label:p.item})}
  const fc=zjFleetCount(tr);for(const k of ['cuirasse','fregate','tanker'])if(fc.by[k]&&S[k])out.push({url:S[k].url,len:Math.max(.9,2.4*Math.sqrt(S[k].len/ref)),label:ZJ_SHIP_FR[k][0]+' · '+zjCode(S[k].code)});
  return out.slice(0,5)}
 return[]}
function zjTrModel(tr){const ob=zjTrObs;if(!ob)return;const list=zjTrSample(tr);
 if(!list.length){ob.model={st:tr.kind==='probe'||tr.kind==='ark'?'none':zjCat()?'none':ZH&&ZH.embed?'file':'nocat'};return}
 ob.urls=list.map(x=>x.url);ob.model={st:'loading',label:list.length>1?list.length+' modèles du catalogue':list[0].label,list:list.map(x=>x.label)};
 const holder=new T.Group();holder.userData.zjModel=true;const got=new Array(list.length).fill(null);let left=list.length;
 const fin=()=>{if(--left>0||zjTrObs!==ob)return;const ok=got.filter(Boolean);if(!ok.length){ob.model.st='fail';ob.model.why='chargement'}
  else{for(const w of ok)holder.add(w);for(const c of [...ob.veh.children]){ob.veh.remove(c);zjDisposeTree(c)}ob.veh.add(holder);ob.holder=holder;ob.model.st='ok';ob.model.n=ok.length}
  zj.dirty=true;if(zj.view==='travel')zjSheet()};
 list.forEach((x,i)=>zjModel(x.url).then(root=>{if(zjTrObs!==ob)return;const w=zjModelInst(root,{len:x.len},true);w.position.set(...ZJ_SLOTS[i]);got[i]=w;fin()},()=>fin()))}
const zjVehW=new T.Vector3();
function zjTrLod(){const ob=zjTrObs;if(!ob||!ob.holder)return;ob.veh.getWorldPosition(zjVehW);const d=Math.max(1e-3,camera.position.distanceTo(zjVehW)),px=2.4/d*innerHeight/(2*Math.tan(camera.fov*Math.PI/360));
 ob.px=px;ob.veh.visible=px>=1.5;ob.holder.children.forEach((c,i)=>c.visible=i===0||px>=14)}
const zjZ=new T.Vector3(0,0,1),zjDirV=new T.Vector3();
function zjTrObsFrame(){if(!zjTrObs)return;const g=zjTrObs.group;g.visible=zj.mode==='atlas';if(!g.visible)return;const tr=zjTrFind(zjTrObs.id);if(!tr){zjTrObsDispose();return}
 const st=zjTrState(tr,Date.now()),o=zjTrObs.o;g.position.set(o[0]-origin.x,o[1]-origin.y,o[2]-origin.z);zjTrObs.veh.position.set(st.p[0]-o[0],st.p[1]-o[1],st.p[2]-o[2]);
 if(st.dir){zjDirV.set(st.dir[0],st.dir[1],st.dir[2]);if(zjDirV.lengthSq()>1e-9)zjTrObs.veh.quaternion.setFromUnitVectors(zjZ,zjDirV.normalize().negate())}   // la proue (−z) suit la direction du déplacement
 zjTrLod();
 const now=performance.now();if(now-zjTrObs.last>250){zjTrObs.last=now;const P=tr.pts,pts=[];if(st.phase==='back'){pts.push(P[P.length-1])}else{let i=0;pts.push(P[0]);while(i+1<P.length&&tr.cum[i+1]<=st.along*tr.L){i++;pts.push(P[i])}}pts.push(st.p);
  zjTrObs.done.geometry.dispose();zjTrObs.done.geometry=new T.BufferGeometry().setFromPoints(pts.map(q=>new T.Vector3(q[0]-o[0],q[1]-o[1],q[2]-o[2])))}}
let zjFollowT=0;
function zjFollowFrame(){const F=zj.follow;if(!F)return;const tr=zjTrFind(F.id);
 if(!tr){if(!F.ended){F.ended=true;F.on=false;F.endedAt=Date.now();zjSheet()}return}
 const st=zjTrState(tr,Date.now());if(st.done&&!F.arrived){F.arrived=true;zjSheet()}if(!st.done&&F.arrived){F.arrived=false;zjSheet()}
 const now=performance.now();zjFollowT=now;if(!F.on||F.susp||!st.p)return;
 if(zj.mode==='atlas'){if(now<F.engage)return;travel=null;const v=vector(st.p),gap=target.distanceTo(v);   // le mouvement est déjà continu : on colle au véhicule ; seul un saut (reprise, changement d'état) est lissé
  if(gap<4)target.copy(v);else target.lerp(v,1-Math.exp(-Math.min(.5,(now-(F.lt||now))/1000)*5));F.lt=now}
 else{if(now-(F.tacT||0)<200)return;F.tacT=now;const H=TAC_GRID.H,k=zj.k,lo=TAC_GRID.Y0+k*H,y=st.p[1];   // la couche ne change que si la mission sort vraiment de la tranche (marge 15 %)
  if(y<lo-H*.15||y>=lo+H*1.15){zj.k=tacLayerOf(y);zjDepthUI()}zjCenterOn(st.p,true)}}
function zjTravelHtml(){const tr=zjTrFind(zj.sel.id),F=zj.follow&&zj.follow.id===zj.sel.id?zj.follow:null;
 if(!tr)return{h:'<div class="zj-kind">MISSION</div><h3>'+zjEsc(zj.sel.name||'Mission')+'</h3><p class="zj-muted">Mission terminée : le jeu l’a retirée de la liste des missions en cours'+(F&&F.endedAt?' ('+zjClock(new Date(F.endedAt))+')':'')+'. Le résultat est dans tes rapports.</p>',f:''};
 const st=zjTrState(tr,Date.now()),fromW=zj.ws.find(w=>w.coord===tr.from),dest=zjTrDest(tr),PH={out:'Aller',stay:tr.stayLabel||(tr.kind==='fleet'?'En embuscade':'À destination'),back:'Retour'};
 let h='<div class="zj-kind'+(tr.hostile?' zj-red':'')+'">'+(ZJ_TR_KIND[tr.kind]||'MISSION')+(tr.kind==='fleet'&&ZJ_FL_KIND[tr.mkind]?' · '+ZJ_FL_KIND[tr.mkind]:'')+(tr.tier?' · '+zjEsc(String(tr.tier).toUpperCase().replace(/^(\d)$/,'T$1')):'')+' · '+zjEsc(tr.statusLabel)+'</div><h3>'+zjEsc(tr.name)+'</h3><dl class="zj-dl">';
 h+='<dt>Départ</dt><dd>'+zjEsc(fromW?fromW.name:(tr.from||'non enregistré'))+(tr.from?' <small>· '+zjEsc(tr.from)+'</small>':'')+'</dd>';
 h+='<dt>Vers</dt><dd>'+zjEsc(tr.toLabel||tr.to||'—')+' <small>· '+zjEsc(tr.to||'sans adresse sur la carte')+'</small></dd>';
 h+='<dt>Phase</dt><dd>'+(st.done?'Arrivée prévue atteinte':PH[st.phase])+(st.phase!=='stay'&&!st.done?' <small>· '+Math.round(st.f*100)+' %</small>':'')+'</dd>';
 if(st.eta)h+='<dt>'+(st.phase==='stay'?'Reprise':'Arrivée')+'</dt><dd>'+zjClock(new Date(st.eta))+' <small>· '+zjLeft(st.eta)+'</small></dd>';
 if(tr.kind==='fleet'&&tr.comp){const fc=zjFleetCount(tr),parts=Object.entries(fc.by).map(([k,n])=>n+' '+ZJ_SHIP_FR[k][n>1?1:0]);if(fc.pr)parts.push(fc.pr+' d’exception');h+='<dt>Effectif</dt><dd>'+zjEsc(parts.join(' · ')||'aucun vaisseau')+' <small>· '+fc.n+' au total</small></dd>'}
 if(tr.ok&&tr.pts.length>1)h+='<dt>Tracé</dt><dd>'+zjFmt(tr.L)+' u <small>· '+(tr.route==='ligne'?(tr.pts.length-2)+' jalons connus de la ligne':'vol direct')+'</small></dd>';
 h+='</dl><p class="zj-muted">'+(tr.ok?'Horaires de la partie. Position estimée '+(tr.route==='ligne'?'le long des jalons connus':'en ligne droite')+(st.done?' ; le jeu confirmera la suite (retour, rapport).':'.')+' Suivre ne change rien à la mission.':'Position non représentable : '+(tr.from?'la destination n’a pas d’adresse sur la carte':'le monde de départ n’est pas enregistré')+'. Seuls les horaires sont exacts.')+'</p>';
 if(tr.note)h+='<p class="zj-muted zj-small">'+zjEsc(tr.note)+'</p>';
 if(zjTrObs&&zjTrObs.id===tr.id&&zj.mode==='atlas')h+=zjModelLine(zjTrObs,tr.kind==='probe'?'Une sonde':'Ce vaisseau');
 let f='';if(tr.ok){if(F&&F.on&&!F.susp)f+='<button class="zj-primary" data-a="follow-stop">Arrêter le suivi</button>';else if(F&&F.susp&&!F.ended)f+='<button class="zj-primary" data-a="follow-resume">Reprendre le suivi</button>';else f+='<button class="zj-primary" data-a="follow" data-id="'+zjEsc(tr.id)+'">Suivre dans l’Atlas</button>';
  f+='<button class="zj-second" data-a="travel-fit">Voir le trajet</button>';if(tr.kind==='tanker'&&!zj.peek&&!zjMig())f+='<button class="zj-second" data-a="cor-tr">Comparer les itinéraires · essai</button>';if(dest)f+='<button class="zj-second" data-a="travel-dest">Observer la destination</button>'}
 if(/^fl:/.test(tr.id)&&!zj.peek&&zjMig())f+='<button class="zj-second" data-a="g-fleet" data-id="'+zjEsc(tr.id.slice(3))+'">Ouvrir la flotte</button>';
 return{h,f}}
function zjTravelRows(){const now=Date.now();let h='';for(const tr of zj.tr){const st=zjTrState(tr,now);h+='<button class="zj-row" data-a="travel" data-id="'+zjEsc(tr.id)+'"><b>'+zjEsc(tr.name)+' · '+zjEsc((ZJ_TR_KIND[tr.kind]||'').toLowerCase())+'</b><small>'+zjEsc(tr.statusLabel)+' · '+zjEsc(tr.toLabel||tr.to||'')+(st.eta?' · '+zjClock(new Date(st.eta)):'')+(tr.ok?'':' · position non représentable')+'</small></button>'}return h}

/* ── changement de mode : la sélection et sa profondeur sont conservées ── */
function zjSetMode(m){if(m===zj.mode)return;
 if(m==='atlas'){const p=zj.sel&&zj.sel.p?zj.sel.p:[zj.cx,(tacLayerY(zj.k)[0]+tacLayerY(zj.k)[1])/2,zj.cz];zj.mode='atlas';document.body.classList.remove('zj-tac');zjSceneVisible(true);travel=null;
  target.set(p[0],p[1],p[2]);const d=Math.max(160,Math.min(6000,zj.upp*innerHeight/(2*Math.tan(camera.fov*Math.PI/360))));distance=wantedDistance=Math.min(d,1500);
  if(zj.yp){wantedYaw=zj.yp.yaw;wantedPitch=zj.yp.pitch}else{wantedPitch=.55}rebase();updateStreaming(true);
  const so=zj.sel&&zj.sel.type!=='zone'?zjObjects().find(x=>x.id===zj.sel.id):null;
  if(so)zjObserve(so,{fromTac:true});
  else if(zj.sel&&zj.sel.type==='travel'){const tr=zjTrFind(zj.sel.id);zj.pres.level='travel';if(tr&&tr.ok){zjTrObsBuild(tr);const st=zjTrState(tr,Date.now()),d=zj.follow&&zj.follow.on?zjFrameDist(zjTrR(tr),mobile?.42:.34):Math.max(zjFrameDist(zjTrR(tr),.45),Math.min(distance,700));
   if(zjReduce){travel=null;target.set(st.p[0],st.p[1],st.p[2]);distance=wantedDistance=d}else{flyTo(vector(st.p),d);distance=Math.min(distance,600)}if(zj.follow)zj.follow.engage=performance.now()+(zjReduce?0:950);zjOpen('travel')}}
  else if(zj.sel&&zj.sel.type==='zone'){zj.pres.level='zone';zj.pres.zone=zj.sel.zone;distance=wantedDistance=Math.min(1500,zjFrameDist(175,.62))}
  else zj.pres.level='neighbourhood'}
 else{zj.yp={yaw:wantedYaw,pitch:wantedPitch};zj.mode='tac';document.body.classList.add('zj-tac');if(focused)closeSystem();zjSceneVisible(false);travel=null;
  zjObsDispose();zjTrObsDispose();zj.pres={level:'neighbourhood',zone:null,back:null,hold:false};
  const trs=zj.sel&&zj.sel.type==='travel'&&zjTrFind(zj.sel.id),trp=trs&&trs.ok?zjTrState(trs,Date.now()).p:null;
  const p=trp||(zj.sel&&zj.sel.p?zj.sel.p:[target.x,target.y,target.z]),zs=zj.sel&&zj.sel.zone&&zoneParse(zj.sel.zone);zj.cx=p[0];zj.cz=p[2];zj.k=zs?zs.k:tacLayerOf(p[1]);
  const h=Math.tan(camera.fov*Math.PI/360)*2*distance/innerHeight;zj.upp=Math.max(1.6,Math.min(4,h))}
 $('zj-m-atlas').classList.toggle('on',zj.mode==='atlas');$('zj-m-tac').classList.toggle('on',zj.mode==='tac');zjMarkAtlasSel();zj.dirty=true;zjSheet()}

/* ══ FEUILLE : courte, une action principale ══ */
function zjOpen(v){zj.view=v;if(mobile&&zj.sheet==='min'&&v!=='home')zj.sheet='sum';zjSheet()}
function zjSheetState(s){zj.sheet=s;$('zj-sheet').dataset.state=s;zj.dirty=true}
function zjEstimate(zoneIdStr){const z=zoneParse(zoneIdStr),w=zjWorld(zj.origin);if(!z||!w)return null;const c=zoneCenter(z.q,z.r,z.k),dist=Math.hypot(c[0]-w.p[0],c[1]-w.p[1],c[2]-w.p[2]);
 const range=Math.max(1,(zj.snap.ranges[w.id]||1))*SECTOR_SIZE,dur=(5+5*Math.min(1,dist/range))*60e3;return{w,dist,range,dur,inRange:dist<=range}}
function zjZoneHtml(){if(zj.peek)return zjPeekZoneHtml();const id=zj.sel.zone,reg=zj.regionMap.get(id),st=zjZoneState(id),z=zoneParse(id),e=zjEstimate(id),w=e&&e.w,hg=w&&zj.snap.hangars[w.id];
 let h='<div class="zj-kind">ZONE '+zjEsc(z.q+' · '+z.r)+' · '+zjEsc(zjCtxShort(z.k))+'</div>';
 if(!reg&&!zjMig()){h+='<h3>Hors de la région de test</h3><p class="zj-muted">Le test se limite à 30 zones autour de vos mondes, au contenu fixé et aux coûts maîtrisés. Les zones de test sont hachurées.</p>';return{h,f:''}}
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
const zjCtxShort=k=>{const d=k-zjHomeK();return d===0?(zj.peek?'niveau de sa capitale':'niveau de ma planète'):(d>0?'+':'−')+Math.abs(d)+' couche'+(Math.abs(d)>1?'s':'')};
function zjActBtn(a,arg,wid){if(!a||a.kind==='off')return'<span class="zj-off">'+zjEsc(a?a.label:'')+(a&&a.sub?'<small>'+zjEsc(a.sub)+'</small>':'')+'</span>';
 const x=a.kind==='tanker'||a.kind==='planet'?a.key:arg;return'<button class="zj-act" data-a="act" data-k="'+a.kind+'" data-x="'+zjEsc(x)+'" data-w="'+zjEsc(wid||zj.origin)+'">'+zjEsc(a.label)+(a.sub?'<small>'+zjEsc(a.sub)+'</small>':'')+'</button>'}
function zjMig(){return !!(ZH&&!ZH.embed&&!zj.peek&&zj.snap&&zj.snap.mig)}
const zjOldBtn=(k,key)=>'<button class="zj-second" data-a="g-old" data-k="'+zjEsc(k)+'" data-key="'+zjEsc(key||'')+'">Ancienne carte ici</button>';
// « Voir sur la carte » depuis le jeu (rapports, carnet, missions) : l'objet s'il est sur la carte, sinon la zone de son système
function zjFocusGame(sel){if(!sel||!zjBooted)return false;if(zj.peek)zjPeekStop();const K=String(sel.key||''),sys=(K.match(/^([A-Z]+-[A-Z]-\d{4})/)||[])[1]||'',O=zjObjects();
 if(sel.kind==='travel'){const tr=zjTrFind(K);if(tr){zjSelectTravel(tr.id);return true}}
 let o=null;if(sel.kind==='sig')o=O.find(x=>x.id==='sig:'+K);else if(sel.kind==='home')o=O.find(x=>x.type==='world'&&x.w.kind==='home');else if(sel.kind==='planet')o=O.find(x=>x.type==='world'&&x.w.coord===K);
 if(!o&&sys)o=O.find(x=>x.type==='world'&&x.key===sys)||O.find(x=>x.type==='station'&&x.key===sys)||O.find(x=>x.type==='sig'&&x.key===sys)||O.find(x=>x.type==='sys'&&x.key===sys);
 if(o){if(zj.mode!=='tac')zjSetMode('tac');zjFocus(o);return true}
 const p=sys&&zjAddrPos(sys);if(!p)return false;if(zj.mode!=='tac')zjSetMode('tac');zj.k=tacLayerOf(p[1]);zjSelectZone(zoneOfPoint(p));zjCenterOn(p,true);return true}
function zjSysHtml(o){const k=o.k,z=zoneParse(o.zone),tag=o.tag;
 let h='<div class="zj-kind">'+(k.unknown?'SYSTÈME':'SYSTÈME BALAYÉ')+(tag==='star'?' · INTÉRESSANT':tag==='skip'?' · SANS INTÉRÊT':'')+'</div><h3>'+zjEsc(o.key)+'</h3><dl class="zj-dl"><dt>Zone</dt><dd>'+zjEsc(z.q+' · '+z.r+' · '+zjCtxShort(z.k))+'</dd>'+(k.at?'<dt>Balayé</dt><dd>'+zjEsc(zjDate(k.at))+'</dd>':'')+'</dl>';
 const slotOf=p=>p.slot!=null&&p.slot!==''?+p.slot:+((String(p.coord||'').match(/-(\d{1,2})$/)||[])[1]||0);   // le numéro d'emplacement, sinon celui de l'adresse
 const pl=(k.planets||[]).slice().sort((a,b)=>slotOf(a)-slotOf(b));
 if(pl.length){h+='<div class="zj-kind" style="margin-top:10px">EMPLACEMENTS</div>';for(const p of pl)h+='<button class="zj-row" data-a="act" data-k="planet" data-x="'+zjEsc(p.coord)+'" data-w="'+zjEsc(zj.origin)+'"><b>'+zjEsc(String(slotOf(p)).padStart(2,'0')+' · '+(p.player?p.player+(p.bot?' (automate)':''):p.name))+'</b><small>'+zjEsc((p.desc?p.desc+' · ':'')+p.coord)+'</small></button>'}
 else h+='<p class="zj-muted">'+(k.unknown?'Système pas encore balayé.':'Aucune planète relevée dans ce système.')+'</p>';
 h+=zjBeaconHtml(o.key)+zjPostsHtml(o.key);
 if(o.cmd)h=zjCmdHtml(o)+h.replace('<div class="zj-kind">','<div class="zj-kind" style="margin-top:14px">');
 let f='<button class="zj-second'+(tag==='star'?' on':'')+'" data-a="g-tag" data-key="'+zjEsc(o.key)+'" data-v="star">'+(tag==='star'?'Retirer « intéressant »':'Intéressant')+'</button><button class="zj-second'+(tag==='skip'?' on':'')+'" data-a="g-tag" data-key="'+zjEsc(o.key)+'" data-v="skip">'+(tag==='skip'?'Retirer « sans intérêt »':'Sans intérêt')+'</button>';
 f+='<button class="zj-second" data-a="zone" data-z="'+zjEsc(o.zone)+'">Voir sa zone</button>'+zjOldBtn('system',o.key);return{h,f}}
// étape 2 : ce que la carte propose pour une balise sur ce système (mêmes règles que l'ancienne carte)
const zjBc=sys=>{const B=zj.snap&&zj.snap.beacons;return B?{B,here:B.list.find(b=>b.sys===sys),going:B.going.find(b=>b.sys===sys)}:null};
function zjBeaconHtml(sys){const x=zjBc(sys);if(!x||!zjMig()||!sys)return'';const{B,here,going}=x,st=B.status[zj.origin]||B.status.home||{},w=zjWorld(zj.origin);
 let h='<div class="zj-kind" style="margin-top:12px">BALISE</div>';
 if(here){h+='<p class="zj-muted"><b>'+zjEsc(here.name)+'</b> en surveillance'+(here.at?' depuis le '+zjEsc(zjDate(here.at)):'')+' · '+here.n+' détection'+(here.n>1?'s':'')+(here.routes.length?' · balise '+zjEsc(here.routes.join(', ')):'')+'.</p>';
  h+='<button class="zj-row" data-a="g-bc-recall" data-id="'+zjEsc(here.id)+'"><b>Rappeler la balise</b><small>Le jeu prévient si elle balise une route ou porte une route vendue</small></button>';
  if(!B.posts.includes(sys)&&!zj.ws.some(w=>w.key===sys))h+='<button class="zj-row" data-a="g-post" data-sys="'+zjEsc(sys)+'"><b>Ouvrir un poste ici</b><small>Un tanker en station : les commandants qui y tiennent un poste peuvent te parler</small></button>';return h}
 if(going)return h+'<p class="zj-muted">Balise en route · arrivée dans '+zjDur(going.arrivalAt-Date.now())+' ('+zjClock(going.arrivalAt)+').</p>';
 if((st.deployed||0)>=B.quota)return h+'<p class="zj-muted">'+B.quota+' balises déjà posées depuis '+zjEsc(w?w.name:'ce monde')+' : rappelle-en une pour la poser ici.</p>';
 if(st.ok){const v=ZH.beaconCheck?ZH.beaconCheck(sys,zj.origin):{ok:true};if(!v.ok)return h+'<p class="zj-muted">'+zjEsc(v.why)+'</p>'}
 if(st.ok)return h+'<button class="zj-row" data-a="g-bc-place" data-sys="'+zjEsc(sys)+'"><b>Poser une balise</b><small>Depuis '+zjEsc(w?w.name:'')+' · surveillance permanente des convois</small></button>';
 if(st.build)return h+'<button class="zj-row" data-a="g-bc-build"><b>Construire une balise</b><small>'+B.cost.metal+' métal · '+B.cost.cristal+' cristal, au Centre de prospection</small></button>';
 return h+'<p class="zj-muted">'+zjEsc(st.why||'Aucune balise prête.')+'</p>'}
// étape 3 : commandants, garnisons, raids annoncés, postes (lus dans le jeu ; les actions ouvrent les écrans du jeu)
const zjCmdCol=L=>L.some(c=>c.rel&&c.rel.enemy)?'#ff5a4d':L.some(c=>c.rel&&c.rel.ally)?'#5fffe8':'#ff9a8a';
const zjRaidHits=(r,w)=>r.target?r.target===w.coord:w.kind==='home';
function zjCmdHtml(o){const L=o.cmd,one=L.length===1;let h='<div class="zj-kind">'+(one?'COMMANDANT':'COMMANDANTS')+(L.every(c=>c.bot)?' · AUTOMATE':'')+'</div><h3>'+zjEsc(o.name)+'</h3>';
 for(const c of L){const r=c.rel||{},tags=[],lui=one?'lui':zjEsc(c.pseudo);
  if(r.ally)tags.push('<span class="zj-rel al">★ Allié · '+zjEsc(r.ally)+'</span>');
  if(r.enemy)tags.push('<span class="zj-rel en">⚔ Ennemi déclaré'+(r.enemyByMe?' (par toi)':'')+'</span>');
  if(r.trade)tags.push('<span class="zj-rel tr">⚑ Accord commercial</span>');
  if(r.pact)tags.push('<span class="zj-rel pa">'+(r.pact==='active'?'Pacte de non-agression':r.pact==='proposed-mine'?'Pacte proposé · en attente':'Il te propose un pacte')+'</span>');
  if(c.bot&&!one)tags.push('<span class="zj-rel">Automate</span>');
  h+='<div class="zj-cmd">'+(one?'':'<b>'+zjEsc(c.pseudo)+'</b>')+'<p class="zj-muted">'+zjEsc(c.planet||'Monde habité')+' · '+zjEsc(c.addr)+(c.level?' · niv. '+zjEsc(c.level):'')+(c.known?'':' · système pas encore sondé')+'</p>'+(tags.length?'<div class="zj-rels">'+tags.join('')+'</div>':'');
  for(const n of c.orbit||[])h+='<p class="zj-muted">'+zjEsc(n)+' est en orbite chez '+lui+' : ambassade ouverte.</p>';
  if(c.inc)h+='<p class="zj-muted">Son vaisseau '+zjEsc(c.inc)+' est en orbite chez toi.</p>';
  for(const g of c.gar||[])h+='<p class="zj-muted">'+zjEsc(g.name)+' · '+(g.phase==='going'?'arrivée en garnison '+zjLeft(g.at):g.phase==='returning'?'retour '+zjLeft(g.at):'en garnison chez '+lui)+'.</p>';
  if(!zj.peek){h+='<button class="zj-row" data-a="g-cmd" data-x="'+zjEsc(c.coord)+'"><b>Voir sa fiche</b><small>La fiche du jeu : message, tanker, ambassade, sonder à nouveau</small></button>';
   if(c.embassy)h+='<button class="zj-row" data-a="g-emb" data-x="'+zjEsc(c.addr)+'"><b>Ouvrir l’ambassade</b><small>Discuter et négocier'+(r.ally?', canal de l’alliance':'')+'</small></button>';
   if(c.canGarrison)h+='<button class="zj-row" data-a="g-gar" data-x="'+zjEsc(c.addr)+'"><b>Envoyer une flotte en garnison</b><small>Elle combat avec ses défenses si un raid arrive chez '+lui+'</small></button>';
   for(const g of c.gar||[])if(g.phase!=='returning')h+='<button class="zj-row" data-a="g-gar-back" data-id="'+zjEsc(g.id)+'"><b>Rappeler '+zjEsc(g.name)+'</b><small>Le jeu demande confirmation</small></button>'}
  h+='</div>'}
 if(!zj.peek&&L.some(c=>!c.bot&&!(c.rel&&c.rel.ally)))h+='<p class="zj-muted zj-small">Un raid se lance depuis une flotte composée (écran Flotte), comme dans le jeu.</p>';
 return h}
function zjPostsHtml(sys){const P=zj.snap&&zj.snap.posts;if(!P||!zjMig())return'';const mine=P.mine.filter(x=>x.sys===sys),oth=P.others.filter(x=>x.sys===sys);if(!mine.length&&!oth.length)return'';
 let h='<div class="zj-kind" style="margin-top:12px">POSTES</div>';for(const m of mine)h+='<p class="zj-muted">'+zjEsc(m.tanker)+(m.status==='posted'?' tient ton poste ici.':' part ouvrir ton poste ici.')+'</p>';
 for(const x of oth)h+='<p class="zj-muted"><b>'+zjEsc(x.pseudo)+'</b> tient un poste ici'+(x.met?' : canal d’ambassade ouvert.':' : ouvre le tien pour lui parler.')+'</p>';return h}
function zjWorldMpHtml(w){const I=(zj.snap.incoming||[]).filter(r=>zjRaidHits(r,w)),G=(zj.snap.hosted||[]).filter(g=>g.host?g.host===w.coord:w.kind==='home');let h='';
 if(I.length){h+='<div class="zj-kind zj-red" style="margin-top:12px">FLOTTE HOSTILE EN APPROCHE</div>';for(const r of I)h+='<p class="zj-muted"><b>'+zjEsc(r.pseudo)+'</b>'+(r.fleet?' · '+zjEsc(r.fleet):'')+' · impact à '+zjClock(r.at)+' ('+zjLeft(r.at)+'). Le registre ne donne que l’heure d’impact, pas sa route.</p>';
  h+='<button class="zj-row" data-a="g-fleet-screen"><b>Préparer la défense</b><small>Écran Flotte : déployer une flotte en orbite</small></button>'}
 if(G.length){h+='<div class="zj-kind" style="margin-top:12px">GARNISONS ALLIÉES ICI</div>';for(const g of G)h+='<p class="zj-muted">'+zjEsc(g.fleet||'Flotte')+' de <b>'+zjEsc(g.pseudo)+'</b> · '+zjFmt(g.def)+' de défense'+(g.arrivesAt&&g.arrivesAt>Date.now()?' · en route':'')+'.</p>'}
 return h}
function zjCmdsHtml(){const L=zj.snap&&zj.snap.cmd||[];let h='<div class="zj-kind">COMMANDANTS</div><h3>'+L.length+' connu'+(L.length>1?'s':'')+'</h3>';
 if(!L.length)h+='<p class="zj-muted">Aucun commandant connu. Une Radar qui balaie un système habité l’inscrit ici et sur la carte.</p>';
 const rank=c=>c.rel&&c.rel.ally?0:c.rel&&c.rel.enemy?1:c.gar&&c.gar.length?2:c.bot?4:3;
 for(const c of L.slice().sort((a,b)=>rank(a)-rank(b)||a.pseudo.localeCompare(b.pseudo))){const o=zjObjects().find(x=>x.type==='sys'&&x.key===c.sys),r=c.rel||{};
  h+='<button class="zj-row" data-a="bc-go" data-id="'+zjEsc(o?o.id:'')+'"><b>'+zjEsc(c.pseudo)+(r.ally?' · allié':r.enemy?' · ennemi':c.bot?' · automate':'')+'</b><small>'+zjEsc((c.planet?c.planet+' · ':'')+c.addr)+(c.gar&&c.gar.length?' · ta garnison':'')+(c.orbit&&c.orbit.length?' · ambassade':'')+(o?'':' · position inconnue')+'</small></button>'}
 return{h,f:''}}
function zjBeaconsHtml(){const B=zj.snap&&zj.snap.beacons;let h='<div class="zj-kind">MES BALISES</div><h3>'+(B?B.list.length:0)+' en surveillance</h3>';if(!B)return{h,f:''};
 if(!B.list.length&&!B.going.length)h+='<p class="zj-muted">Aucune balise posée. Choisis un système sur la carte : sa fiche propose « Poser une balise ».</p>';
 for(const b of B.list)h+='<button class="zj-row" data-a="bc-go" data-id=""'+zjEsc((zjObjects().find(o=>o.key===b.sys)||{}).id||'')+'"><b>'+zjEsc(b.name)+' · '+zjEsc(b.sys)+'</b><small>'+b.n+' détection'+(b.n>1?'s':'')+(b.routes.length?' · balise '+zjEsc(b.routes.join(', ')):'')+'</small></button>';
 for(const g of B.going)h+='<button class="zj-row" data-a="bc-go" data-id=""'+zjEsc((zjObjects().find(o=>o.key===g.sys)||{}).id||'')+'"><b>En route · '+zjEsc(g.sys)+'</b><small>arrivée dans '+zjDur(g.arrivalAt-Date.now())+'</small></button>';
 return{h,f:''}}
function zjObjHtml(){const o=zjObjects().find(x=>x.id===zj.sel.id);if(!o)return{h:'<p class="zj-muted">Objet introuvable.</p>',f:''};if(o.type==='sys')return zjSysHtml(o);const z=zoneParse(o.zone);
 let h='<div class="zj-kind">'+({world:zj.peek?'SON MONDE':'MON MONDE',station:'PORT FRANC',sig:'SIGNATURE'}[o.type]||'LIEU')+'</div><h3>'+zjEsc(o.name)+'</h3><dl class="zj-dl"><dt>Adresse</dt><dd>'+zjEsc(o.type==='world'?o.w.coord:o.key)+'</dd>'+(o.type==='world'?'<dt>Système</dt><dd>'+zjEsc(o.key)+(o.w.spot!=null?' <small>· spot '+String(o.w.spot+1).padStart(2,'0')+'</small>':' <small>· spot inconnu</small>')+'</dd><dt>Amas</dt><dd>'+zjEsc(zjAmasOf(o.w.coord))+'</dd>':'')+'<dt>Zone</dt><dd>'+zjEsc(z.q+' · '+z.r+' · '+zjCtxShort(z.k))+(zj.regionMap.has(o.zone)?' <small>· région de test</small>':'')+'</dd></dl>',f='';
 if(o.type==='station'){const sm=zjStModel(o.key);if(sm)h=h.replace(/<\/dl>/,'<dt>Modèle</dt><dd>'+zjEsc(sm.title)+' <small>· '+zjEsc(zjCode(sm.code))+'</small></dd></dl>')}
 if(o.type==='world'&&zj.peek){const hm=zjHome(),dd=Math.hypot(o.p[0]-hm.p[0],o.p[1]-hm.p[1],o.p[2]-hm.p[2]);if(o.w.kind!=='home')h=h.replace(/<\/dl>$/,'<dt>Capitale</dt><dd>'+zjFmt(dd)+' u <small>· '+zjSecTxt(dd)+'</small></dd></dl>');
  f=o.w.id===zj.origin?'<p class="zj-muted">Les distances et la portée sont mesurées depuis ce monde.</p>':'<button class="zj-second" data-a="origin" data-w="'+zjEsc(o.w.id)+'">Mesurer depuis ce monde</button>'}
 else if(o.type==='world'){f=o.w.id===zj.origin?'<p class="zj-muted">Les sondages partent de ce monde.</p>':'<button class="zj-second" data-a="origin" data-w="'+zjEsc(o.w.id)+'">Lancer les sondages depuis '+zjEsc(o.name)+'</button>'}
 if(o.type==='sig')f=zj.peek?'<span class="zj-off">'+zjEsc(zjSigState(o.g))+'</span>':zjActBtn(ZH.sigAction(o.g.id,zj.origin),o.g.id,zj.origin);
 if(o.type==='sig'||o.type==='station')h+=zjBeaconHtml(o.key)+zjPostsHtml(o.key);
 if(o.type==='world'&&zjMig()&&!zj.peek)h+=zjWorldMpHtml(o.w);
 // observer : un gros plan dans l'Atlas, sans mission, sans changer le départ des sondages
 const obsHere=zj.mode==='atlas'&&zjObs&&zjObs.id===o.id&&zj.pres.level!=='neighbourhood';
 if(obsHere){h+=o.type==='sig'?(o.g.resolved?'':'<p class="zj-muted">Signature non identifiée : la vue rapprochée n’en révèle pas la nature.</p>'):o.type==='station'?zjModelLine(zjObs,'Ce port'):'<p class="zj-muted">Aperçu générique : l’apparence réelle de ce monde n’est pas encore transmise à la carte. Nom, adresse et position sont exacts.</p>';
  f='<button class="zj-primary" data-a="back-n">Retour au voisinage</button>'+f}
 else{const ob='<button class="'+(o.type==='sig'&&!zj.peek?'zj-second':'zj-primary')+'" data-a="observe" data-id="'+zjEsc(o.id)+'">'+zjObsLabel(o)+'</button>';f=o.type==='sig'&&!zj.peek?f+ob:ob+f}
 if(o.type==='station'&&zjMig()){const pt=o.port||{},rt=(zj.snap.routes||[]).find(r=>r.port===o.key);let g='';
  if(pt.enter&&pt.dock)g+='<button class="zj-primary" data-a="g-port" data-d="'+zjEsc(pt.dock)+'">Entrer dans le port</button>';
  if(rt)g+='<button class="zj-second" data-a="g-route" data-r="'+zjEsc(rt.id)+'">Envoyer un tanker · '+zjEsc(rt.name)+'</button>';
  if(rt)h=h.replace(/<\/dl>/,'<dt>Route</dt><dd>'+zjEsc(rt.name)+' <small>· connue</small></dd></dl>');f=g+f}
 if(o.type==='station'&&!zj.peek&&!zjMig())f+='<button class="zj-second" data-a="cor-obj" data-id="'+zjEsc(o.id)+'">Comparer les itinéraires · essai</button>';
 f+='<button class="zj-second" data-a="zone" data-z="'+zjEsc(o.zone)+'">Voir sa zone</button>';
 if(zjMig())f+=zjOldBtn(o.type==='sig'?'sig':o.type==='world'?(o.w.kind==='home'?'home':'planet'):'system',o.type==='sig'?o.g.id:o.type==='world'?(o.w.kind==='home'?o.key:o.w.coord):o.key);
 return{h,f}}
function zjHomeHtml(){if(zj.peek)return zjPeekHomeHtml();const R=zj.snap&&zj.snap.zp&&zj.snap.zp.region,zs=zj.snap?zj.snap.zp.zones:{},done=Object.values(zs).filter(z=>z.st==='done'),finds=done.reduce((a,z)=>a+(z.found||[]).length,0),miss=zj.snap?zj.snap.missions.length:0,w=zjWorld(zj.origin),hg=w&&zj.snap.hangars[w.id];
 let h='<div class="zj-kind">'+(zjMig()?'MA CARTE · PROSPECTION PAR ZONES':'PROSPECTION PAR ZONES · TEST')+'</div><h3>Touchez une zone voisine</h3><p class="zj-muted">'+(zjMig()?'Toute zone à portée de tes mondes peut être sondée':'Les zones hachurées forment la région de test')+'. Une zone se sonde avec une seule Radar, quel que soit le nombre d’étoiles qu’elle contient.</p>';
 if(R)h+='<div class="zj-stats"><div><b>'+done.length+(zjMig()?'':'/'+R.zones.length)+'</b><small>zones sondées</small></div><div><b>'+finds+'</b><small>signaux</small></div><div><b>'+miss+'</b><small>en vol</small></div><div><b>'+(hg?hg.radar:0)+'</b><small>Radars à '+zjEsc(w?w.name:'')+'</small></div></div>';
 if(!zjMig())h+='<button class="zj-row'+(zj.cor.on?' on':'')+'" data-a="cor-net"><b>Réseau de corridors candidat · essai</b><small>'+(zj.cor.on?'Affiché · toucher pour le masquer':'Afficher les 6 corridors du GDD navigation dans l’Atlas et en Tactique')+'</small></button>'+(zj.cor.on?zjCorNetHtml():'');
 if(zjMig()&&zj.snap.cmd){const L=zj.snap.cmd,al=L.filter(c=>c.rel&&c.rel.ally).length,en=L.filter(c=>c.rel&&c.rel.enemy).length,ga=L.reduce((n,c)=>n+(c.gar||[]).length,0);
  for(const r of zj.snap.incoming||[])h+='<button class="zj-row zj-alert" data-a="raid-in" data-t="'+zjEsc(r.target||'')+'"><b>⚠ Flotte hostile · '+zjEsc(r.pseudo)+'</b><small>Impact à '+zjClock(r.at)+' ('+zjLeft(r.at)+') · '+zjEsc(r.target||'ta capitale')+'</small></button>';
  h+='<button class="zj-row" data-a="cmds"><b>Commandants · '+L.length+'</b><small>'+(L.length?([al?al+' allié'+(al>1?'s':''):'',en?en+' ennemi'+(en>1?'s':''):'',ga?ga+' garnison'+(ga>1?'s':''):''].filter(Boolean).join(' · ')||'toucher pour la liste'):'Ceux que tes Radars trouvent apparaissent ici et sur la carte')+'</small></button>'}
 if(zjMig()&&zj.snap.beacons){const B=zj.snap.beacons;h+='<button class="zj-row" data-a="beacons"><b>Mes balises · '+B.list.length+(B.going.length?' + '+B.going.length+' en route':'')+'</b><small>'+(B.list.length?B.list.reduce((a,b)=>a+b.n,0)+' détection(s) au total · toucher pour la liste':'Poser une balise depuis la fiche d’un système')+'</small></button>'}
 if(zjMig())h+='<button class="zj-row" data-a="g-old" data-k="home" data-key=""><b>Ancienne carte</b><small>Pour les actions pas encore reprises ici : routes et lignes, embuscades. Rien n’est perdu.</small></button>';
 h+='<div class="zj-legend">'+(zjMig()?'<span><i class="y"></i>Système balayé</span>':'<span><i class="h"></i>Non sondée</span>')+'<span><i class="m"></i>En mission</span><span><i class="d"></i>Sondée</span><span><i class="s"></i>Signature</span></div>';return{h,f:''}}
function zjChoiceHtml(){let h='<div class="zj-kind">PLUSIEURS LIEUX ICI</div><h3>Lequel ?</h3>';for(const o of zj.list||[])h+='<button class="zj-row" data-a="pick" data-id="'+zjEsc(o.id)+'"><b>'+zjEsc(o.name)+'</b><small>'+zjEsc(o.sub||'')+'</small></button>';return{h,f:''}}
function zjWorldsHtml(){if(zj.peek){let h='<div class="zj-kind">SES MONDES · '+zjEsc(zj.peek.pseudo.toUpperCase())+'</div><h3>Observer un monde</h3><p class="zj-muted">Choisis un monde pour le voir de près. Les distances restent mesurées depuis '+zjEsc((zjWorld(zj.origin)||{}).name||'')+'. Lecture seule.</p>';
  for(const w of zj.ws)h+='<button class="zj-row'+(w.id===zj.origin?' on':'')+'" data-a="world" data-w="'+zjEsc(w.id)+'"><b>'+zjEsc(w.name)+' · '+(w.kind==='home'?'capitale':'colonie')+(w.unpub?' (pas au registre)':'')+'</b><small>'+zjEsc(w.coord)+' · '+zjEsc(zjAmasOf(w.coord))+(w.id===zj.origin?' · mesures depuis ce monde':'')+'</small></button>';
  return{h,f:ZH.embed?'':'<button class="zj-second" data-a="peek-off">Revenir à ma partie</button>'}}
 let h='<div class="zj-kind">MES MONDES</div><h3>Observer un monde</h3><p class="zj-muted">Choisis un monde pour le voir de près. Le départ des sondages ne change que par son bouton « Lancer les sondages depuis… ».</p>';
 for(const w of zj.ws){const hg=zj.snap.hangars[w.id]||{};h+='<button class="zj-row'+(w.id===zj.origin?' on':'')+'" data-a="world" data-w="'+zjEsc(w.id)+'"><b>'+zjEsc(w.name)+' · '+(w.kind==='home'?'capitale':'colonie')+'</b><small>'+zjEsc(w.coord)+' · '+(hg.radar||0)+' Radar'+((hg.radar||0)>1?'s':'')+' prête'+((hg.radar||0)>1?'s':'')+(w.id===zj.origin?' · départ des sondages':'')+'</small></button>'}
 if(zj.tr.length)h+='<div class="zj-kind" style="margin-top:14px">EN VOL · '+zj.tr.length+'</div>'+zjTravelRows();
 if(ZH&&ZH.peek)h+='<div class="zj-find"><div><b>Voir la partie d’un commandant</b><small>Lecture seule : son empire placé sur cette carte, rien n’est modifié chez lui</small></div><div class="zj-peek-f"><input id="zj-peek-in" value="Panzerstorm" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Pseudo du commandant"><button class="zj-act" data-a="peek">Voir</button></div></div>';
 return{h,f:''}}
// raccourcis du jeu (Sondes, Missions, Rapports, Carnet, Archives), avec leurs icônes et leurs pastilles lues dans le jeu
function zjGameNav(){const nav=zjMig()&&document.body.classList.contains('zj-in-game')&&zj.snap.nav||null,head=$('zj-sh-head');let g=$('zj-gnav');
 head.classList.toggle('zj-has-gnav',!!(nav&&nav.length));if(!nav||!nav.length){if(g)g.remove();return}
 if(!g){g=document.createElement('nav');g.id='zj-gnav';head.insertBefore(g,$('zj-sh-tog'))}
 const h=nav.map(x=>'<button data-a="g-tab" data-t="'+zjEsc(x.t)+'" aria-label="'+zjEsc(x.label)+'">'+x.svg+'<span>'+zjEsc(x.label)+'</span>'+(x.n?'<i>'+x.n+'</i>':'')+'</button>').join('');if(g.innerHTML!==h)g.innerHTML=h}
function zjSheet(){if(!zj.snap){return}let r;
 if(zj.view==='zone'&&zj.sel&&zj.sel.type==='zone')r=zjZoneHtml();else if(zj.view==='travel'&&zj.sel&&zj.sel.type==='travel')r=zjTravelHtml();else if(zj.view==='obj'&&zj.sel&&zj.sel.id&&zj.sel.type!=='travel')r=zjObjHtml();else if(zj.view==='choix')r=zjChoiceHtml();else if(zj.view==='worlds')r=zjWorldsHtml();else if(zj.view==='cor')r=zjCorHtml();else if(zj.view==='beacons')r=zjBeaconsHtml();else if(zj.view==='cmds')r=zjCmdsHtml();else if(zj.view==='seg'&&zj.sel&&zj.sel.type==='seg')r=zjSegHtml();else{zj.view='home';r=zjHomeHtml()}
 const ae=document.activeElement;if(ae&&$('zj-sheet').contains(ae)&&ae.tagName==='INPUT')return;
 $('zj-sh-body').innerHTML=r.h;$('zj-sh-foot').innerHTML=r.f||'';$('zj-sheet').querySelector('.zj-test').textContent=zj.peek?'LECTURE · '+zj.peek.pseudo.toUpperCase():zjMig()?'MA CARTE':'TEST · COMPTE HADRIEN';zjGameNav();$('zj-worlds').textContent=zj.peek?'Ses mondes':'Mes mondes';$('zj-sh-back').hidden=zj.view==='home';$('zj-sheet').dataset.state=zj.sheet}
$('zj-sheet').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='peek'){const v=($('zj-peek-in')&&$('zj-peek-in').value||'').trim();if(v){b.disabled=true;zjPeekStart(v).then(()=>{b.disabled=false})}return}
 if(a==='peek-off')return zjPeekStop();
 if(a==='export')return zjExport();
 if(zj.peek&&(a==='launch'||a==='build-radar'||a==='act'))return toast('Lecture seule : rien ne part depuis la partie d’un autre commandant.');
 if(a==='launch')return zjLaunch(b);
 if(a==='build-radar'){ZH.act('build-radar',null,zj.origin);return}
 if(a==='act'){if(b.disabled)return;b.disabled=true;const res=ZH.act(b.dataset.k,b.dataset.x,b.dataset.w);if(res&&res.why)toast(res.why);zjRefresh(true);return}
 if(a==='origin'){zj.origin=b.dataset.w;const w=zjWorld(zj.origin);toast((zj.peek?'Mesures depuis ':'Départ des sondages : ')+w.name);zj.dirty=true;zjOpen('home');zjDepthUI();return}
 if(a==='world'){const w=zjWorld(b.dataset.w),o=w&&zjObjects().find(x=>x.id==='world:'+w.id);if(!o)return;if(zj.mode==='tac'){zj.k=tacLayerOf(w.p[1]);zjSelectObj(o);zjCenterOn(w.p,true)}else zjSelectObj(o);zjDepthUI();return}
 if(a==='observe'){const o=zjObjects().find(x=>x.id===b.dataset.id);if(!o)return;if(!zj.sel||zj.sel.id!==o.id)zj.sel={type:o.type,id:o.id,p:o.p,zone:o.zone,name:o.name,key:o.key};if(zj.mode==='tac')zjSetMode('atlas');else zjObserve(o);return}
 if(a==='back-n')return zjBackNeighbourhood();
 if(a==='travel')return zjSelectTravel(b.dataset.id);
 if(a==='follow')return zjFollow(b.dataset.id);
 if(a==='follow-stop')return zjFollowStop();
 if(a==='follow-resume')return zjFollowResume();
 if(a==='travel-fit')return zjTravelFit();
 if(a==='g-port'){const r=ZH.gameAct('port',b.dataset.d);if(r&&!r.ok)toast(r.why);return}
 if(a==='g-route'){const r=ZH.gameAct('route-tanker',b.dataset.r);if(r&&!r.ok)toast(r.why);return}
 if(a==='g-tab'){ZH.gameAct('tab',b.dataset.t);return}
 if(a==='g-bc-place'){const r=ZH.gameAct('beacon-place',{sys:b.dataset.sys,world:zj.origin});if(r&&!r.ok&&r.why)toast(r.why);zjRefresh(true);return}
 if(a==='g-bc-recall'){ZH.gameAct('beacon-recall',b.dataset.id);return}
 if(a==='g-bc-build'){ZH.gameAct('beacon-build');return}
 if(a==='g-post'){const r=ZH.gameAct('post-here',b.dataset.sys);if(r&&!r.ok)toast(r.why);zjRefresh(true);return}
 if(a==='beacons'){zjOpen('beacons');return}
 if(a==='cmds'){zjOpen('cmds');return}
 if(a==='raid-in'){const w=zj.ws.find(x=>x.coord===b.dataset.t)||zjHome(),o=w&&zjObjects().find(x=>x.id==='world:'+w.id);if(o)zjSelectObj(o);return}
 if(a==='g-cmd'||a==='g-emb'||a==='g-gar'){const r=ZH.gameAct(a==='g-cmd'?'cmd-sheet':a==='g-emb'?'embassy':'garrison',b.dataset.x);if(r&&!r.ok)toast(r.why);return}
 if(a==='g-gar-back'||a==='g-fleet'){const r=ZH.gameAct(a==='g-fleet'?'fleet':'garrison-recall',b.dataset.id);if(r&&!r.ok)toast(r.why);return}
 if(a==='g-fleet-screen'){ZH.gameAct('fleet-screen');return}
 if(a==='bc-go'){const o=zjObjects().find(x=>x.id===b.dataset.id);if(o)zjSelectObj(o);return}
 if(a==='seg-off'){zj.sel=null;zjOpen('home');zj.dirty=true;return}
 if(a==='g-tag'){const r=ZH.gameAct('tag',{key:b.dataset.key,v:b.dataset.v});if(r&&!r.ok)toast(r.why);else zjRefresh(true);return}
 if(a==='g-old'){const k=b.dataset.k,key=b.dataset.key;ZH.gameAct('oldmap',key?{kind:k,key}:null);return}
 if(a==='cor-tr'){const tr=zjTrFind(zj.sel&&zj.sel.id);if(!zjCorCompare(zjCorCtxTravel(tr)))return toast('Réseau pas encore prêt, réessaie dans un instant.');zjCorFit();return zjOpen('cor')}
 if(a==='cor-obj'){const o=zjObjects().find(x=>x.id===b.dataset.id);if(!zjCorCompare(zjCorCtxObj(o)))return toast('Réseau pas encore prêt, réessaie dans un instant.');zjCorFit();return zjOpen('cor')}
 if(a==='cor-pick')return zjCorPickPlan(+b.dataset.i);
 if(a==='cor-fit'){zjCorFit();return zjSheet()}
 if(a==='cor-off'){zjCorToggle(false);return zjOpen('home')}
 if(a==='cor-net')return zjCorToggle();
 if(a==='cor-back'){const c=zj.cor.ctx;if(!c)return zjOpen('home');if(c.src==='travel')return zjSelectTravel(c.id);const o=zjObjects().find(x=>x.id===c.id);if(o)zjSelectObj(o);return}
 if(a==='travel-dest'){const tr=zjTrFind(zj.sel&&zj.sel.id),o=tr&&zjTrDest(tr);if(o)zjSelectObj(o);return}
 if(a==='zone')return zjSelectZone(b.dataset.z,true);
 if(a==='pick'){const o=(zj.list||[]).find(x=>x.id===b.dataset.id);if(o)zjSelectObj(o);return}
 if(a==='worlds')return zjOpen('worlds')});
function zjLaunch(b){if(zj.peek||!zj.sel||zj.sel.type!=='zone')return;if(b)b.disabled=true;const id=zj.sel.zone,e=zjEstimate(id);if(!e)return;
 const oc=!zj.regionMap.has(id)&&zjMig()?zjZoneContent(id):null;if(!zj.regionMap.has(id)&&zjMig()&&!oc){toast('Cette zone n’a pas encore de systèmes chargés, réessaie dans un instant.');if(b)b.disabled=false;return}
 const r=ZH.launch({zone:id,world:e.w.id,dist:e.dist,range:e.range,label:'Zone '+id.split(':').slice(1,3).join(' · '),content:oc,anchor:oc&&oc.anchor});
 if(!r.ok){toast(r.why==='noradar'?'Aucune Radar prête à '+e.w.name+'.':r.why);zjRefresh(true);return}
 toast(r.already?'Mission déjà en vol pour cette zone.':'Radar lancée · arrivée dans '+zjDur(r.arrivalAt-Date.now())+'.');zjRefresh(true)}

/* ══ LECTURE D'UNE AUTRE PARTIE (compte de test) : son empire placé sur la carte, rien n'est écrit chez lui ══
   Données : parent.SBZones.peek(pseudo) → fonction serveur dev_player_map (v53). La région de test est simulée
   avec les mêmes règles que pour le compte de test (sa portée estimée : 3 + colonies), son contenu est montré. */
const ZJ_KIND_TXT={asteroides:'Champ d’astéroïdes',cristal:'Veine cristalline',epave:'Épave',debris:'Débris de combat',cargo:'Cargo abandonné',sonde_ancienne:'Sonde ancienne',anomalie:'Anomalie magnétique',habitable:'Corps habitable (colonisable)'};
const zjAmasOf=coord=>{const a=String(coord||'').split('-');return a.length>1?'amas '+a[0]+' · secteur '+a[1]:'—'};
const zjSecTxt=d=>(d/SECTOR_SIZE).toFixed(1).replace('.',',')+' secteur'+(d>=2*SECTOR_SIZE?'s':'');
function zjDate(t){const d=new Date(t);return isNaN(d)?'':d.toLocaleDateString('fr-CH',{day:'numeric',month:'long'})+' à '+zjClock(d)}
function zjSigState(g){if(!g.resolved)return'Non identifiée · une Légère la résoudrait';if(g.resolvedType==='moving')return(g.target&&g.target.status==='engaged'?'Cible mouvante · tanker en route':'Cible mouvante identifiée');if(g.fixedAddress)return'Corps fixé · '+g.fixedAddress;return'Corps orbital · une Moyenne le fixerait'}
function zjPeekSnap(d){const ws=[{id:'w:'+d.address,kind:'home',name:String(d.planet_name||d.active_name||d.pseudo||'Capitale').toUpperCase(),coord:d.address}];
 const names=new Map((d.save_worlds||[]).filter(w=>w&&w.coord).map(w=>[w.coord,w.name]));
 (d.colonies||[]).forEach(c=>{if(c&&c.address&&!ws.some(x=>x.coord===c.address))ws.push({id:'w:'+c.address,kind:'colony',name:String(c.name||names.get(c.address)||'Colonie').toUpperCase(),coord:c.address})});
 for(const w of d.save_worlds||[])if(w&&w.kind==='colony'&&w.coord&&!ws.some(x=>x.coord===w.coord))ws.push({id:'w:'+w.coord,kind:'colony',name:String(w.name||'Colonie').toUpperCase(),coord:w.coord,unpub:true});
 const ncol=ws.length-1,range=ncol>=1?3+ncol:4,ranges={};for(const w of ws)ranges[w.id]=range;   // Laboratoire inconnu : on suppose le Labo 3 (4 secteurs)
 const kt=new Map((d.known_targets||[]).filter(Boolean).map(t=>[t.key,t]));
 const sigs=(d.signatures||[]).filter(g=>g&&g.id&&g.system&&!g.ignored).map(g=>({...g,resolved:!!g.resolved,target:g.movingCoordKey&&kt.has(g.movingCoordKey)?{label:kt.get(g.movingCoordKey).label,status:kt.get(g.movingCoordKey).status}:null}));
 return{now:Date.now(),active:'home',worlds:ws.filter(w=>/^[A-Z]+-[A-Z]-\d{4}-\d{1,2}$/.test(w.coord||'')),hangars:{},ranges,range,zp:{v:1,grid:TAC_GRID.version,region:null,zones:{},journal:[]},missions:[],sigs,peek:true}}
// amas que la portée de ses mondes touche (secteurs dont un point est à portée d'un monde), avec la distance au plus proche
function zjAmasInRange(){const out=new Map();for(const w of zj.ws){const R=(zj.snap.ranges[w.id]||1)*SECTOR_SIZE,n=Math.ceil(R/SECTOR_SIZE)+1;
  for(let a=-n;a<=n;a++)for(let b=-n;b<=n;b++)for(let c=-n;c<=n;c++){const s=[w.s[0]+a,w.s[1]+b,w.s[2]+c];if(s.some(v=>Math.abs(v)>SECTOR_LIMIT))continue;
   let d2=0;for(let j=0;j<3;j++){const lo=s[j]*SECTOR_SIZE,hi=lo+SECTOR_SIZE,x=w.p[j],e=x<lo?lo-x:x>hi?x-hi:0;d2+=e*e}if(d2>R*R)continue;
   let ad;try{ad=sectorAddress(s)}catch(e){continue}const am=ad.split('-')[0],d=Math.sqrt(d2),o=out.get(am);if(!o||d<o.d)out.set(am,{d,from:w.name})}}
 return out}
function zjApplyHome(){const home=zjHome();if(!home)return false;
 players.length=0;players.push({name:zj.peek?zj.peek.pseudo:'Moi',world:home.name,sector:home.s,index:home.i,spot:home.spot,color:'#80e6d3',point:null});
 for(let j=0;j<3;j++)HOME_SECTOR[j]=home.s[j];known.clear();for(const w of zj.ws)known.add(sysKey(w.s,w.i));for(const g of zj.snap.sigs)known.add(g.system);
 zjMarks.innerHTML='';zjMarkEls.clear();zj.sel=null;zjMarkAtlasSel();zj.list=null;zj.origin=home.id;zj.k=tacLayerOf(home.p[1]);
 if(zj.mode==='atlas')flyTo(vector(home.p),900);else{zj.upp=mobile?2.6:2.2;zjCenterOn(home.p,true)}zj.objsT=0;zj.dirty=true;zjDepthUI();return true}
async function zjPeekStart(pseudo){if(!ZH||!ZH.peek)return false;toast('Lecture de la partie de '+pseudo+'…');
 let r;try{r=await ZH.peek(pseudo)}catch(e){r={ok:false,why:String(e&&e.message||e)}}
 if(!r||!r.ok){toast((r&&r.why)||'Lecture impossible.');return false}
 if(!zjPeekBuild(r.data,null,pseudo)){toast('Sa capitale n’a pas d’adresse lisible : rien n’est inventé.');return false}
 zjApplyHome();zjOpen('home');zjPrefetch();return true}
function zjPeekBuild(d,region,pseudo){const snap=zjPeekSnap(d);if(!snap.worlds.length)return false;
 zj.peek={pseudo:String(d.pseudo||pseudo||'?'),data:d,snap,explored:new Map(),knownN:0,notes:[],amas:new Map(),skipped:0};zjRefresh(true);
 if(!zjHome()){zj.peek=null;zjRefresh(true);return false}
 // région simulée : les règles du compte de test, avec sa portée (distance 3D depuis l'un de ses mondes) ; figée dans un fichier exporté
 const chk=(key,kind)=>{const p=zjPosOf(key),inR=!!p&&zj.ws.some(w=>Math.hypot(p[0]-w.p[0],p[1]-w.p[1],p[2]-w.p[2])<=(snap.ranges[w.id]||1)*SECTOR_SIZE);let hab=false;if(kind==='habitable'){try{hab=!!ZH.check(key,'habitable').habitable}catch(e){}}return{radar:inR,habitable:hab}};
 try{snap.zp.region=region||zjMakeRegion(chk);zj.peek.notes=(snap.zp.region&&snap.zp.region.notes)||[]}catch(e){console.warn('[zones] région simulée',e)}
 // zones où il connaît déjà des systèmes : systèmes relevés, rapports, signatures (au plus 30 secteurs calculés)
 const keys=new Set();const sysK=x=>{const m=String(x||'').match(/^([A-Z]+-[A-Z]-\d{4})/);return m?m[1]:null};
 for(const k of d.known_systems||[]){const s=sysK(k);if(s)keys.add(s)}for(const x of d.reports||[]){const s=sysK(x.system);if(s)keys.add(s)}for(const g of snap.sigs){const s=sysK(g.system);if(s)keys.add(s)}
 const secs=new Set();for(const k of keys){const sk=k.split('-').slice(0,2).join('-');if(!secs.has(sk)&&secs.size>=30){zj.peek.skipped++;continue}secs.add(sk);const p=zjPosOf(k);if(!p)continue;const id=zoneOfPoint(p);zj.peek.explored.set(id,(zj.peek.explored.get(id)||0)+1);zj.peek.knownN++}
 try{zj.peek.amas=zjAmasInRange()}catch(e){}
 zjRefresh(true);return true}
// « Télécharger cette carte » : la page elle-même + la partie lue, en un seul fichier HTML qui s'ouvre partout (sans compte, sans serveur)
let zjSrc=null;const ZJ_APP_TAG='<script id="appli'+'cation">';
function zjPrefetch(){if(zjSrc||!ZH||ZH.embed)return;fetch(location.href).then(r=>r.ok?r.text():null).then(t=>{if(t&&t.indexOf(ZJ_APP_TAG)>0)zjSrc=t}).catch(()=>{})}
function zjExportName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return'starbyte-carte-'+zj.peek.pseudo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.html'}
function zjExportHtml(){const emb={v:1,pseudo:zj.peek.pseudo,data:zj.peek.data,region:zj.peek.snap.zp.region,exportedAt:Date.now()};
 const inj='<script>window.SB_ZONES_EMBED='+JSON.stringify(emb).replace(/</g,'\\u003c')+'<'+'/script>\n';
 return zjSrc.replace(ZJ_APP_TAG,()=>inj+ZJ_APP_TAG).replace(/<title>[^<]*<\/title>/,()=>'<title>Starbyte · Carte de '+zjEsc(zj.peek.pseudo)+'</title>')}
function zjExport(){if(!zj.peek||!ZH||ZH.embed)return;if(!zjSrc){toast('Préparation du fichier… réessayez dans un instant.');zjPrefetch();return}
 const name=zjExportName(),file=new File([zjExportHtml()],name,{type:'text/html'});
 // iPhone, iPad : feuille de partage (Enregistrer dans Fichiers, AirDrop, Mail) ; ordinateur : téléchargement direct
 const touch=mobile||navigator.maxTouchPoints>1;
 try{if(touch&&navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:'Carte de '+zj.peek.pseudo}).catch(e=>{if(e&&e.name!=='AbortError')zjDownload(file,name)});return}}catch(e){}
 zjDownload(file,name)}
function zjDownload(file,name){const u=URL.createObjectURL(file),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},5000);toast('Carte téléchargée : '+name)}
function zjPeekStop(){if(!zj.peek)return;zj.peek=null;zjRefresh(true);zjApplyHome();zjOpen('home');toast('Retour à votre partie.')}
function zjPeekZoneHtml(){const id=zj.sel.zone,reg=zj.regionMap.get(id),z=zoneParse(id),e=zjEstimate(id),n=zj.peek.explored.get(id)||0;
 let h='<div class="zj-kind">ZONE '+zjEsc(z.q+' · '+z.r)+' · '+zjEsc(zjCtxShort(z.k))+'</div><h3>'+(reg?'Dans sa région de test':'Hors de sa région de test')+'</h3><dl class="zj-dl">';
 if(e)h+='<dt>Depuis</dt><dd>'+zjEsc(e.w.name)+' · '+zjFmt(e.dist)+' u <small>· '+(e.inRange?'à portée':'hors portée')+'</small></dd>';
 h+='<dt>Connus</dt><dd>'+(n?n+' système'+(n>1?'s':'')+' déjà relevé'+(n>1?'s':''):'aucun système relevé')+'</dd>';
 if(reg){const c=reg.content||{};h+='<dt>Contenu prévu</dt><dd>'+(!c.cat||c.cat==='rien'?'Rien · silence radio':zjEsc(ZJ_KIND_TXT[c.kind]||c.kind||c.cat))+(c.sys?' <small>· '+zjEsc(c.sys)+'</small>':'')+'</dd>'}
 h+='</dl><p class="zj-muted">Lecture seule. Le contenu prévu n’est montré qu’ici, pour juger la région : dans sa partie, il resterait caché jusqu’au sondage.</p>';return{h,f:''}}
function zjPeekHomeHtml(){const P=zj.peek,d=P.data,home=zjHome(),cols=zj.ws.filter(w=>w.kind==='colony');
 let h='<div class="zj-kind">PARTIE DE '+zjEsc(P.pseudo.toUpperCase())+' · LECTURE SEULE</div><h3>L’empire de '+zjEsc(P.pseudo)+'</h3>';
 h+='<p class="zj-muted">Sa capitale, ses colonies et ses signatures, placées sur la nouvelle carte'+(d.saved_at?' (sauvegarde du '+zjEsc(zjDate(d.saved_at))+')':'')+'. '+(ZH.embed?'Fichier exporté le '+zjEsc(zjDate(window.SB_ZONES_EMBED.exportedAt))+' : une photo de sa partie, qui ne se met pas à jour.':'Rien n’est modifié dans sa partie.')+'</p>';
 h+='<div class="zj-stats"><div><b>'+zj.ws.length+'</b><small>mondes</small></div><div><b>'+zj.snap.sigs.length+'</b><small>signatures</small></div><div><b>'+P.knownN+'</b><small>systèmes connus</small></div><div><b>'+P.explored.size+'</b><small>zones touchées</small></div></div>';
 if(home&&cols.length){h+='<div class="zj-kind">DEPUIS '+zjEsc(home.name)+' · '+zjEsc(zjAmasOf(home.coord).toUpperCase())+'</div><dl class="zj-dl">';
  for(const w of cols){const dd=Math.hypot(w.p[0]-home.p[0],w.p[1]-home.p[1],w.p[2]-home.p[2]),other=w.coord.split('-')[0]!==home.coord.split('-')[0];
   h+='<dt>'+zjEsc(w.name)+'</dt><dd>'+zjFmt(dd)+' u <small>· '+zjSecTxt(dd)+' · '+zjEsc(zjAmasOf(w.coord))+(other?' · autre amas':'')+'</small></dd>'}h+='</dl>'}
 const own=new Set(zj.ws.map(w=>w.coord.split('-')[0])),near=[...P.amas.entries()].filter(([k])=>!own.has(k)).sort((a,b)=>a[1].d-b[1].d)[0];
 if(P.amas.size)h+='<p class="zj-muted"><b>Portée estimée : '+zjEsc(zj.snap.range)+' secteurs, soit '+zjFmt(zj.snap.range*SECTOR_SIZE)+' u</b> (3 + '+cols.length+' colonie'+(cols.length>1?'s':'')+'). Ses mondes sont dans '+own.size+' amas ('+[...own].map(zjEsc).join(', ')+')'+(near?' ; l’amas voisin le plus proche ('+zjEsc(near[0])+') commence à '+zjFmt(near[1].d)+' u de '+zjEsc(near[1].from):'')+'. Transposée telle quelle en 3D, cette portée toucherait '+P.amas.size+' amas : la règle en secteurs est à recalibrer pour cette carte.</p>';
 const arks=(d.arks||[]).length,miss=(d.missions||[]).filter(m=>m&&m.status==='in_transit').length;
 if(arks||miss)h+='<p class="zj-muted">Instantané · en vol au moment de la sauvegarde (non suivi, aucune position inventée) : '+[arks?arks+' arche'+(arks>1?'s':'')+' de colonisation':'',miss?miss+' sonde'+(miss>1?'s':''):''].filter(Boolean).join(' et ')+'.</p>';
 if(P.skipped)h+='<p class="zj-muted">'+P.skipped+' système'+(P.skipped>1?'s':'')+' connu'+(P.skipped>1?'s':'')+' trop loin pour être placé'+(P.skipped>1?'s':'')+' dans cette lecture.</p>';
 if(P.notes.length)h+='<p class="zj-muted">Région simulée : '+P.notes.map(zjEsc).join(' · ')+'</p>';
 h+='<div class="zj-legend"><span><i class="k"></i>Systèmes déjà connus</span><span><i class="h"></i>Sa région de test (simulée)</span><span><i class="s"></i>Signature</span></div>';
 return{h,f:ZH.embed?'':'<button class="zj-primary" data-a="export">Télécharger cette carte (HTML)</button><button class="zj-second" data-a="peek-off">Revenir à ma partie</button>'}}

/* ── commandes du haut ── */
$('zj-m-atlas').onclick=()=>zjSetMode('atlas');$('zj-m-tac').onclick=()=>zjSetMode('tac');
$('zj-worlds').onclick=()=>zjOpen('worlds');$('zj-close').onclick=()=>{try{ZH.close()}catch(e){}};
$('zj-up').onclick=()=>zjSetLayer(zj.k+1);$('zj-down').onclick=()=>zjSetLayer(zj.k-1);
$('zj-zin').onclick=()=>{if(zj.mode==='tac')zjZoom(1/1.35);else wantedDistance=Math.max(zjMinD(),wantedDistance/1.35)};
$('zj-zout').onclick=()=>{if(zj.mode==='tac')zjZoom(1.35);else wantedDistance=Math.min(6500,wantedDistance*1.35)};
$('zj-home').onclick=()=>{if(zj.mode==='atlas'&&zj.sel&&zj.sel.type!=='zone'){const o=zjObjects().find(x=>x.id===zj.sel.id);if(o)return zjObserve(o)}const w=zjWorld(zj.origin);if(!w)return;if(zj.mode==='tac'){zj.k=tacLayerOf(w.p[1]);zj.upp=mobile?2.6:2.2;zjCenterOn(w.p,true)}else flyTo(vector(w.p),900);zjSheet()};
$('zj-sh-back').onclick=()=>{if(zj.mode==='atlas'&&zj.sel&&zj.pres.level!=='neighbourhood')return zjOpen('home');zj.sel=null;zjMarkAtlasSel();zj.dirty=true;zjOpen('home')};
$('zj-sh-tog').onclick=()=>zjSheetState(zj.sheet==='full'?'min':zj.sheet==='min'?'sum':'full');

/* ── image par image ── */
function zjViewOffset(){let x=0,y=0;if(zj.mode==='atlas'){const ins=zjInsets();x=Math.round(innerWidth/2-(ins.left+ins.right)/2);y=Math.round(innerHeight/2-(ins.top+ins.bottom)/2)}
 const want=x+','+y;if(want===zj.vo)return;const first=zj.vo!=null;zj.vo=want;if(x||y)camera.setViewOffset(innerWidth,innerHeight,x,y,innerWidth,innerHeight);else camera.clearViewOffset();camera.updateProjectionMatrix();if(first&&zjObs)zjObsDistances()}
function zjFrame(){zjRefresh(false);zjViewOffset();zjPresUpdate();zjFollowFrame();zjObsFrame();zjTrObsFrame();navSel.visible=false;navAmb.visible=false;zjCorFrame();
 if(zjZoneMesh){const z=zoneParse(zj.sel&&zj.sel.zone);if(z)zjZoneMesh.position.set(-origin.x,-origin.y,-origin.z);zjZoneMesh.visible=zj.mode==='atlas'}
 zjAtlasMarks();if(zj.mode!=='tac')return;
 const[a,b]=tacLayerY(zj.k);target.set(zj.cx,(a+b)/2,zj.cz);travel=null;zjLoad();
 const now=performance.now();if(zj.dirty||(zj.anim&&now-zj.lastDraw>(mobile?60:40))||now-zj.lastDraw>1000)zjDraw();
 if(zj.view==='zone'&&now-(zj.sheetT||0)>1000){zj.sheetT=now;const st=zj.sel&&zj.sel.zone?zjZoneState(zj.sel.zone).st:null;if(st==='mission')zjSheet()}}
function zjResize(){zj.vo=null;zjDpr=Math.min(2,devicePixelRatio||1);zjCv.width=Math.round(innerWidth*zjDpr);zjCv.height=Math.round(innerHeight*zjDpr);zjCv.style.width=innerWidth+'px';zjCv.style.height=innerHeight+'px';zj.dirty=true}
addEventListener('resize',zjResize);

/* ── démarrage : les mondes du compte remplacent les joueurs de démonstration ── */
function zjBoot(){zjPatterns();zjResize();
 if(ZH&&ZH.embed){const E=window.SB_ZONES_EMBED;if(!E||!E.data||!zjPeekBuild(E.data,E.region,E.pseudo)){$('zj-block').hidden=false;$('zj-block').querySelector('p').textContent='Ce fichier ne contient pas de partie lisible.';return false}$('zj-close').hidden=true}
 if(!ZH){$('zj-block').hidden=false;$('zj-block').querySelector('p').textContent='Cette carte s’ouvre depuis le jeu, avec le compte de test (Centre de prospection, bouton « Zones · test »).';return false}
 if(/[?&]in=jeu/.test(location.search)){$('zj-close').hidden=true;document.body.classList.add('zj-in-game')}   // dans le Centre de prospection : la croix du jeu ramène à la planète
 zjRefresh(true);const home=zjHome();if(!home){$('zj-block').hidden=false;$('zj-block').querySelector('p').textContent='Aucune adresse de monde valide dans la partie : la carte ne peut pas se placer. Rien n’est inventé.';return false}
 players.length=0;players.push({name:zj.peek?zj.peek.pseudo:'Moi',world:home.name,sector:home.s,index:home.i,spot:home.spot,color:'#80e6d3',point:null});
 for(let j=0;j<3;j++)HOME_SECTOR[j]=home.s[j];target.set(home.p[0],home.p[1],home.p[2]);
 known.clear();for(const w of zj.ws)known.add(sysKey(w.s,w.i));for(const g of zj.snap.sigs)known.add(g.system);
 zj.origin=home.id;zj.cx=home.p[0];zj.cz=home.p[2];zj.k=tacLayerOf(home.p[1]);zj.upp=mobile?2.6:2.2;
 // région de test : créée une seule fois, puis toujours relue telle quelle
 if(!zj.snap.zp.region){const reg=zjMakeRegion();if(reg){const r=ZH.saveRegion(reg);if(r&&r.ok)zjRefresh(true)}}
 document.body.classList.add('zj-tac');zjSceneVisible(false);$('zj-m-tac').classList.add('on');zjSheetState(zj.sheet);zjOpen('home');zjCenterOn(home.p,true);
 try{ZH.onChange(()=>zjRefresh(true))}catch(e){}
 return true}
const zjBooted=zjBoot();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){zjRefresh(true);zj.dirty=true}});
{const m=location.search.match(/[?&]peek=([^&]+)/);if(zjBooted&&m)setTimeout(()=>zjPeekStart(decodeURIComponent(m[1]).slice(0,40)),600)}
/* ─── Corridors : prévisualisation (cahier v1.2 §§ 19-20, étape 3 du § 22) ───
   Réseau candidat du GDD navigation § 4, tel quel (décision E2) : stations aux adresses du jeu, jonctions et relais sur de
   vrais systèmes. Longueurs mesurées sur les courbes dessinées (COR-04 : on ne facture pas la corde).
   E1 : durée = longueur ÷ vitesse du véhicule, puis le facteur de la saison de test (mêmes proportions, durées raccourcies).
   E3 : consommation proportionnelle à la longueur, dans la ressource réelle de la mission : le carburant pour un tanker.
   Toutes ces valeurs sont des réglages d'essai, affichés comme tels. Rien n'est lancé ni écrit ; les missions en vol
   gardent leurs horaires. Aucune alerte n'est inventée : le contournement est un exemple nommé comme tel. */
const ZJ_COR={v:12,k:2.5,season:25,kFuel:.35,Lref:2400,Lmin:1200,fuel:{1:50,2:150,3:400}};   // Lmin (11/11, minimum par mission) : une mission compte au moins 1 200 u de vol libre   // Lref : trajet moyen mesuré d'une capitale à un port franc (A-O-2178 : médiane 2 520 u)
const zjD3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function zjCorGraph(){if(zj.cor.g)return zj.cor.g;if(typeof navReady==='undefined'||!navReady)return null;const B=[navBase.x,navBase.y,navBase.z],Wd=v=>[v.x+B[0],v.y+B[1],v.z+B[2]],nodes={},edges=[],cors=[];
 for(const n of NET.nodes)nodes[n.id]={id:n.id,type:n.type,name:n.name,key:n.key,p:navPoint(n.key)};
 for(const c of NET.corridors){const cv=navCurves[c.id],N=c.nodes.length-1,all=[];let L=0;
  for(let i=1;i<=N;i++){const pts=[];for(let j=0;j<=16;j++)pts.push(Wd(cv.getPoint((i-1+j/16)/N)));let len=0;for(let j=1;j<pts.length;j++)len+=zjD3(pts[j],pts[j-1]);
   const a=c.nodes[i-1],b=c.nodes[i];edges.push({id:c.id+'.'+i,cor:c.id,name:c.name,cls:c.cls,a,b,len,chord:zjD3(nodes[a].p,nodes[b].p),pts});L+=len;all.push(...(i>1?pts.slice(1):pts))}
  cors.push({id:c.id,name:c.name,cls:c.cls,nodes:c.nodes,pts:all,len:L})}
 return zj.cor.g={nodes,edges,cors,len:cors.reduce((a,c)=>a+c.len,0),chord:edges.reduce((a,e)=>a+e.chord,0)}}
const zjCorNode=(g,id)=>id==='@O'?zj.cor.ctx.O:id==='@D'?zj.cor.ctx.D:g.nodes[id];
function zjCorLeg(type,a,b,len,e,pts){const cor=type==='cor';return{type,a,b,len,min:len/(ZJ_COR.v*(cor?ZJ_COR.k:1)),fu:len*(cor?ZJ_COR.kFuel:1),edge:e||null,pts}}
// itinéraire le plus court en temps ; opt.direct : le vol libre direct est permis ; opt.avoid : tronçons écartés
function zjCorPlan(O,D,opt){const g=zjCorGraph();if(!g)return null;const ids=Object.keys(g.nodes),P=id=>id==='@O'?O.p:id==='@D'?D.p:g.nodes[id].p,adj={},add=(a,l)=>(adj[a]=adj[a]||[]).push(l);
 for(const e of g.edges){if(opt.avoid&&opt.avoid.has(e.id))continue;add(e.a,zjCorLeg('cor',e.a,e.b,e.len,e,e.pts));add(e.b,zjCorLeg('cor',e.b,e.a,e.len,e,e.pts.slice().reverse()))}
 for(const n of ids){add('@O',zjCorLeg('free','@O',n,zjD3(O.p,P(n)),null,[O.p,P(n)]));add(n,zjCorLeg('free',n,'@D',zjD3(P(n),D.p),null,[P(n),D.p]))}
 if(opt.direct)add('@O',zjCorLeg('free','@O','@D',zjD3(O.p,D.p),null,[O.p,D.p]));
 const cost={'@O':0},prev={},done=new Set(),all=['@O','@D',...ids];
 for(;;){let u=null;for(const k of all)if(!done.has(k)&&cost[k]!==undefined&&(u===null||cost[k]<cost[u]))u=k;if(u===null||u==='@D')break;done.add(u);
  for(const l of adj[u]||[]){const w=cost[u]+l.min+1e-9;if(cost[l.b]===undefined||w<cost[l.b]){cost[l.b]=w;prev[l.b]=l}}}
 if(!prev['@D'])return null;const legs=[];for(let k='@D';k!=='@O';k=prev[k].a)legs.unshift(prev[k]);return zjCorSum(legs.filter(l=>l.len>1e-6))}
function zjCorSum(legs){const s={legs,len:0,min:0,fu:0,nCor:0,lenCor:0,pts:[]};for(const l of legs){s.len+=l.len;s.min+=l.min;s.fu+=l.fu;if(l.type==='cor'){s.nCor++;s.lenCor+=l.len}s.pts.push(...(s.pts.length?l.pts.slice(1):l.pts))}
 s.sig=legs.map(l=>l.a+'>'+l.b+(l.edge?':'+l.edge.id:'')).join('|');return s}
// étapes lisibles : les tronçons consécutifs d'un même corridor forment une étape
function zjCorSteps(pl){const out=[];for(const l of pl.legs){const last=out[out.length-1];if(l.type==='cor'&&last&&last.type==='cor'&&last.cor===l.edge.cor){last.to=l.b;last.len+=l.len;last.min+=l.min;last.n++}
 else out.push({type:l.type,cor:l.edge&&l.edge.cor,name:l.edge?l.edge.name:'Vol libre',cls:l.edge&&l.edge.cls,from:l.a,to:l.b,len:l.len,min:l.min,n:l.type==='cor'?1:0})}return out}
const zjMin=m=>{m=Math.max(0,m);if(m<1)return Math.round(m*60)+' s';if(m<60)return(m<10?m.toFixed(1).replace('.',','):Math.round(m))+' min';const h=Math.floor(m/60),r=Math.round(m%60);return h+' h '+String(r).padStart(2,'0')};
// devis d'essai d'un itinéraire pour ce tanker : durée de la saison de test, durée « saison normale », carburant aller-retour
// minimum par mission (décision du 11/11) : au moins le temps et le carburant de Lmin u de vol libre, quel que soit le trajet
function zjCorQuote(pl,ctx){const C=ZJ_COR,mn=C.Lmin/C.v,norm=Math.max(pl.min,mn),fu=Math.max(pl.fu,C.Lmin);return{test:norm/C.season,norm,fuel:Math.round(ctx.fuel*fu/C.Lref),floorT:pl.min<mn,floorF:pl.fu<C.Lmin}}
// contexte : un vrai tanker en vol (départ, destination, catégorie, carburant payé) ou un port depuis le monde de départ
function zjCorCtxTravel(tr){if(!tr||!tr.ok||tr.pts.length<2)return null;const w=zj.ws.find(x=>x.coord===tr.from),dP=tr.pts[tr.pts.length-1],tier=Math.max(1,Math.min(3,parseInt(String(tr.tier||1).replace(/\D/g,''),10)||1));
 return{src:'travel',id:tr.id,O:{id:'@O',name:w?w.name:tr.from,key:tr.from,p:tr.pts[0]},D:{id:'@D',name:tr.toLabel||tr.to,key:tr.to,p:dP},tier,fuel:tr.fuel!=null?tr.fuel:ZJ_COR.fuel[tier],paid:tr.fuel,veh:tr.envoy?tr.envoy.name||'vaisseau d’exception':'tanker T'+tier,tr}}
function zjCorCtxObj(o){const w=zjWorld(zj.origin)||zjHome();if(!o||!w)return null;return{src:'obj',id:o.id,O:{id:'@O',name:w.name,key:w.coord,p:w.p},D:{id:'@D',name:o.name,key:o.type==='world'?o.w.coord:o.key,p:o.p},tier:1,fuel:ZJ_COR.fuel[1],paid:null,veh:'tanker T1'}}
function zjCorCompare(ctx){if(!ctx||!zjCorGraph())return false;zj.cor.ctx=ctx;const O=ctx.O,D=ctx.D,out=[];
 const direct=zjCorSum([zjCorLeg('free','@O','@D',zjD3(O.p,D.p),null,[O.p,D.p])]);out.push({k:'libre',name:'Vol libre direct',pl:direct});
 const fast=zjCorPlan(O,D,{direct:false});
 if(fast&&fast.nCor){out.push({k:'cor',name:'Par corridors',pl:fast});
  // contournement : exemple, aucun tronçon n'est signalé dans la partie ; on écarte le tronçon le plus long de l'itinéraire rapide
  const worst=fast.legs.filter(l=>l.type==='cor').sort((a,b)=>b.len-a.len)[0],alt=worst&&zjCorPlan(O,D,{direct:false,avoid:new Set([worst.edge.id])});
  if(alt&&alt.nCor&&alt.sig!==fast.sig&&alt.sig!==direct.sig)out.push({k:'tour',name:'Contournement (exemple)',pl:alt,avoid:worst})}
 for(const x of out)x.q=zjCorQuote(x.pl,ctx);const dq=out[0].q,best=out.reduce((a,b)=>b.q.test<a.q.test?b:a);   // devis avec le minimum : un corridor qui ne fait rien gagner n'est pas « plus rapide »
 for(const x of out)x.best=x===best&&(x.k==='libre'||x.q.test<dq.test*.95)
 zj.cor.plans=out;zj.cor.pick=out.indexOf(best);zj.cor.on=true;zjCorSelBuild();return true}
function zjCorPickPlan(i){if(!zj.cor.plans||!zj.cor.plans[i])return;zj.cor.pick=i;zjCorSelBuild();zjCorFit();zjSheet()}
function zjCorFit(){const x=zj.cor.plans&&zj.cor.plans[zj.cor.pick];if(!x)return;const P=x.pl.pts,c=[0,1,2].map(j=>(Math.min(...P.map(q=>q[j]))+Math.max(...P.map(q=>q[j])))/2),R=Math.max(60,...P.map(q=>zjD3(q,c)));
 if(zj.follow&&zj.follow.on)zj.follow.susp=true;
 if(zj.mode==='atlas'){zjObsDispose();zj.pres.level='neighbourhood';flyTo(vector(c),Math.min(6400,zjFrameDist(R*1.08,.86)))}
 else{const ins=zjInsets(),ext=Math.max(...P.map(q=>Math.abs(q[0]-c[0])),...P.map(q=>Math.abs(q[2]-c[2])))*2.3;zj.upp=Math.max(ZJ_UPP[0],Math.min(ZJ_UPP[1],ext/Math.min(ins.right-ins.left,ins.bottom-ins.top)));zjCenterOn(c,true)}}
// tracé de l'itinéraire choisi dans l'Atlas : corridor en trait plein, vol libre en tirets
let zjCorSel=null;
function zjCorSelDispose(){if(!zjCorSel)return;scene.remove(zjCorSel.g);zjDisposeTree(zjCorSel.g);zjCorSel=null}
function zjCorSelBuild(){zjCorSelDispose();const x=zj.cor.plans&&zj.cor.plans[zj.cor.pick];if(!x)return;const o=x.pl.pts[0],g=new T.Group(),loc=q=>new T.Vector3(q[0]-o[0],q[1]-o[1],q[2]-o[2]);
 for(const l of x.pl.legs){const geo=new T.BufferGeometry().setFromPoints(l.pts.map(loc));
  const ln=l.type==='cor'?new T.Line(geo,new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false})):new T.Line(geo,new T.LineDashedMaterial({color:0xd7ecff,dashSize:30,gapSize:22,transparent:true,opacity:.75,depthWrite:false}));
  if(l.type!=='cor')ln.computeLineDistances();ln.frustumCulled=false;g.add(ln)}
 scene.add(g);zjCorSel={g,o}}
function zjCorNetVis(){return zj.cor.on&&zj.mode==='atlas'&&zj.pres.level!=='object'&&zj.pres.level!=='system'}
function zjCorFrame(){navRoot.visible=zjCorNetVis()&&!!zjCorGraph();if(zjCorSel){zjCorSel.g.visible=zj.cor.on&&zj.mode==='atlas'&&zj.pres.level!=='object';const o=zjCorSel.o;zjCorSel.g.position.set(o[0]-origin.x,o[1]-origin.y,o[2]-origin.z)}}
function zjCorToggle(on){zj.cor.on=on==null?!zj.cor.on:!!on;if(!zj.cor.on){zj.cor.plans=null;zjCorSelDispose()}zj.dirty=true;zjSheet()}
// Tactique (GDD navigation § 9) : la portion dans la tranche en trait plein, le reste atténué en tirets ; sorties ▲/▼ là où le
// corridor quitte la couche ; seuls les vrais nœuds de la couche sont dessinés (deux corridors qui se croisent en projection : rien)
const ZJ_COR_RGB={imperial:'189,209,255',marchand:'255,207,150',arme:'255,153,107',pirate:'255,112,128'};
function zjCorDrawTac(c,sx,sy,y0,y1,lines){const g=zj.cor.on&&zjCorGraph();if(!g)return;const inL=y=>y>=y0&&y<y1;c.save();c.lineCap='round';
 const strokePath=(P,rgb,w,selected)=>{for(let j=1;j<P.length;j++){const a=P[j-1],b=P[j],ia=inL(a[1]),ib=inL(b[1]);
   c.setLineDash(ia&&ib?[]:[5,6]);c.strokeStyle='rgba('+rgb+','+(ia&&ib?(selected?.95:.75):(selected?.4:.2))+')';c.lineWidth=ia&&ib?w:Math.max(1,w-1);c.beginPath();c.moveTo(sx(a[0]),sy(a[2]));c.lineTo(sx(b[0]),sy(b[2]));c.stroke();
   if(ia!==ib){const yb=ia?(b[1]>=y1?y1:y0):(a[1]>=y1?y1:y0),u=(yb-a[1])/((b[1]-a[1])||1e-9),X=sx(a[0]+(b[0]-a[0])*u),Y=sy(a[2]+(b[2]-a[2])*u),up=(ia?b[1]:a[1])>=y1;   // sortie de la couche
    c.setLineDash([]);c.fillStyle='rgba('+rgb+',.95)';c.font='700 11px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(up?'▲':'▼',X,Y)}}};
 for(const cr of g.cors)strokePath(cr.pts,ZJ_COR_RGB[cr.cls]||'220,220,255',2,false);
 const x=zj.cor.plans&&zj.cor.plans[zj.cor.pick];if(x)strokePath(x.pl.pts,'255,255,255',3,true);
 const se=zj.sel&&zj.sel.type==='seg'&&g.edges.find(e=>e.id===zj.sel.id);if(se)strokePath(se.pts,'255,255,255',3.4,true);
 if(lines)for(const e of g.edges)for(let j=1;j<e.pts.length;j++){const a=e.pts[j-1],b=e.pts[j];lines.push({x1:sx(a[0]),y1:sy(a[2]),x2:sx(b[0]),y2:sy(b[2]),o:{type:'seg',id:e.id}})}
 c.setLineDash([]);c.textAlign='left';c.textBaseline='middle';
 for(const n of Object.values(g.nodes)){if(!inL(n.p[1])||n.type==='station')continue;const X=sx(n.p[0]),Y=sy(n.p[2]);   // les stations ont déjà leur repère
  if(n.type==='jonction'){c.fillStyle='#0b0c1c';c.strokeStyle='#ddd0ff';c.lineWidth=2;c.beginPath();c.rect(X-5,Y-5,10,10);c.fill();c.stroke();c.fillStyle='#ddd0ff';c.font='600 10px system-ui';c.fillText(n.id,X+8,Y)}
  else{c.fillStyle='rgba(255,255,255,.85)';c.beginPath();c.arc(X,Y,2.6,0,6.283);c.fill();c.fillStyle='rgba(255,255,255,.6)';c.font='500 9px system-ui';c.fillText(n.id,X+5,Y)}}
 c.restore()}
// la fiche : comparaison courte, feuille de route dépliée de l'itinéraire choisi
function zjCorName(id){const g=zjCorGraph(),n=zjCorNode(g,id);return n?(n.type==='relais'?'relais '+n.id:n.type==='jonction'?'jonction '+n.id:n.name):id}
function zjCorHtml(){const C=zj.cor,ctx=C.ctx;if(!ctx||!C.plans)return{h:'<p class="zj-muted">Aucune comparaison en cours.</p>',f:''};
 let h='<div class="zj-kind">ITINÉRAIRES · PRÉVISUALISATION D’ESSAI</div><h3>'+zjEsc(ctx.O.name)+' → '+zjEsc(ctx.D.name)+'</h3>';
 h+='<p class="zj-muted">'+zjEsc(ctx.veh.charAt(0).toUpperCase()+ctx.veh.slice(1))+(ctx.src==='travel'?' de la mission en cours':' depuis '+zjEsc(ctx.O.name))+'. Rien n’est lancé, la mission garde ses horaires.</p>';
 C.plans.forEach((x,i)=>{h+='<button class="zj-row zj-cor'+(i===C.pick?' on':'')+'" data-a="cor-pick" data-i="'+i+'"><b>'+zjEsc(x.name)+(x.best?' <em class="zj-best">'+(x.k==='libre'?'le plus court ici':'plus rapide')+'</em>':'')+'</b><small>'+zjMin(x.q.test)+' en saison de test <span class="zj-dim">('+zjMin(x.q.norm)+' en saison normale)</span> · '+zjFmt(x.q.fuel)+' carburant · '+zjFmt(x.pl.len)+' u · '+(x.pl.nCor?x.pl.nCor+' tronçon'+(x.pl.nCor>1?'s':''):'aucun tronçon')+(x.q.floorT||x.q.floorF?' · <b class="zj-min">minimum par mission</b>':'')+'</small></button>'});
 if(!C.plans.some(x=>x.k==='cor'))h+='<p class="zj-muted">Aucun corridor ne raccourcit ce trajet : le vol libre direct reste la seule option utile.</p>';
 else if(C.plans[0].best)h+='<p class="zj-muted">Ici, rejoindre le réseau coûte plus de temps qu’il n’en fait gagner : aucun avantage n’est prêté au corridor.</p>';
 const x=C.plans[C.pick],tour=C.plans.find(p=>p.k==='tour');
 h+='<div class="zj-kind" style="margin-top:12px">FEUILLE DE ROUTE · UN SEUL ORDRE</div><ol class="zj-steps">';
 for(const s of zjCorSteps(x.pl))h+='<li><b>'+(s.type==='cor'?zjEsc(s.name):'Vol libre')+'</b> jusqu’à '+zjEsc(zjCorName(s.to))+'<small>'+zjFmt(s.len)+' u · '+zjMin(s.min/ZJ_COR.season)+(s.type==='cor'?' · '+s.n+' tronçon'+(s.n>1?'s':''):'')+'</small></li>';
 h+='</ol>';
 if(tour)h+='<p class="zj-muted">Contournement : <b>exemple</b>. Aucun tronçon n’est signalé dans ta partie ; il montre l’itinéraire si « '+zjEsc(zjCorName(tour.avoid.a))+' → '+zjEsc(zjCorName(tour.avoid.b))+' » ('+zjEsc(tour.avoid.edge.name)+') l’était.</p>';
 if(ctx.src==='travel'){const tr=ctx.tr,ph=(tr.phases||[])[0],real=ph&&ph.t1&&ph.t0?(ph.t1-ph.t0)/60000:null;h+='<p class="zj-muted">Mission réelle : vol direct, '+zjFmt(tr.L)+' u'+(real?', '+zjMin(real)+' (durée tirée au hasard en phase de test, sans lien avec la distance)':'')+(ctx.paid!=null?', '+zjFmt(ctx.paid)+' carburant payés au départ, quel que soit le trajet':'')+'.</p>'}
 h+='<p class="zj-muted zj-small">Valeurs d’essai (décisions E1 à E3) : '+ZJ_COR.v+' u/min en vol libre, ×'+String(ZJ_COR.k).replace('.',',')+' en corridor ; saison de test : durées ÷'+ZJ_COR.season+'. Carburant proportionnel à la longueur, '+Math.round(ZJ_COR.kFuel*100)+' % en corridor, égal au coût d’aujourd’hui ('+zjFmt(ctx.fuel)+') pour '+zjFmt(ZJ_COR.Lref)+' u de vol libre. Minimum par mission : '+zjMin(ZJ_COR.Lmin/ZJ_COR.v/ZJ_COR.season)+' et '+zjFmt(Math.round(ctx.fuel*ZJ_COR.Lmin/ZJ_COR.Lref))+' de carburant (l’équivalent de '+zjFmt(ZJ_COR.Lmin)+' u). Longueurs mesurées sur les courbes.</p>';
 const f='<button class="zj-primary" data-a="cor-fit">Voir l’itinéraire</button>'+'<button class="zj-second" data-a="cor-back">'+(ctx.src==='travel'?'Revenir à la mission':'Revenir au port')+'</button>'+'<button class="zj-second" data-a="cor-off">Masquer le réseau</button>';
 return{h,f}}
function zjSelectSeg(id){const g=zjCorGraph(),e=g&&g.edges.find(x=>x.id===id);if(!e)return;zj.follow=null;zjTrObsDispose();zj.sel={type:'seg',id,name:e.name,p:e.pts[e.pts.length>>1]};zj.dirty=true;zjOpen('seg')}
function zjSegHtml(){const g=zjCorGraph(),e=g&&g.edges.find(x=>x.id===zj.sel.id);if(!e)return{h:'<p class="zj-muted">Tronçon introuvable.</p>',f:''};
 const h='<div class="zj-kind">TRONÇON · RÉSEAU D’ESSAI</div><h3>'+zjEsc(e.name)+'</h3><p class="zj-muted">De '+zjEsc(zjCorName(e.a))+' à '+zjEsc(zjCorName(e.b))+' · '+zjFmt(e.len)+' u · '+zjMin(e.len/(ZJ_COR.v*ZJ_COR.k)/ZJ_COR.season)+' en corridor (saison de test). Valeurs d’essai ; rien n’est branché au jeu.</p>';
 return{h,f:'<button class="zj-second" data-a="seg-off">Fermer</button>'}}
function zjCorNetHtml(){const g=zjCorGraph();if(!g)return'';return'<p class="zj-muted">Réseau candidat (GDD navigation § 4) : '+g.cors.length+' corridors, '+g.edges.length+' tronçons, '+zjFmt(g.len)+' u mesurés sur les courbes ('+zjFmt(g.chord)+' u en cordes). Valeurs d’essai ; rien n’est branché au jeu.</p>'}

window.STARBYTE_ZONES={zj,refresh:zjRefresh,travels:()=>zj.tr.map(t=>({id:t.id,kind:t.kind,name:t.name,ok:t.ok,from:t.from,to:t.to,L:t.L,n:t.pts.length,route:t.route,status:t.status,phases:t.phases})),trState:id=>{const t=zjTrFind(id);return t&&zjTrState(t,Date.now())},
 follow:id=>zjFollow(id),followState:()=>zj.follow&&{...zj.follow},followStop:zjFollowStop,followResume:zjFollowResume,travelFit:zjTravelFit,selectTravel:zjSelectTravel,trObs:()=>!!zjTrObs,ready:()=>!!zjBooted,zoneContent:id=>zjZoneContent(id),openZoneNear:full=>{const h=zjHome();if(!h)return null;const[q0,r0]=tacCellOf(h.p[0],h.p[2]),k=tacLayerOf(h.p[1]);for(let n=3;n<9;n++)for(const[q,r]of hexRing(q0,r0,n)){const id=zoneId(q,r,k);if(zj.regionMap.has(id))continue;const e=zjEstimate(id);if(!e||!e.inRange)continue;if(full){const c=zjZoneContent(id);if(!c||c.cat==='rien')continue}return id}return null},focusGame:sel=>zjFocusGame(sel),mig:()=>zjMig(),corCompare:(kind,id)=>{const ctx=kind==='travel'?zjCorCtxTravel(zjTrFind(id)):zjCorCtxObj(zjObjects().find(x=>x.id===id));const ok=zjCorCompare(ctx);if(ok)zjOpen('cor');return ok},corState:()=>{const g=zjCorGraph(),C=zj.cor;return{on:C.on,ready:!!g,net:g&&{cors:g.cors.length,edges:g.edges.length,len:g.len,chord:g.chord,nodes:Object.keys(g.nodes).length},plans:C.plans&&C.plans.map(x=>({k:x.k,name:x.name,len:x.pl.len,min:x.pl.min,fu:x.pl.fu,nCor:x.pl.nCor,lenCor:x.pl.lenCor,test:x.q.test,norm:x.q.norm,fuel:x.q.fuel,best:x.best,sig:x.pl.sig,avoid:x.avoid&&x.avoid.edge.id,legs:x.pl.legs.map(l=>({t:l.type,a:l.a,b:l.b,len:l.len,min:l.min,e:l.edge&&l.edge.id,n:l.pts.length,p0:l.pts[0],p1:l.pts[l.pts.length-1]}))})),pick:C.pick,ctx:C.ctx&&{src:C.ctx.src,O:C.ctx.O.key,D:C.ctx.D.key,fuel:C.ctx.fuel,tier:C.ctx.tier},netVis:zjCorNetVis()&&!!zjCorGraph(),drawn:navRoot.visible,sel:!!zjCorSel}},corToggle:on=>zjCorToggle(on),zoomTo:d=>{travel=null;wantedDistance=d},posOf:a=>zjAddrPos(a),vehPos:()=>{if(!zjTrObs)return null;const g=zjTrObs.group.position,v=zjTrObs.veh.position;return[g.x+v.x+origin.x,g.y+v.y+origin.y,g.z+v.z+origin.z]},corPick:i=>zjCorPickPlan(i),corParams:()=>({...ZJ_COR}),modelState:()=>{const c=zjCat();const vis=g=>{let n=0;if(g)g.traverse(o=>{if(o.isMesh&&o.visible){let v=true;for(let q=o;q;q=q.parent)if(!q.visible){v=false;break}if(v)n++}});return n};return{cat:!!c,stations:c?c.stations.map(x=>x.sys+'='+x.code):[],ships:c?Object.keys(c.ships):[],cache:[...zjM.cache.keys()].map(u=>u.replace(/^.*\//,'')),loads:zjM.loads,fails:zjM.fails,env:!!zjM.env,obs:zjObs&&zjObs.model&&{id:zjObs.id,st:zjObs.model.st,url:zjObs.urls&&zjObs.urls[0],isModel:!!zjObs.main.userData.zjModel,meshes:vis(zjObs.main)},tr:zjTrObs&&zjTrObs.model&&{id:zjTrObs.id,st:zjTrObs.model.st,n:zjTrObs.model.n||0,urls:zjTrObs.urls||[],list:zjTrObs.model.list||[],px:zjTrObs.px,vehVis:zjTrObs.veh.visible,shown:zjTrObs.holder?zjTrObs.holder.children.filter(c=>c.visible).length:0}}},obsTex:()=>{const m=zjObs&&zjObs.main.material,c=m&&m.map&&m.map.image;if(!c)return null;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=97)h=(h*31+d[i])>>>0;return h},prism:()=>!!zjZoneMesh,demoSystem:()=>!!systemGroup,panBy:(dx,dy)=>pan(dx,dy),mem:()=>({...renderer.info.memory}),insets:()=>zjInsets(),
 objScreen:()=>{if(!zjObs)return null;const v=vector(zjObs.p),q=toLocal(v).project(camera),r=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),e=toLocal(v.clone().addScaledVector(r,zjObs.R)).project(camera);return{x:(q.x*.5+.5)*innerWidth,y:(-q.y*.5+.5)*innerHeight,rpx:Math.abs(e.x-q.x)*.5*innerWidth}},observe:id=>{const o=zjObjects().find(x=>x.id===id);if(o){zj.sel={type:o.type,id:o.id,p:o.p,zone:o.zone,name:o.name,key:o.key};zjOpen('obj');if(zj.mode==='tac')zjSetMode('atlas');else zjObserve(o)}return!!o},backN:zjBackNeighbourhood,atlasTapAt:(x,y)=>zjAtlasTap(x,y),
 obs:()=>zjObs&&{id:zjObs.id,addr:zjObs.addr,p:zjObs.p,anchor:zjObs.anchor,R:zjObs.R,dObj:zjObs.dObj,dSys:zjObs.dSys,sysR:zjObs.sysR,others:zjObs.others.map(a=>a.id),star:!!(zjObs.star&&zjObs.star.visible),uuid:zjObs.group.uuid},pres:()=>({...zj.pres,distance,wantedDistance}),texN:()=>zjTexCache.size,minD:()=>zjMinD(),screenOf:p=>{const q=toLocal(vector(p)).project(camera);return{x:(q.x*.5+.5)*innerWidth,y:(-q.y*.5+.5)*innerHeight,z:q.z}},cam:()=>({target:[target.x,target.y,target.z],distance,yaw,pitch}),exportHtml:()=>zjSrc?zjExportHtml():null,exportName:()=>zjExportName(),prefetch:zjPrefetch,peekStart:zjPeekStart,selectObj:zjSelectObj,peekStop:zjPeekStop,amas:()=>zjAmasInRange(),draw:()=>zjDraw(),tap:zjTap,pick:zjPick,setMode:zjSetMode,selectZone:zjSelectZone,objects:zjObjects,estimate:zjEstimate,
 cellOf:tacCellOf,center:tacCellCenter,layerOf:tacLayerOf,zoneOfPoint,zoneParse,sx:X=>(X-zj.cx)/zj.upp+innerWidth/2,sy:Z=>(Z-zj.cz)/zj.upp+innerHeight/2,load:zjLoad,
 atlasFocus:(p,d)=>{target.set(p[0],p[1],p[2]);distance=wantedDistance=d||500;travel=null;rebase();updateStreaming(true)},atlasTap:(x,y)=>pick(x,y),
 atlasState:()=>({sel:zj.sel,target:[target.x,target.y,target.z],mesh:!!zjZoneMesh,marks:[...zjMarkEls.values()].map(e=>{const r=e.getBoundingClientRect();return{t:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}})})};
