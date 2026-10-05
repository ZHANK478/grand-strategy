import { chromium } from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),remote=process.env.ATLAS_TEST_URL,output='atlas-shots';
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
if(!remote)await new Promise(r=>server.listen(8765,'127.0.0.1',r));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
const capture=async(page,name)=>{await page.waitForTimeout(250);await page.screenshot({path:output+'/'+name+'.png',animations:'disabled'});};
const base=remote||'http://127.0.0.1:8765/atlas.html';
let success=false;
try{
 for(const mode of ['desktop','phone']){
  const context=await browser.newContext(mode==='phone'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
  let paidCalls=0;await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,r=>{if(/functions\/v1\/|chat\/completions|generateContent/.test(r.request().url()))paidCalls++;return r.abort();});
  const page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log(mode+' PAGE ERROR '+e.stack);});
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)missing.push(r.status()+' '+r.url());});
  await page.goto(base,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready'&&window.AtlasView?.ready&&window.AtlasView.physicalCount?.rivers>0&&window.AtlasInterface?.ready,{},{timeout:45000});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.fonts.check('16px AtlasBook')&&document.fonts.check('16px AtlasUI')),true);
  assert.equal(await page.evaluate(()=>document.querySelector('.atlas-menu-art img').naturalWidth>0),true);
  await capture(page,'start-'+mode);
  if(mode==='phone'){await page.click('#mobile-fullscreen-button');await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal(await page.locator('#mobile-fullscreen-button').isVisible(),false);await page.evaluate(()=>document.exitFullscreen());}
  await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
  await page.waitForFunction(()=>gameStarted&&document.getElementById('main-menu').style.display==='none');
  await page.evaluate(()=>{const center=proj([17,49]),r=svgEl.getBoundingClientRect();vb={x:center[0]-115,y:center[1]-115*r.height/r.width,w:230,h:230*r.height/r.width};svgEl.setAttribute('viewBox',[vb.x,vb.y,vb.w,vb.h].join(' '));updateLabels();AtlasView.refresh();});
  const geometry=await page.evaluate(()=>JSON.stringify(scenarioProvinces.map(p=>p.geometry)));
  assert.equal(await page.locator('#map-svg image').count(),0);
  assert.deepEqual(await page.evaluate(()=>AtlasView.physicalCount),{mountains:129,rivers:187});
  const signature=await page.evaluate(()=>JSON.stringify({playerCountry,countries,worldState,provinceOwners,year,month}));
  await page.click('#mobile-flag-button');
  await page.waitForFunction(()=>document.getElementById('ruler-portrait').naturalWidth>0&&!document.getElementById('ruler-portrait').hidden);
  const portrait=await page.locator('#ruler-portrait').boundingBox(),sheet=await page.locator('#left-panel').boundingBox();
  assert.ok(portrait.width<sheet.width*.45,'Portrait is compact, with name and office alongside');
  assert.ok(await page.locator('#ruler-name').isVisible());
  await capture(page,'country-'+mode);
  await page.locator('#left-panel .sheet-close').click();
  await page.evaluate(()=>openCountryRelations(ALL_COUNTRIES.find(x=>/Пруссия/.test(x))));
  await page.waitForFunction(()=>document.querySelector('#mobile-card-details .atlas-person img').naturalWidth>0);
  await capture(page,'foreign-'+mode);
  await page.evaluate(()=>openCountryRelations(ALL_COUNTRIES.find(x=>/Австр/.test(x))));
  assert.match(await page.locator('#mobile-card-name').innerText(),/Австр/);
  await page.evaluate(()=>mobileDismissCard());
  assert.equal(await page.evaluate(()=>JSON.stringify({playerCountry,countries,worldState,provinceOwners,year,month})),signature,'Presentation never changes the simulated world');

  // Ruler identity changes remove the old historical artwork, without paid generation.
  await page.evaluate(()=>{const c=countries[playerCountry];window.testLeader={ruler:c.ruler,rulerTitle:c.rulerTitle,rulerAge:c.rulerAge,portrait:c.portrait};c.ruler='Тестовый преемник';c.portrait=null;renderPlayerPowerPanel();});
  assert.equal(await page.locator('#ruler-portrait').getAttribute('src'),null,'Old portrait does not follow a successor');
  await page.evaluate(()=>{Object.assign(countries[playerCountry],window.testLeader);delete window.testLeader;renderPlayerPowerPanel();});
  await page.click('#mobile-actions-button');await page.locator('#mobile-actions-menu button').filter({hasText:'Экономика'}).click();
  assert.ok(await page.locator('#economy-panel').isVisible());await capture(page,'economy-'+mode);await page.evaluate(()=>mobileSection('map'));
  await page.click('#mobile-actions-button');await page.locator('#mobile-actions-menu button').filter({hasText:'Приказы'}).click();
  await page.fill('#action-input','Создать программу расширения школ');await page.locator('.add-action-btn').click();
  assert.match(await page.locator('#actions-list').innerText(),/расширения школ/);await capture(page,'orders-'+mode);
  await page.evaluate(()=>mobileSection('map'));

  // Real camera input, not a simulated call into the map.
  const before=await page.evaluate(()=>({...vb}));
  if(mode==='phone'){
   const cdp=await context.newCDPSession(page);const points=(a,b)=>[{x:a,y:210,id:1,radiusX:3,radiusY:3,force:1},{x:b,y:210,id:2,radiusX:3,radiusY:3,force:1}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(500,700)});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(460,740)});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.mouse.move(900,450);await page.mouse.wheel(0,-200);}
  await page.waitForFunction(w=>vb.w<w,before.w);
  const zoom=await page.evaluate(()=>({...vb}));await page.mouse.move(mode==='phone'?600:1000,mode==='phone'?210:460);await page.mouse.down();await page.mouse.move(mode==='phone'?650:1080,mode==='phone'?220:480,{steps:6});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>vb.x),zoom.x);
  assert.equal(await page.evaluate(()=>JSON.stringify(scenarioProvinces.map(p=>p.geometry))),geometry);
  await page.evaluate(()=>saveGame());
  assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('gs_atlas189_save_'))));
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('gs_economyworld_save_'))),false);
  await page.evaluate(()=>{
   renderNewspaper({from:dateLabel(),to:dateLabel(),summary:{executed:1,progress:2,obstacles:0,technical:0,cash:-24,army:0},domestic:[
    {headline:'Школьные двери открываются для девочек',body:'Правительство разрешило девочкам получать образование. В городах решение встречают с надеждой: семьи обсуждают новые возможности, а учителя готовятся принимать учениц. Духовные власти требуют сохранить влияние на школьную программу. Спор о том, чему и кем будут учить детей, выходит из кабинетов на страницы газет.\n\nКазначейство должно обеспечить новые классы и учебники. Сам указ ещё не заменяет учителя, но делает образование предметом открытого политического спора.',details:'Демонстрационный текст для проверки оформления, а не результат игрового хода.'},
    {headline:'Казначейство обсуждает цену реформы',body:'Министры готовят расчёты для новых школ. В столице спорят о том, как распределить расходы между казной и местными общинами.'}],
    foreign:[{headline:'Лондон ищет согласия с континентальными кабинетами',body:'Британские дипломаты предложили соседним державам обсудить безопасность морской торговли. Встреча должна показать, готовы ли правительства поддерживать общий порядок при несовпадающих интересах.'},{headline:'Берлин и Вена расходятся во взглядах',body:'В германских дворах обсуждают будущее совместных учреждений. Стороны пока не называют окончательных условий сближения.'}],archive:{domestic:[],foreign:[]}});
   mobileSection('news');
  });
  await capture(page,'newspaper-'+mode);
  assert.equal(await page.locator('#atlas-brief').getAttribute('open'),null,'Technical summary starts folded');
  await page.locator('.atlas-reader-toggle').click();assert.equal(await page.locator('.atlas-reader-toggle').getAttribute('aria-expanded'),'true');
  await capture(page,'reading-'+mode);await page.locator('.atlas-reader-toggle').click();
  assert.equal(paidCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  results.push({mode,portraitRatio:portrait.width/sheet.width,paidCalls,errors,missing,checks:'startup, Cyrillic fonts, genuine portrait, country switching, succession, economy, queued order, fullscreen, pointer camera, geometry, isolated saves, newspaper reader'});
  console.log('PASS '+JSON.stringify(results.at(-1)));await context.close();
 }
 success=true;
}finally{await writeFile(output+'/report.json',JSON.stringify({success,results},null,2));await browser.close();if(!remote)server.close();}
