/* Public catalogue lookup. No API keys or paid generation requests. */
(() => {
  'use strict';
  const candidates = [
    {label:'GPT-6 Luna',id:'openai/gpt-6-luna'},
    {label:'GLM 5.3 FlashX',id:'z-ai/glm-5.3-flashx'},
    {label:'GLM 5.3',id:'z-ai/glm-5.3'},
    {label:'Sonnet 5.5',id:null},
    {label:'Gemini 3.1 Flash Lite — для сравнения',id:'google/gemini-3.1-flash-lite'}
  ];
  function resolveCandidates(rows) {
    const models=rows.filter(m=>m&&typeof m.id==='string');
    return candidates.map(c=>{
      const matches=c.id?models.filter(m=>m.id===c.id):models.filter(m=>
        m.id.startsWith('anthropic/')&&!/:(free|extended)$/.test(m.id)&&
        (/sonnet[- ]5[.\-]5(?:$|[- :])/i.test(m.id)||/sonnet\s+5\.5(?:$|\s)/i.test(m.name||'')));
      return {...c,model:matches.length===1?matches[0]:null};
    });
  }
  function price(model) {
    const p=model?.pricing;
    const input=Number(p?.prompt),output=Number(p?.completion);
    if(!p||p.prompt==null||p.completion==null||!Number.isFinite(input)||!Number.isFinite(output))return '';
    const fmt=n=>(n*1e6).toLocaleString('ru-RU',{maximumFractionDigits:3});
    return ' · $'+fmt(input)+' / $'+fmt(output)+' за 1 млн';
  }
  window.GSModelPicker={resolveCandidates,price};
  const select=document.getElementById('model-select');
  const custom=document.getElementById('model-custom');
  const status=document.getElementById('model-catalog-status');
  if(!select||!status)return;
  const originalOpen=openModelMenu;
  const originalApply=applyModelChoice;
  let catalog=null,pending=null;
  const current=()=>localStorage.getItem('gs1852_text_model')||'google/gemini-3.1-flash-lite';
  function populate(rows) {
    const manual=custom.value;
    const previous=(select.value==='__custom__'?manual:select.value)||current();
    select.replaceChildren();
    const placeholder=document.createElement('option');
    placeholder.value='';placeholder.textContent='Выберите модель';placeholder.disabled=true;
    select.append(placeholder);
    for(const c of resolveCandidates(rows||[])){
      const option=document.createElement('option');
      option.value=c.model?.id||c.id||'__sonnet_unavailable__';
      option.disabled=!c.model;
      option.textContent=c.label+(c.model?price(c.model):' — не подтверждена каталогом');
      select.append(option);
    }
    const option=document.createElement('option');
    option.value='__custom__';option.textContent='Другой точный ID…';select.append(option);
    const available=[...select.options].some(o=>o.value===previous&&!o.disabled);
    select.value=available?previous:'__custom__';
    custom.value=available?manual:(manual||current());
    sync();
  }
  function sync(){
    custom.hidden=select.value!=='__custom__';
    const hint=document.getElementById('model-selected-id');
    hint.textContent='ID: '+(select.value==='__custom__'?custom.value:select.value);
  }
  select.addEventListener('change',sync);custom.addEventListener('input',sync);
  async function refresh() {
    if(pending)return pending;
    status.textContent='Проверяем каталог OpenRouter…';
    pending=(async()=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch('https://openrouter.ai/api/v1/models',{signal:controller.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();
        if(!Array.isArray(data.data))throw Error('Некорректный каталог');
        catalog=data.data;populate(catalog);
        const missing=resolveCandidates(catalog).filter(c=>!c.model).map(c=>c.label);
        status.textContent=missing.length?'Каталог загружен. Не найдены: '+missing.join(', ')+'.':'Модели и базовые тарифы проверены по каталогу OpenRouter.';
      }catch{
        if(!catalog)populate([]);
        status.textContent=catalog?'Обновить каталог не удалось; показана предыдущая загрузка.':'Каталог недоступен. Можно указать точный ID вручную; он не проверен.';
      }finally{clearTimeout(timeout);pending=null;}
    })();
    return pending;
  }
  window.refreshModelCatalog=refresh;
  openModelMenu=function(){
    if(typeof closePauseMenu==='function')closePauseMenu();
    originalOpen();
    if(catalog)populate(catalog);else populate([]);
    sync();
    refresh();
  };
  applyModelChoice=function(){
    const option=select.selectedOptions[0];
    if(!option||option.disabled){showNotif('Выберите доступную модель или укажите ID');return;}
    if(select.value==='__custom__'&&!/^[a-z0-9.-]+\/[a-zA-Z0-9._:/-]+$/.test(custom.value.trim())){
      showNotif('Укажите точный ID вида provider/model');return;
    }
    originalApply();
  };
})();
