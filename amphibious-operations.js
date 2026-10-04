/* A dated amphibious operation is one free-text mandate. Ships, soldiers, access,
   movement and combat use the existing executors; no model calls or extra map icons. */
'use strict';
function amphibiousDistributeSeed(m,owners=ALL_COUNTRIES){
 // Only initialization; saved player deployments are never redistributed.
 for(const owner of owners){
  const fleets=m.fleets.filter(f=>f.owner===owner);if(fleets.length!==1)continue;
  const f=fleets[0],ports=m.ports.filter(p=>maritimePortOwner(p)===owner).sort((a,b)=>b.shipyard-a.shipyard||b.level-a.level);
  const bases=[maritimePortWithoutInit(m,f.port)];
  for(const p of ports)if(bases.length<4&&bases.every(base=>base&&strategyDistance(base.coordinates,p.coordinates)>800))bases.push(p);
  if(bases.length<=1)continue;
  const ships={...f.ships};
  for(let i=0;i<bases.length;i++){
   const base=bases[i],split=Object.fromEntries(Object.entries(ships).map(([k,n])=>[k,Math.floor(n/bases.length)+(i<n%bases.length?1:0)]));
   if(!Object.values(split).some(n=>n>0))continue;
   const row=i===0?f:{...JSON.parse(JSON.stringify(f)),id:'fleet:'+owner+':base:'+base.id,cargo:[],path:[]};
   Object.assign(row,{ships:split,port:base.id,region:base.region,home:base.id,name:'Эскадра · '+base.name});
   if(i>0)m.fleets.push(row);
  }
 }
 m.seedDeploymentVersion=2;
}
const maritimePortWithoutInit=(m,id)=>m.ports.find(p=>p.id===id);
const amphibiousOldState=maritimeState;
maritimeState=function(){
 const m=amphibiousOldState();m.transports||=[];m.landingSites||=[];
 if(!m.seedDeploymentVersion){
  // Repair untouched initialization in old saves; never move player-issued deployments.
  const pristine=ALL_COUNTRIES.filter(owner=>{
   const fleets=m.fleets.filter(f=>f.owner===owner),f=fleets[0],seed=activeScenario?.countryProfiles?.[owner]?.navalSeed?.ships;
   return seed&&fleets.length===1&&f.id==='fleet:'+owner&&f.port===f.home&&f.mission==='hold'&&!f.commandedUntil&&!f.cargo.length&&
    !m.builds.some(b=>b.owner===owner)&&Object.keys(seed).every(k=>f.ships[k]===seed[k]);
  });
  amphibiousDistributeSeed(m,pristine);m.revision++;maritimeTradeCache=null;maritimePathCache.clear();
 }
 if(m.coastVersion!==2){
  const geo=maritimeGeo();
  for(const p of m.ports){
   const area=geo.areas[p.region];
   if(area?.kind==='strait'&&strategyDistance(p.coordinates,area.coordinates)>(area.coastRadiusKm||100)){
    const shore=(geo.coast[p.province]||[]).slice().sort((a,b)=>strategyDistance(a.coordinates,p.coordinates)-strategyDistance(b.coordinates,p.coordinates))[0];
    if(shore)p.region=shore.region;
   }
  }
  for(const f of m.fleets){const p=m.ports.find(p=>p.id===f.port);if(p)f.region=p.region;}
  m.coastVersion=2;
 }
 return m;
};
const amphibiousOldPort=maritimePort;
maritimePort=function(id){return amphibiousOldPort(id)||worldState.maritime?.landingSites?.find(p=>p.id===id);};
function amphibiousTarget(o,from){
 const named=maritimePort(o.port_id);
 if(named)return named;
 const p=strategyProvince(o.province),shores=p&&maritimeGeo().coast[p.id];
 if(!shores?.length)return null;
 const usable=shores.map(s=>({s,path:maritimeSeaPath(from.region,s.region,from.owner)})).filter(x=>x.path);
 const best=usable.sort((a,b)=>maritimeTravelDistance(a.path)+strategyDistance(from.coordinates||maritimeGeo().areas[from.region].coordinates,a.s.coordinates)-
  maritimeTravelDistance(b.path)-strategyDistance(from.coordinates||maritimeGeo().areas[from.region].coordinates,b.s.coordinates))[0];
 if(!best)return null;
 return {id:'shore:'+p.id+':'+best.s.region,province:p.id,name:'Побережье '+p.name,coordinates:best.s.coordinates,
  region:best.s.region,beach:true,level:0,shipyard:0,fort:0};
}
function amphibiousAvailable(owner){
 return Math.max(0,countries[owner].army-worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner).reduce((n,u)=>n+u.troops,0)-maritimeCargo(owner).reduce((n,u)=>n+u.troops,0));
}
function amphibiousValidate(o,owner){
 strategyCountry(owner);strategyKeys(o,['action','fleet_id','unit_id','troops','from_port_id','port_id','province','assault','name']);
 strategyAssert(o.action==='transport','Неверное поручение перевозки');
 const m=maritimeState(),source=maritimePort(o.from_port_id);
 strategyAssert(source&&!source.beach&&maritimeAccessiblePort(owner,source),'Для погрузки нужен собственный или разрешённый порт; выберите from_port_id из доступных гаваней');
 o.from_port_id=source.id;
 const active=m.transports.filter(t=>!['completed','failed','cancelled'].includes(t.status));
 let fleet=maritimeFleet(o.fleet_id);
 if(!o.fleet_id)fleet=m.fleets.filter(f=>f.owner===owner&&f.ships.transport>0&&!f.cargo.length&&!active.some(t=>t.fleet===f.id)&&maritimeSeaPath(f.region,source.region,owner))
  .sort((a,b)=>Number(b.port===source.id)-Number(a.port===source.id)||Number(b.region===source.region)-Number(a.region===source.region)||b.ships.transport-a.ships.transport)[0];
 strategyAssert(fleet?.owner===owner&&fleet.ships.transport>0,'В доступной акватории нет собственных транспортов; постройте их или обеспечьте проход существующей эскадры');
 strategyAssert(!fleet.cargo.length&&!active.some(t=>t.fleet===fleet.id),'Эскадра уже перевозит войска или выполняет перевозку');
 strategyAssert(maritimeSeaPath(fleet.region,source.region,owner),'Выбранная эскадра не может достичь порта погрузки: проверьте проливы и права прохода');
 o.fleet_id=fleet.id;
 const destination=amphibiousTarget(o,{...source,owner});
 strategyAssert(destination,'Цель должна быть морским побережьем или существующим портом с доступным маршрутом');
 if(o.port_id)o.port_id=destination.id;else o.province=destination.province;
 strategyAssert(maritimeSeaPath(source.region,destination.region,owner),'Морской путь закрыт в проливе или отсутствует в географии сценария');
 if(o.assault!=null)strategyAssert(typeof o.assault==='boolean','Неверный режим высадки');
 strategyAssert(maritimeAccessiblePort(owner,destination)||isAtWar(owner,maritimePortOwner(destination))||o.assault===true,'Для мирной высадки требуется право доступа; вторжение можно приказать явно');
 let unit=o.unit_id&&worldState.mapObjects.find(u=>u.id===o.unit_id&&u.type==='army'&&u.owner===owner);
 if(o.unit_id)strategyAssert(unit&&!active.some(t=>t.unit===unit.id),'Нет собственной свободной сухопутной части');
 if(unit)strategyAssert(strategyPath(owner,strategyUnitProvince(unit),source.province),'Часть не может добраться до порта погрузки: '+strategyRouteExplanation(owner,strategyUnitProvince(unit),source.province));
 const troops=o.troops??(unit?unit.troops:Math.min(5000,amphibiousAvailable(owner)));
 strategyNum(troops,1,1000000);strategyAssert(Number.isInteger(troops),'Численность десанта должна быть целой');
 strategyAssert(troops<=(unit?unit.troops:amphibiousAvailable(owner)),'Не хватает существующих солдат; перевозка не создаёт новую армию');
 o.troops=troops;if(o.name)strategyText(o.name,120);
 return {source,destination,fleet,unit,troops};
}
function amphibiousBegin(owner,o){
 const {source,destination,fleet,unit:existing,troops}=amphibiousValidate(o,owner),m=maritimeState();
 strategyAssert(m.transports.filter(t=>!['completed','failed','cancelled'].includes(t.status)).length<16,'Слишком много одновременных перевозок');
 let unit=existing;
 if(!unit){
  const id='transport-corps:'+crypto.randomUUID();executeMilitaryOrder(owner,{action:'deploy',unit_id:id,troops,province:source.province,stance:'defend'});
  unit=worldState.mapObjects.find(u=>u.id===id);unit.label=o.name||'Экспедиционный корпус';
 }
 if(destination.beach&&!m.landingSites.some(p=>p.id===destination.id))m.landingSites.push(destination);
 const t={id:crypto.randomUUID(),owner,fleet:fleet.id,unit:unit.id,from:source.id,to:destination.id,
  requested:troops,processed:0,delivered:0,losses:0,status:'assembling',start:gameDayNumber(),assault:o.assault===true,mandate:JSON.parse(JSON.stringify(o))};
 m.transports.push(t);unit.commandedUntil=gameDayNumber()+3650;
 strategyEvent(owner,'Военное ведомство готовит морскую переброску',
  troops+' существующих солдат назначены к перевозке из '+source.name+' к '+destination.name+'. Эскадра «'+fleet.name+'» доставит их'+(troops>fleet.ships.transport*1500?' несколькими рейсами':'')+'. Войска начнут погрузку после сбора в порту, а на чужом берегу их может встретить сопротивление.',[maritimePortOwner(destination)]);
 maritimeTouch();return t;
}
function amphibiousReceipt(t){
 if(['completed','failed','cancelled'].includes(t.status)){
  const unit=worldState.mapObjects.find(u=>u.id===t.unit);if(unit)unit.commandedUntil=gameDayNumber();
  const fleet=maritimeFleet(t.fleet);if(fleet)fleet.commandedUntil=gameDayNumber();
 }
 const task=t.taskId&&ensurePolitics().tasks.find(p=>p.id===t.taskId);
 if(task){task.status=['completed'].includes(t.status)?'executed':['failed','cancelled'].includes(t.status)?'failed':'in_progress';task.reason=t.reason||'Морская переброска продолжается';if(['executed','failed'].includes(task.status))task.finished=gameDayNumber();}
 const o=worldState.orders.find(o=>o.id===t.orderId);if(!o)return;
 const labels={assembling:'Сбор войск и эскадры в порту',loading:'Погрузка',sailing:'Морской переход и высадка',returning:'Возвращение за следующей партией',blocked:'Перевозка приостановлена',completed:'Перевозка завершена',failed:'Высадка сорвана',cancelled:'Перевозка отменена'};
 o.status=t.status==='completed'?'executed':['failed','cancelled'].includes(t.status)?'failed':'in_progress';
 o.reason=labels[t.status]+' · доставлено '+t.delivered+' из '+t.requested+(t.reason?' · '+t.reason:'');
 o.after=orderStatSnapshot(countries[t.owner]);o.resolvedTurn=turn;
}
const amphibiousOldValidation=validateNavalOrder;
validateNavalOrder=function(o,owner,execution=false){return o.action==='transport'?(amphibiousValidate(o,owner),o):amphibiousOldValidation(o,owner,execution);};
const amphibiousOldNaval=executeNavalOrder;
executeNavalOrder=function(owner,o){
 if(o.action==='transport'){const t=amphibiousBegin(owner,o);return 'Перевозка '+t.id+' организована; сбор, погрузка, переход и высадка выполняются по датам.';}
 const t=maritimeState().transports.find(t=>t.fleet===o.fleet_id&&!['completed','failed','cancelled'].includes(t.status));
 const result=amphibiousOldNaval(owner,o);
 if(t){t.status='cancelled';t.reason='Эскадре отдано новое распоряжение';amphibiousReceipt(t);}
 return result;
};
function amphibiousSail(t,f){
 const target=maritimePort(t.to),path=maritimeSeaPath(f.region,target.region,t.owner);
 if(!path){t.status='blocked';t.reason='Условия прохода изменились; корабли и войска сохраняются';return;}
 const source=maritimePort(t.from),speed=f.propulsion==='steam'?280:f.propulsion==='mixed'?230:190;
 Object.assign(f,{mission:'land',targetPort:target.id,destination:target.region,path:path.slice(1),port:null,progress:0,atDestination:false,
  approachDays:Math.max(1,Math.ceil((path.length===1?strategyDistance(source.coordinates,target.coordinates):strategyDistance(maritimeGeo().areas[target.region].coordinates,target.coordinates))/speed)),commandedUntil:gameDayNumber()+3650});
 t.status='sailing';delete t.reason;maritimeTouch();
}
const amphibiousOldLand=maritimeLandTroops;
maritimeLandTroops=function(f,p){
 const t=maritimeState().transports.find(t=>t.fleet===f.id&&t.status==='sailing'&&t.to===p.id);
 if(!t)return amphibiousOldLand(f,p);
 const control=maritimePortOwner(p);
 if(t.assault&&control!==t.owner&&!isAtWar(t.owner,control)&&f.cargo.some(u=>u.troops>0)){
  declareEngineWar(t.owner,control,{type:'defense'});
  const campaign=strategyState().campaigns.findLast(c=>c.status==='active'&&[c.a,c.b].includes(t.owner)&&[c.a,c.b].includes(control));
  if(campaign){campaign.formalDeclaration=false;campaign.cause='Вооружённая высадка без формального объявления';}
  strategyEvent(t.owner,'Десант вступает на чужое побережье',
   'Вооружённая высадка начинает боевые действия с '+control+'. Отсутствие предварительного объявления не делает её мирной перевозкой.',[control]);
 }
 const result=amphibiousOldLand(f,p),landed=worldState.mapObjects.find(u=>u.id===t.wave);
 const survivor=landed?.troops||f.cargo.find(u=>u.id===t.wave)?.troops||0;
 t.delivered+=landed?.troops||0;t.losses+=Math.max(0,t.waveTroops-survivor);t.processed+=t.waveTroops;
 if(!result){t.status='failed';t.reason='Береговая оборона отбила десант; уцелевшие войска отходят на транспортах';}
 else if(t.processed>=t.requested){t.status='completed';t.reason='Все назначенные рейсы завершены'+(t.losses?'; потери '+t.losses+' солдат':'');}
 else t.status='returning';
 amphibiousReceipt(t);return result;
};
function amphibiousBlock(t,reason){
 if(t.status!=='blocked'||t.reason!==reason)strategyEvent(t.owner,'Морская операция встретила препятствие',reason+'. Военное ведомство сохраняет приказ и находящиеся в его распоряжении силы.');
 t.status='blocked';t.reason=reason;amphibiousReceipt(t);
}
function amphibiousTick(){
 const m=maritimeState(),now=gameDayNumber();
 for(const t of m.transports){
  const f=maritimeFleet(t.fleet),source=maritimePort(t.from),target=maritimePort(t.to);
  if(['completed','cancelled'].includes(t.status))continue;
  if(t.status==='failed'){
   if(f?.port&&maritimeAccessiblePort(t.owner,maritimePort(f.port))&&f.cargo.length)amphibiousOldLand(f,maritimePort(f.port));
   continue;
  }
  if(!f||!maritimeShips(f)){t.status='failed';t.reason='Эскадра утрачена';amphibiousReceipt(t);continue;}
  if(!source||!maritimeAccessiblePort(t.owner,source)){amphibiousBlock(t,'Порт погрузки больше не доступен');continue;}
  if(!target){amphibiousBlock(t,'Цель больше не существует в сценарии');continue;}
  if(t.status==='blocked'){
   if(!maritimeSeaPath(f.region,source.region,t.owner)||!maritimeSeaPath(source.region,target.region,t.owner))continue;
   t.status=f.cargo.some(u=>u.id===t.wave)?'sailing':'assembling';delete t.reason;
   if(t.status==='sailing'){amphibiousSail(t,f);continue;}
  }
  const unit=worldState.mapObjects.find(u=>u.id===t.unit);
  if(t.status==='assembling'){
   if(!unit||unit.troops<t.requested-t.processed){amphibiousBlock(t,'Назначенный корпус понёс потери или недоступен; требуется уточнить численность');continue;}
   unit.commandedUntil=now+3650;
   if(strategyUnitProvince(unit)!==source.province){
    if(!strategyState().routes.some(r=>r.unit===unit.id)){
     try{executeMilitaryOrder(t.owner,{action:'move',unit_id:unit.id,province:source.province,stance:'defend'});}catch(error){amphibiousBlock(t,error.message);}
    }
    continue;
   }
   if(f.port!==source.id){
    if(f.mission==='move'&&f.targetPort===source.id)continue;
    try{amphibiousOldNaval(t.owner,{action:'move',fleet_id:f.id,port_id:source.id});}catch(error){amphibiousBlock(t,error.message);}
    continue;
   }
   const capacity=f.ships.transport*1500-f.cargo.reduce((n,u)=>n+u.troops,0);
   if(capacity<=0){amphibiousBlock(t,'Не осталось свободной транспортной вместимости');continue;}
   t.waveTroops=Math.min(capacity,t.requested-t.processed);t.loadDay=now+Math.max(1,Math.ceil(t.waveTroops/10000));t.status='loading';
  }
  if(t.status==='loading'&&now>=t.loadDay){
   if(f.port!==source.id||!unit||unit.troops<t.waveTroops){t.status='assembling';continue;}
   const cap=f.ships.transport*1500-f.cargo.reduce((n,u)=>n+u.troops,0);t.waveTroops=Math.min(t.waveTroops,cap);
   if(t.waveTroops<=0){amphibiousBlock(t,'Транспорты не готовы к погрузке');continue;}
   t.wave='landing-wave:'+crypto.randomUUID();const loaded={...unit,id:t.wave,troops:t.waveTroops,label:unit.label,transportOperation:t.id};
   unit.troops-=t.waveTroops;if(unit.troops<=0)worldState.mapObjects=worldState.mapObjects.filter(u=>u!==unit);
   f.cargo.push(loaded);amphibiousSail(t,f);
   strategyEvent(t.owner,'Экспедиционный корпус вышел в море',
    t.waveTroops+' солдат покинули '+source.name+' на транспортах. Эскадра направляется к '+target.name+'. Судьба операции теперь зависит от перехода, снабжения и обстановки на берегу.',[maritimePortOwner(target)]);
  }
  if(t.status==='sailing'){
   if(!f.cargo.some(u=>u.id===t.wave)&&!worldState.mapObjects.some(u=>u.id===t.wave)){
    t.status='failed';t.losses+=t.waveTroops;t.reason='Перевозимые войска утрачены';amphibiousReceipt(t);continue;
   }
   if(['repair','hold'].includes(f.mission)&&!f.atDestination){amphibiousBlock(t,'Эскадра прервала переход из-за боя, снабжения или закрытия маршрута');continue;}
  }
  if(t.status==='returning'){
   if(f.port!==source.id){
    if(f.mission!=='move'||f.targetPort!==source.id)try{amphibiousOldNaval(t.owner,{action:'move',fleet_id:f.id,port_id:source.id});}catch(error){amphibiousBlock(t,error.message);}
   }else t.status='assembling';
  }
  amphibiousReceipt(t);
 }
}
const amphibiousOldTick=maritimeTick;
maritimeTick=function(){amphibiousOldTick();amphibiousTick();};
const amphibiousOldEffects=executeOrderEffects;
executeOrderEffects=function(e){if(e.naval_order?.action==='transport'){const t=amphibiousBegin(playerCountry,e.naval_order);return {status:'in_progress',reason:'Морская переброска организована',transport:t.id};}return amphibiousOldEffects(e);};
const amphibiousOldCountry=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,e){if(e.naval_order?.action==='transport'){
 const ctx=orderContext();ctx.player=owner;const checked=OrderRules.validateEffects(JSON.parse(JSON.stringify(e)),ctx,'order',kind);
 const t=amphibiousBegin(owner,checked.naval_order);return {status:'in_progress',reason:'Морская переброска организована',transport:t.id};
 }return amphibiousOldCountry(owner,kind,e);};
const amphibiousOldPlan=applyOrderPlan;
applyOrderPlan=function(plan){
 const prior=new Set(maritimeState().transports.map(t=>t.id)),results=amphibiousOldPlan(plan);
 for(const o of results)if(o.status==='executed'){
  const orders=o.effects?.naval_order?[o.effects.naval_order]:(o.effects?.operations||[]).map(x=>x.effects?.naval_order).filter(Boolean);
  for(const n of orders.filter(n=>n.action==='transport')){
   const t=maritimeState().transports.find(t=>!prior.has(t.id)&&!t.orderId&&t.owner===playerCountry&&(!n.fleet_id||t.fleet===n.fleet_id));
   if(t){t.orderId=o.id;o.transportId=t.id;o.status='in_progress';amphibiousReceipt(t);for(const e of worldState.periodEvents)if(e.actors?.[0]===t.owner&&/морск|Экспедиционный корпус/.test(e.headline))e.sourceOrder||=o.id;}
  }
 }
 return results;
};
const amphibiousOldFinishTask=finishPoliticalTask;
finishPoliticalTask=function(task){
 const prior=new Set(maritimeState().transports.map(t=>t.id));
 amphibiousOldFinishTask(task);
 const t=maritimeState().transports.find(t=>!prior.has(t.id)&&t.owner===task.country&&!t.taskId);
 if(t){t.taskId=task.id;t.orderId=task.source||null;const o=worldState.orders.find(o=>o.id===t.orderId);if(o){o.transportId=t.id;o.effects=JSON.parse(JSON.stringify(task.effects||{}));}amphibiousReceipt(t);}
};
const amphibiousOldProgress=livingOrderProgress;
livingOrderProgress=function(o){
 const t=worldState.maritime?.transports?.find(t=>t.id===o.transportId);
 return t?{type:'Морская переброска',status:({assembling:'Сбор в порту',loading:'Погрузка',sailing:'Переход и высадка',returning:'Следующий рейс',blocked:'Приостановлена',completed:'Завершена',failed:'Сорвана',cancelled:'Отменена'})[t.status],
  requested:t.requested,delivered:t.delivered,losses:t.losses,reason:t.reason||null}:amphibiousOldProgress(o);
};
function amphibiousCoasts(ids){
 return scenarioProvinces.filter(p=>ids.includes(strategyOwner(p))&&maritimeGeo().coast[p.id]?.length)
  .map(p=>{const shore=maritimeGeo().coast[p.id][0];return {province:p.id,owner:strategyOwner(p),name:p.name,coordinates:shore.coordinates,sea:shore.region};});
}
const amphibiousOldPlanning=orderPlanningContext;
orderPlanningContext=function(...args){
 const c=amphibiousOldPlanning(...args),ids=[...new Set([playerCountry,...(c.countries||[]).map(x=>x.facts?.id).filter(Boolean)])];
 c.landingCoasts=amphibiousCoasts(ids);c.availableSeaResources.availableTroops=amphibiousAvailable(playerCountry);
 c.availableSeaResources.transports=maritimeState().transports.filter(t=>t.owner===playerCountry&&!['completed','failed','cancelled'].includes(t.status));
 return c;
};
const amphibiousOldPolicyContext=policyContext;
policyContext=function(...args){const c=amphibiousOldPolicyContext(...args);c.landingCoasts=amphibiousCoasts([...(args[0]||[]),...(c.countries||[]).map(x=>x.id).filter(Boolean)]);return c;};
const amphibiousOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&(prompt.includes('Свободные приказы:')||prompt.startsWith('POLITICAL_CABINETS_V1'))){
  prompt+='\nМОРСКОЕ ПОРУЧЕНИЕ ЦЕЛИКОМ. Для доставки или высадки армии используй kind:naval effects:{naval_order:{action:"transport",from_port_id:"порт погрузки",province:"ID побережья из landingCoasts" ИЛИ port_id:"порт назначения",troops:назначенные существующие солдаты,unit_id:"необязательная собственная существующая часть",fleet_id:"необязательная доступная эскадра",assault:true только при приказе вторжения на чужой берег}}. Исполнитель сам собирает войска и флот, грузит, перевозит и высаживает по датам. Не требуй сухопутного пути через море, не превращай десант в сухопутный марш и не отвергай берег из-за отсутствия порта. По coordinates в landingCoasts соотнеси обычное географическое название с провинцией сценария; в 1852 область может принадлежать другой державе, а не быть отдельной страной. troops свыше вместимости одной эскадры доставляются несколькими рейсами из существующих солдат, не создаются. fleet_id можно не задавать: выбирается доступный флот. Если реальных транспортов или прохода нет, объясни точную физическую проблему и доступные варианты. Для подготовки без вторжения political_task задаёт организационную цель; не начинай войну вместо подготовки. Старые embark/land нужны только для отдельных явно запрошенных этапов. Порядок составного учреждения парламента: сначала power parliament.restore, затем выборы/ценз; restore и election допускаются вместе. term_years:1 — ежегодные выборы, electorate:["noble"] — только землевладельцы, factions допустимы при создании палаты. Назначенный начальный состав можно определить; будущие результаты голосования не гарантируй.';
 }
 return amphibiousOldAsk(prompt,...args);
};
window.AMPHIBIOUS_OPERATIONS=true;
