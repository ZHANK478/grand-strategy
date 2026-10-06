import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8767,'127.0.0.1',r));const browser=await chromium.launch();
try{for(const phone of [false,true]){
 const context=await browser.newContext(phone?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,r=>r.abort());page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8767/economy-world.html');await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready');
 assert.equal(await page.evaluate(()=>window.FREE_AI_EXPERIMENT&&!!window.FreeWorld),true);
 await page.selectOption('#mobile-country-picker','Франция');await page.locator('#mobile-start-btn').click();await page.waitForFunction(()=>gameStarted);
 const result=await page.evaluate(async()=>{
  window.testEnsureAIForTurn=async()=>true;const before={gdp:countries[playerCountry].gdp,treasury:countries[playerCountry].treasury,debt:countries[playerCountry].debt},date=gameDayNumber();let modelCalls=0;
  queueOrder('Организовать промышленную выставку и профинансировать индустриальные вложения.');
  const oid=ensureOrders()[0].id,dev=(over={})=>({country:playerCountry,cause:'economy',reason:'Казначейство привлекло заём для крупного промышленного проекта.',headline:'Промышленная выставка открывает новую эпоху',body:'Правительство открыло промышленную выставку. Частные предприниматели представили новые машины; крупные вложения привели к вводу предприятий. Министр рассчитывает укрепить производство и экспорт.',changes:[],days:0,cost:0,chance:1,...over});
  askGemini=async()=>{modelCalls++;return JSON.stringify({orders:[{id:oid,status:'execute',reason:'Начать вложения',development:dev({changes:[{path:'debt',mode:'add',value:1000000},{path:'gdp',mode:'multiply',value:1.5}]})}],events:[{...dev(),country:'Великобритания',cause:'domestic',headline:'Британский кабинет столкнулся с кризисом',body:'Кабинет утратил значительную часть общественной поддержки после внутреннего скандала.',changes:[{path:'stability',mode:'add',value:-25}]}]})};
  const advanced=await nextTurn('week'),c=countries[playerCountry],owned=activeScenario.provinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry),edition=worldState.newspaperHistory.at(-1);
  return {advanced,modelCalls,dateAdvance:gameDayNumber()-date,gdpRatio:c.gdp/before.gdp,debtIncrease:c.debt-before.debt,cashIncrease:c.treasury-before.treasury,provinceGDP:owned.reduce((s,p)=>s+provinceEcon[p.id].gdp,0),gdp:c.gdp,budget:econBudget(c),order:worldState.orders.find(o=>o.id===oid).status,domestic:edition.domestic.map(e=>e.headline),foreign:edition.foreign.map(e=>e.headline),saveKeys:Object.keys(localStorage).filter(k=>k.startsWith('gs_freeai_save_'))};
 });
 assert.equal(result.advanced,true);assert.equal(result.modelCalls,1,'One unrestricted planner; no legacy political/editor calls');assert.equal(result.dateAdvance,7);assert.ok(result.gdpRatio>1.45);assert.ok(result.debtIncrease>=1000000);assert.ok(result.cashIncrease>990000&&result.cashIncrease<1010000,'Financing is applied once');assert.ok(Math.abs(result.provinceGDP-result.gdp)<1e-6);assert.ok(Math.abs(result.budget.net-(result.budget.gross-result.budget.expense))<1e-6);assert.equal(result.order,'executed');assert.ok(result.domestic.includes('Промышленная выставка открывает новую эпоху'));assert.ok(result.foreign.includes('Британский кабинет столкнулся с кризисом'));assert.ok(result.saveKeys.length);assert.deepEqual(errors,[]);
 console.log((phone?'phone':'desktop')+' free-world turn, accounting, news, isolated saves and one model call passed');await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
