import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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


const report={limit:2,requests:[],errors:[]};await mkdir('political-final-output',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.route('**/auth/v1/signup',async route=>{const b=route.request().postDataJSON();b.data={...(b.data||{}),gs_playtest_run:process.env.GITHUB_RUN_ID,gs_playtest_case:'final-two-checks'};await route.continue({postData:JSON.stringify(b)});});
 await context.route('**/functions/v1/guest-ai',async route=>{
  const b=route.request().postDataJSON();if(b.operation!=='generate'){await route.continue();return;}
  assert.ok(report.requests.length<2,'Only two paid requests remain authorised');
  const e={wire:JSON.stringify(b.messages).length};report.requests.push(e);
  const response=await route.fetch({timeout:150000,maxRetries:0}),data=await response.json();
  e.http=response.status();e.usage=data.usage;e.finish=data.choices?.[0]?.finish_reason;e.reply=data.choices?.[0]?.message?.content||data.error;
  await route.fulfill({response,body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load'});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
 await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
 await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
 const saved=JSON.parse(await readFile('political-seed/political-campaign-war/state.json','utf8'));
 report.result=await page.evaluate(async saved=>{
  localStorage.setItem(SAVE_PREFIX+'final-repair',JSON.stringify(saved));if(!await loadGameSlot('final-repair'))throw Error('Saved game');
  if(!await testEnsureAIForTurn())throw Error('Guest transport');
  worldState.periodEvents=[];worldState.orders=[];policyState().calls={turn,used:0};policyState().audit=[];
  const enemy=policyLive().find(n=>/Прусси/.test(n)),mediator=policyLive().find(n=>/Российск/.test(n));
  if(!isAtWar(playerCountry,enemy))declareEngineWar(playerCountry,enemy,{type:'defense'});
  queueOrder('Начать новый набор 12000 пехотинцев за шесть месяцев с оплатой из казны.');
  const before=countries[playerCountry].army,plan=await generateOrderPlan(),results=applyOrderPlan(plan);
  policyScanWorld();policyState().round++;
  const acted=await policyBatch([enemy,mediator],results,'final-repair');
  return {receipts:results.map(o=>({text:o.text,status:o.status,reason:o.reason,technical:o.technicalError,process:o.processId})),before,army:countries[playerCountry].army,acted,audit:policyState().audit,
   decisions:ensurePolitics().decisions.filter(d=>d.turn===turn&&[enemy,mediator].includes(d.country)).slice(-2).map(d=>({country:d.country,action:d.action,motive:d.motive,kind:d.task?.kind,material:d.material})),
   headlines:worldState.periodEvents.map(e=>e.headline)};
 },saved);
 console.log('FINAL_REPAIR_RESULT '+JSON.stringify(report.result));await context.close();
}finally{
 report.cost=report.requests.reduce((s,r)=>s+(r.usage?.cost||0),0);
 await writeFile('political-final-output/report.json',JSON.stringify(report,null,2));
 console.log('FINAL_REPAIR_TOTAL '+JSON.stringify({requests:report.requests.length,cost:report.cost,errors:report.errors,usage:report.requests.map(r=>({wire:r.wire,http:r.http,finish:r.finish,in:r.usage?.prompt_tokens,out:r.usage?.completion_tokens}))}));
 await browser.close();await new Promise(r=>server.close(r));
}
assert.equal(report.requests.length,2);
assert.ok(report.result.receipts.every(o=>o.status==='in_progress'&&!o.technical));
assert.equal(report.result.army,report.result.before,'No instant soldiers');
assert.equal(report.result.audit.length,0,'No hidden cabinet execution errors');
assert.equal(report.result.acted.length,2);
assert.equal(report.errors.length,0);
