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

const captures=[];
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.route(/supabase\.co|generativelanguage\.googleapis\.com/,route=>route.abort());
 await context.route('https://openrouter.ai/api/v1/auth/key',route=>route.fulfill({status:200,contentType:'application/json',body:'{"data":{"label":"offline-only-fixture"}}'}));
 await context.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
  const body=route.request().postDataJSON(),prompt=body.messages[0].content;
  captures.push({chars:prompt.length,wire:JSON.stringify(body.messages).length});
  const line=prompt.split('Свободные приказы: ')[1]?.split('\n')[0];
  const orders=line?JSON.parse(line):[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({orders:orders.map(o=>({id:o.id,kind:'unsupported',status:'defer',reason:'Тестовый ответ транспорта, не политическое решение.',effects:{},article:{headline:'Проверка подготовки запроса',body:'Это бесплатная проверка транспорта. Решение не исполняется.'}})),politics:[]})},finish_reason:'stop'}]})});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load'});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
 await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
 await page.evaluate(async()=>{document.getElementById('test-ai-key').value='sk-or-offline-fixture';await testUseOpenRouterKey();});
 for(const country of ['Франция','Пруссия']){
  const saved=JSON.parse(await readFile('playtest-seed/'+country+'-state.json','utf8'));
  await page.evaluate(async saved=>{localStorage.setItem(SAVE_PREFIX+'reliability-probe',JSON.stringify(saved));if(!await loadGameSlot('reliability-probe'))throw Error('Checkpoint not loaded');},saved);
  const measured=await page.evaluate(async()=>{
   const raw=politicalContext(),ctx=orderPlanningContext(),before=countries[playerCountry].treasury;
   const size=o=>JSON.stringify([{role:'user',content:compactPoliticalJSON(o)}]).length;
   const plan=await generateOrderPlan();
   if(countries[playerCountry].treasury!==before)throw Error('Context preparation mutated treasury');
   if(ctx.player.treasury!==Number(before.toPrecision(7)))throw Error('Treasury omitted');
   if(ctx.player.army!==countries[playerCountry].army)throw Error('Army omitted');
   if(!ctx.player.taxes||!ctx.maritime.countries.some(c=>c.id===playerCountry))throw Error('Tax or fleet facts omitted');
   return {country:playerCountry,raw:size(raw),compact:size(ctx),orders:plan.orders.length,sections:Object.fromEntries(Object.entries(ctx).map(([k,v])=>[k,JSON.stringify(v||null).length]))};
  });
  const wire=captures.at(-1).wire;
  console.log('CONTEXT '+JSON.stringify({...measured,wire}));
  assert.ok(wire<120000,'Ten-month request must fit with margin below server limit');
  assert.ok(measured.compact<measured.raw*.75,'Reduce repeated foreign data substantially');
  assert.equal(measured.orders,saved.worldState.orders.filter(o=>['prepared','deferred'].includes(o.status)).length,'Every pending order retained');
 }
 // Shared cabinet parser accepts the same category conventions as player orders.
 const cabinet=await page.evaluate(()=>{
  const id=ALL_COUNTRIES.find(n=>n!==playerCountry&&!countries[n].annexed),decision={goal:'Улучшить налоговое управление',action:'pursue',motive:'Укрепить устойчивость бюджета.',headline:'Кабинет меняет налоговую политику',body:'Кабинет уточняет налоговое управление. Новые правила будут исполняться ведомствами.',task:{goal:'Улучшить налоговое управление',executor:'Министр финансов',days:0,cost:0,result:'Правила утверждены.',kind:'economic',effects:{operations:[{kind:'tax',effects:{economy:{tax_burgher:10}}}]}}};
  const packet=policyValidate({country:id,assessment:'Необходима устойчивость бюджета.',goals:[{id:'budget',goal:'Устойчивый бюджет',target:null,priority:50,status:'active',success:'Реальные налоговые поступления'}],nextReviewDays:30,decision},[id]);
  if(packet.decision.task.kind!=='policy'||!packet.decision.task.headline)throw Error('Cabinet canonicalisation failed');
  return packet.decision.task.kind;
 });console.log('CABINET canonicalisation '+cabinet);
 assert.equal(errors.length,0,'No browser exceptions');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
