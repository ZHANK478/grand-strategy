// One-shot paid test authorised 2026-10-04: three games x 15 turns and 20 auxiliary requests in total.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const campaignId=process.env.CAMPAIGN,runId=process.env.GITHUB_RUN_ID;
assert.ok(campaignId&&runId,'Requires a deliberately scheduled campaign job');
const definition=JSON.parse(await readFile('tests/fixtures/living-campaign-mandates-20261004.json','utf8')).find(c=>c.id===campaignId);
assert.ok(definition&&definition.plan.length===15);
const output='playtest-output-'+campaignId;await mkdir(output,{recursive:true});
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error('path');
 const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const report={id:campaignId,run:runId,country:definition.country,goal:definition.goal,mode:definition.mode,turns:[],usage:[],extras:0,blocked:[],pageErrors:[],cloudWarnings:[],startedAt:new Date().toISOString()};
let step=0,ordinary={planner:0,cabinets:0,editor:0},extraPhase=false;
const replies=[];
const context=await browser.newContext(definition.mode==='phone'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
await context.route('**/auth/v1/signup',async route=>{
 const body=route.request().postDataJSON();
 body.data={...(body.data||{}),gs_playtest_run:runId,gs_playtest_case:campaignId};
 await route.continue({postData:JSON.stringify(body)});
});
await context.route('**/functions/v1/guest-ai',async route=>{
 const body=route.request().postDataJSON();
 if(body?.operation!=='generate'){await route.continue();return;}
 const prompt=body.messages?.[0]?.content||'',type=prompt.startsWith('POLITICAL_CABINETS_V1')?'cabinets':prompt.includes('Свободные приказы:')?'planner':prompt.startsWith('NEWSPAPER_EDITOR_V2')?'editor':'other';
 const extra=extraPhase||type==='other'||ordinary[type]>=(type==='cabinets'?2:1);
 if(extra&&report.extras>=definition.extrasLimit||report.usage.length>=60+definition.extrasLimit){
  report.blocked.push({step,type,reason:'Explicit auxiliary budget reached'});
  await route.fulfill({status:429,contentType:'application/json',body:'{"error":"request_limit"}'});return;
 }
 if(extra)report.extras++;else ordinary[type]++;
 const entry={number:report.usage.length+1,step,type,extra,wire:JSON.stringify(body.messages).length};report.usage.push(entry);
 if(entry.wire>140000){entry.http=400;entry.error='payload_too_large';await route.fulfill({status:400,contentType:'application/json',body:'{"error":"payload_too_large"}'});return;}
 const start=Date.now();
 try{
  const response=await route.fetch({timeout:150000,maxRetries:0}),data=await response.json();
  entry.http=response.status();entry.usage=data.usage;entry.model=data.model;entry.finish=data.choices?.[0]?.finish_reason;entry.ms=Date.now()-start;
  replies.push({step,type,extra,request:prompt,response:data.choices?.[0]?.message?.content||data.error,usage:data.usage});
  await route.fulfill({response,body:JSON.stringify(data)});
 }catch(error){entry.error=String(error);await route.fulfill({status:502,contentType:'application/json',body:'{"error":"ai_unavailable"}'});}
});
const page=await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('cloudSave'))report.cloudWarnings.push(m.text());});
async function persist(){
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));
 await writeFile(output+'/responses.json',JSON.stringify(replies,null,2));
 if(await page.evaluate(()=>typeof currentSlotId!=='undefined'&&!!currentSlotId).catch(()=>false)){
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(SAVE_PREFIX+currentSlotId)));
  await writeFile(output+'/state.json',JSON.stringify(saved));
 }
}
try{
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:60000});
 await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
 // Only the four identified test guests receive 15 server turns from the root agent.
 let quotaReady=false;
 for(let check=0;check<72&&!quotaReady;check++){
  quotaReady=await page.evaluate(async()=>{if(!sb||!gsUser)return false;const {data,error}=await sb.functions.invoke('guest-ai',{body:{operation:'status'}});return !error&&data?.guest_turns_remaining>=15;});
  if(!quotaReady)await page.waitForTimeout(5000);
 }
 assert.ok(quotaReady,'Explicit server quota required before any paid generation');
 await page.selectOption('#mobile-country-picker',definition.country);await page.click('#mobile-start-btn');
 report.initial=await page.evaluate(()=>({date:dateLabel(),day:gameDayNumber(),cash:countries[playerCountry].treasury,debt:countries[playerCountry].debt,army:countries[playerCountry].army,gdp:countries[playerCountry].gdp,ruler:countries[playerCountry].ruler,budget:econBudget(countries[playerCountry])}));
 for(let i=0;i<15;i++){
  step=i+1;ordinary={planner:0,cabinets:0,editor:0};extraPhase=false;
  const current=await page.evaluate(()=>({cash:countries[playerCountry].treasury,budget:econBudget(countries[playerCountry]),offers:strategyState().offers.filter(o=>o.b===playerCountry&&o.status==='open'),trade:(maritimeState().tradeOffers||[]).filter(o=>o.b===playerCountry&&o.status==='open'),paper:worldState.newspaperHistory?.at(-1)}));
  const orders=definition.plan[i].slice(),incoming=current.trade[0]||current.offers.find(o=>o.type!=='dependency');
  if(incoming&&i%3===1)orders.push('Рассмотреть конкретное существующее предложение '+incoming.a+' '+incoming.id+'. Принять его, если оно не предусматривает участия в наступательной войне, зависимости или непосильных выплат; иначе отклонить с объяснением.');
  if(i===7&&campaignId==='influence'){
   const issue=(current.paper?.foreign||[]).find(a=>a.actors?.some(n=>n!==definition.country)&&/войн|границ|опас|переговор|предлож/i.test(a.headline+' '+a.body));
   if(issue)orders.push('Поручить дипломатам определить и осуществить нашу позицию по этому событию, учитывая итальянские и германские интересы Австрии, не предрешая чужой ответ: '+(issue.headline+' '+issue.body).slice(0,800));
  }
  if(i===11&&campaignId==='peace'&&current.budget.net<0)orders.push('Уменьшить расход на инфраструктуру на десять процентов от текущего уровня, чтобы сократить дефицит, сохранив образование и помощь населению.');
  const pendingBefore=await page.evaluate(()=>ensureOrders().length),start=await page.evaluate(()=>gameDayNumber());
  await page.evaluate(list=>{for(const text of list)queueOrder(text);},orders);
  const started=Date.now(),completed=await page.evaluate(()=>nextTurn('m1'));
  const result=await page.evaluate(({step,orders,pendingBefore,ms})=>{
   const c=countries[playerCountry],decisions=ensurePolitics().decisions.filter(d=>d.turn===turn),events=worldState.periodEvents||[];
   return {step,orders,pendingBefore,date:dateLabel(),day:gameDayNumber(),turn,ms,cash:c.treasury,debt:c.debt,army:c.army,gdp:c.gdp,population:c.population,education:econEducation(c),demography:econDemography(c),ruler:c.ruler,pm:c.pm,government:c.government,taxes:Object.fromEntries(Object.entries(c.economy.classes).map(([k,g])=>[k,g.tax])),spending:c.society.spending,budget:econBudget(c),
   receipts:worldState.orders.filter(o=>o.resolvedTurn===turn||o.createdTurn>=turn-1).map(o=>({id:o.id,text:o.text,status:o.status,reason:o.reason,technical:o.technicalError,kind:o.kind,response:o.response})),
   pending:ensureOrders().map(o=>({text:o.text,status:o.status,technical:o.technicalError})),paper:worldState.newspaperHistory?.at(-1),foreignDecisions:decisions.filter(d=>d.country!==playerCountry).map(d=>({country:d.country,action:d.action,target:d.target,goal:d.goal,motive:d.motive,material:d.material,task:d.task})),
   policyErrors:policyState().audit.slice(-12),plannerFailure:worldState.plannerFailure,newsCount:{domestic:events.filter(e=>e.section==='domestic').length,foreign:events.filter(e=>e.section==='foreign').length},
   units:worldState.mapObjects.filter(u=>u.type==='army').map(u=>({owner:u.owner,troops:u.troops,province:u.province,supply:u.supply})),wars:{player:worldState.atWarWith,others:worldState.aiWars},occupations:strategyState().occupations,
   contracts:strategyState().contracts.filter(c=>c.status==='active').map(c=>({a:c.a,b:c.b,type:c.type,terms:c.terms})),offers:strategyState().offers.filter(o=>o.status==='open'),trade:(maritimeState().tradeOffers||[]).filter(o=>o.status==='open'),diagnostic:document.getElementById('events-list').textContent};
  },{step,orders,pendingBefore,ms:Date.now()-started});
  result.completed=completed===true&&result.day>start;
  report.turns.push(result);await persist();
  console.log('LIVE_TURN '+JSON.stringify({id:campaignId,...result}));
  if(!result.completed){report.failure='Calendar did not advance: '+result.diagnostic;break;}
  if(report.blocked.length){report.failure='Auxiliary budget reached';break;}
  if(i===2||i===10){
   extraPhase=true;report.advice||=[];
   report.advice.push({step,text:await page.evaluate(async()=>await askAdvisor('Объясните конкретно, что получилось от моих решений, что ещё не получилось, от чего зависит рост нашей экономики и какой следующий шаг разумен. Если был технический отказ, назовите точную причину.'))});
   console.log('LIVE_ADVICE '+JSON.stringify({id:campaignId,...report.advice.at(-1)}));extraPhase=false;await persist();
  }
  if(i===5&&definition.delegates){
   extraPhase=true;
   const delegates=definition.delegates;
   try{
    report.conference=await page.evaluate(async names=>{
     conferenceOpen(names[0]);conferenceInvite(names[1]);
     conferencePost('Предлагаю обсудить взаимовыгодную торговлю и безопасность. Назовите интересы вашего кабинета и условия, которые он готов предложить; не обещайте согласия остальных.');
     for(const n of names)await conferenceGrant(n);
     return {messages:conferenceRoom().messages,requests:conferenceRoom().requests,offers:strategyState().offers.filter(o=>o.status==='open'&&o.b===playerCountry)};
    },delegates);
    console.log('LIVE_CONFERENCE '+JSON.stringify({id:campaignId,conference:report.conference}));
   }catch(error){report.conferenceError=String(error);}
   extraPhase=false;await page.evaluate(()=>mobileSection('map'));await persist();
  }
 }
 report.cloud=await page.evaluate(async()=>{
  const id='campaign-cloud-'+Date.now(),meta={country:playerCountry,ruler:countries[playerCountry].ruler,turn,year,month,treasury:4077.606};
  const saved=await cloudSave(id,meta,{test:true,treasury:4077.606}),loaded=saved?await cloudLoad(id):null;if(saved)await cloudDelete(id);
  return {saved,treasury:loaded?.treasury};
 });
 await page.screenshot({path:output+'/final.png'});
}finally{
 report.finishedAt=new Date().toISOString();report.cost=report.usage.reduce((s,x)=>s+(x.usage?.cost||0),0);
 await persist();console.log('LIVE_SUMMARY '+JSON.stringify({id:campaignId,turns:report.turns.length,completed:report.turns.filter(t=>t.completed).length,attempts:report.usage.length,extras:report.extras,cost:report.cost,blocked:report.blocked,pageErrors:report.pageErrors,cloudWarnings:report.cloudWarnings,cloud:report.cloud,failure:report.failure}));
 await context.close();await browser.close();await new Promise(r=>server.close(r));
}
assert.equal(report.turns.length,15,'All 15 turns attempted');
assert.ok(report.turns.every(t=>t.completed),'All calendars advanced');
assert.equal(report.pageErrors.length,0,'No browser exceptions');
assert.equal(report.blocked.length,0,'Real gameplay not truncated by auxiliary guard');
assert.ok(report.cloud?.saved&&report.cloud.treasury===4077.606,'Cloud metadata precision preserved');
