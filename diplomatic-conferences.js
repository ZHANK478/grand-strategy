/* Player-chaired conferences. Only an explicit grant makes one model call. */
'use strict';
let activeConferenceId=null;
function conferenceStore(){return worldState.diplomaticConferences||={rooms:[],version:1};}
function conferenceRoom(){return conferenceStore().rooms.find(r=>r.id===activeConferenceId)||null;}
function conferenceOpen(target){
 strategyCountry(target);strategyAssert(target!==playerCountry,'Выберите другую страну');
 const store=conferenceStore();
 let r=store.rooms.findLast(x=>x.participants.length===2&&x.participants.includes(target)&&x.participants.includes(playerCountry));
 if(!r){r={id:crypto.randomUUID(),participants:[playerCountry,target],messages:(diplomacyHistories[target]||[]).map(m=>({speaker:m.role==='player'?playerCountry:target,text:m.text,day:gameDayNumber()})),requests:[],round:0,spoken:{},createdDay:gameDayNumber()};store.rooms.push(r);}
 activeConferenceId=r.id;return r;
}
function conferenceInvite(target){
 if(turnRunning||diplomacyPending.size)throw Error('Дождитесь завершения текущего действия');
 const r=conferenceRoom();strategyAssert(r,'Нет открытой конференции');strategyCountry(target);
 strategyAssert(!r.participants.includes(target),'Участник уже присутствует');
 strategyAssert(r.participants.length<8,'На конференции может быть до восьми стран');
 const newParticipants=[...r.participants,target];
 // Preserve the original bilateral conversation; conference has a separate history.
 let next=conferenceStore().rooms.findLast(x=>JSON.stringify(x.participants.slice().sort())===JSON.stringify(newParticipants.slice().sort()));
 if(!next){next={id:crypto.randomUUID(),participants:newParticipants,messages:r.messages.map(m=>({...m})),requests:[],round:r.round,spoken:{},createdDay:gameDayNumber()};conferenceStore().rooms.push(next);}
 activeConferenceId=next.id;
 next.messages.push({speaker:playerCountry,text:'К переговорам приглашена страна: '+(countries[target].displayName||target)+'.',day:gameDayNumber(),notice:true});
 conferenceRequest(next,target,'Приглашение к обсуждению повестки');
 saveGame();renderDiplomacyMessages();return next;
}
function conferenceRequest(r,id,reason){
 if(id===playerCountry||!r.participants.includes(id)||countries[id]?.annexed||r.spoken[id]===r.round||r.requests.some(q=>q.country===id&&q.round===r.round))return;
 r.requests.push({country:id,reason,round:r.round});
}
function conferencePost(text){
 const r=conferenceRoom();strategyAssert(r,'Нет открытой конференции');
 strategyAssert(!turnRunning&&!diplomacyPending.size,'Дождитесь завершения действия');
 strategyText(text,2000);r.round++;r.requests=[];r.spoken={};
 r.messages.push({speaker:playerCountry,text,day:gameDayNumber()});
 r.messages=r.messages.slice(-100);
 for(const id of r.participants.filter(n=>n!==playerCountry)){conferenceRequest(r,id,'Новая повестка: '+text.slice(0,100));policyNotice(playerCountry,id,text,'conference');}
 saveGame();renderDiplomacyMessages();return r;
}
async function conferenceGrant(id){
 const r=conferenceRoom();strategyAssert(r,'Нет открытой конференции');
 strategyAssert(!turnRunning&&!diplomacyPending.size,'Участник уже выступает');
 const q=r.requests.find(q=>q.country===id&&q.round===r.round);strategyAssert(q,'Страна не запросила слово');strategyCountry(id);
 const roomId=r.id,round=r.round,key='conference:'+roomId;diplomacyPending.add(key);renderDiplomacyMessages();
 try{
  const raw=await askGemini('CONFERENCE_CABINET_V1\nТы представляешь '+id+' ('+countries[id].ruler+'). Игрок предоставил тебе слово на дипломатической конференции. Отвечай только за свою страну, 80–140 слов живой дипломатической речи, с конкретными интересами, условиями и возражениями. Не говори за остальных. Не заключай договор от имени всех участников. Не меняй отношения за тон автоматически: выбери осмысленное политическое действие. Договор требует существующего предложения и отдельного согласия адресата. Если предлагаешь договор, используй pursue/task.kind:diplomacy с action:offer. accept/reject только существующий offer_id. Речь без decision допустима. Если действие не исполнено, оно не становится фактом.\n'+
   'Верни JSON {speech:"выступление",decision:null либо {goal,action:"wait|pursue|negotiate|warn|condemn|offer_alliance|offer_nonaggression|offer_peace|accept|reject_offer",target:"ID участника",motive,headline,body,task:{goal,executor,days:0,cost:0,result,headline,body,kind:"diplomacy",effects:{diplomatic_action:{action:"offer|accept|reject",target,offer_id,type:"alliance|nonaggression|peace|dependency",terms:{days,militaryAid,offensive,access,tribute,autonomy,payment,payer,subject,provinces}}}}}}. Не включай необязательные поля.\n'+
   (typeof maritimeState==='function'?'Для торгового договора или таможенного союза допустим pursue/task.kind:trade с effects:{trade_policy:{action:"offer|accept|reject",target:"ID участника",type:"trade|customs_union",rate:0..100,external_rate:0..100 для союза,days:срок,offer_id:"при ответе"}}. Это только предложение или ответ по существующему предложению, не навязанное чужое согласие.\n':'')+
   'Состояние твоего кабинета: '+JSON.stringify({interests:policyInterest(id),goals:policyCabinet(id).goals,memory:policyCabinet(id).memory.slice(-5),offers:strategyState().offers.filter(o=>o.status==='open'&&r.participants.includes(o.a)&&r.participants.includes(o.b)),participants:r.participants.map(policyPublicFacts),history:r.messages.slice(-14).map(m=>({speaker:m.speaker,text:m.text}))}),1600,0,{response_format:{type:'json_object'},reasoning_effort:'low'});
  const reply=parseOrderReply(raw);politicalKeys(reply,['speech','decision']);politicalText(reply.speech,2600);
  if(!conferenceStore().rooms.includes(r)||r.id!==roomId||r.round!==round)throw Error('Конференция изменилась во время ответа');
  if(reply.decision){
   const d=reply.decision;d.actor_id=id+'::government';if(d.task&&!Object.keys(d.task).length)delete d.task;
   const target=d.target||d.task?.target||d.task?.effects?.diplomatic_action?.target||d.task?.effects?.trade_policy?.target;
   const da=d.task?.effects?.diplomatic_action,tp=d.task?.effects?.trade_policy;
   const offerParties=da?.offer_id?strategyState().offers.find(o=>o.id===da.offer_id):tp?.offer_id&&typeof maritimeState==='function'?maritimeState().tradeOffers?.find(o=>o.id===tp.offer_id):null;
   const affected=[d.target,d.task?.target,da?.target,da?.terms?.payer,da?.terms?.subject,tp?.target,offerParties?.a,offerParties?.b].filter(Boolean);
   strategyAssert(affected.every(n=>r.participants.includes(n)),'Действие касается страны вне конференции');
   strategyAssert(['wait','pursue','negotiate','warn','condemn','offer_alliance','offer_nonaggression','offer_peace','accept','reject_offer'].includes(d.action),'Неподходящее действие на конференции');
   if(d.action==='pursue'){const operation=d.task?.kind==='diplomacy'?d.task.effects?.diplomatic_action:d.task?.kind==='trade'&&typeof maritimeState==='function'?d.task.effects?.trade_policy:null;strategyAssert(operation,'В конференции исполняются дипломатические и торговые предложения');strategyAssert(['offer','accept','reject'].includes(operation.action),'Неподходящий дипломатический шаг');}
   validatePoliticalDecision(d);
   const actor=ensureWorldActors()[id+'::government'],previous=actor.lastPoliticalTurn;actor.lastPoliticalTurn=null;
   const snapshot=JSON.parse(JSON.stringify({countries,worldState}));
   let applied;try{applied=executePoliticalDecision(d,[]);}catch(error){({countries,worldState}=snapshot);throw error;}finally{const liveActor=worldState.actors?.[id+'::government'];if(liveActor)liveActor.lastPoliticalTurn=previous;}
   if(!applied&&d.action!=='wait')throw Error('Предложенное действие не исполнено; выступление не опубликовано как состоявшийся результат.');
   policyRemember(id,'Конференция: '+reply.speech);
   if(target&&applied)policyNotice(id,target,reply.speech,'conference');
  }else policyRemember(id,'Конференция: '+reply.speech);
  r.messages.push({speaker:id,text:reply.speech,day:gameDayNumber()});r.messages=r.messages.slice(-100);r.spoken[id]=round;
  r.requests=r.requests.filter(x=>x.country!==id);
  worldState.diploLog.push('Конференция: '+id+' — '+reply.speech.slice(0,250));worldState.diploLog=worldState.diploLog.slice(-15);
  if(r.participants.length===2)diplomacyHistories[id]=r.messages.filter(m=>!m.notice).map(m=>({role:m.speaker===playerCountry?'player':id,text:m.text}));
  return reply.speech;
 }catch(error){showNotif('Выступление не получено: '+error.message+' Запрос слова сохранён.');return null;}
 finally{diplomacyPending.delete(key);saveGame();if(activeConferenceId===roomId)renderDiplomacyMessages();}
}
function conferenceAccept(offerId){
 if(turnRunning||diplomacyPending.size)return;
 const o=strategyState().offers.find(o=>o.id===offerId&&o.b===playerCountry&&o.status==='open');
 if(!o)return;
 try{const result=executeDiplomaticAction(playerCountry,{action:'accept',target:o.a,offer_id:o.id});const r=conferenceRoom();r.messages.push({speaker:playerCountry,text:'Принято предложение страны '+o.a+': '+strategyTermsText(o.terms)+'. '+result,day:gameDayNumber(),notice:true});policyNotice(playerCountry,o.a,'Предложение принято: '+strategyTermsText(o.terms),'agreement');saveGame();renderDiplomacyMessages();renderPlayerStats();}
 catch(error){showNotif(error.message);}
}
function conferenceAcceptTrade(offerId){
 if(turnRunning||diplomacyPending.size||typeof maritimeState!=='function')return;
 const r=conferenceRoom(),o=maritimeState().tradeOffers?.find(o=>o.id===offerId&&o.b===playerCountry&&o.status==='open');
 if(!r||!o||!r.participants.includes(o.a))return;
 try{const result=applyCountryPoliticalEffects(playerCountry,'trade',{trade_policy:{action:'accept',offer_id:o.id}});if(result.status!=='executed')throw Error(result.reason);
  r.messages.push({speaker:playerCountry,text:'Принято торговое предложение '+o.a+': взаимная ставка '+o.rate+'%'+(o.type==='customs_union'?', внешняя ставка '+o.externalRate+'%':'')+'.',day:gameDayNumber(),notice:true});saveGame();renderDiplomacyMessages();renderPlayerStats();
 }catch(error){showNotif(error.message);}
}
const conferenceOldSelect=selectCountry;
selectCountry=function(name){conferenceOpen(name);const result=conferenceOldSelect(name);renderDiplomacyMessages();return result;};
const conferenceOldRender=renderDiplomacyMessages;
renderDiplomacyMessages=function(){
 const r=conferenceRoom();if(!r){conferenceOldRender();return;}
 const chat=document.getElementById('diplo-chat');
 let controls=document.getElementById('conference-controls');
 if(!controls){controls=document.createElement('div');controls.id='conference-controls';controls.className='conference-controls';chat.prepend(controls);}
 controls.replaceChildren();
 const participants=document.createElement('div');participants.className='conference-participants';participants.textContent=r.participants.map(n=>countries[n]?.displayName||n).join(' · ');controls.append(participants);
 document.getElementById('diplo-target').textContent=r.participants.length>2?'Дипломатическая конференция':countries[r.participants[1]]?.displayName||r.participants[1];
 const picker=document.createElement('select');picker.setAttribute('aria-label','Пригласить страну');
 const empty=document.createElement('option');empty.value='';empty.textContent='Добавить страну…';picker.append(empty);
 policyLive().filter(n=>!r.participants.includes(n)).sort().forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=countries[n].displayName||n;picker.append(o);});
 picker.disabled=turnRunning||diplomacyPending.size>0||r.participants.length>=8;
 picker.onchange=()=>{if(!picker.value)return;try{conferenceInvite(picker.value);}catch(error){showNotif(error.message);}};controls.append(picker);
 const meetings=conferenceStore().rooms.filter(x=>x.participants.length>2&&x.participants.includes(playerCountry));
 if(meetings.length){const resume=document.createElement('select');resume.setAttribute('aria-label','Открыть сохранённую конференцию');const blank=document.createElement('option');blank.textContent='Сохранённые конференции…';blank.value='';resume.append(blank);
 meetings.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.participants.filter(n=>n!==playerCountry).join(' · ');resume.append(o);});resume.disabled=diplomacyPending.size>0;resume.onchange=()=>{if(resume.value){activeConferenceId=resume.value;renderDiplomacyMessages();}};controls.append(resume);}
 const note=document.createElement('small');note.textContent='Страны выступают по очереди. «Дать слово» вызывает один ответ ИИ.';controls.append(note);
 for(const q of r.requests){const row=document.createElement('div');row.className='conference-request';const label=document.createElement('span');label.textContent=q.country+' просит слово · '+q.reason;
 const grant=document.createElement('button');grant.textContent='Дать слово';grant.disabled=turnRunning||diplomacyPending.size>0;grant.onclick=()=>conferenceGrant(q.country).catch(e=>showNotif(e.message));row.append(label,grant);controls.append(row);}
 for(const o of strategyState().offers.filter(o=>o.b===playerCountry&&o.status==='open'&&r.participants.includes(o.a))){const row=document.createElement('div');row.className='conference-request';const label=document.createElement('span');label.textContent=o.a+': '+o.type+' · '+strategyTermsText(o.terms);const accept=document.createElement('button');accept.textContent='Принять договор';accept.disabled=turnRunning||diplomacyPending.size>0;accept.onclick=()=>conferenceAccept(o.id);row.append(label,accept);controls.append(row);}
 if(typeof maritimeState==='function')for(const o of (maritimeState().tradeOffers||[]).filter(o=>o.b===playerCountry&&o.status==='open'&&r.participants.includes(o.a))){const row=document.createElement('div');row.className='conference-request';const label=document.createElement('span');label.textContent=o.a+': '+(o.type==='customs_union'?'Таможенный союз':'Торговый договор')+' · '+o.rate+'%';const accept=document.createElement('button');accept.textContent='Принять торговые условия';accept.disabled=turnRunning||diplomacyPending.size>0;accept.onclick=()=>conferenceAcceptTrade(o.id);row.append(label,accept);controls.append(row);}
 const box=document.getElementById('diplo-messages');box.replaceChildren();
 r.messages.forEach(m=>{const div=document.createElement('div');div.className='diplo-msg '+(m.speaker===playerCountry?'france':'ai');if(r.participants.length>2){const name=document.createElement('strong');name.textContent=(countries[m.speaker]?.displayName||m.speaker)+' · ';div.append(name);}const text=document.createElement('span');text.textContent=m.text;div.append(text);box.append(div);});
 if(diplomacyPending.has('conference:'+r.id)){const line=document.createElement('p');line.textContent='Делегат готовит выступление…';box.append(line);}
 box.scrollTop=box.scrollHeight;
};
sendDiploMessage=async function(){
 if(turnRunning||diplomacyPending.size){showNotif('Дождитесь завершения действия');return;}
 const input=document.getElementById('diplo-input'),text=input.value.trim();if(!text)return;
 try{const r=conferencePost(text);input.value='';if(r.participants.length===2)await conferenceGrant(r.participants.find(n=>n!==playerCountry));}catch(error){showNotif(error.message);}
};
const conferenceOldLoad=loadGameSlot;
loadGameSlot=async function(...args){activeConferenceId=null;return conferenceOldLoad(...args);};
const conferenceOldReset=resetGame;
resetGame=function(...args){activeConferenceId=null;return conferenceOldReset(...args);};
