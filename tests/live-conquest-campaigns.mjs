// One-shot user-authorised playtest: two campaigns, ten ordinary turns each.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','Paid playtest must never replay on a rerun');
const id=process.env.CAMPAIGN,run=process.env.GITHUB_RUN_ID;
const def=JSON.parse(await readFile('tests/fixtures/conquest-mandates-20261004.json','utf8')).find(c=>c.id===id);
assert.ok(def&&run&&def.plan.length===10);
const output='conquest-output-'+id;await mkdir(output,{recursive:true});
const root=process.cwd(),server=createServer(async(req,res)=>{
 try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error('path');
 const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const report={id,run,country:def.country,goal:def.goal,turns:[],usage:[],blocked:[],errors:[],startedAt:new Date().toISOString()},replies=[];
let step=0;
const context=await browser.newContext(def.mode==='phone'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
await context.route('**/auth/v1/signup',async route=>{const b=route.request().postDataJSON();b.data={...(b.data||{}),gs_playtest_run:run,gs_playtest_case:'conquest-'+id};await route.continue({postData:JSON.stringify(b)});});
await context.route('**/functions/v1/guest-ai',async route=>{
 const b=route.request().postDataJSON();
 if(['image','portrait_trial','redeem_images'].includes(b.operation)){await route.fulfill({status:403,contentType:'application/json',body:'{"error":"images_disabled_in_playtest"}'});return;}
 if(b.operation!=='generate'){await route.continue();return;}
 const prompt=b.messages?.[0]?.content||'',type=prompt.startsWith('POLITICAL_CABINETS_V1')?'cabinets':prompt.includes('Свободные приказы:')?'planner':prompt.startsWith('NEWSPAPER_EDITOR_V2')?'editor':'other';
 const spent=report.usage.reduce((n,u)=>n+(u.usage?.cost||0),0);
 if(step<1||step>10||type==='other'||b.model!=='openai/gpt-6-luna'||report.usage.length>=80||report.usage.filter(u=>u.step===step).length>=8||spent>=.35){
  report.blocked.push({step,type,reason:'Turn/model/request/cost guard'});await route.fulfill({status:429,contentType:'application/json',body:'{"error":"playtest_limit"}'});return;
 }
 const entry={step,type,wire:JSON.stringify(b.messages).length};report.usage.push(entry);
 const start=Date.now();
 try{const response=await route.fetch({timeout:150000,maxRetries:0}),data=await response.json();
 entry.http=response.status();entry.usage=data.usage;entry.finish=data.choices?.[0]?.finish_reason;entry.ms=Date.now()-start;
 replies.push({step,type,request:prompt,response:data.choices?.[0]?.message?.content||data.error,usage:data.usage});
 await route.fulfill({response,body:JSON.stringify(data)});
 }catch(error){entry.error=String(error);await route.fulfill({status:502,contentType:'application/json',body:'{"error":"ai_unavailable"}'});}
});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function persist(){await writeFile(output+'/report.json',JSON.stringify(report,null,2));await writeFile(output+'/responses.json',JSON.stringify(replies,null,2));
 const saved=await page.evaluate(()=>currentSlotId?JSON.parse(localStorage.getItem(SAVE_PREFIX+currentSlotId)):null).catch(()=>null);if(saved)await writeFile(output+'/state.json',JSON.stringify(saved));}
try{
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:60000});
 await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
 await page.selectOption('#mobile-country-picker',def.country);await page.click('#mobile-start-btn');
 if(id==='balance'){
  const seed=JSON.parse(await readFile('conquest-seed/turn5-state.json','utf8'));
  seed.playerCountry=def.country;seed.playerCountryDisplayName=seed.countries[def.country].displayName||def.country;
  seed.worldState.orders=[];seed.playerActions=[];seed.advisorHistory=[];
  await page.evaluate(async saved=>{localStorage.setItem(SAVE_PREFIX+'conquest-balance',JSON.stringify(saved));if(!await loadGameSlot('conquest-balance'))throw Error('Cannot load campaign world as Austrian player');},seed);
 }
 report.initial=await page.evaluate(()=>({date:dateLabel(),player:playerCountry,army:countries[playerCountry].army,cash:countries[playerCountry].treasury,world:conquestWorldFacts()}));
 for(let i=0;i<10;i++){
  step=i+1;const before=await page.evaluate(()=>gameDayNumber()),orders=def.plan[i].slice();
  // The political player responds to actual incoming offers, not imagined acceptance.
  if(id==='balance'&&step===8){const offer=await page.evaluate(()=>strategyState().offers.find(o=>o.status==='open'&&o.b===playerCountry&&o.type==='alliance'&&!o.terms.offensive));
   if(offer)orders.push('Принять реально полученное оборонительное предложение '+offer.id+' от '+offer.a+'.');}
  await page.evaluate(list=>{for(const text of list)queueOrder(text);},orders);
  const start=Date.now(),completed=await page.evaluate(()=>nextTurn('m1')),turnMs=Date.now()-start;
  await page.evaluate(()=>window.causalWaitForNewspaper());
  const result=await page.evaluate(({step,orders,turnMs})=>({
   step,orders,turnMs,date:dateLabel(),day:gameDayNumber(),turn,army:countries[playerCountry].army,cash:countries[playerCountry].treasury,debt:countries[playerCountry].debt,balance:econBudget(countries[playerCountry]).net,
   receipts:worldState.orders.filter(o=>o.resolvedTurn===turn||o.createdTurn>=turn-1).map(o=>({text:o.text,status:o.status,reason:o.reason,technical:o.technicalError,kind:o.kind})),
   newspaper:worldState.newspaperHistory?.at(-1),world:conquestWorldFacts(),
   decisions:ensurePolitics().decisions.filter(d=>d.turn===turn&&d.country!==playerCountry).map(d=>({country:d.country,action:d.action,target:d.target,goal:d.goal,motive:d.motive,material:d.material,task:d.task})),
   pending:ensureOrders().map(o=>({text:o.text,status:o.status,technical:o.technicalError})),audit:policyState().audit.slice(-8),
   units:worldState.mapObjects.filter(u=>u.type==='army').map(u=>({owner:u.owner,troops:u.troops,province:u.province,supply:u.supply})),
   offers:strategyState().offers.filter(o=>o.status==='open'),contracts:strategyState().contracts.filter(c=>c.status==='active')
  }),{step,orders,turnMs});
  result.completed=completed===true&&result.day>before;report.turns.push(result);await persist();
  console.log('CONQUEST_TURN '+JSON.stringify(result));
  if(id==='expansion'&&step===5){const seed=await page.evaluate(()=>JSON.parse(localStorage.getItem(SAVE_PREFIX+currentSlotId)));await writeFile(output+'/turn5-state.json',JSON.stringify(seed));}
  if(!result.completed||report.blocked.length){report.failure='Turn or request guard interrupted actual play';break;}
 }
 await page.screenshot({path:output+'/final.png'});
}finally{
 report.finishedAt=new Date().toISOString();report.cost=report.usage.reduce((n,u)=>n+(u.usage?.cost||0),0);await persist();
 console.log('CONQUEST_SUMMARY '+JSON.stringify({id,completed:report.turns.filter(t=>t.completed).length,requests:report.usage.length,cost:report.cost,blocked:report.blocked,errors:report.errors,failure:report.failure,
  usage:report.usage.map(u=>({step:u.step,type:u.type,finish:u.finish,http:u.http,wire:u.wire,input:u.usage?.prompt_tokens,output:u.usage?.completion_tokens}))}));
 await context.close();await browser.close();await new Promise(r=>server.close(r));
}
assert.equal(report.turns.length,10);assert.ok(report.turns.every(t=>t.completed));assert.equal(report.errors.length,0);assert.equal(report.blocked.length,0);
