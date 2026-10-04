/* Stateful political cabinets: decisions follow committed facts, never a news template. */
'use strict';
window.POLITICAL_SUBJECTS=true;
function policyState(){
 const p=worldState.politicalSubjects||={version:2,cabinets:{},round:0,audit:[],calls:{turn:null,used:0}};
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
 prosperity:{gdp:c.gdp,population:c.population,treasury:c.treasury,debt:c.debt,budget:typeof econBudget==='function'?{gross:econBudget(c).gross,net:econBudget(c).net,expense:econBudget(c).expense}:null},
 regime:{ruler:c.ruler,pm:c.pm,government:c.government,stability:c.stability,reputation:c.reputation,parliament:c.parliament,agenda:c.agenda||null,groups:Object.fromEntries(Object.entries(c.economy?.classes||{}).map(([k,v])=>[k,{tax:v.tax,loyalty:v.loyalty}])),spending:c.society?.spending,poverty:c.society?.poverty},
 implementation:{active:ensurePolitics().tasks.filter(t=>t.country===id&&t.status==='active').map(t=>({id:t.id,goal:t.goal.slice(0,300),target:t.target,status:t.status,due:t.due,kind:t.kind})),records:(c.politicalRecords||[]).slice(-4).map(t=>({goal:t.goal.slice(0,250),result:t.result.slice(0,400),date:t.date})),
 programs:(c.econV3?.programs||[]).filter(p=>p.status==='active').map(p=>({kind:p.kind,group:p.group,sector:p.sector,target:p.target,remainingDays:Math.max(0,p.days-p.elapsed)})),
 recruitment:(worldState.actorRecruitment||[]).filter(p=>p.country===id),outgoing:s.offers.filter(o=>o.a===id&&o.status==='open').map(o=>({id:o.id,target:o.b,type:o.type,terms:o.terms,expires:o.expires})),
 recent:ensurePolitics().decisions.filter(d=>d.country===id).slice(-5).map(d=>({goal:d.goal,action:d.action,target:d.target,material:d.material,date:d.date})),lastSignals:policyCabinet(id).lastSignals||[]},
 alternatives:policyOpportunities(id),
 capacity:{army:c.army,availableTroops:Math.max(0,c.army-worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===id).reduce((n,u)=>n+(u.troops||0),0)),units:worldState.mapObjects.filter(u=>u.owner===id).map(u=>({id:u.id,type:u.type,troops:u.troops,province:strategyUnitProvince(u),supply:u.supply,route:s.routes.find(r=>r.unit===u.id)?.path.at(-1)}))}};
}
function policyNotice(source,target,text,kind='diplomacy'){
 if(!countries[target]||countries[target].annexed||target===source)return;
 const a=policyCabinet(target),key=source+'|'+kind+'|'+text;
 if(a.inbox.some(i=>i.key===key&&gameDayNumber()-i.day<90))return;
 const resolved=['accept','reject_offer','resolution'].includes(kind);
 a.inbox.push({id:crypto.randomUUID(),key,source,kind,text:String(text).slice(0,900),day:gameDayNumber(),status:resolved?'reviewed':'open'});
 if(resolved)policyRemember(target,text);
 a.inbox=a.inbox.slice(-12);a.reviewDay=gameDayNumber();
}
function policyOpportunities(id){
 const c=countries[id],ownBudget=typeof econBudget==='function'?econBudget(c):null,geo=politicalGeography(),s=strategyState();
 const peers=selectPoliticalCountries(id,6);
 return {home:{balance:ownBudget?.net,poverty:c.society?.poverty,literacy:c.society?.literacy,
 sectors:c.econV3?Object.fromEntries(Object.entries(c.econV3.sectors).map(([k,v])=>[k,{stateShare:v.stateShare,output:v.output}])):null,coordination:c.econV3?.policy.coordination,
 grievances:Object.values(c.economy?.classes||{}).filter(g=>g.loyalty<45).map(g=>({group:g.label,loyalty:g.loyalty}))},
 region:peers.map(n=>({id:n,neighbor:geo.neighbors[id]?.has(n)||false,distance:Math.round(politicalDistance(id,n,geo)*10)/10,
 relations:getRelation(id,n),armyRatio:Math.round(countries[n].army/Math.max(1,c.army)*100)/100,warWith:policyLive().filter(other=>other!==n&&isAtWar(n,other)),
 borderForces:worldState.mapObjects.filter(u=>u.type==='army'&&u.owner===n&&[...(strategyGeometry().graph[strategyUnitProvince(u)]||[])].some(p=>strategyOwner(strategyProvince(p))===id)).map(u=>({troops:u.troops,province:u.province})),
 treaties:s.contracts.filter(t=>t.status==='active'&&[t.a,t.b].includes(n)&&[t.a,t.b].includes(id)).map(t=>({type:t.type,terms:t.terms}))}))};
}
function policySnapshot(){
 const live=policyLive(),wars=[];
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)if(isAtWar(live[i],live[j]))wars.push([live[i],live[j]]);
 return {wars,leaders:Object.fromEntries(live.map(n=>[n,[countries[n].ruler,countries[n].pm,countries[n].government].join('|')])),
 units:Object.fromEntries((worldState.mapObjects||[]).filter(u=>u.type==='army').map(u=>[u.id,{owner:u.owner,province:strategyUnitProvince(u),troops:Math.floor((u.troops||0)/5000)*5000}]))};
}
function policyScanWorld(){
 const state=policyState(),now=policySnapshot(),old=state.observed||{wars:[],leaders:now.leaders,units:{}},live=policyLive(),geo=politicalGeography(),s=strategyState();
 const major=live.slice().sort((a,b)=>countries[b].gdp-countries[a].gdp).slice(0,8);
 const interested=participants=>[...new Set([...participants,...participants.flatMap(n=>[...(geo.neighbors[n]||[])]),
 ...s.contracts.filter(c=>c.status==='active'&&participants.some(n=>[c.a,c.b].includes(n))).flatMap(c=>[c.a,c.b]),
 ...(participants.some(n=>major.includes(n))?major:[])])].filter(n=>countries[n]&&!countries[n].annexed);
 const notify=(participants,text,kind)=>{
  for(const recipient of interested(participants).filter(n=>n!==playerCountry)){
   const source=participants.find(n=>n!==recipient)||participants[0];
   policyNotice(source,recipient,text,kind);
  }
 };
 for(const pair of now.wars.filter(p=>!old.wars.some(o=>o[0]===p[0]&&o[1]===p[1])))notify(pair,'Началась война между '+pair.join(' и ')+'. Оцени угрозу границам, договорные обязательства, торговлю и возможное изменение регионального равновесия. Исход войны не определён.','war');
 for(const pair of old.wars.filter(p=>!now.wars.some(o=>o[0]===p[0]&&o[1]===p[1])))notify(pair,'Война между '+pair.join(' и ')+' прекращена. Пересмотри военные меры и дипломатические цели по действующим условиям.','peace');
 for(const [id,u]of Object.entries(now.units)){
  const previous=old.units[id];if(previous&&previous.owner===u.owner&&previous.province===u.province&&previous.troops===u.troops)continue;
  const observers=new Set([...(strategyGeometry().graph[u.province]||[])].map(p=>strategyOwner(strategyProvince(p))).filter(n=>n!==u.owner));
  for(const recipient of observers)policyNotice(u.owner,recipient,'В провинции '+u.province+' у вашей границы размещены '+u.troops+' действующих солдат страны '+u.owner+'. Проверь их задачу и соотношение сил; это само по себе не объявление войны.','border');
  if(previous?.province&&previous.province!==u.province)for(const recipient of new Set([...(strategyGeometry().graph[previous.province]||[])].map(p=>strategyOwner(strategyProvince(p))).filter(n=>n!==u.owner)))policyNotice(u.owner,recipient,'Часть '+u.troops+' солдат страны '+u.owner+' покинула прежнюю провинцию '+previous.province+'. Оцени, уменьшилась ли угроза у границы.','withdrawal');
 }
 for(const n of live)if(old.leaders[n]&&old.leaders[n]!==now.leaders[n])notify([n],'В стране '+n+' изменилась исполнительная власть: '+now.leaders[n]+'. Действующие договоры сохраняются; оценка признания и сотрудничества остаётся за вашим кабинетом.','leadership');
 state.observed=now;
}
function policyPending(id){
 const a=policyCabinet(id),considered=a.considered||{},need=i=>i.status==='open'&&(!considered[i.id]||considered[i.id].revision!==(i.lastUpdate??i.created??i.day)||considered[i.id].due<=gameDayNumber());
 return {inbox:a.inbox.filter(need),issues:ensureNewsFlow().issues.filter(i=>i.recipient===id&&need(i)),
 offers:[...strategyState().offers,...(typeof maritimeState==='function'?maritimeState().tradeOffers||[]:[])].filter(i=>i.b===id&&need(i))};
}
function policySelect(limit=6,respondOnly=false,excluded=[]){
 const live=policyLive().filter(n=>n!==playerCountry&&!excluded.includes(n)),geo=politicalGeography(),ranking=policyLive().slice().sort((a,b)=>countries[b].gdp-countries[a].gdp);
 const issues=ensureNewsFlow().issues.filter(i=>i.status==='open'),s=strategyState();
 const offers=[...s.offers,...(typeof maritimeState==='function'?maritimeState().tradeOffers||[]:[])].filter(o=>o.status==='open');
 const candidates=live.map(n=>{
  const a=policyCabinet(n),pending=policyPending(n),incoming=pending.inbox,addressed=pending.issues,proposal=pending.offers;
  const urgent=incoming.length+addressed.length+proposal.length>0,wars=policyLive().filter(other=>other!==n&&isAtWar(n,other)),stale=Math.max(0,gameDayNumber()-(a.lastReviewDay??gameDayNumber()-120));
  if(respondOnly&&!urgent)return null;
  if(!respondOnly&&!urgent&&a.reviewDay>gameDayNumber()&&!wars.length&&stale<90)return null;
  const crisis=incoming.some(i=>['war','border','peace'].includes(i.kind));
  return {n,stale,urgent,score:Math.min(3,incoming.length)*70+Math.min(3,addressed.length)*50+Math.min(2,proposal.length)*100+
   (crisis?180:0)+(wars.length?400:0)+(geo.neighbors[n]?.has(playerCountry)?35:0)+(a.reviewDay<=gameDayNumber()?30:0)+
   (a.goals.some(g=>g.status==='active')?15:0)+Math.max(0,28-ranking.indexOf(n)*2)+Math.min(120,stale)};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.n.localeCompare(b.n));
 if(respondOnly)return candidates.slice(0,limit).map(x=>x.n);
 const selected=candidates.slice(0,limit);
 // Preserve one independent regional agenda when crises leave a slot; neglected countries get a turn.
 const background=candidates.filter(x=>!x.urgent).sort((a,b)=>b.stale-a.stale||b.score-a.score)[0];
 if(background&&selected.length===limit&&!selected.some(x=>x.n===background.n)&&!selected.at(-1).urgent)selected[selected.length-1]=background;
 return selected.map(x=>x.n);
}
function policyPublicFacts(id){
 const c=countries[id],geo=politicalGeography();
 return {id,name:c.displayName||id,ruler:c.ruler,government:c.government,gdp:c.gdp,armyEstimate:Math.round(c.army/10000)*10000,neighbors:[...(geo.neighbors[id]||[])],contracts:strategyState().contracts.filter(x=>x.status==='active'&&(x.a===id||x.b===id)).map(x=>({a:x.a,b:x.b,type:x.type})),warWith:policyLive().filter(n=>n!==id&&isAtWar(id,n))};
}
function policyBrief(value,max=400){return typeof value==='string'?value.slice(0,max):value;}
function policyContext(selected,results,phase){
 const all=policyLive(),actors=ensureWorldActors();
 const relevant=[...new Set([playerCountry,...selected,...selected.flatMap(n=>[...(politicalGeography().neighbors[n]||[])]),...selected.flatMap(n=>policyCabinet(n).goals.map(g=>g.target).filter(Boolean))])];
 const offer=o=>({id:o.id,a:o.a,b:o.b,type:o.type,terms:o.terms,status:o.status,day:o.day,expires:o.expires});
 return {date:dateLabel(),phase,player:playerCountry,
 cabinets:selected.map(id=>{const a=policyCabinet(id),interests=policyInterest(id);
 interests.implementation.lastSignals=(interests.implementation.lastSignals||[]).map(t=>policyBrief(t,250));
 return {id,actor:id+'::government',interests,
 goals:a.goals.map(g=>({...g,goal:policyBrief(g.goal,250),success:policyBrief(g.success,200)})),
 memory:a.memory.slice(-3).map(m=>({day:m.day,text:policyBrief(m.text,280)})),
 inbox:a.inbox.filter(i=>i.status==='open').slice(-6).map(i=>({id:i.id,source:i.source,kind:i.kind,text:policyBrief(i.text,320),day:i.day})),
 assessment:policyBrief(a.assessment,350)||null,lastOutcome:a.lastOutcome?{...a.lastOutcome,material:policyBrief(a.lastOutcome.material,300)}:null,
 issues:ensureNewsFlow().issues.filter(i=>i.status==='open'&&i.recipient===id).slice(-5).map(i=>({id:i.id,sender:i.sender,recipient:i.recipient,text:policyBrief(i.text,400),action:i.action,status:i.status,created:i.created,lastUpdate:i.lastUpdate})),
 offers:strategyState().offers.filter(o=>o.status==='open'&&o.b===id).slice(-5).map(offer),
 relationships:[...new Set([...selectPoliticalCountries(id,8),...relevant])].filter(n=>n!==id).map(n=>({id:n,value:getRelation(id,n)})).slice(0,16),
 actorMemory:actors[id+'::government']?.memory.slice(-2).map(m=>typeof m==='string'?policyBrief(m,300):{day:m.day,text:policyBrief(m.text,300)})};}),
 countries:relevant.map(policyPublicFacts),worldPowers:all.slice().sort((a,b)=>countries[b].gdp-countries[a].gdp).slice(0,8).map(policyPublicFacts),
 confirmedDecisions:results.slice(-12).map(o=>({text:policyBrief(o.text,500),status:o.status,outcome:policyBrief(o.reason,400)})),
 events:(worldState.periodEvents||[]).slice(-8).map(e=>({headline:e.headline,body:policyBrief(e.body,350),actors:e.actors})),
 locations:selected.flatMap(owner=>{const owned=scenarioProvinces.filter(x=>strategyOwner(x)===owner),border=owned.filter(x=>[...(strategyGeometry().graph[x.id]||[])].some(id=>strategyOwner(strategyProvince(id))!==owner));return [...new Map([...border,...owned].map(x=>[x.id,x])).values()].slice(0,12);}).map(x=>({id:x.id,name:x.name,owner:strategyOwner(x),neighbors:[...(strategyGeometry().graph[x.id]||[])].sort((a,b)=>(strategyOwner(strategyProvince(a))===strategyOwner(x))-(strategyOwner(strategyProvince(b))===strategyOwner(x))).slice(0,8).map(id=>({id,owner:strategyOwner(strategyProvince(id))}))}))};
}
function policyPrompt(selected,results,phase){
 return 'POLITICAL_CABINETS_V1\nТы играешь за самостоятельные правительства политической стратегии. Игрок не центр мира. Для КАЖДОГО кабинета выбери следующий собственный шаг по его интересам, ресурсам, обязательствам, памяти и ответам других. История задаёт старт, не предопределяет решения. Не действуй случайно и не делай всех одинаковыми.\n'+
 'Три устойчивых интереса: безопасность/суверенитет, благосостояние, сохранение управляемости режима. Их относительный вес и курс определяешь ты по положению страны. Держи до трёх конкретных целей. Продолжай старую цель, переходи к следующему шагу после ответа, или явно откажись от неё по причине изменения обстановки. Цель должна иметь наблюдаемый критерий успеха.\n'+
 'Сценарная agenda — исходные политические амбиции, не приказ повторять историю. Оцени их вместе с сегодняшним балансом сил и ограничениями. Профицит и низкая грамотность не делают образование единственным разумным шагом для всех. Для каждого кабинета сравни хотя бы две разные альтернативы: внутреннюю и региональную. Выбранная оценка должна объяснять, почему одна важнее сейчас. Нужны разные курсы из разных интересов, а не случайное разнообразие. Ищи собственную выгоду в событиях между третьими странами: посредничество, торговый доступ, гарантии, противовес, ограничения помощи, либо обоснованное невмешательство. Не заключай ненападение только ради новости. Если начатая программа идёт по плану, не перезапускай её; выбери другую нерешённую политическую цель или дождись конкретного результата.\n'+
 'ПОЛИТИЧЕСКАЯ ИНИЦИАТИВА. Сравни собственный региональный интерес из agenda/goals с внутренним хозяйственным улучшением. Техническое улучшение школ не заменяет борьбу за рынки, безопасность и самостоятельность. Региональная цель должна обращаться к конкретному кабинету с условиями или менять собственное военное/торговое положение. Дипломатия допускает инициативу без входящего письма. Не начинай новую комиссию, чтобы отложить выбор; если факты уже достаточны, выбери курс. Сторонний кризис даёт возможность торга, гарантий или защиты интереса, но не обязан вести к войне. Мотивы и последствия выбранной позиции сообщи конкретно. Предмет переговоров сохраняй в goal/task/result и не подменяй всё пактом о ненападении.\n'+
 'Оцени выгоду, цену, риск вмешательства, надёжность партнёров и поддержку внутри. Можно торговаться, искать противовес, заключать договоры, выдвигать требования, мобилизовать, менять свою внутреннюю политику, объявлять войну при обоснованном риске. Отвечай на предложения, но не соглашайся из вежливости. Отношения НЕ жёсткий порог союза: важны интересы и условия. Выжидание допустимо с причиной, условием пересмотра и сроком; оно не газетная новость. У каждой страны могут быть дела, не связанные с игроком. При изменении власти не нужно всем осуждать: реши, затронуты ли собственные интересы и нужен ли шаг.\n'+
 'Выбирай только собственное действие. Чужое согласие, результат войны и готовые ресурсы не объявляй своим текстом. Для материального действия нужны эффекты; код проверит ресурсы. Газетная body описывает выбранное действие, мотив и следующий открытый вопрос, 4–6 выразительных предложений, без ID, статусов, отчётных стрелок и выдуманных цитат. По существующему входящему предложению обязательно accept/reject или конкретное контрпредложение; wait допустим, если названа причина и срок. Не повторяй прежнее предупреждение без нового повода. implementation показывает начатые и выполненные поручения. После оценки и консультации переходи к конкретному решению, договору или материальной программе, либо объясни реальную причину ожидания; новую такую же оценку не начинай. Не превращай обычное государственное действие в вечную подготовку отчётов.\n'+
 'Верни JSON {cabinets:[{country:"точный ID",assessment:"оценка интересов, выгод и риска до 700 знаков",goals:[{id:"устойчивый короткий ID",goal:"конкретная цель",target:"ID либо null",priority:1..100,status:"active|achieved|abandoned",success:"наблюдаемый критерий"}],nextReviewDays:7..90,decision:{goal:"цель",action:"wait|pursue|negotiate|offer_alliance|offer_nonaggression|offer_peace|accept|reject_offer|warn|condemn|war|mobilize",target:"ID если нужен",amount:число если нужно,motive:"конкретная причина",headline:"газетный заголовок",body:"газетная статья",responds_to:"только существующий issues ID если отвечаешь на него",task:{}}}]}\n'+
 'ВХОДЯЩЕЕ УВЕДОМЛЕНИЕ не всегда предложение договора. Сообщения о принятии/отказе только подтверждают состояние; не принимай их повторно. Для accept/reject обязательно действующий offers/tradeOffers ID адресованный именно тебе; уже заключённое соглашение находится в obligations/agreements и не требует нового принятия. Обычный дипломатический запрос, посредничество, приглашение, подтверждение курса — action:pursue с организационным task БЕЗ kind/effects. demand/fulfill относятся только к реально существующему contract/claim, не к обычной переписке.\n'+
 'Не передавай task для обычного wait/warn/offer_alliance. Для pursue task ОБЯЗАТЕЛЬНО {goal,executor,days:0..3650,cost:0..месячный доход,result:"собственное действие",headline,body,target:"если есть",kind:"тип эффекта если нужен",effects:{}}. Организационное политическое действие может быть без kind/effects. Назначения: kind:power effects:{ruler_name,ruler_title,pm_name,pm_title,government,country_name,transition:"appoint|resign|succession|reform"}. Военные действия: kind:military effects:{military_order:{action:"deploy|move|invade|hold|retreat",unit_id:"ID",troops:для deploy,province:"ID",stance:"attack|defend"}}. deploy выделяет существующие солдаты; набор army_delta требует денег и подготовки. Дипломатия: kind:diplomacy effects:{diplomatic_action:{action:"offer|accept|reject|declare_war|break|demand|fulfill|refuse|integrate|release|tariff",target:"ID",offer_id:"при ответе",contract_id:"при требовании/разрыве",type:"alliance|nonaggression|peace|dependency",terms:{days,autonomy:0..1,tribute:0..0.3,militaryAid:boolean,offensive:boolean,access:boolean,payment,payer,subject,provinces:["ID"]},obligation:"militaryAid|tribute",amount,goal:{type:"territory|tribute|subjugation|defense",provinces:["ID"]}}}. Не добавляй неиспользуемые поля.\n'+
 "СОСТОЯВШИЙСЯ РЕЗУЛЬТАТ. implementation.records — завершённые шаги. После предметной договорённости примени конкретный trade/diplomatic/economic эффект либо организационное поручение с instructions о действующих правилах и измеримым result; закрой достигнутую цель и займись следующей. Нельзя бесконечно переписывать уже согласованный протокол. При споре назови несогласованное условие, уступку или предел; повтор прежней позиции без изменений — wait, не новая статья. Торговля не универсальная замена безопасности, борьбе за влияние и легитимность. Учитывай собственную agenda, кто выигрывает от status quo и кто меняет его. Не создавай конфликт ради разнообразия.\n"+
 'САМОСТОЯТЕЛЬНАЯ ПОЛИТИКА. alternatives.home и alternatives.region — конкретные факты для выбора курса. Назови одну текущую проблему или возможность, сравни её с альтернативой и выбери исполнимый шаг. Стабильная страна может добиваться влияния, рынков, реформ или военной безопасности; слабая защищать самостоятельность или добиваться условий у сильной. Это варианты, не обязательный сценарий. Не заполняй все кабинеты одинаковыми пактами. Ненападение имеет смысл только при конкретном риске и цене; отсутствие войны само по себе не новая цель. Текущие договоры и исходящие предложения приведены: не предлагай снова уже согласованный или ожидающий ответа пакт. Нерешённая проблема требует следующего содержательного шага. Программа меняет численные параметры только с effects; комиссия полезна только с конкретными полномочиями, не заменяет любую политику. После окончания подготовки предложи реальное решение. Если действий действительно не требуется, wait с конкретным условием пересмотра допустим. Не выдумывай активность ради газетного количества.\\n'+
 'КРИЗИСЫ. Война и войска у границы требуют оценить безопасность, обязательства, торговлю и изменение баланса сил. Реакция выбирается тобой: помощь по договору, мобилизация, перемещение сил, посредничество, новые условия, давление, вмешательство или обоснованный нейтралитет. Одной декларации обеспокоенности недостаточно для собственной политики, если риск остался. Отвечай на действия других NPC так же внимательно, как на игрока. Не откладывай важное предложение новым докладом без причины. При ответе используй конкретный responds_to и фактический offer_id. action wait не закрывает обращения; они сохраняются до реального ответа.\\n'+
 'МАТЕРИАЛЬНЫЕ РЕШЕНИЯ. pursue.task.kind:"economic",effects:{economic_policy:{type:"tax|spending|ownership|coordination|financing",group:"noble|burgher|commons|peasants|middle или education|welfare|infrastructure",target:число либо "market|regulated|planned",sector:"agriculture|industry|resources|services",days:1..3650,compensation:true|false,automaticBorrowing:true|false,monetaryFinancing:true|false}}; передавай только поля этого направления. Задача days:0 начинает постепенную программу, экономический срок задаёт economic_policy.days. Конкретное распоряжение, переговорная позиция, встреча и организация допустимы без выдуманных денег и побед. Отсутствие кнопки не причина отказа.\\n'+
 'Наблюдаемая обстановка: '+compactPoliticalJSON(policyContext(selected,results,phase));
}
function policyValidate(raw,selected){
 raw=JSON.parse(JSON.stringify(raw));
 if(Object.hasOwn(raw,'responds_to')){politicalAssert(raw.decision&&(raw.decision.responds_to==null||raw.decision.responds_to===raw.responds_to),'Противоречивая ссылка ответа');raw.decision.responds_to=raw.responds_to;delete raw.responds_to;}
 raw.country=orderCountry(raw.country);for(const g of raw.goals||[])if(g.target)g.target=orderCountry(g.target);
 politicalKeys(raw,['country','assessment','goals','nextReviewDays','decision']);
 politicalAssert(selected.includes(raw.country),'Кабинет вне выбранных участников');
 politicalText(raw.assessment,900);
 politicalAssert(Array.isArray(raw.goals)&&raw.goals.length<=12,'Допустим список целей');
 raw.goals=raw.goals.sort((a,b)=>(b.status==='active')-(a.status==='active')||b.priority-a.priority).slice(0,3);
 const goalIds=new Set();
 for(const g of raw.goals){politicalKeys(g,['id','goal','target','priority','status','success']);politicalText(g.id,60);politicalAssert(!goalIds.has(g.id),'Повтор цели');goalIds.add(g.id);politicalText(g.goal,400);politicalText(g.success,400);if(g.target!=null)strategyCountry(g.target);strategyNum(g.priority,1,100);politicalAssert(['active','achieved','abandoned'].includes(g.status),'Неверная стадия цели');}
 politicalAssert(Number.isInteger(raw.nextReviewDays)&&raw.nextReviewDays>=7&&raw.nextReviewDays<=90,'Неверный срок пересмотра');
 let d=JSON.parse(JSON.stringify(raw.decision));d.actor_id=raw.country+'::government';
 if(d.task&&Object.keys(d.task).length===0)delete d.task;
 d=canonicalPoliticalDecision(d);
 if(d.responds_to&&!ensureNewsFlow().issues.some(i=>i.id===d.responds_to&&i.recipient===raw.country&&i.status==='open')){
  const notice=policyCabinet(raw.country).inbox.find(i=>i.id===d.responds_to&&i.status==='open');
  if(notice)queueNewsIssue(notice.source,raw.country,notice.id,notice.text,notice.kind);
  else {policyState().audit.push({day:gameDayNumber(),country:raw.country,error:'Неверная ссылка на обращение убрана; само действие проходит проверку полномочий.'});delete d.responds_to;}
 }
 validatePoliticalDecision(d);return {...raw,decision:d};
}
function policyApply(raw,selected,results){
 const packet=policyValidate(raw,selected),id=packet.country;
 let a=policyCabinet(id),actor=ensureWorldActors()[id+'::government'];
 // A cabinet can act once per dated round, not once per entire year skip.
 const roundKey=turn+':'+policyState().round;
 if(a.lastRound===roundKey)return false;
 const previous=actor.lastPoliticalTurn,eventStart=(worldState.periodEvents||[]).length;
 const snapshot=captureOrderExecution();
 actor.lastPoliticalTurn=null;
 let ok;try{ok=executePoliticalDecision(packet.decision,results);}catch(error){restoreOrderExecution(snapshot);throw error;}
 if(!ok){restoreOrderExecution(snapshot);a=policyCabinet(id);actor=ensureWorldActors()[id+'::government'];actor.lastPoliticalTurn=previous;}
 a.assessment=packet.assessment;a.goals=packet.goals;a.reviewDay=gameDayNumber()+(ok?packet.nextReviewDays:7);a.lastReviewDay=gameDayNumber();a.lastRound=roundKey;
 const material=ensurePolitics().decisions.findLast(d=>d.country===id&&d.turn===turn)?.material||'Исполнитель не подтвердил применение выбранного шага';
 a.lastSignals=(a.inbox||[]).filter(i=>i.status==='open').map(i=>i.text).slice(-3);
 a.lastOutcome={day:gameDayNumber(),action:packet.decision.action,applied:!!ok,material:ok?material:'Шаг не выполнен: проверь доступные ресурсы, действующие предложения и прежние действия.'};
 policyRemember(id,packet.assessment+' Следующий шаг: '+packet.decision.action+'. '+a.lastOutcome.material);
 if(ok){
  // One political decision yields one readable story, with mechanical events in details.
  const articles=(worldState.periodEvents||[]).slice(eventStart).filter(e=>e.section==='foreign');
  if(packet.decision.action!=='wait'&&articles.length&&packet.decision.body){
   const primary=articles.at(-1);primary.headline=packet.decision.headline;primary.body=packet.decision.body;
   primary.details=articles.map(e=>e.details||'').filter(Boolean).join('\n');primary.storyId=articles.find(e=>e.sourceTask)?.sourceTask||id+':'+turn+':'+policyState().round;primary.policyRound=policyState().round;primary.decisionActor=id+'::government';primary.policyAction=packet.decision.action;primary.policyTarget=packet.decision.target||packet.decision.task?.target||packet.decision.task?.effects?.diplomatic_action?.target||packet.decision.task?.effects?.trade_policy?.target||null;primary.policyKind=packet.decision.task?.kind||null;primary.policyGoal=packet.decision.goal;
   const redundant=new Set(articles.slice(0,-1));worldState.periodEvents=worldState.periodEvents.filter(e=>!redundant.has(e));
  }
  if(packet.decision.action==='wait'){
   a.considered||={};
   const pending=policyPending(id);
   for(const i of [...pending.inbox,...pending.issues.slice(-5),...pending.offers.slice(-5)])a.considered[i.id]={revision:i.lastUpdate??i.created??i.day,due:a.reviewDay};
   const open=new Set([...a.inbox,...ensureNewsFlow().issues.filter(i=>i.recipient===id),...strategyState().offers.filter(i=>i.b===id),...(typeof maritimeState==='function'?maritimeState().tradeOffers||[]:[]).filter(i=>i.b===id)].filter(i=>i.status==='open').map(i=>i.id));
   a.considered=Object.fromEntries(Object.entries(a.considered).filter(([id])=>open.has(id)));
  }
  const answered=packet.decision.responds_to;
  const target=packet.decision.target||packet.decision.task?.target||packet.decision.task?.effects?.diplomatic_action?.target;
  a.inbox.filter(i=>i.status==='open'&&(i.id===answered||!answered&&i.source===target&&packet.decision.action!=='wait')).forEach(i=>{i.status='reviewed';});
  if(target&&packet.decision.action!=='wait')policyNotice(id,target,packet.decision.body||packet.decision.motive,packet.decision.action);
 }
 return ok;
}
function policyPrepareBatch(selected,results,phase){
 selected=selected.slice();let prompt=policyPrompt(selected,results,phase);
 while(selected.length>1&&JSON.stringify([{role:'user',content:prompt}]).length>100000){
  selected=selected.slice(0,-1);prompt=policyPrompt(selected,results,phase);
 }
 return {selected,prompt};
}
async function policyBatch(selected,results,phase){
 if(!selected.length)return [];
 const p=policyState();if(p.calls.turn!==turn)p.calls={turn,used:0};
 const ceiling=worldState.plannedPeriod&&/год|Год|лет|6 месяц/.test(worldState.plannedPeriod)?8:2;
 if(p.calls.used>=ceiling)return [];
 const batch=policyPrepareBatch(selected,results,phase);selected=batch.selected;const prepared=batch.prompt;
 p.calls.used++;const acted=[];
 try{
  const raw=await askGemini(prepared,10000,0,{response_format:{type:'json_object'},reasoning_effort:'low'});
  const data=parseOrderReply(raw);politicalAssert(Array.isArray(data.cabinets)&&data.cabinets.length<=selected.length,'Неверный список кабинетов');
  const seen=new Set(),invalid=[];
  for(const item of data.cabinets){try{politicalAssert(!seen.has(item.country),'Повтор кабинета');seen.add(item.country);if(policyApply(item,selected,results))acted.push(item.country);}catch(error){invalid.push({country:item.country,error:String(error.message).slice(0,400),reply:item});}}
  if(invalid.length){
   try{
    const repair=parseOrderReply(await askGemini(prepared+"\nВОССТАНОВЛЕНИЕ ФОРМАТА. Только неисполненные кабинеты ниже. Сохрани собственные цели и намерения, исправь ошибки по схеме. Уважай реального адресата предложения, текущие войны и уже заключённые договоры. Чужое согласие не придумывай. Если война уже окончилась, продолжение обсуждения — communicate, не новое принятие мира. Верни {cabinets:[...]}.\nОшибки: "+JSON.stringify(invalid),9000,0,{response_format:{type:'json_object'},reasoning_effort:'low'}));
    politicalAssert(Array.isArray(repair.cabinets),'Нет исправлений кабинетов');
    for(const failure of invalid){
     try{
      const candidates=repair.cabinets.filter(c=>c.country===failure.country);politicalAssert(candidates.length===1,'Нет однозначного исправления кабинета');
      if(policyApply(candidates[0],[failure.country],results)){acted.push(failure.country);failure.repaired=true;}
     }catch(error){failure.repairError=String(error.message).slice(0,400);}
    }
   }catch(error){for(const failure of invalid)failure.repairError=String(error.message).slice(0,400);}
   for(const {reply,...failure}of invalid)policyState().audit.push({day:gameDayNumber(),...failure});
  }
  for(const id of selected.filter(n=>!seen.has(n)))policyState().audit.push({day:gameDayNumber(),country:id,error:'Кабинет не получил решение; повторная оценка на следующем периоде.'});
 }catch(error){p.audit.push({day:gameDayNumber(),phase,error:String(error.message).slice(0,400)});showNotif('Оценка иностранных кабинетов не получена. Действия не выдуманы; время продолжится.');}
 policyState().audit=policyState().audit.slice(-30);return acted;
}
async function runPoliticalRound(results=[],opts={}){
 if(activeScenario.rules?.autonomousWorld===false)return;
 const p=policyState();policyScanWorld();p.round++;
 const originalSignals=new Map(policyLive().map(n=>[n,new Set(policyCabinet(n).inbox.filter(i=>i.status==='open').map(i=>i.id))]));
 const selected=policySelect(6);
 await policyBatch(selected,results,opts.phase||'opening');
 // Recipients not yet reviewed respond to committed initiatives. No recursive loop.
 policyScanWorld();
 const eligible=policySelect(policyLive().length,true).filter(n=>!selected.includes(n)||policyCabinet(n).inbox.some(i=>i.status==='open'&&!originalSignals.get(n)?.has(i.id)));
 const recipients=eligible.slice(0,3);if(recipients.length)policyState().round++;
 await policyBatch(recipients,[], 'response');
}
window.politicalRunRound=runPoliticalRound;
const policyOldReset=resetGame;
resetGame=function(...args){const result=policyOldReset(...args);policyState().observed=policySnapshot();return result;};
const policyOldAsk=askGemini;
askGemini=async function(prompt,...args){
 if(typeof prompt==='string'&&prompt.includes('Свободные приказы:'))prompt+='\nРАЗДЕЛЕНИЕ ПОЛНОМОЧИЙ. Здесь только исполнение приказов игрока и решения его внутренних участников. Иностранные government НЕ включай в politics: они принимают решения отдельным политическим раундом ПОСЛЕ исполнения. Не сочиняй зарубежные реакции. В politics оставляй только внутренние группы; пустой массив допустим.';
 return policyOldAsk(prompt,...args);
};
