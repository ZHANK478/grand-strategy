'use strict';
let economyTab='overview';
const economyEscape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const economyFmt=v=>Number(v||0).toLocaleString('ru',{maximumFractionDigits:1});
function economySetTab(tab){economyTab=tab;renderEconomyPanel();}
renderEconomyPanel=function(){
 const box=document.getElementById('economy-body'),c=countries[playerCountry];if(!box||!c)return;
 const v=econV3(c),b=econBudget(c),f=economyFmt;
 const row=(a,b)=>'<div class="economy-row"><span>'+economyEscape(a)+'</span><strong>'+economyEscape(b)+'</strong></div>';
 const heading=s=>'<h3>'+economyEscape(s)+'</h3>';
 let body='';
 if(economyTab==='overview'){
  body=heading('Экономика страны')+row('ВВП за год (цены начала партии)',f(c.gdp)+' млн р.е.')+row('ВВП на человека (цены начала партии)',f(c.gdp*1000/c.population)+' р.е.')+
  row('Население',f(c.population/1000)+' млн')+row('Реальный рост производства',f(c.gdpGrowth)+'% / год')+
  row('Рост цен',f(c.inflation)+'% / год')+row('Казна',f(c.treasury)+' млн р.е.')+row('Долг',f(c.debt)+' млн р.е.')+
  row('Доходы бюджета / месяц',f(b.gross)+' млн р.е.')+row('Расходы / месяц',f(b.expense)+' млн р.е.')+row('Баланс / месяц',f(b.net)+' млн р.е.')+
  row('Неоплаченные обязательства',f(v.arrears)+' млн р.е.')+
  '<p>ВВП — производство всей страны. Доходы бюджета — только государственные поступления. Баланс показывает, сколько государство сохраняет или теряет. Все суммы сопоставимы в расчётной валюте сценария; это игровые оценки.</p>'+
  heading('Что влияет на рост')+Object.entries(v.drivers).map(([k,x])=>row(({productivity:'Квалификация и производительность',investment:'Инвестиции',labor:'Рабочая сила',infrastructure:'Инфраструктура',capital:'Производственный капитал',employment:'Занятость',disruption:'Война, мобилизация, сбои',coordination:'Управление производством'})[k],f(x)+' п.п.')).join('');
 }else if(economyTab==='budget'){
  body=heading('Месячный бюджет при текущей политике')+row('Собираемость налогов',f(v.collection*100)+'%')+heading('Поступления')+
   b.lines.income.map(l=>row(l.name,f(l.value)+' млн')).join('')+heading('Расходы')+b.lines.expense.map(l=>row(l.name,f(l.value)+' млн')).join('')+
   row('Баланс',f(b.net)+' млн / мес')+row('Проценты внутреннего долга',f(b.annualRateDomestic)+'% / год')+
   '<p>Дефицит сначала расходует казну. Без разрешённого финансирования возникают задолженности по выплатам и сбои работы государства.</p>'+
   row('Автоматические займы',v.policy.automaticBorrowing?'Разрешены':'Выключены')+row('Денежное финансирование',v.policy.monetaryFinancing?'Разрешено':'Выключено')+
   heading('За текущий календарный месяц')+row('Поступило',f(v.monthly.gross)+' млн')+row('Обязательства',f(v.monthly.expense)+' млн')+row('Не оплачено',f(v.monthly.unpaid)+' млн');
 }else if(economyTab==='people'){
  body=heading('Население и уровень жизни')+row('Население',f(c.population/1000)+' млн')+row('Трудоспособная рабочая сила',f(c.population*v.workforceShare/1000)+' млн')+
   row('Рождений',f(v.births)+' на 1000 / год')+row('Базовая смертность',f(v.deaths)+' на 1000 / год')+
   row('Чистая миграция',f(v.migration)+' на 1000 / год')+row('Грамотность',f(c.society.literacy)+'%')+
   '<p>Сумма групп — всё население. Доход после налогов и выплат указан на человека за год в ценах начала партии. Церковь и парламент — институты, а не дополнительные группы населения.</p>'+
   Object.values(c.economy.classes).map(g=>'<article>'+heading(g.label)+row('Население',f(g.population/1e6)+' млн · '+f(g.share)+'%')+
    row('Доля национального дохода',f(g.incomeShare*100)+'%')+row('Налог',f(g.tax)+'%')+row('В бюджет за месяц',f(g.taxPaid)+' млн')+
    row('Реальный доход на человека',f(g.realIncome||g.annualPerPerson)+' р.е. / год')+row('Поддержка',f(g.loyalty)+'/100')+'</article>').join('');
 }else{
  body=heading('Производство и собственность')+Object.entries(v.sectors).map(([k,s])=>'<article>'+heading(({agriculture:'Сельское хозяйство',industry:'Промышленность',resources:'Добыча',services:'Услуги и торговля'})[k])+
   row('Выпуск за год',f(s.output)+' млн')+row('Доля государства',f(s.stateShare*100)+'%')+row('Производственный капитал',f(s.capital)+' млн')+'</article>').join('')+
   row('Координация',({market:'Рыночная',regulated:'Регулируемая',planned:'Плановая'})[v.policy.coordination])+row('Управленческая способность',f(v.capacity)+'/100')+
   '<p>Приказывайте текстом: национализировать отрасль, изменить координацию, снизить налог группе вдвое или увеличить расходы постепенно. Передача собственности сама по себе не увеличивает ВВП. Компенсация требует денег; конфискация вызывает сопротивление.</p>'+
   heading('Действующие программы')+(v.programs.filter(p=>p.status==='active').map(p=>row(({ownership:'Передача собственности',tax:'Налоговая реформа',spending:'Изменение расходов',coordination:'Перестройка управления'})[p.kind],f(p.elapsed/p.days*100)+'% · ещё '+(p.days-p.elapsed)+' дн.')).join('')||'<p>Программ нет.</p>');
 }
 box.innerHTML='<nav class="economy-tabs">'+Object.entries({overview:'Обзор',budget:'Бюджет',people:'Население',production:'Производство'}).map(([key,label])=>'<button type="button" class="'+(economyTab===key?'active':'')+'" onclick="economySetTab(\''+key+'\')">'+label+'</button>').join('')+'</nav>'+body;
};
const economyOldStats=renderPlayerStats;
renderPlayerStats=function(...args){const c=countries[playerCountry];if(c){econV3(c);c.income=econMonthlyRevenue(c).gross;}const result=economyOldStats(...args);
 if(c){const b=econBudget(c);const inc=document.getElementById('income'),cash=document.getElementById('treasury');if(inc)inc.title='Поступления '+economyFmt(b.gross)+' млн р.е./мес. Баланс '+economyFmt(b.net)+' млн р.е./мес.';if(cash)cash.title=economyFmt(c.treasury)+' млн р.е.';let el=document.getElementById('economy-hud-extra');if(!el){el=document.createElement('button');el.id='economy-hud-extra';el.type='button';el.onclick=()=>openEconomyPanel();document.getElementById('mobile-economy-strip')?.appendChild(el);}
 el.textContent=(c.population/1000).toFixed(1)+' млн · '+Math.round(c.gdp*1000/c.population).toLocaleString('ru')+' р.е./чел';
 el.title='Население и годовой ВВП на человека. Открыть экономику';}
 return result;
};
