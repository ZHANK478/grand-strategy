/* Economy experiment: all money in million reference units, people in thousands.
   Daily accounting; no network. Historical seeds are estimates, not measured statistics. */
'use strict';
const ECON_GROUPS={noble:'Землевладельцы',burgher:'Предприниматели и финансисты',commons:'Наёмные рабочие',peasants:'Крестьяне',middle:'Мелкие собственники и специалисты'};
const econClamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const econRound=v=>Math.round(v*1000)/1000;
function econV3(c){
 if(!c.gdp||!c.population)econInitCountry(c,c.displayName);
 if(!c.society){initSociety(c);const seed=c.societySeed||(year===1852&&typeof SOCIETY_SEEDS!=='undefined'?SOCIETY_SEEDS[c.displayName]:null);if(seed)Object.assign(c.society,seed,{spending:{...c.society.spending,...(seed.spending||{})}});}
 if(c.econV3)return c.econV3;
 const urban=econClamp(c.society.urbanization,5,85),old=c.economy.classes;
 const shares={noble:2,burgher:3,middle:Math.min(25,urban*.3),commons:Math.max(4,urban*.65),peasants:0};shares.peasants=100-Object.values(shares).reduce((a,b)=>a+b,0);
 const wageWeights={noble:6,burgher:8,middle:2,commons:1.1,peasants:.7},sum=Object.entries(shares).reduce((s,[k,v])=>s+v*wageWeights[k],0);
 const custom=c.economySeed?.groups;if(custom){for(const key of Object.keys(shares))if(Number.isFinite(custom[key]?.share)&&custom[key].share>=0)shares[key]=custom[key].share;const total=Object.values(shares).reduce((s,x)=>s+x,0);if(total>0)for(const key of Object.keys(shares))shares[key]=shares[key]/total*100;}
 const cls={};Object.entries(shares).forEach(([k,share])=>{const src=old[k]||old.commons;cls[k]={label:custom?.[k]?.label||ECON_GROUPS[k],share,incomeShare:share*wageWeights[k]/Object.entries(shares).reduce((s,[key,n])=>s+n*wageWeights[key],0),tax:src.tax,loyalty:src.loyalty,wealth:0};});
 c.economy.classes=cls;
 const sectors={agriculture:c.sectors.agriculture,industry:c.sectors.industry,resources:c.sectors.resources,services:c.sectors.services+c.sectors.finance};
 const sectorSum=Object.values(sectors).reduce((a,b)=>a+b,0);
 c.econV3={version:3,prices:1,capital:c.gdp*2,collection:econClamp(.55+(c.society.literacy||30)/300+c.infrastructure/500,.45,.95),
  capacity:econClamp((c.society.literacy||30)*.55+c.infrastructure*.45,10,95),
  births:year<1900?32:year<1950?25:16,deaths:year<1900?23:year<1950?16:9,migration:0,
  workforceShare:year<1900?.43:.48,unemployment:5,arrears:0,paidRatio:1,creditUsed:0,
  policy:{coordination:'market',tariff:8,automaticBorrowing:false,monetaryFinancing:false},
  sectors:Object.fromEntries(Object.entries(sectors).map(([k,v])=>[k,{output:c.gdp*v/sectorSum,stateShare:k==='resources'?.25:.05,capital:c.gdp*2*v/sectorSum}])),
  programs:[],history:[],drivers:{},monthly:{gross:0,expense:0,net:0,borrowed:0,printed:0,unpaid:0}};
 c.currency='млн р.е.';c.debtDomestic=c.debtDomestic||0;c.debtForeign=c.debtForeign||0;c.debt=c.debtDomestic+c.debtForeign;
 econMonthlyRevenue(c);return c.econV3;
}
econMonthlyRevenue=function(c){
 const v=c.econV3||econV3(c),monthly=c.gdp*v.prices/12,perClass={};let taxes=0;
 Object.entries(c.economy.classes).forEach(([k,g])=>{
  g.wealth=monthly*g.incomeShare;g.population=c.population*1000*g.share/100;
  const evasion=econClamp(1-Math.max(0,g.tax-35)/130,.45,1);
  const t=g.wealth*g.tax/100*v.collection*evasion;perClass[k]=t;taxes+=t;
  g.monthlyIncome=g.wealth;g.taxPaid=t;g.disposable=Math.max(0,g.wealth-t);
  g.annualPerPerson=g.disposable*12e6/Math.max(1,g.population);
 });
 const imports=monthly*.12,tariffs=imports*v.policy.tariff/100*v.collection;
 const resources=Object.values(v.sectors).reduce((s,x)=>s+x.output*v.prices/12*x.stateShare*.12,0);
 return {gross:taxes+tariffs+resources,taxes,perClass,tariffs,resources};
};
function econEducation(c){
 const v=econV3(c),girls=({none:.2,partial:.65,equal:1})[c.lawSlots?.women]??Math.max(.2,Math.min(1,(c.society.womensRights||0)/100));
 const provision=({church:.75,partial:.9,universal:1})[c.lawSlots?.education]??.9;
 const access=(.5+.5*girls)*provision;
 const perChild=c.society.spending.education*12*v.paidRatio*1e6/Math.max(1,c.population*1000*.28)/v.prices;
 return {girlsAccess:girls,access,perChild,annualLiteracyGain:Math.min(4,Math.sqrt(Math.max(0,perChild)/25)*2)*(100-c.society.literacy)/100*(.6+.4*access)};
}
function econDemography(c){const v=econV3(c),deaths=v.deaths+(econWar(c)?4:0)+Math.max(0,c.society.poverty-65)*.08+(v.paidRatio<.8?2:0);return {births:v.births,deaths,migration:v.migration,annualRate:(v.births-deaths+v.migration)/1000};}
function econWar(c){return typeof isAtWar==='function'&&ALL_COUNTRIES.some(n=>countries[n]!==c&&!countries[n].annexed&&isAtWar(c.displayName,n));}
function econBudget(c){
 const v=econV3(c),r=econMonthlyRevenue(c),war=econWar(c),sp=c.society.spending;
 const upkeep=c.army*getEra().armyUpkeep*(war?1.5:1)*(1+v.prices)/2;
 const admin=c.population*.0018*v.prices*(1+(100-v.capacity)/150);
 const court=c.population*.0004*v.prices,church=c.church?.exists?c.population*.0002*v.prices:0;
 const risk=econClamp((65-c.stability)/2000+c.debt/Math.max(1,c.gdp)*.015,0,.12);
 const interest=c.debtDomestic*(.045+risk)/12+c.debtForeign*(.065+risk)/12;
 const expense=upkeep+admin+court+church+interest+Object.values(sp).reduce((s,x)=>s+Number(x||0),0)+v.programs.filter(p=>p.status==='active').reduce((s,p)=>s+(p.monthlyCost||0),0);
 return {gross:r.gross,net:r.gross-expense,expense,upkeep,interest,annualRateDomestic:(.045+risk)*100,
  lines:{income:[...Object.entries(r.perClass).map(([k,value])=>({name:'Налог: '+c.economy.classes[k].label,value})),{name:'Пошлины',value:r.tariffs},{name:'Прибыль госпредприятий',value:r.resources}],
  expense:[{name:'Армия и снабжение',value:upkeep},{name:'Государственный аппарат',value:admin},{name:'Содержание руководства',value:court},{name:'Содержание церкви',value:church},
  ...Object.entries(sp).map(([k,value])=>({name:({education:'Образование',welfare:'Помощь населению',infrastructure:'Инфраструктура'})[k]||k,value})),
  {name:'Проценты по долгу',value:interest},{name:'Экономические программы',value:expense-upkeep-admin-court-church-interest-Object.values(sp).reduce((s,x)=>s+Number(x||0),0)}]}};
}
function econStep(c,days=1){
 const v=econV3(c);for(let d=0;d<days;d++){
  const dt=1/365.2425,war=econWar(c),oldPop=c.population,oldGDP=c.gdp;
  v.programs.filter(p=>p.status==='active').forEach(p=>{
   const progress=Math.min(1,(p.elapsed+1)/p.days);p.elapsed++;
   if(p.kind==='tax')c.economy.classes[p.group].tax=p.start+(p.target-p.start)*progress;
   if(p.kind==='spending')c.society.spending[p.group]=p.start+(p.target-p.start)*progress;
   if(p.kind==='ownership')v.sectors[p.sector].stateShare=p.start+(p.target-p.start)*progress;
   if(p.kind==='coordination'&&progress===1)v.policy.coordination=p.target;
   if(progress===1)p.status='completed';
  });
  const b=econBudget(c),flow=b.net*12*dt;
  let borrowed=0,printed=0,unpaid=0;c.treasury+=flow;
  if(c.treasury<0){
   let need=-c.treasury;c.treasury=0;
   if(v.policy.automaticBorrowing){const cap=Math.max(0,b.gross*12*2.5-c.debt);borrowed=Math.min(need,cap);c.debtDomestic+=borrowed;c.debt+=borrowed;need-=borrowed;}
   if(need&&v.policy.monetaryFinancing){printed=need;need=0;}
   unpaid=need;v.arrears+=unpaid;
  }
  if(c.treasury>0&&v.arrears>0){const paid=Math.min(c.treasury,v.arrears);v.arrears-=paid;c.treasury-=paid;}
  const expected=b.expense*12*dt;v.paidRatio=expected?econClamp(1-unpaid/expected,0,1):1;
  const welfare=c.society.spending.welfare*12*v.paidRatio;
  const poor=c.economy.classes.peasants.share+c.economy.classes.commons.share;
  for(const [k,g]of Object.entries(c.economy.classes)){
   const transfer=['peasants','commons'].includes(k)?welfare/12*g.share/Math.max(1,poor):0;
   const tradeOwner=ALL_COUNTRIES.find(id=>countries[id]===c),tradePrices=typeof maritimeTrade==='function'?(maritimeTrade().result[tradeOwner]?.markup||0):0;
   const real=(g.disposable+transfer)*12e6/Math.max(1,g.population)/v.prices/(1+tradePrices*.12);
   const change=g.realIncome?econClamp((real/g.realIncome-1)*30,-3,3):0;
   g.loyalty=econClamp(g.loyalty+change/30-(unpaid>0?.04:0)-(war?.006:0),0,100);g.realIncome=real;
  }
  const workforce=c.population*1000*v.workforceShare;
  const mobilization=econClamp((c.army+(typeof maritimeCrew==='function'?maritimeCrew(ALL_COUNTRIES.find(id=>countries[id]===c)):0))/Math.max(1,workforce),0,.4);
  const invest=c.society.spending.infrastructure*12*v.paidRatio/Math.max(1,c.gdp*v.prices);
  const avgTax=Object.values(c.economy.classes).reduce((s,g)=>s+g.tax*g.incomeShare,0);
  const privateInvest=econClamp(.11-avgTax*.001+(c.stability-50)*.0005,.015,.18);
  v.births=econClamp(v.births+(year>=1950?-0.05:-0.01)*dt,8,45);
  const deaths=v.deaths+(war?4:0)+Math.max(0,c.society.poverty-65)*.08+(v.paidRatio<.8?2:0);
  v.migration=econClamp((c.stability-55)*.04-(war?2:0)-(v.paidRatio<.8?1:0),-8,5);
  const popRate=(v.births-deaths+v.migration)/1000;
  c.population=Math.max(.001,c.population*(1+popRate*dt));
  const actualLaborGrowth=(c.population-oldPop)/oldPop/dt;
  const coordination=v.policy.coordination==='planned'?(v.capacity-60)*.012:v.policy.coordination==='regulated'?.08:0;
  v.capacity=econClamp(c.society.literacy*.55+c.infrastructure*.45,10,95);
  v.collection=econClamp(.55+c.society.literacy/300+c.infrastructure/500-(1-v.paidRatio)*.1,.35,.95);
  v.unemployment=econClamp(v.unemployment+((c.stability<40?.5:0)+(war?.5:0)-(privateInvest+invest)*2)*dt,1,35);
  const sectorCapital=Object.values(v.sectors).reduce((s,x)=>s+x.capital,0);
  v.drivers={capital:(sectorCapital/Math.max(1,c.gdp)-2)*.25,employment:-(v.unemployment-5)*.08,productivity:.5+c.society.literacy*.012,investment:(privateInvest+invest-.1)*12,
   labor:actualLaborGrowth*100*.35,infrastructure:(c.infrastructure-35)*.015,
   disruption:-(100-c.stability)*.015-(war?4:0)-mobilization*12-(1-v.paidRatio)*4,coordination};
  if(typeof maritimeTrade==='function'){const owner=ALL_COUNTRIES.find(id=>countries[id]===c),trade=maritimeTrade().result[owner];if(trade)v.drivers.trade=seaClamp(trade.exports/Math.max(1,c.gdp*v.prices/12),0,.3)*2-trade.shortage*1.5;}
  const growth=econClamp(Object.values(v.drivers).reduce((s,x)=>s+x,0),-20,10);
  c.gdpGrowth=econRound(growth);c.gdp=Math.max(.001,c.gdp*(1+growth/100*dt));
  const GDPfactor=c.gdp/oldGDP;
  Object.values(v.sectors).forEach(s=>{s.output*=GDPfactor;s.capital=Math.max(0,s.capital+(s.output*(privateInvest+invest)-s.capital*.04)*dt);});
  v.capital=Object.values(v.sectors).reduce((s,x)=>s+x.capital,0);
  c.infrastructure=econClamp(c.infrastructure+(invest*70*v.paidRatio-.4)*dt,0,100);
  const education=econEducation(c);
  c.society.literacy=econClamp(c.society.literacy+education.annualLiteracyGain*dt,0,100);
  v.deaths=econClamp(v.deaths-(c.society.spending.welfare*12*v.paidRatio/Math.max(1,c.gdp*v.prices)*2)*dt,5,40);
  const shift=Math.min(c.economy.classes.peasants.share,Math.max(0,privateInvest+invest-.05)*dt*2);
  c.economy.classes.peasants.share-=shift;c.economy.classes.commons.share+=shift*.7;c.economy.classes.middle.share+=shift*.3;
  c.society.urbanization=econClamp(100-c.economy.classes.peasants.share,0,100);
  c.society.poverty=econClamp(c.society.poverty+((1-v.paidRatio)*4-growth*.12-welfare/Math.max(1,c.gdp*v.prices)*25)*dt,0,100);
  const monetary=printed/Math.max(1,c.gdp*dt)*100;
  const ownerForTrade=ALL_COUNTRIES.find(id=>countries[id]===c),trade=typeof maritimeTrade==='function'?maritimeTrade().result[ownerForTrade]:null;
  const target=econClamp(1+(trade?trade.shortage*5+trade.markup*2:0)+monetary+(war?4:0)+mobilization*8+(1-v.paidRatio)*3,-2,150);
  c.inflation=(Number(c.inflation)||0)+(target-(Number(c.inflation)||0))*dt*2;v.prices*=Math.exp(c.inflation/100*dt);
  const pressure=(v.arrears/Math.max(1,b.gross*12))*8;
  c.stability=econClamp(c.stability-pressure*dt,0,100);
  v.monthly.gross+=b.gross*12*dt;v.monthly.expense+=expected;v.monthly.net+=flow;
  v.monthly.borrowed+=borrowed;v.monthly.printed+=printed;v.monthly.unpaid+=unpaid;
  if(typeof scenarioProvinces!=='undefined'){
   const ownerId=ALL_COUNTRIES.find(id=>countries[id]===c);
   const own=ownerId?scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===ownerId):[],total=own.reduce((s,p)=>s+(provinceEcon[p.id]?.gdp||0),0),pop=own.reduce((s,p)=>s+(provinceEcon[p.id]?.pop||0),0);
   own.forEach(p=>{const e=provinceEcon[p.id];if(e){e.gdp=total?e.gdp/total*c.gdp:c.gdp/own.length;e.pop=pop?e.pop/pop*c.population:c.population/own.length;e.income=e.gdp/12*.125;}});
  }
  c.income=econMonthlyRevenue(c).gross;
 }return c;
}
function econPolicy(c,p){
 const v=econV3(c);econValidatePolicy(p,c);
 if(p.type==='financing'){if(p.automaticBorrowing!=null)v.policy.automaticBorrowing=p.automaticBorrowing;if(p.monetaryFinancing!=null)v.policy.monetaryFinancing=p.monetaryFinancing;return;}
 if(p.type==='tariff'){v.policy.tariff=p.target;return;}
 const kind=p.type,days=p.days||180;
 const start=kind==='ownership'?v.sectors[p.sector].stateShare:kind==='tax'?c.economy.classes[p.group].tax:kind==='spending'?c.society.spending[p.group]:v.policy.coordination;
 const cost=kind==='ownership'&&p.target>start&&p.compensation?v.sectors[p.sector].capital*v.prices*(p.target-start):0;
 if(cost>c.treasury)throw Error('Для компенсации владельцам не хватает казны: '+Math.round(cost)+' млн р.е. Можно предусмотреть заём или передачу без компенсации.');
 c.treasury-=cost;
 if(kind==='ownership'&&p.target>start)c.economy.classes.burgher.loyalty=econClamp(c.economy.classes.burgher.loyalty-(p.compensation?3:15),0,100);
 v.programs=v.programs.filter(x=>!(x.status==='active'&&x.kind===kind&&x.group===p.group&&x.sector===p.sector));
 v.programs.push({id:crypto.randomUUID(),kind,start,target:p.target,sector:p.sector,group:p.group,days,elapsed:0,status:'active',cost,monthlyCost:kind==='ownership'?v.sectors[p.sector].output/12*.005:0});
}
function econValidatePolicy(p,c){
 const allowed=['type','target','sector','group','days','compensation','automaticBorrowing','monetaryFinancing'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))throw Error('Неверная структура экономической политики');
 if(!['ownership','coordination','tax','spending','tariff','financing'].includes(p.type))throw Error('Неизвестное направление политики');
 if(p.days!=null&&(!Number.isInteger(p.days)||p.days<1||p.days>3650))throw Error('Срок должен быть от 1 до 3650 дней');
 if(p.type==='coordination'&&!['market','regulated','planned'].includes(p.target))throw Error('Неизвестный способ координации');
 if(p.type==='ownership'&&(!['agriculture','industry','resources','services'].includes(p.sector)||typeof p.compensation!=='boolean'))throw Error('Укажите отрасль и условия компенсации');
 if(p.type==='tax'&&!Object.hasOwn(ECON_GROUPS,p.group))throw Error('Неизвестная группа');
 if(p.type==='spending'&&!['education','welfare','infrastructure'].includes(p.group))throw Error('Неизвестная статья расходов');
 if(['ownership','tax','spending','tariff'].includes(p.type)&&(!Number.isFinite(p.target)||p.target<0||p.target>(p.type==='ownership'?1:p.type==='spending'?c.gdp/12:100)))throw Error('Некорректная целевая величина');
 for(const k of ['automaticBorrowing','monetaryFinancing'])if(p[k]!=null&&typeof p[k]!=='boolean')throw Error('Неверный режим финансирования');
}
econGrowProvinces=function(){};
econSimulateCountry=function(c){econV3(c);return econBudget(c);};
tickSociety=function(){};
tickClasses=function(){};
simulateWorldEconomy=function(){
 const changes=[];ALL_COUNTRIES.forEach(id=>{const c=countries[id];if(!c||c.annexed)return;const v=econV3(c),b=econBudget(c);
 c.lastBudget={...b,...v.monthly,net:v.monthly.net,lines:b.lines};v.history.push({date:dateLabel(),gdp:c.gdp,population:c.population,treasury:c.treasury,...v.monthly});v.history=v.history.slice(-24);
 if(id===playerCountry)changes.push({label:'Бюджет периода',value:econRound(v.monthly.net)+' млн р.е.',sign:v.monthly.net});
 v.monthly={gross:0,expense:0,net:0,borrowed:0,printed:0,unpaid:0};
 });return changes;
};
orderBudgetPreview=function(){return countries[playerCountry]?econBudget(countries[playerCountry]):null;};
const economyOldAdvance=advanceGameDays;
advanceGameDays=function(count){const all={econ:[],deaths:[],months:0};for(let i=0;i<count;i++){ALL_COUNTRIES.forEach(id=>{const c=countries[id];if(c&&!c.annexed)econStep(c,1);});const r=economyOldAdvance(1);if(r.econ.length)all.econ=r.econ;all.deaths.push(...r.deaths);all.months+=r.months;}return all;};
const economyOldInitProvinces=econInitProvinces;
econInitProvinces=function(){economyOldInitProvinces();ALL_COUNTRIES.forEach(id=>{if(countries[id]&&!countries[id].annexed)econV3(countries[id]);});};
setSocialSpending=function(country,kind,value){const c=countries[country];if(c&&c.society&&Object.hasOwn(c.society.spending,kind))c.society.spending[kind]=econClamp(value,0,c.gdp/12);};
const economyOldExecute=executeOrderEffects;
executeOrderEffects=function(e){const copy=JSON.parse(JSON.stringify(e));if(copy.economic_policy){econPolicy(countries[playerCountry],copy.economic_policy);delete copy.economic_policy;}
 if(copy.economy){econV3(countries[playerCountry]);for(const [k,v]of Object.entries(copy.economy)){const key=k.replace('tax_','');if(countries[playerCountry].economy.classes[key])countries[playerCountry].economy.classes[key].tax=v;}delete copy.economy;}
 return economyOldExecute(copy);
};
const economyOldForeign=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,e){if(kind==='economic'){const ctx=orderContext();ctx.player=owner;OrderRules.validateEffects(e,ctx,'order',kind);const verdict=OrderRules.authority({kind,status:'execute',effects:e,reason:'Экономическая программа'},countries[owner]);if(verdict.status!=='executed')return verdict;econPolicy(countries[owner],e.economic_policy);return {status:'executed',reason:'Экономическая программа начата; последствия рассчитывает движок'};}return economyOldForeign(owner,kind,e);};
const economyOldLaw=setLawSlot;
setLawSlot=function(country,slot,id){const c=countries[country];if(slot==='property'&&['state','private'].includes(id)){
 const v=econV3(c);Object.keys(v.sectors).forEach(sector=>econPolicy(c,{type:'ownership',sector,target:id==='state'?1:0,compensation:false,days:365}));c.lawSlots.property=id;return true;
 }return economyOldLaw(country,slot,id);};
const economyOldFacts=countryPoliticalFacts;
countryPoliticalFacts=function(id){const c=countries[id],facts=economyOldFacts(id);if(!c)return facts;const v=econV3(c),b=econBudget(c);
 return {...facts,economics:{units:'GDP annual million reference units; budget monthly million; population thousands',perCapita:c.gdp*1000/c.population,growth:c.gdpGrowth,
 deficit:b.net,expenses:b.expense,arrears:v.arrears,prices:v.prices,collection:v.collection,policy:v.policy,
 groups:Object.fromEntries(Object.entries(c.economy.classes).map(([k,g])=>[k,{population:Math.round(g.population),tax:g.tax,income:g.realIncome,loyalty:g.loyalty}])),
 sectors:v.sectors,programs:v.programs.filter(p=>p.status==='active').map(p=>({kind:p.kind,target:p.target,sector:p.sector,group:p.group,daysLeft:p.days-p.elapsed}))}};
};
econDescribeMacro=function(c){econV3(c);const b=econBudget(c);return 'ЭКОНОМИКА: '+JSON.stringify({gdpAnnual:c.gdp,populationThousands:c.population,gdpPerCapita:c.gdp*1000/c.population,budgetMonthly:b.gross,expensesMonthly:b.expense,balanceMonthly:b.net,treasury:c.treasury,debt:c.debt,inflationAnnual:c.inflation,arrears:c.econV3.arrears,policy:c.econV3.policy})+'. Деньги: млн расчётных единиц. ИИ не меняет ВВП, население или инфляцию напрямую.';};

const economyOldContext=orderContext;
orderContext=function(){return {...economyOldContext(),validateEconomicPolicy:econValidatePolicy};};
const economyOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:'))prompt+='\nНОВАЯ ЭКОНОМИКА. tax поддерживает tax_noble (землевладельцы), tax_burgher (предприниматели), tax_commons (рабочие), tax_peasants, tax_middle. spending допустим до ВВП/12 за месяц, не до доли дохода. Для постепенных реформ и экономической системы используй kind:"economic", effects:{economic_policy:{type:"ownership|coordination|tax|spending|tariff|financing",...}}. ownership: sector:"agriculture|industry|resources|services", target:доля государства 0..1, compensation:true|false, days:1..3650; coordination:target:"market|regulated|planned",days; tax:group:"noble|burgher|commons|peasants|middle",target:0..100,days; spending:group:"education|welfare|infrastructure",target:месячная сумма,days; tariff:target:0..100; financing:automaticBorrowing:true|false,monetaryFinancing:true|false. Неизвестную отрасль соотнеси с крупной отраслью; не отказывай из-за отсутствия подробного товара. Собственность и планирование независимы. Относительный налог вычисли из текущей ставки. Экономические последствия и сроки считает движок; сообщай о рисках, не выдумывай ВВП или деньги.';
 return economyOldAsk(prompt,...args);
};

const economyOldDescription=executedOrderDescription;
executedOrderDescription=function(e){return e.economic_policy?'Экономическая политика зарегистрирована. Программа, сроки и реальные расходы видны в разделе «Производство».':economyOldDescription(e);};
const economyOldApply=applyOrderPlan;
applyOrderPlan=function(plan){
 const results=economyOldApply(plan);
 plan.orders.forEach(proposal=>{const p=proposal.effects?.economic_policy,order=worldState.orders.find(o=>o.id===proposal.id);if(!p||!order||order.status!=='executed')return;
 const program=countries[playerCountry].econV3?.programs.findLast(x=>x.status==='active'&&x.kind===p.type&&x.group===p.group&&x.sector===p.sector&&x.target===p.target);
 if(program){program.orderId=order.id;order.status='in_progress';order.reason='Программа начата: '+program.days+' дней. Изменения происходят постепенно.';const receipt=results.find(r=>r.id===order.id);if(receipt){receipt.status=order.status;receipt.reason=order.reason;}}
 });return results;
};
const economyOldTickProcesses=tickExecutiveProcesses;
tickExecutiveProcesses=function(){
 for(const p of ensureExecutiveProcesses().filter(x=>x.status==='active'&&x.mode==='recruitment')){
  const c=countries[p.country];if(!c||c.annexed)continue;
  if(p.totalRecruit==null){p.totalRecruit=p.reservedTroops;p.delivered=0;}
  const fraction=econClamp((gameDayNumber()-p.start)/Math.max(1,p.due-p.start),0,1);
  const intended=Math.floor(p.totalRecruit*fraction)-p.delivered;
  const n=Math.max(0,Math.min(intended,Math.round(c.population*1000*getEra().armyMaxShare)-c.army));
  if(n){changeCountryStat(p.country,'army',n);p.delivered+=n;p.reservedTroops-=n;}
 }
 for(const id of ALL_COUNTRIES){const c=countries[id];if(!c?.econV3)continue;
  for(const p of c.econV3.programs){if(p.status==='completed'&&p.orderId&&!p.announced){
   p.announced=true;const order=worldState.orders.find(o=>o.id===p.orderId);if(order){order.status='executed';order.reason='Экономическая программа завершена за '+p.days+' дней.';}
   recordWorldEvent(id===playerCountry?'domestic':'foreign','Завершена экономическая программа','Правительство завершило предусмотренное программой изменение политики. Теперь страна живёт с новыми условиями; экономические последствия продолжают развиваться.',[id],'Программа '+p.kind+', целевое значение '+p.target+'.');
  }}
 }
 return economyOldTickProcesses();
};

const economyOldRecompute=econRecompute;
econRecompute=function(){
 economyOldRecompute();
 ALL_COUNTRIES.forEach(id=>{const c=countries[id];if(!c||c.annexed)return;const owned=scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===id);
 if(owned.length){c.gdp=owned.reduce((s,p)=>s+(provinceEcon[p.id]?.gdp||0),0);c.population=owned.reduce((s,p)=>s+(provinceEcon[p.id]?.pop||0),0);}
 if(c.econV3){const total=Object.values(c.econV3.sectors).reduce((s,x)=>s+x.output,0);if(total>0)Object.values(c.econV3.sectors).forEach(s=>s.output*=c.gdp/total);}
 c.income=econMonthlyRevenue(c).gross;
 });
};
if(typeof LAW_OPTIONS!=='undefined'){const o=LAW_OPTIONS.property.find(x=>x.id==='state');if(o)o.label='Государственная собственность';}
