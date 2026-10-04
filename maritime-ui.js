/* Compact economy tabs reuse the mobile/laptop side panel. All controls queue turn orders. */
'use strict';
function maritimeTradeHTML(owner){
 const f=economyFmt,esc=economyEscape,c=countries[owner],m=maritimeState(),t=maritimeTrade().result[owner],p=maritimeTradePolicy(owner);
 if(!t)return '<p>Торговые данные готовятся.</p>';
 const row=(name,value)=>'<div class="economy-row"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>';
 const partners={};for(const x of t.partners){partners[x.country]||={imports:0,tariffs:0,modes:new Set()};partners[x.country].imports+=x.value;partners[x.country].tariffs+=x.value*x.rate/100*c.econV3.collection;partners[x.country].modes.add(x.mode);}
 let body='<h3>Торговля и таможня</h3>'+row('Импорт / месяц',f(t.imports)+' млн р.е.')+row('Экспорт / месяц',f(t.exports)+' млн р.е.')+row('Пошлины в бюджет / месяц',f(t.tariffs)+' млн р.е.')+row('Общая импортная ставка',f(c.econV3.policy.tariff)+'%')+
 '<p>Внешняя торговля — покупки и продажи предприятий, а не перевод между государственными казнами. Пошлину платит импортёр с доставленного груза. Ставки, блокада и вместимость портов меняют перевозки; недопоставка повышает давление на цены и производство. Потоки пересчитываются еженедельно и при изменении торговых условий.</p>';
 body+='<div class="maritime-policy-form"><label>Категория <select id="maritime-good"><option value="all">Все товары</option>'+Object.entries(MARITIME_GOODS).map(([id,g])=>'<option value="'+id+'">'+esc(g.name)+'</option>').join('')+'</select></label><label>Партнёр <select id="maritime-partner"><option value="">Общая ставка</option>'+ALL_COUNTRIES.filter(n=>n!==owner&&!countries[n].annexed).map(n=>'<option value="'+esc(n)+'">'+esc(countries[n].displayName||n)+'</option>').join('')+'</select></label><label>Ставка, % <input id="maritime-rate" type="number" min="0" max="100" value="'+esc(c.econV3.policy.tariff)+'"></label><button type="button" onclick="maritimeQueueTariff()" '+(turnRunning?'disabled':'')+'>Подготовить изменение</button></div>';
 body+='<h3>Товары</h3>'+Object.entries(t.goods).map(([k,g])=>'<article><h4>'+esc(MARITIME_GOODS[k].name)+'</h4>'+row('Доставлено / потребность в импорте',f(g.delivered)+' / '+f(g.desired)+' млн')+row('Пошлины',f(g.tariffs)+' млн')+'</article>').join('');
 body+='<h3>Партнёры</h3>'+Object.entries(partners).sort((a,b)=>b[1].imports-a[1].imports).map(([n,x])=>row(countries[n].displayName||n,f(x.imports)+' млн · '+[...x.modes].map(k=>k==='sea'?'море':'суша').join(', '))).join('');
 body+='<h3>Действующие ограничения</h3>'+row('Эмбарго',p.embargoes.map(n=>countries[n]?.displayName||n).join(', ')||'Нет');
 if(Object.keys(p.goods).length)body+=Object.entries(p.goods).map(([k,v])=>row(MARITIME_GOODS[k]?.name||k,f(v)+'%')).join('');
 for(const [n,goods]of Object.entries(p.partners))body+=row(countries[n]?.displayName||n,Object.entries(goods).map(([k,v])=>(k==='all'?'Все товары':MARITIME_GOODS[k]?.name)+': '+f(v)+'%').join(' · '));
 body+='<h3>Торговые договоры</h3>';
 for(const a of (m.agreements||[]).filter(a=>a.status==='active'&&[a.a,a.b].includes(owner)))body+=row((a.type==='customs_union'?'Таможенный союз':'Торговый договор')+' · '+(a.a===owner?a.b:a.a),'Взаимная ставка '+f(a.rate)+'% · ещё '+Math.max(0,a.due-gameDayNumber())+' дней')+'<button type="button" onclick="maritimeQueueTradeBreak('+esc(JSON.stringify(a.id))+')">Предложить разрыв договора</button>';
 for(const o of (m.tradeOffers||[]).filter(o=>o.b===owner&&o.status==='open'))body+='<article>'+row('Предложение от '+o.a,(o.type==='customs_union'?'Таможенный союз':'Торговый договор')+' · '+o.rate+'%')+'<button type="button" onclick="maritimeQueueTradeAnswer('+esc(JSON.stringify(o.id))+',true)">Принять условия</button> <button type="button" onclick="maritimeQueueTradeAnswer('+esc(JSON.stringify(o.id))+',false)">Отклонить</button></article>';
 body+='<p>Также можно приказать текстом: ввести или снять эмбарго, предложить взаимное снижение пошлин, заключить таможенный союз с общей внешней ставкой. Чужое согласие не появляется автоматически.</p>';return body;
}
function maritimeSeaHTML(owner){
 const m=maritimeState(),f=economyFmt,esc=economyEscape,row=(a,b)=>'<div class="economy-row"><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>';
 let body='<h3>Флот и порты</h3>'+row('Содержание / месяц',f(maritimeUpkeep(owner))+' млн р.е.')+'<p>Море разделено на районы, которые нельзя присоединить как землю. Флот движется между ними по дням. Напишите цель обычным приказом. Военное ведомство выберет эскадру и маршрут; казна, вместимость и сроки определяют возможное исполнение.</p>';
 const missions={hold:'На позиции',move:'Переход в порт',patrol:'Патруль',escort:'Сопровождение',blockade:'Блокада',land:'Высадка',repair:'Ремонт'};
 for(const fleet of m.fleets.filter(f=>f.owner===owner)){
  body+='<article><h4>'+esc(fleet.name)+'</h4>'+row('Корабли',Object.entries(fleet.ships).map(([k,n])=>MARITIME_SHIPS[k].name+': '+n).join(' · '))+row('Положение',fleet.port?maritimePort(fleet.port)?.name:maritimeGeo().areas[fleet.region]?.name)+row('Задача',missions[fleet.mission]||fleet.mission)+row('Состояние / снабжение',f(fleet.condition)+'% / '+f(fleet.supply)+'%')+
  row('Вместимость транспорта',f(fleet.ships.transport*1500)+' солдат')+row('Войска на борту',f(fleet.cargo.reduce((s,u)=>s+u.troops,0)))+row('Сезонные условия',maritimeWeather(fleet.region)<1?'Зимнее море: переходы медленнее':'Обычные')+
  (fleet.path.length?row('Маршрут',fleet.path.map(id=>maritimeGeo().areas[id]?.name||id).join(' → ')):'')+
  '</article>';
 }
 const ports=m.ports.filter(p=>maritimePortOwner(p)===owner);
 body+='<details><summary>Порты и верфи</summary>'+ports.map(p=>'<article><h4>'+esc(p.name)+'</h4>'+row('Район',maritimeGeo().areas[p.region]?.name)+row('Гавань / верфь',p.level+' / '+p.shipyard)+row('Пропускная способность',f(p.level*180)+' млн р.е. грузов / мес')+row('Эффективность вражеской блокады',f(maritimeBlockade(p)*100)+'%')+'</article>').join('');
 body+='</details>';
 if(!ports.length)body+='<p>У страны нет морского порта. На внутренней территории построить его нельзя.</p>';
 body+='<h3>Строительство</h3>'+m.builds.filter(x=>x.owner===owner&&x.status==='active').map(x=>row(x.type==='ship'?MARITIME_SHIPS[x.shipType].name+' · '+x.count:'Развитие порта','ещё '+Math.max(0,x.due-gameDayNumber())+' дней · '+f(x.cost)+' млн оплачено')).join('');
 body+='<p>Пример приказа: «Заказать в Бресте четыре транспорта», «Выделить лёгкие корабли для сопровождения торговли в Ла-Манше», «Погрузить корпус в порту и доставить к разрешённому берегу». Корабли требуют верфи, денег, экипажей и времени; десант встречает реальное сопротивление.</p>';
 return body;
}
function maritimeQueueTariff(){
 const rate=Number(document.getElementById('maritime-rate').value),target=document.getElementById('maritime-partner').value,good=document.getElementById('maritime-good').value;
 const effect={action:'tariff',rate,good,...(target?{target}:{})};
 try{validateTradePolicy(effect,playerCountry);queueOrder('Установить пошлину '+rate+'% на '+(good==='all'?'все товары':MARITIME_GOODS[good].name.toLowerCase())+(target?' из '+target:''),'trade',{trade_policy:effect});}catch(e){showNotif(e.message);}
}
function maritimeQueueFleet(id,action){
 const port=document.getElementById('sea-destination-'+id)?.value,effect={action,fleet_id:id,port_id:port};
 try{validateNavalOrder(effect,playerCountry);queueOrder(({move:'Перевести флот',blockade:'Блокировать порт',land:'Высадить войска',repair:'Отправить флот на ремонт'})[action]+' · '+(maritimePort(port)?.name||port),'naval',{naval_order:effect});}catch(e){showNotif(e.message);}
}
function maritimeQueueTradeAnswer(id,accept){const effect={action:accept?'accept':'reject',offer_id:id};try{validateTradePolicy(effect,playerCountry);queueOrder((accept?'Принять':'Отклонить')+' торговое предложение','trade',{trade_policy:effect});}catch(e){showNotif(e.message);}}
function maritimeQueueTradeBreak(id){queueOrder('Прекратить торговое соглашение','trade',{trade_policy:{action:'break',agreement_id:id}});}

function maritimeQueueArea(id,action){
 const region=document.getElementById('sea-area-'+id)?.value,effect={action,fleet_id:id,region};
 try{validateNavalOrder(effect,playerCountry);queueOrder((action==='patrol'?'Патрулировать район':'Сопровождать торговлю')+' · '+maritimeGeo().areas[region].name,'naval',{naval_order:effect});}catch(e){showNotif(e.message);}
}

function maritimeRenderRoutes(){
 if(typeof svg==='undefined'||typeof proj==='undefined'||!worldState?.maritime)return;
 const objects=svg.select('#objects-g').node();
 if(!objects?.parentNode)return;
 // Routes share the objects' world container, including its wrapped map copies.
 const layer=d3.select(objects.parentNode);
 let group=layer.select('#maritime-routes');if(group.empty())group=layer.insert('g',()=>objects).attr('id','maritime-routes').attr('pointer-events','none');
 const fleets=maritimeState().fleets.filter(f=>f.owner===playerCountry&&f.path.length);
 const paths=group.selectAll('path').data(fleets,f=>f.id);paths.exit().remove();
 paths.enter().append('path').attr('class','maritime-route').merge(paths).attr('fill','none').attr('stroke','#c9ac6f').attr('stroke-width',.8).attr('vector-effect','non-scaling-stroke').attr('d',f=>{
  const points=[maritimeGeo().areas[f.region].coordinates,...f.path.map(id=>maritimeGeo().areas[id].coordinates)];const p=maritimePort(f.targetPort);if(p)points.push(p.coordinates);
  return d3.geoPath(proj)({type:'LineString',coordinates:points});
 });
}
