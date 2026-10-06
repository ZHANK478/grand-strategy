import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const original=read('tests/economy-world.test.mjs');
const header=new Function(original.slice(original.indexOf('const header='),original.indexOf('const suites='))+'return header;')();
const map=read('economy-map.js');
const modules=['orders-1852-econ.js','political-ai.js','economy-game.js','orders-1852-ui.js','news-rules.js'];
const code=header+modules.map(read).join('\n')+'\nconst OrderRules=globalThis.OrderRules;\n'+map.slice(map.indexOf('function applyMapObjects'),map.indexOf('function renderMapObjects'))+
 ['political-newspaper.js','orders-priority.js','orders-initiatives.js','political-actors.js','political-processes.js','news-runtime.js','news-world.js','economy-engine.js','economy-ui.js','news-flow.js','free-ai-world.js'].map(read).join('\n');
const fixture=JSON.parse(read('scenario_orders1852.json'));
const body=`
return (async()=>{
 const checks=[],ok=(v,n)=>{if(!v)throw Error(n);checks.push(n)},near=(a,b)=>Math.abs(a-b)<1e-6;
 renderPlayerPowerPanel=()=>{};renderRulerPortrait=()=>{};renderParliamentPanel=()=>{};renderReligionPanel=()=>{};renderChurchPanel=()=>{};renderSocietyScreen=()=>{};updateCountryInfoPanel=()=>{};maybeAutoPortrait=()=>{};showNotif=()=>{};
 applyScenarioToGame(activeScenario);resetGame('Королевство Пруссия');
 const api=window.FreeWorld,c=countries[playerCountry];econV3(c);
 const d=extra=>({country:playerCountry,cause:'economy',reason:'Масштабный промышленный сдвиг',headline:'Открыты заводы',body:'Производство выросло после ввода новых предприятий.',days:0,cost:0,chance:1,changes:[],...extra});
 const oldGDP=c.gdp,oldPop=c.population;
 api.schedule(d({changes:[{path:'gdp',mode:'multiply',value:1.5},{path:'population',mode:'multiply',value:1.2}]}),'order');
 ok(near(c.gdp,oldGDP*1.5)&&near(c.population,oldPop*1.2),'actual GDP/population shock is not clamped');
 const owned=activeScenario.provinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry);
 ok(near(owned.reduce((s,p)=>s+provinceEcon[p.id].gdp,0),c.gdp),'province GDP matches country');
 ok(near(owned.reduce((s,p)=>s+provinceEcon[p.id].pop,0),c.population),'province population matches country');
 ok(near(Object.values(c.econV3.sectors).reduce((s,x)=>s+x.output,0),c.gdp),'sector outputs match country');
 const cash=c.treasury,debt=c.debt;
 api.schedule(d({changes:[{path:'debt',mode:'add',value:100000}]}),'order');
 ok(near(c.treasury,cash+100000)&&near(c.debt,debt+100000),'actual debt/cash accounting beyond old limit');
 ok(near(c.debt,c.debtDomestic+c.debtForeign),'actual debt parts consistent');
 const budgetBefore=econBudget(c);
 api.schedule(d({changes:[{path:'economy.classes.noble.tax',mode:'set',value:60}]}),'order');
 ok(c.economy.classes.noble.tax===60&&econBudget(c).gross!==budgetBefore.gross,'actual tax change recomputes revenue');
 const b=econBudget(c);ok(near(b.net,b.gross-b.expense),'actual budget equation holds');
 const snapshot=JSON.stringify(c),prov=JSON.stringify(provinceEcon);
 try{api.schedule(d({changes:[{path:'gdp',mode:'multiply',value:2},{path:'army',mode:'set',value:-1}]}),'order');throw Error('should fail');}catch(e){ok(JSON.stringify(c)===snapshot&&JSON.stringify(provinceEcon)===prov,'invalid actual-engine mutation is atomic');}
 const pending=queueOrder('Устроить промышленную выставку');const o=ensureOrders()[0];
 const result=applyOrderPlan({orders:[{id:o.id,kind:'free',status:'execute',reason:'Начать подготовку',effects:{development:d({days:2})}}],events:[],world_effects:{},politics:[],articles:{}});
 ok(result[0].status==='in_progress','actual free order enters timed execution');
 advanceGameDays(2);
 ok(worldState.orders.find(x=>x.id===o.id).status==='executed','actual timed order settles after completion');
 let prompt='';askGemini=async p=>{prompt=p;return JSON.stringify({orders:[],events:[]})};
 await generateOrderPlan();ok(prompt.length<100000,'48-country planning context fits server text limit');
 return {passed:checks.length,promptCharacters:prompt.length};
})();`;
try{console.log(await new Function('fixture',code+body)(fixture));}finally{delete globalThis.OrderRules;}
