// Remaining authorised auxiliary budget: hard maximum 10 provider requests.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),run=process.env.GITHUB_RUN_ID,output='living-diagnostic';
assert.ok(run);await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),report={requests:[],stages:[],errors:[]};
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
await context.route('**/auth/v1/signup',async route=>{const b=route.request().postDataJSON();b.data={...(b.data||{}),gs_playtest_run:run,gs_playtest_case:'living_diagnostic'};await route.continue({postData:JSON.stringify(b)});});
await context.route('**/functions/v1/guest-ai',async route=>{
 const b=route.request().postDataJSON();if(b.operation!=='generate'){await route.continue();return;}
 if(report.requests.length>=10){report.errors.push('Auxiliary budget guard reached');await route.fulfill({status:429,contentType:'application/json',body:'{"error":"request_limit"}'});return;}
 const prompt=b.messages?.[0]?.content||'',entry={number:report.requests.length+1,kind:prompt.startsWith('NEWSPAPER')?'editor':prompt.startsWith('POLITICAL_CABINETS')?'cabinet':prompt.startsWith('MINISTER')?'advisor':'planner',repair:prompt.includes('ВОССТАНОВЛЕНИЕ ФОРМАТА')};
 report.requests.push(entry);
 try{const r=await route.fetch({timeout:150000,maxRetries:0}),data=await r.json();entry.http=r.status();entry.usage=data.usage;entry.finish=data.choices?.[0]?.finish_reason;await route.fulfill({response:r,body:JSON.stringify(data)});}catch(e){entry.error=String(e);await route.fulfill({status:502,contentType:'application/json',body:'{"error":"ai_unavailable"}'});}
});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function stage(name,fn,arg){const result=await page.evaluate(fn,arg);report.stages.push({name,...result});console.log('DIAGNOSTIC_STAGE '+JSON.stringify(report.stages.at(-1)));await writeFile(output+'/report.json',JSON.stringify(report,null,2));return result;}
try{
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:60000});
 await page.evaluate(async()=>{await initAuth();setTextModel('openai/gpt-6-luna');});
 let ready=false;
 for(let i=0;i<72&&!ready;i++){ready=await page.evaluate(async()=>{const {data,error}=await sb.functions.invoke('guest-ai',{body:{operation:'status'}});return !error&&data?.guest_turns_remaining>=4;});if(!ready)await page.waitForTimeout(5000);}
 assert.ok(ready,'Explicit diagnostic quota required');
 await page.selectOption('#mobile-country-picker','Королевство Пруссия');await page.click('#mobile-start-btn');
 const first=await stage('ships-and-border',async()=>{
  queueOrder('Построить пять кораблей нашего флота на собственной подходящей верфи; класс выбрать самостоятельно. Оплатить из казны.');
  queueOrder('Развернуть 40000 имеющихся солдат в собственной провинции у границы Шлезвига Гольштейна; это пока не вторжение.');
  const plan=await generateOrderPlan(),orders=applyOrderPlan(plan);
  return {orders,builds:maritimeFacts(playerCountry).builds,units:worldState.mapObjects.filter(u=>u.owner===playerCountry),cash:countries[playerCountry].treasury};
 });
 assert.ok(first.builds.some(b=>b.count===5),'Five ships started at owned yard');
 assert.ok(first.units.some(u=>u.type==='army'&&u.troops===40000),'Existing border force deployed');
 const answer=await stage('minister-current-duration',async()=>{
  advanceGameDays(120);queueOrder('Морской министр, дайте сам ответ: где строятся заказанные корабли, почему они ещё не готовы, что оплачено и сколько дней осталось на сегодня?');
  const orders=applyOrderPlan(await generateOrderPlan());
  return {date:dateLabel(),orders,currentBuilds:maritimeFacts(playerCountry).builds};
 });
 assert.ok(answer.orders.some(o=>o.response),'Minister delivered actual answer');
 const invasion=await stage('invasion-and-foreign-response',async()=>{
  queueOrder('Ввести уже размещённые 40000 солдат в Шлезвиг Гольштейн без формального объявления войны. Это вторжение; при сопротивлении вступить в бой, не аннексировать автоматически.');
  const orders=applyOrderPlan(await generateOrderPlan());advanceGameDays(30);
  await runPoliticalRound(orders);
  const paper={from:'1 мая 1852',to:dateLabel(),domestic:[],foreign:[],orderCoverage:[],receipts:[]};await writeNewspaper(paper);
  return {orders,wars:worldState.atWarWith,occupations:strategyState().occupations,units:worldState.mapObjects.filter(u=>u.owner===playerCountry),paper,audit:policyState().audit};
 });
 assert.ok(invasion.orders.some(o=>['executed','in_progress'].includes(o.status)),'Hostile entry executed');
 await stage('advisor-annual-units',async()=>({text:await askAdvisor('Объясните текущий годовой рост экономики, истинный бюджетный баланс и оставшийся срок корабельного заказа. Что практически изменить для роста?')}));
 const power=await stage('succession',async()=>{
  resetGame('Франция');for(const n of ALL_COUNTRIES)econV3(countries[n]);
  worldState.periodEvents=[];queueOrder('Глава государства лично выпивает смертельную дозу яда и умирает. Передать исполнительную власть правдоподобному преемнику, сохраняя страну, договоры и школьную программу. Игрок продолжает за преемника.');
  const original=countries[playerCountry].ruler,orders=applyOrderPlan(await generateOrderPlan());
  const paper={from:dateLabel(),to:dateLabel(),domestic:[],foreign:[],orderCoverage:[],receipts:[]};await writeNewspaper(paper);
  return {original,ruler:countries[playerCountry].ruler,orders,paper};
 });
 assert.notEqual(power.original,power.ruler,'Actual ruler changes in the first execution');
 assert.ok(power.paper.domestic.some(a=>/яд|смерт|погиб|преем/i.test(a.headline+' '+a.body)),'Narrative reaches newspaper');
 await page.screenshot({path:output+'/phone.png'});
}finally{
 report.cost=report.requests.reduce((n,r)=>n+(r.usage?.cost||0),0);
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log('DIAGNOSTIC_SUMMARY '+JSON.stringify({requests:report.requests,errors:report.errors,cost:report.cost,stages:report.stages.map(s=>s.name)}));
 await context.close();await browser.close();await new Promise(r=>server.close(r));
}
assert.equal(report.errors.length,0,report.errors.join('; '));
