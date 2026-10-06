import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
let clock=0,queries=[],random=0;
const mk=(ruler)=>({ruler,rulerAge:50,pm:'Premier',government:'Monarchy',displayName:ruler,agenda:'',gdp:1000,population:100,army:100,treasury:100,debt:20,debtDomestic:15,debtForeign:5,stability:70,militarySupport:80,economy:{classes:{a:{share:70,incomeShare:.7,tax:20},b:{share:30,incomeShare:.3,tax:20}}},econV3:{capital:200,sectors:{industry:{output:400,capital:80},services:{output:600,capital:120}},monthly:{net:1}}});
const c={France:mk('Louis'),Russia:mk('Nicholas')};
const ctx={turn:2,countries:c,playerCountry:'France',ALL_COUNTRIES:['France','Russia'],worldState:{orders:[],pastEvents:[],periodEvents:[],aiWars:[]},provinceOwners:{},provinceEcon:{f:{gdp:1000,pop:100},r:{gdp:1000,pop:100}},scenarioProvinces:[{id:'f',owner:'France'},{id:'r',owner:'Russia'}],Math:Object.create(Math),crypto:{randomUUID:()=>String(queries.length)+'-'+Math.random()},dateLabel:()=> '1 Jan 1852',gameDayNumber:()=>clock,parseOrderReply:JSON.parse,
 generateOrderPlan(){},executeOrderEffects(){},OrderRules:{authority(){}},applyOrderPlan:()=>[],advanceGameDays:n=>{clock+=n;return {months:0,deaths:[],econ:[]}},writeNewspaper:async()=>{},
 ensureOrders:()=>ctx.worldState.orders.filter(o=>['prepared','deferred'].includes(o.status)),orderStatSnapshot:x=>JSON.parse(JSON.stringify(x)),
 econV3:()=>{},econBudget:x=>({gross:x.gdp/120,net:x.gdp/120-x.debt/100}),econRecompute:()=>{for(const x of Object.values(ctx.countries))x.income=x.gdp/120;},reconcileOrderArmies:()=>{},
 setCountryLeader:(id,fields)=>Object.assign(ctx.countries[id],fields),renameCountry:(id,name)=>ctx.countries[id].displayName=name,addRelation(){},isAtWar:()=>false,declareEngineWar(){},createPoliticalOffer(){},
 recordWorldEvent:(section,headline,body,actors,details)=>ctx.worldState.periodEvents.push({section,headline,body,actors,details}),askGemini:async p=>{queries.push(p);return JSON.stringify({orders:[],events:[]});},
 captureOrderExecution:()=>({countries:JSON.parse(JSON.stringify(ctx.countries)),worldState:JSON.parse(JSON.stringify(ctx.worldState)),provinceEcon:JSON.parse(JSON.stringify(ctx.provinceEcon))}),restoreOrderExecution:s=>{for(const key of ['countries','worldState','provinceEcon'])ctx[key]=s[key];}};
ctx.Math.random=()=>random;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('free-ai-world.js','utf8'),ctx);
const d=(over={})=>({country:'France',reason:'A financed industrial shock',headline:'Industry expands',body:'New production is commissioned.',changes:[],days:0,cost:0,chance:1,...over});
const api=ctx.FreeWorld;
api.schedule(d({changes:[{path:'gdp',mode:'multiply',value:2},{path:'population',mode:'add',value:100},{path:'stability',mode:'add',value:-40}]}),'order');
assert.equal(ctx.countries.France.gdp,2000);assert.equal(ctx.provinceEcon.f.gdp,2000);assert.equal(ctx.provinceEcon.f.pop,200);assert.equal(ctx.countries.France.econV3.sectors.industry.output,800);assert.equal(ctx.countries.France.stability,30);assert.equal(ctx.countries.France.income,2000/120);
api.schedule(d({changes:[{path:'debt',mode:'add',value:10000}]}),'order');assert.equal(ctx.countries.France.treasury,10100,'Loan credits cash once');assert.equal(ctx.countries.France.debtDomestic+ctx.countries.France.debtForeign,ctx.countries.France.debt,'Debt components agree beyond old cap');
api.schedule(d({changes:[{path:'debt',mode:'add',value:-100}]}),'order');assert.equal(ctx.countries.France.treasury,10000,'Repayment debits cash once');
const before=JSON.stringify(ctx.countries.France);assert.throws(()=>api.schedule(d({changes:[{path:'debt',mode:'add',value:1},{path:'treasury',mode:'add',value:1}]}),'order'));assert.equal(JSON.stringify(ctx.countries.France),before,'Invalid financing is atomic');
assert.throws(()=>api.validate(d({country:'Russia',state:{ruler:'Dead'}}),'order'),'Cannot decree foreign death');
assert.throws(()=>api.validate(d({country:'Russia',cause:'succession',state:{ruler:'Successor'}})),'No invented natural death');
assert.throws(()=>api.validate(d({changes:[{path:'__proto__.polluted',mode:'set',value:1}]})));
assert.throws(()=>api.validate(d({changes:[{path:'gdp',mode:'set',value:Infinity}]})));
assert.throws(()=>api.schedule(d({changes:[{path:'army',mode:'set',value:-1}]}),'order'));
assert.throws(()=>api.schedule(d({changes:[{path:'economy.classes.a.tax',mode:'set',value:150}]}),'order'));
assert.throws(()=>api.validate(d({changes:[{path:'income',mode:'set',value:1}]})));
const plot=d({cause:'assassination',reason:'An operative attempts an assassination',headline:'An operation begins',body:'Success is reported only after resolution.',days:10,cost:10,chance:.9,attempt:{kind:'assassination',target:'Russia',mechanism:'Agent infiltrates the palace',outcome:{changes:[],state:{ruler:'Successor'},headline:'Succession',body:'A new ruler succeeds Nicholas.'}}});
assert.throws(()=>api.validate({...plot,attempt:{...plot.attempt,outcome:{...plot.attempt.outcome,country:'France'}}},'order'),'No target override');
let verdict=api.schedule(plot,'order','plot-1');assert.equal(verdict.status,'in_progress');assert.equal(ctx.countries.Russia.ruler,'Nicholas');random=.99;ctx.advanceGameDays(10);assert.equal(ctx.countries.Russia.ruler,'Nicholas','Foreign operation can fail');assert.equal(ctx.worldState.freeWorld.tasks[0].status,'failed');
random=0;api.schedule(plot,'order','plot-2');ctx.advanceGameDays(10);assert.equal(ctx.countries.Russia.ruler,'Successor');assert.equal(ctx.worldState.freeWorld.tasks[1].status,'executed');
api.schedule(d({changes:[{path:'gdp',mode:'add',value:500}],days:3}),'order');assert.equal(ctx.countries.France.gdp,2000);ctx.advanceGameDays(3);assert.equal(ctx.countries.France.gdp,2500,'Effects become real after elapsed time');
await ctx.generateOrderPlan();assert.ok(queries[0].includes('не за физическую причинность'));assert.ok(queries[0].length<100000,'Context fits the shared text route');
ctx.worldState.orders=[{id:'order',text:'Make Russia poor',status:'prepared'}];ctx.askGemini=async()=>JSON.stringify({orders:[{id:'order',status:'execute',reason:'Because I say so',development:d({country:'Russia',changes:[{path:'treasury',mode:'set',value:0}]})}],events:[]});
const plan=await ctx.generateOrderPlan();assert.equal(plan.orders[0].status,'defer','Model cannot launder player decree into foreign state');
console.log('Free world: uncapped shocks, accounting, atomicity, foreign sovereignty, timed risky attempts, prompt and validation passed. No paid calls.');
