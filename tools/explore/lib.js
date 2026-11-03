const { chromium } = require('playwright');
const OUT=process.env.OUT||'/tmp/';
async function open(opts={}) {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport:opts.viewport||{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:opts.dsf||1 });
  const p = await c.newPage();
  const errs=[];
  p.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message.slice(0,400)); });
  p.on('console', m => { const t=m.text(); if (/\[explore\]/.test(t)) { errs.push(t); console.log('CON', t.slice(0,300)); } });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(()=>window.Planet3D&&Planet3D.ready,{timeout:90000});
  // boucle de rendu coupée : les images sont dessinées à la main (SwiftShader est très lent)
  await p.evaluate(()=>{ Planet3D.renderer.setAnimationLoop(null); window.__frames=(n=1)=>{ for(let i=0;i<n;i++) Planet3D._frame(); }; });
  await p.evaluate((o)=>{ G.tuto={done:true}; goto('planet'); if(o.tier3&&typeof cheatAllTier3==='function'){ try{ cheatAllTier3(); }catch(e){console.log(e)} } },opts);
  await p.waitForTimeout(600);
  await p.waitForFunction(()=>window.SBExplore&&SBExplore._dbg.installed,{timeout:120000,polling:500});
  return {b,c,p,errs};
}
async function shot(p,name,n=1){ await p.evaluate(n=>__frames(n),n); await p.screenshot({path:OUT+name+'.png',timeout:60000}); }
module.exports={open,shot,OUT};
async function enterNow(p){
  await p.evaluate(()=>SBExplore.enter());
  await p.waitForFunction(()=>SBExplore.active,{timeout:15000});
  await p.waitForTimeout(650);
  await p.evaluate(()=>{ const P=Planet3D; const f=P._focusAnim; if(f){ f(performance.now()+1e6); P._focusAnim=null; } P.controls.update(); });
}
module.exports.enterNow=enterNow;
