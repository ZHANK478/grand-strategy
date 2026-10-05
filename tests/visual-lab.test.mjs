import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),output='visual-shots',remote=process.env.VISUAL_TEST_URL;
const server=createServer(async(req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+'/'))throw Error('path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
if(!remote)await new Promise(r=>server.listen(8765,'127.0.0.1',r));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
const base=remote||'http://127.0.0.1:8765/visual-lab.html';
const region=async page=>page.evaluate(()=>{
 const center=proj([17,49]),r=svgEl.getBoundingClientRect();
 vb={x:center[0]-115,y:center[1]-115*r.height/r.width,w:230,h:230*r.height/r.width};
 svgEl.setAttribute('viewBox',[vb.x,vb.y,vb.w,vb.h].join(' '));updateLabels();VisualLab.refresh();
});
const signature=page=>page.evaluate(()=>JSON.stringify({playerCountry,countries,worldState,provinceOwners,year,month,vb}));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
let success=false;
try{
 for(const mode of ['desktop','phone']){
  const context=await browser.newContext(mode==='phone'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
  let paidCalls=0;
  await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,route=>{
   if(/functions\/v1\/|chat\/completions|generateContent/.test(route.request().url()))paidCalls++;
   return route.abort();
  });
  const page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log(mode+' PAGE ERROR '+e.stack);});
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)missing.push(r.status()+' '+r.url());});
  await page.goto(base+'?theme=atlas',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready'&&window.VisualLab?.ready&&VisualLab.physicalCount?.rivers>0,{},{timeout:45000});
  assert.deepEqual(await page.evaluate(()=>VisualLab.physicalCount),{mountains:129,rivers:187});
  assert.equal(await page.locator('#map-svg image').count(),0,'Raster relief is removed');
  if(mode==='phone'){
   await page.click('#mobile-fullscreen-button');
   await page.waitForFunction(()=>!!document.fullscreenElement,{},{timeout:5000});
   assert.equal(await page.locator('#mobile-fullscreen-button').isVisible(),false);
   await page.evaluate(()=>document.exitFullscreen());
   await page.waitForFunction(()=>!document.fullscreenElement);
  }
  await page.selectOption('#mobile-country-picker','Франция');
  await page.click('#mobile-start-btn');
  await page.waitForFunction(()=>gameStarted&&document.getElementById('main-menu').style.display==='none',{},{timeout:10000});
  await region(page);await settle(page);
  const sourceGeometry=await page.evaluate(()=>JSON.stringify(scenarioProvinces.map(p=>p.geometry)));
  const seen=[];
  for(const theme of ['atlas','political','cabinet']){
   const before=await signature(page);
   if(mode==='phone')await page.selectOption('#vl-theme-select',theme);
   else await page.click('[data-vl-theme="'+theme+'"]');
   await settle(page);
   assert.equal(await signature(page),before,'Theme preserves all game state and camera');
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.visualTheme),theme);
   assert.equal(await page.evaluate(()=>new URL(location.href).searchParams.get('theme')),theme);
   const styles=await page.evaluate(()=>({
    ocean:getComputedStyle(document.querySelector('#mobile-world-content>rect')).fill,
    border:document.getElementById('vl-country-borders').getAttribute('stroke'),
    land:document.querySelector('path.scenario-province').getAttribute('fill'),
    regions:getComputedStyle(document.getElementById('vl-mountains')).display
   }));
   assert.ok(styles.border,'Theme defines border colour');seen.push(styles);
   await page.click('#mobile-flag-button');
   assert.ok(await page.locator('#left-panel').isVisible());
   await page.screenshot({path:output+'/'+theme+'-'+mode+'.png'});
   await page.locator('#left-panel .sheet-close').click();
  }
  assert.equal(new Set(seen.map(s=>s.ocean)).size,3,'All three oceans differ');
  assert.equal(new Set(seen.map(s=>s.land)).size,3,'All three land treatments differ');
  assert.equal(seen[1].regions,'none','Political theme removes physical decoration');
  assert.equal(await page.evaluate(()=>JSON.stringify(scenarioProvinces.map(p=>p.geometry))),sourceGeometry,'Original scenario coordinates unchanged');

  // The actual foreign-country route and economy controls remain available.
  await page.evaluate(()=>openCountryRelations(ALL_COUNTRIES.find(n=>/Пруссия/.test(n))));
  assert.ok(await page.locator('#mobile-country-card').isVisible());
  assert.match(await page.locator('#mobile-card-name').innerText(),/Пруссия/);
  await page.evaluate(()=>openCountryRelations(ALL_COUNTRIES.find(n=>/Австри/.test(n))));
  assert.match(await page.locator('#mobile-card-name').innerText(),/Австри/);
  await page.evaluate(()=>mobileDismissCard());
  await page.click('#mobile-actions-button');
  await page.locator('#mobile-actions-menu button').filter({hasText:'Экономика'}).click();
  assert.ok(await page.locator('#economy-panel').isVisible());
  await page.screenshot({path:output+'/cabinet-economy-'+mode+'.png'});
  await page.evaluate(()=>mobileSection('map'));

  // Real pointer camera input, including native touch pinch.
  await region(page);const initial=await page.evaluate(()=>({...vb}));
  if(mode==='phone'){
   const cdp=await context.newCDPSession(page);
   const point=(x,y)=>({x,y,radiusX:3,radiusY:3,force:1,id:x<600?1:2});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(500,210),point(700,210)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(460,210),point(740,210)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await page.mouse.move(900,450);await page.mouse.wheel(0,-200);
  }
  await page.waitForFunction(w=>vb.w<w,initial.w,{timeout:5000});
  const zoomed=await page.evaluate(()=>({...vb}));
  await page.mouse.move(mode==='phone'?600:1000,mode==='phone'?210:460);
  await page.mouse.down();await page.mouse.move(mode==='phone'?650:1080,mode==='phone'?220:480,{steps:6});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>vb.x),zoomed.x,'Drag camera works');
  await settle(page);
  const lines=await page.evaluate(()=>[...document.querySelectorAll('#vl-country-borders,#vl-inner-borders,#vl-coast')].map(n=>({width:Number(n.getAttribute('stroke-width')),effect:n.getAttribute('vector-effect')})));
  assert.ok(lines.every(n=>n.effect==='non-scaling-stroke'&&n.width<=1.25),'Borders remain thin at zoom');
  const dynamic=await page.evaluate(()=>{
   const p=scenarioProvinces.find(p=>p.owner==='Франция'),old=provinceOwners[p.id],path=document.getElementById('vl-country-borders');
   const before=path.getAttribute('d');provinceOwners[p.id]=ALL_COUNTRIES.find(n=>n!==p.owner);recolorProvinces();VisualLab.refresh();
   const changed=path.getAttribute('d')!==before;
   if(old===undefined)delete provinceOwners[p.id];else provinceOwners[p.id]=old;
   recolorProvinces();VisualLab.refresh();
   const oldWidth=innerBorderWidth;setInnerBorderWidth(0);VisualLab.refresh();
   const hidden=document.getElementById('vl-inner-borders').style.opacity==='0';setInnerBorderWidth(oldWidth);VisualLab.refresh();
   return {changed,hidden,edges:VisualLab.edgeCount,borders:VisualLab.borderCounts};
  });
  assert.ok(dynamic.changed&&dynamic.hidden,'Ownership and user border slider remain functional');
  assert.equal(dynamic.edges,28952,'Shared edges are deduplicated');
  await page.evaluate(()=>saveGame());
  const isolation=await page.evaluate(()=>({lab:Object.keys(localStorage).some(k=>k.startsWith('gs_visual_lab_save_')),production:Object.keys(localStorage).some(k=>k.startsWith('gs_economyworld_save_'))}));
  assert.ok(isolation.lab&&!isolation.production,'Preview saves are isolated');

  // Newspaper receives a deterministic display fixture, never a live model request.
  await page.evaluate(()=>{
   renderNewspaper({from:dateLabel(),to:dateLabel(),domestic:[{headline:'Новый курс школьной реформы',body:'Правительство открыло школы девочкам. В городах решение встречают с надеждой; представители духовенства спорят о том, кто будет определять школьную программу. Учителям предстоит принять новых учениц, а казначейству — найти средства на классы и учебники.',details:'Образовательный доступ изменён. Пример оформления газеты.'}],foreign:[{headline:'Лондон следит за положением на континенте',body:'Британский кабинет намерен обсудить безопасность торговых путей с соседними державами. Дипломаты готовят условия встречи, оставляя вопрос о военных обязательствах открытым.',details:'Демонстрационный текст для визуальной проверки.'}],archive:{domestic:[],foreign:[]}});
   mobileSection('news');
  });
  for(const theme of ['atlas','political','cabinet']){
   if(mode==='phone')await page.selectOption('#vl-theme-select',theme);
   else await page.click('[data-vl-theme="'+theme+'"]');
   await settle(page);
   await page.screenshot({path:output+'/'+theme+'-news-'+mode+'.png'});
  }
  assert.equal(paidCalls,0,'No AI requests attempted');
  assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(missing,[],'No missing local resources');
  results.push({mode,checks:'startup, native fullscreen, theme invariance, country switch, economy, touch/wheel/drag, border mesh, ownership, saves, newspaper',physical:await page.evaluate(()=>VisualLab.physicalCount),lines,isolation,paidCalls,errors,missing});
  console.log('PASS '+mode+' '+JSON.stringify(results.at(-1)));
  await context.close();
 }
 success=true;
}finally{
 await writeFile(output+'/report.json',JSON.stringify({success,results},null,2));
 await browser.close();if(!remote)server.close();
}
