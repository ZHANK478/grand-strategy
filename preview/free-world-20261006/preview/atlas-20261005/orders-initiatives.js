/* Open-ended administrative work; reports propose policy, never apply it. */
'use strict';
function ensureInitiatives(){return worldState.initiatives||(worldState.initiatives=[]);}
function initiativeNotice(i,headline,body,details=''){
 recordWorldEvent(i.kind==='mission'?'foreign':'domestic',headline,body,[i.country,...(i.target_country?[i.target_country]:[])],details);
 const event=worldState.periodEvents.at(-1);event.priority=3;event.initiative_id=i.id;event.initiative_phase=i.status;
}
function applyInitiatives(operations){
 const list=ensureInitiatives(),mine=countries[playerCountry];
 const extra=operations.filter(o=>o.action==='create').length;
 if(list.filter(i=>!['closed','failed'].includes(i.status)).length+extra>40)throw Error('Одновременно можно вести до 40 дел');
 const cost=operations.reduce((n,o)=>n+(o.setup_cost||0),0);
 if(operations.some(o=>o.action==='update'&&list.find(i=>i.id===o.id)?.status==='closed'))throw Error('Закрытое дело нужно учредить заново с новым ID');
 if(cost>mine.treasury)throw Error('Недостаточно казны для организации дел');
 if(cost)changeCountryStat(playerCountry,'treasury',-cost);
 operations.forEach(o=>{
  const existing=list.find(i=>i.id===o.id);
  if(o.action==='close'){
   existing.status='closed';existing.closed=gameDayNumber();
   initiativeNotice(existing,'Правительство завершило поручение',existing.name+' закрыто по распоряжению главы государства.','ID '+existing.id);return;
  }
  if(o.action==='create'){
   const i={...o,country:playerCountry,status:'active',created:gameDayNumber(),due:gameDayNumber()+o.duration_days,
    monthly_budget:o.monthly_budget||0,spent:o.setup_cost||0,documents:[],lastFundingMonth:year*12+month};
   delete i.action;list.push(i);
   if(i.kind==='mission'&&i.target_country){const actor=ensureWorldActors()[i.target_country+'::government'];if(actor){actor.issue={orderId:'mission:'+i.id,text:i.mandate,day:gameDayNumber()};actorRemember(actor,'Получено известие о направлении миссии из '+playerCountry+': '+i.mandate+'. Согласие на предложения не дано автоматически.');}}
   initiativeNotice(i,i.kind==='mission'?'Начата дипломатическая миссия':i.kind==='organization'?'Учреждён новый орган':'Правительство поручило подготовить решение',
    i.executor+' получил поручение: '+i.mandate+'. '+(i.target_country?'Адресат — '+(countries[i.target_country]?.displayName||i.target_country)+'. ':'')+'Первый результат ожидается к '+processDate(i.due)+'.',
    'Дело '+i.name+'; ID '+i.id+'; расходы организации '+(o.setup_cost||0)+'; финансирование '+i.monthly_budget+' в месяц.');
  }else{
   if(existing.status==='closed')throw Error('Закрытое дело нужно учредить заново с новым ID');
   ['name','mandate','executor','target_country','monthly_budget'].forEach(k=>{if(o[k]!=null)existing[k]=o[k];});
   if(o.duration_days!=null||o.mandate!=null){existing.due=gameDayNumber()+(o.duration_days||7);existing.status='active';existing.documentError=null;}
   initiativeNotice(existing,'Поручение правительства уточнено',existing.executor+' продолжит работу по обновлённому заданию: '+existing.mandate+'.','ID '+existing.id);
  }
 });
}
function tickInitiatives(){
 const list=ensureInitiatives();
 list.filter(i=>['active','awaiting_report','paused'].includes(i.status)||(i.status==='reported'&&['organization','programme'].includes(i.kind))).forEach(i=>{
  const c=countries[i.country];if(!c||c.annexed){i.status='failed';return;}
  const calendarMonth=year*12+month;
  if(calendarMonth>i.lastFundingMonth){
   if(c.treasury<i.monthly_budget){
    if(i.status!=='paused')initiativeNotice(i,'Работа приостановлена из-за финансирования',i.name+': казна не обеспечила предусмотренное финансирование. Срок работы будет сдвинут.','Требуется '+i.monthly_budget);
    i.status='paused';i.due++;return;
   }
   changeCountryStat(i.country,'treasury',-i.monthly_budget);i.spent+=i.monthly_budget;i.lastFundingMonth=calendarMonth;
   if(i.status==='paused'){i.status='active';initiativeNotice(i,'Финансирование поручения восстановлено',i.name+' возвращается к работе.');}
  }
  if(i.status==='paused'){i.due++;return;}
  if(i.status==='active'&&gameDayNumber()>=i.due)i.status='awaiting_report';
 });
}
function initiativeContext(){
 return ensureInitiatives().filter(i=>i.country===playerCountry&&i.status!=='closed').slice(-20)
  .map(i=>({id:i.id,kind:i.kind,name:i.name,mandate:i.mandate,executor:i.executor,target_country:i.target_country,status:i.status,due:processDate(i.due),monthly_budget:i.monthly_budget,
   last_document:i.documents.at(-1)?.summary||null}));
}
function executiveFacts(){
 const c=countries[playerCountry],preview=orderBudgetPreview();
 return {country:playerCountry,treasury:c.treasury,debt:c.debt,army:c.army,population:c.population,populationUnit:'тысяч человек',moneyUnit:'млн расчётных единиц',gdp:c.gdp,monthlyIncome:c.income,society:c.society,
  taxes:Object.fromEntries(Object.entries(c.economy?.classes||{}).map(([id,v])=>[id,{label:v.label,rate:v.tax,loyalty:v.loyalty,wealth:v.wealth}])),
  spending:c.society?.spending,budget:{forecast:true,...(typeof econBudget==='function'&&c.econV3?econBudget(c):preview)},parliament:c.parliament};
}
function dossierPrompt(due){
 const names=selectPoliticalCountries(playerCountry,8),own=countries[playerCountry];
 return `Ты исполнитель государственных поручений в стратегической игре. Сейчас ${dateLabel()}, страна ${own.displayName||playerCountry}, глава государства ${own.ruler}.
Подготовь реальные содержательные документы по задачам ниже: анализ, варианты, ограничения, последовательность действий. Отсутствие отдельной игровой кнопки не мешает подготовить доклад, программу или рекомендации.
ФАКТЫ: ${JSON.stringify(executiveFacts())}
Численные поля treasury=казна, debt=долг, monthlyIncome=месячный доход, taxes.rate=ставка, budget.gross=доход прогноза, budget.net=остаток после расходов. Если budget.forecast=true, это прогноз, а не отсутствие данных. Все суммы — расчётные единицы движка. Не называй их франками или миллиардами. Требуются конкретные меры по имеющимся числам, а не отказ из-за отсутствия полного исторического реестра.
Полномочия: ${JSON.stringify(own.parliament)}.
Внешнее окружение: ${JSON.stringify(names.map(id=>({id,name:countries[id].displayName,ruler:countries[id].ruler,government:countries[id].government,gdp:countries[id].gdp,army:countries[id].army,relation:getRelation(playerCountry,id),war:isAtWar(playerCountry,id),agenda:countries[id].agenda})))}.
События: ${JSON.stringify(worldState.pastEvents.slice(-6))}.
ПОРУЧЕНИЯ: ${JSON.stringify(due.map(i=>({id:i.id,kind:i.kind,name:i.name,executor:i.executor,mandate:i.mandate,target:i.target_country,targetFacts:i.target_country?{name:countries[i.target_country]?.displayName,relation:getRelation(playerCountry,i.target_country),war:isAtWar(playerCountry,i.target_country),agenda:countries[i.target_country]?.agenda}:null,spent:i.spent})))}.
Верни только JSON {"documents":[{"initiative_id":"точный ID","title":"название","summary":"итог в 1–2 предложениях","body":"содержательный документ 120–220 слов","proposals":["до трёх конкретных приказов, которые игрок МОЖЕТ затем утвердить"]}]}.
Один документ на каждое поручение. Документ — анализ исполнителя, не новые факты мира. Не выдумывай уже принятые чужие решения, согласие на союз, новые законы, казну, победы или бесплатные войска. Миссия может подготовить предложения для переговоров; реальное согласие другой стороны требует отдельного дипломатического обмена. Земельная комиссия может разработать меры, а не автоматически конфисковать собственность. План бюджета использует реальные исходные величины и единицы движка; не превращай расчётные единицы в исторические франки без основания. Различай предложения и исполненные события. Текст по-русски.`;
}
function validateDossierReply(raw,due){
 const data=parseOrderReply(raw),documents=data.documents;
 if(!Array.isArray(documents)||documents.length!==due.length)throw Error('Неполный комплект документов');
 const seen=new Set();
 documents.forEach(d=>{
  if(!d||Object.keys(d).some(k=>!['initiative_id','title','summary','body','proposals'].includes(k))||!due.some(i=>i.id===d.initiative_id)||seen.has(d.initiative_id))throw Error('Неизвестный или повторный документ');
  seen.add(d.initiative_id);
  for(const [key,max,min]of [['title',150,1],['summary',600,1],['body',6000,100]])if(typeof d[key]!=='string'||d[key].length>max||d[key].trim().length<min)throw Error('Некорректный текст документа');
  if(!Array.isArray(d.proposals)||d.proposals.length>3||d.proposals.some(p=>typeof p!=='string'||!p.trim()||p.length>1200))throw Error('Некорректные предложения документа');
 });
 return documents;
}
async function completeInitiativeDocuments(){
 const due=ensureInitiatives().filter(i=>i.country===playerCountry&&i.status==='awaiting_report').slice(0,3);
 if(!due.length)return;
 try{
  const raw=await askGemini(dossierPrompt(due),4000,0),documents=validateDossierReply(raw,due);
  documents.forEach(d=>{
   const i=due.find(i=>i.id===d.initiative_id),document={...d,body:d.body.replace(/\\\\n/g,'\n'),date:dateLabel(),day:gameDayNumber()};
   i.documents.push(document);i.documents=i.documents.slice(-6);i.status='reported';i.reported=gameDayNumber();i.documentError=null;
   initiativeNotice(i,'Правительству представлен документ',i.executor+' представил «'+d.title+'». '+d.summary,
    'Документ доступен в приказах → Дела и документы. Рекомендации не изменяют политику без решения игрока.');
   worldState.periodEvents.at(-1).priority=4;
  });
 }catch(error){
  due.forEach(i=>{i.documentError='Доклад пока не получен; поручение сохранено.';});
  showNotif('Доклады пока не готовы. Поручения сохранены; следующий ход повторит подготовку.');
 }
}
function renderInitiatives(box){
 const list=ensureInitiatives().filter(i=>i.country===playerCountry).slice(-30).reverse();if(!list.length)return;
 const section=document.createElement('details');section.className='order-technical-log initiative-files';section.open=true;
 const title=document.createElement('summary');title.textContent='Дела и документы';section.appendChild(title);
 list.forEach(i=>{
  const row=document.createElement('details'),heading=document.createElement('summary');
  const statuses={active:'В работе',awaiting_report:'Ожидается доклад',reported:'Доклад готов',paused:'Нет финансирования',closed:'Закрыто',failed:'Прекращено'};
  heading.textContent=i.name+' · '+(statuses[i.status]||i.status);row.appendChild(heading);
  const text=document.createElement('p');text.textContent=i.mandate+'\nИсполнитель: '+i.executor+'\nСрок: '+processDate(i.due)+'\nРасходы: '+i.spent+'; финансирование '+i.monthly_budget+'/месяц.'+(i.documentError?'\n'+i.documentError:'');row.appendChild(text);
  i.documents.forEach(d=>{
   const header=document.createElement('strong');header.textContent=d.title+' · '+d.date;const body=document.createElement('p');body.textContent=d.body;row.append(header,body);
   d.proposals.forEach(proposal=>{const button=document.createElement('button');button.className='load-close-btn';button.textContent='Подготовить приказ: '+proposal;button.disabled=turnRunning;button.onclick=()=>queueOrder(proposal);row.appendChild(button);});
  });
  section.appendChild(row);
 });
 box.appendChild(section);
}
