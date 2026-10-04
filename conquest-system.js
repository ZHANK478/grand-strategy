/* Factual conquest and a shared world picture. No recurring model request,
   no new panels, timers or diplomatic veto over actual territorial control. */
'use strict';
function conquestState(){
 const s=worldState.conquest||={version:1,baseline:{},administrations:{},history:[],observed:null};
 s.baseline||={};s.administrations||={};s.history||=[];
 for(const p of scenarioProvinces)if(!s.baseline[p.id])s.baseline[p.id]={owner:p.owner,gdp:provinceEcon[p.id]?.gdp||0,population:provinceEcon[p.id]?.pop||0};
 for(const p of scenarioProvinces){const b=s.baseline[p.id],e=provinceEcon[p.id];if(e&&b.gdp<=0)b.gdp=e.gdp||0;if(e&&b.population<=0)b.population=e.pop||0;}
 return s;
}
function conquestTerritory(owner){
 const legal=scenarioProvinces.filter(p=>strategyOwner(p)===owner),controlled=legal.filter(p=>strategyControl(p)===owner);
 const value=list=>list.reduce((n,p)=>n+(provinceEcon[p.id]?.gdp||1),0);
 const ratio=legal.length?value(controlled)/Math.max(1,value(legal)):0;
 return {owned:legal.length,controlled:controlled.length,controlledShare:Math.round(ratio*1000)/1000,
  status:countries[owner]?.annexed?'annexed':legal.length&&!controlled.length?'displaced':controlled.length<legal.length?'partly_occupied':'governing'};
}
function conquestRefreshGovernments(){
 for(const owner of ALL_COUNTRIES){
  const c=countries[owner];if(!c)continue;const territory=conquestTerritory(owner);
  c.governance||={};c.governance.territorialStatus=territory.status;
 }
}
function conquestProvinces(owner,d){
 strategyKeys(d,['action','target','terms','message']);
 strategyAssert(['administer','annex'].includes(d.action),'Неизвестное территориальное поручение');
 strategyAssert(d.target&&countries[d.target]&&d.target!==owner,'Нужен существующий иностранный адресат');
 if(d.message)strategyText(d.message,900);
 if(d.terms)strategyKeys(d.terms,['provinces']);
 const list=d.terms?.provinces||scenarioProvinces.filter(p=>strategyOwner(p)===d.target&&strategyControl(p)===owner).map(p=>p.id);
 strategyAssert(Array.isArray(list)&&list.length>0&&list.length<=100&&new Set(list).size===list.length,'Нужно указать фактически контролируемую землю');
 const provinces=list.map(strategyProvince);
 strategyAssert(provinces.every(p=>p&&strategyControl(p)===owner),'Установить управление можно только там, где есть фактический контроль своих сил');
 strategyAssert(provinces.every(p=>strategyOwner(p)===d.target||strategyOwner(p)===owner&&conquestState().administrations[p.id]?.formerOwner===d.target),'Земля должна принадлежать указанной стороне или уже быть присоединена у неё');
 strategyAssert(!provinces.some(p=>worldState.mapObjects.some(u=>u.type==='army'&&u.owner!==owner&&isAtWar(owner,u.owner)&&strategyUnitProvince(u)===p.id&&u.troops>0)),'На этой земле ещё находится вражеская армия; сначала требуется установить действительный контроль');
 d.terms={provinces:provinces.map(p=>p.id)};return provinces;
}
const conquestOldValidateDiplomacy=validateDiplomaticAction;
validateDiplomaticAction=function(d,owner){
 if(['administer','annex'].includes(d.action)){conquestProvinces(owner,d);return d;}
 if(d.action==='aid'){strategyKeys(d,['action','target','amount','message']);strategyCountry(d.target);strategyAssert(d.target!==owner,'Нужен иностранный получатель');strategyNum(d.amount,1,1e7);strategyAssert(countries[owner].treasury>=d.amount,'Казна не обеспечивает сумму помощи');if(d.message)strategyText(d.message,900);return d;}
 return conquestOldValidateDiplomacy(d,owner);
};
function conquestApply(owner,d){
 const provinces=conquestProvinces(owner,d),s=conquestState(),changes=[];
 for(const p of provinces){
  const old=s.administrations[p.id],mode=d.action==='annex'?'annexation':'occupation';
  if(old?.controller===owner&&(old.mode===mode||old.mode==='annexation'))continue;
  s.administrations[p.id]={controller:owner,formerOwner:old?.formerOwner||strategyOwner(p),mode,day:gameDayNumber(),active:true,disputed:true};
  if(d.action==='annex'&&strategyOwner(p)!==owner)transferProvince(p.id,owner);
  changes.push(p.id);
 }
 const remaining=scenarioProvinces.filter(p=>strategyOwner(p)===d.target);
 if(d.action==='annex'&&!remaining.length&&!countries[d.target].annexed){
  const c=countries[d.target];
  // A conquered state's undeployed reserve is not awarded to the conqueror.
  c.army=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===d.target).reduce((n,u)=>n+u.troops,0)+maritimeCargo(d.target).reduce((n,u)=>n+u.troops,0);
  c.annexed=true;c.annexedBy=owner;territoryOwners[d.target]=owner;
  worldState.actorRecruitment=(worldState.actorRecruitment||[]).filter(p=>p.country!==d.target);
  for(const peer of ALL_COUNTRIES)if(peer!==d.target&&isAtWar(peer,d.target))strategyEndWar(peer,d.target);
  worldState.treaties=(worldState.treaties||[]).filter(t=>![t.a,t.b].includes(d.target));worldState.alliedWith=worldState.alliedWith.filter(n=>n!==d.target);
  for(const p of ensurePolitics().tasks.filter(p=>p.country===d.target&&['active','in_progress'].includes(p.status))){p.status='failed';p.reason='Правительство утратило территорию и государственный аппарат';}
  for(const offer of strategyState().offers.filter(o=>[o.a,o.b].includes(d.target)&&o.status==='open'))offer.status='superseded';
  for(const contract of strategyState().contracts.filter(c=>[c.a,c.b].includes(d.target)&&c.status==='active'))contract.status='suspended';
 }
 conquestRefreshGovernments();strategySyncOccupations();maritimeTouch();
 if(changes.length){
  const record={id:crypto.randomUUID(),owner,formerOwner:d.target,action:d.action,provinces:changes,day:gameDayNumber()};
  s.history.push(record);s.history=s.history.slice(-60);
  const fact=d.action==='annex'?'Принадлежность контролируемой земли изменена на карте. Согласие прежней власти и третьих держав не является условием этого действия; их непризнание и противодействие остаются политическими вопросами.':
   'На фактически занятой земле местное государственное управление заменено администрацией '+owner+'. Прежний кабинет может оспаривать её власть, но его распоряжения не отменяют военный контроль.';
  strategyEvent(owner,d.action==='annex'?'Объявлено присоединение занятой земли':'На занятой земле установлена новая администрация',fact,[d.target]);
  if(typeof causalPublish==='function')causalPublish(owner,'conquest:'+record.id,{domain:'security',visibility:'public',summary:(d.action==='annex'?'Присоединение территории ':'Установление администрации на занятой земле ')+d.target,salience:85,targets:[d.target],scope:'international',affected:[]},fact);
 }
 return {status:'executed',reason:d.action==='annex'?'Контролируемая территория присоединена; спор о признании сохраняется.':'На контролируемой территории установлена своя администрация.'};
}
const conquestOldDiplomacy=executeDiplomaticAction;
executeDiplomaticAction=function(owner,d){
 if(d.action==='aid'){validateDiplomaticAction(d,owner);countries[owner].treasury-=d.amount;countries[d.target].treasury+=d.amount;
  strategyEvent(owner,'Предоставлена государственная финансовая помощь',owner+' передала '+d.target+' '+economyFmt(d.amount)+' млн р.е. Казна отправителя уменьшилась, казна получателя увеличилась. Это средства, а не мгновенно созданные войска или оружие.',[d.target]);
  conquestState().history.push({id:crypto.randomUUID(),owner,formerOwner:d.target,action:'aid',amount:d.amount,provinces:[],day:gameDayNumber()});return {status:'executed',reason:'Финансовая помощь реально перечислена получателю.'};
 }
 return ['administer','annex'].includes(d.action)?conquestApply(owner,d):conquestOldDiplomacy(owner,d);
};
const conquestOldRevenue=econMonthlyRevenue;
econMonthlyRevenue=function(c){
 const result=conquestOldRevenue(c),owner=ALL_COUNTRIES.find(n=>countries[n]===c);
 if(!owner||!scenarioProvinces.length)return result;
 const factor=conquestTerritory(owner).controlledShare;
 if(factor>=1)return result;
 return {...result,gross:result.gross*factor,taxes:result.taxes==null?result.taxes:result.taxes*factor,
  tariffs:result.tariffs*factor,resources:result.resources*factor,perClass:Object.fromEntries(Object.entries(result.perClass||{}).map(([k,v])=>[k,v*factor])),territorialCollectionFactor:factor};
};
const conquestOldBudget=econBudget;
econBudget=function(c){
 const b=conquestOldBudget(c),owner=ALL_COUNTRIES.find(n=>countries[n]===c);if(!owner)return b;
 const administrations=Object.entries(conquestState().administrations).filter(([id,a])=>a.active&&a.controller===owner&&strategyControl(strategyProvince(id))===owner);
 const upkeep=administrations.reduce((n,[id])=>n+(provinceEcon[id]?.gdp||0)/12*.015,0);
 if(!upkeep)return b;
 return {...b,expense:b.expense+upkeep,net:b.net-upkeep,territorialAdministration:upkeep,
  lines:{...b.lines,expense:[...b.lines.expense,{name:'Военное и переходное управление',value:upkeep}]}};
};
const conquestOldPoliticalTask=validatePoliticalTask;
validatePoliticalTask=function(t,owner){
 const result=conquestOldPoliticalTask(t,owner),territory=conquestTerritory(owner);
 if(territory.status==='displaced'&&t.effects&&Object.keys(t.effects).length){
  const steps=t.kind==='policy'?t.effects.operations||[]:[{kind:t.kind,effects:t.effects}];
  for(const step of steps)strategyAssert(!['tax','spending','law','economic','army','trade'].includes(step.kind),
   'У правительства нет подконтрольной территории для этой внутренней меры. Оно может вести переговоры, искать помощь и организовывать возвращение власти, но не управлять занятыми учреждениями одним заявлением.');
 }
 return result;
};
function conquestWorldFacts(){
 const s=conquestState(),losses={};
 for(const event of strategyState().events||[])if(event.losses){losses[event.winner]=(losses[event.winner]||0)+event.losses[0];losses[event.loser]=(losses[event.loser]||0)+event.losses[1];}
 const rows=[];
 for(const owner of ALL_COUNTRIES){
  if(!countries[owner])continue;
  const captured=scenarioProvinces.filter(p=>s.baseline[p.id]?.owner!==owner&&strategyControl(p)===owner),wars=ALL_COUNTRIES.filter(n=>n!==owner&&isAtWar(owner,n));
  const territory=conquestTerritory(owner);if(!captured.length&&!wars.length&&!['displaced','partly_occupied'].includes(territory.status))continue;
  const victims={};
  for(const p of captured){const former=s.baseline[p.id].owner;victims[former]||={country:former,provinces:0,gdp:0,population:0};victims[former].provinces++;victims[former].gdp+=s.baseline[p.id].gdp||0;victims[former].population+=s.baseline[p.id].population||0;}
  for(const v of Object.values(victims)){const total=Object.values(s.baseline).filter(p=>p.owner===v.country).reduce((n,p)=>n+p.gdp,0);v.shareOfInitialGDP=Math.round(v.gdp/Math.max(1,total)*1000)/1000;v.gdp=Math.round(v.gdp);v.population=Math.round(v.population);}
  const abroad=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===owner&&s.baseline[strategyUnitProvince(u)]?.owner!==owner);
  rows.push({country:owner,gdp:Math.round(countries[owner].gdp),wars,territory,victims:Object.values(victims),army:countries[owner].army,
   abroadTroops:abroad.reduce((n,u)=>n+u.troops,0),losses:losses[owner]||0,
   disputedAnnexations:Object.values(s.administrations).filter(a=>a.controller===owner&&a.active&&a.mode==='annexation').length});
 }
 return {date:dateLabel(),countries:rows,administrations:Object.entries(s.administrations).filter(([,a])=>a.active).map(([id,a])=>({province:id,...a})),
  recentChanges:s.history.slice(-6).map(r=>({...r,provinces:r.provinces.length})),
  meaning:'Контроль и потери отражают факты. Непризнание не отменяет контроль. Политические заявления не равны поставкам, мобилизации или участию в войне.'};
}
function conquestExposure(owner,world=conquestWorldFacts()){
 const neighbors=politicalGeography().neighbors[owner]||new Set(),contracts=strategyState().contracts.filter(c=>c.status==='active'&&[c.a,c.b].includes(owner));
 return world.countries.filter(r=>r.country!==owner&&r.victims.length).map(r=>{
  const targets=r.victims.map(v=>v.country),threatenedNeighbors=targets.filter(n=>neighbors.has(n)),partners=targets.filter(n=>contracts.some(c=>[c.a,c.b].includes(n)));
  const forces=worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===r.country&&[...(strategyGeometry().graph[strategyUnitProvince(u)]||[])].some(id=>strategyControl(strategyProvince(id))===owner));
  return {expandingPower:r.country,victims:targets,threatenedNeighbors,treatyPartners:partners,borderTroops:forces.reduce((n,u)=>n+u.troops,0),
   ownTerritoryLost:r.victims.find(v=>v.country===owner)?.shareOfInitialGDP||0,armyRatio:Math.round(r.army/Math.max(1,countries[owner].army)*100)/100};
 });
}
function conquestScan(){
 const s=conquestState();conquestRefreshGovernments();
 for(const [id,a]of Object.entries(s.administrations))a.active=strategyControl(strategyProvince(id))===a.controller;
 const signature=JSON.stringify(scenarioProvinces.map(p=>[p.id,strategyOwner(p),strategyControl(p)]));
 if(s.observed===signature)return;s.observed=signature;
 const world=conquestWorldFacts(),expansions=world.countries.filter(r=>r.victims.length);
 if(!expansions.length)return;
 const powers=policyLive().slice().sort((a,b)=>countries[b].gdp-countries[a].gdp).slice(0,8);
 for(const r of expansions){
  const victims=r.victims.map(v=>v.country),recipients=[...new Set([...victims,...victims.flatMap(n=>[...(politicalGeography().neighbors[n]||[])]),...powers,
   ...strategyState().contracts.filter(c=>c.status==='active'&&victims.some(n=>[c.a,c.b].includes(n))).flatMap(c=>[c.a,c.b])])];
  for(const n of recipients.filter(n=>n!==r.country&&n!==playerCountry&&countries[n]&&!countries[n].annexed)){
   const exposure=conquestExposure(n,world).find(e=>e.expandingPower===r.country);
   policyNotice(r.country,n,'Общая картина кампании: '+JSON.stringify(r)+'. Ваше положение: '+JSON.stringify(exposure)+'. Оцени цену окончательной победы этой державы для своих интересов, а не только последнее заявление. Нейтралитет возможен, но поддержка, сдерживание и подготовка должны соответствовать масштабу угрозы.','war');
   const notice=policyCabinet(n).inbox.at(-1);if(notice){notice.salience=85;notice.worldCrisis=true;}
  }
 }
}
const conquestOldScan=policyScanWorld;
policyScanWorld=function(){conquestOldScan();conquestScan();};
const conquestOldPublic=policyPublicFacts;
policyPublicFacts=function(owner){return {...conquestOldPublic(owner),territory:conquestTerritory(owner)};};
const conquestOldContext=policyContext;
policyContext=function(...args){
 const c=conquestOldContext(...args),world=conquestWorldFacts();c.worldSituation=world;
 for(const cabinet of c.cabinets){cabinet.exposure=conquestExposure(cabinet.id,world);cabinet.interests.security.territory=conquestTerritory(cabinet.id);}
 return c;
};
const conquestOldPlanning=orderPlanningContext;
orderPlanningContext=function(...args){const c=conquestOldPlanning(...args);
 // Existing finance, military and social fields remain authoritative. Drop only repeated prose and generated geographic labels.
 const generic=p=>{const original=strategyProvince(p.id||p.province);return /\\s+\\d+$/.test(p.name||'')&&(p.name||'').replace(/\\s+\\d+$/,'').toLowerCase()===String(original?.owner||p.owner).toLowerCase();};
 for(const rows of [c.strategy?.militaryLocations,c.landingCoasts])if(rows)for(const p of rows)if(generic(p))delete p.name;
 if(c.playerObservation?.facts){const f=c.playerObservation.facts;c.playerObservation.facts=Object.fromEntries(['agenda','posture','warPreparation','stability','relations','economics'].filter(k=>f[k]!=null).map(k=>[k,f[k]]));}
 c.worldSituation=conquestWorldFacts();c.occupiedLand=scenarioProvinces.filter(p=>strategyControl(p)===playerCountry&&strategyOwner(p)!==playerCountry).map(p=>({id:p.id,name:p.name,owner:strategyOwner(p)}));return c;};
const conquestOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&(prompt.includes('Свободные приказы:')||prompt.startsWith('POLITICAL_CABINETS_V1'))){
  prompt+='\nЗАНЯТАЯ ЗЕМЛЯ: kind:diplomacy effects:{diplomatic_action:{action:"administer" для управления ИЛИ "annex" для присоединения,target:"прежний владелец",terms:{provinces:["ID фактически контролируемой земли"]}}}. Без terms выбирается вся контролируемая земля target. Подпись побеждённого и третьих держав для этих действий не нужна; чужое признание и договорной мир отдельно. Не передавай ещё не занятую землю или чужую армию текстом. Финансовая помощь: kind:diplomacy effects:{diplomatic_action:{action:"aid",target:"получатель",amount:сумма млн р.е. из собственной казны}}; это деньги, не готовое оружие/солдаты. territory.status:displaced — кабинет утратил внутреннее управление, но может искать помощь и возвращение власти. Газета не подменяет заявление восстановлением контроля.';
 }
 if(typeof prompt==='string'&&prompt.startsWith('POLITICAL_CABINETS_V1')){
  prompt+='\nОЦЕНКА МИРА: worldSituation — все войны, накопленные захваты, доля потерянного производства, армии за рубежом и потери; exposure — твои соседи, договоры и силы у границы. Оцени цену окончательной победы расширяющейся державы для своих интересов и цену бездействия. Коалиция не предписана историей. Нейтралитет обоснуй с условием/сроком пересмотра; при растущей угрозе выбирай предметную помощь, совместное сдерживание, мобилизацию, размещение, флот или вмешательство через реальные effects. Не повторяй протест вместо продолжения политики. Обещание помощи не является поставкой.';
 }
 return conquestOldAsk(prompt,...args);
};
const conquestOldAdvance=advanceGameDays;
advanceGameDays=function(n){const out=conquestOldAdvance(n);conquestScan();return out;};
const conquestOldReset=resetGame;
resetGame=function(...args){const out=conquestOldReset(...args);conquestState().observed=JSON.stringify(scenarioProvinces.map(p=>[p.id,strategyOwner(p),strategyControl(p)]));conquestRefreshGovernments();return out;};
window.CONQUEST_WORLD_BALANCE=true;
