/* Experimental AI access: optional account/guest server or an owner's own key.
   Added keys are kept in memory only and never logged or saved. */
(() => {
 'use strict';
 let ready=null,directKey='',running=false,connection={mode:'offline',message:'Проверяем подключение ИИ…'};
 const badge=document.getElementById('mobile-turn-balance');
 const note=document.getElementById('mobile-guest-note');
 const status=document.getElementById('test-ai-status');
 const guestModel='google/gemini-3.1-flash-lite';
 let guestModels=[guestModel],guestRemaining=null,imageRemaining=0;
 window.GS_GUEST_TURN_ID=null;
 function render(){
  const labels={direct:'OpenRouter · свой ключ',account:'ИИ · аккаунт',guest:'Гость · серверный ИИ',offline:'ИИ не подключён'};
  if(badge)badge.textContent=labels[connection.mode];
  if(note)note.textContent=connection.mode==='offline'?'ИИ не подключён · откройте «Подключение ИИ».':connection.message;
  if(status)status.textContent=connection.message;
  const images=document.getElementById('test-image-remaining');
  if(images)images.textContent=connection.mode==='guest'?'Портретов осталось: '+imageRemaining+'. Без кода изображения гостям недоступны.':connection.mode==='direct'?'Изображения оплачиваются с вашего OpenRouter-ключа.':'Код изображений предназначен для гостевого подключения без регистрации.';
  const remaining=document.getElementById('test-hud-remaining');
  if(remaining){
   const value=connection.mode==='guest'?guestRemaining:connection.mode==='account'?gsProfile?.turns_balance:null;
   remaining.hidden=typeof value!=='number';
   remaining.textContent=typeof value==='number'?'Осталось '+value:'';
  }
 }
 function set(mode,message){connection={mode,message};render();}
 function errorMessage(code,http){
  const messages={
   server_no_key:'На сервере не настроен OpenRouter-ключ.',
   guest_setup_required:'Гостевые таблицы или функции Supabase ещё не настроены.',
   guest_required:'Сессия не гостевая. Повторите подключение.',
   no_auth:'Сессия входа недоступна. Повторите подключение или используйте свой ключ.',
   bad_auth:'Сессия входа истекла. Войдите снова.',
   premium_required:'Для аккаунта генерация изображений требует соответствующего доступа.',
   image_code_required:'Гостевые изображения доступны только по коду. Откройте «Подключение ИИ» и активируйте код изображений.',
   bad_image_code:'Код изображений неверен, просрочен или уже закреплён за другим гостем.',
   image_rate_limit:'Можно сделать до 10 попыток генерации изображения в час.',
   portrait_trial_used:'Пробная генерация портрета уже использована.',
   portrait_trial_busy:'Портрет уже генерируется. Дождитесь результата.',
   bad_tester_code:'Код неверен или уже активирован другим гостем.',
   no_turns:'Серверный баланс ходов исчерпан.',
   request_limit:'Лимит гостевых запросов исчерпан.',
   model_not_allowed:'Выбранная модель не разрешена гостевым сервером. Повторите подключение.',
   turn_required:'Для этого запроса нужен зарезервированный гостевой ход.',
   server_error:'Ошибка серверной функции.',
   ai_unavailable:'Сервер не получил ответ от OpenRouter.',
   quota_unavailable:'Не удалось проверить гостевую квоту.',
   reserve_failed:'Не удалось зарезервировать гостевой ход.'
  };
  if(messages[code])return messages[code];
  if(http===404)return 'Функция ИИ не развёрнута по настроенному адресу Supabase.';
  if(http===401||http===403)return 'Сервер отклонил авторизацию. Проверьте вход и настройку функции.';
  if(http===429)return 'Провайдер ограничил частоту запросов. Попробуйте позже.';
  if(http>=500)return 'Сервер ИИ временно недоступен.';
  return 'Не удалось подключиться к ИИ'+(http?' (HTTP '+http+')':'')+'.';
 }
 async function serverRequest(path,body){
  const token=await authToken();
  if(!token)throw Error(errorMessage('no_auth'));
  const response=await fetch(window.GS_CONFIG.API_BASE+'/'+path,{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,apikey:window.GS_CONFIG.SUPABASE_ANON_KEY},
   body:JSON.stringify(body)
  });
  let data;try{data=await response.json();}catch{throw Error(errorMessage('',response.status));}
  if(!response.ok||data.error){
   const code=typeof data.error==='string'?data.error:'';
   throw Error(errorMessage(code,response.status));
  }
  if(Array.isArray(data.guest_models))guestModels=data.guest_models.filter(model=>typeof model==='string');
  if(typeof data.model==='string'){
   const used=document.getElementById('test-ai-used-model');if(used)used.textContent='Последний ответ: '+data.model;
  }
  if(typeof data.guest_turns_remaining==='number'&&connection.mode==='guest'){
   guestRemaining=data.guest_turns_remaining;
   connection.message='Гость · осталось '+data.guest_turns_remaining+' ходов. Доступно моделей: '+guestModels.length+'.';render();
  }
  if(typeof data.image_generations_remaining==='number'){imageRemaining=data.image_generations_remaining;render();}
  if(typeof data.turns_balance==='number'&&gsProfile)gsProfile.turns_balance=data.turns_balance;
  return data;
 }
 function accept(session){
  gsAccessToken=session?.access_token||null;
  gsUser=session?.user?{id:session.user.id,email:session.user.email,isAnonymous:!!session.user.is_anonymous}:null;
  if(!gsUser)gsProfile=null;
 }
 initAuth=function(){
  if(directKey)return Promise.resolve(true);
  if(ready)return ready;
  ready=(async()=>{
   if(!backendOn()||!window.supabase)throw Error('Серверное подключение недоступно. Можно использовать свой OpenRouter-ключ.');
   if(!sb){
    sb=window.supabase.createClient(window.GS_CONFIG.SUPABASE_URL,window.GS_CONFIG.SUPABASE_ANON_KEY,{
     auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
    });
    sb.auth.onAuthStateChange((event,session)=>{
     accept(session);
     // Do not call Supabase methods while its auth callback holds the lock.
     if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>{
      ready=null;if(!directKey)initAuth();
     },0);
    });
   }
   const {data,error}=await sb.auth.getSession();
   if(error)throw Error('Не удалось восстановить сессию Supabase. Повторите подключение.');
   let session=data?.session;
   if(!session){
    const result=await sb.auth.signInAnonymously();
    if(result.error)throw Error('Гостевой вход Supabase недоступен. Проверьте Anonymous Sign-ins; для теста доступен свой OpenRouter-ключ.');
    session=result.data.session;
   }
   accept(session);
   if(directKey)return true;
   if(!gsUser)throw Error('Supabase не вернул сессию.');
   if(!gsUser.isAnonymous){
    set('account','Подключён аккаунт. Выбранная модель передаётся серверу ИИ.');
    setTimeout(()=>loadProfile().then(render).catch(()=>{}),0);
   }else{
    set('guest','Проверяем гостевой сервер…');
    await serverRequest('guest-ai',{operation:'status'});
   }
   hideLoginOverlay();return true;
  })().catch(error=>{if(directKey)return true;set('offline',error instanceof TypeError?'Сеть не отвечает. Повторите подключение или используйте свой ключ.':error.message);return false;});
  return ready;
 };
 renderAccountBar=render;
 renderMenuAuth=function(){};
 openShop=()=>showNotif('Серверный баланс ходов исчерпан. Для собственного теста доступен свой OpenRouter-ключ.');
 turnsLeft=()=>connection.mode==='guest'?(guestRemaining??0):connection.mode==='direct'?Infinity:(gsProfile?.turns_balance??0);
 window.testRedeemTesterCode=async()=>{
  if(running||turnRunning){showNotif('Дождитесь завершения хода');return;}
  if(!await initAuth()||connection.mode!=='guest'){showNotif('Код доступен при гостевом серверном подключении.');return;}
  const field=document.getElementById('test-tester-code'),button=document.getElementById('test-tester-redeem');
  button.disabled=true;
  try{
   await serverRequest('guest-ai',{operation:'redeem_tester',code:field.value.trim()});
   field.value='';showNotif('Тестовые ходы активированы.');
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 };
 window.testRedeemImageCode=async()=>{
  if(running||turnRunning||typeof portraitGenerating!=='undefined'&&portraitGenerating){showNotif('Дождитесь завершения запроса');return;}
  if(!await initAuth()||connection.mode!=='guest'){showNotif('Код изображений активируется в гостевой сессии без регистрации.');return;}
  const field=document.getElementById('test-image-code'),button=document.getElementById('test-image-redeem');
  button.disabled=true;
  try{await serverRequest('guest-ai',{operation:'redeem_images',code:field.value.trim()});field.value='';showNotif('Лимит портретов активирован: '+imageRemaining+'.');}
  catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 };
 window.testOpenAIConnection=function(){
  closePauseMenu();closeModelMenu();
  document.getElementById('test-ai-connection').style.display='flex';render();
 };
 window.testCloseAIConnection=()=>{document.getElementById('test-ai-connection').style.display='none';};
 window.testResumeAIConnection=()=>{if(directKey)return;ready=null;initAuth();};
 window.testRetryAIConnection=async()=>{
  if(running||turnRunning){showNotif('Дождитесь завершения хода');return;}
  directKey='';ready=null;set('offline','Повторяем подключение…');
  await initAuth();
 };
 window.testUseOpenRouterKey=async()=>{
  if(running||turnRunning){showNotif('Дождитесь завершения хода');return;}
  const field=document.getElementById('test-ai-key'),button=document.getElementById('test-ai-key-connect');
  const key=(field.value||'').trim();
  if(!/^sk-or-[A-Za-z0-9_-]+$/.test(key)){status.textContent='Введите OpenRouter-ключ в поле. Не отправляйте его в чат.';return;}
  button.disabled=true;status.textContent='Проверяем ключ без запроса генерации…';
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('https://openrouter.ai/api/v1/auth/key',{headers:{Authorization:'Bearer '+key},signal:controller.signal});
   if(!response.ok)throw Error(response.status===401?'OpenRouter отклонил ключ. Проверьте, что он действующий.':errorMessage('',response.status));
   const data=await response.json();
   if(!data||!data.data)throw Error('OpenRouter не подтвердил ключ.');
   directKey=key;field.value='';ready=null;
   set('direct','Ключ подтверждён OpenRouter. Выбранная модель будет использоваться напрямую; генерация ещё не проверена.');
   showNotif('OpenRouter подключён. Теперь можно выполнить ход.');
  }catch(error){status.textContent=error.name==='AbortError'?'Проверка ключа не ответила. Попробуйте ещё раз.':error instanceof TypeError?'Не удалось связаться с OpenRouter. Проверьте сеть.':error.message;}
  finally{clearTimeout(timer);button.disabled=false;}
 };
 window.testDisconnectOpenRouterKey=()=>{
  if(running||turnRunning){showNotif('Дождитесь завершения хода');return;}
  directKey='';document.getElementById('test-ai-key').value='';ready=null;initAuth();
 };
 window.testLoginAIAccount=async()=>{
  await initAuth();
  if(!sb){status.textContent='Supabase SDK не загрузился. Обновите страницу.';return;}
  testCloseAIConnection();openLogin();
 };
 function textContent(message){
  if(typeof message?.content==='string')return message.content;
  if(Array.isArray(message?.content))return message.content.filter(x=>x.type==='text').map(x=>x.text||'').join('\n');
  return '';
 }
 async function directRequest(body){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  try{
   const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+directKey},
    body:JSON.stringify(body),signal:controller.signal
   });
   const data=await response.json();
   if(!response.ok||data.error){
    if(response.status===402)throw Error('На OpenRouter недостаточно средств для этого запроса.');
    if(response.status===400||response.status===404)throw Error('OpenRouter отклонил выбранную модель или параметры. Проверьте точный ID в меню.');
    if(response.status===401)throw Error('OpenRouter отклонил ключ. Переподключите его в меню.');
    throw Error(errorMessage('',response.status));
   }
   if(typeof data.model==='string'){
    const used=document.getElementById('test-ai-used-model');
    if(used)used.textContent='Последний ответ: '+data.model;
   }
   return data;
  }catch(error){
   if(error.name==='AbortError')throw Error('Ответ ИИ не пришёл вовремя. Ход не завершён.');
   if(error instanceof TypeError)throw Error('Не удалось связаться с ИИ. Проверьте сеть.');
   throw error;
  }finally{clearTimeout(timer);}
 }
 async function request(kind,payload){
  if(!await initAuth())throw Error(connection.message);
  if(connection.mode==='direct'){
   const {cost,...providerPayload}=payload;
   return directRequest(providerPayload);
  }
  if(connection.mode==='guest'){
   if(kind==='image')return serverRequest('guest-ai',{operation:'image',model:'google/gemini-3.1-flash-image',messages:payload.messages});
   if(!guestModels.includes(payload.model))throw Error('Модель '+payload.model+' пока не разрешена гостевым сервером. Нужна настройка Supabase; ключ остаётся на сервере.');
   return serverRequest('guest-ai',{...payload,cost:window.GS_GUEST_TURN_ID?payload.cost:0,operation:'generate',turn_id:window.GS_GUEST_TURN_ID});
  }
  return serverRequest('ai',{kind,...payload});
 }
 // All text paths use this request; errors during a turn abort it before effects are applied.
 askGemini=async function(prompt,maxTokens=400,cost=1,options={}){
  try{
   const data=await request('text',{model:MODEL,messages:[{role:'user',content:prompt}],max_tokens:maxTokens,temperature:0.75,cost,...options});
   const text=textContent(data.choices?.[0]?.message);
   if(!text.trim())throw Error('ИИ не вернул текст. Возможно, лимит ответа ушёл на рассуждения.');
   return text;
  }catch(error){
   if(turnRunning)throw error;
   showNotif(error.message);
   return 'ИИ недоступен: '+error.message;
  }
 };
 askGeminiImage=async function(prompt){
  try{
   const data=await request('image',{model:IMAGE_MODEL,messages:[{role:'user',content:prompt}],modalities:['image','text']});
   const url=data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
   if(!url)throw Error('ИИ не вернул изображение.');
   return url;
  }catch(error){showNotif(error.message);return null;}
 };
 window.testEnsureAIForTurn=async(options={})=>{
  if(!await initAuth()){testOpenAIConnection();showNotif(connection.message);return false;}
  if(connection.mode==='guest'){
   if(options.retry&&worldState.aiTurnId&&worldState.aiTurnUser===gsUser?.id){window.GS_GUEST_TURN_ID=worldState.aiTurnId;return true;}
   if(!guestModels.includes(MODEL)){testOpenAIConnection();showNotif('Выбранная модель пока не разрешена гостевым сервером.');return false;}
   try{
    const data=await serverRequest('guest-ai',{operation:'begin_turn',request_id:crypto.randomUUID()});
    window.GS_GUEST_TURN_ID=data.turn_id;worldState.aiTurnId=data.turn_id;worldState.aiTurnUser=gsUser?.id;
   }catch(error){set('offline',error.message);testOpenAIConnection();return false;}
  }
  return true;
 };
 const originalNextTurn=nextTurn;
 nextTurn=async function(kind){
  if(running||turnRunning)return;
  if(window.ordersCanStartTurn&&!window.ordersCanStartTurn()){showNotif('Дождитесь дипломатического ответа');return;}
  running=true;const button=document.querySelector('.next-btn');button.disabled=true;
  try{
   if(!await testEnsureAIForTurn())return;
   mobileSection('map');return await originalNextTurn(kind);
  }finally{running=false;button.disabled=false;button.textContent='Следующий ход ▶';}
 };
 // Settings must stay stable while the active request is using the selected route.
 const originalSetModel=setTextModel;
 setTextModel=function(model){if(running||turnRunning){showNotif('Дождитесь завершения хода');return;}originalSetModel(model);};
 render();initMenu();initSkipSelect();initAuth();
})();
