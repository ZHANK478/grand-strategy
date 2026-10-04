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
   await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'load',timeout:60000});
   await page.waitForURL('**/economy-world.html',{timeout:10000});
   await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
   console.log(mode+' BEFORE '+JSON.stringify(await page.evaluate(()=>({status:window.GS_MAP_LOAD,start:typeof window.mobileStartGame,fullscreen:typeof window.mobileFullscreen,picker:document.getElementById('mobile-country-picker').value,disabled:document.getElementById('mobile-start-btn').disabled}))));
   if(mode==='phone'){
    await page.click('#mobile-fullscreen-button',{timeout:5000});
    await page.waitForFunction(()=>!!document.fullscreenElement,{},{timeout:5000});
    assert.equal(await page.locator('#mobile-fullscreen-button').isVisible(),false);
    await page.evaluate(()=>document.exitFullscreen());
    await page.waitForFunction(()=>!document.fullscreenElement&&!document.getElementById('mobile-fullscreen-button').hidden);
    console.log('phone NATIVE FULLSCREEN enter/exit passed');
   }
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
   await page.evaluate(()=>{economySetTab('sea');openEconomyPanel();});
   assert.match(await page.locator('#economy-body').innerText(),/Флот|Эскадр|эскадр/);
   await page.evaluate(()=>mobileSection('map'));
   await page.evaluate(()=>{economySetTab('trade');openEconomyPanel();});
   assert.match(await page.locator('#economy-body').innerText(),/Торговля и таможня/);
   await page.evaluate(()=>mobileSection('map'));
   await page.evaluate(()=>saveGame());
   assert.equal(errors.length,0,'Uncaught errors: '+errors.join('\n'));
   
   const failures=await page.evaluate(async()=>{
    window.testEnsureAIForTurn=async()=>true;window.politicalRunRound=undefined;
    const out=[],check=(v,label)=>{if(!v)throw Error(label);out.push(label);};
    const date0=gameDayNumber();
    queueOrder('Учредить земельную комиссию и определить её полномочия.');
    askGemini=async()=>'{invalid JSON';
    check(await nextTurn('week')===true,'Malformed provider output does not stop calendar');
    check(gameDayNumber()===date0+7,'Calendar advances after interpretation failure');
    check(ensureOrders()[0]?.technicalError,'Technical failure is distinct from political refusal');
    const oid=ensureOrders()[0].id,dayBefore=gameDayNumber();
    queueOrder('Новый заём, ещё не переданный на очередной ход.','finance',{debt_delta:7});
    const newOrder=ensureOrders().at(-1).id;
    askGemini=async()=>JSON.stringify({orders:[{id:oid,kind:'political',status:'execute',reason:'Издано распоряжение',effects:{political_task:{goal:'Учредить земельную комиссию и определить её полномочия',executor:'Кабинет министров',days:0,cost:0,result:'Комиссия учреждена распоряжением правительства. Ей поручено рассмотреть земельные споры.',headline:'Правительство учредило земельную комиссию',body:'Правительство учредило земельную комиссию. Ей поручено рассмотреть земельные споры и подготовить предложения. Кабинет определил её полномочия.'}},article:{headline:'Правительство учредило земельную комиссию',body:'Правительство учредило земельную комиссию. Ей поручено рассмотреть земельные споры и подготовить предложения. Кабинет определил её полномочия.'}}],politics:[]});
    check(await retryOrders()===true,'Retry preserved order');
    check(gameDayNumber()===dayBefore,'Retry does not consume calendar time');
    check(worldState.orders.find(o=>o.id===oid).status==='executed','Retry applies real organisational act');
    check(worldState.orders.find(o=>o.id===newOrder).status==='prepared','Retry excludes newly queued orders');
    removeAction(ensureOrders().findIndex(o=>o.id===newOrder));
    const records=countries[playerCountry].politicalRecords.length;
    await retryOrders();
    check(countries[playerCountry].politicalRecords.length===records,'Retry never duplicates executed order');
    queueOrder('Взять заём 25 миллионов расчётных единиц.');
    queueOrder('Комплексный приказ с ошибкой исполнения.');
    const pending=ensureOrders(),debtBefore=countries[playerCountry].debt;
    askGemini=async()=>JSON.stringify({orders:pending.map((o,i)=>({id:o.id,kind:i?'policy':'finance',status:'execute',reason:'Начать исполнение',effects:i?{operations:[{kind:'finance',effects:{debt_delta:20}},{kind:'naval',effects:{naval_order:{action:'hold',fleet_id:'missing-fleet'}}}]}:{debt_delta:25},article:{headline:'Правительство принимает финансовое решение',body:'Кабинет рассмотрел финансовое решение. Казначейству передано распоряжение. Исполнение зависит от доступных ресурсов.'}})),politics:[]});
    check(await nextTurn('week')===true,'Bad material step does not cancel another order or turn');
    check(countries[playerCountry].debt>=debtBefore+25&&countries[playerCountry].debt<debtBefore+45,'Failed compound order rolls back its partial borrowing');
    check(worldState.orders.find(o=>o.id===pending[0].id).status==='executed','Independent valid order survives');
    check(worldState.orders.find(o=>o.id===pending[1].id).status==='blocked','Nonexistent fleet cannot be conjured');
    const edition=worldState.newspaperHistory.at(-1);
    check(pending.every(o=>edition.domestic.some(a=>a.sourceOrder===o.id)),'Every submitted order has newspaper coverage');
    const ports=[...document.querySelectorAll('.map-obj')].filter(el=>el.__data__?.type==='port');
    check(ports.length>0&&ports.every(el=>el.querySelector('.mo-label').getAttribute('display')==='none'),'Every port marker has no label');
    check(ports.every(el=>el.querySelector('.mo-sym').getBoundingClientRect().width<=(window.matchMedia('(min-width: 1100px) and (pointer: fine)').matches?18:6)),'Port anchors use a larger desktop size and small mobile size');
    check(!document.getElementById('economy-body').innerHTML.includes('maritime-fleet-form'),'No mandatory fleet controls');
    check(document.getElementById('treasury').title.includes('млн р.е.'),'Consistent money units');
    const oldSB=sb,oldUser=gsUser;let row;
    try{gsUser={id:'00000000-0000-0000-0000-000000000001'};sb={from:()=>({upsert:async x=>{row=x;return {error:null};}})};
     check(await cloudSave('fractional-test',{treasury:4077.606}, {test:true})===true,'Cloud save accepts fractional treasury');
     check(row.treasury===4077.606,'Cloud save preserves precision');
    }finally{sb=oldSB;gsUser=oldUser;}
    return out;
   });
   const calendarBefore=await page.evaluate(()=>gameDayNumber());
   await page.locator('.next-btn').click({timeout:5000});
   await page.waitForFunction(d=>!turnRunning&&gameDayNumber()>d,calendarBefore,{timeout:10000});
   console.log(mode+' NEWSPAPER leaves turn button clickable');
   console.log(mode+' RELIABILITY '+JSON.stringify(failures));
   assert.equal(errors.length,0,'No uncaught errors during failure handling');
   console.log(mode+' PASSED start/fullscreen/country and failure isolation');
  }catch(e){failures++;console.log(mode+' FAILED '+e.stack);console.log(mode+' DIAGNOSTICS '+JSON.stringify(await page.evaluate(()=>({load:window.GS_MAP_LOAD,start:typeof window.mobileStartGame,fullscreen:typeof window.mobileFullscreen,picker:document.getElementById('mobile-country-picker')?.value,disabled:document.getElementById('mobile-start-btn')?.disabled,menu:document.getElementById('main-menu')?.style.display}))));}
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
assert.equal(failures,0,failures+' browser sessions failed');
