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

const report={limit:12,requests:[],cases:[],started:new Date().toISOString()},replies=[];
await mkdir('political-repair-output',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.route('**/auth/v1/signup',async route=>{const body=route.request().postDataJSON();body.data={...(body.data||{}),gs_playtest_run:process.env.GITHUB_RUN_ID,gs_playtest_case:'repair-diagnostics'};await route.continue({postData:JSON.stringify(body)});});
 await context.route('**/functions/v1/guest-ai',async route=>{
  const body=route.request().postDataJSON();if(body.operation!=='generate'){await route.continue();return;}
  if(report.requests.length>=12)throw Error('Authorised diagnostic limit reached');
  const prompt=body.messages[0].content,entry={number:report.requests.length+1,wire:JSON.stringify(body.messages).length};
  report.requests.push(entry);assert.ok(entry.wire<140000);
  const response=await route.fetch({timeout:150000,maxRetries:0}),data=await response.json();
  entry.http=response.status();entry.usage=data.usage;entry.finish=data.choices?.[0]?.finish_reason;
  replies.push({request:prompt,response:data.choices?.[0]?.message?.content||data.error});
  await route.fulfill({response,body:JSON.stringify(data)});
 });
 const page=await context.newPage();
 page.on('pageerror',e=>{report.pageErrors||=[];report.pageErrors.push(e.message);});
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load'});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
 await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
 await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
 for(const name of ['war','influence','peace','reform']){
  const saved=JSON.parse(await readFile('political-seed/political-campaign-'+name+'/state.json','utf8'));
  const result=await page.evaluate(async({saved,name})=>{
   localStorage.setItem(SAVE_PREFIX+'diagnostic',JSON.stringify(saved));
   if(!await loadGameSlot('diagnostic'))throw Error('Late save failed');
   if(!await testEnsureAIForTurn())throw Error('Server guest session failed');
   worldState.periodEvents=[];worldState.newspaperHistory=[];worldState.plannedPeriod='месяц';
   worldState.orders=[];policyState().calls={turn,used:0};policyState().audit=[];
   let text=name==='war'?'Начать новый набор 12000 пехотинцев за шесть месяцев с оплатой из казны.':
    name==='influence'?'Поручить министру иностранных дел выступить посредником в итальянских спорах и пригласить заинтересованные правительства к обмену конкретными условиями, не заключая договор от их имени.':
    name==='peace'?'Предложить Бельгии взаимные пошлины четыре процента на один год, без военных обязательств; нужно её согласие.':
    'Поручить главе правительства начать обсуждение закона о доступе женщин к университетам с общественными группами и парламентом. Не обещать их согласия.';
   if(name==='war'){
    const enemy=policyLive().find(n=>/Прусси/.test(n));
    if(!isAtWar(playerCountry,enemy))declareEngineWar(playerCountry,enemy,{type:'defense'});
    for(const id of policyLive().filter(n=>n!==playerCountry))policyCabinet(id).reviewDay=gameDayNumber()+90;
   }
   const before={day:gameDayNumber(),army:countries[playerCountry].army,treasury:countries[playerCountry].treasury};
   queueOrder(text);const plan=await generateOrderPlan(),receipts=applyOrderPlan(plan);
   policyScanWorld();policyState().round++;
   const selected=policySelect(6),first=await policyBatch(selected,receipts,'repair-opening');
   policyScanWorld();policyState().round++;
   const response=policySelect(3,true,selected),second=response.length?response:policySelect(3,false,selected);
   const acted=await policyBatch(second,[],'repair-response');
   return {name,selected,second,first,acted,before,after:{day:gameDayNumber(),army:countries[playerCountry].army,treasury:countries[playerCountry].treasury},
    receipts:receipts.map(o=>({text:o.text,status:o.status,kind:o.kind,reason:o.reason,technical:o.technicalError,process:o.processId})),
    audit:policyState().audit,decisions:ensurePolitics().decisions.filter(d=>d.turn===turn).map(d=>({country:d.country,action:d.action,target:d.target,motive:d.motive,kind:d.task?.kind,effects:d.task?.effects})),
    events:worldState.periodEvents.map(e=>({headline:e.headline,body:e.body,actors:e.actors}))};
  },{saved,name});
  report.cases.push(result);console.log('REPAIR_CASE '+JSON.stringify(result));
  await writeFile('political-repair-output/report.json',JSON.stringify(report,null,2));
 }
 await context.close();
}finally{
 report.cost=report.requests.reduce((s,r)=>s+(r.usage?.cost||0),0);
 report.finished=new Date().toISOString();
 await writeFile('political-repair-output/report.json',JSON.stringify(report,null,2));
 await writeFile('political-repair-output/responses.json',JSON.stringify(replies,null,2));
 console.log('REPAIR_TOTAL '+JSON.stringify({requests:report.requests.length,cost:report.cost,pageErrors:report.pageErrors||[],requestsDetail:report.requests}));
 await browser.close();await new Promise(r=>server.close(r));
}
assert.equal(report.cases.length,4);
assert.ok(report.cases.every(c=>c.before.day===c.after.day),'Diagnostics do not consume another calendar turn');
assert.ok(report.cases.every(c=>c.receipts.every(o=>!o.technical)),'No technical player order loss');
assert.equal(report.pageErrors?.length||0,0);
