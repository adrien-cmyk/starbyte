const {open,shot,enterNow}=require('./lib.js');
let fails=0,okc=0; const ok=(c,m,x)=>{ if(c){okc++;console.log('ok  ',m);} else {fails++;console.log('FAIL',m,x===undefined?'':JSON.stringify(x));} };
(async()=>{
  const {b,c,p,errs}=await open({tier3:false,viewport:{width:390,height:844},dsf:1});
  const cdp=await c.newCDPSession(p);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  const tap=async(x,y)=>{await touch('touchStart',x,y);await p.waitForTimeout(30);await touch('touchEnd');await p.waitForTimeout(80);};
  const drag=async(x0,y0,x1,y1,n=6)=>{await touch('touchStart',x0,y0);for(let i=1;i<=n;i++){await touch('touchMove',x0+(x1-x0)*i/n,y0+(y1-y0)*i/n);}await touch('touchEnd');await p.waitForTimeout(60);};
  await p.waitForTimeout(300);
  await p.evaluate(()=>{document.querySelectorAll('#toast').forEach(t=>t.remove());});
  const sum0=await p.evaluate(()=>{window.__sumF=()=>{let s=0;Planet3D.scene.children.forEach(o=>{if(o.isInstancedMesh){const a=o.instanceMatrix.array;for(let i=0;i<a.length;i+=7)s+=Math.abs(a[i]);}});return +s.toFixed(1)};return __sumF();});
  const cam0=await p.evaluate(()=>{const P=Planet3D,c=P.camera;return {p:c.position.toArray(),t:P.controls.target.toArray(),fov:c.fov,near:c.near,far:c.far,min:P.controls.minDistance,max:P.controls.maxDistance};});
  await enterNow(p);
  ok(await p.evaluate(()=>SBStand._dbg.built),'le stand est construit à l\'entrée de l\'exploration');
  ok(await p.evaluate(()=>SBStand._dbg.cuts>0),'les arbres du couloir sont masqués',await p.evaluate(()=>SBStand._dbg.cuts));
  ok(await p.evaluate(()=>SBExplore.api.extra.obstacles.length===4),'obstacles déclarés aux lapins');

  // accès
  const mp=await p.evaluate(()=>{const d=SBStand._dbg;const P=Planet3D;P._focusAnim=null;P.controls.target.set(d.POST.x,0,d.POST.z-14);P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,200);P.controls.update();P.camera.updateMatrixWorld();__frames(1);return SBExplore.api.screenOf(d.TGT.x,5,d.TGT.z+6);});
  await tap(mp[0],mp[1]);
  ok(await p.evaluate(()=>document.getElementById('sbs-offer').classList.contains('on')),'toucher le stand propose « S\'entraîner »',mp);
  ok((await p.evaluate(()=>document.getElementById('sbs-offer').textContent))==="S'entraîner",'libellé de la bulle');
  await p.evaluate(()=>__frames(1));
  await shot(p,'stand_offer',1);
  await tap(40,250);
  ok(!(await p.evaluate(()=>document.getElementById('sbs-offer').classList.contains('on'))),'toucher ailleurs retire la bulle');
  await tap(mp[0],mp[1]);
  const pb=await p.evaluate(()=>{const r=document.getElementById('sbs-offer').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];});
  const camE=await p.evaluate(()=>{const P=Planet3D,c=P.camera;return {p:c.position.toArray(),t:P.controls.target.toArray(),fov:c.fov,near:c.near,far:c.far,min:P.controls.minDistance,max:P.controls.maxDistance};});
  await tap(pb[0],pb[1]);
  await p.waitForFunction(()=>SBStand.on,{timeout:8000,polling:100});
  ok(true,'« S\'entraîner » ouvre la vue à la première personne');
  await p.waitForTimeout(400);
  const hud=()=>p.evaluate(()=>({s:document.getElementById('sbs-shots').textContent,c:document.getElementById('sbs-score').textContent,st:SBStand.state,shots:SBStand._dbg.FP.shots,score:SBStand._dbg.FP.score}));
  let h=await hud();
  ok(h.s==='Tirs : 0/4'&&h.c==='Score : 0'&&h.st==='ready','affichage au départ',h);
  const camFP=await p.evaluate(()=>Planet3D.camera.position.toArray());
  ok(Math.abs(camFP[0]+14)<.01&&Math.abs(camFP[2]-66)<.01,'caméra au poste de tir',camFP);

  // préparation : temps maîtrisé
  await p.evaluate(()=>{const d=SBStand._dbg;window.__adv=(sec)=>{for(let t=0;t<sec;t+=.05)d.tick(.05);};d.FP.noSway=true;window.__aim=(x,y)=>{d.FP.kp=0;d.FP.ky=0;d.aimAt(x,y);};window.__toReady=()=>{let n=0;while(SBStand.state!=='ready'&&n++<400)d.tick(.05);return SBStand.state;};});

  // l'interface ne tire pas ; glisser vise sans tirer
  const y0=await p.evaluate(()=>SBStand._dbg.FP.yaw);
  await drag(120,300,180,330);
  h=await hud();
  ok(h.shots===0&&h.st==='ready','glisser dans la scène ne tire pas',h);
  ok((await p.evaluate(()=>SBStand._dbg.FP.yaw))>y0,'glisser vers la droite tourne la visée vers la droite');
  await drag(120,300,1000,300);
  const ylim=await p.evaluate(()=>SBStand._dbg.FP.yaw*180/Math.PI);
  ok(Math.abs(ylim-15)<.01||ylim<=15,'visée limitée au stand',ylim);
  for(const sel of ['#sbs-top','#sbs-best']){const r=await p.evaluate(s=>{const q=document.querySelector(s).getBoundingClientRect();return [q.left+q.width/2,q.top+q.height/2]},sel);await tap(r[0],r[1]);}
  h=await hud(); ok(h.shots===0,'toucher les pastilles ne tire pas',h);

  // Tirer : une pression, un tir
  const fb=await p.evaluate(()=>{const q=document.getElementById('sbs-fire').getBoundingClientRect();return [q.left+q.width/2,q.top+q.height/2];});
  await p.evaluate(()=>__aim(0,0));
  await touch('touchStart',fb[0],fb[1]);
  ok((await p.evaluate(()=>SBStand.state))==='charge','toucher « Tirer » lance la charge dès le contact',await p.evaluate(()=>SBStand.state));
  await p.evaluate(()=>{__adv(.1);__adv(.1);});
  ok((await hud()).shots===1,'la décharge part après la montée en énergie',await hud());
  await p.evaluate(()=>__adv(2.5));   // doigt toujours posé
  ok((await hud()).shots===1,'rester appuyé ne déclenche pas de second tir',await hud());
  await touch('touchEnd');

  // récupération
  await p.evaluate(()=>{__toReady();__aim(.0,.0);SBStand.fire();__adv(.2);});
  ok((await hud()).st==='recovery','état récupération après le tir',await hud());
  ok(!(await p.evaluate(()=>SBStand.fire())),'pas de tir pendant la récupération');
  const rec=await p.evaluate(()=>{const d=SBStand._dbg;let t=0;while(SBStand.state==='recovery'&&t<3){d.tick(.01);t+=.01;}return t+.2-.12;});
  ok(rec>.9&&rec<1.15,'environ une seconde entre les tirs',rec);
  h=await hud(); ok(h.score===200&&h.shots===2,'deux tirs au même endroit marquent tous les deux',h);

  // série de 4 centres
  await p.evaluate(()=>{for(let i=0;i<2;i++){__toReady();__aim(0,0);SBStand.fire();__adv(.2);}});
  h=await hud(); ok(h.score===400&&h.shots===4,'quatre centres = 400',h);
  ok(!(await p.evaluate(()=>SBStand.fire())),'pas de cinquième tir');
  await p.evaluate(()=>__adv(1));
  ok((await hud()).st==='result','état résultat après le dernier tir',await hud());
  const line=await p.evaluate(()=>document.getElementById('sbs-rline').textContent);
  ok(line==='400 / 400 — Nouveau record personnel','message de fin',line);
  ok((await p.evaluate(()=>G.explore.standBest))===400,'record enregistré');
  ok(!(await p.evaluate(()=>SBStand.fire())),'pas de tir pendant le résultat');
  ok(await p.evaluate(()=>SBStand._dbg.FX.shards.count>0),'les dégâts sont visibles à la fin de la série');
  await p.evaluate(()=>{SBStand._dbg.CFG.timeScale=.0;__frames(1);});
  await shot(p,'stand_result',1);
  await p.evaluate(()=>{SBStand._dbg.CFG.timeScale=1;});

  // remplacement
  await p.evaluate(()=>{const d=SBStand._dbg;let n=0;while(SBStand.state==='result'&&n++<100)d.tick(.02);});
  ok((await hud()).st==='replacing','le remplacement démarre seul',await hud());
  ok(!(await p.evaluate(()=>SBStand.fire())),'pas de tir pendant le remplacement');
  ok((await p.evaluate(()=>{const q=document.getElementById('sbs-again');return document.getElementById('sbs-result').classList.contains('on')&&q.textContent}))==='Rejouer','« Rejouer » proposé pendant la transition');
  // images de la chorégraphie
  const frames=await p.evaluate(()=>SBStand._dbg.REP_T);
  const times=[.4,frames.swing+.3,frames.grab+.1,frames.lift+.25,frames.out+.22,frames.back+.25,frames.lower+.3];
  let k=0;
  for(const t of times){
    await p.evaluate((t)=>{const d=SBStand._dbg;d.CFG.timeScale=0;d.FP.repT=t;d.tick(.016);__frames(1);},t);
    await shot(p,'stand_rep'+(k++),1);
  }
  await p.evaluate(()=>{const d=SBStand._dbg;d.CFG.timeScale=1;});
  // sans « Rejouer » : on attend
  await p.evaluate(()=>{const d=SBStand._dbg;let n=0;while(SBStand.state==='replacing'&&n++<600)d.tick(.02);});
  ok((await hud()).st==='waiting','sans « Rejouer », la série ne redémarre pas',await hud());
  ok(!(await p.evaluate(()=>SBStand.fire())),'pas de tir tant qu\'on n\'a pas choisi de rejouer');
  const clean=await p.evaluate(()=>{const d=SBStand._dbg;const g=d.targetCtx,R=d.TARGET_R*d.C_K,cx=d.C_W/2,cy=d.C_CY;const col=(x,y)=>{const v=g.getImageData(Math.round(x),Math.round(y),1,1).data;return v[0]>200&&v[1]>180?'creme':v[0]>120&&v[1]<70?'rouge':'autre:'+v[0]+','+v[1]+','+v[2];};
    const out=[];for(const f of [.25,.5,.75,1]){out.push([f,col(cx+f*R-5,cy),col(cx+f*R+5,cy)]);}
    return {shards:d.FX.shards.count,emb:d.FX.embers.filter(e=>e.visible).length,rings:out,center:col(cx+12,cy),rx:d.FX.pivot.rotation.x,py:d.FX.pivot.position.y-d.FX.Y,x:d.FX.pivot.position.x,z:d.FX.pivot.position.z};});
  ok(clean.shards===0&&clean.emb===0,'aucune trace sur la nouvelle cible',clean);
  ok(Math.abs(clean.rx)<1e-6&&Math.abs(clean.py-.3)<1e-6,'nouvelle cible debout, à sa place',clean);
  console.log('    anneaux peints (intérieur, extérieur) :',JSON.stringify(clean.rings));
  ok(clean.rings[0][1].startsWith('rouge')&&clean.rings[0][2].startsWith('creme')&&clean.rings[1][1].startsWith('creme')&&clean.rings[1][2].startsWith('rouge')&&clean.rings[2][1].startsWith('rouge')&&clean.rings[2][2].startsWith('creme')&&clean.rings[3][1].startsWith('creme'),'les anneaux peints tombent exactement aux rayons de score',clean.rings);
  ok(clean.rings[0][1].startsWith('rouge'),'centre rouge');
  await p.evaluate(()=>{const d=SBStand._dbg;d.FP.noSway=true;for(let i=0;i<60;i++)d.tick(.02);__frames(1);});
  await shot(p,'stand_new',1);
  // Rejouer : quatre ratés
  await p.evaluate(()=>SBStand.replay());
  ok((await hud()).st==='ready','« Rejouer » lance une nouvelle série',await hud());
  h=await hud(); ok(h.s==='Tirs : 0/4'&&h.c==='Score : 0','compteurs remis à zéro',h);
  await p.evaluate(()=>{for(let i=0;i<4;i++){__toReady();__aim(9,6);SBStand.fire();__adv(.2);}__adv(1);});
  h=await hud(); ok(h.score===0&&h.shots===4,'quatre ratés = 0, chacun consomme un tir',h);
  const line2=await p.evaluate(()=>document.getElementById('sbs-rline').textContent);
  ok(line2==='0 / 400 — Record : 400','pas de record quand on fait moins bien',line2);
  ok((await p.evaluate(()=>G.explore.standBest))===400,'le record reste');

  // Rejouer tôt : démarre seulement quand la cible est prête
  await p.evaluate(()=>{SBStand.replay();__adv(.3);});
  ok((await hud()).st==='result'||(await hud()).st==='replacing','toujours en transition après « Rejouer » anticipé',await hud());
  ok((await p.evaluate(()=>document.getElementById('sbs-again').textContent))==='Cible en préparation…','le bouton indique l\'attente');
  await p.evaluate(()=>{const d=SBStand._dbg;let n=0;while(SBStand.state!=='ready'&&n++<600)d.tick(.02);});
  const rd=await p.evaluate(()=>({st:SBStand.state,t:SBStand._dbg.FP.repT,end:SBStand._dbg.REP_END,sh:SBStand._dbg.FP.shots}));
  ok(rd.st==='ready'&&rd.t>=rd.end&&rd.sh===0,'la série repart seulement quand la cible est prête',rd);
  // les valeurs de chaque anneau
  const sc=await p.evaluate(()=>{const d=SBStand._dbg,R=d.TARGET_R,o=[];for(const [f,pts] of [[.2,100],[.3,75],[.6,50],[.9,25],[1.02,0]]){d.FP.kp=0;d.FP.ky=0;d.aimAt(f*R,0);const a=d.currentAim(),h=d.traceShot(Planet3D.camera.position.clone(),d.dirOf(a.yaw,a.pitch));o.push([f,h.pts,pts,h.kind]);}return o;});
  ok(sc.every(x=>x[1]===x[2]),'points par anneau',sc);
  // le tir atteint exactement le point visé, oscillation comprise
  const prec=await p.evaluate(()=>{const d=SBStand._dbg;d.FP.noSway=false;d.FP.t=3.7;d.FP.kp=1.2;d.FP.ky=-.3;const a=d.currentAim(),dir=d.dirOf(a.yaw,a.pitch);d.tick(0);const P=Planet3D,f=new (SB3D.THREE.Vector3)();P.camera.getWorldDirection(f);return f.angleTo(dir);});
  ok(prec<2e-3,'le réticule montre exactement la direction du tir',prec);
  await p.evaluate(()=>{const d=SBStand._dbg;d.FP.noSway=true;});

  // retour à tout moment
  for(const st of ['ready','charge','recovery','replacing']){
    await p.evaluate(async(st)=>{const d=SBStand._dbg;
      if(st==='charge'){__toReady();SBStand.fire();}
      if(st==='recovery'){__toReady();SBStand.fire();__adv(.2);}
      if(st==='replacing'){for(let i=0;i<4;i++){__toReady();__aim(0,0);SBStand.fire();__adv(.2);}__adv(1.5);}
    },st);
    const s0=await p.evaluate(()=>SBStand.state);
    const bk=await p.evaluate(()=>{const q=document.getElementById('sbs-back').getBoundingClientRect();return [q.left+q.width/2,q.top+q.height/2];});
    await tap(bk[0],bk[1]);
    await p.waitForFunction(()=>!SBStand.on,{timeout:8000,polling:100});
    await p.waitForTimeout(350);
    const cam=await p.evaluate(()=>{const P=Planet3D,c=P.camera;return {p:c.position.toArray(),t:P.controls.target.toArray(),fov:c.fov,near:c.near,far:c.far,min:P.controls.minDistance,max:P.controls.maxDistance,en:P.controls.enabled,hud:getComputedStyle(document.getElementById('sbs-hud')).display,ex:getComputedStyle(document.getElementById('sbx-hud')).display,shots:SBStand._dbg.FP.shots,rx:SBStand._dbg.FX.pivot.rotation.x,sh:SBStand._dbg.FX.shards.count};});
    const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-6);
    ok(same(cam.p,camE.p)&&same(cam.t,camE.t)&&cam.fov===camE.fov&&cam.near===camE.near&&cam.far===camE.far&&cam.min===camE.min&&cam.max===camE.max&&cam.en,`retour depuis l'état ${s0} : cadrage restauré`,{cam,camE});
    ok(cam.hud==='none'&&cam.ex!=='none'&&cam.rx===0&&cam.sh===0&&cam.shots===0,`retour depuis l'état ${s0} : interface et cible remises`,cam);
    await p.evaluate(()=>{SBStand.open();});
    await p.waitForFunction(()=>SBStand.on,{timeout:8000,polling:100});
    await p.waitForTimeout(350);
    await p.evaluate(()=>{const d=SBStand._dbg;d.FP.noSway=true;});
    const st2=await p.evaluate(()=>SBStand.state);
    ok(st2==='ready','on peut revenir au stand ensuite',st2);
  }
  // quitter toute l'exploration pendant le stand
  await p.evaluate(()=>{SBExplore.exit(true);});
  await p.waitForTimeout(300);
  const out=await p.evaluate(()=>{const P=Planet3D,c=P.camera;return {on:SBStand.on,act:SBExplore.active,p:c.position.toArray(),t:P.controls.target.toArray(),fov:c.fov,near:c.near,far:c.far,min:P.controls.minDistance,max:P.controls.maxDistance,en:P.controls.enabled,sum:__sumF(),cuts:SBStand._dbg.cuts,passes:P.composer.passes.map(x=>x.enabled)};});
  const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-4);
  ok(!out.on&&!out.act,'quitter l\'exploration ferme aussi le stand',out);
  ok(same(out.p,cam0.p)&&same(out.t,cam0.t)&&out.fov===cam0.fov&&out.near===cam0.near&&out.far===cam0.far&&out.min===cam0.min&&out.max===cam0.max,'la vue de la colonie revient à l\'identique',{out,cam0});
  ok(Math.abs(out.sum-sum0)<.5&&out.cuts===0,'la forêt de la colonie est intacte',{s:out.sum,s0:sum0,c:out.cuts});
  ok(out.passes[1]===false,'le garde-fou d\'image est coupé hors du stand',out.passes);
  // persistance
  await p.evaluate(()=>{ if(typeof saveGame==='function') saveGame(); });
  await p.waitForTimeout(500);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>typeof G!=='undefined'&&window.Planet3D&&Planet3D.ready,{timeout:90000});
  await p.waitForTimeout(800);
  ok((await p.evaluate(()=>G.explore&&G.explore.standBest))===400,'le record survit à la fermeture du jeu',await p.evaluate(()=>G.explore));
  console.log('\nRESULTAT',okc,'ok,',fails,'échec(s) ; erreurs page',errs.length,errs.slice(0,3));
  await b.close();
  process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
