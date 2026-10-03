/* Stateful political cabinets: decisions follow committed facts, never a news template. */
'use strict';
window.POLITICAL_SUBJECTS=true;
function policyState(){
 const p=worldState.politicalSubjects||={version:1,cabinets:{},round:0,audit:[],calls:{turn:null,used:0}};
 p.cabinets||={};p.audit||=[];p.calls||={turn:null,used:0};
 return p;
}
function policyLive(){return ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed);}
function policyCabinet(id){
 const p=policyState(),c=countries[id];strategyCountry(id);
 const key=[c.ruler,c.pm,c.government].join('|');
 const a=p.cabinets[id]||={goals:[],memory:[],inbox:[],assumptions:[],reviewDay:gameDayNumber(),leadership:key};
 if(a.leadership!==key){a.memory.push({day:gameDayNumber(),text:'Изменилась власть: '+c.ruler+'; кабинет '+c.pm+'. Прежние договоры и незавершённые дела сохраняются.'});a.leadership=key;a.reviewDay=gameDayNumber();}
 a.memory=a.memory.slice(-12);a.inbox=a.inbox.slice(-12);
 return a;
}
function policyRemember(id,text){const a=policyCabinet(id);a.memory.push({day:gameDayNumber(),text:String(text).slice(0,600)});a.memory=a.memory.slice(-12);}
function policyInterest(id){
 const c=countries[id],neighbors=[...(politicalGeography().neighbors[id]||[])],s=strategyState();
 const contracts=s.contracts.filter(t=>t.status==='active'&&(t.a===id||t.b===id));
 const fronts=s.campaigns.filter(t=>t.status==='active'&&(t.a===id||t.b===id));
 return {security:{neighbors,wars:fronts.map(x=>({enemy:x.a===id?x.b:x.a,goal:x.goal})),occupations:Object.entries(s.occupations).filter(([p,owner])=>owner===id||strategyOwner(strategyProvince(p))===id)},
 sovereignty:{dependency:c.dependency||null,obligations:contracts.map(x=>({id:x.id,type:x.type,partner:x.a===id?x.b:x.a,terms:x.terms,due:x.due}))},
 prosperity:{gdp:c.gdp,population:c.population,treasury:c.treasury,debt:c.debt,budget:c.lastBudget?{gross:c.lastBudget.gross,net:c.lastBudget.net}:null},
 regime:{ruler:c.ruler,pm:c.pm,government:c.government,stability:c.stability,reputation:c.reputation,parliament:c.parliament,agenda:c.agenda||null},
 capacity:{army:c.army,availableTroops:Math.max(0,c.army-worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===id).reduce((n,u)=>n+(u.troops||0),0)),units:worldState.mapObjects.filter(u=>u.owner===id).map(u=>({id:u.id,type:u.type,troops:u.troops,province:strategyUnitProvince(u),supply:u.supply,route:s.routes.find(r=>r.unit===u.id)?.path.at(-1)}))}};
}
function policyNotice(source,target,text,kind='diplomacy'){
 if(!countries[target]||countries[target].annexed||target===source)return;
 const a=policyCabinet(target),key=source+'|'+kind+'|'+text;
 if(a.inbox.some(i=>i.key===key&&gameDayNumber()-i.day<90))return;
 a.inbox.push({id:crypto.randomUUID(),key,source,kind,text:String(text).slice(0,900),day:gameDayNumber(),status:'open'});
 a.inbox=a.inbox.slice(-12);a.reviewDay=gameDayNumber();
}
function policySelect(limit=6,respondOnly=false,excluded=[]){
 const p=policyState(),live=policyLive().filter(n=>n!==playerCountry&&!excluded.includes(n)),geo=politicalGeography(),ranking=live.slice().sort((a,b)=>countries[b].gdp-countries[a].gdp);
 const issues=ensureNewsFlow().issues.filter(i=>i.status==='open');
 const offers=strategyState().offers.filter(o=>o.status==='open');
 const score=n=>{
  const a=policyCabinet(n),incoming=a.inbox.filter(i=>i.status==='open');
  const addressed=issues.filter(i=>i.recipient===n),proposal=offers.filter(o=>o.b===n);
  const peers=[...(geo.neighbors[n]||[])],ownNeighbor=peers.includes(playerCountry);
  const activeGoal=a.goals.some(g=>g.status==='active');
  if(respondOnly&&!incoming.length&&!addressed.length&&!proposal.length)return -Infinity;
  if(!respondOnly&&!incoming.length&&!addressed.length&&!proposal.length&&a.reviewDay>gameDayNumber()&&!isAtWar(n,playerCountry))return -Infinity;
  const stale=Math.max(0,gameDayNumber()-(a.lastReviewDay??gameDayNumber()-120));
  return incoming.length*100+addressed.length*80+proposal.length*120+
   (isAtWar(n,playerCountry)?180:0)+(ownNeighbor?40:0)+
   (a.reviewDay<=gameDayNumber()?30:0)+(activeGoal?20:0)+
   Math.max(0,20-ranking.indexOf(n)*2)+Math.min(90,stale/3);
 };
 return live.map(n=>({n,score:score(n)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.n.localeCompare(b.n)).slice(0,limit).map(x=>x.n);
}
function policyPublicFacts(id){
 const c=countries[id],geo=politicalGeography();
 return {id,name:c.displayName||id,ruler:c.ruler,government:c.government,gdp:c.gdp,armyEstimate:Math.round(c.army/10000)*10000,neighbors:[...(geo.neighbors[id]||[])],contracts:strategyState().contracts.filter(x=>x.status==='active'&&(x.a===id||x.b===id)).map(x=>({a:x.a,b:x.b,type:x.type})),warWith:policyLive().filter(n=>n!==id&&isAtWar(id,n))};
}
function policyContext(selected,results,phase){
 const all=policyLive(),p=policyState(),actors=ensureWorldActors();
 const relevant=[...new Set([playerCountry,...selected,...selected.flatMap(n=>[...(politicalGeography().neighbors[n]||[])]),...selected.flatMap(n=>policyCabinet(n).goals.map(g=>g.target).filter(Boolean))])];
 return {date:dateLabel(),phase,player:playerCountry,
 cabinets:selected.map(id=>{const a=policyCabinet(id);return {id,actor:id+'::government',interests:policyInterest(id),goals:a.goals,memory:a.memory.slice(-6),inbox:a.inbox.filter(i=>i.status==='open'),assessment:a.assessment||null,lastOutcome:a.lastOutcome||null,
 issues:ensureNewsFlow().issues.filter(i=>i.status==='open'&&i.recipient===id).slice(-5),offers:strategyState().offers.filter(o=>o.status==='open'&&o.b===id).slice(-5),
 relationships:relevant.filter(n=>n!==id).map(n=>({id:n,value:getRelation(id,n)})).slice(0,16),actorMemory:actors[id+'::government']?.memory.slice(-3)};}),
 countries:relevant.map(policyPublicFacts),worldPowers:all.slice().sort((a,b)=>countries[b].gdp-countries[a].gdp).slice(0,8).map(policyPublicFacts),
 confirmedDecisions:results.map(o=>({text:o.text,status:o.status,outcome:o.reason,effects:o.effects})),
 events:(worldState.periodEvents||[]).slice(-12).map(e=>({headline:e.headline,body:e.body,actors:e.actors})),
 locations:scenarioProvinces.filter(x=>selected.includes(strategyOwner(x))).slice(0,110).map(x=>({id:x.id,name:x.name,owner:strategyOwner(x),neighbors:[...(strategyGeometry().graph[x.id]||[])].map(id=>({id,owner:strategyOwner(strategyProvince(id))}))}))};
}
function policyPrompt(selected,results,phase){
 return 'POLITICAL_CABINETS_V1\nТы играешь за самостоятельные правительства политической стратегии. Игрок не центр мира. Для КАЖДОГО кабинета выбери следующий собственный шаг по его интересам, ресурсам, обязательствам, памяти и ответам других. История задаёт старт, не предопределяет решения. Не действуй случайно и не делай всех одинаковыми.\n'+
 'Три устойчивых интереса: безопасность/суверенитет, благосостояние, сохранение управляемости режима. Их относительный вес и курс определяешь ты по положению страны. Держи до трёх конкретных целей. Продолжай старую цель, переходи к следующему шагу после ответа, или явно откажись от неё по причине изменения обстановки. Цель должна иметь наблюдаемый критерий успеха.\n'+
 'Оцени выгоду, цену, риск вмешательства, надёжность партнёров и поддержку внутри. Можно торговаться, искать противовес, заключать договоры, выдвигать требования, мобилизовать, менять свою внутреннюю политику, объявлять войну при обоснованном риске. Отвечай на предложения, но не соглашайся из вежливости. Отношения НЕ жёсткий порог союза: важны интересы и условия. Выжидание допустимо с причиной, условием пересмотра и сроком; оно не газетная новость. У каждой страны могут быть дела, не связанные с игроком. При изменении власти не нужно всем осуждать: реши, затронуты ли собственные интересы и нужен ли шаг.\n'+
 'Выбирай только собственное действие. Чужое согласие, результат войны и готовые ресурсы не объявляй своим текстом. Для материального действия нужны эффекты; код проверит ресурсы. Газетная body описывает выбранное действие, мотив и следующий открытый вопрос, 4–6 выразительных предложений, без ID, статусов, отчётных стрелок и выдуманных цитат. По существующему входящему предложению обязательно accept/reject или конкретное контрпредложение; wait допустим, если названа причина и срок. Не повторяй прежнее предупреждение без нового повода.\n'+
 'Верни JSON {cabinets:[{country:"точный ID",assessment:"оценка интересов, выгод и риска до 700 знаков",goals:[{id:"устойчивый короткий ID",goal:"конкретная цель",target:"ID либо null",priority:1..100,status:"active|achieved|abandoned",success:"наблюдаемый критерий"}],nextReviewDays:7..90,decision:{goal:"цель",action:"wait|pursue|negotiate|offer_alliance|offer_nonaggression|offer_peace|accept|reject_offer|warn|condemn|war|mobilize",target:"ID если нужен",amount:число если нужно,motive:"конкретная причина",headline:"газетный заголовок",body:"газетная статья",responds_to:"только существующий issues ID если отвечаешь на него",task:{}}}]}\n'+
 'Не передавай task для обычного wait/warn/offer_alliance. Для pursue task ОБЯЗАТЕЛЬНО {goal,executor,days:0..3650,cost:0..месячный доход,result:"собственное действие",headline,body,target:"если есть",kind:"тип эффекта если нужен",effects:{}}. Организационное политическое действие может быть без kind/effects. Назначения: kind:power effects:{ruler_name,ruler_title,pm_name,pm_title,government,country_name,transition:"appoint|resign|succession|reform"}. Военные действия: kind:military effects:{military_order:{action:"deploy|move|hold|retreat",unit_id:"ID",troops:для deploy,province:"ID",stance:"attack|defend"}}. deploy выделяет существующие солдаты; набор army_delta требует денег и подготовки. Дипломатия: kind:diplomacy effects:{diplomatic_action:{action:"offer|accept|reject|declare_war|break|demand|fulfill|refuse|integrate|release|tariff",target:"ID",offer_id:"при ответе",contract_id:"при требовании/разрыве",type:"alliance|nonaggression|peace|dependency",terms:{days,autonomy:0..1,tribute:0..0.3,militaryAid:boolean,offensive:boolean,access:boolean,payment,payer,subject,provinces:["ID"]},obligation:"militaryAid|tribute",amount,goal:{type:"territory|tribute|subjugation|defense",provinces:["ID"]}}}. Не добавляй неиспользуемые поля.\n'+
 'Наблюдаемая обстановка: '+JSON.stringify(policyContext(selected,results,phase));
}
function policyValidate(raw,selected){
 politicalKeys(raw,['country','assessment','goals','nextReviewDays','decision']);
 politicalAssert(selected.includes(raw.country),'Кабинет вне выбранных участников');
 politicalText(raw.assessment,900);
 politicalAssert(Array.isArray(raw.goals)&&raw.goals.length>0&&raw.goals.length<=3,'Нужны от одной до трёх целей');
 const goalIds=new Set();
 for(const g of raw.goals){politicalKeys(g,['id','goal','target','priority','status','success']);politicalText(g.id,60);politicalAssert(!goalIds.has(g.id),'Повтор цели');goalIds.add(g.id);politicalText(g.goal,400);politicalText(g.success,400);if(g.target!=null)strategyCountry(g.target);strategyNum(g.priority,1,100);politicalAssert(['active','achieved','abandoned'].includes(g.status),'Неверная стадия цели');}
 politicalAssert(Number.isInteger(raw.nextReviewDays)&&raw.nextReviewDays>=7&&raw.nextReviewDays<=90,'Неверный срок пересмотра');
 const d=JSON.parse(JSON.stringify(raw.decision));d.actor_id=raw.country+'::government';
 if(d.task&&Object.keys(d.task).length===0)delete d.task;
 validatePoliticalDecision(d);return {...raw,decision:d};
}
function policyApply(raw,selected,results){
 const packet=policyValidate(raw,selected),id=packet.country,a=policyCabinet(id),registry=ensureWorldActors(),actor=registry[id+'::government'];
 // A cabinet can act once per dated round, not once per entire year skip.
 const roundKey=turn+':'+policyState().round;
 if(a.lastRound===roundKey)return false;
 const previous=actor.lastPoliticalTurn,eventStart=(worldState.periodEvents||[]).length;
 const snapshot=JSON.parse(JSON.stringify({countries,worldState}));
 actor.lastPoliticalTurn=null;
 let ok;try{ok=executePoliticalDecision(packet.decision,results);}catch(error){({countries,worldState}=snapshot);throw error;}
 a.assessment=packet.assessment;a.goals=packet.goals;a.reviewDay=gameDayNumber()+packet.nextReviewDays;a.lastReviewDay=gameDayNumber();a.lastRound=roundKey;
 const material=ensurePolitics().decisions.findLast(d=>d.country===id&&d.turn===turn)?.material||'Исполнитель не подтвердил применение выбранного шага';
 a.lastOutcome={day:gameDayNumber(),action:packet.decision.action,applied:!!ok,material:ok?material:'Шаг не выполнен: проверь доступные ресурсы, действующие предложения и прежние действия.'};
 policyRemember(id,packet.assessment+' Следующий шаг: '+packet.decision.action+'. '+a.lastOutcome.material);
 if(ok){
  // One political decision yields one readable story, with mechanical events in details.
  const articles=(worldState.periodEvents||[]).slice(eventStart).filter(e=>e.section==='foreign');
  if(packet.decision.action!=='wait'&&articles.length&&packet.decision.body){
   const primary=articles.at(-1);primary.headline=packet.decision.headline;primary.body=packet.decision.body;
   primary.details=articles.map(e=>e.details||'').filter(Boolean).join('\n');primary.policyRound=policyState().round;primary.decisionActor=id+'::government';
   const redundant=new Set(articles.slice(0,-1));worldState.periodEvents=worldState.periodEvents.filter(e=>!redundant.has(e));
  }
  a.inbox.filter(i=>i.status==='open').forEach(i=>{i.status='reviewed';});
  const target=packet.decision.target||packet.decision.task?.target||packet.decision.task?.effects?.diplomatic_action?.target;
  if(target&&packet.decision.action!=='wait')policyNotice(id,target,packet.decision.body||packet.decision.motive,packet.decision.action);
 }
 return ok;
}
async function policyBatch(selected,results,phase){
 if(!selected.length)return [];
 const p=policyState();if(p.calls.turn!==turn)p.calls={turn,used:0};
 const ceiling=worldState.plannedPeriod&&/год|Год|лет|6 месяц/.test(worldState.plannedPeriod)?8:2;
 if(p.calls.used>=ceiling)return [];
 p.calls.used++;const acted=[];
 try{
  const raw=await askGemini(policyPrompt(selected,results,phase),6000,0,{response_format:{type:'json_object'},reasoning_effort:'low'});
  const data=parseOrderReply(raw);politicalAssert(Array.isArray(data.cabinets)&&data.cabinets.length<=selected.length,'Неверный список кабинетов');
  const seen=new Set();
  for(const item of data.cabinets){try{politicalAssert(!seen.has(item.country),'Повтор кабинета');seen.add(item.country);if(policyApply(item,selected,results))acted.push(item.country);}catch(error){policyState().audit.push({day:gameDayNumber(),country:item.country,error:String(error.message).slice(0,400)});}}
  for(const id of selected.filter(n=>!seen.has(n)))p.audit.push({day:gameDayNumber(),country:id,error:'Кабинет не получил решение; повторная оценка на следующем периоде.'});
 }catch(error){p.audit.push({day:gameDayNumber(),phase,error:String(error.message).slice(0,400)});showNotif('Оценка иностранных кабинетов не получена. Действия не выдуманы; время продолжится.');}
 p.audit=p.audit.slice(-30);return acted;
}
async function runPoliticalRound(results=[],opts={}){
 if(activeScenario.rules?.autonomousWorld===false)return;
 const p=policyState();p.round++;
 const selected=policySelect(6);
 await policyBatch(selected,results,opts.phase||'opening');
 // Recipients not yet reviewed respond to committed initiatives. No recursive loop.
 const recipients=policySelect(3,true,selected);
 await policyBatch(recipients,[], 'response');
}
window.politicalRunRound=runPoliticalRound;
const policyOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:'))prompt+='\nРАЗДЕЛЕНИЕ ПОЛНОМОЧИЙ. Здесь только исполнение приказов игрока и решения его внутренних участников. Иностранные government НЕ включай в politics: они принимают решения отдельным политическим раундом ПОСЛЕ исполнения. Не сочиняй зарубежные реакции. В politics оставляй только внутренние группы; пустой массив допустим.';
 return policyOldAsk(prompt,...args);
};
