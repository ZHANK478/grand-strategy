// Explicit one-time paid playtest. Never run from ordinary CI or pull requests.
// Resume with two recorded calls; the previous follow-up stopped before any paid stage.
// User authorised 40 provider requests on 2026-10-04. 22 reached OpenRouter; 18 payload rejections were free. This confirmation run is capped at 18 further attempts, total provider calls at most 40.
import { chromium } from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),limit=40;
const seedReport=JSON.parse(await readFile('playtest-seed/report.json','utf8'));
const seedResponses=[];
const paidBefore=seedReport.usage.filter(u=>u.http===200).length;
const report={limit,attempts:paidBefore,usage:seedReport.usage.filter(u=>u.http===200),campaigns:[],blockedOptionalCalls:0,replayedRequests:0};
if(paidBefore!==22)throw Error('Expected exactly 22 previously delivered provider calls; 18 HTTP 400 payload rejections never reached OpenRouter');
await mkdir('playtest-output',{recursive:true});
const server=createServer(async(req,res)=>{
 try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/'))throw Error('path');
 const data=await readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const programs={
 'Франция':[
  ['Учредить земельную комиссию для рассмотрения земельных споров. Определить её полномочия и назначить председателя, подходящего по квалификации.','Снизить налог буржуа вдвое от текущей ставки.'],
  ['Увеличить месячные расходы на образование на 20 процентов от текущего уровня постепенно за шесть месяцев.','Начать набор 15000 пехотинцев за шесть месяцев.'],
  ['Предложить Бельгии взаимные пошлины 3 процента на год. Направить предложение, не считать договор заключённым без её согласия.'],
  ['Организовать за месяц плебисцит об учреждении конституционной империи. Сохранить представительный законодательный орган. Исход голосования не предрешать.'],
  ['Поручить морскому ведомству защищать французскую торговлю в Ла-Манше имеющимися силами. Самостоятельно выбрать подходящую эскадру и маршрут. Не объявлять войну.'],
  [],
  ['Взять заём 1000 миллионов расчётных единиц для развития инфраструктуры.','Увеличить расходы на инфраструктуру на 20 процентов за шесть месяцев.'],
  ['Распорядиться разрешить женщинам получать образование и снять препятствующие этому административные запреты.'],
  ['Назначить барона Османа главой правительства и назвать должность председателем кабинета. Пусть кабинет определит первые меры по улучшению городского управления.'],
  ['Погасить 500 миллионов расчётных единиц государственного долга, если казна позволяет.','Поручить кабинету сохранить действующие программы и отвечать на конкретные предложения соседей, не гарантируя их согласия.']
 ],
 'Пруссия':[
  ['Учредить комиссию по улучшению условий труда и назначить ей полномочия.','Снизить налог рабочих на четверть от текущей ставки.'],
  ['Предложить Саксонии договор о ненападении на один год, не навязывая согласие.'],
  ['Предложить Саксонии взаимную беспошлинную торговлю на год, условия вступят в силу только после её отдельного согласия.'],
  ['Разместить 50000 имеющихся солдат в собственной провинции у границы с Саксонией для обороны. Передать Саксонии объяснение, что это не объявление войны.'],
  ['Предложить Австрии переговоры о германском сотрудничестве и представительство германских государств. Не считать программу принятой заранее.'],
  [],
  ['Разрешить женщинам получать образование и поручить учебным заведениям изменить порядок приёма.'],
  ['На один месяц установить все прямые налоги населения в ноль. Недостающие расходы оплатить из казны, показать реальный дефицит.'],
  [],
  ['Вернуть развёрнутые у Саксонии войска в собственные внутренние провинции и поручить дипломатам снять напряжённость, не гарантируя успех.']
 ]
};
try{
 const controls={'Франция':[0,1,2,4,8],'Пруссия':[0,1,3,7]};
 for(const [country,fullProgram]of Object.entries(programs)){
  const program=controls[country].map(i=>fullProgram[i]);
  const campaign={country,goal:country==='Франция'?'Реформы и морская торговля без войны':'Германское влияние, сотрудничество и проверка бюджетных ограничений',turns:[],pageErrors:[],cloudWarnings:[]};report.campaigns.push(campaign);
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  let perTurn=0,currentStep=0,seedIndex=0;const replies=[];
  await context.route('**/functions/v1/guest-ai',async route=>{
   const body=route.request().postDataJSON();
   if(body?.operation!=='generate'){await route.continue();return;}
   if(false){
    const old=seedResponses[seedIndex++];perTurn++;report.replayedRequests++;replies.push(old);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:old.response},finish_reason:'stop'}],model:'openai/gpt-6-luna',usage:old.usage})});return;
   }
   if(report.attempts>=limit||perTurn>=2){
    report.blockedOptionalCalls++;await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'request_limit',message:'Explicit playtest budget reached'})});return;
   }
   report.attempts++;perTurn++;
   const entry={campaign:country,step:currentStep,number:report.attempts,type:body.messages?.[0]?.content?.startsWith('POLITICAL_CABINETS_V1')?'foreign':'orders',inputChars:body.messages?.[0]?.content?.length||0};
   report.usage.push(entry);
   try{
    const response=await route.fetch({timeout:120000,maxRetries:0}),data=await response.json();
    entry.http=response.status();entry.usage=data.usage;entry.finish=data.choices?.[0]?.finish_reason;entry.model=data.model;
    replies.push({step:currentStep,type:entry.type,response:data.choices?.[0]?.message?.content||data.error,usage:data.usage});
    await route.fulfill({response,body:JSON.stringify(data)});
   }catch(error){entry.error=String(error);await route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'ai_unavailable'})});}
  });
  const page=await context.newPage();
  page.on('pageerror',e=>campaign.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('cloudSave'))campaign.cloudWarnings.push(m.text());});
  await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
  await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
  const chosen=await page.locator('#mobile-country-picker option').evaluateAll((options,label)=>options.find(o=>o.value===label)?.value||options.find(o=>label==='Пруссия'&&/Прусси/.test(o.value))?.value,country);
  if(!chosen)throw Error('Country missing: '+country);
  await page.selectOption('#mobile-country-picker',chosen);await page.click('#mobile-start-btn');
  campaign.initial=await page.evaluate(()=>({day:gameDayNumber(),date:dateLabel(),cash:countries[playerCountry].treasury,army:countries[playerCountry].army,taxes:Object.fromEntries(Object.entries(countries[playerCountry].economy.classes).map(([k,v])=>[k,v.tax])),budget:econBudget(countries[playerCountry])}));
  for(let i=0;i<program.length;i++){
   currentStep=i+1;perTurn=0;
   let orders=program[i].slice();
   const current=await page.evaluate(()=>({foreign:worldState.newspaperHistory?.at(-1)?.foreign||[],offers:strategyState().offers.filter(o=>o.b===playerCountry&&o.status==='open'),trade:maritimeState().tradeOffers?.filter(o=>o.b===playerCountry&&o.status==='open')||[],taxes:Object.fromEntries(Object.entries(countries[playerCountry].economy.classes).map(([k,v])=>[k,v.tax]))}));
   if(i===5){
    const warning=current.foreign.find(a=>/предупреж|опасен|напряж|против|патрул/i.test(a.headline+' '+a.body));
    orders=[warning?'Поручить министру иностранных дел ответить на это конкретное событие, обозначить наши интересы и предложить переговоры, не объявлять успех заранее: '+(warning.headline+' '+warning.body).slice(0,850):'Отправить послов в '+(country==='Франция'?'Испанию':'Австрию')+' для переговоров о безопасности и взаимном сотрудничестве.'];
    if(country==='Пруссия')orders.push('Увеличить расходы на инфраструктуру на 25 процентов постепенно за шесть месяцев.');
   }
   if(country==='Пруссия'&&i===8)orders=['Восстановить прямые налоговые ставки: '+Object.entries(campaign.initial.taxes).map(([k,v])=>k+' '+v+'%').join(', ')+'.'];
   const incoming=current.trade[0]||current.offers[0];if(incoming&&i!==7)orders.push('Рассмотреть существующее предложение '+incoming.a+' '+incoming.id+' и принять его, если оно сохраняет суверенитет и казна обеспечивает обязательства.');
   const start=await page.evaluate(()=>gameDayNumber());
   await page.evaluate(list=>{for(const text of list)queueOrder(text);},orders);
   await page.locator('.next-btn').click();
   await page.waitForFunction(s=>!turnRunning&&gameDayNumber()>s,start,{timeout:240000}).catch(async error=>{campaign.turns.push({step:i+1,orders,failed:String(error),notifications:await page.locator('.notif').allTextContents()});});
   const result=await page.evaluate(step=>({
    step,date:dateLabel(),day:gameDayNumber(),cash:countries[playerCountry].treasury,debt:countries[playerCountry].debt,army:countries[playerCountry].army,ruler:countries[playerCountry].ruler,pm:countries[playerCountry].pm,government:countries[playerCountry].government,budget:econBudget(countries[playerCountry]),
    receipts:worldState.orders.filter(o=>o.resolvedTurn===turn||o.createdTurn>=turn-1).map(o=>({text:o.text,status:o.status,reason:o.reason,technical:o.technicalError,kind:o.kind})),
    paper:worldState.newspaperHistory.at(-1),
    policyErrors:policyState().audit.slice(-8),plannerFailure:worldState.plannerFailure,
    processes:ensureExecutiveProcesses().filter(p=>p.status==='active').map(p=>({summary:p.summary,start:p.start,due:p.due})),
    politicalTasks:ensurePolitics().tasks.slice(-6).map(p=>({goal:p.goal,status:p.status,result:p.result})),
    records:countries[playerCountry].politicalRecords?.slice(-4)
   }),i+1);
   campaign.turns.push(result);
   console.log('PLAYTURN '+JSON.stringify({country,...result}));
   await writeFile('playtest-output/report.json',JSON.stringify(report,null,2));
   await writeFile('playtest-output/'+country+'-responses.json',JSON.stringify(replies,null,2));
   const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem(SAVE_PREFIX+currentSlotId)));
   await writeFile('playtest-output/'+country+'-state.json',JSON.stringify(checkpoint));
   assert.ok(result.day>start,'Calendar must advance');assert.equal(campaign.pageErrors.length,0,'No browser errors');
  }
  // Actual anonymous cloud round trip, with fractional metadata.
  campaign.cloud=await page.evaluate(async()=>{
   const id='playtest-fractional-'+Date.now(),state={test:true,treasury:4077.606};
   const saved=await cloudSave(id,{country:playerCountry,ruler:countries[playerCountry].ruler,turn,year,month,treasury:4077.606,scenarioRef:activeScenarioRef,scenarioName:activeScenario.name},state);
   const loaded=saved?await cloudLoad(id):null;if(saved)await cloudDelete(id);
   return {saved,treasury:loaded?.treasury};
  });
  await page.screenshot({path:'playtest-output/'+country+'.png'});
  await context.close();
 }
}finally{
 await writeFile('playtest-output/report.json',JSON.stringify(report,null,2));
 console.log('PLAYTEST SUMMARY '+JSON.stringify({attempts:report.attempts,blockedOptionalCalls:report.blockedOptionalCalls,usage:report.usage,campaigns:report.campaigns.map(c=>({country:c.country,turns:c.turns.length,pageErrors:c.pageErrors,cloudWarnings:c.cloudWarnings,cloud:c.cloud}))}));
 await browser.close();await new Promise(r=>server.close(r));
}
assert.ok(report.attempts<=40);
assert.equal(report.campaigns.length,2);
assert.ok(report.campaigns.every(c=>c.turns.length===controls[c.country].length&&c.cloud?.saved&&c.cloud.treasury===4077.606));
