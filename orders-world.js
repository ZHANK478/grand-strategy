/* Confirmed world events and newspaper: no network calls. */
function newspaperText(value){
 return String(value??'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu,'').trim();
}
function captureWorldFacts(){
 return Object.fromEntries(ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed).map(n=>{
  const c=countries[n];return[n,{name:c.displayName||n,ruler:c.ruler,pm:c.pm,government:c.government,
  army:c.army,treasury:c.treasury,debt:c.debt,stability:c.stability,gdp:c.gdp,
  lawSlots:JSON.stringify(c.lawSlots),parliament:!!c.parliament,
  taxes:Object.fromEntries(Object.entries(c.economy?.classes||{}).map(([k,v])=>[k,v.tax])),
  loyalty:Object.fromEntries(Object.entries(c.economy?.classes||{}).map(([k,v])=>[k,v.loyalty])),
  society:c.society?JSON.parse(JSON.stringify(c.society)):null}];
 }));
}
function recordWorldEvent(section,headline,body,actors=[],details=''){
 if(!worldState.periodEvents)worldState.periodEvents=[];
 const item={section,headline:newspaperText(headline),body:newspaperText(body),actors,details:newspaperText(details),date:dateLabel()};
 worldState.periodEvents.push(item);worldState.periodEvents=worldState.periodEvents.slice(-200);
 worldState.pastEvents.push(item.date+': '+item.headline+'. '+item.body);
}
function reactToPlayerOrders(results){
 const c=countries[playerCountry];
 results.filter(o=>o.status==='executed').forEach(o=>{
  const old=JSON.parse(o.before.taxes||'{}'),now=JSON.parse(o.after.taxes||'{}');
  Object.entries(c.economy?.classes||{}).forEach(([key,group])=>{
   const difference=(now[key]||0)-(old[key]||0);
   if(!difference)return;
   const shift=Math.max(-5,Math.min(3,-difference*.5));
   const before=group.loyalty;group.loyalty=Math.max(0,Math.min(100,Math.round((before+shift)*10)/10));
   recordWorldEvent('domestic',difference>0?'Новый налог вызывает недовольство':'Снижение налогов укрепляет поддержку',
    (difference>0?'Правительство увеличило налоговую нагрузку на группу «':'Налоговое послабление получила группа «')+group.label+'». '+(difference>0?'Решение отразилось на поддержке власти.':'Снижение нагрузки укрепляет расположение к правительству.'),[playerCountry],group.label+': ставка '+old[key]+'% → '+now[key]+'%. Поддержка '+before+' → '+group.loyalty+'.');
  });
  if(o.before.government!==o.after.government){
   ALL_COUNTRIES.filter(n=>n!==playerCountry&&!countries[n].annexed&&isRelevantPair(n,playerCountry)).slice(0,4).forEach(n=>{
    const aligned=/монарх|импер|королев|самодерж/i.test(countries[n].government)===/монарх|импер|королев|самодерж/i.test(c.government);
    const before=getRelation(playerCountry,n);addRelation(playerCountry,n,aligned?2:-3);
    if(getRelation(playerCountry,n)!==before)recordWorldEvent('foreign',
      'Смена режима меняет дипломатические отношения',
      (countries[n].displayName||n)+(aligned?' благосклоннее относится к новому политическому устройству государства.':' отдаляется от государства после перемены политического устройства.'),[n,playerCountry],'Отношения '+before+' → '+getRelation(playerCountry,n)+'.');
   });
  }
 });
}
function runWorldAutonomy(){
 if(activeScenario?.rules?.autonomousWorld===false)return;
 const peers=ALL_COUNTRIES.filter(n=>n!==playerCountry&&countries[n]&&!countries[n].annexed)
  .sort((a,b)=>(countries[b].gdp||0)-(countries[a].gdp||0)).slice(0,10);
 if(peers.length<2)return;
 const pairs=[];
 peers.forEach((a,i)=>peers.slice(i+1).forEach(b=>{if(!isAtWar(a,b)&&isRelevantPair(a,b))pairs.push([a,b]);}));
 if(pairs.length){
  const offset=(year*12+month)%pairs.length;
  for(let i=0;i<pairs.length;i++){
   const [a,b]=pairs[(offset+i)%pairs.length],before=getRelation(a,b),delta=before<-20?-3:3;
   addRelation(a,b,delta);const after=getRelation(a,b);if(before===after)continue;
   recordWorldEvent('foreign',delta>0?'Две державы сближаются':'Дипломатическое охлаждение',
    'Державы «'+(countries[a].displayName||a)+'» и «'+(countries[b].displayName||b)+(delta>0?'» сближаются. Улучшение отношений облегчает будущие договоры.':'» отдаляются друг от друга. Продолжение этой тенденции повышает риск кризиса.'),[a,b],'Отношения '+before+' → '+after);break;
  }
 }
 // At most two actual national decisions per month; never take domestic actions for the player.
 const offset=(year*12+month)%peers.length;
 [peers[offset],peers[(offset+1)%peers.length]].forEach(n=>{
  const c=countries[n],budget=c.lastBudget;if(!budget||!c.society||!c.economy)return;
  const constrained=c.parliament?.power>=50&&c.parliament.support<50;
  if(budget.net<0&&!constrained&&c.economy.classes.burgher.tax<30){
   const before=c.economy.classes.burgher.tax;c.economy.classes.burgher.tax++;
   recordWorldEvent('foreign',c.displayName+' повышает налог ради бюджета',
    'Дефицит '+Math.abs(budget.net)+' заставил правительство увеличить налог на '+c.economy.classes.burgher.label.toLowerCase()+
    ': '+before+'% → '+c.economy.classes.burgher.tax+'%. Новая ставка действует на следующий расчёт бюджета.',[n]);
  }else if(month%3===0&&budget.net>c.income*.1&&c.treasury>c.income*3&&!constrained){
   const kind=c.society.poverty>65?'welfare':'education',before=c.society.spending[kind],cap=Math.round(c.income*.25);
   const after=Math.min(cap,before+Math.max(1,Math.round(c.income*.01)));if(after<=before)return;
   c.society.spending[kind]=after;
   recordWorldEvent('foreign',c.displayName+(kind==='welfare'?' увеличивает помощь бедным':' вкладывается в образование'),
    'Бюджетный запас позволил увеличить ежемесячные расходы: '+before+' → '+after+' расчётных единиц. Это повлияет на '+(kind==='welfare'?'бедность':'грамотность')+' в следующих месяцах.',[n]);
  }
 });
}
function buildNewspaper(before,results,engineEvents,startDate){
 const domestic=[],foreign=[],add=(section,headline,body,details='')=>{const list=section==='domestic'?domestic:foreign;
 const item={headline:newspaperText(headline),body:newspaperText(body),details:newspaperText(details)};if(!list.some(x=>x.headline===item.headline&&x.body===item.body))list.push(item);};
 (worldState.periodEvents||[]).forEach(e=>add(e.section,e.headline,e.body,e.details));
 results.forEach(o=>{
  if(o.status==='executed'){
   const a=JSON.parse(o.before.spending||'{}'),b=JSON.parse(o.after.spending||'{}');
   Object.entries({education:'образование',welfare:'помощь бедным',infrastructure:'инфраструктуру'}).forEach(([k,label])=>{
    if(a[k]!==b[k])add('domestic','Правительство меняет расходы на '+label,
     'Кабинет '+(b[k]>a[k]?'увеличивает':'сокращает')+' финансирование этого направления. Решение входит в бюджет, а общественный эффект будет накапливаться постепенно.',a[k]+' → '+b[k]+' расчётных единиц в месяц.');
   });
   if(o.before.government!==o.after.government)add('domestic','Объявлено новое устройство власти','Глава государства установил форму правления «'+o.after.government+'». Перемена отражается на политическом устройстве и отношениях с другими державами.',o.before.government+' → '+o.after.government+'.');
   if(o.before.laws!==o.after.laws)add('domestic','Реформа меняет устройство государства',o.reason);
   if(o.before.pm!==o.after.pm)add('domestic','Объявлено назначение главы правительства','По решению главы государства пост главы правительства получил '+o.after.pm+'.',o.reason);
   else if(o.before.ruler!==o.after.ruler)add('domestic','Перемены в руководстве страны',o.reason);
   if(o.before.army!==o.after.army)add('domestic',o.after.army>o.before.army?'Армия пополняется':'Армия сокращается',o.after.army>o.before.army?'Правительство пополнило вооружённые силы. Казна оплачивает набор и принимает на себя содержание новых солдат.':'Правительство сократило численность вооружённых сил. Это меняет военные возможности государства.',o.reason);
   if(o.before.debt!==o.after.debt)add('domestic',o.after.debt>o.before.debt?'Правительство привлекает заём':'Государство погашает долг',o.after.debt>o.before.debt?'Кабинет привлёк заём для пополнения казны. Полученные средства увеличили долговые обязательства государства.':'Кабинет направил средства казны на погашение долговых обязательств.',o.reason);
   Object.keys(o.relationsBefore||{}).forEach(n=>{
    const before=o.relationsBefore[n],after=o.relationsAfter[n];if(before===after)return;
    add('foreign',after<before?'Дипломатическая провокация обостряет отношения':'Дипломатическое решение укрепляет отношения',
     'Отношения с державой «'+(countries[n]?.displayName||n)+(after<before?'» ухудшились после решения главы государства.':'» стали теплее после решения главы государства.'),'Отношения '+before+' → '+after+'.');
   });
   if(o.effects?.map_objects?.length)add('domestic','Перемены в размещении на карте',
    o.effects.map_objects.some(x=>x.type==='army')?'Правительство изменило размещение воинских частей. Солдаты распределяются из существующей армии.':'Исполнено распоряжение о размещении или перемещении объекта. Подробности доступны на карте.',o.reason);
   if(!o.effects?.relations&&!o.effects?.map_objects&&o.before.taxes===o.after.taxes&&o.before.spending===o.after.spending&&o.before.laws===o.after.laws&&o.before.government===o.after.government&&o.before.ruler===o.after.ruler&&o.before.pm===o.after.pm&&o.before.army===o.after.army&&o.before.debt===o.after.debt)
    add('domestic','Решение главы государства вступило в силу',o.reason);
  }else add('domestic',o.status==='failed'?'Политическая попытка не удалась':o.status==='blocked'?'Решение встретило препятствие':'Предложение не исполнено',o.text.replace(/[.!?]+$/,'')+'. '+o.reason);
 });
 ALL_COUNTRIES.forEach(n=>{
  const a=before[n],c=countries[n];if(!a||!c||c.annexed)return;
  const section=n===playerCountry?'domestic':'foreign';
  if(a.ruler!==c.ruler)add(section,'Смена главы государства: '+c.displayName,a.ruler+' → '+c.ruler+'. Управление страной продолжается.');
  if(n!==playerCountry)return;
  if(c.society&&a.society&&Math.abs(c.society.literacy-a.society.literacy)>=.1)add(section,'Образование даёт первые результаты',
   'Грамотность населения выросла за прошедший период. Расходы на образование постепенно меняют положение в стране.','Грамотность '+a.society.literacy+'% → '+c.society.literacy+'%.');
  if(c.society&&a.society&&Math.abs(c.society.poverty-a.society.poverty)>=.1)add(section,c.society.poverty<a.society.poverty?'Бедность отступает':'Бедность растёт',
   c.society.poverty<a.society.poverty?'За прошедший период доля бедных сократилась. Социальные расходы помогают улучшить положение населения.':'Доля бедных выросла. Экономическое неблагополучие и нестабильность усиливают давление на население.','Доля бедных '+a.society.poverty+'% → '+c.society.poverty+'%.');
  if(c.stability!==a.stability)add(section,c.stability<a.stability?'Власть теряет устойчивость':'Положение власти укрепляется',
   c.stability<a.stability?'События прошедшего периода ослабили положение правительства.':'События прошедшего периода укрепили положение правительства.','Стабильность '+a.stability+' → '+c.stability+'.');
  Object.entries(c.economy?.classes||{}).forEach(([k,v])=>{
   const old=a.loyalty[k];if(old!=null&&v.loyalty<old-.1)add(section,'Общественное недовольство усиливается',
    'Группа «'+v.label+'» теряет расположение к правительству. Налоговая нагрузка и положение населения отражаются на устойчивости власти.',v.label+': поддержка '+old+' → '+v.loyalty+'.');
  });
 });
 // Existing engine notices (wars, treaties, battles, institutions) remain authoritative.
 engineEvents.filter(t=>!(worldState.periodEvents||[]).some(e=>t===e.date+': '+e.headline+'. '+e.body)).slice(-12).forEach(t=>{
  const text=newspaperText(t),own=text.includes(playerCountry)||text.includes(playerCountryDisplayName);
  add(own?'domestic':'foreign',/войн|ВОЙН|сражен|Битв/i.test(text)?'Военные известия':/союз|договор|пакт/i.test(text)?'Дипломатические известия':'Политические известия',text);
 });
 if(!domestic.length)add('domestic','Период без крупных потрясений','Правительство продолжает текущий курс. За период не подтверждено значительных внутренних событий.');
 if(!foreign.length)add('foreign','За рубежом без крупных перемен','Новых подтверждённых международных событий за период нет.');
 const edition={from:startDate,to:dateLabel(),turn,domestic:domestic.slice(-16),foreign:foreign.slice(-16)};
 worldState.newspaperHistory=[...(worldState.newspaperHistory||[]),edition].slice(-12);
 return edition;
}
function renderNewspaper(edition){
 if(!edition)return;
 const date=document.getElementById('newspaper-date');if(date)date.textContent=edition.from+' — '+edition.to;
 const fill=(id,articles)=>{
  const box=document.getElementById(id);if(!box)return;box.replaceChildren();
  articles.forEach(item=>{const article=document.createElement('article');article.className='newspaper-article';
   const title=document.createElement('h3');title.textContent=item.headline;
   const body=document.createElement('p');body.textContent=item.body;article.append(title,body);if(item.details){const details=document.createElement('details');details.className='newspaper-details';const label=document.createElement('summary');label.textContent='Цифры и изменения';const text=document.createElement('p');text.textContent=item.details;details.append(label,text);article.appendChild(details);}box.appendChild(article);});
 };
 fill('domestic-list',edition.domestic);fill('events-list',edition.foreign);
 document.getElementById('mobile-news-button')?.classList.add('has-news');
}
