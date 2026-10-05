/* Typed order plans. This file has no network or DOM dependencies. */
(function(root){
'use strict';
const KIND_FIELDS={
 tax:['economy'],spending:['society'],law:['law_slots','laws','institutions'],
 power:['government','ruler_name','ruler_age','ruler_title','pm_name','pm_title','parliament'],
 army:['army_delta','map_objects'],map:['map_objects'],finance:['debt_delta'],
 diplomacy:['relations','treaties','war_declared','peace_made','province_transfer'],
 identity:['country_name','country_color'],statement:['statement'],administration:['initiatives'],political:['political_task'],unsupported:[]
};
const LEADERS=['ruler_name','ruler_age','ruler_title','government','pm_name','pm_title'];
const WORLD_FIELDS=['stability_delta','relations','relations_between','other_countries','battles',
 'wars_between','foreign_leader_change',...LEADERS,'map_objects','war_declared','parliament'];
const INVALID_FICTION=/инопланет|пришельц|телепорт|машин[аы] времени|alien invasion|extraterrestrial/i;
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const check=(condition,message)=>{if(!condition)throw Error(message);};
const clean=o=>Object.fromEntries(Object.entries(o).filter(([k,v])=>v!=null));
function keys(o,allowed){check(plain(o),'Ожидался объект');Object.keys(o).forEach(k=>check(allowed.includes(k),'Неизвестное поле: '+k));}
function text(v,max=600){check(typeof v==='string'&&v.trim().length>0&&v.length<=max,'Некорректный текст');check(!INVALID_FICTION.test(v),'Сценарий не допускает фантастические события');}
function number(v,min,max){check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,'Число за пределами правил');}
function list(v,max=30){check(Array.isArray(v)&&v.length<=max,'Некорректный список');}
function leader(e){LEADERS.forEach(k=>{if(e[k]!=null){if(k==='ruler_age')number(e[k],0,110);else text(e[k],180);}});}
function validateEffects(raw,ctx,scope,kind){
 keys(raw,scope==='world'?WORLD_FIELDS:(KIND_FIELDS[kind]||[]));
 const e=clean(raw),mine=ctx.countries[ctx.player];
 if(e.political_task){check(typeof ctx.validatePoliticalTask==='function','Нет политического исполнителя');ctx.validatePoliticalTask(e.political_task,ctx.player);}
 if(e.initiatives){
  list(e.initiatives,6);const ids=new Set();
  e.initiatives.forEach(i=>{
   keys(i,['action','id','kind','name','mandate','executor','target_country','duration_days','monthly_budget','setup_cost']);
   check(['create','update','close'].includes(i.action),'Неизвестное действие с поручением');text(i.id,100);check(!ids.has(i.id),'Повторный ID поручения');ids.add(i.id);
   const existing=(ctx.initiatives||[]).find(x=>x.id===i.id);
   if(i.action==='create'){
    check(!existing,'Поручение уже существует');
    check(['organization','mission','assignment','programme'].includes(i.kind),'Неизвестный вид поручения');
    text(i.name,150);text(i.mandate,1200);text(i.executor,180);
    number(i.duration_days,1,3650);check(Number.isInteger(i.duration_days),'Срок поручения должен быть целым');
   }else {check(existing?.country===ctx.player,'Нет своего поручения с этим ID');if(i.action==='update')check(existing.status!=='closed','Закрытое дело нужно учредить заново');}
   if(i.action==='close')check(Object.keys(i).every(k=>['action','id'].includes(k)),'Закрытие не меняет другие параметры');
   if(i.action==='update'){
    if(i.name!=null)text(i.name,150);if(i.mandate!=null)text(i.mandate,1200);if(i.executor!=null)text(i.executor,180);
    check(i.kind==null,'Вид существующего поручения не меняется');
    if(i.duration_days!=null){number(i.duration_days,1,3650);check(Number.isInteger(i.duration_days),'Нужен целый срок');}
   }
   if(i.target_country!=null){text(i.target_country,180);check(i.target_country!==ctx.player&&Object.hasOwn(ctx.countries,i.target_country)&&!ctx.countries[i.target_country].annexed,'Неизвестный адресат миссии');}
   if(i.kind==='mission')check(i.target_country,'Миссии нужен адресат');
   if(i.monthly_budget!=null)number(i.monthly_budget,0,Math.max(1,mine.income*.25));
   if(i.setup_cost!=null)number(i.setup_cost,0,Math.max(1,mine.income));
   if(i.action==='create')(ctx.initiatives||(ctx.initiatives=[])).push({...i,country:ctx.player,status:'active'});
   if(i.action==='close')existing.status='closed';
  });
 }
 ['economy','society','law_slots','institutions','parliament','relations','other_countries','country_color'].forEach(k=>{if(e[k]!=null)check(plain(e[k]),'Неверный объект: '+k);});
 ['laws','treaties','relations_between','wars_between','battles','foreign_leader_change','province_transfer','map_objects','war_declared','peace_made'].forEach(k=>{if(e[k]!=null)list(e[k],30);});
 const country=n=>{text(n,180);check(Object.hasOwn(ctx.countries,n)&&!ctx.countries[n].annexed,'Неизвестная или аннексированная страна: '+n);};
 const pair=(a,b)=>{country(a);country(b);check(a!==b,'Страна не может действовать против себя');};
 if(e.stability_delta!=null)number(e.stability_delta,-10,10);
 if(e.army_delta!=null){number(e.army_delta,-mine.army,Math.max(mine.army,mine.population*1000));check(Number.isInteger(e.army_delta),'Нужна целая численность');}
 if(e.debt_delta!=null)number(e.debt_delta,-mine.debt,Math.max(100,mine.income*12));
 if(e.statement!=null)text(e.statement,600);
 leader(e);
 if(e.government!=null&&ctx.governments)check(ctx.governments.includes(e.government),'Неподдерживаемая форма правления');
 if(e.country_name!=null)text(e.country_name,100);
 if(e.country_color){keys(e.country_color,['country','color']);check(e.country_color.country===ctx.player,'Можно менять только свою страну');check(/^#[a-f0-9]{6}$/i.test(e.country_color.color),'Некорректный цвет');}
 if(e.economy){keys(e.economy,['tax_noble','tax_burgher','tax_commons']);e.economy=clean(e.economy);Object.values(e.economy).forEach(v=>number(v,0,100));}
 if(e.society){keys(e.society,['education_spending','welfare_spending','infrastructure_spending']);e.society=clean(e.society);Object.values(e.society).forEach(v=>number(v,0,Math.max(0,Math.round(mine.income*.25))));}
 if(e.law_slots){keys(e.law_slots,Object.keys(ctx.lawSlots));e.law_slots=clean(e.law_slots);Object.entries(e.law_slots).forEach(([s,v])=>check(ctx.lawOption(s,v),'Нет такого варианта закона'));}
 if(e.laws){list(e.laws,5);e.laws.forEach(l=>{keys(l,['action','name','description']);check(['enact','repeal'].includes(l.action),'Неверное действие с законом');text(l.name,120);if(l.description!=null)text(l.description,500);});}
 if(e.institutions){keys(e.institutions,['church']);check(['abolish','restore'].includes(e.institutions.church),'Неверное действие с церковью');}
 if(e.parliament){
  keys(e.parliament,scope==='world'?['support_delta','factions','veto']:['dissolve','restore','ban_party','veto']);
  const p=clean(e.parliament);
  if(p.support_delta!=null)number(p.support_delta,-10,10);
  ['dissolve','restore'].forEach(k=>{if(p[k]!=null)check(typeof p[k]==='boolean','Неверное действие с парламентом');});
  check(!(p.dissolve&&p.restore),'Нельзя одновременно распустить и созвать парламент');
  if(p.ban_party!=null)text(p.ban_party,100);
  if(p.veto!=null){text(p.veto,300);if(scope==='world')check(mine.parliament&&(mine.parliament.power??50)>=50&&mine.parliament.support<50,'Нет оснований для парламентского вето');}
  if(p.factions){check(mine.electionPending,'Нет назначенных выборов');list(p.factions,12);let sum=0;p.factions.forEach(f=>{keys(f,['name','pct']);text(f.name,100);number(f.pct,0,100);sum+=f.pct;});check(Math.abs(sum-100)<.01,'Доли фракций должны дать 100%');}
  e.parliament=p;
 }
 if(e.relations){keys(e.relations,Object.keys(ctx.countries).filter(n=>n!==ctx.player));Object.entries(e.relations).forEach(([n,v])=>{country(n);number(v,-40,20);});}
 if(e.relations_between){list(e.relations_between);e.relations_between.forEach(r=>{keys(r,['a','b','delta']);pair(r.a,r.b);check(r.a!==ctx.player&&r.b!==ctx.player,'Используйте relations');number(r.delta,-20,20);});}
 if(e.other_countries){keys(e.other_countries,Object.keys(ctx.countries).filter(n=>n!==ctx.player));Object.entries(e.other_countries).forEach(([n,d])=>{country(n);keys(d,['stability_delta']);Object.values(d).forEach(v=>number(v,-10,10));});}
 if(e.treaties){list(e.treaties,5);e.treaties.forEach(t=>{keys(t,['action','type','a','b']);pair(t.a,t.b);check(['sign','break'].includes(t.action)&&['alliance','nonaggression'].includes(t.type),'Неверный договор');check(t.a===ctx.player||t.b===ctx.player,'Договор должен касаться своей страны');if(t.action==='sign')check(!ctx.atWar(t.a,t.b),'Сначала требуется прекращение войны');});}
 ['war_declared','peace_made'].forEach(k=>{if(e[k]){list(e[k],5);e[k].forEach(n=>pair(ctx.player,n));}});
 if(e.wars_between){list(e.wars_between,5);e.wars_between.forEach(w=>{keys(w,['a','b','status']);pair(w.a,w.b);check(w.a!==ctx.player&&w.b!==ctx.player,'Используйте war_declared');check(['start','end'].includes(w.status),'Неверный статус войны');});}
 if(e.battles){list(e.battles,8);e.battles.forEach(b=>{keys(b,['a','b','scale','location']);pair(b.a,b.b);check(ctx.atWar(b.a,b.b),'Сражение возможно только в войне');check(['skirmish','battle','decisive'].includes(b.scale),'Неверный масштаб боя');if(b.location!=null){text(b.location,180);check(ctx.location(b.location),'Неизвестное место боя');}});}
 if(e.foreign_leader_change){list(e.foreign_leader_change,8);e.foreign_leader_change.forEach(l=>{keys(l,['country',...LEADERS]);country(l.country);check(l.country!==ctx.player,'Используйте верхние поля');check(ctx.countries[l.country].pendingSuccession||ctx.countries[l.country].pendingCoup,'Смена власти не подтверждена движком');leader(l);});}
 if(scope==='world'&&LEADERS.some(k=>e[k]!=null))check(mine.pendingSuccession||mine.pendingCoup,'Смена власти игрока не подтверждена движком');
 if(e.province_transfer){list(e.province_transfer,8);e.province_transfer.forEach(t=>{keys(t,['province','new_owner']);country(t.new_owner);text(t.province,180);check(ctx.provinceOwner(t.province)===ctx.player,'Нельзя уступить чужую провинцию');});}
 if(e.map_objects){list(e.map_objects,20);e.map_objects.forEach(o=>{
  keys(o,['action','id','type','owner','label','troops','location','to','expires_in_months']);check(['create','update','move','remove'].includes(o.action),'Неверное действие с объектом');
  if(o.id!=null)text(o.id,100);if(o.label!=null)text(o.label,180);
  if(o.expires_in_months!=null){number(o.expires_in_months,1,120);check(Number.isInteger(o.expires_in_months)&&o.action!=='remove','Неверный срок объекта');}
  if(o.troops!=null){number(o.troops,0,1000000);check(Number.isInteger(o.troops),'Нужна целая численность');}
  if(o.action==='create'){
   check(o.id&&!ctx.objects.some(x=>x.id===o.id),'Нужен уникальный ID объекта');
   check(['army','hq','naval','diplomat','other'].includes(o.type),'Неизвестный тип объекта');
   country(o.owner);text(o.location,180);check(ctx.location(o.location),'Неизвестное место объекта');
   if(scope==='order')check(o.owner===ctx.player,'Нельзя создать чужой объект');
   if(o.type==='army')check(o.troops>0,'Отряду нужны солдаты');
   ctx.objects.push({...o});
  }else{
   check(o.id,'Нужен ID объекта');const obj=ctx.objects.find(x=>x.id===o.id);check(obj,'Объект не найден');
   if(scope==='order')check(obj.owner===ctx.player,'Нельзя управлять чужим объектом');
   if(o.action==='move'){text(o.to,180);check(ctx.location(o.to),'Неизвестная цель перемещения');}
   if(o.action==='remove')ctx.objects=ctx.objects.filter(x=>x.id!==o.id);
  }
 });}
 return e;
}
function validatePlan(plan,pending,ctx){
 keys(plan,['news','domestic','orders','world_effects','actor_intents']);
 if(plan.actor_intents!=null){list(plan.actor_intents,6);const actors=ctx.actors||{};const seenActors=new Set();plan.actor_intents.forEach(p=>{keys(p,['actor_id','action','motive']);text(p.actor_id,240);check(Object.hasOwn(actors,p.actor_id)&&!seenActors.has(p.actor_id),'Неизвестный или повторный участник');seenActors.add(p.actor_id);check(['support','petition','obstruct','protest','recruit','social_spending','offer_talks','denounce'].includes(p.action),'Неизвестное действие участника');text(p.motive,300);});}
 ['news','domestic'].forEach(k=>{list(plan[k],k==='news'?5:3);plan[k].forEach(s=>text(s,1000));});
 list(plan.orders,8);check(plan.orders.length===pending.length,'ИИ не отчитался по каждому приказу');
 const seen=new Set();
 const orders=plan.orders.map(o=>{
  keys(o,['id','kind','status','reason','effects','process']);text(o.id,100);
  check(pending.some(x=>x.id===o.id)&&!seen.has(o.id),'Неизвестный или повторный приказ');seen.add(o.id);
  check(Object.hasOwn(KIND_FIELDS,o.kind),'Неизвестный тип приказа');
  check(['execute','reject','defer'].includes(o.status),'Неверный статус приказа');text(o.reason,600);
  const original=pending.find(x=>x.id===o.id),effects=validateEffects(o.effects,ctx,'order',o.kind);
  if(o.status!=='execute')check(Object.keys(effects).length===0,'Отклонённый приказ не может менять мир');
  if(o.status==='execute')check(o.kind!=='unsupported'&&Object.keys(effects).length>0,'Нет исполняемого действия');
  if(original.fixedEffects&&o.status==='execute')check(JSON.stringify(effects)===JSON.stringify(original.fixedEffects),'ИИ изменил готовую карточку');
  let process;
  if(o.process!=null){
   check(!['administration','political'].includes(o.kind),'Поручение уже содержит собственный срок');
   keys(o.process,['mode','days','summary']);
   check(o.status==='execute','Процесс возможен только для принятого действия');
   check(['implementation','referendum','recruitment'].includes(o.process.mode),'Неизвестный процесс');
   number(o.process.days,1,3650);check(Number.isInteger(o.process.days),'Срок должен быть целым');
   text(o.process.summary,300);
   if(o.process.mode==='referendum')check(o.kind==='power','Голосование относится к устройству власти');
   if(o.process.mode==='recruitment')check(o.kind==='army'&&effects.army_delta>0&&Object.keys(effects).length===1,'Набор требует отдельного процесса');
   process={...o.process};
  }
  return {...o,effects,...(process?{process}:{})};
 });
 return {...plan,orders,world_effects:validateEffects(plan.world_effects,ctx,'world')};
}
function powerChance(c){
 const p=c.parliament,power=p?.power??0;
 const security=c.army>0?(c.militarySupport??60):15;
 return Math.max(.05,Math.min(.9,(c.stability*.4+security*.25+(p?.support??70)*.2+(100-power)*.15-power*.2)/100));
}
function authority(order,c,random=Math.random){
 const e=order.effects,p=c.parliament;
 if(order.status!=='execute')return {status:order.status==='reject'?'rejected':'deferred',reason:order.reason};
 if(e.parliament?.veto)return {status:'blocked',reason:'Парламент заблокировал решение: '+e.parliament.veto};
 if(['tax','spending','law'].includes(order.kind)&&p&&(p.power??50)>=50&&p.support<50)return {status:'blocked',reason:'Нужна поддержка парламента: '+p.support+'/100; власть парламента '+p.power+'/100.'};
 if(order.kind==='power'){
  const controversial=!!e.government||!!e.parliament?.dissolve||!!e.parliament?.ban_party;
  if(controversial){
   if(c.stability<25)return {status:'blocked',reason:'Режим слишком неустойчив для концентрации власти.'};
   const chance=powerChance(c);
   if(random()>=chance)return {status:'failed',reason:'Попытка концентрации власти сорвана; стабильность −5.',penalty:5,chance};
   return {status:'executed',reason:order.reason+' Политическая попытка удалась.',chance};
  }
  if(p&&(p.power??50)>=50&&p.support<50)return {status:'blocked',reason:'Парламент не поддержал назначение.'};
 }
 return {status:'executed',reason:order.reason};
}
root.OrderRules={KIND_FIELDS,WORLD_FIELDS,validatePlan,validateEffects,authority,powerChance,INVALID_FICTION};
})(globalThis);
