/* Scenario-driven institutions. Reuses the existing planner, actor round and
   newspaper editor; this module performs no network requests. */
'use strict';
const INSTITUTION_LEGISLATIVE=['law','tax','spending','economic','trade'];
const institutionId=(owner,kind,name)=>{
 // Stable short IDs keep exact actor references cheap in model context/output.
 let hash=2166136261;const text=String(name).normalize('NFC');
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return owner+'::'+kind+':'+(hash>>>0).toString(36);
};
function institutionState(c){
 const s=c.institutionsV1||={version:1,bills:[],factions:{},communities:{},lastSupport:null,nextDay:null};
 s.bills||=[];s.factions||={};s.communities||={};
 if(c.parliament){
  const p=c.parliament;p.factions||=[];p.banned||=[];
  if(!Number.isFinite(p.nextElection))p.nextElection=year+(p.termYears||4);
  const sum=p.factions.reduce((n,f)=>n+Math.max(0,Number(f.pct)||0),0);
  if(sum>0)p.factions.forEach(f=>f.pct=Math.max(0,Number(f.pct)||0)/sum*100);
  const external=s.lastSupport!=null?(p.support??50)-s.lastSupport:0;
  for(const f of p.factions){
   const row=s.factions[f.name]||={name:f.name,support:actorClamp(f.support??p.support??50),interest:f.goal||'Представительство своих избирателей, участие в законодательстве и влияние на правительство'};
   row.seats=f.pct;row.active=true;row.support=actorClamp(row.support+external);
  }
  for(const row of Object.values(s.factions))if(!p.factions.some(f=>f.name===row.name)){row.active=false;row.seats=0;}
  const total=Object.values(s.factions).filter(f=>f.active).reduce((n,f)=>n+f.seats*f.support/100,0);
  if(sum>0)p.support=total;s.lastSupport=p.support??50;
 }else{for(const row of Object.values(s.factions)){row.active=false;row.seats=0;}s.lastSupport=null;}
 const dist=c.religion?.dist||{};
 for(const [name,share]of Object.entries(dist))if(Number.isFinite(share)&&share>0){
  const row=s.communities[name]||={name,interest:'Свобода совести, равные гражданские права, безопасность общины и возможность поддерживать свои учреждения'};
  row.share=share;
 }
 for(const row of Object.values(s.communities))row.share=Number(dist[row.name])||0;
 if(c.church){s.clergyInfluence=actorClamp(s.clergyInfluence??c.church.influence??40);s.churchPolicy||=c.church.exists?'recognized':'separated';}
 return s;
}
const institutionsOldActors=ensureWorldActors;
ensureWorldActors=function(){
 const all=institutionsOldActors();
 for(const owner of ALL_COUNTRIES){
  const c=countries[owner];if(!c||c.annexed)continue;
  const s=institutionState(c);
  const add=(id,kind,label,interest,influence,key)=>{
   const a=all[id]||={id,country:owner,kind,label,goal:interest,influence,grievance:0,memory:[],lastActionDay:null};
   a.label=label;a.influence=influence;a.institutionKey=key;return a;
  };
  for(const f of Object.values(s.factions)){
   const a=add(institutionId(owner,'faction',f.name),'faction',f.name+' · '+(c.displayName||owner),f.interest,
    f.active?Math.max(1,f.seats*(c.parliament?.power??0)/100):8,f.name);
   a.representation=f.active?'seated':c.parliament?.banned?.includes(f.name)?'banned':'outside';
  }
  for(const r of Object.values(s.communities).filter(r=>r.share>0)){
   add(institutionId(owner,'faith',r.name),'faith',r.name+' · '+(c.displayName||owner),r.interest,Math.max(1,Math.min(45,r.share*.6)),r.name);
  }
  if(c.church){
   const a=add(owner+'::church','church',(c.church.name||'Духовенство')+' · '+(c.displayName||owner),
    'Самостоятельность религиозных учреждений, положение духовенства, воспитание и отношения с властью',
    s.clergyInfluence,'clergy');
   a.statePrivilege=!!c.church.exists;
  }
 }
 return all;
};
window.institutionActorAvailable=function(a){
 const c=countries[a.country],s=c?.institutionsV1;
 if(!c||c.annexed||!s)return false;
 return a.kind==='church'?!!c.church:a.kind==='faith'?(s.communities[a.institutionKey]?.share||0)>0:!!s.factions[a.institutionKey];
};
function institutionMajority(c){
 const s=institutionState(c);
 return Object.values(s.factions).filter(f=>f.active&&f.support>=50).reduce((n,f)=>n+f.seats,0);
}
function institutionRequiresBill(c,kind,e){
 if(kind==='policy')return (e.operations||[]).some(step=>institutionRequiresBill(c,step.kind,step.effects));
 return INSTITUTION_LEGISLATIVE.includes(kind)&&c.parliament&&(c.parliament.power??0)>=50&&e.parliament?.route!=='decree'&&
  !(kind==='law'&&!e.law_slots&&!e.institutions&&!e.laws?.length);
}
globalThis.institutionAuthority=window.institutionAuthority=function(order,c){
 if(order.status!=='execute')return null;
 if(INSTITUTION_LEGISLATIVE.includes(order.kind)){
  if(order.effects.parliament?.veto)return {status:'blocked',reason:'Палата отклонила внесённый проект: '+order.effects.parliament.veto};
  // Contested bills are registered by the execution adapters below. Routine
  // executive work and decrees are never stopped by a blanket support threshold.
  return {status:'executed',reason:order.reason};
 }
 return null;
};
function institutionEvent(owner,headline,body,details,order=null){
 politicalEvent(owner,headline,body,details);
 const e=worldState.periodEvents.at(-1);e.sourceOrder=order;e.institutional=true;e.salience=60;
 return e;
}
function institutionProposeBill(owner,kind,effects,text,source=null,signal=null){
 const c=countries[owner],s=institutionState(c);
 const signature=JSON.stringify({kind,effects});
 const old=s.bills.find(b=>b.signature===signature&&['debate','contested'].includes(b.status));if(old)return old;
 const b={id:crypto.randomUUID(),owner,kind,effects:JSON.parse(JSON.stringify(effects)),text:String(text).slice(0,1000),
  source,signal,status:'debate',day:gameDayNumber(),voteDay:gameDayNumber()+14,deadline:gameDayNumber()+60,signature};
 s.bills.push(b);s.bills=s.bills.slice(-20);
 institutionEvent(owner,'Правительство вынесло спорный проект в палату',
  c.ruler+' внёс на рассмотрение '+(c.parliament.name||'палаты')+' предложение: «'+b.text+'». Согласия большинства пока нет; сторонникам проекта предстоит убедить колеблющихся депутатов или изменить условия.',
  'Проект зарегистрирован. Минимальное обсуждение 14 дней; спор сохраняется до 60 дней. Материальные эффекты пока не применены.',source);
 return b;
}
function institutionApplyExtras(owner,e){
 const c=countries[owner],s=institutionState(c),p=e.parliament,i=e.institutions;
 if(!c.society)initSociety(c);
 if(p&&c.parliament){
  if(p.name)c.parliament.name=p.name;
  if(p.electorate)c.parliament.electorate=[...p.electorate];
  if(p.next_election_year)c.parliament.nextElection=p.next_election_year;
  if(p.term_years&&!p.election&&!p.next_election_year)c.parliament.nextElection=year+p.term_years;
  if(p.election)c.parliament.nextElection=year;
 }
 if(i){
  if(i.church_name){c.church||={exists:false,name:i.church_name,influence:40};c.church.name=i.church_name;}
  if(i.church_policy){s.churchPolicy=i.church_policy;c.church||={exists:false,name:'Религиозные учреждения',influence:40};c.church.exists=i.church_policy==='recognized';}
  if(i.church_influence_delta!=null){s.clergyInfluence=actorClamp(s.clergyInfluence+i.church_influence_delta);if(c.church)c.church.influence=s.clergyInfluence;}
  if(i.religious_freedom_delta!=null){c.society.religiousFreedom=actorClamp((c.society.religiousFreedom??50)+i.religious_freedom_delta);}
  if(i.ruler_religion)c.rulerReligion=i.ruler_religion;
 }
 if(e.law_slots?.religion){
  const policy=e.law_slots.religion;
  if(policy==='secular'){s.churchPolicy='separated';if(c.church)c.church.exists=false;c.society.religiousFreedom=Math.max(c.society.religiousFreedom??50,85);}
  if(policy==='tolerant')c.society.religiousFreedom=Math.max(c.society.religiousFreedom??50,70);
 }
 if(p?.route==='decree'&&c.parliament&&(c.parliament.power??0)>=50){
  const a=ensureWorldActors()[owner+'::parliament'];if(a){a.grievance=actorClamp(a.grievance+15);a.issue={text:'Обход представительного органа указом',day:gameDayNumber()};}
  changeCountryStat(owner,'stability',-2);
 }
 if(s.churchPolicy==='suppressed'){
  const a=ensureWorldActors()[owner+'::church'];if(a){a.grievance=actorClamp(a.grievance+15);a.issue={text:'Преследование религиозных учреждений',day:gameDayNumber()};}
 }
}
const institutionsOldEffects=executeOrderEffects;
executeOrderEffects=function(e){
 const extra=e.institutions?JSON.parse(JSON.stringify(e.institutions)):null;
 const copy=JSON.parse(JSON.stringify(e));if(copy.institutions){delete copy.institutions.church_influence_delta;}
 const result=institutionsOldEffects(copy);
 if(!result||result.status==='executed')institutionApplyExtras(playerCountry,{...e,...(extra?{institutions:extra}:{})});
 return result;
};
const institutionsOldCountryEffects=applyCountryPoliticalEffects;
applyCountryPoliticalEffects=function(owner,kind,effects){
 const ctx=orderContext();ctx.player=owner;
 const checked=OrderRules.validateEffects(JSON.parse(JSON.stringify(effects)),ctx,'order',kind);
 const c=countries[owner];
 if(institutionRequiresBill(c,kind,checked)&&institutionMajority(c)<=50){
  const b=institutionProposeBill(owner,kind,checked,'Изменение государственной политики',null);
  return {status:'in_progress',reason:'Проект обсуждается в '+c.parliament.name,bill:b.id};
 }
 const result=institutionsOldCountryEffects(owner,kind,checked);
 if((owner!==playerCountry||kind==='economic')&&result.status==='executed'){
  if(checked.parliament&&c.parliament){
   if(checked.parliament.power_delta!=null)c.parliament.power=actorClamp(c.parliament.power+checked.parliament.power_delta);
   if(checked.parliament.term_years)c.parliament.termYears=checked.parliament.term_years;
  }
  institutionApplyExtras(owner,checked);
 }
 return result;
};
const institutionsOldPlan=applyOrderPlan;
applyOrderPlan=function(plan){
 const pending=[],remaining=[];
 for(const p of plan.orders){
  const c=countries[playerCountry],o=worldState.orders.find(x=>x.id===p.id);
  if(o&&['prepared','deferred'].includes(o.status)&&p.status==='execute'&&!p.process&&!p.effects.political_task&&
     institutionRequiresBill(c,p.kind,p.effects)&&institutionMajority(c)<=50&&!p.effects.parliament?.veto){
   const b=institutionProposeBill(playerCountry,p.kind,p.effects,o.text,o.id,p.signal);
   o.status='in_progress';o.kind=p.kind;o.bill=b.id;o.reason='Проект внесён в '+c.parliament.name+'; большинства пока нет.';
   o.effects={};o.signal=p.signal||null;o.before=orderStatSnapshot(c);o.after=orderStatSnapshot(c);o.resolvedTurn=turn;delete o.technicalError;pending.push(o);
  }else remaining.push(p);
 }
 const result=institutionsOldPlan({...plan,orders:remaining,politics:[]});
 const merged=[...result,...pending];recordActorReactions(pending);
 for(const d of plan.politics||[])try{executePoliticalDecision(d,merged);}catch(error){worldState.politicalErrors||=[];worldState.politicalErrors.push({actor:d.actor_id,error:error.message});}
 return merged;
};
const institutionsOldAbolish=abolishChurch;
abolishChurch=function(owner){
 const c=countries[owner];if(!c?.church?.exists)return false;
 const s=institutionState(c);s.clergyInfluence=Math.max(s.clergyInfluence,c.church.influence||0);
 c.church.exists=false;s.churchPolicy='separated';
 // Ending legal privilege does not erase the institution, confiscate its property
 // or declare every believer hostile. Reactions come from actual actor positions.
 worldState.pastEvents.push(owner+': религиозные учреждения отделены от государственной власти.');
 if(owner===playerCountry)renderChurchPanel();return true;
};
restoreChurch=function(owner,name){
 const c=countries[owner];if(!c||c.church?.exists)return false;
 c.church||={exists:false,name:name||'Религиозные учреждения',influence:40};
 c.church.exists=true;if(name)c.church.name=name;
 const s=institutionState(c);s.churchPolicy='recognized';c.church.influence=s.clergyInfluence;
 worldState.pastEvents.push(owner+': религиозные учреждения получили государственное признание.');
 if(owner===playerCountry)renderChurchPanel();return true;
};
function institutionUpdatePosition(a,delta){
 const c=countries[a.country],s=institutionState(c);
 if(a.kind==='faction'){
  const f=s.factions[a.institutionKey];if(f?.active){f.support=actorClamp(f.support+delta);s.lastSupport=null;institutionState(c);}
 }
 if(a.kind==='church')s.cooperation=actorClamp((s.cooperation??65)+delta);
}
const institutionsOldDecision=executePoliticalDecision;
executePoliticalDecision=function(d,results=[]){
 const a=ensureWorldActors()[d.actor_id],done=institutionsOldDecision(d,results);
 if(done&&a&&['faction','church','faith'].includes(a.kind)){
  const delta=({support:5,oppose:-8,rally:8,withhold:-12})[d.action]||0;
  if(delta)institutionUpdatePosition(a,delta);
 }
 return done;
};
const institutionsOldPublish=causalPublish;
causalPublish=function(owner,key,signal,fact,source=null){
 const event=institutionsOldPublish(owner,key,signal,fact,source);
 if(event)for(const impact of event.affected){
  const a=worldState.actors[impact.actor_id];if(a)institutionUpdatePosition(a,impact.stance*Math.min(20,impact.intensity*.2));
 }
 return event;
};
function institutionElect(owner){
 const c=countries[owner],p=c.parliament;if(!p)return;
 const s=institutionState(c),eligible=p.factions.filter(f=>!p.banned.includes(f.name));
 if(!eligible.length){p.nextElection=year+1;return;}
 const groups=Object.entries(c.economy?.classes||{}).filter(([key])=>!p.electorate||p.electorate.includes(key)).map(([,g])=>g),
  voters=groups.reduce((n,g)=>n+(g.share||0),0),loyalty=groups.reduce((n,g)=>n+(g.loyalty??50)*(g.share||0),0)/Math.max(1,voters);
 const before=eligible.map(f=>({name:f.name,pct:f.pct}));
 const weights=eligible.map(f=>{
  const row=s.factions[f.name],a=worldState.actors?.[institutionId(owner,'faction',f.name)];
  // Approximate competition from recorded support, public economic mood and
  // actual organisation, rather than AI rewriting seats on every turn.
  return Math.max(.01,f.pct)*(1+(row.support-50)/100*(loyalty-50)/100+(a?.organization||0)/250);
 });
 const sum=weights.reduce((n,w)=>n+w,0);eligible.forEach((f,i)=>{f.pct=weights[i]/sum*100;});
 p.factions=eligible;p.nextElection=year+(p.termYears||4);c.electionPending=false;s.lastSupport=null;institutionState(c);
 institutionEvent(owner,'Объявлены результаты выборов в '+p.name,
  'Избирательная кампания изменила расстановку сил в '+p.name+'. Крупнейшая фракция — «'+eligible.slice().sort((a,b)=>b.pct-a.pct)[0].name+'». Правительству предстоит строить отношения с новым составом палаты.',
  'Игровая модель: прежние доли, организация фракций и экономические настроения. До: '+JSON.stringify(before)+'; после: '+JSON.stringify(eligible.map(f=>({name:f.name,pct:f.pct}))));
}
checkElections=function(){
 for(const owner of ALL_COUNTRIES){const c=countries[owner];if(!c||c.annexed||!c.parliament)continue;
  institutionState(c);if(year>=c.parliament.nextElection)institutionElect(owner);
 }
};
function institutionTick(){
 const now=gameDayNumber();
 const due=ALL_COUNTRIES.filter(owner=>{
  const c=countries[owner];if(!c||c.annexed)return false;const state=c.institutionsV1;
  return !state||now>=(state.nextDay??-Infinity)||state.bills.some(b=>['debate','contested'].includes(b.status)&&now>=b.voteDay)||
   !!c.parliament&&year>=(c.parliament.nextElection??Infinity);
 });
 if(!due.length)return;
 ensureWorldActors();
 for(const owner of due){
  let c=countries[owner];if(!c||c.annexed)continue;let s=institutionState(c);
  for(let b of s.bills.filter(b=>['debate','contested'].includes(b.status)&&now>=b.voteDay)){
   if(!c.parliament){b.status='withdrawn';b.reason='Представительный орган распущен; проект нужно принять новым решением.';}
   else if(institutionMajority(c)>50){
    const ctx=orderContext();ctx.player=owner;
    try{
     const e=OrderRules.validateEffects(JSON.parse(JSON.stringify(b.effects)),ctx,'order',b.kind);
     // Revalidate resources at execution, through the ordinary atomic executor.
     const transaction=captureOrderExecution(),billId=b.id,programIds=new Set(c.econV3?.programs.map(p=>p.id)||[]);let verdict;
     const rollback=()=>{restoreOrderExecution(transaction);c=countries[owner];s=institutionState(c);b=s.bills.find(x=>x.id===billId);};
     try{verdict=institutionsOldCountryEffects(owner,b.kind,e);if(verdict.status!=='executed')rollback();}
     catch(error){rollback();verdict={status:'blocked',reason:error.message};}
     if(verdict.status==='executed'){
      b.status='passed';b.reason='Большинство поддержало проект.';if(owner!==playerCountry||b.kind==='economic')institutionApplyExtras(owner,e);
      const o=worldState.orders.find(o=>o.id===b.source);
      if(o){o.status='executed';o.effects=e;o.reason=b.reason;o.after=orderStatSnapshot(c);o.resolvedTurn=turn;
       const program=c.econV3?.programs.find(p=>!programIds.has(p.id)&&p.status==='active');
       if(program){program.orderId=o.id;o.status='in_progress';o.reason='Палата приняла проект; экономическая программа выполняется постепенно.';}
       if(owner===playerCountry)recordActorReactions([o]);
      }
      const task=ensurePolitics().tasks.find(t=>t.bill===b.id);
      if(task){task.status='executed';task.finished=now;task.reason=b.reason;}
      causalPublish(owner,'bill:'+b.id,{...(b.signal||{domain:'administration',visibility:'public',salience:60,targets:[],scope:'regional'}),summary:'Палата приняла предложение: '+b.text,affected:[]},b.reason,b.source);
      institutionEvent(owner,'Палата поддержала правительственный проект',
       c.parliament.name+' принял предложение: «'+b.text+'». Сторонники добились большинства; принятое решение вступило в действие.',b.reason,b.source);
      }else{
      b.status=now>=b.deadline?'defeated':'contested';b.reason=verdict.reason;b.voteDay=Math.min(b.deadline,now+14);
      if(b.status==='defeated')institutionEvent(owner,'Правительственный проект не удалось осуществить',
       'Палата поддержала предложение «'+b.text+'», но исполнители не смогли обеспечить его осуществление. Правительству предстоит пересмотреть условия и средства реализации.',b.reason,b.source);
     }
    }catch(error){b.status=now>=b.deadline?'defeated':'contested';b.reason=String(error.message);b.voteDay=Math.min(b.deadline,now+14);}
   }else if(now>=b.deadline){b.status='defeated';b.reason='Большинство не поддержало проект.';
    institutionEvent(owner,'Правительство не добилось большинства',
     c.parliament.name+' не поддержал предложение: «'+b.text+'». Оппозиция сохранила свои возражения. Власть может искать компромисс, внести новый проект или взять на себя последствия правления указами.',b.reason,b.source);
   }else{b.status='contested';b.voteDay=Math.min(b.deadline,now+14);}
   if(['withdrawn','defeated'].includes(b.status)){const task=ensurePolitics().tasks.find(t=>t.bill===b.id);if(task){task.status='blocked';task.reason=b.reason;task.finished=now;}const o=worldState.orders.find(o=>o.id===b.source);if(o){o.status='blocked';o.reason=b.reason;o.resolvedTurn=turn;}}
  }
  // A single dated transition per institution; quiet cooperation makes no news.
  if(now<(s.nextDay??-Infinity))continue;s.nextDay=now+30;
  const clergy=worldState.actors[owner+'::church'];
  if(clergy)s.cooperation=actorClamp((s.cooperation??65)+(clergy.stance==='support'?3:clergy.stance==='noncooperation'?-5:0));
  for(const r of Object.values(s.communities).filter(r=>r.share>0)){
   const a=worldState.actors[institutionId(owner,'faith',r.name)];
   if(!a)continue;
   const freedom=c.society?.religiousFreedom??50;
   if(freedom>=70&&a.grievance>0)a.grievance=Math.max(0,a.grievance-2);
   const established=c.institutionSeed?.stateReligion||c.religion?.main;
   if(freedom<35&&r.name!==established){
    a.grievance=actorClamp(a.grievance+2);a.issue={text:'Ограничения свободы совести и неравенство гражданских прав',day:now};
    if(a.grievance>=20)a.demand||={text:'Гарантии безопасности общины и равные гражданские права',since:now,status:'open'};
   }
  }
 }
 checkElections();
 if(countries[playerCountry]){renderParliamentPanel();renderChurchPanel();renderReligionPanel();}
}
const institutionsOldAdvance=advanceGameDays;
advanceGameDays=function(days){
 const count=Math.max(0,Math.floor(days)),all={econ:[],deaths:[],months:0};
 for(let i=0;i<count;i++){const result=institutionsOldAdvance(1);if(result){if(result.months){all.months+=result.months;all.econ=result.econ||all.econ;}all.deaths.push(...(result.deaths||[]));}institutionTick();}
 return all;
};
const institutionsOldEducation=econEducation;
econEducation=function(c){
 const result=institutionsOldEducation(c),s=institutionState(c);
 const share=(c.institutionSeed?.clergySchoolShare??.5)*({church:1,partial:.3,universal:0}[c.lawSlots?.education]??0);
 const cooperation=s.cooperation??65;
 const disruption=Math.min(.5,Math.max(0,65-cooperation)/100);
 const factor=1-actorClamp(share,0,1)*disruption;
 return {...result,clergyProvision:share,clergyCooperation:cooperation,institutionalFactor:factor,annualLiteracyGain:result.annualLiteracyGain*factor};
};
function institutionFacts(owner){
 const c=countries[owner],s=institutionState(c),p=c.parliament;
 return {assembly:p?{name:p.name,power:p.power,support:p.support,seatsSupporting:institutionMajority(c),nextElection:p.nextElection,electorate:p.electorate||null,factions:Object.values(s.factions).filter(f=>f.active).map(f=>({id:institutionId(owner,'faction',f.name),name:f.name,seats:f.seats,support:f.support,interest:f.interest}))}:null,
  pendingBills:s.bills.filter(b=>['debate','contested'].includes(b.status)).map(b=>({id:b.id,text:b.text,status:b.status,nextVote:processDate(b.voteDay),deadline:processDate(b.deadline)})),
  clergy:c.church?{id:owner+'::church',name:c.church.name,policy:s.churchPolicy,influence:s.clergyInfluence,cooperation:s.cooperation??65,schoolShare:econEducation(c).clergyProvision}:null,
  religion:{ruler:c.rulerReligion||null,freedom:c.society?.religiousFreedom??null,communities:Object.values(s.communities).filter(r=>r.share>0).map(r=>({id:institutionId(owner,'faith',r.name),name:r.name,share:r.share}))}};
}
const institutionsOldPlanning=orderPlanningContext;
orderPlanningContext=function(...args){const c=institutionsOldPlanning(...args);c.institutions=institutionFacts(playerCountry);return c;};
const institutionsOldPolicyContext=policyContext;
policyContext=function(...args){const c=institutionsOldPolicyContext(...args);for(const row of c.cabinets)row.institutions=institutionFacts(row.id);return c;};
const institutionsOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&(prompt.includes('Свободные приказы:')||prompt.startsWith('POLITICAL_CABINETS_V1'))){
  prompt+='\nИНСТИТУТЫ. institutions — реальные полномочия, фракции, обсуждаемые проекты, общины и положение духовенства. Сначала оцени конкретно затронутые интересы, затем affected и самостоятельные actors/politics. Фракции могут поддерживать, торговаться, организовать оппозицию и отказывать в сотрудничестве; общины и духовенство — защищать права, мобилизовать сторонников или поддерживать компромисс. Их позиции не равны позиции кабинета. Не реагируй всеми актёрами на каждую мелочь и не дублируй один спор палаты каждым депутатом. Не считай название партии гарантией позиции. Религия населения не исчезает от светского закона и не меняется приказом; вера правителя меняется отдельно. Светский строй, признание общин и подавление учреждений — разные решения. Законодательная мера при сильной палате без большинства вносится как проект, а не запрещается заранее. Для явно выбранного правления указами допустим parliament:{route:"decree"} — цена обхода палаты считается движком. Обычное поручение министру, посольство, речь, отчёт и назначение не становятся законопроектами. Изменения: power parliament:{restore:true,name,power_delta:-30..30,term_years:1..15,election:true только для немедленных выборов,next_election_year:год, electorate:["noble|burgher|commons|peasants|middle"],factions:[{name,pct}]} при учреждении новой палаты. Начальный назначенный состав можно задать, будущий исход выборов не гарантируется. Ежегодные выборы — term_years:1, не обязательно election:true. Создание палаты и назначение её выборов разрешены одним решением; law institutions:{church:"abolish|restore",church_policy:"recognized|separated|suppressed",church_name,church_influence_delta:-20..20,religious_freedom_delta:-20..20,ruler_religion}; law_slots.religion сохраняет действующие варианты. Не выдумывай собственность или расходы духовенства: денежные изменения только через бюджет/экономические operations. При секуляризации church:abolish означает отделение от государства, не исчезновение верующих. Газета пишет о конфликте интересов, людях и цене решения; технические статусы проекта остаются в деталях.';
 }
 return institutionsOldAsk(prompt,...args);
};
const institutionEsc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const institutionRow=(label,value)=>'<div class="irow"><span class="k">'+institutionEsc(label)+'</span><span>'+institutionEsc(value)+'</span></div>';
renderParliamentPanel=function(){
 const box=document.getElementById('parliament-box'),c=countries[playerCountry];if(!box||!c)return;const s=institutionState(c),p=c.parliament;
 box.innerHTML=p?institutionRow('Представительный орган',p.name)+institutionRow('Полномочия',Math.round(p.power||0)+'/100')+institutionRow('Места сторонников курса',Math.round(institutionMajority(c))+'%')+
  Object.values(s.factions).filter(f=>f.active).map(f=>institutionRow(f.name,Math.round(f.seats)+'% мест · поддержка '+Math.round(f.support)+'/100')).join('')+
  institutionRow('Следующие выборы',p.nextElection+' г.')+(p.electorate?institutionRow('Право голоса',p.electorate.map(k=>c.economy?.classes[k]?.label||k).join(', ')):''):'<p>Представительного органа нет. Политические движения и бывшие депутаты сохраняют свои интересы.</p>';
 box.innerHTML+=s.bills.filter(b=>['debate','contested'].includes(b.status)).map(b=>'<p>'+institutionEsc(b.text)+'<br><small>Обсуждение · ближайшее голосование '+institutionEsc(processDate(b.voteDay))+'</small></p>').join('')+
  '<small>Проекты, переговоры с фракциями, выборы и правление указами — через обычные приказы. Сильная палата рассматривает спорные законы; исполнительные поручения не требуют её голосования.</small>';
};
renderChurchPanel=function(){
 const box=document.getElementById('church-box'),c=countries[playerCountry];if(!box||!c)return;const s=institutionState(c),ch=c.church;
 const policies={recognized:'Государственное признание',separated:'Отделена от государства',suppressed:'Учреждения под давлением'};
 box.innerHTML=ch?institutionRow('Духовенство',ch.name)+institutionRow('Положение',policies[s.churchPolicy])+institutionRow('Общественное влияние',Math.round(s.clergyInfluence)+'/100')+
  institutionRow('Сотрудничество',Math.round(s.cooperation??65)+'/100')+institutionRow('Участие в образовании',Math.round(econEducation(c).clergyProvision*100)+'% исходного обеспечения')+
  '<small>Государственное содержание отражается в бюджете. Отделение от государства сохраняет духовенство и верующих. Конфликт влияет на сотрудничество и доступность церковного образования.</small>':'<p>Отдельный институт духовенства не задан сценарием.</p>';
};
renderReligionPanel=function(){
 const box=document.getElementById('religion-box'),c=countries[playerCountry];if(!box||!c)return;const s=institutionState(c),rows=Object.values(s.communities).filter(r=>r.share>0);
 box.innerHTML=(rows.length?rows.map(r=>{const a=worldState.actors?.[institutionId(playerCountry,'faith',r.name)];return institutionRow(r.name,r.share.toFixed(1)+'% · напряжение '+Math.round(a?.grievance||0)+'/100');}).join(''):'<p>Религиозный состав не задан сценарием; игра не придумывает доли населения.</p>')+
  institutionRow('Свобода совести',Math.round(c.society?.religiousFreedom??50)+'/100')+
  (c.rulerReligion?institutionRow('Вера правителя',c.rulerReligion):'')+
  '<small>Общины отстаивают права и безопасность. Их доли — состав населения, не процент поддержки власти; указ не обращает население в другую веру.</small>';
};
window.INSTITUTIONS_V1=true;

const institutionsOldProgress=livingOrderProgress;
livingOrderProgress=function(o){const b=countries[playerCountry]?.institutionsV1?.bills.find(b=>b.id===o.bill);return b?{type:'Законопроект',status:({debate:'Обсуждение',contested:'Поиск большинства',passed:'Принят',defeated:'Отклонён',withdrawn:'Снят с рассмотрения'})[b.status],remainingDays:Math.max(0,b.voteDay-gameDayNumber()),reason:b.reason||null}:institutionsOldProgress(o);};

const institutionsOldFinishTask=finishPoliticalTask;
finishPoliticalTask=function(t){
 if(!countries[t.country])return institutionsOldFinishTask(t);
 const before=new Set(institutionState(countries[t.country]).bills.map(b=>b.id));
 const result=institutionsOldFinishTask(t);
 for(const b of institutionState(countries[t.country]).bills)if(!before.has(b.id)){t.bill=b.id;if(!b.source&&t.source){b.source=t.source;const o=worldState.orders.find(o=>o.id===t.source);if(o)o.bill=b.id;}}
 return result;
};
