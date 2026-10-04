/* Shared political actions, observations and persistent goals. No country-specific rules. */
'use strict';
const politicalAssert=(value,message)=>{if(!value)throw Error(message);};
const politicalText=(v,max=1200)=>{politicalAssert(typeof v==='string'&&v.trim()&&v.length<=max,'Некорректный политический текст');return v.trim();};
const politicalKeys=(o,allowed)=>{politicalAssert(o&&typeof o==='object'&&!Array.isArray(o),'Нужен объект');Object.keys(o).forEach(k=>politicalAssert(allowed.includes(k),'Неизвестное политическое поле: '+k));};
function politicalDuration(text){
 const numbers={'один':1,'одну':1,'одной':1,'одного':1,'два':2,'две':2,'двух':2,'три':3,'трёх':3,'четыре':4,'четырёх':4,'пять':5,'пяти':5,'шесть':6,'шести':6};
 const match=String(text).toLowerCase().match(/(?:за|через|в течение)\s+(\d+|один|одну|одной|одного|два|две|двух|три|трёх|четыре|четырёх|пять|пяти|шесть|шести)\s+(дн|ден|день|недел|месяц|год|лет)/);
 if(!match)return 0;
 const n=Number(match[1])||numbers[match[1]],factor=/недел/.test(match[2])?7:/месяц/.test(match[2])?30:/год|лет/.test(match[2])?365:1;
 return Math.min(3650,n*factor);
}
function ensurePolitics(){
 const p=worldState.politics||(worldState.politics={tasks:[],decisions:[],observations:{},round:0});
 p.tasks||=[];p.decisions||=[];p.observations||={};return p;
}
function countryPoliticalFacts(id){
 const c=countries[id],geo=politicalGeography();
 return {id,ruler:c.ruler,government:c.government,agenda:c.agenda||'Безопасность, самостоятельность и устойчивость власти',posture:worldState.actors?.[id+'::government']?.concern||null,warPreparation:worldState.actors?.[id+'::government']?.warPreparation||null,army:c.army,treasury:c.treasury,debt:c.debt,income:c.income,gdp:c.gdp,population:c.population,stability:c.stability,parliament:c.parliament,
 taxes:Object.fromEntries(Object.entries(c.economy?.classes||{}).map(([k,v])=>[k,{rate:v.tax,loyalty:v.loyalty}])),spending:c.society?.spending,poverty:c.society?.poverty,
 neighbors:[...(geo.neighbors[id]||[])],relations:selectPoliticalCountries(id,4).map(n=>({id:n,value:getRelation(id,n),war:isAtWar(id,n)})),
 deployments:(worldState.mapObjects||[]).filter(o=>o.owner===id).map(o=>({id:o.id,type:o.type,troops:o.troops,location:o.location,lon:o.lon,lat:o.lat})),
 records:(c.politicalRecords||[]).slice(-2).map(r=>({goal:r.goal,result:r.result.slice(0,350),date:r.date})),
 tasks:ensurePolitics().tasks.filter(t=>t.country===id&&['active','ready'].includes(t.status)).slice(-3).map(compactPoliticalTask)};
}
function politicalObservation(id){
 const state=ensurePolitics(),current=countryPoliticalFacts(id),old=state.observations[id],changes=[];
 if(!old)changes.push('Первичная оценка обстановки: собственные интересы и существующие угрозы.');
 else{
  ['army','government','stability','treasury','debt'].forEach(k=>{if(current[k]!==old[k])changes.push(k+': '+old[k]+' → '+current[k]);});
  if(JSON.stringify(current.deployments)!==JSON.stringify(old.deployments))changes.push('Изменение размещения сил: '+JSON.stringify(current.deployments));
  if(JSON.stringify(current.taxes)!==JSON.stringify(old.taxes))changes.push('Изменение налоговой нагрузки и поддержки групп.');
 }
 return {facts:current,changes};
}
function mentionedPoliticalCountries(text){
 const value=String(text).toLowerCase(),generic=new Set(['королевство','империя','империи','республика','конфедерация','султанат','область','земли','союзе']);
 return ALL_COUNTRIES.filter(id=>countries[id]&&!countries[id].annexed&&id.split('(')[0].toLowerCase().split(/[^а-яёa-z]+/).filter(t=>t.length>=4&&!generic.has(t)).some(t=>value.includes(t.slice(0,Math.min(5,t.length)))));
}
function bindPoliticalMandate(task,original,article){
 const expected=mentionedPoliticalCountries(original).filter(n=>n!==playerCountry);
 task.sourceMandate=original;
 completePoliticalTask(task,article||{});
 const interpreted=mentionedPoliticalCountries(task.goal+' '+task.result+' '+(task.target||''));
 if(expected.length&&!expected.some(n=>interpreted.includes(n))&&(!task.effects||!Object.keys(task.effects).length)){
  task.goal=original;task.executor='Министр иностранных дел';task.target=expected[0];task.targets=expected;
  task.result='Исполнитель направил официальное поручение по решению главы государства: '+original;
  task.headline='Правительство выступило с дипломатической инициативой';
  task.body=countries[playerCountry].ruler+' поручил внешнеполитическому ведомству: «'+original+'». Дипломаты начинают контакты с адресатами. Ответы иностранных правительств и окончательный результат не предрешены.';
  if(article){article.headline=task.headline;article.body=task.body;}
  task.interpretationCorrected=true;
 }else if(expected.length)task.targets=expected;
 return task;
}
function politicalActorsForTurn(){
 const state=ensurePolitics(),live=ALL_COUNTRIES.filter(n=>n!==playerCountry&&countries[n]&&!countries[n].annexed);
 const changed=live.filter(n=>politicalObservation(n).changes.length&&state.observations[n]);
 const peers=selectPoliticalCountries(playerCountry,5);
 const rotating=live.length?live[state.round%live.length]:null;
 const direct=ensureOrders().flatMap(o=>mentionedPoliticalCountries(o.text)).filter(n=>n!==playerCountry);
 const incoming=Object.values(ensureWorldActors()).filter(a=>a.kind==='government'&&a.issue&&gameDayNumber()-a.issue.day<45).map(a=>a.country);
 return [...new Set([...direct,...incoming.slice(0,3),...peers,...changed.slice(0,2),...(rotating?[rotating]:[])])].slice(0,8);
}
function compactPoliticalTask(t){return {id:t.id,country:t.country,goal:t.goal,executor:t.executor,target:t.target,status:t.status,due:processDate(t.due),kind:t.kind,effects:t.effects};}
function politicalContext(){
 const selected=politicalActorsForTurn(),registry=ensureWorldActors();
 return {player:executiveFacts(),playerObservation:politicalObservation(playerCountry),
 countries:selected.map(n=>politicalObservation(n)),
 allCountries:ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).map(n=>({id:n,gdp:countries[n].gdp,army:countries[n].army})),
 recentEvents:worldState.pastEvents.slice(-8).map(s=>s.slice(0,500)),treaties:worldState.treaties||[],wars:{player:worldState.atWarWith,others:worldState.aiWars},
 actors:Object.values(registry).filter(a=>a.country===playerCountry||selected.includes(a.country)&&a.kind==='government').map(a=>({id:a.id,country:a.country,kind:a.kind,goal:a.goal,grievance:a.grievance,memory:a.memory.slice(-2).map(m=>m.text.slice(0,250)),demand:a.demand})),
 offers:(ensurePolitics().offers||[]).filter(o=>o.status==='open').slice(-12),
 decisions:ensurePolitics().decisions.slice(-8).map(d=>({country:d.country,goal:d.goal,action:d.action,target:d.target,motive:d.motive,material:d.material})),pending:ensureOrders().map(o=>({id:o.id,text:o.text})),
 tasks:ensurePolitics().tasks.filter(t=>['active','ready'].includes(t.status)).slice(-16).map(compactPoliticalTask),
 locations:Object.keys(CITY_COORDS),ownProvinces:scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry).map(p=>({id:p.id,name:p.name})).slice(0,45)};
}
function completePoliticalTask(t,article={}){
 // Missing prose can come from the same decision; material effects still require validation.
 if(t.cost==null)t.cost=0;
 if(t.days==null)t.days=0;
 if(t.goal==null)t.goal=article.goal||article.headline;
 if(t.executor==null)t.executor='Кабинет министров';
 if(t.result==null)t.result=article.body;
 if(t.headline==null)t.headline=article.headline||t.goal;
 if(t.body==null)t.body=article.body||t.result;
 return t;
}
function validatePoliticalTask(t,owner){
 if(t.target)t.target=orderCountry(t.target);
 if(t.effects){t.effects=canonicalSovereignEffects(t.effects,owner);if(t.effects.trade_policy)t.kind='trade';else if(t.effects.diplomatic_action)t.kind='diplomacy';}
 if(t.answer&&!t.offer){const incoming=strategyState().offers.some(o=>o.b===owner&&o.a===t.target&&o.status==='open');if(!incoming&&typeof policyCabinet==='function'&&policyCabinet(owner).inbox.some(i=>i.source===t.target&&i.status==='open'))delete t.answer;}
 if(!t.effects?.diplomatic_action&&!t.offer&&!t.answer&&t.target&&t.target!==owner&&/предлож|предлага|offer/i.test(t.goal||'')){
  if(/ненапад|nonaggression/i.test(t.goal))t.offer='nonaggression';
  else if(/(?:военн|оборонит)[^.!?]{0,45}союз|military alliance/i.test(t.goal))t.offer='alliance';
  else if(isAtWar(owner,t.target)&&/предлож[^.!?]{0,45}мир|peace offer/i.test(t.goal))t.offer='peace';
 }

 if(t.process){politicalKeys(t.process,['mode','days','summary']);politicalAssert(t.process.mode==='implementation'&&t.process.days===t.days,'Противоречивый срок поручения');delete t.process;}
 politicalKeys(t,['goal','executor','target','days','cost','result','headline','body','effects','kind','offer','sourceMandate','targets','interpretationCorrected','answer','instructions','response']);
 if(t.response!=null)politicalText(t.response,6000);
 if(t.instructions!=null)politicalAssert(t.instructions&&typeof t.instructions==='object'&&JSON.stringify(t.instructions).length<=4000,'Слишком длинное содержание поручения');
 ['goal','executor','result','headline','body'].forEach(k=>politicalText(t[k],k==='body'?2000:k==='headline'?160:1200));
 politicalAssert(Number.isInteger(t.days)&&t.days>=0&&t.days<=3650,'Неверный срок политического действия');
 politicalAssert(typeof t.cost==='number'&&Number.isFinite(t.cost)&&t.cost>=0&&t.cost<=Math.max(1,countries[owner].income),'Неверная цена организации');
 if(t.answer!=null)politicalAssert(['accept','reject'].includes(t.answer)&&t.target&&t.target!==owner,'Неверный ответ на предложение');
 if(t.targets!=null)politicalAssert(Array.isArray(t.targets)&&t.targets.length<=8&&t.targets.every(n=>countries[n]&&!countries[n].annexed),'Неверные адресаты');
 if(t.offer!=null)politicalAssert(['alliance','nonaggression','peace'].includes(t.offer)&&t.target&&t.target!==owner,'Неверное предложение договора');
 if(t.target!=null)politicalAssert(countries[t.target]&&!countries[t.target].annexed,'Нет адресата');
 politicalAssert(!/инопланет|телепорт|машина времени/i.test(t.result),'Невозможный материальный результат');
 if(t.kind==='tax'&&t.effects&&Object.keys(t.effects).length&&Object.keys(t.effects).every(k=>['tax_noble','tax_burgher','tax_commons'].includes(k)))t.effects={economy:t.effects};
 if(t.kind==='spending'&&t.effects&&Object.keys(t.effects).length&&Object.keys(t.effects).every(k=>['education_spending','welfare_spending','infrastructure_spending'].includes(k)))t.effects={society:t.effects};
 if(t.kind==='political'&&(!t.effects||!Object.keys(t.effects).length))delete t.kind;
 if(t.effects&&Object.keys(t.effects).length===1&&Array.isArray(t.effects.operations))t.kind='policy';
 if(t.effects&&Object.keys(t.effects).length){
  politicalAssert(t.kind&&OrderRules.KIND_FIELDS[t.kind]&&!['unsupported','administration'].includes(t.kind),'Неизвестный вид результата');
  const ctx=orderContext();ctx.player=owner;
  t.effects=OrderRules.validateEffects(canonicalEffects(t.effects),ctx,'order',t.kind);
 }
 return t;
}
// Protocol resolution follows ownership and exact live records, never newspaper wording.
function policyResolveProposal(id,owner){
 for(const i of ensureNewsFlow().issues.filter(i=>i.id===id&&i.recipient===owner))i.status='closed';
 if(typeof policyState==='function')for(const a of Object.values(policyState().cabinets))for(const i of a.inbox||[])if(i.id===id)i.status='reviewed';
}
function politicalResponseRecord(owner,d,family='diplomacy'){
 const offers=family==='trade'?(maritimeState().tradeOffers||[]):strategyState().offers;
 const contracts=family==='trade'?(maritimeState().agreements||[]):strategyState().contracts;
 const known=d.offer_id&&offers.find(o=>o.id===d.offer_id);
 if(known)politicalAssert(known.b===owner&&(!d.target||known.a===d.target),'Предложение адресовано другому участнику');
 const matching=o=>(!d.target||o.a===d.target)&&(!d.type||o.type===d.type)&&
  (d.rate==null||o.rate===d.rate)&&(!d.good||d.good==='all'||o.good===d.good);
 const open=offers.filter(o=>o.b===owner&&o.status==='open'&&(o.expires==null||o.expires>gameDayNumber())&&matching(o));
 if(known?.status==='open'&&(known.expires==null||known.expires>gameDayNumber()))return {open:known};
 if(!known&&open.length===1)return {open:open[0]};
 if(known&&known.status!=='open')return {resolved:known};
 const active=contracts.filter(o=>o.status==='active'&&[o.a,o.b].includes(owner)&&[o.a,o.b].includes(d.target)&&
  (!d.type||o.type===d.type)&&(d.rate==null||o.rate===d.rate));
 if(!open.length&&active.length===1)return {resolved:active[0]};
 return {};
}
function canonicalSovereignEffects(raw,owner){
 const e=JSON.parse(JSON.stringify(raw));
 if(e.operations)e.operations=e.operations.map(s=>{const effects=canonicalSovereignEffects(s.effects,owner);return {kind:effects.trade_policy?'trade':effects.diplomatic_action?'diplomacy':s.kind,effects};});
 let d=e.diplomatic_action;
 if(d&&['trade','customs_union'].includes(d.type)&&['offer','accept','reject','break'].includes(d.action)){
  const {terms={},...args}=d;
  e.trade_policy={action:d.action,target:d.target,type:d.type,offer_id:d.offer_id,agreement_id:d.contract_id,
   ...Object.fromEntries(Object.entries(terms).map(([k,v])=>[k==='externalRate'?'external_rate':k,v]))};
  for(const key of ['rate','good','days','external_rate'])if(args[key]!=null)e.trade_policy[key]=args[key];
  e.trade_policy=Object.fromEntries(Object.entries(e.trade_policy).filter(([,v])=>v!=null));
  delete e.diplomatic_action;d=null;
 }
 for(const [family,x]of [['diplomacy',d],['trade',e.trade_policy]])if(x){
  if(x.target)x.target=orderCountry(x.target);
  if(family==='trade'&&x.action==='tariff'&&x.target===owner)delete x.target;
  if(family==='trade'&&x.action==='offer'){
   if(!x.type)x.type=x.external_rate==null?'trade':'customs_union';
   if(x.rate==null&&x.target){
    delete e.trade_policy;e.diplomatic_action={action:'communicate',target:x.target,message:'Направлено приглашение обсудить условия торговли'+(x.good&&x.good!=='all'?' категорией '+x.good:'')+'. Конкретные ставки и согласие другой стороны ещё не определены.'};
    continue;
   }
  }
  if(['accept','reject'].includes(x.action)){
   const record=politicalResponseRecord(owner,x,family);
   if(record.open){
    x.offer_id=record.open.id;x.target=record.open.a;
    if(family==='diplomacy')delete x.contract_id;
   }else if(record.resolved){
    delete e[family==='trade'?'trade_policy':'diplomatic_action'];
    e.diplomatic_action={action:'communicate',target:x.target||record.resolved.a,message:'Ответ относится к уже обработанному предложению. Нового договора или разрыва обязательств нет.'};
   }
  }else if(family==='diplomacy'&&x.action==='demand'&&!x.contract_id&&!x.obligation&&!x.amount)
   e.diplomatic_action={action:'communicate',target:x.target,message:'Направлен дипломатический запрос. Новых договорных обязательств нет.'};
  else if(family==='diplomacy'&&x.action==='fulfill'&&!x.claim_id&&!x.amount&&x.target&&
   strategyState().contracts.some(c=>c.status==='active'&&[c.a,c.b].includes(owner)&&[c.a,c.b].includes(x.target)))
   e.diplomatic_action={action:'communicate',target:x.target,message:'Направлено подтверждение позиции по действующему договору. Передачи денег, войск и территорий нет.'};
 }
 return e;
}
function canonicalPoliticalDecision(raw){
 const d=JSON.parse(JSON.stringify(raw));
 if(d.action&&typeof d.action==='object'&&!Array.isArray(d.action)){
  politicalKeys(d.action,['type','target','amount']);const {type,...args}=d.action;
  Object.entries(args).forEach(([k,v])=>{politicalAssert(d[k]==null||d[k]===v,'Противоречивое действие');d[k]=v;});d.action=type;
 }
 if(d.political_task){
  politicalAssert(!d.task,'Противоречивые варианты поручения');d.task=d.political_task;delete d.political_task;
 }
 if(d.task?.political_task){
  const {political_task,...siblings}=d.task;
  if(political_task.goal||political_task.executor||political_task.result){
   for(const [key,value]of Object.entries(siblings))politicalAssert(political_task[key]==null||JSON.stringify(political_task[key])===JSON.stringify(value),'Противоречивое поле поручения: '+key);
   d.task={...political_task,...siblings};
  }else d.task={...siblings,instructions:political_task};
 }
 if(d.target)d.target=orderCountry(d.target);
 if(d.task?.target)d.task.target=orderCountry(d.task.target);
 if(d.task){
  const owner=ensureWorldActors()[d.actor_id]?.country;
  if(owner&&d.task.effects){d.task.effects=canonicalSovereignEffects(d.task.effects,owner);if(d.task.effects.trade_policy)d.task.kind='trade';else if(d.task.effects.diplomatic_action)d.task.kind='diplomacy';}
  if(d.task.effects?.diplomatic_action?.action==='communicate'&&['accept','reject_offer'].includes(d.action))d.action='pursue';
  completePoliticalTask(d.task,d);
  d.headline||=d.task.headline;d.body||=d.task.body;
 }
 if(d.responds_to){
  const actor=ensureWorldActors()[d.actor_id],recipient=actor?.country;
  const notice=recipient&&typeof policyCabinet==='function'?policyCabinet(recipient).inbox.find(i=>i.id===d.responds_to&&i.status==='open'):null;
  if(notice)queueNewsIssue(notice.source,recipient,notice.id,notice.text,notice.kind);
  else if(!ensureNewsFlow().issues.some(i=>i.id===d.responds_to&&i.recipient===recipient&&i.status==='open'))delete d.responds_to;
 }
 if(d.action==='accept_offer')d.action='accept';if(d.action==='decline_offer')d.action='reject_offer';
 const actor=ensureWorldActors()[d.actor_id];
 if(actor&&actor.kind!=='government'&&d.target===actor.country)delete d.target;
 return d;
}
function validatePoliticalDecision(d){
 politicalKeys(d,['actor_id','goal','action','target','amount','task','motive','headline','body','condition_order','responds_to','condition_actor']);
 const a=ensureWorldActors()[d.actor_id];
 politicalAssert(a&&actorAvailable(a),'Неизвестный участник');
 ['goal','motive'].forEach(k=>politicalText(d[k],600));
 if(d.action==='wait'){d.headline=d.headline||'Курс правительства сохраняется';d.body=d.body||d.motive;}else ['headline','body'].forEach(k=>politicalText(d[k],k==='body'?2000:160));
 politicalAssert(['wait','pursue','negotiate','offer_alliance','offer_nonaggression','offer_peace','accept','reject_offer','warn','condemn','mobilize','deploy','war','support','oppose','petition','protest','tax','spending'].includes(d.action),'Неизвестное политическое действие');
 if(d.target!=null)politicalAssert(countries[d.target]&&!countries[d.target].annexed&&d.target!==a.country,'Неверный адресат');
 if(['negotiate','offer_alliance','offer_nonaggression','accept','reject_offer','warn','condemn','war'].includes(d.action))politicalAssert(d.target,'Нужен адресат');
 if(d.amount!=null)politicalAssert(Number.isFinite(d.amount)&&Math.abs(d.amount)<=1000000,'Неверная величина');
 if(d.task)validatePoliticalTask(d.task,a.country);
 if(d.action==='pursue')politicalAssert(d.task,'Нужно поручение');
 if(d.condition_actor)politicalAssert(typeof d.condition_actor==='string'&&ensureWorldActors()[d.condition_actor]&&d.condition_actor!==d.actor_id,'Нет участника-условия');
 if(d.responds_to)politicalAssert(typeof d.responds_to==='string'&&ensureNewsFlow().issues.some(i=>i.id===d.responds_to&&i.recipient===a.country),'Нет адресованного вопроса');
 if(d.condition_order)politicalAssert(worldState.orders.some(o=>o.id===d.condition_order),'Нет приказа-условия');
 return d;
}
function politicalEvent(owner,headline,body,details='',targets=[]){
 recordWorldEvent(owner===playerCountry?'domestic':'foreign',headline,body,[owner,...targets],details);
 const item=worldState.periodEvents.at(-1);item.priority=4;item.political=true;
}
function startPoliticalTask(owner,task,source){
 validatePoliticalTask(task,owner);const c=countries[owner],state=ensurePolitics();
 politicalAssert(state.tasks.filter(t=>t.country===owner&&['active','ready'].includes(t.status)).length<24,'Слишком много незавершённых действий');
 if(c.treasury<task.cost)return {status:'blocked',reason:'Казна не обеспечивает расходы организации.'};
 if(task.cost)changeCountryStat(owner,'treasury',-task.cost);
 const t={...JSON.parse(JSON.stringify(task)),id:crypto.randomUUID(),country:owner,source,status:'active',start:gameDayNumber(),due:gameDayNumber()+task.days};
 state.tasks.push(t);
 const targets=[...new Set([...(t.targets||[]),...(t.target?[t.target]:[])])];
 targets.forEach(n=>{const actor=ensureWorldActors()[n+'::government'];if(actor){actor.issue={orderId:source,text:t.goal,day:gameDayNumber()};actorRemember(actor,'Поступило решение из '+owner+': '+t.goal+'. Чужое согласие и успех не установлены.');}});
 politicalEvent(owner,t.headline,t.body,'Поручение: '+t.goal+'. Исполнитель: '+t.executor+'. Срок: '+processDate(t.due)+'. Организация: '+t.cost+'.',targets);
 if(task.days===0)finishPoliticalTask(t);
 return {status:t.status==='executed'?'executed':t.status==='blocked'?'blocked':'in_progress',reason:t.reason||'Начато: '+t.goal+'. Следующий результат к '+processDate(t.due)+'.',task:t};
}
function applyCountryPoliticalEffects(owner,kind,effects){
 const c=countries[owner],ctx=orderContext();ctx.player=owner;
 if(kind==='policy')return executePolicySteps(owner,effects.operations);
 const e=OrderRules.validateEffects(JSON.parse(JSON.stringify(effects)),ctx,'order',kind);
 const verdict=OrderRules.authority({kind,status:'execute',effects:e,reason:'Исполнение решения'},c);
 if(verdict.status!=='executed')return verdict;
 if(e.peace_made?.length)return {status:'blocked',reason:'Мир требует ответа противника на предложение, одностороннее согласие не завершает войну'};
 if(e.treaties?.some(t=>t.action==='sign')){e.treaties.filter(t=>t.action==='sign').forEach(t=>createPoliticalOffer(owner,t.a===owner?t.b:t.a,t.type));e.treaties=e.treaties.filter(t=>t.action!=='sign');}
 if(owner===playerCountry){
  if(e.army_delta>0){const order={id:crypto.randomUUID(),text:'Пополнение армии',status:'prepared'};worldState.orders.push(order);startExecutiveProcess(order,{kind:'army',effects:e});return {status:'in_progress',reason:order.reason};}
  const result=executeOrderEffects(e);return result?.status?result:verdict;
 }
 if(kind==='tax')Object.entries(e.economy).forEach(([k,v])=>{const key=k.replace('tax_',''),g=c.economy.classes[key],delta=v-g.tax;g.tax=v;g.loyalty=actorClamp(g.loyalty-delta*.5);});
 else if(kind==='spending')Object.entries(e.society).forEach(([k,v])=>{c.society.spending[k.replace('_spending','')]=v;});
 else if(kind==='army'){
  if(e.army_delta>0){const n=e.army_delta,cost=Math.ceil(n*.002),pending=(worldState.actorRecruitment||[]).filter(p=>p.country===owner).reduce((s,p)=>s+p.troops,0);
   if(c.treasury<cost||c.army+pending+n>c.population*1000*getEra().armyMaxShare)return {status:'blocked',reason:'Недостаточно средств или населения'};
   changeCountryStat(owner,'treasury',-cost);(worldState.actorRecruitment||(worldState.actorRecruitment=[])).push({country:owner,troops:n,due:gameDayNumber()+90,cost});return {status:'in_progress',reason:'Пополнения готовятся 90 дней'};
  }
  if(e.army_delta<0)changeCountryStat(owner,'army',e.army_delta);
  if(e.map_objects)applyMapObjects(e.map_objects);reconcileOrderArmies();
 }else if(kind==='map'){applyMapObjects(e.map_objects);reconcileOrderArmies();}
 else if(kind==='finance'){const d=e.debt_delta;if(d>0&&(c.debt+d>c.income*36)||d<0&&c.treasury<-d)return {status:'blocked',reason:'Невыполнимое финансирование'};changeCountryStat(owner,'debt',d);changeCountryStat(owner,'treasury',d);}
 else if(kind==='power'){
  setCountryLeader(owner,{...(e.pm_name?{pm:e.pm_name}:{}),...(e.pm_title?{pmTitle:e.pm_title}:{}),...(e.government?{government:e.government}:{}),...(e.ruler_name?{ruler:e.ruler_name}:{}),...(e.ruler_title?{rulerTitle:e.ruler_title}:{}),...(e.ruler_age!=null?{rulerAge:e.ruler_age}:{})});
  if(e.parliament?.dissolve)c.parliament=null;
  if(e.parliament?.restore&&!c.parliament)c.parliament={name:'Парламент',power:50,support:50,termYears:4,nextElection:year+4,banned:[],factions:[{name:'Правительственная партия',pct:50},{name:'Оппозиция',pct:50}]};
  if(e.parliament?.ban_party&&c.parliament){c.parliament.banned||=[];c.parliament.banned.push(e.parliament.ban_party);c.parliament.factions=c.parliament.factions.filter(f=>f.name!==e.parliament.ban_party);const total=c.parliament.factions.reduce((n,f)=>n+f.pct,0);if(total)c.parliament.factions.forEach(f=>f.pct=f.pct/total*100);}
 }else if(kind==='law'){
  Object.entries(e.law_slots||{}).forEach(([slot,value])=>setLawSlot(owner,slot,value));
  (e.laws||[]).forEach(l=>l.action==='enact'?enactLaw(owner,l.name,l.description):repealLaw(owner,l.name));
  if(e.institutions?.church==='abolish')abolishChurch(owner);
  if(e.institutions?.church==='restore')restoreChurch(owner);
 }else if(kind==='identity'){
  if(e.country_name)c.displayName=e.country_name;
  if(e.country_color)c.color=e.country_color.color;
 }
 else if(kind==='statement'){}
 else if(kind==='diplomacy'){
  Object.entries(e.relations||{}).forEach(([n,d])=>addRelation(owner,n,d));
  (e.war_declared||[]).forEach(n=>{if(!isAtWar(owner,n))declareEngineWar(owner,n);});
  (e.treaties||[]).forEach(t=>{if(t.action==='break')breakTreaty(t.type,owner,t.a===owner?t.b:t.a);else createPoliticalOffer(owner,t.a===owner?t.b:t.a,t.type);});
 }else return {status:'blocked',reason:'Подготовленное действие требует другого исполняемого результата'};
 return verdict;
}
function finishPoliticalTask(t){
 const c=countries[t.country];if(!c||c.annexed){t.status='failed';return;}
 const actors=Object.values(ensureWorldActors()).filter(a=>a.country===t.country&&actorAvailable(a));
 const opposition=actors.filter(a=>a.grievance>=30),pressure=opposition.reduce((n,a)=>n+a.grievance*a.influence/100,0);
 const capacity=actorClamp(c.stability*.5+(c.militarySupport??60)*.2+(c.parliament?.support??60)*.3);
 // Ordinary administrative acts usually work; contentious acts can be delayed or fail, never conjure resources.
 if(t.days>0&&pressure>capacity&&Math.random()<Math.min(.65,(pressure-capacity)/150)){
  t.status='blocked';t.reason='Исполнители столкнулись с сопротивлением: '+opposition.map(a=>a.label).join(', ')+'.';
 }else{
  const verdict=t.effects&&Object.keys(t.effects).length?applyCountryPoliticalEffects(t.country,t.kind,t.effects):{status:'executed',reason:t.result};
  t.status=verdict.status;t.reason=verdict.reason;
  if(t.status==='executed'){
   if(t.answer){const response=answerPoliticalOffer(t.country,t.target,t.answer,t.offer);t.status=response.status;t.reason=response.reason;}
   else if(t.offer)createPoliticalOffer(t.country,t.target,t.offer,politicalContractDays(t.sourceMandate||t.goal+' '+t.result));
   if(t.status==='executed'){c.politicalRecords=[...(c.politicalRecords||[]),{id:t.id,goal:t.goal,result:t.result,response:t.response||null,executor:t.executor,target:t.target,date:dateLabel()}].slice(-40);
   actors.forEach(a=>actorRemember(a,'Решение власти: '+t.goal+'. Результат: '+t.result));}
  }
 }
 t.finished=gameDayNumber();
 const order=worldState.orders.find(o=>o.id===t.source);
 if(order){if(t.status==='executed'&&t.response)order.response=t.response;order.status=t.status;order.reason=t.reason;order.resolvedTurn=turn;order.after=orderStatSnapshot(c);order.effects=t.status==='executed'?t.effects||{}:{};}
 politicalEvent(t.country,t.status==='executed'?'Политическое решение осуществлено':'Исполнение встретило препятствие',
  t.status==='executed'?t.result:t.goal+'. '+t.reason,'Процесс: '+t.id+'. Статус: '+t.status+'. Проверенные эффекты: '+JSON.stringify(t.effects||{}),t.target?[t.target]:[]);
}
function tickPoliticalTasks(){
 ensurePolitics().tasks.filter(t=>t.status==='active'&&t.due<=gameDayNumber()).forEach(t=>{
  const snapshot=captureOrderExecution();
  try{finishPoliticalTask(t);}
  catch(error){
   restoreOrderExecution(snapshot);const task=ensurePolitics().tasks.find(x=>x.id===t.id);
   task.status='deferred';task.finished=gameDayNumber();task.reason='Исполнитель должен повторить обработку результата.';
   const order=worldState.orders.find(o=>o.id===task.source);if(order){order.status='deferred';order.technicalError=String(error.message||error).slice(0,400);order.reason='Техническая ошибка исполнения. Поручение сохранено для повтора без хода.';}
   politicalEvent(task.country,'Исполнение поручения ожидает уточнения',task.goal+'. Поручение сохраняется у исполнителя.',task.reason,task.target?[task.target]:[]);
  }
 });
 ensurePolitics().tasks=ensurePolitics().tasks.filter(t=>t.status==='active'||t.finished>=gameDayNumber()-365);
}
function answerPoliticalOffer(owner,target,answer,type){
 const offer=(ensurePolitics().offers||[]).find(o=>o.a===target&&o.b===owner&&o.status==='open'&&(!type||o.type===type));
 if(!offer){
  const offers=typeof strategyState==='function'?strategyState().offers.filter(o=>o.a===target&&o.b===owner&&o.status==='open'&&(!type||o.type===type)):[];
  if(offers.length!==1)return {status:'blocked',reason:offers.length?'Нужно указать конкретное входящее предложение':'Нет действующего предложения от адресата'};
  return applyCountryPoliticalEffects(owner,'diplomacy',{diplomatic_action:{action:answer,target,offer_id:offers[0].id}});
 }
 if(answer==='accept'){
  if(offer.type==='peace'){
   if(owner===playerCountry||target===playerCountry){const other=owner===playerCountry?target:owner;worldState.atWarWith=worldState.atWarWith.filter(n=>n!==other);}else worldState.aiWars=worldState.aiWars.filter(([a,b])=>!((a===owner&&b===target)||(b===owner&&a===target)));
   delete worldState.warGoals[warKey(owner,target)];addRelation(owner,target,5);
  }else {if(isAtWar(owner,target))return {status:'blocked',reason:'Союз или пакт требует прекращения войны'};signTreaty(offer.type,owner,target);}
  offer.status='accepted';
 }else offer.status='rejected';
 return {status:'executed',reason:'Ответ сохранён: '+offer.status};
}
function politicalContractDays(text){
 const explicit=String(text||'').match(/(?:сроком\s+на|сроком|на)\s+(\d+|один|одну|одного|два|две|двух|три|трёх|четыре|четырёх|пять|пяти|шесть|шести)\s+(дн|ден|день|недел|месяц|год|лет)/i);
 return explicit?politicalDuration('за '+explicit[1]+' '+explicit[2]):0;
}
function createPoliticalOffer(a,b,type,days=0){
 if(typeof strategyOffer==='function')return strategyOffer(a,b,type,days?{days}:{});
 const state=ensurePolitics();state.offers||=[];
 const old=state.offers.find(o=>o.a===a&&o.b===b&&o.type===type&&o.status==='open');
 if(old)return old;
 const offer={id:crypto.randomUUID(),a,b,type,status:'open',day:gameDayNumber()};state.offers.push(offer);return offer;
}
function executePoliticalDecision(d,results){
 const a=ensureWorldActors()[d.actor_id],c=countries[a.country];
 if(d.condition_order&&!results.some(o=>o.id===d.condition_order&&['executed','in_progress'].includes(o.status)))return false;
 if(a.kind==='government'&&activeScenario.rules?.autonomousWorld===false)return false;
 const state=ensurePolitics(),target=d.target;
 if(a.lastPoliticalTurn===turn)return false;
 const foreign=a.kind==='government';let material='';
 if(d.action==='wait'){a.goal=d.goal;a.lastPoliticalTurn=turn;actorRemember(a,d.motive);state.decisions.push({...d,country:a.country,turn,date:dateLabel(),material:'Ожидание и цель сохранены'});state.decisions=state.decisions.slice(-80);return true;}
 if(['pursue','mobilize','deploy','war','tax','spending','offer_alliance','offer_nonaggression','accept','reject_offer','negotiate','warn','condemn'].includes(d.action)&&!foreign)return false;
 if(d.action==='pursue'){const verdict=startPoliticalTask(a.country,d.task,a.id);if(verdict.status==='blocked')return false;material=verdict.reason;}
 else if(d.action==='mobilize'){
  const n=Math.max(1000,Math.floor(d.amount||5000));const verdict=applyCountryPoliticalEffects(a.country,'army',{army_delta:n});if(verdict.status==='blocked')return false;material=verdict.reason;
 }else if(d.action==='deploy'){
  if(!d.task||d.task.kind!=='map'&&!d.task.effects?.map_objects)return false;
  const verdict=startPoliticalTask(a.country,d.task,a.id);if(verdict.status==='blocked')return false;material=verdict.reason;
 }else if(['tax','spending'].includes(d.action)){
  if(!d.task||d.task.kind!==d.action)return false;
  const verdict=startPoliticalTask(a.country,d.task,a.id);if(verdict.status==='blocked')return false;material=verdict.reason;
 }else if(d.action==='war'){
  if(!target||isAtWar(a.country,target)||c.army<1000||c.treasury<=0)return false;
  // A government first retains a war intention; a subsequent turn can carry it out.
  if(a.warPreparation?.target!==target){a.warPreparation={target,turn,reason:d.motive};material='Военное намерение сохранено; война пока не объявлена';}
  else if(a.warPreparation.turn<turn){declareEngineWar(a.country,target);a.warPreparation=null;material='Война объявлена';}
 }else if(d.action==='offer_alliance'||d.action==='offer_nonaggression'||d.action==='offer_peace'){
  const type=d.action==='offer_alliance'?'alliance':d.action==='offer_peace'?'peace':'nonaggression';if(type!=='peace'&&isAtWar(a.country,target))return false;createPoliticalOffer(a.country,target,type);material='Предложение '+type+' ожидает согласия адресата';
 }else if(d.action==='accept'||d.action==='reject_offer'){
  const expected=d.action==='accept'?'accept':'reject',effects=d.task?.effects,trade=effects?.trade_policy,action=effects?.diplomatic_action;
  const response=trade?.action===expected?applyCountryPoliticalEffects(a.country,'trade',{trade_policy:trade}):
   action?.action===expected?applyCountryPoliticalEffects(a.country,'diplomacy',{diplomatic_action:action}):answerPoliticalOffer(a.country,target,expected);
  if(response.status!=='executed')return false;material=response.reason;
 }else if(d.action==='negotiate'){addRelation(a.country,target,Math.max(1,Math.min(3,d.amount||1)));material='Начаты контакты; согласие на договор не подразумевается';}
 else if(d.action==='warn'||d.action==='condemn'){addRelation(a.country,target,d.action==='warn'?-1:-3);a.concern={target,motive:d.motive,day:gameDayNumber()};material='Позиция и адресат сохранены';}
 else if(d.action==='support'||d.action==='oppose'){
  const change=d.action==='support'?1:-2;
  if(a.kind==='parliament'&&c.parliament)c.parliament.support=actorClamp(c.parliament.support+change);
  else if(a.kind.startsWith('class_')){const group=c.economy.classes[a.kind.slice(6)];group.loyalty=actorClamp(group.loyalty+change);}
  else if(a.kind==='military')c.militarySupport=actorClamp((c.militarySupport??60)+change);
  a.grievance=actorClamp(a.grievance-change*3);material='Позиция участника влияет на поддержку следующих решений';
 }else if(d.action==='petition'){a.demand={text:d.goal,since:gameDayNumber(),status:'open'};material='Требование остаётся открытым';}
 else if(d.action==='protest'){
  if(a.grievance<20&&!a.issue)return false;
  changeCountryStat(a.country,'stability',-1);a.grievance=actorClamp(a.grievance+3);material='Стабильность −1';
 }
 if(target){const recipient=ensureWorldActors()[target+'::government'];if(recipient){recipient.issue={orderId:a.id+':'+turn,text:d.goal,day:gameDayNumber()};actorRemember(recipient,a.country+': '+d.action+'. '+d.motive);}}
 a.goal=d.goal;a.lastPoliticalTurn=turn;actorRemember(a,d.motive);
 state.decisions.push({...d,country:a.country,date:dateLabel(),turn,material});state.decisions=state.decisions.slice(-80);
 politicalEvent(a.country,d.headline,d.body,material+'; мотив: '+d.motive,target?[target]:[]);
 worldState.periodEvents.at(-1).decisionActor=a.id;worldState.periodEvents.at(-1).condition=d.condition_order||null;
 return true;
}
function observePoliticalWorld(){
 const state=ensurePolitics();
 ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).forEach(n=>{state.observations[n]=countryPoliticalFacts(n);});
 state.round++;
}
function renderPoliticalActions(box){
 const tasks=ensurePolitics().tasks.filter(t=>t.country===playerCountry&&t.status==='active');
 if(!tasks.length)return;
 const details=document.createElement('details'),label=document.createElement('summary');label.textContent='Текущие решения · '+tasks.length;details.append(label);
 tasks.forEach(t=>{const p=document.createElement('p');p.textContent=t.goal+' · '+t.executor+' · до '+processDate(t.due)+' · оплачено '+economyFmt(t.cost||0)+' млн р.е.';details.append(p);});box.append(details);
}
function gdpRanking(){return ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).sort((a,b)=>(countries[b].gdp||0)-(countries[a].gdp||0)||a.localeCompare(b));}
function renderGDPRank(){
 const button=document.getElementById('gdp-rank-button');if(!button||!countries[playerCountry])return;
 const rank=gdpRanking().indexOf(playerCountry)+1;button.textContent=String(rank);button.title='Место по ВВП: '+rank+'. Открыть рейтинг стран';button.setAttribute('aria-label',button.title);
 const box=document.getElementById('gdp-ranking-list');if(!box)return;box.replaceChildren();
 gdpRanking().forEach((id,i)=>{const row=document.createElement('div');row.className='gdp-ranking-row';if(id===playerCountry)row.classList.add('is-player');
 const name=document.createElement('span');name.textContent=(i+1)+'. '+(countries[id].displayName||id);
 const value=document.createElement('strong');value.textContent=Number(countries[id].gdp||0).toLocaleString('ru');row.append(name,value);box.append(row);});
}
function openGDPRanking(){if(typeof window.mobileSection==='function')window.mobileSection('map');renderGDPRank();document.getElementById('gdp-ranking-panel').hidden=false;}
function closeGDPRanking(){document.getElementById('gdp-ranking-panel').hidden=true;}

/* One political-model call per turn. Published prose belongs to confirmed decisions. */
writeNewspaper=async function(edition){
 const political=(worldState.periodEvents||[]).filter(e=>e.political);
 if(political.length){
  ['domestic','foreign'].forEach(section=>{
   const ranked=political.filter(e=>e.section===section).sort((a,b)=>section==='foreign'?foreignNewsWeight(b)+(b.condition?40:0)-foreignNewsWeight(a)-(a.condition?40:0):Number(!!b.sourceOrder)*10-Number(!!a.sourceOrder)*10);
   if(section==='domestic'){const reaction=ranked.find(e=>e.decisionActor);if(reaction){const index=ranked.indexOf(reaction);ranked.splice(index,1);ranked.splice(Math.min(2,ranked.length),0,reaction);}}
   const selected=[],seen=new Set();ranked.forEach(e=>{const key=section==='foreign'?(e.decisionActor||e.actors[0]):e.headline;if(selected.length<3&&!seen.has(key)){selected.push(e);seen.add(key);}});
   if(!selected.length)return;
   const articles=selected.map(e=>({headline:e.headline,body:e.body,actors:e.actors,details:e.details,priority:4}));
   const omitted=edition[section].filter(e=>!articles.some(a=>a.headline===e.headline&&a.body===e.body));
   if(omitted.length)articles.at(-1).details+='\nДругие события:\n'+omitted.map(e=>e.headline+': '+e.body+' '+e.details).join('\n');
   edition[section]=articles;
  });
 }
 edition.editor='political-actions';return edition;
};
const politicalOldStats=renderPlayerStats;
renderPlayerStats=function(...args){const result=politicalOldStats(...args);renderGDPRank();return result;};
