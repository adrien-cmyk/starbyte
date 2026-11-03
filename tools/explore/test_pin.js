// pin dans le cadrage réel d'un joueur, sans déplacer la caméra avant de regarder
const { chromium } = require('playwright');
let fail=0; const check=(n,c,x)=>{ console.log((c?'  ok   ':' FAIL  ')+n,c?'':JSON.stringify(x)); if(!c) fail++; };
(async()=>{
  for(const [name,vp] of [['iPhone 390x844',{width:390,height:844}],['Safari avec barres 393x659',{width:393,height:659}],['grand 430x932',{width:430,height:932}],['petit 375x667',{width:375,height:667}]]){
    const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--host-resolver-rules=MAP play.starbyte.test 127.0.0.1'] });
    const c = await b.newContext({ viewport:vp, hasTouch:true, isMobile:true, deviceScaleFactor:name.startsWith('iPhone')?2:1 });
    const p = await c.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://play.starbyte.test:8765/index.html',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForFunction(()=>window.Planet3D&&Planet3D.ready,{timeout:90000,polling:300});
    await p.evaluate(()=>{ Planet3D.renderer.setAnimationLoop(null); window.__frames=(n=1)=>{for(let i=0;i<n;i++)Planet3D._frame()}; G.tuto=G.tuto||{}; G.tuto.done=true; goto('planet'); });
    await p.waitForFunction(()=>SBExplore._dbg.installed,{timeout:60000,polling:300});
    await p.waitForTimeout(1300);
    const read=async()=>{await p.evaluate(()=>{SBFluid.poke();__frames(1);});await p.waitForTimeout(320);await p.evaluate(()=>{SBFluid.poke();__frames(1);});return p.evaluate(()=>{const e=document.getElementById('sbx-pin'),r=e.getBoundingClientRect(),g=document.querySelector('.p3d-goal'),t=document.querySelector('#scr-planet .w-top');const P=Planet3D;return {on:e.classList.contains('on'),x:+r.left.toFixed(0),y:+r.top.toFixed(0),w:r.width,band:Math.max(g&&g.offsetParent?g.getBoundingClientRect().bottom:0,t&&t.offsetParent?t.getBoundingClientRect().bottom:0)|0,d:P.camera.position.distanceTo(P.controls.target)|0};});};
    let s=await read();
    console.log(name,JSON.stringify(s));
    check(name+' : le pin se voit à l\'ouverture de la carte',s.on,s);
    check(name+' : le pin ne passe pas sous l\'interface',s.y+10>=s.band,s);
    if(name.startsWith('iPhone')){
      await p.screenshot({path:'/tmp/q_open.png',timeout:60000});
      // zoom d'ouverture → zoom très près : effacé
      await p.evaluate(()=>{const P=Planet3D;P._focusAnim=null;P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,P.controls.minDistance);P.controls.update();P.camera.updateMatrixWorld();});
      s=await read(); check('zoom très près : le pin s\'efface',!s.on,s);
      // dézoom complet : à sa vraie place
      await p.evaluate(()=>{const P=Planet3D;P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,P.controls.maxDistance);P.controls.update();P.camera.updateMatrixWorld();});
      const real=await p.evaluate(()=>{const E=SBExplore._dbg,C=E.CRATE;return E.screenOf(C.x,E.Y0+2,C.z);});
      s=await read();
      check('dézoomé : le pin retrouve sa vraie place sur la carte',s.on&&Math.abs(s.y+44-real[1])<2,{s,real});
      await p.screenshot({path:'/tmp/q_max.png',timeout:60000});
      // retour au cadrage d'ouverture, le toucher ouvre le jeu
      await p.evaluate(()=>{const P=Planet3D;P.camera.position.copy(P.controls.target).addScaledVector(P.camDir,470);P.controls.update();P.camera.updateMatrixWorld();});
      s=await read();
      await p.touchscreen.tap(s.x+22,s.y+22);
      await p.waitForFunction(()=>SBExplore.active,{timeout:15000,polling:100});
      check('toucher le pin ouvre le jeu des lapins',true);
      await p.evaluate(()=>SBExplore.exit(true));
      s=await read(); check('en revenant, le pin est toujours là',s.on,s);
      // didacticiel en cours : pas de pin
      await p.evaluate(()=>{G.tuto.done=false;});
      s=await read(); console.log('  (didacticiel en cours : pin',s.on?'visible':'masqué',')');
      check('pendant le didacticiel, le pin reste masqué',!s.on,s);
      await p.evaluate(()=>{G.tuto.done=true;});
    }
    if(errs.length){fail++;console.log('erreurs',errs.slice(0,3));}
    await b.close();
  }
  console.log(fail?('ECHECS '+fail):'TOUT OK');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
