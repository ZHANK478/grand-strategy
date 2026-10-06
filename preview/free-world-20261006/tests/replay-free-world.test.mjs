// Recorded real AI responses, actual economic/turn engine, zero network calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const original=read('tests/economy-world.test.mjs');
const header=new Function(original.slice(original.indexOf('const header='),original.indexOf('const suites='))+'return header;')();
const map=read('economy-map.js');
const code=header+['orders-1852-econ.js','political-ai.js','economy-game.js','orders-1852-ui.js','news-rules.js'].map(read).join('\n')+'\nconst OrderRules=globalThis.OrderRules;\n'+map.slice(map.indexOf('function applyMapObjects'),map.indexOf('function renderMapObjects'))+['political-newspaper.js','orders-priority.js','orders-initiatives.js','political-actors.js','political-processes.js','news-runtime.js','news-world.js','economy-engine.js','economy-ui.js','news-flow.js','free-ai-world.js'].map(read).join('\n');
const fixture=JSON.parse(read('scenario_orders1852.json'));
const recording=JSON.parse(read('tests/fixtures/free-world-live.json'));
const body=`return (async()=>{
 renderPlayerPowerPanel=()=>{};renderRulerPortrait=()=>{};renderParliamentPanel=()=>{};renderReligionPanel=()=>{};renderChurchPanel=()=>{};renderSocietyScreen=()=>{};updateCountryInfoPanel=()=>{};maybeAutoPortrait=()=>{};showNotif=m=>messages.push(m);
 applyScenarioToGame(activeScenario);resetGame(session.country);
 const turns=[];let requests=0;
 for(const recorded of session.turns){
  for(const o of recorded.orders){queueOrder(o.text);worldState.orders.at(-1).id=o.id;}
  askGemini=async()=>{requests++;const data=JSON.parse(JSON.stringify(recorded.response)),pending=new Set(ensureOrders().map(o=>o.id));data.orders=data.orders.filter(o=>pending.has(o.id));for(const o of ensureOrders())if(!data.orders.some(r=>r.id===o.id))data.orders.push({id:o.id,status:'defer',reason:'Сохранённый ответ получен до исправления; для оставшегося поручения в нём нет нового решения.'});return JSON.stringify(data);};
  const advanced=await nextTurn('m1'),c=countries[playerCountry],b=econBudget(c),owned=scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry);
  turns.push(JSON.parse(JSON.stringify({advanced,day:gameDayNumber(),debt:c.debt,cash:c.treasury,rulers:Object.fromEntries(ALL_COUNTRIES.map(n=>[n,countries[n].ruler])),orders:worldState.orders,events:worldState.periodEvents,paper:worldState.newspaperHistory.at(-1),validation:worldState.politicalErrors,errors:worldState.freeWorldErrors,plannerFailure:worldState.plannerFailure,checks:{finite:Object.values(window.FreeWorld.paths(c)).every(Number.isFinite),budget:Math.abs(b.net-b.gross+b.expense)<1e-7,debt:Math.abs(c.debt-c.debtDomestic-c.debtForeign)<1e-7,provinceGDP:Math.abs(owned.reduce((s,p)=>s+provinceEcon[p.id].gdp,0)-c.gdp)<1e-5,provincePop:Math.abs(owned.reduce((s,p)=>s+provinceEcon[p.id].pop,0)-c.population)<1e-5,sectors:Math.abs(Object.values(c.econV3.sectors).reduce((s,v)=>s+v.output,0)-c.gdp)<1e-5}})));
 }
 return {turns,requests};
})();`;
try{
 for(const session of recording.sessions){
  const result=await new Function('fixture','session',code+body)(fixture,session);
  assert.equal(result.requests,5);
  for(const [i,t]of result.turns.entries()){
   assert.equal(t.advanced,true,session.country+' turn '+i);
   assert.ok(Object.values(t.checks).every(Boolean),'Arithmetic '+session.country+' '+i);
   assert.ok(!t.plannerFailure,'Planner '+JSON.stringify(t.plannerFailure));
   assert.ok(t.validation.every(e=>e.error.includes('В плане набора отсутствует')),'Validation '+JSON.stringify(t.validation));
   assert.ok(!t.errors?.length,'Application '+JSON.stringify(t.errors));
   assert.ok(t.orders.every(o=>(!o.technicalError||o.technicalError.includes('В плане набора отсутствует'))&&o.status!=='blocked'),'Receipts '+JSON.stringify(t.orders));
   const articles=t.paper.domestic;
   assert.equal(new Set(articles.map(a=>a.headline+'\n'+a.body)).size,articles.length,'Duplicate news');
  }
  if(session.country==='Франция'){
   assert.ok(result.turns[0].paper.domestic.some(a=>a.headline.includes('Орлеанах')),'Prefixed event retained');
   assert.equal(result.turns[3].orders.at(-1).status,'rejected');
   assert.equal(result.turns[3].rulers['Российская империя'],'Николай I');
   assert.equal(result.turns[4].orders.at(-1).status,'executed','Analytical answer needs no development');
   assert.ok(result.turns[4].paper.domestic.some(a=>a.headline==='Ответ кабинета'));
  }
  if(session.country==='Королевство Пруссия'){
   assert.equal(result.turns[1].orders.at(-1).status,'executed');
   assert.equal(result.turns[1].debt-result.turns[0].debt,100);
   assert.equal(result.turns[4].debt-result.turns[1].debt,-25);
  }
  if(session.country==='Австрийская империя'){
   assert.equal(result.turns[2].orders.at(-1).status,'deferred','Missing recruitment numbers never count as executed');
   assert.ok(!result.turns[2].events.some(e=>e.headline.includes('набор десяти')),'An invalid order cannot be duplicated into autonomous events');
  }
  console.log(session.country+': five recorded turns, accounting, validated outcomes and news passed');
 }
}finally{delete globalThis.OrderRules;}
