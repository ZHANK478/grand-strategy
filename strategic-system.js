/* Authoritative governance and strategic operations. All changes are persisted in worldState/countries. */
'use strict';
function strategyState(){
 worldState.mapObjects||=[];
 if(!worldState.strategy){
  const s=worldState.strategy={occupations:{},routes:[],campaigns:[],contracts:[],offers:[],claims:[],events:[],version:1};
  for(const t of worldState.treaties||[])s.contracts.push({id:crypto.randomUUID(),a:t.a,b:t.b,type:t.type,terms:{militaryAid:t.type==='alliance'},status:'active',since:gameDayNumber(),due:gameDayNumber()+3650});
  for(const o of worldState.politics?.offers||[])if(o.status==='open')s.offers.push({...o,terms:{militaryAid:o.type==='alliance'},expires:gameDayNumber()+90});
  for(const g of Object.values(worldState.warGoals||{}))if(g&&isAtWar(g.attacker,g.defender))s.campaigns.push({id:crypto.randomUUID(),a:g.attacker,b:g.defender,goal:g,status:'active',start:gameDayNumber()});
 }
 const s=worldState.strategy;for(const k of ['routes','campaigns','contracts','offers','claims','events'])s[k]||=[];s.occupations||={};return s;
}
class StrategyActionError extends Error{}
function strategyAssert(v,m){if(!v)throw new StrategyActionError(m);}
function strategyText(s,max=180){strategyAssert(typeof s==='string'&&s.trim()&&s.length<=max&&!OrderRules.INVALID_FICTION.test(s),'Некорректный текст');}
function strategyKeys(x,ks){strategyAssert(x&&typeof x==='object'&&!Array.isArray(x),'Ожидался объект');Object.keys(x).forEach(k=>strategyAssert(ks.includes(k),'Неизвестное поле '+k));}
function strategyNum(x,a,b){strategyAssert(Number.isFinite(x)&&x>=a&&x<=b,'Число вне допустимых границ');}
function strategyCountry(n){strategyAssert(countries[n]&&!countries[n].annexed,'Нет действующей страны: '+n);}
function strategyEvent(a,h,b,targets=[]){politicalEvent(a,h,b,'Подтверждено движком',targets);worldState.pastEvents.push(h+': '+b);}
const strategyOldLeader=setCountryLeader;
setCountryLeader=function(owner,fields){
 strategyOldLeader(owner,fields);
 const c=countries[owner];
 const registry=worldState.actors||{};
 for(const a of Object.values(registry)){if(a.country===owner&&a.kind==='government'){a.label=c.ruler+' · '+c.rulerTitle;actorRemember(a,'Действующая власть: '+c.ruler+' ('+c.rulerTitle+'), '+c.government+'. Кабинет: '+c.pm+' ('+c.pmTitle+').');}}
 if(owner===playerCountry){renderPlayerPowerPanel();renderPlayerStats();}
 if(owner===playerCountry&&typeof updateCountryInfoPanel==='function')updateCountryInfoPanel(owner);
 if(typeof window.mobileRefreshCountry==='function')window.mobileRefreshCountry();
};
function strategyGovernanceNews(owner,e){
 const c=countries[owner],parts=[];
 if(e.ruler_name||e.ruler_title)parts.push('Высшую власть теперь осуществляет '+c.ruler+' в должности «'+c.rulerTitle+'».');
 if(e.pm_name||e.pm_title)parts.push(c.pm&&c.pm!=='—'?'Кабинет возглавляет '+c.pm+'; его должность — «'+c.pmTitle+'».':'Должность главы правительства называется «'+c.pmTitle+'»; отдельный руководитель кабинета пока не назначен.');
 if(e.government)parts.push('Действующее государственное устройство — '+c.government+'.');
 if(e.country_name)parts.push('Официальное название государства — '+c.displayName+'.');
 return parts.join(' ');
}
function applyGovernance(owner,e){
 const c=countries[owner],fields={},mapping={ruler_name:'ruler',ruler_title:'rulerTitle',ruler_age:'rulerAge',pm_name:'pm',pm_title:'pmTitle',government:'government'};
 for(const [k,f]of Object.entries(mapping))if(Object.hasOwn(e,k))fields[f]=e[k];
 if(Object.keys(fields).length)setCountryLeader(owner,fields);
 c.governance||={};if(e.ruler_name||e.ruler_title)c.governance.interim=/временн|регент|исполняющ/i.test(c.rulerTitle||'');
 if(e.country_name)renameCountry(owner,e.country_name);
 return 'Глава государства: '+c.ruler+' ('+c.rulerTitle+'). Глава правительства: '+c.pm+' ('+c.pmTitle+'). Государство: '+(c.displayName||owner)+'. Устройство: '+c.government+'.';
}
const strategyOldContext=orderContext;
orderContext=function(){return {...strategyOldContext(),validateMilitaryOrder,validateDiplomaticAction};};
const strategyOldApplyCountry=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,e){
 if(kind==='military'||e.diplomatic_action){
  const ctx=orderContext();ctx.player=owner;const checked=OrderRules.validateEffects(JSON.parse(JSON.stringify(e)),ctx,'order',kind);
  const result=kind==='military'?executeMilitaryOrder(owner,checked.military_order):executeDiplomaticAction(owner,checked.diplomatic_action);
  return {status:'executed',reason:result};
 }
 let result;try{result=strategyOldApplyCountry(owner,kind,e);}catch(error){if(error instanceof StrategyActionError)return {status:'blocked',reason:error.message};throw error;}
 if(result.status==='executed'&&(kind==='power'||kind==='identity'))result.reason=applyGovernance(owner,e);
 return result;
};
const strategyOldExecute=executeOrderEffects;
executeOrderEffects=function(e){
 const copy=JSON.parse(JSON.stringify(e));
 try{
 for(const item of copy.map_objects||[]){const u=worldState.mapObjects.find(u=>u.id===item.id);if(item.action==='move'&&u?.type==='army'){const p=strategyLocationProvince(item.to);strategyAssert(p&&strategyPath(u.owner,strategyUnitProvince(u),p.id),'Нет доступного сухопутного маршрута');}if(item.action==='create'&&item.type==='army'){const p=strategyLocationProvince(item.location);strategyAssert(p&&strategyControl(p)===item.owner,'Армия развёртывается на контролируемой территории');}}
 
 if(copy.diplomatic_action){executeDiplomaticAction(playerCountry,copy.diplomatic_action);delete copy.diplomatic_action;}
 if(copy.military_order){executeMilitaryOrder(playerCountry,copy.military_order);delete copy.military_order;}
 }catch(error){if(error instanceof StrategyActionError)return {status:'blocked',reason:error.message};throw error;}
 // Apply governance through one setter. Never let prose be the source of authority.
 const state={};for(const k of ['ruler_name','ruler_title','ruler_age','pm_name','pm_title','government','country_name','transition']){if(Object.hasOwn(copy,k)){state[k]=copy[k];delete copy[k];}}
 if(Object.keys(state).length)applyGovernance(playerCountry,state);
 const armies=Object.fromEntries(ALL_COUNTRIES.map(n=>[n,countries[n].army]));
 try{return strategyOldExecute(copy);}catch(error){if(error instanceof StrategyActionError){for(const [n,army]of Object.entries(armies))countries[n].army=army;renderPlayerStats();return {status:'blocked',reason:error.message};}throw error;}
};
const strategyOldFinish=finishPoliticalTask;
finishPoliticalTask=function(t){
 const start=worldState.periodEvents?.length||0;strategyOldFinish(t);
 if(t.status==='executed'&&t.effects&&(t.kind==='power'||t.kind==='identity')){
  const text=applyGovernance(t.country,t.effects),prose=strategyGovernanceNews(t.country,t.effects);
  worldState.periodEvents.slice(start).forEach(e=>{if(e.sourceTask===t.id){e.body=(e.body||'')+' '+prose;e.details=(e.details||'')+'\n'+text;}});
 }
};
const strategyOldPlanApply=applyOrderPlan;
applyOrderPlan=function(plan){
 const results=strategyOldPlanApply(plan);
 for(const o of results){
  const e=o.effects||{};
  if(o.status==='executed'&&['ruler_name','ruler_title','pm_name','pm_title','government','country_name'].some(k=>Object.hasOwn(e,k))){
   const fact=applyGovernance(playerCountry,e);
   o.reason=fact;
   worldState.periodEvents.filter(x=>x.sourceOrder===o.id).forEach(x=>{x.body=(x.body||'')+' '+strategyGovernanceNews(playerCountry,e);x.details=(x.details||'')+'\n'+fact;o.newsBody=x.body;});
  }
 }
 return results;
};
const strategyOldFacts=politicalContext;
politicalContext=function(){const c=strategyOldFacts();const s=strategyState();c.strategy={units:(worldState.mapObjects||[]).filter(u=>u.type==='army').map(u=>({id:u.id,owner:u.owner,troops:u.troops,province:strategyUnitProvince(u),supply:u.supply??100,morale:u.morale??75,destination:s.routes.find(r=>r.unit===u.id)?.path.at(-1)})),occupations:s.occupations,campaigns:s.campaigns.filter(x=>x.status==='active'),contracts:s.contracts.filter(x=>x.status==='active'),offers:s.offers.filter(x=>x.status==='open'),routes:s.routes,claims:s.claims.slice(-8),militaryLocations:scenarioProvinces.map(p=>({id:p.id,name:p.name,owner:provinceOwners[p.id]||p.owner})).filter(p=>[playerCountry,...c.countries.map(x=>x.facts.id)].includes(p.owner)).sort((a,b)=>Number(b.owner===playerCountry)-Number(a.owner===playerCountry)).slice(0,120).map(p=>({...p,coordinates:strategyGeometry().centers[p.id],neighbors:[...strategyGeometry().graph[p.id]].map(id=>({id,owner:strategyOwner(strategyProvince(id))}))}))};return c;};
const strategyOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:'))prompt+='\nОБЯЗАТЕЛЬНОЕ СОСТОЯНИЕ. Отставка, отречение, назначение, новое название должности/страны и изменение устройства НЕЛЬЗЯ выполнять только статьёй или court_scene. Возвращай kind:power с effects:{transition:"resign|appoint|succession|reform",ruler_name,ruler_title,pm_name,pm_title,government,country_name}. При отставке выбери правдоподобного временного преемника без требования назвать его игроком; ОБЯЗАТЕЛЬНО укажи ruler_name и ruler_title. transition resign/succession не требует разрешения парламента на отставку. Меняй только запрошенные или необходимые для перехода поля. Наименования должностей и формы правления свободные, история не фиксирует исход. Если реформа встречает сопротивление, описывай реальный статус попытки, не уже случившуюся смену. Для самостоятельной внутренней смены власти используй решение government action:pursue с task.kind:power, task.effects:эти же поля, days:0 или реалистичный срок. Чужое правительство не назначает нашего главу своим утверждением. Газетная статья должна соответствовать effects; пока нет применения, не объявляй нового правителя как состоявшийся факт.\nСТРАТЕГИЯ. kind:military effects:{military_order:{action:"deploy|move|invade|hold|retreat",unit_id:"ID",troops:целое для deploy,province:"ID провинции",stance:"attack|defend"}}. Не передавай мгновенное map move для армии. deploy выделяет существующих солдат национальной армии. move/retreat создаёт маршрут, движение по дням и бой делает код. Чужая граница не означает отсутствие дороги: мирный проход требует разрешения. Если игрок прямо требует силового входа/вторжения без объявления войны, используй invade: код проверит физический путь и начнёт боевые действия без формальной декларации. Не отказывай вторжению лишь из-за отсутствия дипломатического доступа. Не проходи третьи нейтральные страны без разрешения. kind:diplomacy effects:{diplomatic_action:{action:"declare_war|offer|accept|reject|break|demand|integrate|release",target:"точный ID",offer_id:"при ответе",contract_id:"при demand/break/integrate/release",goal:{type:"territory|tribute|subjugation|defense",provinces:["ID"]},type:"alliance|nonaggression|peace|dependency",terms:{provinces:["ID уступаемых адресатом земель"],payer:"ID плательщика; по умолчанию адресат",payment:разовая сумма от плательщика другой стороне,tribute:доля месячного валового дохода 0..0.3,autonomy:0..1,militaryAid:boolean,offensive:boolean (помощь в наступательной войне; по умолчанию false),access:boolean,days:срок договора,subject:"ID зависимой страны"},obligation:"tribute|militaryAid",amount:число при demand}}}. Предложение требует согласия; не создавай чужое согласие. Для NPC используй action:pursue с task.kind:military/diplomacy и проверяемыми effects. Сформируй ответ на входящие strategy.offers. Цель войны выбирает инициатор; территории только по достигнутому договору. Нет автоматического мира или автоматических союзов.';
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:'))prompt+='\nНарратив court_scene используется ТОЛЬКО для личных событий; учреждение организации, административное распоряжение, назначение и договор НЕ исполняются как личная сцена. Сохраняй все части составного приказа: political_task может содержать численные effects плюс target/offer, но переговоры не исчезают после изменения налога. Нельзя писать о создании органа, если сохранена только беседа. Военное правительство должно предпринимать операции через military_order, а не только повторять мобилизацию. Каждый адресат входящего strategy.offers должен дать явный ответ accept/reject через diplomatic_action.offer_id или конкретное встречное предложение; простое negotiate не равно принятию. Независимое решение временного правительства о преемнике возможно через проверяемый power-эффект. Пиши имена персонажей целиком по-русски, без смешения латиницы и кириллицы. Кабинет нашей страны вправе предложить переход от временного главы к постоянному: action:pursue с task.kind:power и проверяемыми task.effects. При вакансии власти он исполняет назначение; при действующем главе сохраняется предложение игроку, а не незаметная смена власти.';
 return strategyOldAsk(prompt,...args);
};

const strategyOldDecision=executePoliticalDecision;
executePoliticalDecision=function(d,results){
 const a=ensureWorldActors()[d.actor_id],c=a&&countries[a.country];
 if(a?.kind==='cabinet'&&d.action==='pursue'&&d.task?.kind==='power'){
  if(a.lastPoliticalTurn===turn)return false;
  if(d.condition_order&&!results.some(o=>o.id===d.condition_order&&['executed','in_progress'].includes(o.status)))return false;
  if(d.condition_actor&&!worldState.currentNewsActors?.includes(d.condition_actor))return false;
  if(c.pendingSuccession||c.pendingCoup){const v=applyCountryPoliticalEffects(a.country,'power',d.task.effects);if(v.status!=='executed')return false;strategyEvent(a.country,'Назначен преемник',v.reason);}
  else{
   c.governance||={};c.governance.proposals||=[];
   const key=JSON.stringify(d.task.effects);
   if(c.governance.proposals.some(p=>p.status==='open'&&JSON.stringify(p.effects)===key))return false;
   c.governance.proposals.push({id:crypto.randomUUID(),effects:d.task.effects,goal:d.goal,reason:d.motive,status:'open',day:gameDayNumber()});
   strategyEvent(a.country,'Кабинет предлагает изменение власти',d.motive+' Предложение: '+Object.entries(d.task.effects).filter(([k])=>k!=='transition').map(([,v])=>v).join(', ')+'. Оно ещё не вступило в силу.');
  }
  a.lastPoliticalTurn=turn;actorRemember(a,d.motive);worldState.currentNewsActors||=[];worldState.currentNewsActors.push(a.id);return true;
 }
 if(a?.kind==='government'&&d.action==='wait'){
  const offers=strategyState().offers.filter(o=>o.b===a.country&&o.status==='open');
  for(const o of offers){o.consideration=d.motive;if(!o.waitReported&&o.a===playerCountry){strategyEvent(a.country,'Решение по предложению отложено',d.motive+' Согласие на договор ещё не дано.',[o.a]);o.waitReported=true;}}
 }
 return strategyOldDecision(d,results);
};

const strategyOldTaskValidation=validatePoliticalTask;
validatePoliticalTask=function(t,owner){
 // Target scope belongs to the mandate, not to a country-specific exception.
 if(t.kind==='economic'&&t.effects?.economic_policy?.type==='tariff'&&t.target&&t.target!==owner){
  t.kind='diplomacy';t.effects={diplomatic_action:{action:'tariff',target:t.target,amount:t.effects.economic_policy.target}};
 }
 return strategyOldTaskValidation(t,owner);
};
let strategyTaskScope=null;
const strategyScopedFinish=finishPoliticalTask;
finishPoliticalTask=function(t){const previous=strategyTaskScope;strategyTaskScope=t;try{return strategyScopedFinish(t);}finally{strategyTaskScope=previous;}};

let strategyGeo=null;
function strategyProvince(id){return scenarioProvinces.find(p=>p.id===id||p.name===id);}
function strategyOwner(p){return provinceOwners[p.id]||p.owner;}
function strategyControl(p){return strategyState().occupations[p.id]||strategyOwner(p);}
function strategyGeometry(){
 if(strategyGeo?.source===scenarioProvinces&&strategyGeo.first===scenarioProvinces[0]&&Object.keys(strategyGeo.graph).length===scenarioProvinces.length)return strategyGeo;
 const graph={},centers={},vertices=new Map();
 for(const p of scenarioProvinces){graph[p.id]=new Set();const pts=p.geometry.type==='Polygon'?p.geometry.coordinates.flat():p.geometry.coordinates.flat(2);
  let x=0,y=0;for(const q of pts){x+=q[0];y+=q[1];const k=q[0].toFixed(3)+','+q[1].toFixed(3);if(!vertices.has(k))vertices.set(k,new Set());vertices.get(k).add(p.id);}centers[p.id]=[x/pts.length,y/pts.length];}
 for(const ids of vertices.values())for(const a of ids)for(const b of ids)if(a!==b)graph[a].add(b);
 strategyGeo={source:scenarioProvinces,first:scenarioProvinces[0],graph,centers};return strategyGeo;
}
function strategyDistance(a,b){const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2));}

const strategyLocationCache=new Map();
function strategyLocationProvince(name){
 const direct=strategyProvince(name);if(direct)return direct;
 const q=resolveLocationLonLat(name);if(!q)return null;
 const key=q.join(',');if(strategyLocationCache.has(key))return strategyProvince(strategyLocationCache.get(key));
 const insideRing=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const contains=p=>{const polygons=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.coordinates;return polygons.some(rings=>insideRing(rings[0])&&!rings.slice(1).some(insideRing));};
 const match=scenarioProvinces.find(contains);
 if(match){strategyLocationCache.set(key,match.id);return match;}
 const geo=strategyGeometry(),nearest=scenarioProvinces.slice().sort((a,b)=>strategyDistance(q,geo.centers[a.id])-strategyDistance(q,geo.centers[b.id]))[0];
 if(nearest&&strategyDistance(q,geo.centers[nearest.id])<250){strategyLocationCache.set(key,nearest.id);return nearest;}
 return null;
}

function strategyUnitProvince(u){
 if(u.province&&strategyProvince(u.province))return u.province;
 const p=strategyLocationProvince(u.location);if(p)return p.id;
 const q=resolveLocationLonLat(u.location);if(!q)return null;
 const geo=strategyGeometry(),own=scenarioProvinces.filter(p=>strategyOwner(p)===u.owner);
 return own.sort((a,b)=>strategyDistance(q,geo.centers[a.id])-strategyDistance(q,geo.centers[b.id]))[0]?.id||null;
}
function strategyAccess(owner,p){const n=strategyControl(p);return n===owner||isAtWar(owner,n)||findTreaty('alliance',owner,n)||strategyState().contracts.some(c=>c.status==='active'&&c.terms.access&&[c.a,c.b].includes(owner)&&[c.a,c.b].includes(n));}
function strategyPath(owner,from,to,entryOwner=null){
 const geo=strategyGeometry(),queue=[from],prev=new Map([[from,null]]);
 for(let i=0;i<queue.length;i++){const at=queue[i];if(at===to)break;for(const next of geo.graph[at]||[]){if(!prev.has(next)&&(strategyAccess(owner,strategyProvince(next))||entryOwner&&strategyControl(strategyProvince(next))===entryOwner)){prev.set(next,at);queue.push(next);}}}
 if(!prev.has(to))return null;const path=[];for(let p=to;p&&p!==from;p=prev.get(p))path.unshift(p);return path;
}
function strategyRouteExplanation(owner,from,to){
 const geo=strategyGeometry(),queue=[from],prev=new Map([[from,null]]);
 for(let i=0;i<queue.length;i++){const at=queue[i];if(at===to)break;for(const next of geo.graph[at]||[])if(!prev.has(next)){prev.set(next,at);queue.push(next);}}
 if(!prev.has(to))return 'Между этими провинциями нет связанного сухопутного пути. Проверьте исходную позицию части; острова требуют морской перевозки.';
 const blocked=new Set();for(let at=to;at&&at!==from;at=prev.get(at)){const p=strategyProvince(at);if(!strategyAccess(owner,p))blocked.add(strategyControl(p));}
 return 'Сухопутный путь существует, но нет права прохода через '+[...blocked].join(', ')+'. Можно договориться о доступе, выбрать разрешённый путь или приказать вторжение. Вторжение начинает боевые действия, даже без формального объявления войны.';
}
function validateMilitaryOrder(o,owner,execution=false){
 strategyKeys(o,['action','unit_id','troops','province','stance']);strategyAssert(['deploy','move','invade','hold','retreat'].includes(o.action),'Неизвестный военный приказ');strategyText(o.unit_id,100);
 if(o.stance!=null)strategyAssert(['attack','defend'].includes(o.stance),'Неверная позиция');
 const units=worldState.mapObjects||[],u=units.find(x=>x.id===o.unit_id);
 if(o.action==='deploy'){
  strategyAssert(!u,'ID части занят');strategyNum(o.troops,1,1000000);strategyAssert(Number.isInteger(o.troops),'Нужна целая численность');
  const p=strategyProvince(o.province);strategyAssert(p&&strategyControl(p)===owner,'Развёртывание только на контролируемой собственной территории');
  const used=units.filter(x=>x.type==='army'&&x.owner===owner).reduce((s,x)=>s+x.troops,0);
  if(execution)strategyAssert(used+o.troops<=countries[owner].army,'Недостаточно нераспределённых солдат');
 }else{
  if(execution||u)strategyAssert(u?.type==='army'&&u.owner===owner,'Нет собственной части');
  if(o.action!=='hold'){const p=strategyProvince(o.province);strategyAssert(p,'Неизвестная провинция');if(execution){const target=o.action==='invade'?strategyControl(p):null;strategyAssert(o.action!=='invade'||target&&target!==owner,'Для вторжения нужна чужая территория');strategyAssert(strategyPath(owner,strategyUnitProvince(u),p.id,target),strategyRouteExplanation(owner,strategyUnitProvince(u),p.id));}}
 }
 return o;
}
function executeMilitaryOrder(owner,o){
 validateMilitaryOrder(o,owner,true);const s=strategyState();
 if(o.action==='invade'){const target=strategyControl(strategyProvince(o.province));if(!isAtWar(owner,target)){declareEngineWar(owner,target,{type:'defense'});const campaign=s.campaigns.findLast(c=>c.status==='active'&&[c.a,c.b].includes(owner)&&[c.a,c.b].includes(target));if(campaign){campaign.formalDeclaration=false;campaign.cause='Вторжение без формального объявления войны';}strategyEvent(owner,'Граница пересечена без объявления войны','Войска вступают на территорию '+target+'. Начались боевые действия; отсутствие формальной декларации не делает вторжение мирным перемещением.',[target]);}}

 let u=worldState.mapObjects.find(x=>x.id===o.unit_id);
 if(o.action==='deploy'){
  const p=strategyProvince(o.province);
  u={id:o.unit_id,type:'army',owner,troops:o.troops,label:'Армия '+(countries[owner].displayName||owner),location:p.name,province:p.id,morale:75,supply:100,stance:o.stance||'defend'};
  worldState.mapObjects.push(u);
  strategyEvent(owner,'Армия развёрнута',o.troops+' действующих солдат выделены в часть на территории '+p.name+'. Численность национальной армии не увеличилась.');
 }else{
  s.routes=s.routes.filter(r=>r.unit!==u.id);if(!strategyOperational)u.commandedUntil=gameDayNumber()+30;u.stance=o.stance||(o.action==='retreat'?'defend':'attack');
  if(o.action!=='hold'){
   const p=strategyProvince(o.province),path=strategyPath(owner,strategyUnitProvince(u),p.id);
   s.routes.push({unit:u.id,path,progress:0,started:gameDayNumber()});
   strategyEvent(owner,o.action==='retreat'?'Приказ об отходе':'Армия получила приказ о движении',u.label+' направляется в '+p.name+'. Переход потребует времени и снабжения.',[strategyOwner(p)]);
  }
 }
 return 'Военный приказ принят; положение и численность части подтверждены.';
}
function strategyLoss(u,n){n=Math.min(u.troops,Math.max(0,Math.round(n)));u.troops-=n;changeCountryStat(u.owner,'army',-n);return n;}
function strategyRetreat(u,from){
 const geo=strategyGeometry(),options=[...(geo.graph[from]||[])].filter(id=>strategyControl(strategyProvince(id))===u.owner&&!worldState.mapObjects.some(x=>x.owner!==u.owner&&x.type==='army'&&strategyUnitProvince(x)===id&&isAtWar(u.owner,x.owner)));
 strategyState().routes=strategyState().routes.filter(r=>r.unit!==u.id);
 if(options.length){u.province=options[0];u.location=strategyProvince(options[0]).name;u.cooldown=gameDayNumber()+7;return 'отступила в '+u.location;}
 const lost=strategyLoss(u,u.troops);return 'капитулировала, '+lost+' солдат выбыли из армии';
}
function strategyBattle(attacker,defender,province){
 const p=strategyProvince(province),a=countries[attacker.owner],b=countries[defender.owner];
 const power=u=>u.troops*(.5+(u.morale??75)/100)*(.4+(u.supply??100)/100)*(0.9+Math.random()*.2);
 const win=power(attacker)>power(defender)*1.15,winner=win?attacker:defender,loser=win?defender:attacker;
 const wl=strategyLoss(winner,winner.troops*(.04+Math.random()*.08)),ll=strategyLoss(loser,loser.troops*(.15+Math.random()*.2));
 loser.morale=Math.max(10,(loser.morale??75)-20);winner.morale=Math.min(100,(winner.morale??75)+3);winner.cooldown=gameDayNumber()+5;
 const retreat=strategyRetreat(loser,p.id);
 strategyEvent(attacker.owner,'Сражение за '+p.name,winner.label+' удержала поле боя. Потери победителя: '+wl+', проигравшей стороны: '+ll+'. '+loser.label+' '+retreat+'.',[defender.owner]);
 strategyState().events.push({day:gameDayNumber(),province:p.id,winner:winner.owner,loser:loser.owner,losses:[wl,ll],retreat});
 if(win){attacker.province=p.id;attacker.location=p.name;strategyState().occupations[p.id]=attacker.owner;}
 reconcileOrderArmies();return win;
}
function strategyDefender(owner,p){
 const units=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner&&strategyUnitProvince(u)===p.id&&u.troops>0);if(units.length)return units[0];
 const used=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner).reduce((n,u)=>n+u.troops,0)+(typeof maritimeCargo==='function'?maritimeCargo(owner).reduce((n,u)=>n+u.troops,0):0),free=Math.max(0,countries[owner].army-used);
 if(free<1000)return null;
 const u={id:'reserve:'+owner+':'+p.id+':'+gameDayNumber(),type:'army',owner,troops:Math.min(free,Math.max(1000,Math.round(countries[owner].army*.1))),label:'Оборона '+p.name,province:p.id,location:p.name,morale:65,supply:80,stance:'defend'};
 worldState.mapObjects.push(u);return u;
}

function strategySupplied(owner,start){
 const geo=strategyGeometry(),queue=[start],seen=new Set(queue);
 for(let i=0;i<queue.length;i++){const p=strategyProvince(queue[i]);if(strategyOwner(p)===owner&&strategyControl(p)===owner)return true;
 for(const next of geo.graph[p.id]||[]){const n=strategyControl(strategyProvince(next));if(!seen.has(next)&&(n===owner||findTreaty('alliance',owner,n)||strategyState().contracts.some(c=>c.status==='active'&&c.terms.access&&[c.a,c.b].includes(owner)&&[c.a,c.b].includes(n)))){seen.add(next);queue.push(next);}}}
 return false;
}


let strategyOperational=false;
function strategyOperationalAI(){
 if(gameDayNumber()%7!==0)return;
 const geo=strategyGeometry(),s=strategyState();
 for(const owner of ALL_COUNTRIES.filter(n=>n!==playerCountry&&countries[n]&&!countries[n].annexed)){
  const enemies=ALL_COUNTRIES.filter(n=>n!==owner&&countries[n]&&!countries[n].annexed&&isAtWar(owner,n));
  if(!enemies.length||countries[owner].army<5000)continue;
  for(const enemy of enemies.slice(0,2)){
   const frontier=scenarioProvinces.filter(p=>strategyControl(p)===owner&&[...geo.graph[p.id]].some(id=>strategyControl(strategyProvince(id))===enemy));
   if(!frontier.length)continue;
   const home=frontier.sort((a,b)=>Number(strategyOwner(b)===owner)-Number(strategyOwner(a)===owner))[0];
   const targets=[...geo.graph[home.id]].map(strategyProvince).filter(p=>strategyControl(p)===enemy).sort((a,b)=>Number(strategyOwner(b)===owner)-Number(strategyOwner(a)===owner));
   const target=targets[0];if(!target)continue;
   let unit=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner&&u.troops>0&&!s.routes.some(r=>r.unit===u.id)&&!(Number.isFinite(u.commandedUntil)&&u.commandedUntil>gameDayNumber())&&!(Number.isFinite(u.cooldown)&&u.cooldown>gameDayNumber()))
    .sort((a,b)=>strategyDistance(geo.centers[strategyUnitProvince(a)],geo.centers[home.id])-strategyDistance(geo.centers[strategyUnitProvince(b)],geo.centers[home.id]))[0];
   strategyOperational=true;
   try{
    if(!unit){
     const used=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner).reduce((n,u)=>n+u.troops,0),free=countries[owner].army-used;
     const troops=Math.floor(Math.min(free,countries[owner].army*.2,100000));if(troops<5000)continue;
     const id='operation:'+owner+':'+home.id+':'+gameDayNumber();
     executeMilitaryOrder(owner,{action:'deploy',unit_id:id,troops,province:home.id,stance:'defend'});unit=worldState.mapObjects.find(u=>u.id===id);
    }
    const route=strategyPath(owner,strategyUnitProvince(unit),target.id);
    if(!route||strategyDistance(geo.centers[strategyUnitProvince(unit)],geo.centers[home.id])>500)continue;
    const defending=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===enemy&&strategyUnitProvince(u)===target.id).reduce((n,u)=>n+u.troops,0)||Math.min(countries[enemy].army*.1,100000);
    const paid=countries[owner].econV3?.paidRatio??1;
    if(unit.troops>defending*1.25&&(unit.supply??100)>40&&paid>.6)executeMilitaryOrder(owner,{action:'move',unit_id:unit.id,province:target.id,stance:'attack'});
   }catch(error){if(!(error instanceof StrategyActionError))throw error;}
   finally{strategyOperational=false;}
  }
 }
}

function strategyTick(){
 const s=strategyState(),geo=strategyGeometry();
 for(const u of worldState.mapObjects.filter(u=>u.type==='army'&&u.troops>0)){
  const id=strategyUnitProvince(u),p=strategyProvince(id);if(!p)continue;u.province=id;
  const friendly=strategySupplied(u.owner,p.id);
  const paid=countries[u.owner].econV3?.paidRatio??1;
  u.supply=Math.max(0,Math.min(100,(u.supply??100)+(friendly?2:-1)-(paid<.8?2:0)));
  if(u.supply<15&&gameDayNumber()%7===0)strategyLoss(u,u.troops*.005);
 }
 strategyOperationalAI();
 for(const r of s.routes.slice()){
  const u=worldState.mapObjects.find(x=>x.id===r.unit&&x.troops>0);if(!u||!r.path.length){s.routes=s.routes.filter(x=>x!==r);continue;}
  if(Number.isFinite(u.cooldown)&&u.cooldown>gameDayNumber())continue;
  const from=strategyUnitProvince(u),to=r.path[0],p=strategyProvince(to);
  if(!strategyAccess(u.owner,p)){s.routes=s.routes.filter(x=>x!==r);strategyEvent(u.owner,'Маршрут армии прерван','Доступ к '+p.name+' закрыт. Армия остаётся на прежней позиции.');continue;}
  r.progress+=20*(.4+(u.supply??100)/167);
  if(r.progress<Math.max(20,strategyDistance(geo.centers[from],geo.centers[to])))continue;
  r.progress=0;const control=strategyControl(p);
  if(isAtWar(u.owner,control)){
   const defender=strategyDefender(control,p);
   let won=true;const defending=worldState.mapObjects.filter(x=>x.type==='army'&&x.owner===control&&strategyUnitProvince(x)===p.id&&x.troops>0);
   for(const enemy of defending){if(!strategyBattle(u,enemy,p.id)){won=false;break;}}
   if(!won){s.routes=s.routes.filter(x=>x!==r);continue;}
   s.occupations[p.id]=u.owner;
   strategyEvent(u.owner,'Занята территория '+p.name,u.label+' установила военный контроль. Юридический собственник остаётся '+strategyOwner(p)+'.',[strategyOwner(p)]);
  }
  u.province=p.id;u.location=p.name;r.path.shift();
 }
 s.routes=s.routes.filter(r=>r.path.length&&worldState.mapObjects.some(u=>u.id===r.unit&&u.troops>0));
 s.events=s.events.slice(-80);reconcileOrderArmies();strategyTickContracts();
}
const strategyOldAdvance=advanceGameDays;
advanceGameDays=function(n){const all={econ:[],deaths:[],months:0};for(let i=0;i<n;i++){const r=strategyOldAdvance(1);strategyTick();if(r.econ.length)all.econ=r.econ;all.deaths.push(...r.deaths);all.months+=r.months;}return all;};
// One political decision system: monthly simulation no longer secretly signs contracts or peace.
runDiplomacyEngine=function(){
 for(const t of worldState.treaties||[])if(t.type==='alliance'&&getRelation(t.a,t.b)<80)addRelation(t.a,t.b,1);
 for(const g of Object.values(worldState.warGoals||{})){
  if(!isAtWar(g.attacker,g.defender))continue;
  for(const n of [g.attacker,g.defender]){const c=countries[n],a=ensureWorldActors()[n+'::government'];if(a&&(c.stability<25||econBudget(c).net<0))actorRemember(a,'Военное истощение: необходимо оценить условия мира, но согласие противника ещё не получено.');}
 }
};
const strategyOldWar=declareEngineWar;
declareEngineWar=function(a,b,goal){
 strategyAssert(!isAtWar(a,b),'Война уже идёт');strategyCountry(a);strategyCountry(b);
 // Avoid random goal selection entirely in this version.
 for(const t of strategyState().contracts.filter(t=>t.status==='active'&&[t.a,t.b].includes(a)&&[t.a,t.b].includes(b)))t.status='broken';
 const old=makeWarGoal;makeWarGoal=()=>({attacker:a,defender:b,type:goal?.type||'defense',provinces:goal?.provinces||[],startYear:year,startTurn:turn,defStartArmy:countries[b].army});
 let g;try{g=strategyOldWar(a,b);}finally{makeWarGoal=old;}
 strategyState().campaigns.push({id:crypto.randomUUID(),a,b,goal:g,status:'active',start:gameDayNumber()});
 for(const t of strategyState().contracts.filter(t=>t.status==='active'&&t.terms.militaryAid&&[t.a,t.b].includes(b))){
  const ally=t.a===b?t.b:t.a;strategyState().claims.push({id:crypto.randomUUID(),contract:t.id,from:b,to:ally,obligation:'militaryAid',enemy:a,status:'open',day:gameDayNumber()});
  const actor=ensureWorldActors()[ally+'::government'];if(actor)actorRemember(actor,b+' просит выполнить союзный договор и помочь против '+a+'. Выбери исполнение или отказ с последствиями.');
 }
 return g;
};
warGoalLabel=function(g){if(!g)return '';return ({territory:'уступка территорий: '+(g.provinces||[]).map(id=>strategyProvince(id)?.name||id).join(', '),tribute:'компенсация',subjugation:'установление зависимости',defense:'защита и прекращение угрозы'})[g.type]||g.type;};

function validateDiplomaticAction(d,owner){
 strategyKeys(d,['action','message','target','offer_id','contract_id','claim_id','goal','type','terms','obligation','amount']);
 strategyAssert(['communicate','declare_war','offer','accept','reject','break','demand','fulfill','refuse','integrate','release','tariff'].includes(d.action),'Неизвестное дипломатическое действие');
 if(d.target){strategyCountry(d.target);strategyAssert(d.target!==owner,'Нужен иностранный адресат');}
 if(['communicate','declare_war','offer','tariff'].includes(d.action))strategyAssert(d.target,'Нужен адресат');
 if(d.message)strategyText(d.message,900);
 if(d.goal){strategyKeys(d.goal,['type','provinces']);strategyAssert(['territory','tribute','subjugation','defense'].includes(d.goal.type),'Неверная цель войны');}
 if(d.type!=null)strategyAssert(['alliance','nonaggression','peace','dependency'].includes(d.type),'Неверный вид договора');
 if(d.action==='offer')strategyAssert(d.type,'Нужен вид договора');
 if(d.terms){strategyKeys(d.terms,['provinces','payment','tribute','autonomy','militaryAid','access','days','subject','payer','offensive']);
  for(const [k,a,b]of [['payment',0,1e7],['tribute',0,.3],['autonomy',0,1],['days',1,36500]])if(d.terms[k]!=null)strategyNum(d.terms[k],a,b);
  for(const k of ['militaryAid','access','offensive'])if(d.terms[k]!=null)strategyAssert(typeof d.terms[k]==='boolean','Нужен логический параметр');
  if(d.terms.payer)strategyAssert([owner,d.target].includes(d.terms.payer),'Плательщик только сторона договора');
  if(d.terms.subject)strategyAssert([owner,d.target].includes(d.terms.subject),'Зависимость только между сторонами');
 }
 for(const list of [d.goal?.provinces,d.terms?.provinces])if(list!=null)strategyAssert(Array.isArray(list)&&list.length<=40&&list.every(id=>strategyProvince(id)),'Неизвестные территории');
 if(d.action==='declare_war')strategyAssert(!isAtWar(owner,d.target),'Война уже идёт');
 if(['accept','reject'].includes(d.action))strategyAssert(strategyState().offers.some(o=>o.id===d.offer_id&&o.b===owner&&o.status==='open'),'Нет адресованного предложения');
 if(['break','demand','integrate','release'].includes(d.action))strategyAssert(strategyState().contracts.some(c=>c.id===d.contract_id&&c.status==='active'&&[c.a,c.b].includes(owner)),'Нет действующего своего договора');
 if(['fulfill','refuse'].includes(d.action))strategyAssert(strategyState().claims.some(c=>c.id===d.claim_id&&c.to===owner&&c.status==='open'),'Нет входящего требования');
 if(d.action==='demand'){strategyAssert(['tribute','militaryAid'].includes(d.obligation),'Неверное обязательство');if(d.amount!=null)strategyNum(d.amount,0,1e9);}
 if(d.action==='tariff')strategyNum(d.amount,0,100);
 return d;
}
function strategyOffer(a,b,type,terms={},extra={}){
 const s=strategyState();
 if(type==='alliance'&&!Object.hasOwn(terms,'militaryAid'))terms={...terms,militaryAid:true};
 const signature=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))));
 const existing=s.offers.find(o=>o.status==='open'&&o.a===a&&o.b===b&&o.type===type&&signature(o.terms)===signature(terms));
 if(existing)return existing;
 const o={id:crypto.randomUUID(),a,b,type,terms:JSON.parse(JSON.stringify(terms)),status:'open',day:gameDayNumber(),expires:gameDayNumber()+90,...extra};s.offers.push(o);
 queueNewsIssue(a,b,o.id,'Предложение '+type+'. Условия '+JSON.stringify(terms),'contract_offer');
 strategyEvent(a,'Передано предложение договора',a+' предложила '+b+' соглашение. Условия переданы адресату; его согласие пока не получено.',[b]);return o;
}
function strategyEndWar(a,b){
 if(a===playerCountry||b===playerCountry)worldState.atWarWith=worldState.atWarWith.filter(n=>n!==(a===playerCountry?b:a));
 else worldState.aiWars=worldState.aiWars.filter(w=>!(w.includes(a)&&w.includes(b)));
 delete worldState.warGoals[warKey(a,b)];
 const s=strategyState();s.campaigns.filter(c=>[c.a,c.b].includes(a)&&[c.a,c.b].includes(b)).forEach(c=>c.status='ended');
 for(const [id,controller]of Object.entries(s.occupations)){const own=strategyOwner(strategyProvince(id));if([a,b].includes(own)&&[a,b].includes(controller))delete s.occupations[id];}
 s.routes=s.routes.filter(r=>{const u=worldState.mapObjects.find(x=>x.id===r.unit);return u&&!([a,b].includes(u.owner)&&r.path.some(id=>[a,b].includes(strategyOwner(strategyProvince(id)))&&strategyOwner(strategyProvince(id))!==u.owner));});
 for(const u of worldState.mapObjects.filter(x=>x.type==='army'&&[a,b].includes(x.owner))){const p=strategyProvince(strategyUnitProvince(u));if(p&&strategyOwner(p)!==u.owner){const home=scenarioProvinces.find(x=>strategyOwner(x)===u.owner);if(home){u.province=home.id;u.location=home.name;}}}
 addRelation(a,b,5);
}
function strategyAccept(owner,id){
 const s=strategyState(),o=s.offers.find(x=>x.id===id&&x.b===owner&&x.status==='open');strategyAssert(o,'Предложение не найдено');
 const t=o.terms||{},a=o.a,b=o.b;
 const payer=t.payer||b,recipient=payer===b?a:b;
 strategyAssert(countries[payer].treasury>=(t.payment||0),'У плательщика нет средств для согласованных выплат');
 for(const id of t.provinces||[])strategyAssert(strategyOwner(strategyProvince(id))===b,'Адресат уже не владеет уступаемой землёй');
 if(['alliance','nonaggression','dependency'].includes(o.type))strategyAssert(!isAtWar(a,b),'Сначала необходим мир');
 if(o.type==='dependency'||o.type==='peace'&&t.subject){
  const subject=t.subject||b,patron=subject===b?a:b;
  strategyAssert(!s.contracts.some(x=>x.status==='active'&&x.type==='dependency'&&x.subject===subject&&x.patron!==patron),'У страны уже есть другой сюзерен');
  let current=patron,seen=new Set([subject]);while(current){strategyAssert(!seen.has(current),'Циклическая зависимость запрещена');seen.add(current);current=s.contracts.find(x=>x.status==='active'&&x.type==='dependency'&&x.subject===current)?.patron;}
 }
 if(o.type==='integration'){
  const dep=s.contracts.find(c=>c.id===o.parent&&c.status==='active');strategyAssert(dep&&dep.patron===a&&dep.subject===b,'Основание интеграции утрачено');
 }
 if(o.type==='peace')strategyAssert(isAtWar(a,b),'Война уже прекращена');
 const ceded=new Set((t.provinces||[]).map(id=>strategyProvince(id).id)),owned=scenarioProvinces.filter(p=>strategyOwner(p)===b),annexation=o.type==='peace'&&owned.length>0&&owned.every(p=>ceded.has(p.id));
 strategyAssert(!(annexation&&t.subject),'Зависимое государство должно сохранить территорию');
 const previous=s.contracts.find(c=>c.status==='active'&&c.type===o.type&&[c.a,c.b].includes(a)&&[c.a,c.b].includes(b));
 // All material preconditions above are checked before any transfer.
 if(t.payment){countries[payer].treasury-=t.payment;countries[recipient].treasury+=t.payment;}
 for(const id of t.provinces||[])transferProvince(id,a);
 if(o.type==='peace'){strategyEndWar(a,b);if(annexation)strategyMergeCountry(b,a);}
 if(['alliance','nonaggression'].includes(o.type))signTreaty(o.type,a,b);
 const c={id:crypto.randomUUID(),a,b,type:o.type,terms:t,status:o.type==='peace'&&t.subject?'completed':'active',since:gameDayNumber(),due:gameDayNumber()+(t.days||3650),parent:o.parent};
 if(o.type==='dependency'){c.subject=t.subject||b;c.patron=c.subject===b?a:b;c.loyalty=previous?.loyalty??Math.max(20,Math.min(80,50+getRelation(a,b)/3));c.arrears=previous?.arrears||0;}
 if(previous){previous.status='superseded';s.claims.filter(x=>x.contract===previous.id).forEach(x=>x.contract=c.id);s.contracts.filter(x=>x.parent===previous.id).forEach(x=>x.parent=c.id);}
 s.contracts.push(c);
 if(o.type==='peace'&&t.subject){
  const subject=t.subject,patron=subject===b?a:b,old=s.contracts.find(x=>x.type==='dependency'&&x.status==='active'&&x.subject===subject);
  if(old)old.status='superseded';
  s.contracts.push({id:crypto.randomUUID(),a,b,type:'dependency',terms:t,status:'active',subject,patron,loyalty:old?.loyalty??Math.max(20,Math.min(80,50+getRelation(a,b)/3)),arrears:old?.arrears||0,since:gameDayNumber(),due:gameDayNumber()+(t.days||3650)});
 }
 o.status='accepted';policyResolveProposal(o.id,owner);
 const issue=ensureNewsFlow().issues.find(x=>x.id===o.id);if(issue)issue.status='closed';
 strategyEvent(owner,'Договор вступил в силу',a+' и '+b+' приняли условия соглашения. Обязательства и предусмотренные передачи закреплены в действующем договоре.',[a]);
 return c;
}
function executeDiplomaticAction(owner,d){
 validateDiplomaticAction(d,owner);const s=strategyState();
 if(d.action==='communicate'){
  const message=d.message||'Официальный дипломатический контакт';
  policyNotice(owner,d.target,message,'diplomacy');
  strategyEvent(owner,'Правительство направило дипломатическое обращение',message,[d.target]);
 }
 else if(d.action==='declare_war')declareEngineWar(owner,d.target,d.goal);
 else if(d.action==='offer')strategyOffer(owner,d.target,d.type,d.terms||{});
 else if(d.action==='accept')strategyAccept(owner,d.offer_id);
 else if(d.action==='reject'){const o=s.offers.find(x=>x.id===d.offer_id);o.status='rejected';const i=ensureNewsFlow().issues.find(x=>x.id===o.id);if(i)i.status='closed';strategyEvent(owner,'Предложение отклонено',owner+' не приняла условия '+o.a+'. Переговоры не создали обязательств.',[o.a]);}
 else if(d.action==='tariff'){countries[owner].bilateralTariffs||={};countries[owner].bilateralTariffs[d.target]=d.amount;addRelation(owner,d.target,d.amount>20?-2:1);strategyEvent(owner,'Изменены торговые пошлины','Ставка для товаров из '+d.target+' установлена в '+d.amount+'%. Доход и оценочный поток импорта пересчитываются.',[d.target]);}
 else if(['fulfill','refuse'].includes(d.action)){
  const claim=s.claims.find(c=>c.id===d.claim_id),contract=s.contracts.find(c=>c.id===claim.contract);
  if(d.action==='fulfill'){
   if(claim.obligation==='militaryAid'){
    if(claim.enemy){if(!isAtWar(owner,claim.enemy))declareEngineWar(owner,claim.enemy,{type:'defense'});}
    else{
     const geo=strategyGeometry(),own=scenarioProvinces.filter(p=>strategyControl(p)===owner),patronLand=scenarioProvinces.filter(p=>strategyControl(p)===claim.from);
     strategyAssert(own.length&&patronLand.length,'Нет территории для размещения контингента');
     own.sort((a,b)=>Math.min(...patronLand.map(p=>strategyDistance(geo.centers[a.id],geo.centers[p.id])))-Math.min(...patronLand.map(p=>strategyDistance(geo.centers[b.id],geo.centers[p.id]))));
     executeMilitaryOrder(owner,{action:'deploy',unit_id:'aid:'+claim.id,troops:claim.amount||5000,province:own[0].id,stance:'defend'});
    }
   }
   else {const pay=claim.amount||0;strategyAssert(countries[owner].treasury>=pay,'Недостаточно казны');countries[owner].treasury-=pay;countries[claim.from].treasury+=pay;if(contract)contract.arrears=Math.max(0,(contract.arrears||0)-pay);}
   claim.status='fulfilled';
  }else{claim.status='refused';addRelation(owner,claim.from,claim.mandatory===false?-3:-15);if(claim.mandatory!==false){countries[owner].reputation=Math.max(0,(countries[owner].reputation??70)-8);if(contract?.type==='dependency')contract.loyalty=Math.max(0,contract.loyalty-15);}}
  strategyEvent(owner,'Ответ на договорное требование',owner+(d.action==='fulfill'?' исполнила обязательство.':' отказалась исполнить обязательство; отношения и доверие ухудшились.'),[claim.from]);
 }else{
  const c=s.contracts.find(x=>x.id===d.contract_id),other=c.a===owner?c.b:c.a;
  if(d.action==='break'){
   if(['alliance','nonaggression'].includes(c.type))breakTreaty(c.type,owner,other);
   else {addRelation(owner,other,-30);countries[owner].reputation=Math.max(0,(countries[owner].reputation??70)-15);}
   c.status='broken';strategyEvent(owner,'Договор прекращён',owner+' прекратила соглашение с '+other+'. Нарушение обязательств снижает доверие.',[other]);
  }else if(d.action==='release'){strategyAssert(c.type==='dependency'&&c.patron===owner,'Освободить зависимую страну может сюзерен');c.status='released';strategyEvent(owner,'Зависимость прекращена',c.subject+' освобождена от обязательств перед '+owner+'.',[c.subject]);}
  else if(d.action==='integrate'){strategyAssert(c.type==='dependency'&&c.patron===owner,'Интеграция только собственной зависимой страны');strategyOffer(owner,c.subject,'integration',{days:180+Math.round((c.terms.autonomy??.5)*180)}, {parent:c.id});}
  else if(d.action==='demand'){
   if(d.obligation==='tribute')strategyAssert(c.type==='dependency'&&c.patron===owner||c.type==='peace'&&strategyRecipient(c)===owner,'Требование должен предъявить получатель платежа');
   const enemy=worldState.atWarWith?.find(n=>isAtWar(owner,n))||worldState.aiWars?.find(w=>w.includes(owner))?.find(n=>n!==owner);
   
   const amount=d.obligation==='tribute'?(d.amount??c.arrears??0):(d.amount||5000);
   const goal=enemy&&worldState.warGoals[warKey(owner,enemy)];
   const mandatory=d.obligation==='militaryAid'?!!c.terms.militaryAid&&(!enemy||!!c.terms.offensive||goal?.defender===owner):(c.terms.tribute||0)>0&&amount<=(c.arrears||0);
   const claim={id:crypto.randomUUID(),contract:c.id,from:owner,to:other,obligation:d.obligation,amount,mandatory,enemy,status:'open',day:gameDayNumber()};s.claims.push(claim);
   queueNewsIssue(owner,other,claim.id,'Требование '+d.obligation+' '+amount+(mandatory?' по договору':' сверх договора'),'contract_claim');strategyEvent(owner,'Предъявлено договорное требование',owner+' потребовала от '+other+' исполнить требование '+d.obligation+(amount?' на сумму '+amount:'')+(mandatory?' по действующему договору.':' сверх действующего договора; согласие не гарантировано.')+' Ответ ещё не получен.',[other]);
  }
 }
 return 'Дипломатическое действие зарегистрировано; согласие и договорные последствия проверены.';
}
let strategyAccounting=false;
const strategyOldRevenue=econMonthlyRevenue;
econMonthlyRevenue=function(c){
 const r=strategyOldRevenue(c),owner=ALL_COUNTRIES.find(n=>countries[n]===c),v=c.econV3;
 if(!owner||!Object.keys(c.bilateralTariffs||{}).length)return r;
 const partners=ALL_COUNTRIES.filter(n=>n!==owner&&countries[n]&&!countries[n].annexed),total=partners.reduce((s,n)=>s+Math.max(1,countries[n].gdp),0);
 const imports=c.gdp*v.prices/12*.12;
 const tariffs=partners.reduce((s,n)=>{const rate=c.bilateralTariffs[n]??v.policy.tariff;return s+(isAtWar(owner,n)?0:imports*Math.max(1,countries[n].gdp)/total*Math.exp(-rate/100)*rate/100*v.collection);},0);
 return {...r,gross:r.gross-r.tariffs+tariffs,tariffs};
};
function strategyPayer(c){return c.type==='dependency'?c.subject:(c.terms.payer||c.b);}
function strategyRecipient(c){const payer=strategyPayer(c);return c.type==='dependency'?c.patron:(payer===c.b?c.a:c.b);}
function strategyTribute(c){const rate=c.terms.tribute||0;return Math.max(0,econMonthlyRevenue(countries[strategyPayer(c)]).gross*rate);}
const strategyOldBudget=econBudget;
econBudget=function(c){
 const b=strategyOldBudget(c);if(strategyAccounting)return b;
 const owner=ALL_COUNTRIES.find(n=>countries[n]===c);let incoming=0,outgoing=0;
 for(const d of strategyState().contracts.filter(d=>['dependency','peace'].includes(d.type)&&d.status==='active'&&(d.terms.tribute||0)>0)){const x=strategyTribute(d);if(strategyPayer(d)===owner)outgoing+=x;if(strategyRecipient(d)===owner)incoming+=x;}
 return {...b,gross:b.gross+incoming,expense:b.expense+outgoing,net:b.net+incoming-outgoing,lines:{income:[...b.lines.income,...(incoming?[{name:'Дань зависимых стран (обязательство)',value:incoming}]:[])],expense:[...b.lines.expense,...(outgoing?[{name:'Договорная дань',value:outgoing}]:[])]}};
};
const strategyOldEconStep=econStep;
econStep=function(...args){strategyAccounting=true;try{return strategyOldEconStep(...args);}finally{strategyAccounting=false;}};
econWar=function(c){const owner=ALL_COUNTRIES.find(n=>countries[n]===c);return ALL_COUNTRIES.some(n=>n!==owner&&countries[n]&&!countries[n].annexed&&isAtWar(owner,n));};
function strategyTickContracts(){
 const s=strategyState(),now=gameDayNumber();
 for(const o of s.offers.filter(o=>o.status==='open'&&o.expires<=now))o.status='expired';
 for(const c of s.contracts.filter(c=>c.status==='active')){
  if(!countries[c.a]||!countries[c.b]||countries[c.a].annexed||countries[c.b].annexed){c.status='invalid';continue;}
  if(c.type==='dependency'||c.type==='peace'&&(c.terms.tribute||0)>0){
   const payer=strategyPayer(c),recipient=strategyRecipient(c),due=strategyTribute(c)*12/365.2425,pay=Math.min(due,countries[payer].treasury);countries[payer].treasury-=pay;countries[recipient].treasury+=pay;const va=countries[payer].econV3,vb=countries[recipient].econV3;if(va?.monthly)va.monthly.expense+=due;if(vb?.monthly)vb.monthly.gross+=pay;c.arrears=(c.arrears||0)+due-pay;
   if(c.type==='dependency'){const subject=countries[c.subject],patron=countries[c.patron],dominance=Math.min(3,patron.army/Math.max(1000,subject.army))+Math.min(3,patron.gdp/Math.max(1,subject.gdp));
   const target=Math.max(0,Math.min(100,45+getRelation(c.subject,c.patron)*.5+subject.stability*.2+dominance*3-(c.terms.autonomy??.5)*15-(c.terms.tribute||0)*80));
   c.loyalty=Math.max(0,Math.min(100,c.loyalty+(target-c.loyalty)/180-(due>pay?.05:0)));}
  }
  if(c.due<=now){
   if(c.type==='integration'){
    const dep=s.contracts.find(d=>d.id===c.parent&&d.status==='active');
    if(!dep||dep.loyalty<40||getRelation(c.a,c.b)<0){c.status='blocked';strategyEvent(c.a,'Интеграция приостановлена','Подчинённое государство сопротивляется или основание соглашения утрачено. Земли не присоединены.',[c.b]);continue;}
    strategyMergeCountry(c.b,c.a);dep.status='integrated';c.status='completed';strategyEvent(c.a,'Завершено присоединение',c.b+' включена в '+c.a+' после принятого соглашения и периода интеграции.',[c.b]);
   }else{c.status='expired';if(['alliance','nonaggression'].includes(c.type)){worldState.treaties=worldState.treaties.filter(t=>!(t.type===c.type&&[t.a,t.b].includes(c.a)&&[t.a,t.b].includes(c.b)));worldState.alliedWith=worldState.alliedWith.filter(n=>!([c.a,c.b].includes(playerCountry)&&[c.a,c.b].includes(n)));}strategyEvent(c.a,'Истёк срок договора','Соглашение с '+c.b+' прекратилось в согласованный срок, без штрафа за нарушение.',[c.b]);}
  }
 }
 s.offers=s.offers.filter(o=>o.status==='open'||o.day>=now-365);s.claims=s.claims.slice(-80);
}
// Existing offer buttons and NPC decisions join the same contract pipeline.
createPoliticalOffer=function(a,b,type){const task=strategyTaskScope,terms={};if(type==='alliance')terms.militaryAid=true;if(task){const source=String(task.sourceMandate||task.goal).replace(/(?:сроком\s+на|сроком|на)\s+(?=\d|один|одну|одной|одного|два|две|двух|три|четыре|пять|шесть)/gi,'через ');const days=politicalDuration(source)||(/годов|на\s+год/i.test(source)?365:0);if(days)terms.days=days;}return strategyOffer(a,b,type,terms);};
answerPoliticalOffer=function(owner,target,answer,type){const o=strategyState().offers.find(o=>o.a===target&&o.b===owner&&o.status==='open'&&(!type||o.type===type));if(!o)return {status:'blocked',reason:'Нет входящего предложения'};try{if(answer==='accept')strategyAccept(owner,o.id);else o.status='rejected';return {status:'executed',reason:answer==='accept'?'Договор принят':'Предложение отклонено'};}catch(e){return {status:'blocked',reason:e.message};}};

function strategyMergeCountry(from,to){
 countries[to].treasury+=countries[from].treasury;countries[from].treasury=0;
 countries[to].army+=countries[from].army;countries[from].army=0;
 for(const f of ['debt','debtDomestic','debtForeign']){countries[to][f]=(countries[to][f]||0)+(countries[from][f]||0);countries[from][f]=0;}
 worldState.mapObjects.filter(u=>u.owner===from).forEach(u=>u.owner=to);
 (worldState.actorRecruitment||[]).filter(p=>p.country===from).forEach(p=>p.country=to);
 transferTerritory(from,to);
 worldState.atWarWith=worldState.atWarWith.filter(n=>n!==from);
 worldState.aiWars=worldState.aiWars.filter(w=>!w.includes(from));
 for(const [k,g]of Object.entries(worldState.warGoals||{}))if([g.attacker,g.defender].includes(from))delete worldState.warGoals[k];
 worldState.treaties=(worldState.treaties||[]).filter(t=>![t.a,t.b].includes(from));worldState.alliedWith=worldState.alliedWith.filter(n=>n!==from);
 for(const c of strategyState().campaigns)if([c.a,c.b].includes(from))c.status='ended';
}

function strategyTermsText(t){
 const a=[];if(t.provinces?.length)a.push('земли: '+t.provinces.map(id=>strategyProvince(id)?.name||id).join(', '));
 if(t.subject)a.push('подчинённая страна: '+(countries[t.subject]?.displayName||t.subject));if(t.payment)a.push('разовая выплата '+economyFmt(t.payment)+(t.payer?' · платит '+(countries[t.payer]?.displayName||t.payer):''));
 if(t.tribute!=null)a.push('дань '+Math.round(t.tribute*100)+'% поступлений');
 if(t.autonomy!=null)a.push('автономия '+Math.round(t.autonomy*100)+'%');
 if(t.militaryAid)a.push('военная помощь');if(t.access)a.push('доступ войск');if(t.days)a.push('срок '+t.days+' дней');return a.join(' · ')||'Без дополнительных условий';
}

const strategyOldActions=renderPoliticalActions;
renderPoliticalActions=function(box){
 strategyOldActions(box);const s=strategyState(),offers=s.offers.filter(o=>[o.a,o.b].includes(playerCountry)&&(o.status==='open'||o.day>=gameDayNumber()-90)),contracts=s.contracts.filter(c=>c.status==='active'&&[c.a,c.b].includes(playerCountry)),claims=s.claims.filter(c=>c.to===playerCountry&&c.status==='open');
 const details=document.createElement('details'),label=document.createElement('summary');label.textContent='Договоры и военные операции';details.append(label);
 const line=(text)=>{const p=document.createElement('p');p.textContent=text;details.append(p);return p;};
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.maxWidth='100%';b.style.whiteSpace='normal';b.style.display='block';b.disabled=turnRunning;b.onclick=()=>queueOrder(label,'diplomacy',{diplomatic_action:action});details.append(b);};
 const type={alliance:'Союз',nonaggression:'Ненападение',peace:'Мир',dependency:'Зависимость',integration:'Присоединение'};
 for(const o of offers){line((type[o.type]||o.type)+': '+(countries[o.a].displayName||o.a)+' → '+(countries[o.b].displayName||o.b)+' · '+({open:'ожидает ответа',accepted:'принято',rejected:'отклонено',expired:'срок ответа истёк'})[o.status]+' · '+strategyTermsText(o.terms)+(o.consideration?' · '+o.consideration:''));if(o.b===playerCountry&&o.status==='open'){button('Принять предложение',{action:'accept',offer_id:o.id});button('Отклонить предложение',{action:'reject',offer_id:o.id});}}
 for(const c of contracts){const other=c.a===playerCountry?c.b:c.a;line((type[c.type]||c.type)+' · '+(countries[other].displayName||other)+(c.type==='dependency'?' · дань '+Math.round((c.terms.tribute||0)*100)+'% · лояльность '+Math.round(c.loyalty)+'/100 · задолженность '+economyFmt(c.arrears||0):''));
  if(c.type==='dependency'&&c.patron===playerCountry){button('Предложить присоединение',{action:'integrate',contract_id:c.id});button('Освободить государство',{action:'release',contract_id:c.id});}
  if(c.terms.militaryAid)button('Потребовать военную помощь',{action:'demand',contract_id:c.id,obligation:'militaryAid'});
  if(c.type!=='integration')button('Прекратить договор',{action:'break',contract_id:c.id});
 }
 for(const c of claims){line('Требование '+c.from+': '+({militaryAid:'военная помощь',tribute:'уплата задолженности'})[c.obligation]);button('Исполнить требование',{action:'fulfill',claim_id:c.id});button('Отказать в исполнении',{action:'refuse',claim_id:c.id});}
 for(const p of countries[playerCountry].governance?.proposals||[])if(p.status==='open'){line('Предложение кабинета: '+p.goal+' · '+p.reason);const b=document.createElement('button');b.type='button';b.textContent='Принять предложение кабинета';b.disabled=turnRunning;b.onclick=()=>{if(p.status!=='open')return;const count=ensureOrders().length;queueOrder(p.goal,'power',p.effects);if(ensureOrders().length>count){p.status='submitted';saveGame();renderActionsList();}};details.append(b);}
 const units=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===playerCountry);
 for(const u of units){const r=s.routes.find(r=>r.unit===u.id);line(u.label+' · '+u.troops.toLocaleString('ru')+' · '+u.location+' · снабжение '+Math.round(u.supply??100)+'%'+(r?' → '+strategyProvince(r.path.at(-1))?.name:''));}
 for(const c of s.campaigns.filter(c=>c.status==='active'&&[c.a,c.b].includes(playerCountry)))line('Война '+c.a+' / '+c.b+' · '+warGoalLabel(c.goal));
 if(!offers.length&&!contracts.length&&!claims.length&&!units.length)line('Предложения, договоры и армии появятся после соответствующих решений. Приказы можно отдавать текстом.');
 box.append(details);
};
const strategyOldMap=applyMapObjects;
applyMapObjects=function(list){
 const changes=[],s=strategyState(),snapshot=JSON.parse(JSON.stringify({objects:worldState.mapObjects,routes:s.routes,period:worldState.periodEvents,history:worldState.pastEvents}));
 try{
 for(const item of list){
  const u=worldState.mapObjects?.find(u=>u.id===item.id),owner=item.owner||u?.owner;
  if(item.action==='create'&&item.type==='army'){const p=strategyLocationProvince(item.location);strategyAssert(p&&strategyControl(p)===owner,'Развёртывание только на контролируемой территории');}
  if((item.action==='create'&&item.type==='army')||(item.action==='update'&&u?.type==='army'&&item.troops!=null)){
   const used=worldState.mapObjects.filter(x=>x.type==='army'&&x.owner===owner&&x.id!==item.id).reduce((n,x)=>n+x.troops,0);
   strategyAssert(used+item.troops<=countries[owner].army,'Недостаточно свободных солдат для части');
  }
  if(item.action==='move'&&u?.type==='army'){
   const target=strategyLocationProvince(item.to);
   strategyAssert(target,'Неизвестное место назначения');changes.push(executeMilitaryOrder(u.owner,{action:'move',unit_id:u.id,province:target.id,stance:'attack'}));
  }else changes.push(...strategyOldMap([item]));
 }
 return changes;
 }catch(error){
  worldState.mapObjects=snapshot.objects;s.routes=snapshot.routes;worldState.periodEvents=snapshot.period;worldState.pastEvents=snapshot.history;
  renderMapObjects();throw error;
 }
};
function strategySyncOccupations(){
 const s=strategyState();worldState.mapObjects=worldState.mapObjects.filter(o=>!o.occupationMarker||s.occupations[o.province]);
 for(const [id,owner]of Object.entries(s.occupations)){const p=strategyProvince(id);if(!p)continue;const key='occupation:'+id;let marker=worldState.mapObjects.find(o=>o.id===key);
  if(!marker){marker={id:key,type:'hq',occupationMarker:true,province:id,location:p.name,troops:0};worldState.mapObjects.push(marker);}
  marker.owner=owner;marker.label='Военный контроль: '+(countries[owner]?.displayName||owner);
 }
}
const strategyOldTick=strategyTick;
strategyTick=function(){strategyOldTick();strategySyncOccupations();};
const strategyCanonical=canonicalEffects;
canonicalEffects=function(e){
 const out=strategyCanonical(e);
 if(out.diplomatic_action){const d=out.diplomatic_action;if(d.target)d.target=orderCountry(d.target);if(d.terms?.subject)d.terms.subject=orderCountry(d.terms.subject);if(d.terms?.payer)d.terms.payer=orderCountry(d.terms.payer);
  for(const list of [d.goal?.provinces,d.terms?.provinces])if(Array.isArray(list))for(let i=0;i<list.length;i++)list[i]=strategyProvince(list[i])?.id||list[i];
 }
 if(out.military_order?.province)out.military_order.province=strategyProvince(out.military_order.province)?.id||out.military_order.province;
 return out;
};
