/* Saved executive processes. Dates and resources are owned by the engine. */
'use strict';
function gameDateUTC(y=year,m=month,d=day){const date=new Date(0);date.setUTCFullYear(y,m,d);date.setUTCHours(0,0,0,0);return date;}
function gameDayNumber(){return Math.floor(gameDateUTC().getTime()/86400000);}
function daysInGameMonth(y,m){return gameDateUTC(y,m+1,0).getUTCDate();}
function daysUntilNextMonth(){return daysInGameMonth(year,month)-day+1;}
function gameMonthTarget(count){return Math.floor(gameDateUTC(year,month+count,Math.min(day,daysInGameMonth(year,month+count))).getTime()/86400000);}
function advanceGameDays(count){
 const all={econ:[],deaths:[],months:0};
 for(let i=0;i<count;i++){
  day++;let boundary=false;
  if(day>daysInGameMonth(year,month)){day=1;month++;if(month>=12){month=0;year++;}boundary=true;}
  week=Math.floor((day-1)/7);
  tickExecutiveProcesses();
  tickWorldActors();
  if(boundary){const r=runMonthlyBoundary();all.econ=r.econ;all.deaths.push(...r.deaths);all.months++;}
 }
 return all;
}
function processDate(number){const date=new Date(number*86400000);return date.getUTCDate()+'.'+(date.getUTCMonth()+1)+'.'+date.getUTCFullYear();}
function ensureExecutiveProcesses(){return worldState.executiveProcesses||(worldState.executiveProcesses=[]);}
function startExecutiveProcess(order,proposal){
 const c=countries[playerCountry],effects=JSON.parse(JSON.stringify(proposal.effects));
 let meta=proposal.process;
 if(effects.army_delta>0)meta={mode:'recruitment',days:Math.max(90,meta?.days||90),summary:meta?.summary||'Набор и подготовка новых солдат'};
 if(!meta)return false;
 const processes=ensureExecutiveProcesses();
 if(processes.filter(p=>p.status==='active').length>=16)throw Error('Слишком много действующих процессов');
 let cost=0,reservedTroops=0;
 if(meta.mode==='recruitment'){
  reservedTroops=effects.army_delta;cost=Math.ceil(reservedTroops*.002);
  const already=processes.filter(p=>p.status==='active'&&p.country===playerCountry).reduce((n,p)=>n+(p.reservedTroops||0),0);
  if(c.treasury<cost||c.army+already+reservedTroops>Math.round(c.population*1000*getEra().armyMaxShare))throw Error('Недостаточно казны или свободного населения для набора');
 }else if(meta.mode==='referendum')cost=Math.max(1,Math.round(c.income*.1));
 if(c.treasury<cost)throw Error('Недостаточно казны для организации');
 if(cost)changeCountryStat(playerCountry,'treasury',-cost);
 const minimum=meta.mode==='recruitment'?90:meta.mode==='referendum'?21:1;
 const duration=Math.max(minimum,meta.days);
 const process={id:order.id,country:playerCountry,mode:meta.mode,summary:meta.summary,kind:proposal.kind,effects,
  status:'active',start:gameDayNumber(),due:gameDayNumber()+duration,cost,reservedTroops};
 processes.push(process);
 order.status='in_progress';order.processId=process.id;order.reason=meta.summary+'. Начало '+dateLabel()+', завершение не ранее '+processDate(process.due)+'.';
 recordWorldEvent('domestic',meta.mode==='referendum'?'Правительство назначило народное голосование':meta.mode==='recruitment'?'Началась кампания набора':'Правительство приступило к исполнению решения',
  countries[playerCountry].ruler+' распорядился: '+order.text+'. Подготовка началась; итог пока не определён.',[playerCountry],
  'Статус: в работе. '+order.reason+' Расход организации: '+cost+'.');
 return true;
}
function tickExecutiveProcesses(){
 const list=ensureExecutiveProcesses();
 list.filter(p=>p.status==='active'&&p.due<=gameDayNumber()).forEach(p=>{
  const c=countries[p.country],order=worldState.orders.find(o=>o.id===p.id);
  if(!c||c.annexed||p.country!==playerCountry){p.status='failed';if(order){order.status='failed';order.reason='Исполнение потеряло действующую власть.';}return;}
  const completionBefore=orderStatSnapshot(c);
  let outcome,extra='';
  let checkedEffects=null;
  try{
   if(p.mode==='referendum'){
    const values=Object.values(c.economy?.classes||{}),support=values.length?values.reduce((n,v)=>n+(v.loyalty??50),0)/values.length:c.stability;
    const share=Math.max(1,Math.min(99,Math.round(support*.7+c.stability*.3+(Math.random()-.5)*20)));
    p.voteShare=share;extra='Поддержка на голосовании: '+share+'%. ';
    outcome=share>=50?OrderRules.authority({kind:p.kind,status:'execute',effects:p.effects,reason:'Большинство поддержало предложение.'},c):{status:'failed',reason:'Большинство не поддержало предложение.'};
   }else outcome=OrderRules.authority({kind:p.kind,status:'execute',effects:p.effects,reason:'Подготовка завершена.'},c);
   if(outcome.status==='executed'){
    if(p.mode==='recruitment'){
     if(c.army+p.reservedTroops>Math.round(c.population*1000*getEra().armyMaxShare))throw Error('Население больше не позволяет завершить набор');
     // The initial recruitment charge was paid when the process started.
     checkedEffects={army_delta:p.reservedTroops};
    }else{
     checkedEffects=OrderRules.validateEffects(p.effects,orderContext(),'order',p.kind);
    }
   }
  }catch(error){outcome={status:'blocked',reason:error.message};}
  // Unexpected application failures propagate to nextTurn's complete rollback.
  if(outcome.status==='executed'&&checkedEffects){
   if(p.mode==='recruitment')changeCountryStat(playerCountry,'army',p.reservedTroops);
   else executeOrderEffects(checkedEffects);
  }
  if(outcome.penalty)changeCountryStat(playerCountry,'stability',-outcome.penalty);

  p.status=outcome.status;p.finished=gameDayNumber();p.reason=extra+outcome.reason;
  if(order){order.status=outcome.status;order.resolvedTurn=turn;order.reason=p.reason;order.effects=outcome.status==='executed'?p.effects:{};order.after=orderStatSnapshot(countries[p.country]);}
  if(order&&outcome.status==='executed')recordActorReactions([{...order,before:completionBefore}]);
  recordWorldEvent('domestic',outcome.status==='executed'?'Завершено решение главы государства':'Решение встретило препятствие',
   p.summary+'. '+extra+(outcome.status==='executed'?'Подготовка закончена, решение вступило в силу.':outcome.reason),[p.country],
   'Приказ: '+(order?.text||p.summary)+'. Статус: '+outcome.status+'. '+p.reason+' Эффекты: '+JSON.stringify(outcome.status==='executed'?p.effects:{})+'.');
 });
 worldState.executiveProcesses=list.filter(p=>p.status==='active'||p.finished>=gameDayNumber()-365);
}
