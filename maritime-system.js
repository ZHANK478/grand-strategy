/* Maritime simulation: ports on land, sea areas as a graph, fleets and delivered trade.
   No provider calls: orders and NPC policies use the existing model request. */
'use strict';
let maritimeGeographyCache=null,maritimeTradeCache=null,maritimePathCache=new Map(),maritimeLandCache=null,maritimeInitializing=false,maritimeSettlement=null;
const seaClamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function maritimeState(){
 const m=worldState.maritime||={version:1,ports:[],fleets:[],builds:[],tradePolicies:{},revision:0,lastTick:null};
 if(!m.initialized)maritimeInitialize(m);
 return m;
}
function maritimeTouch(){const m=maritimeState();m.revision++;maritimeTradeCache=null;maritimePathCache.clear();}
function maritimeGeo(){
 if(maritimeGeographyCache?.source===scenarioProvinces&&maritimeGeographyCache.config===activeScenario?.maritime&&maritimeGeographyCache.first===scenarioProvinces[0]&&maritimeGeographyCache.provinces.size===scenarioProvinces.length)return maritimeGeographyCache;
 const config=activeScenario?.maritime||{},regions=config.regions||MARITIME_REGIONS,links=config.links||MARITIME_LINKS;
 const areas=Object.fromEntries(regions.map(r=>[r.id,r])),graph=Object.fromEntries(regions.map(r=>[r.id,[]])),edges=new Map(),coast={};
 for(const [a,b]of links)if(areas[a]&&areas[b]){graph[a].push(b);graph[b].push(a);}
 const rings=p=>p.geometry?.type==='Polygon'?[p.geometry.coordinates[0]]:(p.geometry?.coordinates||[]).map(poly=>poly[0]);
 for(const p of scenarioProvinces)for(const ring of rings(p))for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],ka=a.map(n=>n.toFixed(3)).join(','),kb=b.map(n=>n.toFixed(3)).join(',');
  const key=[ka,kb].sort().join('|');if(!edges.has(key))edges.set(key,[]);edges.get(key).push({province:p.id,a,b});
 }
 maritimeGeographyCache={source:scenarioProvinces,config:activeScenario?.maritime,first:scenarioProvinces[0],areas,graph,coast,provinces:new Map(scenarioProvinces.map(p=>[p.id,p]))};
 for(const entries of edges.values()){
  if(entries.length!==1)continue;const e=entries[0],q=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2];
  if(Math.abs(q[1])>78||Math.abs(e.a[0]-e.b[0])>180)continue;
  let nearest=null,least=Infinity;const scale=Math.cos(q[1]*Math.PI/180);for(const r of regions){const dx=((r.coordinates[0]-q[0]+540)%360-180)*scale,dy=r.coordinates[1]-q[1],d=dx*dx+dy*dy;if(d<least){least=d;nearest=r;}}
  if(!nearest||strategyDistance(q,nearest.coordinates)>1100)continue;
  const vec=[nearest.coordinates[0]-q[0],nearest.coordinates[1]-q[1]],length=Math.hypot(...vec)||1;
  const offshore=[q[0]+vec[0]/length*.15,q[1]+vec[1]/length*.15];
  if(maritimeLand(offshore))continue;
  coast[e.province]||=[];coast[e.province].push({coordinates:q,region:nearest.id});
 }
 return maritimeGeographyCache;
}
function maritimeLand(q){
 if(maritimeLandCache?.source!==scenarioProvinces||maritimeLandCache.first!==scenarioProvinces[0]||maritimeLandCache.entries.length!==scenarioProvinces.length)maritimeLandCache={source:scenarioProvinces,first:scenarioProvinces[0],entries:scenarioProvinces.map(p=>{const points=p.geometry?.type==='Polygon'?p.geometry.coordinates.flat():p.geometry?.coordinates.flat(2)||[];return {p,box:[Math.min(...points.map(x=>x[0])),Math.min(...points.map(x=>x[1])),Math.max(...points.map(x=>x[0])),Math.max(...points.map(x=>x[1]))]};})};
 const ringInside=r=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 return maritimeLandCache.entries.find(({p,box:b})=>{if(q[0]<b[0]||q[0]>b[2]||q[1]<b[1]||q[1]>b[3])return false;const polys=p.geometry?.type==='Polygon'?[p.geometry.coordinates]:p.geometry?.coordinates||[];return polys.some(r=>ringInside(r[0])&&!r.slice(1).some(ringInside));})?.p;
}
function maritimeInitialize(m){
 m.initialized=true;m.ports||=[];m.fleets||=[];m.builds||=[];m.tradePolicies||={};m.revision||=0;
 const geo=maritimeGeo(),config=activeScenario?.maritime||{};
 const templates=config.ports||MARITIME_PORTS;
 for(const template of templates){
  let p=template.province?strategyProvince(template.province):maritimeLand(template.coordinates);
  if(!p&&!config.ports){
   const candidates=scenarioProvinces.filter(x=>geo.coast[x.id]?.length).map(x=>({p:x,d:Math.min(...geo.coast[x.id].map(e=>strategyDistance(e.coordinates,template.coordinates)))})).sort((a,b)=>a.d-b.d);
   if(candidates[0]?.d<=100)p=candidates[0].p;
  }
  if(!p||!geo.areas[template.region]||!countries[strategyOwner(p)])continue;
  if(!config.ports&&!geo.coast[p.id]?.length)continue;
  m.ports.push({id:template.id||'port:'+p.id+':'+m.ports.length,province:p.id,name:template.name,coordinates:template.coordinates,region:template.region,
   level:seaClamp(template.level||1,1,5),shipyard:seaClamp(template.shipyard||0,0,3),fort:seaClamp(template.fort??(['bosporus','gibraltar'].includes(template.region)?2:1),0,5)});
 }
 // Any coastal scenario country has a usable modest harbour; no invented inland ports.
 for(const owner of ALL_COUNTRIES){
  if(!countries[owner]||countries[owner].annexed)continue;
  const existing=m.ports.filter(p=>maritimePortOwner(p)===owner);
  if(!existing.length){
   const candidate=scenarioProvinces.filter(p=>strategyOwner(p)===owner&&geo.coast[p.id]?.length).sort((a,b)=>(provinceEcon[b.id]?.gdp||0)-(provinceEcon[a.id]?.gdp||0))[0];
   if(candidate){const e=geo.coast[candidate.id][0];m.ports.push({id:'port:'+candidate.id,province:candidate.id,name:'Порт '+candidate.name,coordinates:e.coordinates,region:e.region,level:1,shipyard:1,fort:0});}
  }
  const ports=m.ports.filter(p=>maritimePortOwner(p)===owner);if(!ports.length)continue;
  const seed=activeScenario?.countryProfiles?.[owner]?.navalSeed;
  const c=countries[owner],size=Math.max(0,Math.min(20,Math.floor((c.gdp||0)/5000)));
  const ships=seed?.ships||{heavy:Math.floor(size*.6),light:size+2,transport:Math.max(1,Math.floor(size*.8))};
  const base=ports.slice().sort((a,b)=>b.shipyard-a.shipyard||b.level-a.level)[0];
  if(Object.values(ships).some(n=>n>0))m.fleets.push({id:'fleet:'+owner,owner,name:'Основная эскадра',ships:{heavy:Math.max(0,Math.floor(ships.heavy||0)),light:Math.max(0,Math.floor(ships.light||0)),transport:Math.max(0,Math.floor(ships.transport||0))},
   port:base.id,region:base.region,home:base.id,condition:100,morale:70,supply:100,propulsion:seed?.propulsion||(year>=1807?'mixed':'sail'),mission:'hold',cargo:[],path:[],progress:0});
 }
 maritimeTradeCache=null;maritimePathCache.clear();
}
function maritimePort(id){const m=maritimeState();return m.ports.find(p=>p.id===id||p.name===id);}
function maritimePortOwner(p){const province=maritimeGeo().provinces.get(p.province);return province?strategyControl(province):null;}
function maritimeFleet(id){return maritimeState().fleets.find(f=>f.id===id);}
function maritimeCrew(owner){return maritimeState().fleets.filter(f=>f.owner===owner).reduce((s,f)=>s+Object.entries(f.ships).reduce((n,[k,count])=>n+count*MARITIME_SHIPS[k].crew,0),0);}
function maritimeShips(f){return Object.values(f.ships).reduce((a,b)=>a+b,0);}
function maritimeWeather(region){const lat=maritimeGeo().areas[region]?.coordinates[1]||0,season=(month+(lat<0?6:0))%12;return Math.abs(lat)>35&&[11,0,1].includes(season)?.8:1;}
function maritimePower(f){return Object.entries(f.ships).reduce((s,[k,n])=>s+n*MARITIME_SHIPS[k].power,0)*(f.condition/100)*(.4+f.morale/100)*(.3+f.supply/100)*maritimeWeather(f.region);}
function maritimeCargo(owner){return maritimeState().fleets.filter(f=>f.owner===owner).flatMap(f=>f.cargo||[]);}
function maritimeAccessiblePort(owner,p){if(!p)return false;return maritimePortOwner(p)===owner||strategyState().contracts.some(c=>c.status==='active'&&c.terms.access&&[c.a,c.b].includes(owner)&&[c.a,c.b].includes(maritimePortOwner(p)));}
function maritimeSeaPath(from,to,owner=null){
 const geo=maritimeGeo();if(!geo.areas[from]||!geo.areas[to])return null;if(from===to)return [from];
 const key=[from,to,owner,gameDayNumber(),maritimeState().revision].join('|');if(maritimePathCache.has(key))return maritimePathCache.get(key);
 const dist={[from]:0},prev={},open=new Set(Object.keys(geo.areas));
 while(open.size){
  const a=[...open].filter(x=>dist[x]!=null).sort((a,b)=>dist[a]-dist[b])[0];if(!a)break;open.delete(a);if(a===to)break;
  for(const next of geo.graph[a]){
   // A fortified hostile strait is closed in war, not every neutral sea.
   if(owner&&['bosporus','gibraltar'].includes(next)&&maritimeState().ports.some(p=>p.region===next&&p.fort>=2&&isAtWar(owner,maritimePortOwner(p))))continue;
   const d=dist[a]+Math.max(20,strategyDistance(geo.areas[a].coordinates,geo.areas[next].coordinates));
   if(dist[next]==null||d<dist[next]){dist[next]=d;prev[next]=a;}
  }
 }
 if(dist[to]==null){maritimePathCache.set(key,null);return null;}
 const path=[to];while(path[0]!==from)path.unshift(prev[path[0]]);maritimePathCache.set(key,path);return path;
}
function maritimeTravelDistance(path){const a=maritimeGeo().areas;return path.slice(1).reduce((s,x,i)=>s+strategyDistance(a[path[i]].coordinates,a[x].coordinates),0);}
function maritimeMoney(owner,cost){strategyAssert(countries[owner].treasury>=cost,'Недостаточно казны: требуется '+economyFmt(cost)+' млн р.е.');countries[owner].treasury-=cost;}
function validateNavalOrder(o,owner,execution=false){
 strategyCountry(owner);strategyKeys(o,['action','fleet_id','name','port_id','region','ship_type','count','propulsion','unit_id','level','shipyard','province']);
 strategyAssert(['move','patrol','escort','blockade','hold','repair','embark','land','build','split','build_port','upgrade_port'].includes(o.action),'Неизвестная морская задача');
 const m=maritimeState(),geo=maritimeGeo(),f=maritimeFleet(o.fleet_id),p=maritimePort(o.port_id);
 if(o.action==='build_port'){
  const land=strategyProvince(o.province);strategyAssert(land&&strategyControl(land)===owner&&geo.coast[land.id]?.length,'Порт требует контролируемого морского побережья');
  if(o.name)strategyText(o.name,120);if(o.level!=null){strategyNum(o.level,1,5);strategyAssert(Number.isInteger(o.level),'Уровень гавани должен быть целым');}if(o.shipyard!=null){strategyNum(o.shipyard,0,3);strategyAssert(Number.isInteger(o.shipyard),'Уровень верфи должен быть целым');}return o;
 }
 if(['build','upgrade_port'].includes(o.action)){
  strategyAssert(p&&maritimePortOwner(p)===owner,'Нужен собственный порт');
  if(o.action==='build'){strategyAssert(Object.hasOwn(MARITIME_SHIPS,o.ship_type),'Неизвестный класс корабля');strategyAssert(p.shipyard>0,'В этом порту нет верфи');strategyNum(o.count,1,100);strategyAssert(Number.isInteger(o.count),'Нужен целый заказ');
   const reserved=m.builds.filter(x=>x.status==='active'&&x.owner===owner&&x.type==='ship').reduce((s,x)=>s+x.count*MARITIME_SHIPS[x.shipType].crew,0);strategyAssert(maritimeCrew(owner)+reserved+o.count*MARITIME_SHIPS[o.ship_type].crew<=countries[owner].population*1000*(countries[owner].econV3?.workforceShare||.43)*.03,'Для новых экипажей недостаточно доступного населения');
   if(o.propulsion!=null){strategyAssert(['sail','mixed','steam'].includes(o.propulsion),'Неизвестный тип хода');strategyAssert(o.propulsion!=='steam'||year>=1807,'Паровая технология ещё недоступна');}}
  else {if(o.level!=null)strategyNum(o.level,1,5);if(o.shipyard!=null)strategyNum(o.shipyard,0,3);strategyAssert(o.level!=null||o.shipyard!=null,'Укажите развитие гавани или верфи');}
  return o;
 }
 strategyAssert(f&&f.owner===owner&&maritimeShips(f)>0,'Нет собственной действующей флотилии');
 if(o.action==='split'){strategyText(o.name,120);strategyAssert(Object.hasOwn(MARITIME_SHIPS,o.ship_type),'Укажите класс');strategyNum(o.count,1,f.ships[o.ship_type]);strategyAssert(Number.isInteger(o.count),'Нужно целое число кораблей');strategyAssert(!f.cargo.length&&f.port&&maritimePortOwner(maritimePort(f.port))===owner,'Разделение флотилии только в собственном порту без десанта');return o;}
 if(o.action==='embark'){
  const u=worldState.mapObjects.find(u=>u.id===o.unit_id&&u.owner===owner&&u.type==='army');
  strategyAssert(u&&p&&f.port===p.id&&maritimeAccessiblePort(owner,p)&&strategyUnitProvince(u)===p.province,'Войска и флот должны находиться в одном доступном порту');
  strategyAssert(!m.fleets.some(x=>x.cargo.some(c=>c.id===u.id)),'Часть уже погружена');
  strategyAssert(f.cargo.reduce((s,u)=>s+u.troops,0)+u.troops<=f.ships.transport*MARITIME_SHIPS.transport.capacity,'Не хватает транспортов: вместимость '+f.ships.transport*1500+' солдат');return o;
 }
 if(['move','land','blockade','repair'].includes(o.action))strategyAssert(p,'Укажите действующий порт');
 if(o.action==='land')strategyAssert(f.cargo.length&&p&&(maritimeAccessiblePort(owner,p)||isAtWar(owner,maritimePortOwner(p))),'Высадка требует войск и доступного или вражеского берега');
 if(o.action==='blockade')strategyAssert(p&&isAtWar(owner,maritimePortOwner(p))&&f.ships.heavy+f.ships.light>0,'Блокада требует войны с владельцем порта');
 if(['repair','move'].includes(o.action))strategyAssert(maritimeAccessiblePort(owner,p),'Нет права базироваться в этом порту; море доступно через patrol/escort');
 if(o.region)strategyAssert(geo.areas[o.region],'Неизвестный морской район');
 if(['patrol','escort'].includes(o.action))strategyAssert(o.region||p,'Нужен морской район или порт');
 const to=p?.region||o.region;
 if(to)strategyAssert(maritimeSeaPath(f.region,to,owner),'Нет доступного морского маршрута');
 if(execution&&o.action!=='hold')strategyAssert(f.supply>=10&&f.condition>=15,'Флоту нужен ремонт или снабжение');
 return o;
}
function executeNavalOrder(owner,o){
 validateNavalOrder(o,owner,true);const m=maritimeState(),now=gameDayNumber();let f=maritimeFleet(o.fleet_id);const p=maritimePort(o.port_id);
 if(o.action==='build'||o.action==='upgrade_port'||o.action==='build_port'){
  let cost,days;
  if(o.action==='build'){cost=MARITIME_SHIPS[o.ship_type].cost*o.count*(o.propulsion==='steam'?1.3:1);days=Math.ceil(MARITIME_SHIPS[o.ship_type].days/Math.max(1,p.shipyard)*Math.ceil(o.count/(p.shipyard*4)));
   strategyAssert(m.builds.filter(x=>x.status==='active'&&x.port===p.id&&x.type==='ship').length<2,'Верфь занята двумя заказами');}
  else {cost=o.action==='build_port'?40+(o.shipyard||0)*30:Math.max(0,(o.level||p.level)-p.level)*30+Math.max(0,(o.shipyard??p.shipyard)-p.shipyard)*40;days=o.action==='build_port'?365:180;
   strategyAssert(cost>0,'Улучшение должно увеличивать вместимость или уровень верфи');
   if(o.action==='build_port')strategyAssert(!m.ports.some(x=>x.province===o.province)&&!m.builds.some(x=>x.province===o.province&&x.status==='active'),'Порт в этой провинции уже есть');
   else strategyAssert(!m.builds.some(x=>x.status==='active'&&x.port===p.id&&x.type==='upgrade_port'),'Развитие этого порта уже идёт');}
  maritimeMoney(owner,cost);
  m.builds.push({id:crypto.randomUUID(),owner,type:o.action==='build'?'ship':o.action,port:p?.id,province:o.province,name:o.name,shipType:o.ship_type,count:o.count,propulsion:o.propulsion||'mixed',level:o.level,shipyard:o.shipyard,cost,start:now,due:now+days,status:'active'});
  strategyEvent(owner,'Начались работы на морской инфраструктуре',o.action==='build'?'Верфь '+p.name+' получила заказ на '+o.count+' кораблей. На постройку выделены средства; готовые суда поступят через '+days+' дней.':'Правительство финансирует портовые работы. Гавань и верфь расширят возможности после завершения строительства.');
  maritimeTouch();return 'Морской заказ финансирован; срок '+days+' дней, стоимость '+economyFmt(cost)+' млн р.е.';
 }
 if(o.action==='split'){
  f.ships[o.ship_type]-=o.count;const ships={heavy:0,light:0,transport:0};ships[o.ship_type]=o.count;
  const id=crypto.randomUUID();m.fleets.push({...JSON.parse(JSON.stringify(f)),id,name:o.name,ships,cargo:[],path:[],mission:'hold'});
  strategyEvent(owner,'Выделена новая флотилия',o.name+' получила '+o.count+' существующих кораблей. Общая численность флота не изменилась.');maritimeTouch();return 'Флотилия '+id+' сформирована из существующих кораблей.';
 }
 if(o.action==='embark'){
  const u=worldState.mapObjects.find(x=>x.id===o.unit_id);f.cargo.push(JSON.parse(JSON.stringify(u)));
  worldState.mapObjects=worldState.mapObjects.filter(x=>x!==u);strategyState().routes=strategyState().routes.filter(r=>r.unit!==u.id);
  strategyEvent(owner,'Началась морская переброска',u.troops+' солдат '+u.label+' погружены в порту '+p.name+'. Они остаются частью национальной армии, но больше не защищают берег.',[]);maritimeTouch();return 'Войска погружены; назначьте порт высадки.';
 }
 f.path=[];f.progress=0;f.mission=o.action;f.targetPort=p?.id||null;f.destination=p?.region||o.region||f.region;f.commandedUntil=now+30;
 if(o.action!=='hold'&&o.action!=='embark'){
  const path=maritimeSeaPath(f.region,f.destination,owner);f.path=path.slice(1);f.port=null;
  const distance=maritimeTravelDistance(path),speed=f.propulsion==='steam'?280:f.propulsion==='mixed'?230:190;
  f.approachDays=Math.max(1,Math.ceil(strategyDistance(maritimeGeo().areas[f.destination].coordinates,p?.coordinates||maritimeGeo().areas[f.destination].coordinates)/speed));
  f.atDestination=false;strategyEvent(owner,'Флот получил новую задачу',f.name+': '+({blockade:'блокировать порт',land:'доставить и высадить войска',repair:'вернуться для ремонта',move:'перейти в порт',patrol:'патрулировать район',escort:'сопровождать торговые суда'})[o.action]+' '+(p?.name||maritimeGeo().areas[f.destination].name)+'. Переход займёт примерно '+Math.ceil(distance/speed+f.approachDays)+' дней.',p?[maritimePortOwner(p)]:[]);
 }else {f.atDestination=true;}
 maritimeTouch();return 'Морская задача принята; движение и результат определяет движок.';
}
function maritimeBlockade(p){
 const fleets=maritimeState().fleets.filter(f=>f.mission==='blockade'&&f.atDestination&&f.targetPort===p.id&&f.region===p.region&&isAtWar(f.owner,maritimePortOwner(p)));
 const power=fleets.reduce((s,f)=>s+maritimePower(f),0);
 const defence=p.level*4+p.fort*5+maritimeState().fleets.filter(f=>f.owner===maritimePortOwner(p)&&f.region===p.region&&f.mission!=='hold').reduce((s,f)=>s+maritimePower(f),0);
 return power?seaClamp(power/(power+defence),0,.95):0;
}
function maritimeDropCargo(f,fraction){
 for(const u of f.cargo){const loss=Math.min(u.troops,Math.ceil(u.troops*fraction));u.troops-=loss;changeCountryStat(f.owner,'army',-loss);}
 f.cargo=f.cargo.filter(u=>u.troops>0);
}
function maritimeDamage(f,fraction){
 const oldTrans=f.ships.transport;let lost=0;
 for(const k of Object.keys(f.ships)){const n=Math.min(f.ships[k],Math.max(0,Math.floor(f.ships[k]*fraction+(Math.random()<fraction?1:0))));f.ships[k]-=n;lost+=n;}
 f.condition=seaClamp(f.condition-fraction*70,0,100);f.morale=seaClamp(f.morale-fraction*35,0,100);
 if(oldTrans>f.ships.transport)maritimeDropCargo(f,(oldTrans-f.ships.transport)/oldTrans);
 // Sinking transports can never leave over-capacity passengers alive on a missing ship.
 const load=f.cargo.reduce((s,u)=>s+u.troops,0),cap=f.ships.transport*1500;if(load>cap)maritimeDropCargo(f,1-cap/load);
 return lost;
}
function maritimeRetreat(f){
 const port=maritimeState().ports.filter(p=>maritimeAccessiblePort(f.owner,p)).map(p=>({p,path:maritimeSeaPath(f.region,p.region,f.owner)})).filter(x=>x.path).sort((a,b)=>maritimeTravelDistance(a.path)-maritimeTravelDistance(b.path))[0];
 f.mission='repair';f.targetPort=port?.p.id||null;f.path=port?.path.slice(1)||[];f.approachDays=2;f.atDestination=false;f.port=null;f.cooldown=gameDayNumber()+7;
}
function maritimeBattle(a,b){
 if(!isAtWar(a.owner,b.owner)||a.region!==b.region||a.cooldown>gameDayNumber()||b.cooldown>gameDayNumber())return;
 const detection=seaClamp(.15+(a.ships.light+b.ships.light)*.015,.15,.85);if(Math.random()>detection)return;
 const weaker=maritimePower(a)<maritimePower(b)?a:b,stronger=weaker===a?b:a;
 if(maritimePower(weaker)<maritimePower(stronger)*.6&&!['patrol','blockade'].includes(weaker.mission)&&Math.random()<.6){maritimeRetreat(weaker);strategyEvent(weaker.owner,'Флот избежал сражения',weaker.name+' обнаружила превосходящие силы и отходит к базе, сохраняя корабли и перевозимые войска.',[stronger.owner]);maritimeTouch();return;}
 const pa=maritimePower(a)*(0.85+Math.random()*.3),pb=maritimePower(b)*(0.85+Math.random()*.3);
 const winner=pa>=pb?a:b,loser=pa>=pb?b:a,wl=maritimeDamage(winner,.06+Math.random()*.08),ll=maritimeDamage(loser,.18+Math.random()*.15);
 let captured='';if(Math.random()<.15){const type=['light','heavy'].find(k=>loser.ships[k]>0);if(type){loser.ships[type]--;winner.ships[type]++;captured=' Один повреждённый корабль взят как приз и передан победителю.';}}
 maritimeRetreat(loser);winner.cooldown=gameDayNumber()+7;
 strategyEvent(winner.owner,'Морское сражение в районе «'+maritimeGeo().areas[a.region].name+'»',winner.name+' сохранила преимущество; '+loser.name+' отходит к доступной базе. Потеряно кораблей: '+winner.owner+' — '+wl+', '+loser.owner+' — '+ll+'. Повреждённым судам потребуется ремонт.'+captured,[loser.owner]);maritimeTouch();
}
function maritimeLandTroops(f,p){
 if(!f.cargo.length)return true;const control=maritimePortOwner(p);
 if(!maritimeAccessiblePort(f.owner,p)&&!isAtWar(f.owner,control)){strategyEvent(f.owner,'Высадка остановлена','Порт '+p.name+' не разрешил доступ. Войска остаются на транспортах.',[control]);f.mission='hold';return false;}
 let landed=0,repelled=0;
 for(const u of f.cargo.slice()){
  if(isAtWar(f.owner,control)){
   strategyDefender(control,strategyProvince(p.province));
   const enemies=worldState.mapObjects.filter(x=>x.type==='army'&&x.owner===control&&strategyUnitProvince(x)===p.province&&x.troops>0);
   const enemyPower=enemies.reduce((s,x)=>s+x.troops*(.5+(x.morale??75)/100)*(.4+(x.supply??100)/100),0)*(1.15+p.fort*.05);
   const attackPower=u.troops*(.5+(u.morale??75)/100)*(.4+Math.min(u.supply??100,50)/100)*.7;
   const won=attackPower*(.9+Math.random()*.2)>enemyPower;
   strategyLoss(u,u.troops*(won?.08:.22));for(const enemy of enemies){strategyLoss(enemy,enemy.troops*(won?.2:.06));if(won)strategyRetreat(enemy,p.province);}
   if(!won){repelled+=u.troops;continue;}
   strategyState().occupations[p.province]=f.owner;
  }
  u.province=p.province;u.location=strategyProvince(p.province).name;u.supply=Math.min(u.supply??100,60);landed+=u.troops;worldState.mapObjects.push(u);f.cargo=f.cargo.filter(x=>x!==u);
 }
 f.cargo=f.cargo.filter(u=>u.troops>0);strategySyncOccupations();
 strategyEvent(f.owner,landed?'Высадка у порта '+p.name:'Десант отбит у порта '+p.name,landed+' солдат закрепились на берегу. '+(repelled?'Оставшиеся '+repelled+' солдат отходят на транспортах после сопротивления гарнизона. ':'')+'Юридическое владение землёй не изменилось.',[control]);
 if(repelled)maritimeRetreat(f);return !repelled;
}
function maritimeCompleteBuilds(){
 const m=maritimeState();for(const build of m.builds.filter(x=>x.status==='active'&&x.due<=gameDayNumber())){
  const p=maritimePort(build.port),province=strategyProvince(build.province);
  if((p&&maritimePortOwner(p)!==build.owner)||(province&&strategyControl(province)!==build.owner)||countries[build.owner]?.annexed){
   if(!build.blockedNotice){strategyEvent(build.owner,'Портовые работы приостановлены','Утрата контроля не позволяет завершить оплаченный заказ. Работы возобновятся после возвращения территории.');build.blockedNotice=true;}build.due++;continue;
  }
  if(build.type==='ship'){
   let f=m.fleets.find(f=>f.owner===build.owner&&f.port===p.id&&f.propulsion===build.propulsion&&!f.cargo.length);
   if(!f){f={id:crypto.randomUUID(),owner:build.owner,name:'Эскадра '+p.name,ships:{heavy:0,light:0,transport:0},port:p.id,region:p.region,home:p.id,condition:100,morale:65,supply:100,propulsion:build.propulsion,mission:'hold',cargo:[],path:[],progress:0};m.fleets.push(f);}
   f.ships[build.shipType]+=build.count;
  }else if(build.type==='upgrade_port'){p.level=Math.max(p.level,build.level||p.level);p.shipyard=Math.max(p.shipyard,build.shipyard||0);}
  else {const e=maritimeGeo().coast[build.province][0];m.ports.push({id:'port:'+build.province,province:build.province,name:build.name||'Порт '+province.name,coordinates:e.coordinates,region:e.region,level:build.level||1,shipyard:build.shipyard||0,fort:0});}
  build.status='completed';const order=worldState.orders?.find(o=>o.id===build.orderId);if(order){order.status='executed';order.reason='Морской заказ завершён: '+(build.type==='ship'?build.count+' кораблей поступили в порт':'портовые работы выполнены')+'.';}strategyEvent(build.owner,'Завершён морской заказ',build.type==='ship'?'В порту '+p.name+' готовы '+build.count+' новых кораблей. Они добавлены к реальному флоту страны.':'Портовые работы завершены: изменились пропускная способность и возможности верфи.');maritimeTouch();
 }
}
function maritimeTick(){
 const m=maritimeState();if(m.lastTick===gameDayNumber())return;m.lastTick=gameDayNumber();
 maritimeCompleteBuilds();
 for(const f of m.fleets){
  if(countries[f.owner]?.annexed)continue;
  const paid=countries[f.owner]?.econV3?.paidRatio??1;
  if(f.mission==='blockade'){const target=maritimePort(f.targetPort);if(!target||!isAtWar(f.owner,maritimePortOwner(target))){f.mission='hold';f.path=[];f.atDestination=true;strategyEvent(f.owner,'Блокада прекращена','Военное основание блокады исчезло. Торговые ограничения этой эскадры сняты.');maritimeTouch();}}
  if(f.port){const p=maritimePort(f.port);if(!p||!maritimeAccessiblePort(f.owner,p)){f.port=null;maritimeRetreat(f);strategyEvent(f.owner,'Флот потерял доступ к базе',f.name+' покидает недоступный порт и ищет другую базу.');}
   else {f.supply=seaClamp(f.supply+4*paid,0,100);if(f.mission==='repair'||f.condition<100)f.condition=seaClamp(f.condition+Math.max(.1,p.shipyard*.6)*paid,0,100);}}
  else {f.supply=seaClamp(f.supply-(f.propulsion==='steam'?.5:.25)-(paid<.8?.5:0),0,100);if(f.supply<10&&gameDayNumber()%7===0){f.condition=seaClamp(f.condition-2,0,100);maritimeDropCargo(f,.005);if(f.condition<15)maritimeDamage(f,.03);}}
  if(f.supply<8&&f.mission!=='repair')maritimeRetreat(f);
  if(f.path.length){
   const next=f.path[0],path=maritimeSeaPath(f.region,next,f.owner);
   if(!path||path.length!==2){f.path=[];f.mission='hold';strategyEvent(f.owner,'Морской маршрут закрыт',f.name+' остановилась: изменились условия прохода.');continue;}
   const speed=(f.propulsion==='steam'?280:f.propulsion==='mixed'?230:190)*(.5+f.condition/200)*(.5+f.supply/200)*maritimeWeather(f.region);
   f.progress+=speed;
   if(f.progress>=Math.max(20,strategyDistance(maritimeGeo().areas[f.region].coordinates,maritimeGeo().areas[next].coordinates))){f.progress=0;f.region=f.path.shift();}
  }else if(!f.atDestination&&f.mission!=='hold'){
   f.approachDays=Math.max(0,(f.approachDays||1)-1);
   if(f.approachDays===0){
    const p=maritimePort(f.targetPort);f.atDestination=true;
    if(['move','repair','land'].includes(f.mission)&&p){
     if(f.mission==='land'&&!maritimeLandTroops(f,p))continue;
     if(maritimeAccessiblePort(f.owner,p))f.port=p.id;
     else if(f.mission!=='land')maritimeRetreat(f);
    }
    if(f.mission==='blockade'&&p&&!isAtWar(f.owner,maritimePortOwner(p))){f.mission='hold';strategyEvent(f.owner,'Блокада прекращена','Нет действующей войны с владельцем порта '+p.name+'.');}
   }
  }
 }
 const sea=m.fleets.filter(f=>maritimeShips(f)>0&&!f.port);
 for(let i=0;i<sea.length;i++)for(let j=i+1;j<sea.length;j++)maritimeBattle(sea[i],sea[j]);
 m.fleets=m.fleets.filter(f=>maritimeShips(f)>0);
 reconcileOrderArmies();maritimeSyncMarkers(false);
 const stamp=JSON.stringify(m.fleets.map(f=>[f.id,f.region,f.port,f.mission,f.atDestination,f.targetPort,f.ships,Math.floor(f.supply/10),Math.floor(f.condition/10)]));if(stamp!==m.marketStamp){m.marketStamp=stamp;maritimeTouch();}maritimePathCache.clear();
}
function maritimeUpkeep(owner){
 if(maritimeInitializing)return 0;
 const m=maritimeState(),v=countries[owner]?.econV3,price=v?.prices||1;
 return (m.fleets.filter(f=>f.owner===owner).reduce((s,f)=>s+Object.entries(f.ships).reduce((a,[k,n])=>a+n*MARITIME_SHIPS[k].upkeep,0)*(f.port?1:1.5),0)+
 m.ports.filter(p=>maritimePortOwner(p)===owner).reduce((s,p)=>s+p.level*.025+p.shipyard*.015,0))*price;
}
function maritimeSyncMarkers(render=true){
 const m=maritimeState();worldState.mapObjects=worldState.mapObjects.filter(o=>!o.maritimeMarker);
 for(const p of m.ports)worldState.mapObjects.push({id:'sea-marker:'+p.id,type:'port',maritimeMarker:true,owner:maritimePortOwner(p),label:p.name,location:p.id,troops:0});
 for(const f of m.fleets)worldState.mapObjects.push({id:'sea-marker:'+f.id,type:'naval',maritimeMarker:true,owner:f.owner,label:f.name+' · '+maritimeShips(f)+' кораблей',location:f.port||'sea:'+f.region,troops:0});
 if(typeof renderMapObjects==='function')renderMapObjects();
}

function maritimeTradePolicy(owner){const m=maritimeState();return m.tradePolicies[owner]||={goods:{},partners:{},embargoes:[]};}
function maritimeRate(owner,partner,good){
 const c=countries[owner],p=maritimeTradePolicy(owner),entry=p.partners[partner]||{};
 let rate=entry[good]??entry.all??p.goods[good]??c.bilateralTariffs?.[partner]??c.econV3?.policy.tariff??8;
 for(const a of maritimeState().agreements||[])if(a.status==='active'&&[a.a,a.b].includes(owner)&&[a.a,a.b].includes(partner))rate=Math.min(rate,a.rate);
 const union=(maritimeState().agreements||[]).find(a=>a.status==='active'&&a.type==='customs_union'&&[a.a,a.b].includes(owner));
 if(union&&!([union.a,union.b].includes(partner)))rate=union.externalRate;
 return rate;
}
function maritimeTradeBlocked(a,b){return a===b||!countries[a]||!countries[b]||countries[a].annexed||countries[b].annexed||isAtWar(a,b)||maritimeTradePolicy(a).embargoes.includes(b)||maritimeTradePolicy(b).embargoes.includes(a);}
function maritimeLandTrade(a,b){
 const neighbors=maritimeSettlement?.neighbors||(typeof politicalGeography==='function'?politicalGeography().neighbors:null);
 if(!neighbors)return strategyState().contracts.some(x=>x.status==='active'&&[x.a,x.b].includes(a)&&[x.a,x.b].includes(b));
 const queue=[a],visited=new Set(queue);
 while(queue.length){const n=queue.shift();for(const next of neighbors[n]||[]){
  if(visited.has(next)||!countries[next]||countries[next].annexed||isAtWar(a,next)||maritimeTradePolicy(next).embargoes.includes(a))continue;
  if(next===b)return true;visited.add(next);queue.push(next);
 }}return false;
}
function maritimeTradeLink(a,b){
 const m=maritimeState();if(maritimeTradeBlocked(a,b))return null;
 if(maritimeLandTrade(a,b))return {mode:'land',capacity:.8,regions:[],distance:0};
 const pa=maritimeSettlement?.ports[a]||m.ports.filter(p=>maritimePortOwner(p)===a),pb=maritimeSettlement?.ports[b]||m.ports.filter(p=>maritimePortOwner(p)===b);
 let best=null;
 for(const x of pa)for(const y of pb){
  const path=maritimeSeaPath(x.region,y.region,a);if(!path)continue;
  const d=maritimeTravelDistance(path)+strategyDistance(x.coordinates,maritimeGeo().areas[x.region].coordinates)+strategyDistance(y.coordinates,maritimeGeo().areas[y.region].coordinates);
  const raiders=m.fleets.filter(f=>!f.port&&f.atDestination&&['patrol','blockade'].includes(f.mission)&&path.includes(f.region)&&(isAtWar(a,f.owner)||isAtWar(b,f.owner))).reduce((s,f)=>s+maritimePower(f),0);
  const escorts=m.fleets.filter(f=>!f.port&&['escort','patrol'].includes(f.mission)&&path.includes(f.region)&&[a,b].includes(f.owner)).reduce((s,f)=>s+maritimePower(f),0);
  const interdiction=seaClamp(raiders/(raiders+escorts+40),0,.8);
  const capacity=(1-(maritimeSettlement?.blockades[x.id]??maritimeBlockade(x)))*(1-(maritimeSettlement?.blockades[y.id]??maritimeBlockade(y)))*(1-interdiction)/(1+d/18000);
  if(!best||capacity>best.capacity)best={mode:'sea',capacity,regions:path,distance:d,from:y.id,to:x.id,risk:interdiction};
 }
 return best;
}
function maritimeTrade(){
 const m=maritimeState(),live=ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed&&countries[n].econV3),now=gameDayNumber(),week=Math.floor(now/7);
 const signature=JSON.stringify([worldState.aiWars,worldState.atWarWith,provinceOwners,strategyState().occupations,live]);
 if(maritimeTradeCache?.state===m&&maritimeTradeCache.week===week&&maritimeTradeCache.signature===signature&&maritimeTradeCache.revision===m.revision)return maritimeTradeCache;
 const result=Object.fromEntries(live.map(n=>[n,{imports:0,exports:0,desired:0,tariffs:0,shortage:0,markup:0,goods:{},partners:[]}]));
 const flows=[],links=new Map();
 maritimeSettlement={neighbors:typeof politicalGeography==='function'?politicalGeography().neighbors:null,ports:{},blockades:{}};
 for(const p of m.ports){const owner=maritimePortOwner(p);(maritimeSettlement.ports[owner]||=[]).push(p);maritimeSettlement.blockades[p.id]=maritimeBlockade(p);}
 for(const importer of live){
  const c=countries[importer],v=c.econV3,potential=c.gdp*v.prices/12*.12;
  for(const [good,info]of Object.entries(MARITIME_GOODS)){
   const desired=potential*info.share;result[importer].desired+=desired;
   result[importer].goods[good]={desired,delivered:0,tariffs:0};
   const options=[];
   for(const exporter of live){
    if(exporter===importer)continue;const key=importer+'|'+exporter;if(!links.has(key))links.set(key,maritimeTradeLink(importer,exporter));const link=links.get(key);if(!link)continue;
    const x=countries[exporter],s=x.econV3.sectors[info.sector],supply=(s?.output||0)*x.econV3.prices/12*.16*(good==='military'?.2:good==='manufactured'?.8:1);
    const rate=maritimeRate(importer,exporter,good),weight=supply*link.capacity/(1+rate/100)**2;
    if(weight>0)options.push({exporter,link,supply,rate,weight});
   }
   const sum=options.reduce((s,x)=>s+x.weight,0);
   for(const x of options)flows.push({importer,exporter:x.exporter,good,desired:desired*x.weight/sum,value:desired*x.weight/sum*x.link.capacity/(1+x.rate/100),rate:x.rate,link:x.link});
  }
 }
 // Competing buyers share finite export output; countries cannot sell the same output twice.
 for(const exporter of live)for(const good of Object.keys(MARITIME_GOODS)){
  const info=MARITIME_GOODS[good],c=countries[exporter],sector=c.econV3.sectors[info.sector];
  const cap=(sector?.output||0)*c.econV3.prices/12*.16*(good==='military'?.2:good==='manufactured'?.8:1);
  const entries=flows.filter(f=>f.exporter===exporter&&f.good===good),sum=entries.reduce((s,f)=>s+f.value,0),ratio=sum>cap?cap/sum:1;
  entries.forEach(f=>f.value*=ratio);
 }
 // Each physical harbour has one throughput budget shared by its incoming AND outgoing cargo.
 for(const p of m.ports){
  const entries=flows.filter(f=>f.link.mode==='sea'&&[f.link.from,f.link.to].includes(p.id));
  const sum=entries.reduce((s,f)=>s+f.value,0),cap=p.level*180*(countries[maritimePortOwner(p)]?.econV3?.prices||1);
  if(sum>cap)entries.forEach(f=>f.value*=cap/sum);
 }
 for(const f of flows){
  const r=result[f.importer],x=result[f.exporter],tax=f.value*f.rate/100*countries[f.importer].econV3.collection;
  r.imports+=f.value;r.tariffs+=tax;r.markup+=tax;r.goods[f.good].delivered+=f.value;r.goods[f.good].tariffs+=tax;x.exports+=f.value;
  r.partners.push({country:f.exporter,good:f.good,value:f.value,rate:f.rate,mode:f.link.mode,risk:f.link.risk||0,ports:f.link.mode==='sea'?[f.link.from,f.link.to]:[],regions:f.link.regions});
 }
 for(const r of Object.values(result)){r.shortage=r.desired?seaClamp(1-r.imports/r.desired,0,1):0;r.markup=r.desired?r.markup/r.desired:0;}
 maritimeSettlement=null;maritimeTradeCache={state:m,day:now,week,signature,revision:m.revision,result,flows};return maritimeTradeCache;
}
function validateTradePolicy(o,owner){
 strategyCountry(owner);strategyKeys(o,['action','target','good','rate','enabled','type','external_rate','days','offer_id','agreement_id']);
 strategyAssert(['tariff','embargo','offer','accept','reject','break'].includes(o.action),'Неизвестное торговое действие');
 if(o.target){strategyCountry(o.target);strategyAssert(owner!==o.target,'Нужен иностранный партнёр');}
 if(o.good!=null)strategyAssert(o.good==='all'||Object.hasOwn(MARITIME_GOODS,o.good),'Неизвестная категория товаров');
 if(o.action==='tariff'){strategyNum(o.rate,0,100);}
 if(o.action==='embargo'){strategyAssert(o.target&&typeof o.enabled==='boolean','Укажите страну и включение или снятие эмбарго');}
 if(o.action==='offer'){strategyAssert(o.target&&['trade','customs_union'].includes(o.type),'Укажите партнёра и вид договора');strategyNum(o.rate,0,100);if(o.type==='customs_union')strategyNum(o.external_rate,0,100);strategyNum(o.days||365,1,36500);strategyAssert(Number.isInteger(o.days||365),'Срок должен быть целым');}
 if(['accept','reject'].includes(o.action)){strategyAssert((maritimeState().tradeOffers||[]).some(x=>x.id===o.offer_id&&x.b===owner&&x.status==='open'&&x.expires>gameDayNumber()),'Нет входящего торгового предложения');}
 if(o.action==='break')strategyAssert((maritimeState().agreements||[]).some(x=>x.id===o.agreement_id&&[x.a,x.b].includes(owner)&&x.status==='active'),'Нет собственного действующего торгового договора');
 return o;
}
function maritimeTradeNotice(owner,target,text){
 if(target&&typeof policyNotice==='function')policyNotice(owner,target,text,'trade');
 strategyEvent(owner,'Изменение торговой политики',text,target?[target]:[]);
}
function executeTradePolicy(owner,o){
 validateTradePolicy(o,owner);const m=maritimeState(),p=maritimeTradePolicy(owner);m.tradeOffers||=[];m.agreements||=[];
 if(o.action==='tariff'){
  const good=o.good||'all';if(o.target){p.partners[o.target]||={};p.partners[o.target][good]=o.rate;if(good==='all')countries[owner].bilateralTariffs={...(countries[owner].bilateralTariffs||{}),[o.target]:o.rate};}
  else {if(good==='all'){countries[owner].econV3.policy.tariff=o.rate;p.goods={};}else p.goods[good]=o.rate;}
  const broken=m.agreements.filter(a=>a.status==='active'&&[a.a,a.b].includes(owner)&&((o.target&&[a.a,a.b].includes(o.target)&&o.rate>a.rate)||(a.type==='customs_union'&&(!o.target||![a.a,a.b].includes(o.target))&&o.rate!==a.externalRate)));
  for(const a of broken){a.status='broken';addRelation(owner,a.a===owner?a.b:a.a,-5);maritimeTradeNotice(owner,a.a===owner?a.b:a.a,'Изменение пошлины нарушило торговое соглашение. Прежние льготы прекратились.');}
  if(o.target)maritimeTradeNotice(owner,o.target,'Пошлина на '+(good==='all'?'все товары':MARITIME_GOODS[good].name.toLowerCase())+' из '+o.target+' установлена в '+o.rate+'%. Импортёры платят сборы с доставленных товаров; возможны рост цен и ответные меры.');
  else {strategyEvent(owner,'Изменены импортные пошлины','Ставка '+o.rate+'% распространяется на '+(good==='all'?'весь импорт':MARITIME_GOODS[good].name.toLowerCase())+'. Доход будет зависеть от объёма доставленных товаров.');const partners=maritimeTrade().result[owner]?.partners||[];[...new Set(partners.sort((a,b)=>b.value-a.value).slice(0,5).map(x=>x.country))].forEach(n=>policyNotice(owner,n,'Изменены общие пошлины на '+good+': '+o.rate+'%. Оцени последствия для торговли.','trade'));}
 }else if(o.action==='embargo'){
  p.embargoes=p.embargoes.filter(n=>n!==o.target);if(o.enabled)p.embargoes.push(o.target);
  for(const a of m.agreements.filter(a=>a.status==='active'&&[a.a,a.b].includes(owner)&&[a.a,a.b].includes(o.target)))if(o.enabled){a.status='broken';addRelation(owner,o.target,-5);}
  maritimeTradeNotice(owner,o.target,(o.enabled?'Введено':'Снято')+' торговое эмбарго в отношении '+o.target+'. Это ограничивает реальные перевозки; чужой политический ответ ещё не предрешён.');
 }else if(o.action==='offer'){
  const duplicate=m.tradeOffers.find(a=>a.status==='open'&&a.a===owner&&a.b===o.target&&a.type===o.type);
  if(duplicate)duplicate.status='replaced';
  const id=crypto.randomUUID();m.tradeOffers.push({id,a:owner,b:o.target,type:o.type,rate:o.rate,externalRate:o.external_rate,days:o.days||365,expires:gameDayNumber()+90,status:'open'});
  maritimeTradeNotice(owner,o.target,'Предложен '+(o.type==='customs_union'?'таможенный союз':'торговый договор')+' с взаимной ставкой '+o.rate+'%'+(o.type==='customs_union'?', общей внешней ставкой '+o.external_rate+'%':'')+'. Для вступления в силу требуется согласие обеих сторон.');
 }else if(o.action==='accept'){
  const offer=m.tradeOffers.find(x=>x.id===o.offer_id);
  strategyAssert(!isAtWar(offer.a,offer.b),'Сначала необходимо прекратить войну');
  if(offer.type==='customs_union')strategyAssert(!m.agreements.some(x=>x.status==='active'&&x.type==='customs_union'&&[x.a,x.b].some(n=>[offer.a,offer.b].includes(n))),'Сторона уже связана другим таможенным союзом; сначала прекратите его');
  m.agreements.filter(x=>x.status==='active'&&[x.a,x.b].includes(offer.a)&&[x.a,x.b].includes(offer.b)).forEach(x=>x.status='replaced');
  m.agreements.push({...offer,id:crypto.randomUUID(),status:'active',since:gameDayNumber(),due:gameDayNumber()+offer.days});
  maritimeTradePolicy(offer.a).embargoes=maritimeTradePolicy(offer.a).embargoes.filter(n=>n!==offer.b);p.embargoes=p.embargoes.filter(n=>n!==offer.a);
  offer.status='accepted';maritimeTradeNotice(owner,offer.a,'Согласованы взаимные торговые условия. Договор действует '+offer.days+' дней; страна не становится военным союзником автоматически.');
 }else if(o.action==='reject'){
  const offer=m.tradeOffers.find(x=>x.id===o.offer_id);offer.status='rejected';maritimeTradeNotice(owner,offer.a,'Торговое предложение отклонено. Прежние условия сохраняются.');
 }else {const a=m.agreements.find(x=>x.id===o.agreement_id);a.status='broken';addRelation(owner,a.a===owner?a.b:a.a,-3);maritimeTradeNotice(owner,a.a===owner?a.b:a.a,'Торговый договор прекращён досрочно. Страны снова применяют собственные ставки.');}
 maritimeTouch();return 'Торговое действие зарегистрировано; поступления и цены рассчитываются по доставленному импорту.';
}
function maritimeFacts(owner){
 const m=maritimeState(),trade=maritimeTrade().result[owner];
 return {ports:m.ports.filter(p=>maritimePortOwner(p)===owner).map(p=>({...p,blockade:maritimeBlockade(p)})),fleets:m.fleets.filter(f=>f.owner===owner).map(f=>({id:f.id,name:f.name,ships:f.ships,region:f.region,port:f.port,mission:f.mission,targetPort:f.targetPort,path:f.path,supply:f.supply,condition:f.condition,propulsion:f.propulsion,cargo:f.cargo.map(u=>({id:u.id,troops:u.troops}))})),
 builds:m.builds.filter(x=>x.owner===owner&&x.status==='active'),upkeep:maritimeUpkeep(owner),crew:maritimeCrew(owner),trade:trade?{imports:trade.imports,exports:trade.exports,tariffs:trade.tariffs,shortage:trade.shortage,goods:trade.goods,partners:trade.partners.slice().sort((a,b)=>b.value-a.value).slice(0,8)}:null,
 policy:maritimeTradePolicy(owner),tradeOffers:(m.tradeOffers||[]).filter(x=>x.b===owner&&x.status==='open'),agreements:(m.agreements||[]).filter(x=>x.status==='active'&&[x.a,x.b].includes(owner))};
}
const maritimeOldContext=orderContext;
orderContext=function(){return {...maritimeOldContext(),validateNavalOrder,validateTradePolicy};};
const maritimeOldExecute=executeOrderEffects;
executeOrderEffects=function(e){
 if(!e.naval_order&&!e.trade_policy)return maritimeOldExecute(e);
 try{if(e.naval_order)executeNavalOrder(playerCountry,e.naval_order);if(e.trade_policy)executeTradePolicy(playerCountry,e.trade_policy);return {status:'executed'};}
 catch(error){if(error instanceof StrategyActionError)return {status:'blocked',reason:error.message};throw error;}
};
const maritimeOldForeign=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,e){
 if(e.naval_order||e.trade_policy){try{OrderRules.validateEffects(e,{...orderContext(),player:owner},'order',kind);const verdict=OrderRules.authority({kind,status:'execute',effects:e,reason:'Морская и торговая политика'},countries[owner]);if(verdict.status!=='executed')return verdict;
 return {status:'executed',reason:e.naval_order?executeNavalOrder(owner,e.naval_order):executeTradePolicy(owner,e.trade_policy)};}catch(error){if(error instanceof StrategyActionError)return {status:'blocked',reason:error.message};throw error;}}
 return maritimeOldForeign(owner,kind,e);
};
const maritimeOldDescription=executedOrderDescription;
executedOrderDescription=function(e){return e.naval_order?'Морская задача зарегистрирована. Флот, маршрут, груз и сроки видны в разделе «Море и торговля».':e.trade_policy?'Торговая политика обновлена. Пошлины взимаются с доставленного импорта; договор требует согласия.':maritimeOldDescription(e);};
const maritimeOldRevenue=econMonthlyRevenue;
econMonthlyRevenue=function(c){
 const r=maritimeOldRevenue(c),owner=ALL_COUNTRIES.find(n=>countries[n]===c);if(maritimeInitializing||!owner||!c.econV3||ALL_COUNTRIES.some(n=>countries[n]&&!countries[n].annexed&&!countries[n].econV3))return r;
 const tariffs=maritimeTrade().result[owner]?.tariffs||0;return {...r,gross:r.gross-r.tariffs+tariffs,tariffs};
};
const maritimeOldBudget=econBudget;
econBudget=function(c){const b=maritimeOldBudget(c),owner=ALL_COUNTRIES.find(n=>countries[n]===c),cost=owner?maritimeUpkeep(owner):0;return {...b,expense:b.expense+cost,net:b.net-cost,lines:{...b.lines,expense:[...b.lines.expense,{name:'Флот и порты',value:cost}]}};};
const maritimeOldAdvance=advanceGameDays;
advanceGameDays=function(n){
 const all={econ:[],deaths:[],months:0};
 for(let i=0;i<n;i++){
  maritimeState();
  const m=maritimeState();for(const a of m.agreements||[])if(a.status==='active'&&(a.due<=gameDayNumber()||isAtWar(a.a,a.b)||countries[a.a]?.annexed||countries[a.b]?.annexed)){a.status=a.due<=gameDayNumber()?'expired':'suspended';maritimeTouch();}
  for(const o of m.tradeOffers||[])if(o.status==='open'&&(o.expires<=gameDayNumber()||countries[o.a]?.annexed||countries[o.b]?.annexed))o.status='expired';
  // Freeze one global trade settlement for the day, before country iteration changes GDP.
  maritimeTrade();
  const r=maritimeOldAdvance(1);maritimeTick();
  if(r.econ.length)all.econ=r.econ;all.deaths.push(...r.deaths);all.months+=r.months;
 }if(n>0&&typeof renderMapObjects==='function')renderMapObjects();return all;
};
const maritimeOldResolve=resolveLocationLonLat;
resolveLocationLonLat=function(name){
 if(worldState?.maritime){const port=worldState.maritime.ports.find(p=>p.id===name);if(port)return port.coordinates; if(String(name).startsWith('sea:'))return maritimeGeo().areas[String(name).slice(4)]?.coordinates||null;}
 return maritimeOldResolve(name);
};
const maritimeOldApplyMap=applyMapObjects;
applyMapObjects=function(list){
 strategyAssert(!list.some(x=>x.type==='naval'||x.type==='port'||worldState.mapObjects?.find(o=>o.id===x.id)?.maritimeMarker),'Настоящий флот изменяется naval_order, а не декоративным объектом');
 const shadow=(worldState.mapObjects||[]).filter(u=>u.type==='army').map(u=>({...u})),cargo=maritimeState().fleets.flatMap(f=>f.cargo);
 for(const x of list){
  strategyAssert(!cargo.some(u=>u.id===x.id),'Часть на транспорте управляется морской задачей');
  const current=shadow.find(u=>u.id===x.id);
  if(x.action==='create'&&x.type==='army')shadow.push({...x});
  if(x.action==='update'&&current&&x.troops!=null)current.troops=x.troops;
  if(x.action==='delete'&&current)shadow.splice(shadow.indexOf(current),1);
  for(const owner of ALL_COUNTRIES){const total=[...shadow,...cargo].filter(u=>u.owner===owner).reduce((s,u)=>s+(u.troops||0),0);strategyAssert(total<=countries[owner].army,'Недостаточно свободных солдат с учётом морской перевозки');}
 }
 return maritimeOldApplyMap(list);
};
const maritimeOldReconcile=reconcileOrderArmies;
reconcileOrderArmies=function(){
 if(worldState.maritime){
 for(const owner of ALL_COUNTRIES){
  const cargo=maritimeCargo(owner),ground=(worldState.mapObjects||[]).filter(u=>u.owner===owner&&u.type==='army'),total=[...cargo,...ground].reduce((s,u)=>s+u.troops,0),cap=countries[owner]?.army||0;
  if(total>cap){let remaining=cap;const units=[...cargo,...ground];units.forEach((u,i)=>{u.troops=i===units.length-1?remaining:Math.min(remaining,Math.floor(u.troops*cap/total));remaining-=u.troops;});}
 }
 }return maritimeOldReconcile();
};
const maritimeOldPoliticalContext=politicalContext;
politicalContext=function(){const c=maritimeOldPoliticalContext();const ids=[...new Set([playerCountry,...(c.countries||[]).map(x=>x.facts?.id).filter(Boolean)])];c.maritime={countries:ids.map(id=>({id,...maritimeFacts(id)})),regions:Object.values(maritimeGeo().areas),links:activeScenario?.maritime?.links||MARITIME_LINKS,ports:maritimeState().ports.map(p=>({id:p.id,name:p.name,owner:maritimePortOwner(p),region:p.region,province:p.province})),shipTypes:MARITIME_SHIPS};return c;};
const maritimeOldInterest=policyInterest;
policyInterest=function(id){const c=maritimeOldInterest(id);c.maritime=maritimeFacts(id);const currentBudget=econBudget(countries[id]);c.prosperity.currentBudget={gross:currentBudget.gross,expense:currentBudget.expense,net:currentBudget.net};c.capacity.availableTroops=Math.max(0,c.capacity.availableTroops-maritimeCargo(id).reduce((s,u)=>s+u.troops,0));return c;};
const maritimeOldPolicyContext=policyContext;
policyContext=function(...args){const c=maritimeOldPolicyContext(...args);c.seaAreas=Object.values(maritimeGeo().areas);c.seaLinks=activeScenario?.maritime?.links||MARITIME_LINKS;c.seaActivity=maritimeState().fleets.filter(f=>!f.port&&(args[0]||[]).some(n=>isAtWar(n,f.owner)||maritimeState().ports.some(p=>maritimePortOwner(p)===n&&p.region===f.region))).map(f=>({owner:f.owner,region:f.region,mission:f.mission,targetPort:f.targetPort,shipsEstimate:Math.round(maritimeShips(f)/5)*5}));c.ports=maritimeState().ports.map(p=>({id:p.id,name:p.name,owner:maritimePortOwner(p),province:p.province,region:p.region}));return c;};
const MARITIME_INSTRUCTIONS='МОРЕ И ТОРГОВЛЯ. kind:naval effects:{naval_order:{action:"move|patrol|escort|blockade|hold|repair|embark|land|build|split|build_port|upgrade_port",fleet_id:"ID действующей флотилии",port_id:"ID порта",region:"ID района",unit_id:"ID собственной сухопутной части для embark",ship_type:"heavy|light|transport",count:целое число для build/split,name:"для новой флотилии/порта",province:"ID побережья для build_port",level:1..5,shipyard:0..3,propulsion:"sail|mixed|steam"}}. Передавай только параметры выбранного действия. build оплачивает реальные корабли и занимает месяцы; split выделяет существующие. Посадка только в одном порту и в пределах транспортной вместимости; land требует груза и разрешённого или вражеского порта. Блокада только в войне, прибытие не мгновенно. Морские районы не аннексируются. kind:trade effects:{trade_policy:{action:"tariff|embargo|offer|accept|reject|break",target:"ID партнёра если адресно",good:"all|food|raw|manufactured|military",rate:0..100,enabled:true|false для embargo,type:"trade|customs_union",external_rate:0..100 для таможенного союза,days:срок,offer_id:"при ответе",agreement_id:"при разрыве"}}. Общие пошлины не требуют чужого согласия. Договор/таможенный союз требует отдельного принятия адресатом. Для NPC action:pursue task.kind:naval/trade, task.effects с этими операциями, days:0 для начала задачи; физические сроки считает движок. Торговые вопросы требуют политического ответа по интересам: переговоры, ответные ставки, снятие ограничений или ожидание с причиной. Не создавай согласие или морскую победу текстом.';
const maritimeOldAsk=askGemini;
askGemini=async function(prompt,...args){if(typeof prompt==='string'&&(prompt.includes('Свободные приказы:')||prompt.startsWith('POLITICAL_CABINETS_V1')))prompt+='\n'+MARITIME_INSTRUCTIONS;return maritimeOldAsk(prompt,...args);};
const maritimeOldPolicy=econPolicy;
econPolicy=function(c,p){
 if(p.type==='tariff'){econValidatePolicy(p,c);const owner=ALL_COUNTRIES.find(n=>countries[n]===c);if(owner){econV3(c);return executeTradePolicy(owner,{action:'tariff',good:'all',rate:p.target});}}
 return maritimeOldPolicy(c,p);
};
const maritimeOldDiplomatic=executeDiplomaticAction;
executeDiplomaticAction=function(owner,d){if(d.action==='tariff')return executeTradePolicy(owner,{action:'tariff',target:d.target,rate:d.amount,good:'all'});const r=maritimeOldDiplomatic(owner,d);maritimeTouch();return r;};
const maritimeOldMerge=strategyMergeCountry;
strategyMergeCountry=function(from,to){const m=maritimeState();maritimeOldMerge(from,to);m.fleets.filter(f=>f.owner===from).forEach(f=>{f.owner=to;f.cargo.forEach(u=>u.owner=to);});m.builds.filter(x=>x.owner===from).forEach(x=>x.owner=to);maritimeTouch();};
const maritimeOldReset=resetGame;
resetGame=function(...args){maritimeTradeCache=null;maritimePathCache.clear();maritimeInitializing=true;let r;try{r=maritimeOldReset(...args);}finally{maritimeInitializing=false;}maritimeTradeCache=null;maritimeState();maritimeSyncMarkers();renderPlayerStats();return r;};

const maritimeOldMilitaryValidation=validateMilitaryOrder;
validateMilitaryOrder=function(o,owner,execution=false){
 if(o.action==='deploy')strategyAssert(!maritimeCargo(owner).some(u=>u.id===o.unit_id),'ID части уже занят войсками на транспорте');
 const r=maritimeOldMilitaryValidation(o,owner,execution);
 if(execution&&o.action==='deploy'){
  const used=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner).reduce((s,u)=>s+u.troops,0)+maritimeCargo(owner).reduce((s,u)=>s+u.troops,0);
  strategyAssert(used+o.troops<=countries[owner].army,'Солдаты на транспортах уже входят в национальную армию; свободных сил недостаточно');
 }return r;
};

const maritimeOldCanonical=canonicalEffects;
canonicalEffects=function(e){
 const out=maritimeOldCanonical(e);
 if(out.naval_order){const n=out.naval_order;if(n.port_id)n.port_id=maritimePort(n.port_id)?.id||n.port_id;if(n.region)n.region=Object.values(maritimeGeo().areas).find(r=>r.id===n.region||r.name.toLowerCase()===String(n.region).toLowerCase())?.id||n.region;if(n.province)n.province=strategyProvince(n.province)?.id||n.province;}
 if(out.trade_policy?.target)out.trade_policy.target=orderCountry(out.trade_policy.target);
 return out;
};
window.prepareMaritimeGeography=()=>maritimeGeo();

const maritimeOldDeclare=declareEngineWar;
declareEngineWar=function(...args){const r=maritimeOldDeclare(...args);maritimeTouch();return r;};

const maritimeOldPublic=policyPublicFacts;
policyPublicFacts=function(id){const facts=maritimeOldPublic(id),fleets=maritimeState().fleets.filter(f=>f.owner===id);facts.navyEstimate={ships:Math.round(fleets.reduce((s,f)=>s+maritimeShips(f),0)/5)*5,ports:maritimeState().ports.filter(p=>maritimePortOwner(p)===id).map(p=>({id:p.id,name:p.name,region:p.region,blockade:maritimeBlockade(p)}))};return facts;};

const maritimeOldPlan=applyOrderPlan;
applyOrderPlan=function(plan){
 const results=maritimeOldPlan(plan);
 for(const o of results){const n=o.effects?.naval_order;if(o.status!=='executed'||!n||!['build','build_port','upgrade_port'].includes(n.action))continue;
  const build=maritimeState().builds.find(b=>b.owner===playerCountry&&b.start===gameDayNumber()&&!b.orderId&&b.status==='active'&&
   (n.action==='build'?b.type==='ship'&&b.port===n.port_id&&b.shipType===n.ship_type&&b.count===n.count:b.type===n.action&&(n.port_id?b.port===n.port_id:b.province===n.province)));
  if(build){build.orderId=o.id;o.status='in_progress';o.reason='Морской заказ оплачен. До завершения '+Math.max(0,build.due-gameDayNumber())+' дней.';}
 }return results;
};

const maritimeOldLoad=loadGameSlot;
loadGameSlot=async function(...args){const r=await maritimeOldLoad(...args);if(gameStarted&&countries[playerCountry]){maritimeTradeCache=null;maritimeState();maritimeSyncMarkers();renderPlayerStats();}return r;};
