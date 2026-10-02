/* Isolated experiment: typed orders, authoritative receipts, and atomic turns. */
'use strict';
const ORDER_STATUS={prepared:'Подготовлен',executed:'Исполнен',blocked:'Заблокирован',failed:'Сорван',rejected:'Отклонён',deferred:'Отложен'};
function ensureOrders(){
 const migrate=!Array.isArray(worldState.orders);
 if(migrate)worldState.orders=[];
 if(migrate&&playerActions.length){
  playerActions.slice(0,8).forEach(text=>worldState.orders.push({id:crypto.randomUUID(),text,status:'prepared',createdTurn:turn}));
 }
 const pending=worldState.orders.filter(o=>['prepared','deferred'].includes(o.status));
 playerActions=pending.map(o=>o.text);
 return pending;
}
function orderCountry(name){return normalizeCountryName(name);}
function orderContext(){
 return {player:playerCountry,countries,objects:JSON.parse(JSON.stringify(worldState.mapObjects||[])),
  lawSlots:LAW_SLOTS,lawOption,governments:activeScenario.rules?.governments||null,relation:getRelation,atWar:isAtWar,location:resolveLocationLonLat,
  provinceOwner:key=>{const p=scenarioProvinces.find(p=>p.id===key||p.name===key);return p?(provinceOwners[p.id]||p.owner):null;}};
}
function canonicalEffects(e){
 const copy=JSON.parse(JSON.stringify(e));
 ['relations','other_countries'].forEach(k=>{if(copy[k]&&typeof copy[k]==='object'&&!Array.isArray(copy[k]))copy[k]=Object.fromEntries(Object.entries(copy[k]).map(([n,v])=>[orderCountry(n),v]));});
 ['war_declared','peace_made'].forEach(k=>{if(Array.isArray(copy[k]))copy[k]=copy[k].map(orderCountry);});
 ['relations_between','wars_between','battles','treaties'].forEach(k=>{if(Array.isArray(copy[k]))copy[k].forEach(o=>{if(o&&typeof o==='object'){if(o.a)o.a=orderCountry(o.a);if(o.b)o.b=orderCountry(o.b);}});});
 ['foreign_leader_change','province_transfer','map_objects'].forEach(k=>{if(Array.isArray(copy[k]))copy[k].forEach(o=>{if(o&&typeof o==='object'){['country','new_owner','owner'].forEach(f=>{if(o[f])o[f]=orderCountry(o[f]);});}});});
 if(copy.country_color?.country)copy.country_color.country=orderCountry(copy.country_color.country);
 return copy;
}
function orderBudgetPreview(){
 const c=countries[playerCountry];if(!c?.economy||!c.society)return null;
 const gross=econMonthlyRevenue(c).gross,m=lawMods(c),era=getEra();
 const war=(worldState.atWarWith||[]).length>0;
 const upkeep=Math.round(c.army*era.armyUpkeep*(war?1.35:1));
 const admin=Math.round(gross*.08/m.adminEff);
 const court=Math.round(gross*(/монарх|импер|королев|царств/i.test(c.government||'')?.04:.02));
 const church=c.church?.exists&&c.church.influence>50?Math.round(gross*.02):0;
 const premium=Math.max(0,(70-(c.reputation??70))+(50-c.stability))/12000;
 const interest=Math.round((c.debtDomestic||0)*.004+(c.debtForeign||0)*(.006+premium));
 const social=societySpendingTotal(c)+(c.society.spending.infrastructure||0);
 return {gross,net:gross-upkeep-admin-court-church-interest-social,upkeep,interest};
}
function queueOrder(text,kind,fixedEffects){
 if(turnRunning){showNotif('Дождитесь завершения хода');return;}
 text=String(text||'').trim();if(!text)return;
 if(text.length>1200){showNotif('Сократите приказ до 1200 символов');return;}
 if(OrderRules.INVALID_FICTION.test(text)){showNotif('Вы управляете главой государства в историческом мире. Фантастика недоступна.');return;}
 const pending=ensureOrders();if(pending.length>=8){showNotif('На один ход можно подготовить до 8 приказов');return;}
 worldState.orders.push({id:crypto.randomUUID(),text,status:'prepared',createdTurn:turn,...(fixedEffects?{kind,fixedEffects}: {})});
 ensureOrders();saveGame();renderActionsList();
}
addAction=function(){
 const input=document.getElementById('action-input');queueOrder(input.value);input.value='';
};
removeAction=function(index){
 if(turnRunning)return;
 const pending=ensureOrders(),order=pending[index];if(!order)return;
 worldState.orders=worldState.orders.filter(o=>o.id!==order.id);playerActions=worldState.orders.filter(o=>['prepared','deferred'].includes(o.status)).map(o=>o.text);
 saveGame();renderActionsList();
};
window.queueOrderCard=function(card){
 const c=countries[playerCountry];if(!c?.economy)return;
 if(card==='tax'){
  const rate=Math.min(45,c.economy.classes.commons.tax+2);
  queueOrder('Повысить налог рабочих и крестьян до '+rate+'%.','tax',{economy:{tax_commons:rate}});
 }else if(card==='education'){
  const amount=Math.min(Math.round(c.income*.25),(c.society.spending.education||0)+5);
  queueOrder('Установить расходы на образование '+amount+' расчётных единиц в месяц.','spending',{society:{education_spending:amount}});
 }else if(card==='dissolve'){
  if(!c.parliament){showNotif('В стране сейчас нет парламента');return;}
  queueOrder('Попытаться распустить парламент (шанс при текущих условиях '+Math.round(OrderRules.powerChance(c)*100)+'%).','power',{parliament:{dissolve:true}});
 }
};
renderActionsList=function(){
 const pending=ensureOrders(),box=document.getElementById('actions-list');if(!box)return;
 box.replaceChildren();const b=orderBudgetPreview();
 const summary=document.createElement('div');summary.className='order-summary';
 summary.textContent=b?'Прогноз месяца: доход '+b.gross.toLocaleString('ru')+', баланс '+(b.net>=0?'+':'')+b.net.toLocaleString('ru')+'. '+(b.net<0?'Нужно уменьшить дефицит.':'Можно направить избыток на развитие.')+' Прогноз при текущих показателях; рост и события могут изменить итог.':'Подготовьте решения на следующий месяц.';
 box.appendChild(summary);
 const cards=document.createElement('div');cards.className='order-cards';
 [['tax','Налог населению +2 п.п.'],['education','Образование +5 / месяц'],['dissolve','Попытка роспуска парламента']].forEach(([id,label])=>{
  const button=document.createElement('button');button.textContent=label;button.disabled=turnRunning;button.onclick=()=>queueOrderCard(id);cards.appendChild(button);
 });box.appendChild(cards);
 if(!pending.length){const empty=document.createElement('p');empty.textContent='Нет подготовленных приказов. Выберите карточку или напишите свой приказ.';box.appendChild(empty);}
 pending.forEach((o,index)=>{
  const row=document.createElement('div');row.className='action-item order-card';
  const content=document.createElement('div'),label=document.createElement('strong'),status=document.createElement('small');
  label.textContent=o.text;status.textContent=ORDER_STATUS[o.status]+(o.reason?' · '+o.reason:'')+(o.fixedEffects?' · готовое решение':' · проверка перед исполнением');
  content.append(label,status);const remove=document.createElement('button');remove.className='rm-btn';remove.textContent='✕';remove.disabled=turnRunning;remove.onclick=()=>removeAction(index);
  row.append(content,remove);box.appendChild(row);
 });
 const recent=worldState.orders.filter(o=>!['prepared','deferred'].includes(o.status)).slice(-5).reverse();
 if(recent.length){
  const title=document.createElement('p');title.textContent='Последние результаты';box.appendChild(title);
  recent.forEach(o=>{const row=document.createElement('div');row.className='order-result';row.textContent=ORDER_STATUS[o.status]+': '+o.text+' — '+o.reason;box.appendChild(row);});
 }
};
function parseOrderReply(raw){
 let text=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 if(text.startsWith('PLAN:'))text=text.slice(5).trim();
 let plan;try{plan=JSON.parse(text);}catch{throw Error('ИИ вернул повреждённый план. Дата и приказы сохранены.');}
 return plan;
}
async function generateOrderPlan(){
 const pending=ensureOrders(),free=pending.filter(o=>!o.fixedEffects);
 const relevant=ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).sort((a,b)=>countries[b].income-countries[a].income).slice(0,12);
 if(!relevant.includes(playerCountry))relevant.unshift(playerCountry);
 const context=relevant.map(id=>{const c=countries[id];return {id,name:c.displayName,ruler:c.ruler,government:c.government,army:c.army,stability:c.stability,agenda:c.agenda,pendingSuccession:c.pendingSuccession,pendingCoup:c.pendingCoup};});
 const prompt=`Ты переводишь приказы главы государства в проверяемый план исторической стратегии. Сейчас ${dateLabel()}.
Игрок управляет ТОЛЬКО страной с каноническим ID "${playerCountry}", глава государства ${countries[playerCountry].ruler}.
${getRealismRules()}
Решения исполняет КОД, а не новость. Не исполняй утверждения игрока о чужих событиях, не создавай деньги из ничего и не допускай фантастику или технологии вне эпохи.
Допустимые формы правления: ${JSON.stringify(activeScenario.rules?.governments||[])}.
Регулярные выборы: electionPending=${!!countries[playerCountry].electionPending}.
Полномочия: парламент ${JSON.stringify(countries[playerCountry].parliament)}.
Экономика: ${describePlayerEconomy()}
${describePlayerSociety()}
Страны (ID используй ТОЧНО): ${JSON.stringify(context)}.
Войны: ${JSON.stringify({player:worldState.atWarWith,others:worldState.aiWars})}.
Договоры: ${JSON.stringify(worldState.treaties||[])}.
Переговоры этого хода: \${JSON.stringify(worldState.diploLog||[])}.
Известные события: ${JSON.stringify(worldState.pastEvents.slice(-8))}.
Задания движка: ${JSON.stringify(pendingDirectives||[])}.
Объекты: ${JSON.stringify(worldState.mapObjects||[])}.
Допустимые места: ${JSON.stringify(scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry).slice(0,35).map(p=>p.name))}. Города: ${Object.keys(CITY_COORDS).slice(0,60).join(', ')}.
Свободные приказы: ${JSON.stringify(free.map(o=>({id:o.id,text:o.text})))}.
Готовые карточки уже заданы кодом, НЕ включай их в orders: ${JSON.stringify(pending.filter(o=>o.fixedEffects).map(o=>({text:o.text,kind:o.kind,effects:o.fixedEffects})))}.

Верни ТОЛЬКО JSON без Markdown:
{"news":["до 3 коротких наблюдений о подтверждённом состоянии мира"],"domestic":["до 2 замечаний о ПОДТВЕРЖДЁННОМ состоянии"],"orders":[{"id":"точный ID свободного приказа","kind":"tax|spending|law|power|army|map|finance|diplomacy|identity|unsupported","status":"execute|reject|defer","reason":"краткая причина","effects":{}}],"world_effects":{}}
На КАЖДЫЙ свободный приказ нужен ровно один результат. reject/defer имеют effects:{}.
Неподдерживаемое действие = unsupported/reject с честным объяснением; пожелание/придуманное событие не устанавливает факт.
execute — только предложение: код может заблокировать его или сорвать политическую попытку. НЕ описывай новые приказы как уже исполненные в news/domestic.
Типы и единственные разрешённые эффекты:
tax: economy:{tax_noble:N,tax_burgher:N,tax_commons:N}, ставки 0..45.
spending: society:{education_spending:N,welfare_spending:N,infrastructure_spending:N}, каждый 0..${Math.round(countries[playerCountry].income*.25)}.
law: law_slots:{слот:id}; laws допустим только вместе с поддерживаемой системной реформой, иначе defer. laws:[{action:"enact|repeal",name:"...",description:"..."}], institutions:{church:"abolish|restore"}. Известные слоты: ${econLawSpecForPrompt()}.
power: government/ruler_name/ruler_age/ruler_title/pm_name/pm_title; parliament:{dissolve:true|restore:true|ban_party:"имя"}. Роспуск/диктатура — политическая ПОПЫТКА, исход определит код. Для диктатуры с действующим парламентом укажи dissolve:true. Нельзя присвоить поддержку парламента.
army: army_delta — набор/демобилизация, стоимость посчитает код, либо map_objects.
map: map_objects:[{action:"create",id:"unique_id",type:"army|hq|naval|diplomat|other",owner:"${playerCountry}",label:"...",troops:N,location:"..."}] или {action:"update",id:"...",troops:N}, {action:"move",id:"...",to:"..."}, {action:"remove",id:"..."}. Армия распределяется из наличных сил.
finance: debt_delta — заём/погашение, код двигает и долг, и казну.
diplomacy: relations:{ID:дельта -40..20}; treaties:[{action:"sign|break",type:"alliance|nonaggression",a:"ID",b:"ID"}]; war_declared:["ID"], peace_made:["ID"]; province_transfer:[{province:"...",new_owner:"ID"}] — только уступка своей провинции.
identity: country_name или country_color:{country:"${playerCountry}",color:"#RRGGBB"}.

world_effects может быть пустым. Допустимы только ограниченные самостоятельные изменения:
stability_delta (-10..10), relations, relations_between:[{a,b,delta}], other_countries:{ID:{stability_delta:N}},
wars_between:[{a,b,status:"start|end"}], battles:[{a,b,scale:"skirmish|battle|decisive",location:"..."}] ТОЛЬКО в УЖЕ ИДУЩЕЙ войне,
war_declared (чужая страна объявляет войну игроку; мир за игрока не подписывай), foreign_leader_change:[{country,ruler_name,ruler_age,ruler_title,government,pm_name,pm_title}] ТОЛЬКО при pendingSuccession/pendingCoup этой страны.
Свои ruler_name/ruler_age/ruler_title/government/pm_name/pm_title в world_effects — ТОЛЬКО если код отметил pendingSuccession/pendingCoup. Никаких налогов, законов, произвольных сумм или бесплатных армий в world_effects.
parliament:{support_delta:-10..10,factions:[{name,pct}]} в world_effects: factions только если electionPending; иначе не включай.
В news/domestic не объявляй новые конституции, законы, смерти или договоры, если они не подтверждены состоянием движка. Не пересказывай обязательную историческую хронологию как уже случившуюся альтернативную историю.
Пиши кратко, не заполняй нулевые поля. Суммы — расчётные единицы движка, не независимая историческая статистика.`;
 const raw=await askGemini(prompt,4000);
 const plan=parseOrderReply(raw);
 if(!Array.isArray(plan.orders))throw Error('ИИ не вернул результаты приказов');
 plan.orders=plan.orders.map(o=>({...o,effects:canonicalEffects(o.effects)}));
 plan.world_effects=canonicalEffects(plan.world_effects);
 if(plan.orders.length!==free.length||new Set(plan.orders.map(o=>o.id)).size!==free.length||plan.orders.some(o=>!free.some(p=>p.id===o.id)))throw Error('ИИ вернул лишний или повторный приказ');
 const byId=new Map(plan.orders.map(o=>[o.id,o]));
 // Preserve the submitted order: a later instruction cannot silently jump ahead.
 plan.orders=pending.map(o=>o.fixedEffects?{id:o.id,kind:o.kind,status:'execute',reason:'Готовое решение игрока.',effects:o.fixedEffects}:byId.get(o.id));
 if(plan.orders.some(o=>!o))throw Error('ИИ пропустил приказ');
 const checked=OrderRules.validatePlan(plan,pending,orderContext());
 pendingDirectives=[];
 return checked;
}
function orderStatSnapshot(c){
 return {treasury:c.treasury,debt:c.debt,army:c.army,stability:c.stability,government:c.government,ruler:c.ruler,pm:c.pm,
  taxes:JSON.stringify(c.economy?.classes&&Object.fromEntries(Object.entries(c.economy.classes).map(([k,v])=>[k,v.tax]))),
  spending:JSON.stringify(c.society?.spending),laws:JSON.stringify(c.lawSlots)};
}
function reconcileOrderArmies(){
 ALL_COUNTRIES.forEach(owner=>{
  const objects=(worldState.mapObjects||[]).filter(o=>o.owner===owner&&o.type==='army');
  const total=objects.reduce((n,o)=>n+o.troops,0),cap=Math.max(0,countries[owner]?.army||0);
  if(total>cap){let remaining=cap;objects.forEach((o,i)=>{o.troops=i===objects.length-1?remaining:Math.min(remaining,Math.floor(o.troops*cap/total));remaining-=o.troops;});}
 });
 worldState.mapObjects=(worldState.mapObjects||[]).filter(o=>o.type!=='army'||o.troops>0);
}
function executeOrderEffects(e){
 const copy=JSON.parse(JSON.stringify(e)),c=countries[playerCountry];
 if(copy.war_declared){copy.war_declared.forEach(n=>{if(!isAtWar(playerCountry,n))declareEngineWar(playerCountry,n);});delete copy.war_declared;}
 if(copy.debt_delta!=null){
  const delta=copy.debt_delta;
  if(delta>0){changeCountryStat(playerCountry,'debt',delta);changeCountryStat(playerCountry,'treasury',delta);}
  else {const repay=Math.min(-delta,c.debt);if(c.treasury<repay)throw Error('Для погашения долга недостаточно казны');changeCountryStat(playerCountry,'treasury',-repay);changeCountryStat(playerCountry,'debt',-repay);}
  delete copy.debt_delta;
 }
 if(copy.army_delta!=null){
  const delta=copy.army_delta;
  if(delta>0){
   const cost=Math.ceil(delta*.002),cap=Math.round(c.population*1000*getEra().armyMaxShare);
   if(c.treasury<cost)throw Error('Недостаточно средств для набора армии');
   if(c.army+delta>cap)throw Error('Набор превышает предел армии по населению');
   changeCountryStat(playerCountry,'treasury',-cost);
  }
  changeCountryStat(playerCountry,'army',delta);delete copy.army_delta;reconcileOrderArmies();
 }
 parseAndApplyEffects('EFFECTS:'+JSON.stringify(copy),[]);
 reconcileOrderArmies();
}
function executedOrderDescription(e){
 const c=countries[playerCountry],parts=[];
 if(e.economy){const ids={tax_noble:'noble',tax_burgher:'burgher',tax_commons:'commons'};
  Object.keys(e.economy).forEach(k=>parts.push(c.economy.classes[ids[k]].label+': налог '+c.economy.classes[ids[k]].tax+'%'));}
 if(e.society){const labels={education_spending:['education','образование'],welfare_spending:['welfare','помощь населению'],infrastructure_spending:['infrastructure','инфраструктура']};
  Object.keys(e.society).forEach(k=>{const [id,label]=labels[k];parts.push(label+': '+c.society.spending[id]+' / месяц');});}
 if(e.law_slots)parts.push('Системная реформа применена');
 if(e.laws)parts.push('Закон зарегистрирован вместе с системным эффектом');
 if(e.institutions)parts.push('Изменён статус государственной церкви');
 if(e.government)parts.push('Форма правления: '+c.government);
 if(e.ruler_name)parts.push('Глава государства: '+c.ruler);
 if(e.pm_name)parts.push('Глава правительства: '+c.pm);
 if(e.parliament?.dissolve)parts.push('Парламент распущен; сопротивление учтено кодом');
 if(e.parliament?.restore)parts.push('Парламент созван');
 if(e.parliament?.ban_party)parts.push('Партия запрещена');
 if(e.army_delta!=null)parts.push(e.army_delta>0?'Набрано '+e.army_delta+' солдат; разовая цена '+Math.ceil(e.army_delta*.002):'Армия сокращена на '+(-e.army_delta)+' солдат');
 if(e.map_objects)parts.push('Изменения объектов на карте применены');
 if(e.debt_delta!=null)parts.push(e.debt_delta>0?'Заём '+e.debt_delta+' получен; долг и казна увеличены':'Долг погашен на '+(-e.debt_delta));
 if(e.war_declared)parts.push('Война объявлена; обязательства по договорам учтены');
 if(e.peace_made)parts.push('Война завершена');
 if(e.treaties)parts.push('Договор обновлён');
 if(e.relations)parts.push('Отношения обновлены');
 if(e.province_transfer)parts.push('Провинции переданы');
 if(e.country_name)parts.push('Название страны: '+c.displayName);
 if(e.country_color)parts.push('Цвет страны обновлён');
 return parts.length?parts.join('; ')+'.':'Проверенные изменения применены кодом.';
}
function applyOrderPlan(plan){
 const results=[];
 plan.orders.forEach(proposal=>{
  const order=worldState.orders.find(o=>o.id===proposal.id);if(!order)throw Error('Приказ потерян');
  const c=countries[playerCountry],before=orderStatSnapshot(c),verdict=OrderRules.authority(proposal,c);
  if(verdict.status==='executed'){
   // Known resource failures reject this order; malformed state still aborts the whole turn.
   const e=proposal.effects;
   let resourceError='';
   if(e.parliament?.dissolve&&!c.parliament)resourceError='В стране уже нет парламента.';
   if(e.parliament?.restore&&c.parliament)resourceError='Парламент уже существует.';
   if(e.parliament?.ban_party&&!c.parliament?.factions?.some(f=>f.name===e.parliament.ban_party))resourceError='Указанная партия не найдена в парламенте.';
   if(e.debt_delta>0&&c.debt+e.debt_delta>c.income*36)resourceError='Общий долг превышает предел добровольного заимствования (36 месячных доходов).';
   if(e.debt_delta<0&&c.treasury<Math.min(-e.debt_delta,c.debt))resourceError='Недостаточно казны для погашения долга.';
   if(e.army_delta>0&&(c.treasury<Math.ceil(e.army_delta*.002)||c.army+e.army_delta>Math.round(c.population*1000*getEra().armyMaxShare)))resourceError='Недостаточно средств или населения для набора армии.';
   if(resourceError){verdict.status='blocked';verdict.reason=resourceError;}
   else if(e.laws?.length&&!e.law_slots&&!e.institutions){verdict.status='deferred';verdict.reason='Для этого закона не определён системный эффект. Уточните реформу; простая запись названия не считается исполнением.';}
   else executeOrderEffects(e);
  }
  if(verdict.penalty)changeCountryStat(playerCountry,'stability',-verdict.penalty);
  order.status=verdict.status;order.reason=verdict.status==='executed'?executedOrderDescription(proposal.effects):verdict.reason;order.resolvedTurn=turn;order.before=before;order.after=orderStatSnapshot(c);
  if(verdict.chance!=null)order.chance=verdict.chance;
  results.push(order);
 });
 // Autonomous changes use the same parser only after complete schema validation.
 const autonomous=JSON.parse(JSON.stringify(plan.world_effects));
 if(autonomous.war_declared){autonomous.war_declared.forEach(n=>{if(!isAtWar(playerCountry,n))declareEngineWar(n,playerCountry);});delete autonomous.war_declared;}
 if(autonomous.wars_between){autonomous.wars_between.forEach(w=>{if(w.status==='start'&&!isAtWar(w.a,w.b))declareEngineWar(w.a,w.b);});autonomous.wars_between=autonomous.wars_between.filter(w=>w.status!=='start');}
 parseAndApplyEffects('EFFECTS:'+JSON.stringify(autonomous),[]);
 reconcileOrderArmies();
 if(plan.world_effects.parliament?.factions)countries[playerCountry].electionPending=false;
 ensureOrders();
 worldState.orders=worldState.orders.filter(o=>['prepared','deferred'].includes(o.status)||o.resolvedTurn>=turn-20);
 return results;
}
function renderOrderReceipts(results,econChanges){
 const changes=(econChanges||[]).slice();
 results.forEach(o=>{
  const diff=[];const labels={treasury:'казна',debt:'долг',army:'армия',stability:'стабильность'};
  Object.entries(labels).forEach(([k,label])=>{const d=o.after[k]-o.before[k];if(d)diff.push(label+' '+(d>0?'+':'')+d);});
  if(o.before.taxes!==o.after.taxes)diff.push('налоговые ставки изменены');
  if(o.before.spending!==o.after.spending)diff.push('расходы изменены');
  if(o.before.laws!==o.after.laws)diff.push('системная реформа применена');
  ['government','ruler','pm'].forEach(k=>{if(o.before[k]!==o.after[k])diff.push(o.before[k]+' → '+o.after[k]);});
  changes.push({label:ORDER_STATUS[o.status]+': '+o.text,value:o.reason+(diff.length?' · '+diff.join('; '):''),sign:o.status==='executed'?1:o.status==='deferred'?0:-1});
 });
 renderTurnChanges(changes);
 const list=document.getElementById('domestic-list');if(list){
  list.replaceChildren();
  results.forEach(o=>{const div=document.createElement('div');div.className='ev-item';div.textContent=ORDER_STATUS[o.status]+': '+o.text+' — '+o.reason;list.appendChild(div);});
 }
}
onTurnEnd=async function(){
 const eventsBox=document.getElementById('events-box'),list=document.getElementById('events-list');
 eventsBox.style.display='block';list.textContent='Проверяем приказы и готовим сводку…';
 const plan=await generateOrderPlan(),results=applyOrderPlan(plan);
 list.replaceChildren();
 plan.news.concat(plan.domestic).forEach(text=>{const div=document.createElement('div');div.className='ev-item';div.textContent=text;list.appendChild(div);worldState.pastEvents.push(text);});
 results.forEach(o=>worldState.pastEvents.push('Приказ '+o.id+': '+ORDER_STATUS[o.status]+' — '+o.text+'. '+o.reason));
 worldState.pastEvents=worldState.pastEvents.slice(-120);
 worldState.diploLog=[];renderActionsList();
 return results;
};
// Preserve the country across every ruler's death, abdication, and regime change.
const originalResetForOrders=resetGame;
resetGame=function(...args){originalResetForOrders(...args);worldState.orders=[];renderActionsList();};
const originalLoadForOrders=loadGameSlot;
loadGameSlot=async function(...args){const result=await originalLoadForOrders(...args);ensureOrders();renderActionsList();return result;};
window.addEventListener('gs:scenario-status',()=>{
 if(gameStarted)return;
 const picker=document.getElementById('mobile-country-picker');
 if(picker&&activeScenario?.rules?.defaultPlayer)picker.value=activeScenario.rules.defaultPlayer;
});

window.ordersCanStartTurn=()=>typeof diplomacyPending==='undefined'||diplomacyPending.size===0;
function applyCheckedDiplomacy(raw,targetCountry){
 const block=extractBalancedJson(raw,'DIPLO_EFFECTS:');
 if(!block)throw Error('Ответ страны не содержит проверяемого дипломатического результата.');
 let effects;try{effects=JSON.parse(block);}catch{throw Error('Некорректный дипломатический результат');}
 if(!effects||typeof effects!=='object'||Array.isArray(effects))throw Error('Некорректный дипломатический результат');
 if(Object.keys(effects).some(k=>!['relations_delta','war_start','treaty'].includes(k)))throw Error('Дипломатия не может менять внутреннее устройство страны');
 if(effects.relations_delta!=null&&(typeof effects.relations_delta!=='number'||!Number.isFinite(effects.relations_delta)||effects.relations_delta< -40||effects.relations_delta>20))throw Error('Некорректная дельта отношений');
 if(effects.war_start!=null&&typeof effects.war_start!=='boolean')throw Error('Некорректное объявление войны');
 const target=orderCountry(targetCountry);
 if(target===playerCountry||!Object.hasOwn(countries,target))throw Error('Неизвестный адресат дипломатии');
 const treaty=effects.treaty;
 if(treaty!=null){
  if(typeof treaty!=='object'||Array.isArray(treaty)||Object.keys(treaty).some(k=>!['action','type','breaker'].includes(k))||
   !['sign','break'].includes(treaty.action)||!['alliance','nonaggression'].includes(treaty.type))throw Error('Некорректный договор');
  if(treaty.action==='sign'&&(isAtWar(playerCountry,target)||getRelation(playerCountry,target)<=(treaty.type==='alliance'?60:40)))throw Error('Условия договора не выполнены');
 }
 const snapshot=JSON.parse(JSON.stringify({countries,worldState}));
 try{
  if(effects.relations_delta)changeRelations(target,effects.relations_delta);
  if(treaty){
   if(treaty.action==='sign')signTreaty(treaty.type,playerCountry,target);
   else {const breaker=orderCountry(treaty.breaker)===playerCountry?playerCountry:target;breakTreaty(treaty.type,breaker,breaker===playerCountry?target:playerCountry);}
  }
  if(effects.war_start&&!isAtWar(target,playerCountry))declareEngineWar(target,playerCountry);
 }catch(error){({countries,worldState}=snapshot);renderPlayerStats();throw error;}
}
