/* Durable political causes and consequences. AI interprets interests; only checked
   execution creates facts. No country names, historical appointments or insult lists. */
'use strict';
function causalState(){
 const s=worldState.causality||={version:1,events:[],seen:[],alerts:[],dismissed:[]};
 s.events||=[];s.seen||=[];s.alerts||=[];s.dismissed||=[];return s;
}
function causalValidateSignal(raw,owner){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const domains=['security','legitimacy','rights','religion','wealth','administration','foreign','personal'];
 if(!domains.includes(raw.domain)||typeof raw.summary!=='string'||!raw.summary.trim())return null;
 const visibility=['public','private','confidential'].includes(raw.visibility)?raw.visibility:'public';
 const live=policyLive(),registry=ensureWorldActors();
 return {domain:raw.domain,visibility,summary:raw.summary.slice(0,800),
 salience:Math.max(0,Math.min(100,Number(raw.salience)||0)),
 targets:[...new Set(Array.isArray(raw.targets)?raw.targets.map(orderCountry).filter(n=>live.includes(n)&&n!==owner):[])].slice(0,12),
 scope:raw.scope==='international'?'international':'regional',
 affected:(Array.isArray(raw.affected)?raw.affected:[]).filter(a=>registry[a.actor_id]?.country===owner&&actorAvailable(registry[a.actor_id])&&registry[a.actor_id].kind!=='government'&&Number.isFinite(a.stance)&&Number.isFinite(a.intensity)&&typeof a.reason==='string').slice(0,8).map(a=>({actor_id:a.actor_id,stance:Math.max(-1,Math.min(1,a.stance)),intensity:Math.max(0,Math.min(100,a.intensity)),reason:a.reason.slice(0,400)}))};
}
function causalRecipients(owner,signal){
 if(signal.visibility!=='public')return [];
 const geo=politicalGeography(),powers=policyLive().slice().sort((a,b)=>countries[b].gdp-countries[a].gdp).slice(0,8);
 const partners=strategyState().contracts.filter(t=>t.status==='active'&&[t.a,t.b].includes(owner)).flatMap(t=>[t.a,t.b]);
 const watch=policyLive().filter(n=>policyCabinet(n).goals.some(g=>g.status==='active'&&g.target===owner));
 const reach=[...signal.targets,...(signal.salience>=40?[...(geo.neighbors[owner]||[]),...partners,...watch]:[]),...(signal.salience>=65&&(signal.scope==='international'||powers.includes(owner))?powers:[])];
 if(signal.scope==='international'&&signal.targets.length===0)reach.push(...powers);
 return [...new Set(reach)].filter(n=>n!==owner&&n!==playerCountry&&countries[n]&&!countries[n].annexed);
}
function causalPublish(owner,key,signal,fact,sourceOrder=null){
 const s=causalState();if(s.seen.includes(key))return null;
 if(signal.visibility!=='public'&&!sourceOrder)return null;
 const e={id:crypto.randomUUID(),key,owner,day:gameDayNumber(),turn,domain:signal.domain,visibility:signal.visibility,
 summary:signal.summary,fact:String(fact).slice(0,1200),salience:signal.salience,targets:signal.targets,sourceOrder,
 status:'active',reviewDay:gameDayNumber()+30,observedBy:[],affected:signal.affected||[]};
 s.seen.push(key);s.seen=s.seen.slice(-400);s.events.push(e);s.events=s.events.slice(-100);
 for(const n of causalRecipients(owner,signal)){
  const a=policyCabinet(n);policyNotice(owner,n,e.summary+'\nПодтверждено: '+e.fact,'political');
  const notice=a.inbox.at(-1);if(notice?.source===owner){notice.eventId=e.id;notice.salience=e.salience;}
  e.observedBy.push(n);
 }
 const registry=ensureWorldActors();
 for(const impact of e.affected){
  const a=registry[impact.actor_id];if(!a)continue;
  // This is pressure/attitude, never a invented crowd, battle or fulfilled demand.
  a.grievance=actorClamp(a.grievance-impact.stance*Math.min(35,impact.intensity*.35));
  a.issue={orderId:sourceOrder,text:e.summary,day:e.day,eventId:e.id};
  a.disputes=[...(a.disputes||[]).filter(x=>x.eventId!==e.id),{eventId:e.id,position:impact.stance,reason:impact.reason,day:e.day,status:'open'}].slice(-6);
  actorRemember(a,impact.reason);
  if(impact.stance<0&&impact.intensity>=40)a.demand={text:impact.reason,since:e.day,status:'open',eventId:e.id};
 }
 for(const item of worldState.periodEvents||[])if(sourceOrder&&item.sourceOrder===sourceOrder){
  item.causalEvent=e.id;item.salience=e.salience;
 }
 return e;
}
function causalScan(results=[]){
 for(const o of results){
  if(!['executed','in_progress'].includes(o.status)||o.technicalError)continue;
  const signal=o.signal||causalValidateSignal({domain:['power','identity'].includes(o.kind)?'legitimacy':o.kind==='diplomacy'?'foreign':['army','military','naval'].includes(o.kind)?'security':'administration',summary:o.text,
   salience:['power','diplomacy','military'].includes(o.kind)?60:25,targets:mentionedPoliticalCountries(o.text).filter(n=>n!==playerCountry)},playerCountry);
  if(signal)causalPublish(playerCountry,'order:'+o.id,signal,o.reason,o.id);
 }
 for(const event of worldState.periodEvents||[]){
  if(!event.policyAction||event.policyAction==='wait'||event.causalEvent)continue;
  const owner=event.decisionActor?.split('::')[0]||event.actors?.[0];if(!countries[owner])continue;
  const signal={domain:['war','mobilize','deploy'].includes(event.policyAction)?'security':'foreign',visibility:'public',
   summary:event.headline+'. '+event.body,salience:['war','mobilize','deploy','warn','condemn'].includes(event.policyAction)?70:45,
   targets:event.policyTarget?[event.policyTarget]:[],scope:'regional',affected:[]};
  const e=causalPublish(owner,'policy:'+(event.storyId||owner+':'+turn+':'+policyState().round),signal,event.body);
  if(e){event.causalEvent=e.id;event.salience=e.salience;}
 }
}
function causalActorFacts(owner){
 return Object.values(ensureWorldActors()).filter(a=>a.country===owner&&actorAvailable(a)&&a.kind!=='government').map(a=>({
  id:a.id,role:a.label,interest:a.goal,influence:a.influence,grievance:a.grievance,organization:a.organization||0,
  stance:a.stance||'neutral',demand:a.demand?.status==='open'?a.demand.text:null,
  disputes:(a.disputes||[]).filter(d=>d.status==='open').slice(-3),lastAction:a.lastCausalAction||null,
  norms:a.kind==='military'?'Снабжение, командная дисциплина, безопасность и влияние командования':
   a.kind==='parliament'?'Представительство, права депутатов и парламентские полномочия':
   a.kind==='church'?'Общественное и религиозное влияние':
   a.kind==='cabinet'?'Возможность управлять, доверие к главе правительства и устойчивость администрации':
   'Доходы, положение группы и доступ к правам по текущим законам'}));
}
function causalOpenEvents(owner){
 const now=gameDayNumber();
 return causalState().events.filter(e=>e.status==='active'&&(e.owner===owner||e.observedBy.includes(owner))&&now-e.day<365)
 .sort((a,b)=>b.salience-a.salience||b.day-a.day).slice(0,8).map(e=>({
  id:e.id,owner:e.owner,date:processDate(e.day),domain:e.domain,summary:e.summary,fact:e.fact,salience:e.salience,
  ageDays:now-e.day,observedBy:e.observedBy,followUps:(e.followUps||[]).slice(-3)}));
}
const causalOldContext=policyContext;
policyContext=function(selected,results,phase){
 const context=causalOldContext(selected,results,phase);
 context.cabinets.forEach(c=>{c.politicalEvents=causalOpenEvents(c.id);c.domesticActors=causalActorFacts(c.id);});
 return context;
};
const causalOldPlanning=orderPlanningContext;
orderPlanningContext=function(...args){const c=causalOldPlanning(...args);c.politicalEvents=causalOpenEvents(playerCountry);c.domesticActors=causalActorFacts(playerCountry);return c;};
const causalOldActors=actorContext;
actorContext=function(...args){const rows=causalOldActors(...args);for(const row of rows){const a=ensureWorldActors()[row.id];row.organization=a.organization||0;row.disputes=(a.disputes||[]).slice(-3);row.demand=a.demand;}return rows;};
const causalOldReactions=recordActorReactions;
recordActorReactions=function(results){causalScan(results);return causalOldReactions(results);};
const CAUSAL_ACTOR_ACTIONS=['organize','withhold','rally','resign'];
const causalOldValidate=validatePoliticalDecision;
validatePoliticalDecision=function(d){
 if(!CAUSAL_ACTOR_ACTIONS.includes(d.action))return causalOldValidate(d);
 const alias={...d,action:d.action==='rally'?'support':'petition'};causalOldValidate(alias);
 const a=ensureWorldActors()[d.actor_id];politicalAssert(a.kind!=='government','Кабинет державы действует через собственные государственные полномочия');
 politicalAssert(!d.task&&!d.target&&!d.amount,'Организация интересов не создаёт государственные ресурсы');
 politicalAssert(d.action!=='resign'||a.kind==='cabinet','Отставка кабинета относится к кабинету');
 return d;
};
const causalOldExecute=executePoliticalDecision;
executePoliticalDecision=function(d,results=[]){
 if(!CAUSAL_ACTOR_ACTIONS.includes(d.action))return causalOldExecute(d,results);
 validatePoliticalDecision(d);const a=ensureWorldActors()[d.actor_id],c=countries[a.country];
 if(a.lastPoliticalTurn===turn||d.condition_order&&!results.some(o=>o.id===d.condition_order&&['executed','in_progress'].includes(o.status)))return false;
 let material='';
 if(d.action==='organize'){
  if(a.grievance<15&&!a.issue)return false;
  a.organization=actorClamp((a.organization||0)+15);a.stance='opposition';a.demand={text:d.goal,since:gameDayNumber(),status:'open'};
  material='Организация оппозиции '+a.organization+'/100; требование сохранено';
 }else if(d.action==='withhold'){
  if(a.grievance<35||(a.organization||0)<15)return false;
  a.stance='noncooperation';a.organization=actorClamp(a.organization+10);
  if(a.kind==='parliament'&&c.parliament)c.parliament.support=actorClamp(c.parliament.support-3);
  if(a.kind==='military')c.militarySupport=actorClamp((c.militarySupport??60)-3);
  changeCountryStat(a.country,'stability',-1);material='Отказ сотрудничать; сопротивление увеличивает риск задержки политических поручений';
 }else if(d.action==='resign'){
  if(a.grievance<55)return false;
  const previous=c.pm;setCountryLeader(a.country,{pm:'Временный кабинет',pmTitle:c.pmTitle||'Глава правительства'});
  a.stance='resigned';a.organization=0;a.grievance=25;changeCountryStat(a.country,'stability',-3);
  material='Глава правительства '+previous+' ушёл в отставку; действует временный кабинет';
 }else{
  a.stance='support';a.organization=actorClamp((a.organization||0)+10);a.grievance=actorClamp(a.grievance-5);
  changeCountryStat(a.country,'stability',1);material='Участник организует поддержку курса; устойчивость +1';
 }
 a.lastPoliticalTurn=turn;a.lastCausalAction={day:gameDayNumber(),action:d.action,reason:d.motive};a.goal=d.goal;actorRemember(a,d.motive);
 ensurePolitics().decisions.push({...d,country:a.country,turn,date:dateLabel(),material});
 ensurePolitics().decisions=ensurePolitics().decisions.slice(-80);
 politicalEvent(a.country,d.headline,d.body,material);const event=worldState.periodEvents.at(-1);
 event.decisionActor=a.id;event.sourceOrder=d.condition_order||null;event.salience=d.action==='resign'?85:55;
 return true;
};
const causalOldAdvance=advanceGameDays;
advanceGameDays=function(days){
 const result=causalOldAdvance(days),now=gameDayNumber();
 // Persistent pressures develop at dated checkpoints; no daily API requests.
 if(!worldState.causality||now<(causalState().nextDomesticDay??-Infinity))return result;
 causalState().nextDomesticDay=now+30;
 for(const a of Object.values(ensureWorldActors()).filter(a=>actorAvailable(a)&&a.kind!=='government')){
  const open=(a.disputes||[]).some(d=>d.status==='open');
  if(!open)continue;
  const c=countries[a.country],key=a.kind.startsWith('class_')?a.kind.slice(6):null;
  const support=key?c.economy.classes[key]?.loyalty:a.kind==='parliament'?c.parliament?.support:a.kind==='military'?c.militarySupport:null;
  if(support!=null&&support>65&&a.grievance<20){
   a.disputes.forEach(d=>d.status='settled');if(a.demand)a.demand.status='resolved';a.organization=Math.max(0,(a.organization||0)-10);continue;
  }
  if(a.grievance>=35)a.organization=actorClamp((a.organization||0)+5);
  if(a.stance==='noncooperation'&&a.grievance>=35&&a.organization>=25)changeCountryStat(a.country,'stability',-1);
  else if(a.grievance<15)a.organization=Math.max(0,(a.organization||0)-5);
 }
 for(const event of causalState().events){
  if(now-event.day>365)event.status='archived';
 }
 return result;
};
const causalOldTask=finishPoliticalTask;
finishPoliticalTask=function(task){
 const extra=Object.values(ensureWorldActors()).filter(a=>a.country===task.country&&a.stance==='noncooperation'&&actorAvailable(a));
 const previous=extra.map(a=>[a,a.grievance]);
 try{extra.forEach(a=>a.grievance=actorClamp(a.grievance+(a.organization||0)*.3));return causalOldTask(task);}
 finally{previous.forEach(([a,g])=>{const current=worldState.actors?.[a.id];if(current)current.grievance=g;});}
};
const causalOldApply=policyApply;
policyApply=function(raw,selected,results){
 const applied=causalOldApply(raw,selected,results);if(!applied)return false;
 const owner=orderCountry(raw.country),decision=raw.decision,cb=policyCabinet(owner);
 // Record how a cabinet handled known controversies, including deliberate restraint.
 const related=causalState().events.filter(e=>e.status==='active'&&e.observedBy.includes(owner)&&
  (e.owner===decision.target||cb.inbox.some(i=>i.eventId===e.id&&i.id===decision.responds_to)));
 related.slice(-3).forEach(e=>{e.followUps=[...(e.followUps||[]),{country:owner,day:gameDayNumber(),action:decision.action,assessment:String(raw.assessment).slice(0,400)}].slice(-10);});
 causalScan();return true;
};
const causalOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:')){
  prompt+='\nОБЩАЯ ПОЛИТИЧЕСКАЯ ПРИЧИННОСТЬ. У каждого orders можно добавить signal (НЕ внутри effects): {domain:"security|legitimacy|rights|religion|wealth|administration|foreign|personal",visibility:"public|private|confidential",salience:0..100,summary:"что политически изменилось и какие интересы затронуты",scope:"regional|international",targets:["точные ID стран"],affected:[{actor_id:"точный внутренний ID",stance:-1..1,intensity:0..100,reason:"конкретный затронутый интерес"}]}. Это интерпретация подтверждённого собственного поступка, не чужое решение. Приказ с неуспешным исполнением не создаёт событие. Публичные заявления могут иметь политические последствия без денежных effects. Закрытая встреча не известна всему миру. Масштаб зависит от содержания и положения страны; сильный дипломатический скандал/нелегитимное назначение/угроза суверенитету могут получить salience 70..95, спокойная административная мера 10..30. targets пустой при обращении к миру, scope international. Не дискриминируй по национальности; оцени квалификацию, распределение полномочий и нормы именно сценария. affected — изменение отношения, НЕ состоявшийся бунт. Отделяй признание решения от признания его результата.\nВНУТРЕННЯЯ ПОЛИТИКА: помимо support/oppose/petition/protest доступны organize (организовать оппозицию при реальном споре), withhold (отказ сотрудничать при grievance>=35 и organization>=15), rally (организовать поддержку), resign (только кабинет, grievance>=55: уходит глава правительства). Выбирай поступок по интересам, grievance, organization, действующим disputes и ответам власти. Не всем участникам нужна реакция. Развивай уже начатый конфликт или урегулируй его, не повторяй одобрение каждым министерством. body — конкретная публичная позиция и ставки, не счётчик настроений. condition_order сохраняет причинную связь.';
 }
 if(typeof prompt==='string'&&prompt.startsWith('POLITICAL_CABINETS_V1')){
  prompt+='\nСОХРАНЁННЫЕ ПОЛИТИЧЕСКИЕ СОБЫТИЯ: politicalEvents — то, что кабинет реально знает, с возрастом, значимостью и предыдущими ответами. Оцени прямую угрозу, доверие, престиж, внутреннюю легитимность, коммерческие и договорные интересы. Дипломатический скандал не требует войны: доступны протест, требование разъяснений/извинений, отзыв представителя, отказ от инициативы, совместная позиция или осознанное невмешательство. Для действий без численного эффекта используй pursue с days:0 и result собственным выполненным политическим шагом. Следующие обращения адресуются реально затронутым кабинетам. При важном нерешённом событии объясни именно отношение к нему, а не переключайся на школьную программу. domesticActors отражают самостоятельные интересы и напряжение. Делай 2–3 содержательных предложения в body, не повторяй оговорки; assessment до 400 символов, goal/success до 200. После консультаций выбери предметное условие, уступку, гарантию, меру или обоснованное ожидание; очередное приглашение обсудить то же самое не следующий шаг.';
 }
 return causalOldAsk(prompt,...args);
};
// Background editing captures the edition's facts, model and reserved turn. It has
// no world executor. Never auto-repeat a paid editorial request after reload.
let causalEditorialQueue=[],causalEditorialWorker=null;
function causalQueueEdition(edition){
 if(!edition.editorSource||edition.editorJob)return;
 edition.id||=crypto.randomUUID();edition.editorJob={status:'queued',requestedAt:Date.now()};
 const world=worldState,source=JSON.parse(JSON.stringify(edition.editorSource));delete edition.editorSource;
 const stories=[...edition.domestic.filter(s=>s.storyKey),...edition.foreign.filter(s=>s.storyKey)];
 causalEditorialQueue.push({edition,stories,source,world});
 if(!causalEditorialWorker)causalEditorialWorker=Promise.resolve().then(causalWorkEditions);
}
async function causalWorkEditions(){
 try{
  while(causalEditorialQueue.length){
   const job=causalEditorialQueue.shift(),{edition,stories,source,world}=job;
   if(world!==worldState||!world.newspaperHistory?.includes(edition))continue;
   edition.editorJob.status='editing';
   if(world.newspaperHistory.at(-1)===edition)renderNewspaper(edition);
   await livingEditStories(edition,stories,source);
   if(world!==worldState||!world.newspaperHistory?.includes(edition))continue;
   edition.editorJob={...edition.editorJob,status:edition.editorError?'error':'complete',completedAt:Date.now()};
   if(!turnRunning)saveGame();
   if(world.newspaperHistory.at(-1)===edition)renderNewspaper(edition);
  }
 }finally{causalEditorialWorker=null;}
}
window.causalWaitForNewspaper=()=>causalEditorialWorker||Promise.resolve();
function causalCaptureAlerts(before){
 const s=causalState(),now=policySnapshot(),old=before||now;
 for(const pair of now.wars.filter(p=>!old.wars.some(w=>w[0]===p[0]&&w[1]===p[1]))){
  if(pair.includes(playerCountry)||pair.some(n=>politicalGeography().neighbors[playerCountry]?.has(n)))
   causalAlert('war:'+pair.join('|')+':'+gameDayNumber(),'Объявлена война',pair.map(n=>countries[n].displayName||n).join(' и ')+' вступили в войну. Теперь действуют военные обязательства и риск потерь.');
 }
 for(const n of policyLive()){
  if(!old.leaders[n]||old.leaders[n]===now.leaders[n])continue;
  const oldRuler=old.leaders[n].split('|')[0],c=countries[n];
  if(oldRuler!==c.ruler&&(n===playerCountry||politicalGeography().neighbors[playerCountry]?.has(n)))
   causalAlert('leadership:'+n+':'+gameDayNumber(),'Смена главы государства',(c.displayName||n)+': '+oldRuler+' сменил '+c.ruler+'. Управление страной и договоры продолжаются.');
 }
 const c=countries[playerCountry];if(c.stability<=30&&before?.stability>30)
  causalAlert('crisis:'+playerCountry+':'+gameDayNumber(),'Политический кризис','Устойчивость власти резко ослабла. Проверьте требования общественных участников и поддержку государственных институтов.');
 const capital=scenarioProvinces.find(p=>strategyOwner(p)===playerCountry&&(p.isCapital||p.capital));
 if(capital&&strategyState().occupations[capital.id]&&strategyState().occupations[capital.id]!==playerCountry)
  causalAlert('capital:'+capital.id+':'+strategyState().occupations[capital.id],'Столица занята противником',capital.name+' находится под контролем противника.');
 s.alerts=s.alerts.slice(-20);
}
function causalAlert(key,title,body){
 const s=causalState();if(s.alerts.some(a=>a.key===key)||s.dismissed.includes(key))return;
 s.alerts.push({key,title,body,day:gameDayNumber(),turn});
}
let causalTurnBefore=null;
function causalBeginTurn(){causalTurnBefore={...policySnapshot(),stability:countries[playerCountry].stability};closeBreakingNews();}
function causalCommitTurn(edition){
 causalCaptureAlerts(causalTurnBefore);saveGame();causalQueueEdition(edition);saveGame();causalShowAlert();
}
function closeBreakingNews(){
 const box=document.getElementById('political-breaking-news');if(box)box.remove();
}
function causalShowAlert(){
 closeBreakingNews();const s=causalState(),alert=s.alerts.find(a=>!s.dismissed.includes(a.key));if(!alert)return;
 const box=document.createElement('section');box.id='political-breaking-news';box.className='political-breaking-news';box.setAttribute('role','dialog');box.setAttribute('aria-label','Важное известие');
 const label=document.createElement('small');label.textContent='Важное известие · '+processDate(alert.day);
 const title=document.createElement('h2');title.textContent=alert.title;
 const body=document.createElement('p');body.textContent=alert.body;
 const button=document.createElement('button');button.type='button';button.textContent='Продолжить';button.onclick=()=>{
  s.dismissed.push(alert.key);s.dismissed=s.dismissed.slice(-100);closeBreakingNews();saveGame();causalShowAlert();
 };
 box.append(label,title,body,button);document.body.append(box);
}
const causalOldRender=renderNewspaper;
renderNewspaper=function(edition){
 causalOldRender(edition);const box=document.getElementById('newspaper-date');if(!box||!edition)return;
 const job=edition.editorJob;
 if(job&&['queued','editing'].includes(job.status)&&!causalEditorialWorker&&!causalEditorialQueue.some(j=>j.edition===edition))job.status='interrupted';
 if(job&&!['complete'].includes(job.status)){
  const notice=document.createElement('span');notice.className='political-editor-status';
  notice.textContent=['queued','editing'].includes(job.status)?' · Редакция готовит выпуск; игра уже доступна':' · Выпуск сохранён в исходной редакции';
  box.append(notice);
 }
};

function causalDeathAlerts(deaths){
 for(const d of deaths)if(d.country===playerCountry||politicalGeography().neighbors[playerCountry]?.has(d.country))
  causalAlert('death:'+d.country+':'+gameDayNumber(),'Умер глава государства',d.ruler+' ('+(countries[d.country]?.displayName||d.country)+') скончался. Власть переходит преемнику; существующие обязательства сохраняются.');
}
