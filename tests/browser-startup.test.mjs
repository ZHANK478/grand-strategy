import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+'/'))throw Error('path');
  const data=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
let failures=0;
try{
 for(const mode of ['desktop','phone']){
  const context=await browser.newContext(mode==='phone'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
  await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,r=>r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.stack);console.log(mode+' PAGE ERROR '+e.stack);});
  try{
   await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load',timeout:60000});
   await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
   console.log(mode+' BEFORE '+JSON.stringify(await page.evaluate(()=>({status:window.GS_MAP_LOAD,start:typeof window.mobileStartGame,fullscreen:typeof window.mobileFullscreen,picker:document.getElementById('mobile-country-picker').value,disabled:document.getElementById('mobile-start-btn').disabled}))));
   await page.selectOption('#mobile-country-picker','Франция');
   await page.click('#mobile-start-btn',{timeout:10000});
   await page.waitForFunction(()=>typeof gameStarted!=='undefined'&&gameStarted&&document.getElementById('main-menu').style.display==='none',{},{timeout:10000});
   const state=await page.evaluate(()=>({player:playerCountry,countries:Object.keys(countries).length,ports:worldState.maritime?.ports.length,fleets:worldState.maritime?.fleets.length}));
   assert.equal(state.player,'Франция');assert.ok(state.ports>0&&state.fleets>0);console.log(mode+' STARTED '+JSON.stringify(state));
   await page.evaluate(()=>{window.__fullscreenCalls=0;document.documentElement.requestFullscreen=async()=>{window.__fullscreenCalls++;};});
   await page.click('#mobile-fullscreen-button',{timeout:5000});
   assert.equal(await page.evaluate(()=>window.__fullscreenCalls),1);
   await page.click('#mobile-flag-button');
   assert.equal(await page.locator('#left-panel').evaluate(el=>getComputedStyle(el).display!=='none'),true);
   assert.equal(errors.length,0,'Uncaught errors: '+errors.join('\n'));
   console.log(mode+' PASSED start/fullscreen/country');
  }catch(e){failures++;console.log(mode+' FAILED '+e.stack);console.log(mode+' DIAGNOSTICS '+JSON.stringify(await page.evaluate(()=>({load:window.GS_MAP_LOAD,start:typeof window.mobileStartGame,fullscreen:typeof window.mobileFullscreen,picker:document.getElementById('mobile-country-picker')?.value,disabled:document.getElementById('mobile-start-btn')?.disabled,menu:document.getElementById('main-menu')?.style.display}))));}
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
assert.equal(failures,0,failures+' browser sessions failed');
