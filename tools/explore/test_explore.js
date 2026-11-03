// Critères de validation du brief Explorer (41 vérifications). Servir github_upload/ sur localhost:8765, puis : node tools/explore/test_explore.js
const {open,shot,enterNow,OUT}=require('./lib.js');
let pass=0,fail=0; const check=(n,c,x)=>{ if(c){pass++;console.log('  ok  ',n);} else {fail++;console.log(' FAIL ',n, x===undefined?'':JSON.stringify(x));} };
(async()=>{
  const {b,c,p,errs}=await open({tier3:true});
  await p.waitForTimeout(800);
  await p.evaluate(()=>{ G.res.biomass.v=100; G.res.biomass.max=100000; document.querySelectorAll('#toast').forEach(t=>t.classList.remove('shown')); const P=Planet3D; P._focusAnim=null; P.controls.target.set(33,0,21); P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,287); P.controls.update(); P.camera.updateMatrixWorld(); });
  const cam0=await p.evaluate(()=>{const P=Planet3D;return {p:P.camera.position.toArray(),t:P.controls.target.toArray(),min:P.controls.minDistance,max:P.controls.maxDistance}});
  const visBefore=await p.evaluate(()=>Planet3D.scene.children.filter(o=>o.visible).length);
  await enterNow(p);
  const help=`window.__s=(sec,dt=.05)=>{const d=SBExplore._dbg;for(let i=0;i<sec/dt;i++)d.tick(dt)};
    window.__sc=(x,y,z)=>{const d=SBExplore._dbg;Planet3D.camera.updateMatrixWorld();const r=d.screenOf(x,y==null?d.Y0:y,z);return [r[0],r[1]]};`;
  await p.evaluate(help);
  console.log('— entrée');
  let st=await p.evaluate(()=>{const P=Planet3D,d=SBExplore._dbg;return {act:SBExplore.active,n:d.W.rabbits.length,pg:P.parcelGroup.visible,bg:P.buildGroup.visible,deco:P.decoGroup.visible,nav:getComputedStyle(document.querySelector('.w-nav')).display,top:getComputedStyle(document.querySelector('.w-top')).display,chip:document.querySelector('#sbx-chip b').textContent,hint:document.getElementById('sbx-hint').style.display,hintT:document.getElementById('sbx-hint').textContent,pick:P._pickOff,lights:P._pool.every(l=>l.intensity===0)}});
  check('exploration active, 3 lapins',st.act&&st.n===3,st);
  check('grille et bâtiments masqués',!st.pg&&!st.bg&&!st.deco,st);
  check('commandes masquées',st.nav==='none'&&st.top==='none',st);
  check('biomasse visible et exacte',/100/.test(st.chip),st.chip);
  check('consigne au premier accès',st.hint==='block'&&/carottes/.test(st.hintT),st);
  check('aucune lampe de bâtiment',st.lights);

  console.log('— lancers');
  await p.evaluate(()=>{const d=SBExplore._dbg; d.W.rabbits.forEach((r,i)=>{r.x=d.SITE.x+12;r.z=d.SITE.z+2+i*4;r.path=null;r.hop=null;r.st='wander';r.timer=99;});});
  let pt=await p.evaluate(()=>{const d=SBExplore._dbg;return __sc(d.SITE.x-8,null,d.SITE.z+6)});
  await p.touchscreen.tap(pt[0],pt[1]);
  await p.waitForTimeout(120);
  check('un toucher sur le sol lance une carotte',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  await p.touchscreen.tap(pt[0]+30,pt[1]);
  await p.waitForTimeout(120);
  check('cadence : un lancer par seconde',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  await p.evaluate(()=>__s(1.1));
  const chipR=await p.evaluate(()=>{const r=document.getElementById('sbx-chip').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]});
  await p.touchscreen.tap(chipR[0],chipR[1]); await p.waitForTimeout(80);
  const backR=await p.evaluate(()=>{const r=document.getElementById('sbx-hint').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]});
  await p.touchscreen.tap(backR[0],backR[1]); await p.waitForTimeout(80);
  check('toucher l\'interface ne lance rien',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  pt=await p.evaluate(()=>{const d=SBExplore._dbg;return __sc(d.SITE.x+13,null,d.SITE.z-4)});
  await p.touchscreen.tap(pt[0],pt[1]); await p.waitForTimeout(80);
  check('toucher un rocher ne lance rien',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  pt=await p.evaluate(()=>{const d=SBExplore._dbg;return __sc(d.SITE.x-2,null,d.SITE.z+36)});
  await p.touchscreen.tap(pt[0],pt[1]); await p.waitForTimeout(80);
  check('hors de la clairière : rien',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  // glisser n'est pas lancer
  pt=await p.evaluate(()=>{const d=SBExplore._dbg;return __sc(d.SITE.x-5,null,d.SITE.z+10)});
  await p.evaluate(()=>{window.__before=Planet3D.controls.target.toArray()});
  const cdp=await c.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt[0],y:pt[1]}]});
  for(let i=1;i<=6;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt[0]+i*12,y:pt[1]+i*8}]}); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForTimeout(150);
  check('glisser la carte ne lance rien',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===1);
  await p.evaluate(()=>{ const P=Planet3D,d=SBExplore._dbg; P.controls.update(); P.controls.target.set(d.SITE.x,0,d.SITE.z-1); P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,165); P.controls.update(); P.camera.updateMatrixWorld(); });

  console.log('— attirer, éviter, réserver');
  const r1=await p.evaluate(()=>{
    const d=SBExplore._dbg,W=d.W; W.carrots.slice().forEach(c=>{c.landed=-999}); __s(.2);
    // lapin d'un côté du rocher (13,-4), carotte de l'autre
    const [a,b,c]=W.rabbits; a.x=d.SITE.x+17; a.z=d.SITE.z-4; a.path=null; a.st='wander'; a.timer=0; b.x=d.SITE.x-16; b.z=d.SITE.z-14; b.st='wander'; b.timer=99; c.x=d.SITE.x-16; c.z=d.SITE.z-13; c.st='wander'; c.timer=99;
    W.nextThrow=0; d.throwCarrot(d.SITE.x+9,d.SITE.z-4,false); 
    let inRock=0, reached=false, st0=[];
    for(let i=0;i<300;i++){ d.tick(.05); const dd=Math.hypot(a.x-(d.SITE.x+13),a.z-(d.SITE.z-4)); if(dd<1.3) inRock++; if(!st0.includes(a.st)) st0.push(a.st); if(a.st==='nibble'){reached=true;break;} }
    return {reached,inRock,st0,x:a.x-d.SITE.x,z:a.z-d.SITE.z};
  });
  check('la carotte attire le lapin, qui contourne le rocher',r1.reached&&r1.inRock===0,r1);
  check('états : attiré puis déplacement puis grignotage',r1.st0.includes('alert')&&r1.st0.includes('move'),r1.st0);
  const r2=await p.evaluate(()=>{
    const d=SBExplore._dbg,W=d.W; __s(3.5); W.carrots.slice().forEach(c=>{c.landed=-999}); __s(.1);
    const [a,b,c]=W.rabbits; a.st='wander';a.timer=99;a.carrot=null;a.path=null;a.x=d.SITE.x+15;a.z=d.SITE.z+1; b.x=d.SITE.x-12;b.z=d.SITE.z+8;b.st='wander';b.timer=99;b.path=null; c.x=d.SITE.x-10;c.z=d.SITE.z+12;c.st='wander';c.timer=99;c.path=null;
    W.nextThrow=0; d.throwCarrot(d.SITE.x-13,d.SITE.z+13,false);
    __s(1.2);
    const res=W.rabbits.filter(r=>r.carrot).length, carrot=W.carrots[0];
    return {res, resBy:!!carrot.res};
  });
  check('deux lapins ne réservent pas la même carotte',r2.res===1&&r2.resBy,r2);
  const r3=await p.evaluate(()=>{
    const d=SBExplore._dbg,W=d.W; const hold=W.rabbits.find(r=>r.carrot); const cc=W.carrots[0];
    cc.res=null; hold.carrot=null; hold.st='wander'; hold.timer=99; W.rabbits.forEach(r=>{r.x=d.SITE.x+15;r.z=d.SITE.z-14;r.path=null;r.st='kicked';r.hop=null;});
    W.rabbits.forEach(r=>{r.st='wander';r.timer=99;r.chk=99});
    const landed=cc.landed; __s(12.2); return {left:W.carrots.length};
  });
  check('une carotte disparaît au bout de 12 s',r3.left===0,r3);

  console.log('— caisse');
  const emptyB=await p.evaluate(()=>G.res.biomass.v);
  pt=await p.evaluate(()=>{const d=SBExplore._dbg,C=d.CRATE;return __sc(C.x+C.hw-.1,d.Y0+3,C.z)});
  await p.touchscreen.tap(pt[0],pt[1]); await p.waitForTimeout(80);
  let k=await p.evaluate(()=>SBExplore._dbg.W.crate.st);
  check('toucher le bord de la caisse : fermeture',k==='closing',k);
  check('aucun lancer en touchant la caisse',await p.evaluate(()=>SBExplore._dbg.W.carrots.length)===0);
  k=await p.evaluate(()=>{__s(.3); return SBExplore._dbg.W.crate.st});
  check('fermeture à vide',k==='empty',k);
  k=await p.evaluate(()=>{__s(1.2); return {st:SBExplore._dbg.W.crate.st,a:SBExplore._dbg.W.crate.angle,bio:G.res.biomass.v}});
  check('elle se rouvre, sans rien coûter ni rapporter',k.st==='open'&&k.a===0&&k.bio===emptyB,k);
  // lapin encore dehors, sur la rampe
  const out=await p.evaluate(()=>{
    const d=SBExplore._dbg,W=d.W,C=d.CRATE,a=W.rabbits[0]; a.x=C.x; a.z=C.z+C.hd+1.5; a.path=null; a.st='wander'; a.timer=99; a.hop=null; a.chk=99;
    d.closeDoor(); const kicked=a.st; __s(.3); const st=W.crate.st; __s(1.2);
    return {kicked,st,bio:G.res.biomass.v,after:W.crate.st,x:a.x-C.x,z:a.z-C.z,alive:W.rabbits.length};
  });
  check('lapin sur la rampe : éjecté, aucun gain',out.kicked==='kicked'&&out.st==='empty'&&out.bio===emptyB&&out.alive===3,out);
  // appât par toucher à l'intérieur
  await p.evaluate(()=>{const d=SBExplore._dbg,W=d.W;W.rabbits.forEach((r,i)=>{r.x=d.SITE.x-4+i*5;r.z=d.SITE.z+2.5;r.st='wander';r.timer=99;r.chk=.01;r.path=null;r.hop=null;});W.nextThrow=0;});
  pt=await p.evaluate(()=>{const d=SBExplore._dbg,C=d.CRATE;return __sc(C.x,d.Y0,C.z+.5)});
  await p.touchscreen.tap(pt[0],pt[1]); await p.waitForTimeout(80);
  let cc=await p.evaluate(()=>SBExplore._dbg.W.carrots.map(c=>c.inCrate));
  check('toucher l\'intérieur vide y dépose une carotte',cc.length===1&&cc[0]===true,cc);
  const enterTrace=await p.evaluate(()=>{
    const d=SBExplore._dbg,W=d.W; const seq=[]; let readyAt=null, prompt=false, inCount=0;
    for(let i=0;i<500;i++){ d.tick(.05); const a=W.rabbits.find(r=>r.carrot); if(a&&seq[seq.length-1]!==a.st) seq.push(a.st); if(a&&d.fullyIn(a)&&readyAt==null){readyAt=i;} if(W.crate.promptOn){prompt=true;break;} }
    const inside=W.rabbits.filter(r=>d.fullyIn(r)).length;
    return {seq,prompt,inside,cl:document.getElementById('sbx-close').className,lab:document.getElementById('sbx-close').textContent,bio:G.res.biomass.v};
  });
  check('le lapin hésite, puis entre vraiment',enterTrace.seq.includes('hesitate')&&enterTrace.inside===1,enterTrace);
  check('libellé « Refermer » à l\'occasion',enterTrace.prompt&&/on/.test(enterTrace.cl)&&enterTrace.lab==='Refermer',enterTrace);
  await shot(p,'c_ready',1);
  const before=await p.evaluate(()=>G.res.biomass.v);
  // touchers rapides : vrais touchers + appels directs
  pt=await p.evaluate(()=>{const d=SBExplore._dbg,C=d.CRATE;return __sc(C.x,d.Y0,C.z+.5)});
  await p.touchscreen.tap(pt[0],pt[1]); await p.touchscreen.tap(pt[0],pt[1]); await p.touchscreen.tap(pt[0]+8,pt[1]);
  await p.evaluate(()=>{const d=SBExplore._dbg;for(let i=0;i<5;i++){d.closeDoor();} });
  const noThrow=await p.evaluate(()=>SBExplore._dbg.W.carrots.filter(c=>c.state==='fly').length);
  check('lapin dedans : un toucher ferme, jamais de lancer',noThrow===0,noThrow);
  const cap=await p.evaluate(()=>{ for(let i=0;i<8;i++){SBExplore._dbg.tick(.05); SBExplore._dbg.closeDoor();} const d=SBExplore._dbg,W=d.W; return {bio:G.res.biomass.v,st:W.crate.st,rs:G.explore.respawns.length,caught:G.explore.caught,cap:W.rabbits.filter(r=>r.st==='captured').length}});
  check('capture : exactement +5',cap.bio===before+5,{before,cap});
  check('un seul retour programmé',cap.rs===1&&cap.caught===1,cap);
  await p.waitForTimeout(600);
  await shot(p,'c_caught',1);
  const sav=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('starbyte_savegame'));return {bio:s.res.biomass.v,ex:s.explore}});
  check('la sauvegarde reflète le gain',sav.bio===before+5&&sav.ex&&sav.ex.caught===1&&sav.ex.ledger.length===1,sav);
  const aft=await p.evaluate(()=>{ __s(3); const d=SBExplore._dbg,W=d.W; return {bio:G.res.biomass.v,st:W.crate.st,n:W.rabbits.length,bait:W.carrots.filter(c=>c.inCrate).length}});
  check('la caisse se rouvre, 2 lapins restent, pas de gain en plus',aft.bio===before+5&&aft.st==='open'&&aft.n===2&&aft.bait===0,aft);
  const chipV=await p.evaluate(()=>document.querySelector('#sbx-chip b').textContent);
  check('compteur à jour',chipV.replace(/\D/g,'')===String(before+5),chipV);

  console.log('— reconstruction pendant l\'exploration');
  const reb=await p.evaluate(()=>{const P=Planet3D;P.sync(true);const flora=P.scene.children.find(o=>o.name==='SB_GRID_FLORA');const over=P.scene.children.find(o=>o.name==='SB_GRID_OVERLAY');return {over:over&&over.visible,pg:P.parcelGroup.visible,flora:flora&&flora.visible,cut:flora&&flora.children.every(c=>!c.isInstancedMesh||c.userData.sbxCut)}});
  check('une reconstruction ne fait pas réapparaître la colonie',reb.over===false&&reb.pg===false&&reb.flora&&reb.cut,reb);

  console.log('— sortie');
  await p.evaluate(()=>SBExplore.exit());
  await p.waitForFunction(()=>!SBExplore.active,{timeout:5000});
  await p.waitForTimeout(500);
  const cam1=await p.evaluate(()=>{const P=Planet3D;return {p:P.camera.position.toArray(),t:P.controls.target.toArray(),min:P.controls.minDistance,max:P.controls.maxDistance,pick:P._pickOff,b:P._camB}});
  const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-6);
  check('cadrage restauré exactement',near(cam1.p,cam0.p)&&near(cam1.t,cam0.t)&&cam1.min===cam0.min&&cam1.max===cam0.max,{cam0,cam1});
  const vis=await p.evaluate(()=>{const P=Planet3D;return {pg:P.parcelGroup.visible,bg:P.buildGroup.visible,n:P.scene.children.filter(o=>o.visible).length,root:P.scene.children.find(o=>o.name==='SB_EXPLORE').visible,nav:getComputedStyle(document.querySelector('.w-nav')).display,lsrc:(P._lsrc||[]).length,chip:document.querySelector('.w-chip[data-k=biomass] b').textContent}});
  check('la colonie revient entière',vis.pg&&vis.bg&&!vis.root&&vis.nav!=='none'&&vis.n===visBefore,{vis,visBefore});
  check('le compteur de la planète montre le gain',/105/.test(vis.chip),vis.chip);
  console.log('— entrer et sortir plusieurs fois');
  const counts=[];
  for(let i=0;i<3;i++){ await enterNow(p); counts.push(await p.evaluate(()=>{__s(.2);return [SBExplore._dbg.W.rabbits.length,G.res.biomass.v,document.getElementById('sbx-hint').style.display]})); await p.evaluate(()=>SBExplore.exit()); await p.waitForFunction(()=>!SBExplore.active); await p.waitForTimeout(560); }
  check('ni lapin ni gain en double, consigne plus jamais',counts.every(c=>c[0]===2&&c[1]===before+5&&c[2]==='none'),counts);
  const rsT=await p.evaluate(()=>G.explore.respawns[0]);
  check('le délai de retour n\'est pas remis à zéro',rsT>Date.now()&&rsT<=Date.now()+30000,rsT-Date.now());
  console.log('— rechargement');
  await p.evaluate(()=>{G.explore.respawns[0]=Date.now()+600000;saveGame();});
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.Planet3D&&Planet3D.ready,{timeout:90000});
  await p.evaluate(()=>{ Planet3D.renderer.setAnimationLoop(null); window.__frames=(n=1)=>{ for(let i=0;i<n;i++) Planet3D._frame(); }; goto('planet'); });
  await p.waitForFunction(()=>window.SBExplore&&SBExplore._dbg.installed,{timeout:30000});
  await p.evaluate(help);
  const rl=await p.evaluate(()=>({bio:G.res.biomass.v,ex:G.explore&&G.explore.caught,rs:G.explore&&G.explore.respawns.length}));
  check('après rechargement : biomasse et état conservés',rl.bio>=before+5&&rl.ex===1&&rl.rs===1,rl);
  await enterNow(p);
  let n2=await p.evaluate(()=>SBExplore._dbg.W.rabbits.length);
  check('après rechargement : toujours 2 lapins',n2===2,n2);
  const n3=await p.evaluate(()=>{ G.explore.respawns=[Date.now()-5]; __s(.7); const a=SBExplore._dbg.W.rabbits.length; __s(1); return [a,SBExplore._dbg.W.rabbits.length,G.explore.respawns.length] });
  check('le lapin revient à l\'heure : 3, jamais plus',n3[0]===3&&n3[1]===3&&n3[2]===0,n3);
  console.log('— quitter par un autre écran');
  await p.evaluate(()=>goto('fleet')); await p.waitForTimeout(400);
  const lf=await p.evaluate(()=>({a:SBExplore.active,cls:document.getElementById('scr-planet').className.includes('sbx-on'),pg:Planet3D.parcelGroup.visible}));
  check('aller sur un autre écran referme l\'exploration',!lf.a&&!lf.cls&&lf.pg,lf);
  console.log(`\n${pass} ok, ${fail} échec(s), erreurs page : ${errs.length}`);
  console.log(await p.evaluate(()=>SBExplore.stats()));
  await b.close();
  process.exit(fail||errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
