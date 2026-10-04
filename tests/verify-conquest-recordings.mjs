import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),captures=[];
try{
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
await context.route(/supabase\.co|generativelanguage\.googleapis\.com/,r=>r.abort());
await context.route('https://openrouter.ai/api/v1/auth/key',r=>r.fulfill({status:200,contentType:'application/json',body:'{"data":{"label":"offline-replay"}}'}));
await context.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
 const b=route.request().postDataJSON(),p=b.messages[0].content,line=p.split('Свободные приказы: ')[1]?.split('\n')[0];
 captures.push({wire:JSON.stringify(b.messages).length});
 const orders=JSON.parse(line||'[]').map(o=>({id:o.id,kind:'unsupported',status:'defer',reason:'Offline verification, not a political outcome.',effects:{}}));
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({orders,politics:[]})},finish_reason:'stop'}]})});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load'});
await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:60000});
await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
await page.evaluate(async()=>{document.getElementById('test-ai-key').value='sk-or-offline-fixture';await testUseOpenRouterKey();});
for(const campaign of ['expansion','balance']){
 const saved=JSON.parse(await readFile('records/'+campaign+'/state.json','utf8'));
 const before=await page.evaluate(async({saved,campaign})=>{
  localStorage.setItem(SAVE_PREFIX+'offline-conquest',JSON.stringify(saved));if(!await loadGameSlot('offline-conquest'))throw Error('Load failed');
  const cash=countries[playerCountry].treasury,ids=ensureOrders().map(o=>o.id),articles=worldState.newspaperHistory.at(-1);
  window.__replayOrders=ids;
  return {player:playerCountry,cash,orders:ids.length,turn,articles:(articles?.foreign||[]).length};
 },{saved,campaign});
 const result=await page.evaluate(async()=>{const plan=await generateOrderPlan();return {count:plan.orders.length,cash:countries[playerCountry].treasury,ids:plan.orders.map(o=>o.id),omitted:window.__replayOrders.filter(id=>!plan.orders.some(o=>o.id===id))};});
 const wire=captures.at(-1).wire;
 assert.equal(result.count,before.orders,'Every real pending instruction retained');assert.equal(result.omitted.length,0);assert.equal(result.cash,before.cash,'Packing must not alter resources');
 assert.ok(wire<120000,'Real late-game prompt fits safely below backend limit');
 console.log('CONQUEST_REPLAY '+JSON.stringify({...before,wire,ordersRetained:true}));
}
assert.equal(errors.length,0,'No browser exceptions');
await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
