const {open,shot}=require('./lib.js');
let fails=0; const ok=(c,m,x)=>{console.log((c?'ok   ':'FAIL ')+m,c?'':JSON.stringify(x)); if(!c)fails++;};
(async()=>{
  const {b,c,p,errs}=await open({tier3:true,viewport:{width:390,height:844},dsf:2});
  const cdp=await c.newCDPSession(p);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  const tap=async(x,y)=>{await touch('touchStart',x,y);await p.waitForTimeout(40);await touch('touchEnd');await p.waitForTimeout(100);};
  await p.waitForTimeout(500);
  // un joueur « didacticiel masqué » comme Adrien
  await p.evaluate(()=>{G.tuto={step:0,at:Date.now(),hidden:true,seen:{m3:true}};document.querySelectorAll('#toast').forEach(t=>t.remove());__frames(2);});
  let s=await p.evaluate(()=>{const E=SBExplore._dbg,f=E.flag;return {flag:!!f,vis:f&&f.visible,inScene:!!Planet3D.scene.getObjectByName('SB_EXPLORE_FLAG'),pos:f&&f.position.toArray().map(v=>+v.toFixed(1)),tuto:SBTuto.active(),bubble:document.getElementById('sbx-flag').className};});
  ok(s.flag&&s.inScene&&s.vis,'le mât est planté dans la scène de la colonie',s);
  ok(s.bubble==='','pas de bulle tant qu\'on ne touche pas le mât',s);
  // cadrage d'ouverture : où est le mât ?
  const sc=await p.evaluate(()=>{const E=SBExplore._dbg;return E.screenOf(E.FLAG.x,E.flag.position.y+E.FLAG.h/2,E.FLAG.z).map(Math.round);});
  console.log('   mât à l\'écran (ouverture) :',sc);
  await shot(p,'s_open',1);
  // dézoom max pour le voir avec la carte entière
  await p.evaluate(()=>{const P=Planet3D;P._focusAnim=null;P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,P.controls.maxDistance);P.controls.update();P.camera.updateMatrixWorld();});
  const sc2=await p.evaluate(()=>{const E=SBExplore._dbg;return E.screenOf(E.FLAG.x,E.flag.position.y+E.FLAG.h/2,E.FLAG.z).map(Math.round);});
  await shot(p,'s_max',1);
  ok(await p.evaluate(([x,y])=>SBExplore._dbg.flagHit(x,y),sc2),'le mât répond au toucher au dézoom maximal',sc2);
  await tap(sc2[0],sc2[1]);
  s=await p.evaluate(()=>({bubble:document.getElementById('sbx-flag').className,txt:document.getElementById('sbx-flag').textContent,active:SBExplore.active}));
  ok(s.bubble==='on'&&s.txt==='Explorer'&&!s.active,'toucher le mât ouvre la bulle « Explorer » sans entrer',s);
  await p.evaluate(()=>__frames(1));
  await shot(p,'s_bubble',1);
  await tap(40,400);
  ok((await p.evaluate(()=>document.getElementById('sbx-flag').className))==='','toucher ailleurs referme la bulle');
  // vue rapprochée, de nuit
  await p.evaluate(()=>{const P=Planet3D,E=SBExplore._dbg;P.controls.target.set(E.FLAG.x,0,E.FLAG.z-10);P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,180);P.controls.update();P.camera.updateMatrixWorld();SBSky.force(0.05);SBFluid.poke();__frames(2);});
  await shot(p,'s_night',1);
  await p.evaluate(()=>{SBSky.force(1);__frames(1);});
  await shot(p,'s_day',1);
  const sc3=await p.evaluate(()=>{const E=SBExplore._dbg;return E.screenOf(E.FLAG.x,E.flag.position.y+E.FLAG.h/2,E.FLAG.z).map(Math.round);});
  console.log('   sc3',sc3,await p.evaluate(([x,y])=>({hit:SBExplore._dbg.flagHit(x,y),allowed:SBExplore._dbg.flagAllowed(),block:[...document.querySelectorAll('.w-card.on, .w-sheet.on, #sb-sheet, #sb-away, #mp-choose, #sb-notif')].map(e=>e.id||e.className)}),sc3));
  await tap(sc3[0],sc3[1]);
  ok(!(await p.evaluate(()=>!!document.querySelector('#sb-sheet, .w-sheet.on'))),'toucher le mât n\'ouvre pas la fiche d\'une parcelle derrière');
  const bb=await p.evaluate(()=>{const e=document.getElementById('sbx-flag'),r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,e.className,r.width];});
  console.log('   bulle',bb);
  await tap(bb[0],bb[1]);
  await p.waitForTimeout(400);
  console.log('   après tap bulle',await p.evaluate(()=>({active:SBExplore.active,cls:document.getElementById('sbx-flag').className,top:document.elementFromPoint(0,0)&&document.elementFromPoint(0,0).id})));
  await p.waitForFunction(()=>SBExplore.active,{timeout:15000,polling:100});
  ok(true,'la bulle ouvre le jeu des lapins');
  ok((await p.evaluate(()=>document.getElementById('sbx-flag').className))==='','la bulle se ferme en entrant');
  await p.waitForTimeout(700);
  await p.evaluate(()=>{const P=Planet3D;const f=P._focusAnim;if(f){f(performance.now()+1e6);P._focusAnim=null;}P.controls.update();__frames(1);});
  s=await p.evaluate(()=>({vis:SBExplore._dbg.flag.visible,n:SBExplore._dbg.W.rabbits.length}));
  ok(s.vis&&s.n===3,'dans l\'exploration, le mât reste visible et les lapins sont là',s);
  await shot(p,'s_explore',1);
  await p.evaluate(()=>SBExplore.exit(true));
  await p.waitForTimeout(300);
  ok(await p.evaluate(()=>SBExplore._dbg.flag.visible&&!SBExplore.active),'retour à la colonie : mât toujours là');
  // une fiche ouverte : la bulle ne s'ouvre pas
  await p.evaluate(()=>{const d=document.createElement('div');d.id='sb-sheet';document.body.appendChild(d);});
  await tap(sc3[0],sc3[1]);
  ok((await p.evaluate(()=>document.getElementById('sbx-flag').className))==='','fiche ouverte : le toucher sur le mât ne fait rien');
  await p.evaluate(()=>document.getElementById('sb-sheet').remove());
  console.log('\n',fails?'ECHECS '+fails:'TOUT OK','; erreurs page',errs.length,errs.slice(0,3));
  await b.close(); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
