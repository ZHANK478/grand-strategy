/* Confirmed news coverage, persistent diplomatic issues and personal court continuity.
   No extra recurring model call. Untrusted model output never creates unvalidated effects. */
'use strict';
function ensureNewsFlow(){return worldState.newsFlow||(worldState.newsFlow={issues:[],published:[],scenes:[]});}
function repairPlannerOrders(raw,pending){
 const list=Array.isArray(raw)?raw:[],out=[];
 pending.forEach((p,index)=>{
  const matches=list.filter(o=>o&&typeof o==='object'&&(o.id===p.id||o.id==='O'+(index+1)));
  const distinct=[...new Map(matches.map(o=>[JSON.stringify({kind:o.kind,status:o.status,effects:o.effects,process:o.process}),o])).values()];
  let item;
  if(distinct.length===1){item=JSON.parse(JSON.stringify(distinct[0]));item.id=p.id;delete item.text;
   if(item.kind==='political'&&item.effects&&Object.keys(item.effects).length){const keys=Object.keys(item.effects),kind=Object.entries(OrderRules.KIND_FIELDS).find(([k,fields])=>!['political','unsupported'].includes(k)&&keys.every(x=>fields.includes(x)));if(kind)item.kind=kind[0];}
   if(item.effects?.army_delta>0&&!item.process){const duration=politicalDuration(p.text);if(duration)item.process={mode:'recruitment',days:Math.max(90,duration),summary:'Набор и подготовка в течение '+duration+' дней'};}if(!item.effects||typeof item.effects!=='object'||Array.isArray(item.effects))item.effects={};
   if(item.status==='execute'&&item.kind!=='political'&&!Object.keys(item.effects).length)item=null;
   
  }
  if(!item)item={id:p.id,kind:'unsupported',status:'defer',reason:distinct.length?'Исполнитель прислал противоречивые варианты. Указ сохранён для уточнения на следующем ходе.':'Исполнитель не подготовил ответ на этот указ. Он сохранён для следующего хода.',effects:{},
   article:{headline:'Кабинет продолжит подготовку решения',body:'Поручение главы государства «'+p.text+'» остаётся на рассмотрении исполнителей. Изменения по этому поручению пока не вступили в силу. Указ сохранён и будет рассмотрен при следующем ходе.'}};
  if(item.status==='defer'&&item.kind==='unsupported')item.technicalError=item.reason;
  if(item.status!=='execute'&&/нет (?:механик|движк)|не (?:реализован|поддержива)|не предусмотрен|not implemented/i.test(item.reason||'')){item.status='defer';item.kind='unsupported';item.effects={};item.technicalError=item.reason;item.reason='Исполнитель должен уточнить способ исполнения. Это ошибка обработки, а не запрет государственного действия.';}
  out.push(item);
 });return out;
}
function newsClean(value){
 let s=String(value??'');
 const words={executed:'исполнен',in_progress:'в работе',blocked:'встретил препятствие',failed:'сорван',rejected:'отклонён',deferred:'отложен',prepared:'подготовлен',active:'в работе',completed:'завершён',accepted:'принято',pending:'ожидает ответа',open:'ожидает ответа',closed:'закрыто',recruitment:'набор и подготовка',implementation:'исполнение',referendum:'голосование'};
 Object.entries(words).forEach(([a,b])=>s=s.replace(new RegExp('\\b'+a+'\\b','g'),b));
 return s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'запись исполнения').replace(/::[a-z_]+/g,'');
}
function newsEffectSummary(e){
 const out=[];
 if(e.economy)Object.entries(e.economy).forEach(([k,v])=>out.push((ECON_GROUPS?.[k.replace('tax_','')]||k)+': налог '+v+'%'));
 if(e.society)Object.entries(e.society).forEach(([k,v])=>out.push(({education_spending:'Образование',welfare_spending:'Помощь населению',infrastructure_spending:'Инфраструктура'})[k]+': '+v+' млн р.е./мес.'));
 if(e.law_slots)Object.entries(e.law_slots).forEach(([slot,id])=>out.push((LAW_SLOTS[slot]?.label||slot)+': '+(lawOption(slot,id)?.label||id)));
 if(e.army_delta!=null)out.push('Изменение численности армии: '+e.army_delta);
 if(e.debt_delta!=null)out.push('Изменение долга: '+e.debt_delta+' млн р.е.');
 if(e.pm_name)out.push('Глава правительства: '+e.pm_name);if(e.ruler_name)out.push('Глава государства: '+e.ruler_name);
 if(e.government)out.push('Государственное устройство: '+e.government);
 if(e.economic_policy){const p=e.economic_policy;out.push('Экономическая программа: '+({tax:'налоги',spending:'расходы',ownership:'собственность',coordination:'координация производства',tariff:'пошлины',financing:'финансирование'})[p.type]+(p.days?' · '+p.days+' дней':''));}
 if(e.court_scene)out.push('Личные обстоятельства: '+e.court_scene.description);
 if(e.political_task)out.push('Поручение: '+e.political_task.goal);
 if(e.map_objects)out.push('На карте: '+e.map_objects.map(o=>o.label||o.location||'перемещение объекта').join('; '));
 return out.join('\n');
}
function newsOrderDetails(o){
 const e=o.effects||{};
 return (ORDER_STATUS[o.status]||newsClean(o.status))+': '+o.text+'\n'+newsClean(o.reason||'')+
  (Object.keys(e).length?'\n'+newsEffectSummary(e):'')+(o.processId?'\nИсполнение продолжается по календарю.':'');
}
function newsFallbackArticle(o,phase='decision'){
 const ruler=countries[playerCountry].ruler;
 const progress=o.status==='in_progress',ok=o.status==='executed';
 return {headline:phase==='completion'?'Завершено распоряжение главы государства':progress?'Правительство приступило к исполнению решения':ok?'Новое решение главы государства':'Кабинет сообщил о препятствии',
 body:(ruler||'Глава государства')+' распорядился: «'+o.text+'». '+(phase==='completion'?'Исполнители завершили предусмотренную работу.':progress?'Исполнение началось; предусмотренные изменения будут происходить по установленному сроку.':ok?'Распоряжение вступило в силу.':'Поручение пока не исполнено; кабинет сообщил об обстоятельствах, мешающих его реализации.')+
 (ok||progress?' Дальнейшие последствия решения зависят от положения в стране и действий заинтересованных участников.':' '+newsClean(o.reason||''))};
}
function queueNewsIssue(sender,recipient,id,text,action){
 if(!recipient||recipient===sender||!countries[recipient])return;
 const f=ensureNewsFlow(),old=f.issues.find(i=>i.id===id&&i.recipient===recipient);if(old){if(action==='task_complete'){old.delivered=true;old.lastUpdate=gameDayNumber();old.text=(old.text+' Итог исполнения: '+text).slice(-1200);}return;}
 f.issues.push({id,sender,recipient,text:String(text).slice(0,800),action,status:'open',created:gameDayNumber(),turn});
 f.issues=f.issues.slice(-100);
 const registry=ensureWorldActors(),actor=registry[recipient+'::government']||registry[recipient+'::cabinet'];
 if(actor){actor.issue={orderId:id,text,day:gameDayNumber()};actorRemember(actor,'Требует позиции правительства: '+sender+' — '+text);}
}
function newsHash(s){let a=2166136261,b=3339675911;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),2246822519);}return 'h:'+(a>>>0).toString(16)+':'+(b>>>0).toString(16)+':'+s.length;}
function newsSignalState(country,target){
 const facts=n=>{const c=countries[n];return c?{government:c.government,army:Math.floor(c.army/5000),war:isAtWar(country,target),
 deployments:(worldState.mapObjects||[]).filter(o=>o.owner===n&&['army','naval'].includes(o.type)).map(o=>[o.id,o.location,o.lon,o.lat,Math.floor((o.troops||0)/5000)])}:null;};
 return newsHash(JSON.stringify([facts(country),facts(target)]));
}
const newsOldSelected=politicalActorsForTurn;
politicalActorsForTurn=function(){
 const f=ensureNewsFlow(),urgent=f.issues.filter(i=>i.status==='open'&&i.recipient!==playerCountry&&countries[i.recipient]&&!countries[i.recipient].annexed);
 urgent.sort((a,b)=>a.created-b.created);
 const direct=ensureOrders().flatMap(o=>mentionedPoliticalCountries(o.text)).filter(n=>n!==playerCountry);
 return [...new Set([...direct,...urgent.map(i=>i.recipient),...newsOldSelected()])].slice(0,8);
};
const newsOldContext=politicalContext;
politicalContext=function(){
 const c=newsOldContext(),selected=new Set([playerCountry,...c.countries.map(x=>x.facts.id)]),f=ensureNewsFlow();
 c.issues=f.issues.filter(i=>i.status==='open'&&selected.has(i.recipient)).slice(0,16);
 c.court=Object.fromEntries([...selected].map(id=>[id,countries[id].court||null]));
 c.actors.forEach(a=>{const real=ensureWorldActors()[a.id];a.issue=real?.issue||null;a.lastSignals=Object.keys(real?.lastNewsSignals||{}).slice(-8);});
 c.previousHeadlines=f.published.slice(-20).map(p=>({headline:p.headline,actors:p.actors,turn:p.turn}));
 return c;
};
const newsOldDecision=executePoliticalDecision;
executePoliticalDecision=function(d,results){
 const a=ensureWorldActors()[d.actor_id];if(!a)return false;
 const f=ensureNewsFlow();worldState.currentNewsActors||=[];
 if(d.condition_actor&&!worldState.currentNewsActors.includes(d.condition_actor))return false;
 if(d.responds_to&&!f.issues.some(i=>i.id===d.responds_to&&i.recipient===a.country&&i.status==='open'))return false;
 const repeatable=['warn','condemn','negotiate','support','oppose','petition'].includes(d.action),signal=d.action+'|'+(d.target||''),own=countries[a.country],state=repeatable?(a.kind==='government'?newsSignalState(a.country,d.target):JSON.stringify({government:own.government,laws:own.lawSlots,taxes:Object.values(own.economy.classes).map(g=>g.tax),spending:own.society?.spending,health:own.court?.health,army:Math.floor(own.army/5000)})):null;
 const pursuitState=d.action==='pursue'?newsSignalState(a.country,d.task?.target||d.target):null;
 const pursuitWords=d.action==='pursue'?newsWords((d.task?.goal||'')+' '+(d.task?.target||d.target||'')):null;
 const duplicatePursuit=d.action==='pursue'&&!d.responds_to&&(a.newsPursuits||[]).some(p=>{const common=p.words.filter(w=>pursuitWords.has(w)).length;return p.state===pursuitState&&p.effects===JSON.stringify(d.task?.effects||{})&&common/Math.max(1,Math.max(p.words.length,pursuitWords.size))>=.65;});
 if((repeatable&&a.lastNewsSignals?.[signal]===state)||duplicatePursuit){
  a.goal=d.goal;a.lastPoliticalTurn=turn;actorRemember(a,'Прежняя позиция сохраняется. Повтор заявления без новых обстоятельств не является новым событием.');
  return false;
 }
 const start=(worldState.periodEvents||[]).length,previousAction=worldState.currentNewsAction;worldState.currentNewsAction=d.action;let ok;try{ok=newsOldDecision(d,results);}finally{worldState.currentNewsAction=previousAction;}if(!ok)return ok;
 worldState.currentNewsActors.push(d.actor_id);
 if(repeatable){a.lastNewsSignals||={};delete a.lastNewsSignals[signal];a.lastNewsSignals[signal]=state;a.lastNewsSignals=Object.fromEntries(Object.entries(a.lastNewsSignals).slice(-8));}
 if(d.action==='pursue'){a.newsPursuits=[...(a.newsPursuits||[]),{state:pursuitState,words:[...pursuitWords],effects:JSON.stringify(d.task?.effects||{})}].slice(-8);}
 if(d.responds_to&&d.action!=='wait'){const issue=f.issues.find(i=>i.id===d.responds_to&&i.recipient===a.country);if(issue){issue.status='answered';issue.answer={actor:d.actor_id,action:d.action,text:d.body,day:gameDayNumber()};}}
 const events=(worldState.periodEvents||[]).slice(start);events.forEach(e=>{e.decisionActor=d.actor_id;e.newsKey=d.actor_id+'|'+d.action+'|'+(d.target||'')+'|'+(d.responds_to||'')+'|'+state;e.respondsTo=d.responds_to||null;});
 if(d.action!=='wait'&&d.target)queueNewsIssue(a.country,d.target,d.actor_id+':'+turn+':'+d.action,d.goal+'. '+d.motive,d.action);
 return ok;
};
const newsOldApply=applyOrderPlan;
applyOrderPlan=function(plan){
 worldState.currentNewsActors=[];
 if(plan.politics){const waiting=plan.politics.slice(),ordered=[];
  while(waiting.length){const i=waiting.findIndex(d=>!d.condition_actor||ordered.some(x=>x.actor_id===d.condition_actor)||!waiting.some(x=>x.actor_id===d.condition_actor));
   if(i<0){plan.politicalErrors||=[];waiting.forEach(d=>plan.politicalErrors.push({actor:d.actor_id,error:'Циклическая зависимость политических решений'}));break;}
   ordered.push(waiting.splice(i,1)[0]);}plan.politics=ordered;
 }
 const start=(worldState.periodEvents||[]).length,results=newsOldApply(plan);
 for(const o of results){
  if(!['executed','in_progress','blocked','failed','rejected','deferred'].includes(o.status))continue;
  let event=worldState.periodEvents.slice(start).findLast(e=>e.sourceOrder===o.id&&!e.actor);
  const article=['executed','in_progress'].includes(o.status)?plan.articles?.[o.id]||newsFallbackArticle(o):newsFallbackArticle(o);
  if(!event){recordWorldEvent('domestic',article.headline,article.body,[playerCountry],newsOrderDetails(o));event=worldState.periodEvents.at(-1);}
  Object.assign(event,{sourceOrder:o.id,phase:'decision',coverage:true,details:newsOrderDetails(o),priority:10});
  o.newsHeadline=event.headline;o.newsBody=event.body;
  const targets=mentionedPoliticalCountries(o.text).filter(n=>n!==playerCountry);
  if(['executed','in_progress'].includes(o.status))targets.forEach(n=>queueNewsIssue(playerCountry,n,o.id,o.text,'player_order'));
 }
 return results;
};
const newsOldFinishTask=finishPoliticalTask;
finishPoliticalTask=function(t){
 const start=(worldState.periodEvents||[]).length;newsOldFinishTask(t);
 const events=worldState.periodEvents.slice(start),order=worldState.orders.find(o=>o.id===t.source);
 events.forEach(e=>{e.sourceTask=t.id;e.phase=t.days===0?'decision':'completion';e.coverage=!!order;
  if(order){e.sourceOrder=order.id;e.headline=order.newsHeadline?'Итог: '+order.newsHeadline:'Завершено решение главы государства';e.body=t.status==='executed'?t.result:t.goal+'. '+newsClean(t.reason);e.details=newsOrderDetails(order);}
  else {e.headline=(countries[t.country].displayName||t.country)+': завершено — '+(t.headline||'политическое поручение');e.body=t.executor+' завершил работу по поручению «'+t.goal+'». '+(t.status==='executed'?'Исполнение поручения зарегистрировано: '+t.result:newsClean(t.reason));e.details=newsClean(t.reason||'');}
 });
 if(t.status==='executed'&&t.target){const origin=t.newsIssueId||(order?t.source:worldState.currentNewsAction?t.source+':'+turn+':'+worldState.currentNewsAction:t.id);queueNewsIssue(t.country,t.target,origin,t.result,'task_complete');}
};
const newsOldTick=tickExecutiveProcesses;
tickExecutiveProcesses=function(){
 const running=ensureExecutiveProcesses().filter(p=>p.status==='active').map(p=>({id:p.id,troops:p.delivered||0,status:p.status}));
 const economic=ALL_COUNTRIES.flatMap(id=>(countries[id].econV3?.programs||[]).filter(p=>p.status==='active').map(p=>({id:p.id,country:id,order:p.orderId})));
 const result=newsOldTick();
 for(const old of running){
  const p=ensureExecutiveProcesses().find(p=>p.id===old.id),o=worldState.orders.find(o=>o.id===old.id);if(!p||!o)continue;
  const fraction=(p.delivered||0)/Math.max(1,p.totalRecruit||p.reservedTroops||1),milestone=Math.floor(fraction*4),last=p.newsMilestone||0;
  if(p.mode==='recruitment'&&milestone>last&&milestone<4){p.newsMilestone=milestone;
   recordWorldEvent('domestic','Пополнения поступают в армию','Подготовка новых частей по распоряжению «'+o.text+'» продолжается. Уже '+(p.delivered||0).toLocaleString('ru')+' подготовленных солдат включены в вооружённые силы. Набор ещё не завершён.',[playerCountry],newsOrderDetails(o));
   Object.assign(worldState.periodEvents.at(-1),{sourceOrder:o.id,phase:'progress-'+milestone,coverage:true,priority:9});
  }
  if(p.status!=='active'&&!p.newsFinished){p.newsFinished=true;
   recordWorldEvent('domestic',p.mode==='recruitment'?'Завершена подготовка армейских пополнений':'Итог исполнения распоряжения',
    p.mode==='recruitment'&&p.status==='executed'?'Военное ведомство завершило набор по распоряжению «'+o.text+'». '+(p.totalRecruit||p.reservedTroops).toLocaleString('ru')+' солдат прошли подготовку и пополнили действующую армию. Их дальнейшее содержание оплачивается из государственного бюджета.':
    'Исполнители доложили об итогах распоряжения «'+o.text+'». '+newsClean(o.reason),[playerCountry],newsOrderDetails(o));
   Object.assign(worldState.periodEvents.at(-1),{sourceOrder:o.id,phase:'completion',coverage:true,priority:10});
  }
 }
 for(const old of economic){const p=countries[old.country].econV3.programs.find(x=>x.id===old.id);if(p?.status==='completed'&&!p.newsCovered){
  p.newsCovered=true;const o=worldState.orders.find(x=>x.id===old.order);if(!o)continue;const article=newsFallbackArticle(o,'completion');
  recordWorldEvent(old.country===playerCountry?'domestic':'foreign',article.headline,article.body,[old.country],newsOrderDetails(o));Object.assign(worldState.periodEvents.at(-1),{sourceOrder:o.id,phase:'completion',coverage:true,priority:10});
 }}
 return result;
};
function validateCourtScene(s,c){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['description','participants','duration_days','health'].includes(k)))throw Error('Неверная придворная сцена');
 if(typeof s.description!=='string'||s.description.length<3||s.description.length>1200||OrderRules.INVALID_FICTION.test(s.description))throw Error('Неверное личное событие');
 if(!Number.isInteger(s.duration_days)||s.duration_days<0||s.duration_days>3650)throw Error('Неверный срок личного события');
 if(!Array.isArray(s.participants)||s.participants.length>8)throw Error('Неверные участники');
 s.participants.forEach(p=>{if(!p||Object.keys(p).some(k=>!['name','role'].includes(k))||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.role!=='string'||p.role.length>100)throw Error('Неверный персонаж');});
 if(s.health!=null&&!['ill','recovering','well'].includes(s.health))throw Error('Неверное состояние здоровья');
}
OrderRules.KIND_FIELDS.narrative=['court_scene'];
const newsOldOrderContext=orderContext;
orderContext=function(){return {...newsOldOrderContext(),validateCourtScene};};
const newsOldEffects=OrderRules.validateEffects;
OrderRules.validateEffects=function(raw,ctx,scope,kind){
 if(kind!=='narrative')return newsOldEffects(raw,ctx,scope,kind);
 if(!raw||Object.keys(raw).length!==1||!raw.court_scene)throw Error('Нарратив не может менять экономику или войска');
 validateCourtScene(raw.court_scene,ctx.countries[ctx.player]);return JSON.parse(JSON.stringify(raw));
};
function applyCourtScene(owner,s){
 validateCourtScene(s,countries[owner]);const c=countries[owner];c.court||={people:[],scenes:[],health:'well'};
 s.participants.forEach(p=>{const old=c.court.people.find(x=>x.name===p.name);if(old)old.role=p.role;else c.court.people.push({...p});});
 c.court.people=c.court.people.slice(-24);if(s.health)c.court.health=s.health;
 const scene={...s,id:crypto.randomUUID(),start:gameDayNumber(),due:gameDayNumber()+s.duration_days,status:s.duration_days?'active':'completed',date:dateLabel()};
 c.court.scenes.push(scene);c.court.scenes=c.court.scenes.slice(-12);
 recordWorldEvent(owner===playerCountry?'domestic':'foreign','Известия из резиденции главы государства',s.description,[owner],'Участники: '+s.participants.map(p=>p.name+' — '+p.role).join('; ')+(s.duration_days?'. Обстоятельства сохраняются до '+processDate(scene.due)+'.':''));
 return scene;
}
const newsOldExecuteEffects=executeOrderEffects;
executeOrderEffects=function(e){const copy=JSON.parse(JSON.stringify(e));if(copy.court_scene){applyCourtScene(playerCountry,copy.court_scene);delete copy.court_scene;}return newsOldExecuteEffects(copy);};
const newsOldForeignEffects=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,e){if(kind==='narrative'){OrderRules.validateEffects(e,{...orderContext(),player:owner},'order',kind);applyCourtScene(owner,e.court_scene);return {status:'executed',reason:'Личное событие сохранено в истории двора'};}return newsOldForeignEffects(owner,kind,e);};
const newsOldAdvance=advanceGameDays;
advanceGameDays=function(n){const result=newsOldAdvance(n);for(const id of ALL_COUNTRIES){const court=countries[id]?.court;if(!court)continue;court.scenes.filter(s=>s.status==='active'&&s.due<=gameDayNumber()).forEach(s=>{
 s.status='completed';if(s.health==='ill'&&court.health==='ill')court.health='recovering';
 recordWorldEvent(id===playerCountry?'domestic':'foreign','Новые известия из резиденции',s.description+' Установленный для этих обстоятельств срок завершился. '+(s.health==='ill'?'Состояние главы государства теперь обозначено как восстановление; выздоровление и политические последствия ещё не предрешены.':'Событие осталось в памяти участников и может влиять на дальнейшие разговоры.'),[id]);
 });}return result;};
function newsKey(e){if(e.sourceOrder)return 'order|'+e.sourceOrder+'|'+(e.phase||'decision');if(e.newsKey)return e.newsKey;if(e.sourceTask)return 'task|'+e.sourceTask+'|'+(e.phase||'decision');return e.headline+'|'+e.body;}
function newsUnique(list){
 const keys=new Set(),text=new Set();return list.filter(a=>{const key=newsKey(a),line=(a.headline+' '+a.body).toLowerCase().replace(/[^а-яёa-z0-9]+/g,' ');
  if(keys.has(key)||text.has(line))return false;keys.add(key);text.add(line);return true;});
}
const newsOldBuild=buildNewspaper;
buildNewspaper=function(before,results,events,start){
 const edition=newsOldBuild(before,results,events,start);
 const previous=before[playerCountry],current=countries[playerCountry];
 edition.summary={executed:results.filter(o=>o.status==='executed').length,progress:results.filter(o=>o.status==='in_progress').length,obstacles:results.filter(o=>['blocked','failed','rejected'].includes(o.status)&&!o.technicalError).length,technical:results.filter(o=>o.technicalError).length,cash:current.treasury-previous.treasury,army:current.army-previous.army};
 edition.receipts=results.map(o=>({id:o.id,text:o.text,status:o.status,reason:o.reason}));
 edition.orderCoverage=results.map(o=>{const a=o.newsHeadline?{headline:o.newsHeadline,body:o.newsBody}:newsFallbackArticle(o);return {...a,sourceOrder:o.id,phase:'decision',coverage:true,actors:[playerCountry],details:newsOrderDetails(o),priority:10};});
 return edition;
};
writeNewspaper=async function(edition){
 const flow=ensureNewsFlow(),all=worldState.periodEvents||[],own=[...all.filter(e=>e.section==='domestic'),...(edition.orderCoverage||[]).filter(e=>!all.some(a=>a.sourceOrder===e.sourceOrder&&a.phase==='decision'))],abroad=all.filter(e=>e.section==='foreign');
 let cover=[...new Map(own.filter(e=>e.coverage).map(e=>[newsKey(e),e])).values()];
 cover=cover.filter(e=>!e.phase?.startsWith('progress-')||(!cover.some(x=>x.sourceOrder===e.sourceOrder&&x.phase==='completion')&&!cover.some(x=>x.sourceOrder===e.sourceOrder&&x.phase?.startsWith('progress-')&&x.phase>e.phase)));
 const grouped=new Set();
 for(const primary of cover){
  const reactions=own.filter(e=>!e.coverage&&e.sourceOrder===primary.sourceOrder);
  if(reactions.length){primary.body+='\n\n'+[...new Set(reactions.map(e=>e.body))].join(' ');primary.details+='\n'+reactions.map(e=>e.details||'').filter(Boolean).join('\n');reactions.forEach(e=>grouped.add(e));}
 }
 const reaction=own.filter(e=>!e.coverage&&e.decisionActor&&!grouped.has(e)),other=own.filter(e=>!e.coverage&&!e.decisionActor&&!grouped.has(e));
 const protectedKeys=new Set(cover.map(e=>e.sourceOrder));
 const fallback=edition.domestic.filter(e=>!own.some(a=>a.headline===e.headline&&a.body===e.body)&&/Образование даёт|Бедность |Власть теряет|Положение власти|Общественное недовольство|Военные известия|Дипломатические известия|Смена главы государства/.test(e.headline));
 edition.domestic=newsUnique([...cover,...reaction,...other.filter(e=>!cover.length||!/Началась кампания набора|Правительство приступило к исполнению решения/.test(e.headline)),...fallback]);
 // Preserve every player's decision and lifecycle event; no three-article cap.
 const foreignFallback=edition.foreign.filter(e=>!abroad.some(a=>a.body===e.body)&&(!abroad.length||/Военные известия|Дипломатические известия|Политические известия|Смена главы государства/.test(e.headline)));
 const ranked=newsUnique([...abroad,...foreignFallback]).filter(e=>!flow.published.some(p=>p.key===newsKey(e)&&!e.coverage));
 ranked.sort((a,b)=>Number(!!b.respondsTo)-Number(!!a.respondsTo)+(b.priority||0)-(a.priority||0)+foreignNewsWeight(b)-foreignNewsWeight(a));
 edition.foreign=ranked.slice(0,7);
 if(ranked.length>7)edition.foreign.push({headline:'Другие международные известия',body:'Дополнительные события этого периода доступны ниже.',details:ranked.slice(7).map(e=>e.headline+'\n'+e.body).join('\n\n'),actors:[]});
 ['domestic','foreign'].forEach(section=>{edition[section].forEach(a=>{a.details=newsClean(a.details||'').replace(/Проверенные эффекты: \{[^\n]*\}/g,'Численные изменения проверены движком.');flow.published.push({key:newsKey(a),headline:a.headline,actors:a.actors||[],turn});});});
 flow.published=flow.published.slice(-160);edition.editor='political-actions';
 return edition;
};
const newsOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt!=='string'||!prompt.includes('Свободные приказы:'))return newsOldAsk(prompt,...args);
 const pending=ensureOrders().filter(o=>!o.fixedEffects&&(!worldState.retryingOrderIds||worldState.retryingOrderIds.includes(o.id))),aliases=new Map(pending.map((o,i)=>[o.id,'O'+(i+1)]));
 for(const [id,alias]of aliases)prompt=prompt.split(id).join(alias);
 prompt+='\nПРОЗРАЧНОСТЬ И ДИНАМИКА. Каждый приказ обязательно получает свой результат и газетную article, даже встреча, отправка послов, начало подготовки или незавершённая программа. Не пропускай приказы. Для каждого входящего issues оцени интересы адресата и дай ответ или конкретное собственное политическое действие с responds_to:ID вопроса. Ответы должны касаться конкретного обращения, а не общего улучшения отношений. Если новое решение другого участника в этом же JSON требует ответа, адресат может дать своё решение с condition_actor:точный ID инициатора; оно исполнится только после реального действия инициатора. Не утверждай чужое согласие. Выбранные правительства могут сопротивляться, торговаться, искать союзников или действовать самостоятельно. Не повторяй предупреждение/давление/переговоры против того же адресата без нового шага; lastSignals и previousHeadlines показывают прежнюю позицию. Продолжай кампанию следующим действием или сохраняй курс без новой статьи. Отдавай приоритет конкретным реакциям на действия других стран. Личные события главы государства, встречи с наследником, болезнь, семейные и придворные обстоятельства — часть игры. Используй kind:"narrative",effects:{court_scene:{description:"конкретное событие",participants:[{name:"имя",role:"роль"}],duration_days:0..3650,health:"ill|recovering|well если нужно"}}. Береги имена из court.people; если человек ещё не определён, выбери правдоподобного персонажа и сохрани его. Нарратив не создаёт войска, деньги, титулы или смерть по утверждению. Личные события должны влиять на темы разговоров и интересы кабинета; не превращай их только в отчёт. Смерть/назначения остаются отдельными проверяемыми эффектами.';
 
 let raw=await newsOldAsk(prompt,...args);
 let data;try{data=parseOrderReply(raw);}catch{return raw;}
 const known=Array.isArray(data.orders)?data.orders.filter(o=>o&&typeof o==='object'):[];
 const missing=pending.filter(o=>!known.some(x=>x.id===o.id||x.id===aliases.get(o.id)));
 const selected=politicalActorsForTurn(),politics=Array.isArray(data.politics)?data.politics.filter(x=>x&&typeof x==='object'):[];
 if(missing.length||(!window.POLITICAL_SUBJECTS&&!politics.length&&selected.length)){
  const context=politicalContext();
  const repair='Исправь неполный ответ исполнителя. Верни только JSON {orders:[],politics:[]}. Не повторяй уже подготовленные приказы. Для каждого из перечисленных ниже недостающих приказов нужен результат с тем же id, kind,status,reason,effects,article. Для выбранных правительств нужен собственный политический шаг или осмысленное ожидание. Не выдумывай согласие другой страны. Схема типов и правила из предыдущего задания действуют.\\n'+
   'Недостающие приказы: '+JSON.stringify(missing.map(o=>({id:aliases.get(o.id),text:o.text})))+'\\nВыбранные правительства: '+JSON.stringify(selected)+'\\nОбстановка: '+JSON.stringify(context)+
   '\\nДопустимые типы: tax:{economy:{tax_noble,tax_burgher,tax_commons,tax_peasants,tax_middle}}, army:{army_delta} с process:{mode:"recruitment",days,summary}, law:{law_slots:{women:"none|partial|equal",education:"church|partial|universal"}}, political:{political_task:{goal,executor,target?,days,cost,result,headline,body,kind?,effects?}}, narrative:{court_scene:{description,participants:[{name,role}],duration_days,health:"ill|recovering|well"}}. Иные политические и экономические виды разрешены по первоначальной схеме. Правительствам: actor_id точный ID::government,goal,action строка wait|warn|condemn|pursue|mobilize|negotiate|offer_alliance|offer_nonaggression|offer_peace|accept|reject_offer|war|deploy|tax|spending,target?,motive,headline,body,task?,responds_to?,condition_actor?. Внутренним участникам доступны support|oppose|petition|protest. Строки article должны быть объектами, не отдельными элементами массива. Пиши кратко и закончи весь JSON.';
  const repairSchema=repair+'\nПоля по видам: '+JSON.stringify(OrderRules.KIND_FIELDS)+'\nЗаконы: '+econLawSpecForPrompt()+'\nГосударственные устройства: '+JSON.stringify(activeScenario.rules?.governments||[])+'\neconomic: economic_policy с type ownership/coordination/tax/spending/tariff/financing. ownership:sector agriculture/industry/resources/services,target 0..1,compensation boolean,days; coordination:target market/regulated/planned,days; tax:group noble/burgher/commons/peasants/middle,target 0..100,days; spending:group education/welfare/infrastructure,target месячная сумма,days; tariff:target 0..100; financing:automaticBorrowing/monetaryFinancing boolean. finance:debt_delta положительный заём или отрицательное погашение. Личные события narrative не создают деньги или войска.';
  const repairArgs=args.slice();repairArgs[1]=0;
  try{
   const more=parseOrderReply(await newsOldAsk(repairSchema,...repairArgs));
   const ids=new Set(missing.flatMap(o=>[o.id,aliases.get(o.id)]));
   data.orders=[...known,...(Array.isArray(more.orders)?more.orders.filter(o=>o&&typeof o==='object'&&ids.has(o.id)):[])];
   const used=new Set(politics.map(d=>d.actor_id));data.politics=[...politics,...(Array.isArray(more.politics)?more.politics.filter(d=>d&&typeof d==='object'&&!used.has(d.actor_id)):[])].slice(0,12);
  }catch{}
 }

 if(Array.isArray(data.orders))data.orders.forEach(o=>{for(const [id,alias]of aliases)if(o.id===alias)o.id=id;});
 if(Array.isArray(data.politics))data.politics.forEach(d=>{for(const [id,alias]of aliases)if(d?.condition_order===alias)d.condition_order=id;});
 return JSON.stringify(data);
};

const newsOldActorNotice=actorNotice;
actorNotice=function(a,headline,body,details='',priority=3){
 const start=(worldState.periodEvents||[]).length,result=newsOldActorNotice(a,headline,body,details,priority);
 worldState.periodEvents.slice(start).forEach(e=>{if(a.country===playerCountry&&a.issue?.orderId)e.sourceOrder=a.issue.orderId;if(a.country!==playerCountry)e.headline=(countries[a.country].displayName||a.country)+': '+headline;});
 return result;
};
const newsOldActorReactions=recordActorReactions;
recordActorReactions=function(results){
 worldState.newsReactedOrders||=[];
 const fresh=results.filter(o=>!worldState.newsReactedOrders.includes(o.id));
 newsOldActorReactions(fresh);
 fresh.filter(o=>['executed','in_progress'].includes(o.status)).forEach(o=>worldState.newsReactedOrders.push(o.id));
 worldState.newsReactedOrders=worldState.newsReactedOrders.slice(-200);
};

const newsOldStartTask=startPoliticalTask;
startPoliticalTask=function(owner,task,source){
 const start=(worldState.periodEvents||[]).length,result=newsOldStartTask(owner,task,source);
 if(result.task){const order=worldState.orders.find(o=>o.id===source);result.task.newsIssueId=order?source:source+':'+turn+':'+(worldState.currentNewsAction||'pursue');
  worldState.periodEvents.slice(start).forEach(e=>{e.sourceTask=result.task.id;if(order){e.sourceOrder=order.id;e.phase=task.days===0?'decision':e.phase||'decision';e.coverage=true;}});
 }
 return result;
};
function newsWords(s){return new Set(String(s||'').toLowerCase().split(/[^а-яёa-z0-9]+/).filter(t=>t.length>4).map(t=>t.slice(0,5)));}
const newsOldValidateDecision=validatePoliticalDecision;
validatePoliticalDecision=function(d){
 if(!d.responds_to&&d.action!=='wait'){
  const actor=ensureWorldActors()[d.actor_id],target=d.target||d.task?.target||d.task?.political_task?.target;
  const words=newsWords(d.goal+' '+(d.task?.goal||d.task?.political_task?.goal||''));
  const candidates=ensureNewsFlow().issues.filter(i=>i.status==='open'&&i.recipient===actor?.country&&i.sender===target)
   .map(i=>({i,score:[...newsWords(i.text)].filter(w=>words.has(w)).length})).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score||b.i.created-a.i.created);
  if(candidates.length)d.responds_to=candidates[0].i.id;
 }
 return newsOldValidateDecision(d);
};
