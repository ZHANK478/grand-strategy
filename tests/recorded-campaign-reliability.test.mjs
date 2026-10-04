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
 const fixtures=JSON.parse(await readFile('tests/fixtures/order-context-late-1852.json','utf8'));
 await page.evaluate(()=>{window.__originalPoliticalContext=politicalContext;});
 for(const fixture of fixtures){
  await page.evaluate(fixture=>{
   politicalContext=window.__originalPoliticalContext;resetGame(fixture.country);
   const c=countries[playerCountry];Object.assign(c,fixture.own);
   c.gdp=fixture.context.player.gdp;c.population=fixture.context.player.population;c.debt=fixture.context.player.debt;
   worldState.orders=fixture.context.pending.map(o=>({...o,status:'deferred',createdTurn:turn}));
   politicalContext=()=>JSON.parse(JSON.stringify(fixture.context));
  },fixture);
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
  assert.equal(measured.orders,fixture.context.pending.length,'Every pending order retained');
 }
 await page.evaluate(()=>{politicalContext=window.__originalPoliticalContext;});
 // Shared cabinet parser accepts the same category conventions as player orders.
 const cabinet=await page.evaluate(()=>{
  const id=ALL_COUNTRIES.find(n=>n!==playerCountry&&!countries[n].annexed),decision={goal:'Улучшить налоговое управление',action:'pursue',motive:'Укрепить устойчивость бюджета.',headline:'Кабинет меняет налоговую политику',body:'Кабинет уточняет налоговое управление. Новые правила будут исполняться ведомствами.',task:{goal:'Улучшить налоговое управление',executor:'Министр финансов',days:0,cost:0,result:'Правила утверждены.',kind:'economic',effects:{operations:[{kind:'tax',effects:{economy:{tax_burgher:10}}}]}}};
  const packet=policyValidate({country:id,assessment:'Необходима устойчивость бюджета.',goals:[{id:'budget',goal:'Устойчивый бюджет',target:null,priority:50,status:'active',success:'Реальные налоговые поступления'}],nextReviewDays:30,decision},[id]);
  if(packet.decision.task.kind!=='policy'||!packet.decision.task.headline)throw Error('Cabinet canonicalisation failed');
  return packet.decision.task.kind;
 });console.log('CABINET canonicalisation '+cabinet);
 // Replay actual model replies from the paid controls, with all network blocked above.
 const orderFixtures=JSON.parse(await readFile('tests/fixtures/recorded-order-replies-20261004.json','utf8'));
 for(const fixture of orderFixtures){
  const result=await page.evaluate(async fixture=>{
   const country=ALL_COUNTRIES.find(n=>n===fixture.country||fixture.country==='Пруссия'&&/Прусси/.test(n));
   resetGame(country);worldState.newspaperHistory=[];worldState.periodEvents=[];
   window.politicalRunRound=undefined;window.testEnsureAIForTurn=async()=>true;
   for(const text of fixture.texts)queueOrder(text);
   const before={day:gameDayNumber(),army:countries[playerCountry].army,education:countries[playerCountry].society.spending.education};
   askGemini=async()=>JSON.stringify(fixture.reply);
   const ok=await nextTurn('week'),c=countries[playerCountry];
   const out={name:fixture.name,ok,dayDelta:gameDayNumber()-before.day,receipts:worldState.orders.map(o=>({status:o.status,technical:o.technicalError,reason:o.reason})),diagnostic:document.getElementById('events-list').textContent};
   if(!ok)throw Error(fixture.name+': '+out.diagnostic);
   if(gameDayNumber()-before.day!==7)throw Error('Calendar did not advance');
   if(worldState.orders.some(o=>o.technicalError||!['executed','in_progress'].includes(o.status)))throw Error(fixture.name+': '+JSON.stringify(out.receipts));
   if(fixture.name==='appointment'&&(c.pm!=='барон Осман'||c.pmTitle!=='Председатель кабинета'))throw Error('Appointment did not change country state: '+c.pm+' / '+c.pmTitle);
   if(fixture.name==='gradual-spending'){
    const p=c.econV3.programs.find(p=>p.kind==='spending'&&p.group==='education');
    if(!p||p.days!==180||!(c.society.spending.education>before.education&&c.society.spending.education<20.4))throw Error('Spending was not gradual');
    if(!(c.army>before.army&&c.army<before.army+15000))throw Error('Recruitment was immediate or absent');
   }
   if(fixture.name==='bilateral-tariff'){
    const offer=maritimeState().tradeOffers.find(o=>o.a===playerCountry&&o.status==='open');
    if(!offer||offer.type!=='trade'||offer.rate!==3||offer.days!==365)throw Error('Wrong tariff agreement');
    if(maritimeState().agreements.some(a=>a.a===playerCountry||a.b===playerCountry))throw Error('Foreign consent invented');
   }
   if(fixture.name==='compound-deployment'){
    const u=worldState.mapObjects.find(o=>o.owner===playerCountry&&o.type==='army');
    if(!u||u.troops!==50000||c.army!==before.army)throw Error('Deployment created wrong army');
    if(!worldState.publicStatements?.length)throw Error('Second compound step did not execute');
   }
   if(fixture.name==='zero-taxes'&&Object.values(c.economy.classes).some(g=>g.tax!==0))throw Error('Some social taxes not changed');
   if(fixture.name==='yearly-offer'){
    const offer=strategyState().offers.find(o=>o.a===playerCountry&&o.status==='open');
    if(!offer||offer.terms.days!==365)throw Error('Contract term was lost');
   }
   const edition=worldState.newspaperHistory.at(-1);
   if(!worldState.orders.every(o=>edition.domestic.some(a=>a.sourceOrder===o.id)))throw Error('Order missing from newspaper');
   delete out.diagnostic;return out;
  },fixture);
  console.log('RECORDED_EXECUTION '+JSON.stringify(result));
 }
 // A government may send a minimal concrete answer: descriptive defaults come from its decision.
 const answer=await page.evaluate(()=>{
  resetGame('Франция');
  const owner=ALL_COUNTRIES.find(n=>/Саксон/.test(n)),offer=strategyOffer(playerCountry,owner,'nonaggression',{days:365});
  const decision=canonicalPoliticalDecision({actor_id:owner+'::government',goal:'Согласиться на годичный договор о ненападении',action:'accept',target:playerCountry,motive:'Снизить риск конфликта, сохранив самостоятельность.',headline:'Договор о ненападении принят',body:'Правительство принимает предложение на один год. Это решение не создаёт военного союза.',task:{kind:'diplomacy',effects:{diplomatic_action:{action:'accept',target:playerCountry,offer_id:offer.id}}}});
  validatePoliticalDecision(decision);
  if(!executePoliticalDecision(decision,[])||offer.status!=='accepted')throw Error('Concrete cabinet answer ignored');
  return {accepted:true,days:strategyState().contracts.find(c=>c.a===playerCountry&&c.b===owner).terms.days};
 });
 assert.equal(answer.days,365);console.log('RECORDED_CABINET '+JSON.stringify(answer));
 assert.equal(errors.length,0,'No browser exceptions');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
