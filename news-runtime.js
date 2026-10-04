/* Isolated experiment: typed orders, authoritative receipts, and atomic turns. */
'use strict';
const ORDER_STATUS={prepared:'Подготовлен',executed:'Исполнен',blocked:'Заблокирован',failed:'Сорван',rejected:'Отклонён',deferred:'Отложен',in_progress:'В работе'};
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
 return {validatePoliticalTask,player:playerCountry,countries,actors:ensureWorldActors(),initiatives:JSON.parse(JSON.stringify(ensureInitiatives())),objects:JSON.parse(JSON.stringify(worldState.mapObjects||[])),
  lawSlots:LAW_SLOTS,lawOption,governments:activeScenario.rules?.governments||null,relation:getRelation,atWar:isAtWar,location:resolveLocationLonLat,
  provinceOwner:key=>{const p=scenarioProvinces.find(p=>p.id===key||p.name===key);return p?(provinceOwners[p.id]||p.owner):null;}};
}
function canonicalEffects(e){
 const copy=JSON.parse(JSON.stringify(e));
 // Accept the harmless category wrapper only when it contains exactly the declared initiative field.
 if(copy&&Object.keys(copy).length===1&&copy.administration&&Object.keys(copy.administration).length===1&&Array.isArray(copy.administration.initiatives)){copy.initiatives=copy.administration.initiatives;delete copy.administration;}
 ['relations','other_countries'].forEach(k=>{if(copy[k]&&typeof copy[k]==='object'&&!Array.isArray(copy[k]))copy[k]=Object.fromEntries(Object.entries(copy[k]).map(([n,v])=>[orderCountry(n),v]));});
 ['war_declared','peace_made'].forEach(k=>{if(Array.isArray(copy[k]))copy[k]=copy[k].map(orderCountry);});
 ['relations_between','wars_between','battles','treaties'].forEach(k=>{if(Array.isArray(copy[k]))copy[k].forEach(o=>{if(o&&typeof o==='object'){if(o.a)o.a=orderCountry(o.a);if(o.b)o.b=orderCountry(o.b);}});});
 ['foreign_leader_change','province_transfer','map_objects'].forEach(k=>{if(Array.isArray(copy[k]))copy[k].forEach(o=>{if(o&&typeof o==='object'){['country','new_owner','owner'].forEach(f=>{if(o[f])o[f]=orderCountry(o[f]);});}});});
 if(copy.initiatives)copy.initiatives.forEach(i=>{if(i.target_country)i.target_country=orderCountry(i.target_country);});
 if(copy.operations)copy.operations=copy.operations.map(step=>({...step,effects:canonicalEffects(step.effects)}));
 if(copy.military_order?.action==='deploy'&&!copy.military_order.unit_id)copy.military_order.unit_id=crypto.randomUUID();
 if(copy.country_color?.country)copy.country_color.country=orderCountry(copy.country_color.country);
 return copy;
}
function orderBudgetPreview(){
 const c=countries[playerCountry];if(!c?.economy||!c.society)return null;
 if(typeof econBudget==='function'&&c.econV3){const b=econBudget(c);return {gross:b.gross,net:b.net,upkeep:b.upkeep,interest:b.interest};}
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
renderActionsList=function(){
 const pending=ensureOrders(),box=document.getElementById('actions-list');if(!box)return;
 box.replaceChildren();const b=orderBudgetPreview();
 const summary=document.createElement('div');summary.className='order-summary';
 summary.textContent=b?'Прогноз месяца: доход '+b.gross.toLocaleString('ru',{maximumFractionDigits:1})+' млн р.е./мес.'+', баланс '+(b.net>=0?'+':'')+b.net.toLocaleString('ru',{maximumFractionDigits:1})+' млн р.е./мес.'+'. '+(b.net<0?'Нужно уменьшить дефицит.':'Можно направить избыток на развитие.')+' Прогноз при текущих показателях; рост и события могут изменить итог.':'Подготовьте решения на следующий месяц.';
 box.appendChild(summary);
 if(turn===1){const c=countries[playerCountry],points=[];
  if(b?.net<0)points.push('Дефицит '+economyFmt(Math.abs(b.net))+' млн р.е./мес.');
  if(c.society?.poverty>45)points.push('Бедность '+economyFmt(c.society.poverty)+'%');
  if(c.society?.literacy<65)points.push('Грамотность '+economyFmt(c.society.literacy)+'%');
  const low=Object.values(c.economy?.classes||{}).sort((a,b)=>a.loyalty-b.loyalty)[0];if(low?.loyalty<45)points.push('Низкая поддержка: '+low.label);
  if(worldState.atWarWith?.length)points.push('Идёт война с '+worldState.atWarWith.join(', '));
  if(points.length){const attention=document.createElement('p');attention.className='order-summary';attention.textContent='Начальная обстановка: '+points.slice(0,3).join(' · ')+'. Это возможные темы первых распоряжений.';box.append(attention);}}
 if(!pending.length){const empty=document.createElement('p');empty.textContent='Нет подготовленных приказов. Напишите решение главы государства.';box.appendChild(empty);}
 pending.forEach((o,index)=>{
  const row=document.createElement('div');row.className='action-item order-card';
  const content=document.createElement('div'),label=document.createElement('strong'),status=document.createElement('small');
  label.textContent=o.text;status.textContent=(o.technicalError?'Нужен повтор обработки':ORDER_STATUS[o.status])+(o.reason?' · '+o.reason:'')+(o.fixedEffects?' · готовое решение':' · срок и расходы определит исполнитель при обработке');
  content.append(label,status);const remove=document.createElement('button');remove.className='rm-btn';remove.textContent='✕';remove.disabled=turnRunning;remove.onclick=()=>removeAction(index);
  row.append(content,remove);box.appendChild(row);
 });
 const running=ensureExecutiveProcesses().filter(p=>p.status==='active');
 running.forEach(p=>{const row=document.createElement('div');row.className='order-result';row.textContent='В работе: '+p.summary+' · до '+processDate(p.due)+' · оплачено '+economyFmt(p.cost||0)+' млн р.е.';box.appendChild(row);});
 if(pending.some(o=>o.technicalError)){
  const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить обработку без хода';retry.disabled=turnRunning;retry.onclick=()=>retryOrders();box.appendChild(retry);
 }
 const economic=countries[playerCountry]?.econV3?.programs?.filter(p=>p.status==='active')||[];
 if(economic.length){const details=document.createElement('details'),title=document.createElement('summary');title.textContent='Экономические программы · '+economic.length;details.append(title);
  const labels={tax:'Налоги',spending:'Расходы',ownership:'Собственность',coordination:'Организация экономики',education:'образование',welfare:'помощь населению',infrastructure:'инфраструктура',agriculture:'сельское хозяйство',industry:'промышленность',resources:'добыча',services:'услуги',market:'рынок',regulated:'регулируемый рынок',planned:'плановая экономика'};
  for(const p of economic){const row=document.createElement('p'),group=p.group?(ECON_GROUPS[p.group]||labels[p.group]||p.group):labels[p.sector]||'',target=typeof p.target==='number'?economyFmt(p.kind==='ownership'?p.target*100:p.target)+(p.kind==='spending'?' млн р.е./мес.':p.kind==='coordination'?'':'%'):labels[p.target]||p.target;
   row.textContent=(labels[p.kind]||p.kind)+(group?' · '+group:'')+' · цель '+target+' · ещё '+Math.max(0,Math.ceil(p.days-p.elapsed))+' дней'+(p.cost?' · оплачено '+economyFmt(p.cost)+' млн р.е.':'');details.append(row);}box.append(details);}
 renderPoliticalActions(box);
 const legacy=ensureInitiatives().filter(i=>i.country===playerCountry&&i.status!=='closed');if(legacy.length){const details=document.createElement('details'),title=document.createElement('summary');title.textContent='Дополнительные материалы';details.append(title);renderInitiatives(details);box.append(details);}
 const recent=worldState.orders.filter(o=>!['prepared','deferred'].includes(o.status)).slice(-5).reverse();
 if(recent.length){
  const log=document.createElement('details');log.className='order-technical-log';const title=document.createElement('summary');title.textContent='Журнал приказов';log.appendChild(title);box.appendChild(log);
  recent.forEach(o=>{const row=document.createElement('div');row.className='order-result';row.textContent=ORDER_STATUS[o.status]+': '+o.text+' — '+o.reason;log.appendChild(row);});
 }
};
function parseOrderReply(raw){
 let text=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 if(text.startsWith('PLAN:'))text=text.slice(5).trim();
 let plan;try{plan=JSON.parse(text);}catch{throw Error('ИИ вернул повреждённый план. Дата и приказы сохранены.');}
 return plan;
}
async function generateOrderPlan(){
 const pending=ensureOrders().filter(o=>!worldState.retryingOrderIds||worldState.retryingOrderIds.includes(o.id)),free=pending.filter(o=>!o.fixedEffects),context=orderPlanningContext();
 const prompt=`Ты управляешь политическим миром исторической стратегии, дата ${dateLabel()}, следующий период ${worldState.plannedPeriod||'месяц'}.
Игрок — исполнительная власть страны ${playerCountry}. История только исходные условия, не запрет альтернативного курса.
Твоя задача: понять и исполнить решения игрока и определить позиции его внутренних участников. Иностранные кабинеты принимают решения отдельным политическим раундом после исполнения приказов; здесь не сочиняй их действия.
Граница: участник контролирует собственные распоряжения и попытки, но не чужое согласие, успешность переворота, результаты выборов или возникновение ресурсов.
НЕ отказывай физически возможному государственному действию словами «нет механики/движка/кнопки». Для обычных организационных, правовых и политических действий используй political_task: это полноценное распоряжение с исполнителем, сроком, результатом и проверяемыми эффектами. Доклад нужен ТОЛЬКО если игрок просит именно документ. Назначение или численное изменение нельзя оставить только в result: ОБЯЗАТЕЛЬНО укажи kind и effects, например political_task с kind:power, effects:{pm_name:"выбранное имя",pm_title:"Глава правительства"}, плюс goal о дальнейшей программе. result без effects исполняет только организационное действие; оно НЕ меняет премьер-министра, налог, деньги или армию. Не превращай всякую политику в отчёты и не требуй именования исполнителя: выбери подходящую должность.
Относительные суммы вычисляй из состояния: налог вдвое = rate/2. Назначить неизвестного человека или младенца можно; участники оценивают последствия. Название режима не гарантирует общественного признания.
Если позиция внутреннего участника зависит от приказа, укажи condition_order:его ID. Код применит позицию после подтверждённого исполнения.\nВНУТРЕННИЕ УЧАСТНИКИ: цели и самостоятельные решения, поддержка/сопротивление/требования/протест по интересам и состоянию. Опиши конкретную позицию, не общую фразу «обсуждает последствия».
Обстановка: ${compactPoliticalJSON(context)}
Свободные приказы: ${JSON.stringify(free.map(o=>({id:o.id,text:o.text})))}
Готовые решения исключи: ${JSON.stringify(pending.filter(o=>o.fixedEffects).map(o=>({id:o.id,kind:o.kind,effects:o.fixedEffects})))}
Верни только JSON:
{"orders":[{"id":"ID","kind":"тип","status":"execute|reject|defer","reason":"до 150 символов","effects":{},"article":{"headline":"газетный заголовок","body":"3–5 предложений о принятом решении, без гарантированных исходов"}}],"politics":[{"actor_id":"ID::government или точный внутренний ID","goal":"сохраняемая политическая цель","action":"СТРОКА действия, например warn; НЕ объект","target":"ID страны если нужен","motive":"конкретная оценка интересов","headline":"газетный заголовок","body":"выразительная газетная заметка 3–5 предложений о собственном решении участника","condition_order":"только если зависит от принятия нового приказа","task":{}}]}
orders: ровно один результат каждому приказу. Сверяй id и исходный текст: не переносить поручение другого приказа, не дублировать чужое решение. В political_task.goal включи смысл ИМЕННО этого исходного приказа, все его адресаты и условия.  reject/defer effects:{} допускается только физическая невозможность, отсутствие полномочий или ресурсов, не неизвестный вид поручения.
Политическое поручение: всегда передавай headline, body и cost (0 если нет самостоятельных организационных затрат); статья того же решения может служить текстом поручения. army/military deploy обязательно unit_id; если новая часть, придумай короткий уникальный ID. Для постепенного повышения расходов возвращай economic_policy с type:spending, group, target и days, не мгновенный society. Взаимные пошлины — trade_policy:{action:"offer",target,type:"trade",rate,days}; customs_union только если игрок просит общий внешний таможенный союз.
Типы:
policy: operations:[{kind:"поддерживаемый тип кроме policy/political/unsupported/administration",effects:{}}], до 8 последовательных шагов ОДНОГО поручения. Используй для сложного намерения, например выделить собственную часть, посадить на транспорт и начать переход. Каждый шаг проверяется при исполнении после предыдущего. Отсутствие кнопки не причина отказа. Не обещай прибытие раньше маршрута или чужое согласие. Для организационной цели political_task хранит цель, исполнителя и срок.
tax: economy:{tax_noble, tax_burgher,tax_commons}, 0..100.
spending: society:{education_spending,welfare_spending,infrastructure_spending}, каждый 0..${Math.round(countries[playerCountry].gdp/12)} млн р.е. в месяц; фактическую платёжеспособность и дефицит проверит бюджет.
finance: debt_delta, положительный заём одновременно увеличивает долг и казну.
power: pm_name/pm_title/ruler_name/ruler_age/ruler_title/government/parliament:{dissolve:true|restore:true|ban_party:"имя"}. Название государственного строя можно выбрать самостоятельно; известные формы служат ориентирами: ${JSON.stringify(activeScenario.rules?.governments||[])}. Концентрация власти — попытка, исход решает код.
law: law_slots:{слот:ID}; варианты ${econLawSpecForPrompt()}. Если свободный закон не соответствует слотам, используй political_task с организационным/правовым результатом и поддерживаемым экономическим эффектом, если он нужен.
army: army_delta; положительный набор ВСЕГДА минимум 90 дней и за деньги. Нельзя создавать готовых солдат.
map: map_objects:[{action:"create|move|update|remove",id,type:"army|hq|naval|diplomat|other",owner:"ID",label,troops,location:"город или провинция",to:"цель для move"}]. Только собственные объекты; сумма солдат не больше национальной армии. Для пограничного размещения выбери известную собственную провинцию/город у нужного соседа. ID существующего объекта используй точно.
diplomacy: relations:{"ID":-40..20}, war_declared:["ID"]. Нельзя своим приказом гарантировать чужой союз или мир. Предложение договора — political_task, target и result о предложении.
statement: statement:"публичное заявление" без сверхъестественных возможностей.
political: {"political_task":{"goal":"суть поручения","executor":"кто исполняет","target":"необязательный ID иностранной страны","offer":"alliance|nonaggression|peace только если поручение предлагает договор","answer":"accept|reject только ответ на существующее входящее предложение","days":0..3650,"cost":0..месячный доход,"result":"конкретное собственное организационное/политическое действие, которое будет совершено, НЕ гарантированный чужой исход","headline":"газетный заголовок о начале или немедленном действии","body":"3–5 содержательных газетных предложений, без придуманного результата","kind":"необязательный тип численного эффекта","effects":{}}}.
Примеры ОБЩИХ категорий, не исключения: учреждение органа, встреча, назначение исполнителя, политическая кампания, отмена запрета, переговоры, расследование, программа. days:0 если можно немедленно издать распоряжение; несколько дней/недель для исполнения. result не добавляет деньги/войска/земли/GDP сам по себе. Реальные численные итоги задавай исключительно effects с одним типом из списка. Окончательный исход зависит от ресурсов и сопротивления. Референдум об устройстве власти: power+process:{mode:"referendum",days:минимум21,summary:"..."}, не гарантируй победу. Обычная реализация численных эффектов может иметь process:{mode:"implementation",days:1..3650,summary:"..."}.
politics: до 12 решений, один участник один раз. Допустимые action:
для собственных внутренних участников: support,oppose,petition,protest. Не придумывай демонстрации при выборе только petition. Предлагаемый протест требует реального недовольства. Для иностранных задач и войн действуют собственные деньги, полномочия и люди. В body для war пиши о военном намерении, не о уже начавшейся войне.
Предложение союза или пакта в political_task включает offer:"alliance" или offer:"nonaggression". Иначе текст result не создаёт предложение договора. task.offer — собственное согласие предложившей стороны, не согласие адресата. Для получения чужого согласия участник должен выбрать accept на существующее offers. Игрок отвечает на входящее предложение через political_task с target и answer:accept или reject. offer:peace предлагает мир; только согласие второй стороны завершает войну.
action всегда строка; amount и target — отдельные поля. У внутренних групп target не нужен. Не указывай kind:political внутри task; kind там — только тип конкретных численных effects.
Новости повествуют о принятых решениях, а не придуманных успехах. Не пиши технические статусы, эффекты, ID или «нет в движке». Не добавляй поля кроме перечисленных. Пиши компактно; максимум 12 politics, 8 orders.`;
 const raw=await askGemini(prompt,6500,worldState.retryingOrders?0:1,{response_format:{type:'json_object'},reasoning_effort:'low'}),plan=parseOrderReply(raw);
 plan.orders=repairPlannerOrders(plan.orders,free);
 const decisions=Array.isArray(plan.politics)?plan.politics:[];
 if(window.POLITICAL_SUBJECTS){for(let i=decisions.length-1;i>=0;i--){if(ensureWorldActors()[decisions[i]?.actor_id]?.kind==='government')decisions.splice(i,1);}}
 for(let i=1;i<decisions.length-1;i++){if(decisions[i]==='condition_order'&&typeof decisions[i+1]==='string'&&decisions[i-1]&&typeof decisions[i-1]==='object'&&!decisions[i-1].condition_order){decisions[i-1].condition_order=decisions[i+1];decisions.splice(i,2);i--;}}
 if(decisions.length>12)decisions.splice(12);
 const valid=[],errors=[];const seen=new Set();
 decisions.forEach(rawDecision=>{let d;try{d=canonicalPoliticalDecision(rawDecision);validatePoliticalDecision(d);politicalAssert(!seen.has(d.actor_id),'Повтор участника');seen.add(d.actor_id);valid.push(d);}catch(e){errors.push({actor:rawDecision.actor_id,error:e.message});}});
 plan.orders.forEach(o=>{if(o.effects?.political_task){const source=free.find(x=>x.id===o.id);if(source)bindPoliticalMandate(o.effects.political_task,source.text,o.article);}});
 const articles=new Map(plan.orders.map(o=>[o.id,o.article]));
 const byId=new Map(plan.orders.map(o=>{const {article,...rest}=o;
 if(rest.kind==='tax'&&Object.keys(rest.effects||{}).length&&Object.keys(rest.effects).every(k=>['tax_noble','tax_burgher','tax_commons','tax_peasants','tax_middle'].includes(k)))rest.effects={economy:rest.effects};
 if(rest.kind==='spending'&&Object.keys(rest.effects||{}).length&&Object.keys(rest.effects).every(k=>['education_spending','welfare_spending','infrastructure_spending'].includes(k)))rest.effects={society:rest.effects};
 if(!rest.process&&rest.effects?.process){rest.process=rest.effects.process;delete rest.effects.process;}return [o.id,{...rest,effects:canonicalEffects(rest.effects)}];}));
 plan.orders.forEach(o=>{
  if(o.kind==='political'&&o.status==='execute'&&o.effects&&Object.keys(o.effects).length===0){
   const original=free.find(x=>x.id===o.id),article=o.article;
   politicalAssert(original&&article?.headline&&article?.body,'Не хватает содержания государственного поручения');
   const duration=politicalDuration(original.text);
   byId.set(o.id,{id:o.id,kind:'political',status:'execute',reason:o.reason,effects:{political_task:{goal:original.text,executor:countries[playerCountry].pm||'Кабинет министров',days:duration,cost:0,result:article.body,headline:article.headline,body:article.body}}});
  }
 });
 
 free.forEach(original=>{
  try{OrderRules.validatePlan({news:[],domestic:[],orders:[(({technicalError,...o})=>o)(byId.get(original.id))],world_effects:{}},[{id:original.id}],orderContext());}
  catch(error){
   const reason='Исполнитель не смог подготовить однозначное изменение по этому указу. Указ сохранён для следующего хода.';
   byId.set(original.id,{id:original.id,kind:'unsupported',status:'defer',reason,effects:{},technicalError:error.message});
   articles.set(original.id,{headline:'Исполнитель продолжит подготовку решения',body:'Поручение «'+original.text+'» остаётся на рассмотрении. Кабинет должен уточнить способ исполнения; изменения ещё не вступили в силу.'});
   errors.push({order:original.id,error:error.message});
  }
 });
 
 const rawOrders=pending.map(o=>o.fixedEffects?{id:o.id,kind:o.kind,status:'execute',reason:'Решение игрока',effects:o.fixedEffects}:byId.get(o.id));
 const technical=new Map(rawOrders.filter(o=>o?.technicalError).map(o=>[o.id,o.technicalError]));
 const checked=OrderRules.validatePlan({news:[],domestic:[],orders:rawOrders.map(({technicalError,...o})=>o),world_effects:{}},pending,orderContext());
 checked.orders.forEach(o=>{if(technical.has(o.id))o.technicalError=technical.get(o.id);});
 checked.articles=Object.fromEntries([...articles].filter(([,a])=>a&&typeof a.headline==='string'&&a.headline.length<=160&&typeof a.body==='string'&&a.body.length<=2000));checked.politics=valid;checked.politicalErrors=errors;pendingDirectives=[];return checked;
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
// An invalid model operation cannot leak half an order or veto the calendar.
function captureOrderExecution(){
 return {data:JSON.parse(JSON.stringify({countries,worldState,provinceOwners,territoryOwners,provinceEcon,ALL_COUNTRIES,playerCountryDisplayName,pendingDirectives})),orders:worldState.orders.slice()};
}
function restoreOrderExecution(snapshot){
 const s=snapshot.data;
 for(const key of Object.keys(countries))if(!s.countries[key])delete countries[key];
 for(const [key,value]of Object.entries(s.countries)){
  const target=countries[key]||(countries[key]={});Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,value);
 }
 const orderById=new Map(snapshot.orders.map(o=>[o.id,o]));
 s.worldState.orders=s.worldState.orders.map(o=>{const target=orderById.get(o.id)||{};Object.keys(target).forEach(k=>delete target[k]);return Object.assign(target,o);});
 Object.keys(worldState).forEach(k=>delete worldState[k]);Object.assign(worldState,s.worldState);
 ({provinceOwners,territoryOwners,provinceEcon,ALL_COUNTRIES,playerCountryDisplayName,pendingDirectives}=s);
 countryCentroids=null;
 if(typeof maritimeTouch==='function')maritimeTouch();
}
function executePolicySteps(owner,operations){
 const log=[];
 for(const step of operations){
  const ctx={...orderContext(),player:owner};
  const effects=OrderRules.validateEffects(canonicalEffects(step.effects),ctx,'order',step.kind);
  const result=applyCountryPoliticalEffects(owner,step.kind,effects);
  if(result?.status==='blocked'||result?.status==='failed'||result?.status==='rejected')throw new StrategyActionError(result.reason||'Исполнитель встретил препятствие');
  log.push(result?.reason||'Распоряжение передано исполнителю');
 }
 return {status:'executed',reason:log.join('; ')};
}
function executeOrderEffects(e){
 if(e.operations)return executePolicySteps(playerCountry,e.operations);
 const copy=JSON.parse(JSON.stringify(e)),c=countries[playerCountry];
 if(copy.peace_made?.length)throw Error('Мир требует согласия противника; направьте предложение');
 if(copy.treaties){copy.treaties.filter(t=>t.action==='sign').forEach(t=>createPoliticalOffer(playerCountry,t.a===playerCountry?t.b:t.a,t.type));copy.treaties=copy.treaties.filter(t=>t.action!=='sign');}
 if(copy.initiatives){applyInitiatives(copy.initiatives);delete copy.initiatives;}
 if(copy.statement){
  worldState.publicStatements=[...(worldState.publicStatements||[]),{country:playerCountry,text:copy.statement,date:dateLabel(),turn}].slice(-60);
  recordWorldEvent('domestic','Заявление главы государства',c.ruler+' публично заявил: «'+copy.statement+'». Заявление само по себе не меняет государственное устройство или материальные возможности страны.',[playerCountry],'Публичное заявление зарегистрировано; материальные эффекты отсутствуют.');
  delete copy.statement;
 }
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
 if(e.initiatives)parts.push('Поручения и организации зарегистрированы; документы и рекомендации готовятся по сроку');
 if(e.economy){const ids=Object.fromEntries(Object.keys(c.economy.classes).map(id=>['tax_'+id,id]));
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
 if(e.treaties)parts.push('Предложение договора или прекращение обязательств зарегистрировано');
 if(e.relations)parts.push('Отношения обновлены');
 if(e.province_transfer)parts.push('Провинции переданы');
 if(e.country_name)parts.push('Название страны: '+c.displayName);
 if(e.country_color)parts.push('Цвет страны обновлён');
 return parts.length?parts.join('; ')+'.':'Проверенные изменения применены кодом.';
}
function applyOrderPlan(plan){
 const results=[];
 plan.orders.forEach(proposal=>{
  const order=worldState.orders.find(o=>o.id===proposal.id);if(!order)return;
  if(!['prepared','deferred'].includes(order.status))return;
  const transaction=captureOrderExecution();
  const c=countries[playerCountry],before=orderStatSnapshot(c),verdict=proposal.process||proposal.effects.army_delta>0?{status:proposal.status==='execute'?'executed':proposal.status==='reject'?'rejected':'deferred',reason:proposal.reason}:OrderRules.authority(proposal,c);
  const relationsBefore=Object.fromEntries(Object.keys(proposal.effects.relations||{}).map(n=>[n,getRelation(playerCountry,n)]));
  if(verdict.status==='executed'){
   // Resource refusals and technical failures are isolated to the affected order.
   const e=proposal.effects;
   let resourceError='';
   if(e.initiatives&&e.initiatives.reduce((n,i)=>n+(i.setup_cost||0),0)>c.treasury)resourceError='Недостаточно казны для учреждения поручений.';
   if(e.peace_made?.length)resourceError='Для мира требуется согласие противника на предложение.';
   if(e.parliament?.dissolve&&!c.parliament)resourceError='В стране уже нет парламента.';
   if(e.parliament?.restore&&c.parliament)resourceError='Парламент уже существует.';
   if(e.parliament?.ban_party&&!c.parliament?.factions?.some(f=>f.name===e.parliament.ban_party))resourceError='Указанная партия не найдена в парламенте.';
   if(e.debt_delta>0&&c.debt+e.debt_delta>c.income*36)resourceError='Общий долг превышает предел добровольного заимствования (36 месячных доходов).';
   if(e.debt_delta<0&&c.treasury<Math.min(-e.debt_delta,c.debt))resourceError='Недостаточно казны для погашения долга.';
   if(e.army_delta>0&&(c.treasury<Math.ceil(e.army_delta*.002)||c.army+e.army_delta>Math.round(c.population*1000*getEra().armyMaxShare)))resourceError='Недостаточно средств или населения для набора армии.';
   if(resourceError){verdict.status='blocked';verdict.reason=resourceError;}
   else if(e.laws?.length&&!e.law_slots&&!e.institutions){verdict.status='deferred';verdict.reason='Для этого закона не определён системный эффект. Уточните реформу; простая запись названия не считается исполнением.';}
   else {
    let started=false;
    try {if(e.political_task){const v=startPoliticalTask(playerCountry,e.political_task,order.id);verdict.status=v.status;verdict.reason=v.reason;started=true;if(v.task)order.politicalTask=v.task.id;}else started=startExecutiveProcess(order,proposal);if(started&&!e.political_task){verdict.status='in_progress';verdict.reason=order.reason;}}
    catch(error){verdict.status='blocked';verdict.reason=error.message;}
    if(!started&&verdict.status==='executed'){
     try{
      const applied=executeOrderEffects(e);
      if(applied?.status==='blocked'){restoreOrderExecution(transaction);verdict.status='blocked';verdict.reason=applied.reason;}
     }catch(error){
      restoreOrderExecution(transaction);
      const mechanical=typeof StrategyActionError!=='undefined'&&error instanceof StrategyActionError;
      verdict.status=mechanical?'blocked':'deferred';
      verdict.reason=mechanical?error.message:'Не удалось обработать исполнение. Поручение сохранено; можно повторить без продвижения даты.';
      order.technicalError=mechanical?null:String(error.message||error).slice(0,400);
     }
    }
   }
  }
  if(verdict.penalty)changeCountryStat(playerCountry,'stability',-verdict.penalty);
  if(proposal.technicalError)order.technicalError=proposal.technicalError;
  else if(verdict.status==='executed'||verdict.status==='in_progress')delete order.technicalError;
  order.status=verdict.status;order.kind=proposal.kind;order.effects=verdict.status==='executed'?JSON.parse(JSON.stringify(proposal.effects)):{};
  order.relationsBefore=relationsBefore;order.relationsAfter=Object.fromEntries(Object.keys(relationsBefore).map(n=>[n,getRelation(playerCountry,n)]));
  order.reason=verdict.status==='executed'&&!proposal.effects.political_task?executedOrderDescription(proposal.effects):verdict.reason;order.resolvedTurn=turn;order.before=before;order.after=orderStatSnapshot(c);
  if(verdict.chance!=null)order.chance=verdict.chance;
  results.push(order);
 });
 results.filter(o=>['executed','in_progress'].includes(o.status)).forEach(o=>{const article=plan.articles?.[o.id];if(article){politicalEvent(playerCountry,article.headline,article.body,ORDER_STATUS[o.status]+': '+o.reason);worldState.periodEvents.at(-1).sourceOrder=o.id;}});
 // Autonomous changes use the same parser only after complete schema validation.
 const autonomous=JSON.parse(JSON.stringify(plan.world_effects));
 if(autonomous.war_declared){autonomous.war_declared.forEach(n=>{if(!isAtWar(playerCountry,n))declareEngineWar(n,playerCountry);});delete autonomous.war_declared;}
 if(autonomous.wars_between){autonomous.wars_between.forEach(w=>{if(w.status==='start'&&!isAtWar(w.a,w.b))declareEngineWar(w.a,w.b);});autonomous.wars_between=autonomous.wars_between.filter(w=>w.status!=='start');}
 parseAndApplyEffects('EFFECTS:'+JSON.stringify(autonomous),[]);
 reconcileOrderArmies();
 if(plan.world_effects.parliament?.factions)countries[playerCountry].electionPending=false;
 recordActorReactions(results);
 if(plan.politics){plan.politics.forEach(d=>{try{executePoliticalDecision(d,results);}catch(error){(plan.politicalErrors||(plan.politicalErrors=[])).push({actor:d.actor_id,error:error.message});}});worldState.politicalErrors=plan.politicalErrors||[];}else applyActorIntents(plan.actor_intents);
 observePoliticalWorld();
 ensureOrders();
 worldState.orders=worldState.orders.filter(o=>['prepared','deferred'].includes(o.status)||o.status==='in_progress'||o.resolvedTurn>=turn-20);
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
 eventsBox.style.display='block';list.textContent='Проверяем приказы и готовим газету…';
 // Provider/schema failures are not a veto on the calendar or executive authority.
 // Catch only planning failures. Application/state failures retain atomic rollback.
 let plan;
 try{plan=await generateOrderPlan();worldState.plannerFailure=null;}
 catch(error){
  const pending=ensureOrders();
  worldState.plannerFailure={turn,date:dateLabel(),message:String(error.message||error).slice(0,500)};
  plan={orders:pending.map(o=>o.fixedEffects?
   {id:o.id,kind:o.kind,status:'execute',reason:'Решение игрока',effects:o.fixedEffects}:
   {id:o.id,kind:'unsupported',status:'defer',technicalError:String(error.message||error).slice(0,400),reason:'Ответ ИИ не удалось обработать. Приказ сохранён; это техническая задержка, а не отказ власти или исполнителя.',effects:{}}),
   world_effects:{},politics:[],articles:Object.fromEntries(pending.filter(o=>!o.fixedEffects).map(o=>[o.id,{headline:'Распоряжение ожидает подтверждения исполнения',body:(countries[playerCountry].ruler||'Глава государства')+' отдал распоряжение: «'+o.text+'». Подтверждённых сведений о его исполнении пока нет. Изменения по этому распоряжению не объявлены состоявшимися; оно остаётся в списке действующих поручений.'}])),politicalErrors:[]};
  showNotif('Ответ ИИ не обработан. Время продолжится; неподтверждённые приказы сохранены, их эффекты не выдумываются.');
 }
 const results=applyOrderPlan(plan);
 reactToPlayerOrders(results);
 results.forEach(o=>worldState.pastEvents.push('Приказ '+o.id+': '+ORDER_STATUS[o.status]+' — '+o.text+'. '+o.reason));
 worldState.diploLog=[];renderActionsList();
 return results;
};
// Preserve the country across every ruler's death, abdication, and regime change.
const originalResetForOrders=resetGame;
resetGame=function(...args){politicalGeoCache=null;originalResetForOrders(...args);worldState.orders=[];renderActionsList();};
const originalLoadForOrders=loadGameSlot;
loadGameSlot=async function(...args){politicalGeoCache=null;const result=await originalLoadForOrders(...args);ensureOrders();renderActionsList();renderNewspaper(worldState.newspaperHistory?.at(-1));return result;};
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

async function retryOrders(){
 if(turnRunning||window.ordersCanStartTurn&&!window.ordersCanStartTurn())return false;
 const pending=ensureOrders().filter(o=>o.technicalError);if(!pending.length)return false;
 turnRunning=true;
 try{
  if(window.testEnsureAIForTurn&&!await window.testEnsureAIForTurn({retry:true}))return false;
  worldState.retryingOrders=true;worldState.retryingOrderIds=pending.map(o=>o.id);
  const cashBefore=countries[playerCountry].treasury;
  const plan=await generateOrderPlan();plan.politics=[];
  const results=applyOrderPlan(plan);reactToPlayerOrders(results);renderPlayerStats();renderActionsList();
  const edition=worldState.newspaperHistory?.at(-1);
  if(edition){
   const receipts=new Map((edition.receipts||[]).map(o=>[o.id,o]));results.forEach(o=>receipts.set(o.id,{id:o.id,text:o.text,status:o.status,reason:o.reason,technical:!!o.technicalError}));edition.receipts=[...receipts.values()];
   if(edition.summary){edition.summary.executed=edition.receipts.filter(o=>o.status==='executed').length;edition.summary.progress=edition.receipts.filter(o=>o.status==='in_progress').length;edition.summary.technical=ensureOrders().filter(o=>o.technicalError).length;edition.summary.cash+=countries[playerCountry].treasury-cashBefore;}
   for(const o of results){const article=['executed','in_progress'].includes(o.status)?plan.articles?.[o.id]||newsFallbackArticle(o):newsFallbackArticle(o);edition.domestic=edition.domestic.filter(a=>a.sourceOrder!==o.id);edition.domestic.unshift({...article,sourceOrder:o.id,details:newsOrderDetails(o)});}renderNewspaper(edition);}
  delete worldState.retryingOrders;delete worldState.retryingOrderIds;
  saveGame();showNotif('Обработка поручений завершена. Дата не изменилась.');return true;
 }catch(error){showNotif('Не удалось повторить обработку. Поручения сохранены.');return false;}
 finally{delete worldState.retryingOrders;delete worldState.retryingOrderIds;turnRunning=false;renderActionsList();}
}

function compactPoliticalJSON(data){
 // Precision for reasoning, not a mutation of the economic simulation.
 return JSON.stringify(data,(_key,value)=>typeof value==='number'&&Number.isFinite(value)?Number(value.toPrecision(7)):value);
}

function orderPlanningContext(){
 // The order interpreter operates the player's government; foreign cabinets have their own context.
 const source=politicalContext(),own=countries[playerCountry],targets=mentionedPoliticalCountries(ensureOrders().map(o=>o.text).join(' '));
 const relevant=new Set([playerCountry,...targets,...selectPoliticalCountries(playerCountry,6)]);
 const c={...source};
 c.countries=(source.countries||[]).filter(x=>relevant.has(x.facts?.id)).map(x=>({facts:{id:x.facts.id,ruler:x.facts.ruler,government:x.facts.government,agenda:x.facts.agenda,gdp:x.facts.gdp,army:x.facts.army,neighbors:x.facts.neighbors,relations:x.facts.relations},changes:x.changes}));
 c.actors=(source.actors||[]).filter(a=>a.country===playerCountry);
 c.court={[playerCountry]:source.court?.[playerCountry]};
 c.tasks=(source.tasks||[]).filter(t=>t.country===playerCountry);
 c.allCountries=(source.allCountries||[]).filter(x=>relevant.has(x.id)||source.allCountries.length<=60);
 c.player={...source.player,moneyUnit:'млн расчётных единиц',ruler:own.ruler,rulerTitle:own.rulerTitle,pm:own.pm,pmTitle:own.pmTitle,government:own.government};
 if(source.strategy){
  const st=source.strategy,locations=(st.militaryLocations||[]);
  c.strategy={...st,units:st.units.filter(u=>relevant.has(u.owner)),routes:st.routes.filter(x=>st.units.some(u=>u.id===x.unit&&u.owner===playerCountry)),
   militaryLocations:locations.filter(p=>relevant.has(p.owner)).map(p=>({...p,neighbors:p.neighbors.filter(n=>n.owner!==p.owner)})),
   contracts:st.contracts.filter(x=>[x.a,x.b].includes(playerCountry)),offers:st.offers.filter(x=>[x.a,x.b].includes(playerCountry))};
 }
 if(source.maritime)c.maritime={...source.maritime,countries:source.maritime.countries.filter(x=>x.id===playerCountry)};
 const copy=JSON.parse(compactPoliticalJSON(c));
 // Histories describe trends; repeating their full numeric series is not needed to execute an order.
 for(const part of [copy.player?.society,copy.player?.economic]){
  if(part&&typeof part==='object')for(const key of Object.keys(part))if(/history|previous|log/i.test(key)&&Array.isArray(part[key]))part[key]=part[key].slice(-2);
 }
 copy.contextScope='Собственное исполнение. Иностранные кабинеты получают собственные сведения отдельно; отсутствие их частной казны не означает отсутствие страны.';
 return copy;
}
