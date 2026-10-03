/* Persistent interests and bounded actor actions. No network and no country-specific exceptions. */
'use strict';
const ACTOR_ACTIONS=['support','petition','obstruct','protest','recruit','social_spending','offer_talks','denounce'];
const actorClamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
function ensureWorldActors(){
 const all=worldState.actors||(worldState.actors={});
 ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).forEach(n=>{
  const c=countries[n],add=(key,label,goal,influence)=>{
   const id=n+'::'+key;
   if(!all[id])all[id]={id,country:n,kind:key,label,goal,influence,grievance:0,memory:[],lastActionDay:null};
   all[id].label=label;all[id].influence=influence;
  };
  add('cabinet','Кабинет '+(c.displayName||n),'Исполнимость решений, устойчивость правительства и платёжеспособность казны',55);
  add('military','Военное командование '+(c.displayName||n),'Безопасность страны, содержание армии и влияние командования',actorClamp(c.militarySupport??60));
  if(c.parliament)add('parliament','Парламент '+(c.displayName||n),'Сохранение полномочий и представительство интересов фракций',c.parliament.power??50);
  if(c.church?.exists)add('church','Духовенство '+(c.displayName||n),'Сохранение религиозных институтов и общественного влияния',c.church.influence??40);
  Object.entries(c.economy?.classes||{}).forEach(([key,v])=>add('class_'+key,v.label+' · '+(c.displayName||n),'Доходы своей группы, приемлемые налоги и защита положения в обществе',key==='noble'?60:key==='burgher'?55:45));
  if(n!==playerCountry)add('government','Правительство '+(c.displayName||n),c.agenda||'Устойчивость государства, безопасность и развитие хозяйства',60);
 });
 return all;
}
function actorAvailable(a){
 const c=countries[a.country];return c&&!c.annexed&&!(a.kind==='parliament'&&!c.parliament);
}
function actorRemember(a,text){
 a.memory.push({date:dateLabel(),day:gameDayNumber(),text:String(text).slice(0,500)});
 a.memory=a.memory.slice(-8);
}
function actorNotice(a,headline,body,details='',priority=3){
 recordWorldEvent(a.country===playerCountry?'domestic':'foreign',headline,body,[a.country],details);
 const event=worldState.periodEvents.at(-1);event.priority=priority;event.actor=a.id;
 actorRemember(a,headline+'. '+body);
}
function actorContext(){
 const registry=ensureWorldActors(),peers=selectPoliticalCountries(playerCountry,6);
 return Object.values(registry).filter(a=>actorAvailable(a)&&(a.country===playerCountry||peers.includes(a.country)&&a.kind==='government'))
  .map(a=>({id:a.id,country:a.country,role:a.label,goal:a.goal,influence:a.influence,grievance:a.grievance,memory:a.memory.slice(-2).map(m=>m.text),stability:countries[a.country].stability,army:countries[a.country].army,relation:a.country!==playerCountry?getRelation(a.country,playerCountry):null}));
}
function recordActorReactions(results){
 const registry=ensureWorldActors(),c=countries[playerCountry];
 results.forEach(o=>{
  if(!['executed','in_progress'].includes(o.status))return;
  const stamp=o.id+':'+o.status;
  if(worldState.actorOrderReceipts?.includes(stamp))return;
  worldState.actorOrderReceipts=[...(worldState.actorOrderReceipts||[]),stamp].slice(-200);
  const e=o.status==='in_progress'?ensureExecutiveProcesses().find(p=>p.id===o.id)?.effects||{}:o.effects||{};
  const own=kind=>registry[playerCountry+'::'+kind];
  const react=(a,grievance,headline,body)=>{
   if(!a||!actorAvailable(a))return;
   a.grievance=actorClamp(a.grievance+grievance);a.issue={orderId:o.id,text:o.text,day:gameDayNumber()};
   actorNotice(a,headline,body,'Основание: '+o.text+'. Напряжение участника '+a.grievance+'/100.');
  };
  if(e.economy){
   const old=JSON.parse(o.before?.taxes||'{}');
   const fields={tax_noble:'noble',tax_burgher:'burgher',tax_commons:'commons'};
   Object.entries(e.economy).forEach(([field,value])=>{
    const key=fields[field],difference=value-(old[key]??value),a=own('class_'+key);if(!difference)return;
    react(a,actorClamp(difference*1.5,-20,35),difference>0?'Налоговый указ встретил возражения':'Налоговое послабление получило поддержку',
     a.label+(difference>0?' обращается к правительству с требованием смягчить новую нагрузку. Представители группы связывают своё дальнейшее отношение к власти с ответом на это требование.':' поддерживает снижение нагрузки. Для этой группы решение стало доводом в пользу сотрудничества с властью.'));
   });
  }
  if(e.society){
   const old=JSON.parse(o.before?.spending||'{}');
   const delta=(e.society.education_spending??old.education)-(old.education||0)+(e.society.welfare_spending??old.welfare)-(old.welfare||0);
   if(delta){const a=own('class_commons');react(a,delta>0?-8:12,delta>0?'Общественные представители поддержали новые расходы':'Сокращение помощи вызвало возражения',
    a.label+(delta>0?' приветствует решение направить больше средств на образование или помощь населению. Поддержка касается самого решения: результатов программы ещё предстоит дождаться.':' требует пересмотреть сокращение социальных расходов. Недовольство связано с ожидаемым ухудшением положения населения.'));}
  }
  if(e.pm_name||e.government||e.parliament||e.law_slots||e.institutions){
   const a=own('cabinet'),controversial=!!e.government||!!e.parliament?.dissolve||!!e.parliament?.ban_party;
   react(a,controversial?12:3,controversial?'Кабинет требует определить порядок перехода':'Кабинет обсуждает новое решение',
    a.label+(controversial?' требует ясного распределения полномочий при изменении государственного устройства. Исполнители связывают согласованность дальнейшей работы с устойчивостью нового порядка.':' обсуждает распределение обязанностей после решения главы государства. Вопрос об исполнении распоряжения включён в повестку правительства.'));
   const parl=own('parliament');
   if(parl&&actorAvailable(parl))react(parl,controversial?20:5,'Парламент обозначил свою позицию',
    parl.label+(controversial?' выступает против ослабления своих полномочий и требует обсуждения изменений.':' требует возможности обсуждать последствия решения и контролировать его исполнение.'));
   if(e.institutions?.church==='abolish'){
    const church=own('church');if(church)react(church,35,'Духовенство требует пересмотра решения',church.label+' выступает против ликвидации государственной церкви и требует вернуть институту прежнее положение. Указ не устранил само духовенство как общественную силу.');
   }
  }
  if(e.army_delta>0){
   const a=own('military');react(a,-5,'Военное командование поддержало набор',
    a.label+' поддерживает пополнение армии и требует обеспечить подготовку и содержание новых частей. Поддержка распоряжения не означает, что новобранцы уже готовы к службе.');
  }
  if(e.debt_delta>0){
   const a=own('cabinet');react(a,5,'Кабинет поставил вопрос об обслуживании займа',
    a.label+' включил обслуживание нового займа в финансовую повестку. Привлечённые деньги расширяют возможности правительства, но будущие выплаты остаются его обязательством.');
  }
  const threats=e.army_delta>Math.max(25000,c.army*.1)||e.war_declared?.length||e.government||e.parliament?.dissolve;
  if(threats&&activeScenario?.rules?.autonomousWorld!==false){
   const peers=Object.values(registry).filter(a=>a.kind==='government'&&actorAvailable(a)&&a.country!==playerCountry&&politicalRanking().some(p=>p.id===a.country&&(p.neighbor||p.distance<15||p.gdpRank<=6||isAtWar(playerCountry,a.country))))
    .sort((a,b)=>(politicalRanking().find(p=>p.id===b.country)?.score||0)-(politicalRanking().find(p=>p.id===a.country)?.score||0)).slice(0,3);
   peers.forEach(a=>{
    const relation=getRelation(a.country,playerCountry),aligned=/монарх|импер|королев|самодерж/i.test(countries[a.country].government)===/монарх|импер|королев|самодерж/i.test(c.government);
    const alarm=e.army_delta>0||e.war_declared?.length;
    const delta=alarm?(relation>40?0:-3):aligned?1:-2;
    if(delta)addRelation(a.country,playerCountry,delta);
    const concern=alarm?(relation>40?5:e.war_declared?.length?30:Math.min(30,10+Math.round(e.army_delta/Math.max(1,c.army)*10))):aligned?-3:8;
    a.grievance=actorClamp(a.grievance+concern);a.issue={orderId:o.id,text:o.text,day:gameDayNumber()};
    actorNotice(a,alarm?'Соседняя держава запросила объяснения':'Зарубежный кабинет обсудил перемены во власти',
     countries[a.country].ruler+' поручил правительству оценить '+(alarm?'военные намерения':'политический курс')+' державы «'+(c.displayName||playerCountry)+'». '+(alarm?'По дипломатическим каналам направлен запрос о целях решения; ответ будет иметь значение для дальнейших отношений.':'Позиция кабинета зависит от безопасности державы и его отношения к новому порядку.'),
     'Повод: '+o.text+'. Отношения '+relation+' → '+getRelation(a.country,playerCountry)+'.');
   });
  }
 });
}
function actorCanAct(a,action){
 if(!a||!actorAvailable(a))return false;
 const c=countries[a.country];
 if(a.lastActionDay!=null&&gameDayNumber()-a.lastActionDay<(a.kind==='government'?45:21))return false;
 if(action==='support')return a.kind!=='government'&&a.grievance<15&&!!a.issue;
 if(action==='petition')return a.kind!=='government'&&(a.grievance>=15||c.society?.poverty>65||c.lastBudget?.net<0);
 if(action==='obstruct')return a.kind==='parliament'&&a.grievance>=30&&c.parliament.support<55;
 if(action==='protest')return a.kind.startsWith('class_')&&a.grievance>=40&&(c.economy?.classes[a.kind.slice(6)]?.loyalty??100)<45;
 if(a.kind!=='government'||a.country===playerCountry)return false;
 if(action==='recruit')return !(worldState.actorRecruitment||[]).some(p=>p.country===a.country)&&(isAtWar(a.country,playerCountry)||a.grievance>=20)&&c.treasury>Math.ceil(5000*.002)&&c.army+5000<=Math.round(c.population*1000*getEra().armyMaxShare);
 if(action==='social_spending')return !!c.society&&c.lastBudget?.net>0&&!(c.parliament?.power>=50&&c.parliament.support<50)&&c.society.spending[c.society.poverty>60?'welfare':'education']<Math.round(c.income*.25);
 if(action==='offer_talks')return !isAtWar(a.country,playerCountry)&&getRelation(a.country,playerCountry)>-35&&a.grievance<25;
 if(action==='denounce')return a.grievance>=25&&getRelation(a.country,playerCountry)<0;
 return false;
}
function executeActorAction(a,action,motive){
 if(!actorCanAct(a,action))return false;
 const c=countries[a.country],reason=motive||a.goal,details=[];
 if(action==='support'){
  if(a.kind==='military'){c.militarySupport=actorClamp((c.militarySupport??60)+1);details.push('Поддержка армии +1');}
  else if(a.kind==='parliament'){c.parliament.support=actorClamp(c.parliament.support+1);details.push('Поддержка парламента +1');}
  else if(a.kind.startsWith('class_')){const v=c.economy.classes[a.kind.slice(6)];v.loyalty=actorClamp(v.loyalty+1);details.push('Поддержка группы +1');}
 }else if(action==='petition'){
  a.demand={text:reason,since:gameDayNumber(),status:'open'};details.push('Требование сохраняется в памяти участника');
 }else if(action==='obstruct'){
  c.parliament.support=actorClamp(c.parliament.support-2);details.push('Поддержка парламента −2; влияет на проверку следующих реформ');
 }else if(action==='protest'){
  changeCountryStat(a.country,'stability',-1);details.push('Стабильность −1');
 }else if(action==='recruit'){
  const pending=(worldState.actorRecruitment||[]).filter(p=>p.country===a.country);
  if(pending.length)return false;
  const cost=10;changeCountryStat(a.country,'treasury',-cost);
  (worldState.actorRecruitment||(worldState.actorRecruitment=[])).push({country:a.country,troops:5000,due:gameDayNumber()+90,cost});
  details.push('Набор 5000; подготовка 90 дней; казна −10; готовая армия пока прежняя');
 }else if(action==='social_spending'){
  const key=c.society.poverty>60?'welfare':'education',delta=Math.min(Math.max(1,Math.round(c.income*.01)),Math.floor(c.lastBudget.net));
  if(delta<1)return false;
  const old=c.society.spending[key];c.society.spending[key]=Math.min(Math.round(c.income*.25),old+delta);
  details.push('Расходы '+key+': '+old+' → '+c.society.spending[key]+' в месяц');
 }else if(action==='offer_talks'){
  addRelation(a.country,playerCountry,1);details.push('Отношения +1; приглашение к переговорам не заключает договор');
 }else if(action==='denounce'){
  addRelation(a.country,playerCountry,-2);details.push('Отношения −2');
 }
 const headings={support:'Поддержка курса получила публичное выражение',petition:'Представители интересов предъявили требование',obstruct:'Парламент усиливает сопротивление',protest:'Общественная группа выступила с протестом',recruit:'Соседняя держава начала подготовку пополнений',social_spending:'Зарубежный кабинет объявил социальную программу',offer_talks:'Из-за границы поступило предложение переговоров',denounce:'Зарубежное правительство осудило курс державы'};
 const descriptions={support:'публично поддерживает курс власти',petition:'предъявляет правительству требование',obstruct:'затрудняет согласование новых решений',protest:'организует протестное выступление',recruit:'приступает к набору и подготовке дополнительных войск',social_spending:'увеличивает финансирование социальной программы',offer_talks:'предлагает обсудить взаимные интересы по дипломатическим каналам',denounce:'публично критикует политику державы'};
 actorNotice(a,headings[action],a.label+' '+descriptions[action]+'. Основание позиции: '+reason+'.'+(a.issue?' В центре обсуждения остаётся решение: '+a.issue.text+'.':''),details.join('; '),2);
 a.lastActionDay=gameDayNumber();
 return true;
}
function applyActorIntents(intents){
 const registry=ensureWorldActors();
 (intents||[]).slice(0,6).forEach(p=>{const a=registry[p.actor_id];if(a?.kind==='government'&&activeScenario?.rules?.autonomousWorld===false)return;executeActorAction(a,p.action,p.motive);});
}
function tickWorldActors(){
 const now=gameDayNumber(),pending=worldState.actorRecruitment||[];
 if(now%7!==0&&!pending.some(p=>p.due<=now))return;
 const registry=ensureWorldActors();
 pending.filter(p=>p.due<=now).forEach(p=>{
  const c=countries[p.country];if(!c||c.annexed)return;
  if(c.army+p.troops>Math.round(c.population*1000*getEra().armyMaxShare))return;
  changeCountryStat(p.country,'army',p.troops);
  const a=registry[p.country+'::government'];if(a)actorNotice(a,'Подготовка новых частей завершена',a.label+' завершило подготовку пополнений. Новые части включены в состав действующей армии.','Армия +'+p.troops,2);
 });
 worldState.actorRecruitment=pending.filter(p=>p.due>now);
 if(now%7!==0)return;
 // Daily calendar decides cadence; a year skip does not produce one reaction or extra AI calls per week.
 const own=Object.values(registry).filter(a=>a.country===playerCountry&&actorAvailable(a));
 own.forEach(a=>{
  const c=countries[a.country],key=a.kind.startsWith('class_')?a.kind.slice(6):null;
  if(key){const v=c.economy?.classes[key];if(v?.loyalty<45)a.grievance=actorClamp(a.grievance+3);else if(v?.loyalty>60)a.grievance=actorClamp(a.grievance-3);}
  if(a.demand?.status==='open'&&a.grievance<10){a.demand.status='resolved';actorNotice(a,'Прежнее требование потеряло остроту',a.label+' считает, что давление по прежнему вопросу можно ослабить. Изменение позиции связано с улучшением положения группы.','Требование закрыто',2);}
  const action=['protest','obstruct','petition','support'].find(action=>actorCanAct(a,action));
  if(action)executeActorAction(a,action);
 });
 if(activeScenario?.rules?.autonomousWorld===false)return;
 const peers=Object.values(registry).filter(a=>a.kind==='government'&&actorAvailable(a));
 if(!peers.length)return;
 const chosen=selectPoliticalCountries(playerCountry,5);
 const nearby=chosen.map(n=>peers.find(a=>a.country===n)).filter(Boolean).slice(0,5);
 const offset=((Math.floor(now/7)%peers.length)+peers.length)%peers.length;
 const selected=[...new Map([...nearby,peers[offset],peers[(offset+1)%peers.length]].map(a=>[a.id,a])).values()];
 selected.forEach(a=>{
  const action=['recruit','denounce','social_spending','offer_talks'].find(action=>actorCanAct(a,action));
  if(action)executeActorAction(a,action);
 });
}
