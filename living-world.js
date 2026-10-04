/* Public stories, private ministerial answers and factual economy explanations.
   The newsroom may edit prose only: it never receives an effects executor. */
'use strict';
function livingPrivateResponse(e){
 const cause=e.condition||e.sourceOrder;const o=cause&&worldState.orders.find(x=>x.id===cause);
 return !!(o?.response&&(!o.effects||Object.keys(o.effects).every(k=>k==='political_task'&&(!o.effects[k].effects||!Object.keys(o.effects[k].effects).length))));
}
function livingStoryKey(e){
 if(e.condition&&worldState.orders.some(o=>o.id===e.condition))return 'order:'+e.condition;
 if(e.sourceOrder)return 'order:'+e.sourceOrder;
 if(e.storyId)return 'story:'+e.storyId;
 if(e.sourceTask)return 'task:'+e.sourceTask;
 return e.newsKey||e.headline+'|'+e.body;
}
function livingGroupStories(list){
 const stories=new Map();
 for(const event of list){
  const e=event.condition&&worldState.orders.some(o=>o.id===event.condition)?{...event,sourceOrder:event.condition}:event;
  if(livingPrivateResponse(e))continue;
  const o=e.sourceOrder&&worldState.orders.find(x=>x.id===e.sourceOrder);
  if(o?.technicalError||/Подтверждение исполнения пока не получено|Распоряжение ожидает подтверждения/.test(e.headline))continue;
  const key=livingStoryKey(e),old=stories.get(key);
  if(!old){stories.set(key,{...e,storyKey:key,actors:[...new Set(e.actors||[])],facts:[e.body],details:e.details||''});continue;}
  old.facts=[...new Set([...old.facts,e.body])];old.actors=[...new Set([...old.actors,...(e.actors||[])])];
  old.details=[...new Set([old.details,e.details].filter(Boolean))].join('\n');
  if(e.phase==='completion'||(e.policyRound&&!old.policyRound)){old.headline=e.headline;old.body=e.body;old.phase=e.phase;}
  old.coverage||=e.coverage;old.priority=Math.max(old.priority||0,e.priority||0);
  for(const k of ['policyTarget','policyAction','policyKind','policyGoal'])if(e[k])old[k]=e[k];
 }
 return [...stories.values()].map(s=>({...s,body:s.facts.join('\n\n')}));
}
function livingInternational(e){
 if(e.respondsTo||e.policyTarget)return true;
 if(['war','mobilize','deploy','negotiate','warn','condemn','offer_alliance','offer_nonaggression','offer_peace','accept','reject_offer'].includes(e.policyAction))return true;
 if(['diplomacy','military','naval','trade','power'].includes(e.policyKind))return true;
 const text=e.headline+' '+e.body;
 if(/войн|сражен|отступ|вторж|блокад|десант|эскадр|посол|дипломат|договор|пошлин|ультимат|нейтрал|союзник|смена.*власт|смена главы/i.test(text))return true;
 // Routine domestic programme announcements belong in the archive, not seven world headlines.
 return false;
}
const livingOldForeignWeight=foreignNewsWeight;
foreignNewsWeight=function(e,...args){return livingOldForeignWeight(e,...args)+(livingInternational(e)?160:0);};
function livingOrderProgress(o){
 const day=gameDayNumber(),c=countries[playerCountry],process=ensureExecutiveProcesses().find(p=>p.id===o.processId||p.id===o.id),program=(c.econV3?.programs||[]).find(p=>p.orderId===o.id),build=maritimeState().builds.find(p=>p.orderId===o.id);
 return process?{type:process.mode,status:process.status,remainingDays:Math.max(0,process.due-day),delivered:process.delivered||0,total:process.totalRecruit||process.reservedTroops}:
 program?{type:program.kind,status:program.status,remainingDays:Math.max(0,program.days-program.elapsed),target:program.target}:
 build?{type:build.type,status:build.status,remainingDays:Math.max(0,build.due-day),count:build.count,cost:build.cost,port:maritimePort(build.port)?.name}:null;
}
async function livingEditStories(edition,stories){
 if(!stories.length)return;
 const facts=stories.map((s,i)=>({id:'N'+(i+1),section:s.section,headline:s.headline,
 facts:s.body.slice(0,2400),execution:s.details.slice(0,1800),
 order:s.sourceOrder?worldState.orders.find(o=>o.id===s.sourceOrder)?.text:undefined,
 verified:s.sourceOrder?(()=>{const o=worldState.orders.find(o=>o.id===s.sourceOrder);return o?{status:o.status,reason:o.reason,before:o.before,after:o.after,effects:o.effects,currentBudget:econBudget(countries[playerCountry]),progress:livingOrderProgress(o)}:null;})():undefined,
 actors:(s.actors||[]).map(id=>({country:countries[id]?.displayName||id,ruler:countries[id]?.ruler,government:countries[id]?.government}))}));
 const prompt='NEWSPAPER_EDITOR_V2\nТы редактор политической газеты '+year+' года в '+(countries[playerCountry].displayName||playerCountry)+'. Период '+edition.from+' — '+edition.to+'.\n'+
 'Напиши полноценные выразительные газетные заметки по событиям ниже. Газета должна показывать столкновение интересов и значение события для людей и государств. Начинай с самого события, а не поручения написать доклад. Для значимого решения 70–120 слов, 1–2 абзаца; небольшой промежуточный итог 35–60 слов. Не все события сенсация: тон соразмерен ставкам. Смерть, смена власти, война и разрыв с парламентом требуют соответствующего масштаба и открытого вопроса о будущем. Школьная реформа — рассказ о доступе к учёбе, споре об устройстве общества и людях, которых она затрагивает; не о том, что поле закона обновлено.\n'+
 'facts и execution — источники ОДНОЙ истории. verified — фактическое применение: при расхождении с формулировкой статьи оно имеет приоритет. Набор и строительство в работе нельзя представить завершёнными. Объедини распоряжение, исполнение и реакции в одну статью. Не печатай отдельно, что создан приказ, готовится отчёт, достигнут статус, движок подтвердил шаг. Не перечисляй сроки/бюджет/статусы как служебный отчёт: они уже скрыты под статьёй. Число солдат или кораблей допустимо, если это суть события. Не засоряй статьи оговорками вроде «это ещё не означает», «подтверждения не получено», «дальнейшие последствия зависят».\n'+
 'Отделяй факт от анализа. Мотивы и реакции, присутствующие в facts, передавай конкретно; не подменяй их «министры одобряют, но беспокоятся о финансировании». Если реальной реакции нет, редакция МОЖЕТ обсуждать, какие интересы сталкиваются, что поставлено на карту и какой вопрос остаётся открытым, явно как собственный анализ/предположение. Это не новая политическая позиция, массовый протест или чужое решение. Не выдумывай цитат, терактов, голосований, внешних заявлений, состоявшихся побед или численных последствий. Нельзя объявлять результат вместо начатого процесса. Физически невозможное заявление можно обсуждать как заявление, не истину. История — отправная точка, а не запрет альтернативных событий.\n'+
 'Верни только JSON {"articles":[{"id":"N1","headline":"заголовок до 150 символов","body":"связная статья"}]}. Ровно одна статья на каждое id; без effects, списка изменений и чужих решений.\nИсточники: '+compactPoliticalJSON(facts);
 try{
  const data=parseOrderReply(await askGemini(prompt,8500,0,{response_format:{type:'json_object'},reasoning_effort:'low'}));
  if(!Array.isArray(data.articles))throw Error('Редактор не вернул статьи');
  const seen=new Set();
  for(const a of data.articles){
   const index=Number(String(a.id).replace(/^N/,' '))-1,story=stories[index];
   if(!story||seen.has(index)||typeof a.headline!=='string'||typeof a.body!=='string'||a.headline.length>160||a.body.length<70||a.body.length>3500)continue;
   seen.add(index);story.headline=newspaperText(a.headline);story.body=newspaperText(a.body);story.edited=true;
  }
  edition.editor=seen.size===stories.length?'newspaper':'partial-newspaper';
  if(seen.size!==stories.length)edition.editorError='Часть заметок осталась в исходной редакции: ответ редактора был неполным.';
 }catch(error){
  edition.editor='source-stories';edition.editorError=String(error.message||error);
 }
}
writeNewspaper=async function(edition){
 await collectNewspaperFacts(edition);
 // Include all foreign sources before the old seven-item clipping, then rank real politics.
 const international=livingGroupStories((worldState.periodEvents||[]).filter(e=>e.section==='foreign'));
 const own=livingGroupStories(edition.domestic);
 const ranked=international.sort((a,b)=>foreignNewsWeight(b)-foreignNewsWeight(a));
 const important=ranked.filter(livingInternational);
 const background=ranked.filter(s=>!livingInternational(s));
 // Keep every player's enacted decision; background statistics remain available in details.
 const mainHome=own.filter(s=>s.sourceOrder||s.coverage||s.decisionActor||/Смена|сражен|войн|кризис|умер|погиб/i.test(s.headline)).slice(0,12);
 if(!mainHome.length)mainHome.push(...own.slice(0,3));
 const homeOther=own.filter(s=>!mainHome.includes(s));
 const mainForeign=important.slice(0,7);
 const foreignOther=[...important.slice(7),...background];
 edition.archive={domestic:homeOther,foreign:foreignOther};
 edition.domestic=mainHome;edition.foreign=mainForeign;
 const stories=[...mainHome.map(s=>Object.assign(s,{section:'domestic'})),...mainForeign.map(s=>Object.assign(s,{section:'foreign'}))];
 await livingEditStories(edition,stories);
 edition.technicalOrders=ensureOrders().filter(o=>o.technicalError).map(o=>({id:o.id,text:o.text,error:o.technicalError}));
 // Quiet periods get a short neutral line, never seven fabricated cabinet stories.
 if(!edition.foreign.length)edition.foreign=[{headline:'Международная хроника',body:'За этот период новых публичных дипломатических решений не поступило.',actors:[]}];
 if(!edition.domestic.length)edition.domestic=[{headline:'Внутренняя хроника',body:'Государственные службы продолжают текущую работу. Новых публичных решений за этот период не объявлено.',actors:[]}];
 return edition;
};
async function livingCopy(text){
 try{await navigator.clipboard.writeText(text);showNotif('Текст скопирован');}
 catch{
  const field=document.createElement('textarea');field.value=text;field.className='living-copy-field';document.body.appendChild(field);field.focus();field.select();
  try{document.execCommand('copy');showNotif('Текст скопирован');}catch{showNotif('Выделите текст и выберите «Копировать»');}finally{field.remove();}
 }
}
function livingCopyButton(text){
 const button=document.createElement('button');button.type='button';button.className='living-copy-button';button.textContent='Копировать';
 button.onclick=e=>{e.stopPropagation();livingCopy(text);};return button;
}
const livingOldRender=renderNewspaper;
renderNewspaper=function(edition){
 livingOldRender(edition);if(!edition)return;
 for(const [section,id]of [['domestic','domestic-list'],['foreign','events-list']]){
  const box=document.getElementById(id);if(!box)continue;
  const rows=box.querySelectorAll('.newspaper-article');
  [...rows].forEach((row,i)=>{const a=edition[section]?.[i];if(a)row.appendChild(livingCopyButton(a.headline+'\n\n'+a.body+(a.details?'\n\nИсполнение и последствия:\n'+a.details:'')));});
  const archive=edition.archive?.[section]||[];
  if(archive.length){const details=document.createElement('details');details.className='newspaper-details living-archive';const title=document.createElement('summary');title.textContent='Остальные события · '+archive.length;details.append(title);
   for(const a of archive){const paragraph=document.createElement('p');paragraph.textContent=a.headline+'\n'+a.body+(a.details?'\n'+a.details:'');details.append(paragraph);}
   box.append(details);
  }
 }
 const box=document.getElementById('events-box');
 let notice=document.getElementById('living-technical-notice');
 if(!notice&&box){notice=document.createElement('div');notice.id='living-technical-notice';notice.className='living-service-notice';box.prepend(notice);}
 if(notice){notice.replaceChildren();notice.hidden=!edition.technicalOrders?.length&&!edition.editorError;
  if(edition.technicalOrders?.length){const text=document.createElement('span');text.textContent=edition.technicalOrders.length+' поручений требуют повторной обработки. Это техническая задержка, а не решение кабинета. ';
   const button=document.createElement('button');button.type='button';button.textContent='Повторить без хода';button.onclick=()=>retryOrders();notice.append(text,button);}
  if(edition.editorError){const details=document.createElement('details'),label=document.createElement('summary'),message=document.createElement('p');label.textContent='Состояние редакции';message.textContent=edition.editorError;details.append(label,message);notice.append(details);}
 }
};
const livingOldActions=renderActionsList;
renderActionsList=function(...args){
 const result=livingOldActions(...args),box=document.getElementById('actions-list');if(!box)return result;
 const responses=worldState.orders.filter(o=>o.response&&o.status==='executed').slice(-4).reverse();
 if(responses.length){const section=document.createElement('section');section.className='living-minister-responses';
  const title=document.createElement('h3');title.textContent='Ответы кабинета';section.append(title);
  for(const o of responses){const details=document.createElement('details'),heading=document.createElement('summary'),body=document.createElement('p');
   details.open=o===responses[0];heading.textContent=o.text;body.textContent=o.response;details.append(heading,body,livingCopyButton(o.text+'\n\n'+o.response));section.append(details);}
  box.append(section);
 }
 return result;
};
askAdvisor=async function(message){
 const c=countries[playerCountry],context={date:dateLabel(),country:playerCountry,ruler:c.ruler,
 budget:econBudget(c),economy:{gdp:c.gdp,growth:c.gdpGrowth,drivers:econV3(c).drivers,inflation:c.inflation,treasury:c.treasury,debt:c.debt},
 demography:econDemography(c),education:econEducation(c),population:c.population*1000,groups:c.economy.classes,
 spending:c.society.spending,programs:econV3(c).programs.filter(p=>p.status==='active'),ports:maritimeFacts(playerCountry).ports,
 orders:worldState.orders.slice(-10).map(o=>({text:o.text,status:o.status,reason:o.reason,technical:o.technicalError||null,response:o.response||null})),
 decisions:ensurePolitics().decisions.slice(-6),events:worldState.pastEvents.slice(-6)};
 advisorHistory.push({role:'user',text:message});
 const reply=await askGemini('MINISTER_ADVICE_V2\nТы советник главы государства. Ответь на сам вопрос, не пересказывай, что он задан. Используй реальные данные ниже. Отделяй политический отказ/нехватку ресурсов от технической ошибки модели. Для неисполненного приказа объясни конкретную причину и исполнимый следующий шаг. Если данных недостаточно, скажи каких. Не сочиняй отсутствие порта или маршрута вопреки данным. Экономика: ВВП — производство за год, все деньги в млн р.е., бюджет в млн р.е./мес.; рост и грамотность рассчитываются ежедневно. Создание комиссии само по себе не добавляет денег или ВВП: объясни её полномочия, достигнутый практический результат и следующий реальный инструмент. Разрешение учиться меняет доступ, расходы и сроки определяют фактическую грамотность. Не применяй effects: совет не приказ. До 220 слов.\nСостояние: '+compactPoliticalJSON(context)+'\nПоследний разговор: '+JSON.stringify(advisorHistory.slice(-6))+'\nВопрос: '+message,2400,0,{reasoning_effort:'low'});
 advisorHistory.push({role:'advisor',text:reply});return reply;
};
