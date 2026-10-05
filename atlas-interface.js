/* Composed historical documents. No model calls and no game-state mutation. */
(()=>{
 'use strict';
 const portraits=[
  {names:['Луи-Наполеон Бонапарт','Наполеон III','Луи Наполеон Бонапарт'],file:'napoleon.webp',credit:'Дагерротип, 1851 · BnF'},
  {names:['Николай I','Николай I Романов'],file:'nicholas.webp',credit:'Франц Крюгер, 1852 · Эрмитаж'},
  {names:['Фридрих Вильгельм IV','Фридрих-Вильгельм IV'],file:'frederick.webp',credit:'Франц Крюгер · XIX век'},
  {names:['Виктория','Королева Виктория'],file:'victoria.webp',credit:'Ф. К. Винтерхальтер, 1843'},
  {names:['Франц Иосиф I','Франц-Иосиф I','Франц Иосиф'],file:'franz.webp',credit:'Миклош Барабаш, 1853'}
 ];
 const normalized=value=>String(value||'').toLowerCase().replace(/[–—-]/g,' ').replace(/\s+/g,' ').trim();
 let foreign=null,scheduled=0;
 const ns='http://www.w3.org/2000/svg';
 function svg(tag,attrs,parent){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);parent?.append(n);return n;}
 function text(el,value){if(el&&el.textContent!==value)el.textContent=value;}
 function initials(name){return String(name||'').split(/[\s-]+/).filter(x=>x.length>2).slice(0,2).map(x=>x[0]).join('')||'—';}
 function catalog(img,placeholder,person,generated){
  if(!img||!placeholder)return;
  const source=generated||portraits.find(p=>p.names.some(n=>normalized(n)===normalized(person)));
  const url=typeof source==='string'?source:source?'assets/atlas/'+source.file:null;
  if(url){
   if(img.getAttribute('src')!==url)img.setAttribute('src',url);
   if(img.hidden)img.hidden=false;if(img.style.display!=='block')img.style.display='block';
   if(!placeholder.hidden)placeholder.hidden=true;if(placeholder.style.display!=='none')placeholder.style.display='none';
   const title=typeof source==='object'?source.credit:'Портрет персонажа';
   if(img.title!==title)img.title=title;
   img.dataset.atlasCatalog=typeof source==='object'?'true':'false';
  }else{
   if(img.dataset.atlasCatalog==='true'){img.removeAttribute('src');img.dataset.atlasCatalog='false';}
   if(!img.hidden)img.hidden=true;if(img.style.display!=='none')img.style.display='none';
   if(placeholder.hidden)placeholder.hidden=false;if(placeholder.style.display!=='flex')placeholder.style.display='flex';
   placeholder.classList.add('atlas-monogram');text(placeholder,initials(person));
   const label=person&&person!=='—'?'Портрет '+person+' пока не добавлен':'Должность не занята';
   if(placeholder.getAttribute('aria-label')!==label)placeholder.setAttribute('aria-label',label);
  }
 }
 function ownCountry(){
  const panel=document.getElementById('left-panel');
  if(!panel.dataset.atlasComposed){
   panel.dataset.atlasComposed='true';
   const heading=document.createElement('div');heading.className='atlas-country-heading';
   const flag=document.createElement('img');flag.id='atlas-country-flag';flag.alt='';
   heading.append(flag,document.getElementById('country-name-badge'));
   const gov=document.getElementById('govbadge-text');panel.insertBefore(heading,panel.querySelector('.mobile-own-portrait'));panel.insertBefore(gov,heading.nextSibling);
   const block=panel.querySelector('.mobile-own-portrait'),caption=block.nextElementSibling;
   const person=document.createElement('div');person.className='atlas-person';panel.insertBefore(person,block);person.append(block,caption);
   document.getElementById('pm').classList.add('atlas-person');
   const facts=document.createElement('div');facts.className='atlas-country-facts';facts.innerHTML='<div><small>Население</small><strong id="atlas-pop">—</strong></div><div><small>ВВП</small><strong id="atlas-gdp">—</strong></div>';
   panel.insertBefore(facts,person.nextSibling);
  }
  const c=countries[playerCountry];if(!c)return;
  text(document.getElementById('country-name-badge'),c.displayName||playerCountryDisplayName||playerCountry);
  text(document.getElementById('govbadge-text'),c.government||'');
  const flag=document.getElementById('atlas-country-flag'),source=c.flagUrl||mobileFlagSource(playerCountry,year);
  if(source&&flag.getAttribute('src')!==source)flag.src=source;flag.hidden=!source;
  catalog(document.getElementById('ruler-portrait'),document.getElementById('ruler-portrait-emoji'),c.ruler,c.portrait);
  catalog(document.getElementById('pm-portrait'),document.getElementById('pm-portrait-emoji'),c.pm,c.pmPortrait);
  const pm=document.getElementById('pm');pm.classList.toggle('atlas-no-pm',!c.pm||c.pm==='—');
  text(document.getElementById('atlas-pop'),typeof c.population==='number'?new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(c.population/1000)+' млн':c.pop||'—');
  text(document.getElementById('atlas-gdp'),typeof c.gdp==='number'?new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(c.gdp/1000)+' млрд':c.gdp||'—');
  text(document.getElementById('portrait-gen-btn'),'Изменить портрет');
  text(document.getElementById('pm-portrait-gen-btn'),'Изменить портрет');
 }
 function foreignCountry(){
  const c=countries[foreign],detail=document.getElementById('mobile-card-details');
  if(!c||!detail||document.getElementById('mobile-country-card').hidden)return;
  const blocks=[...detail.children].filter(n=>n.classList.contains('mobile-person-portrait'));
  for(const [i,block]of blocks.entries()){
   const fact=block.nextElementSibling,person=document.createElement('div');person.className='atlas-person';
   const words=document.createElement('div');words.className='atlas-person-text';
   block.before(person);person.append(block,words);if(fact)words.append(fact);
   const b=block.querySelector('button');if(b)words.append(b);
   person.dataset.atlasRole=i===0?'ruler':'pm';
  }
  for(const person of detail.querySelectorAll('.atlas-person')){
   const pm=person.dataset.atlasRole==='pm',block=person.querySelector('.mobile-person-portrait');
   catalog(block.querySelector('img'),block.querySelector('.mobile-portrait-placeholder'),pm?c.pm:c.ruler,pm?c.pmPortrait:c.portrait);
   person.classList.toggle('atlas-no-pm',pm&&(!c.pm||c.pm==='—'));
   const b=person.querySelector('button');if(b&&b.textContent==='Сгенерировать портрет')text(b,'Изменить портрет');
  }
 }
 function decorateNews(){
  const paper=document.getElementById('events-box'),mast=paper.querySelector('.newspaper-masthead');
  if(!mast.dataset.atlasComposed){
   mast.dataset.atlasComposed='true';
   const date=document.getElementById('newspaper-date');mast.replaceChildren(document.createTextNode('Вестник держав'),date);
   const label=document.createElement('div');label.className='atlas-edition-line';label.textContent='ПОЛИТИКА · ОБЩЕСТВО · МЕЖДУНАРОДНЫЕ ДЕЛА';mast.before(label);
   const mark=svg('svg',{viewBox:'0 0 100 44',class:'atlas-press-mark','aria-hidden':'true'});
   svg('circle',{cx:50,cy:21,r:14,fill:'none',stroke:'currentColor','stroke-width':.8},mark);
   svg('ellipse',{cx:50,cy:21,rx:6,ry:14,fill:'none',stroke:'currentColor','stroke-width':.6},mark);
   svg('path',{d:'M36 21h28 M39 12h22 M39 30h22 M5 37q23 6 32-10 M95 37Q72 43 63 27 M12 35l-4-8 M18 36l-3-12 M25 33l0-12 M30 30l3-10 M88 35l4-8 M82 36l3-12 M75 33l0-12 M70 30l-3-10',fill:'none',stroke:'currentColor','stroke-width':.8},mark);
   label.before(mark);
   const header=paper.querySelector('.events-hdr');
   const expand=document.createElement('button');expand.className='atlas-reader-toggle';expand.type='button';expand.textContent='Развернуть';expand.setAttribute('aria-expanded','false');
   expand.onclick=()=>{const open=paper.classList.toggle('atlas-reading');expand.textContent=open?'Свернуть':'Развернуть';expand.setAttribute('aria-expanded',String(open));};header.insertBefore(expand,header.querySelector('.xbtn'));
   const foreignHeading=paper.querySelector('.newspaper-section'),domesticHeading=[...paper.querySelectorAll('.events-hdr')].find(n=>n!==header);
   domesticHeading.classList.add('atlas-domestic-heading');text(domesticHeading,'В стране');
   const domestic=document.getElementById('domestic-list'),external=document.getElementById('events-list');
   mast.after(domesticHeading);domesticHeading.after(domestic);domestic.after(foreignHeading);foreignHeading.after(external);
  }
  for(const list of [document.getElementById('domestic-list'),document.getElementById('events-list')]){
   [...list.querySelectorAll('.newspaper-article')].forEach((a,i)=>a.classList.toggle('atlas-lead',i===0));
  }
  const brief=document.getElementById('newspaper-brief');
  if(brief&&!document.getElementById('atlas-brief')){
   const fold=document.createElement('details');fold.id='atlas-brief';const summary=document.createElement('summary');summary.textContent='Сводка исполнения и показателей';fold.append(summary,brief);paper.append(fold);
  }else if(brief&&brief.parentElement.id!=='atlas-brief')document.getElementById('atlas-brief')?.append(brief);
 }
 function controls(){
  for(const el of document.querySelectorAll('.cbtn,.abtn,.editor-btn,.load-close-btn,.map-mode-btn,.pause-box h3,.settings-box h3,.load-box h3,.pop-hdr>span:first-child,.actions-hdr>span:first-child,.changes-hdr>span:first-child,.adv-msg,.diplo-msg')){
   for(const child of el.childNodes)if(child.nodeType===Node.TEXT_NODE){const value=child.nodeValue.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+/u,'');if(value&&value!==child.nodeValue)child.nodeValue=value;}
  }
  const title=document.querySelector('#actions-panel .actions-hdr>span:first-child');text(title,'Распоряжения');
  const kicker=document.getElementById('atlas-order-date');if(kicker)text(kicker,dateLabel());
 }
 function compose(){
  ownCountry();foreignCountry();decorateNews();controls();document.documentElement.classList.toggle('atlas-scenario-ready',window.GS_MAP_LOAD?.status==='ready');
  window.AtlasInterface.ready=true;
 }
 function schedule(){if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;compose();});}
 const start=document.querySelector('.mobile-start');
 const content=document.createElement('div');content.className='atlas-menu-content';
 content.append(...[...start.childNodes]);
 const art=document.createElement('div');art.className='atlas-menu-art';
 const image=document.createElement('img');image.src='assets/atlas/europe1852.webp';image.alt='Карта Европы Виктора Левассёра, 1852';
 const credit=document.createElement('small');credit.textContent='Европа, 1852 · Виктор Левассёр';
 art.append(image,credit);start.append(art,content);
 text(start.querySelector('h1'),'Grand Strategy');
 const description=document.createElement('p');description.className='atlas-start-description';description.textContent='Решения принадлежат вам. История отвечает.';
 start.querySelector('h1').after(description);
 const version=document.createElement('a');version.id='atlas-version-link';version.href='atlas-about.html';version.textContent='Об оформлении и источниках';document.body.append(version);
 const orderDate=document.createElement('p');orderDate.id='atlas-order-date';orderDate.className='atlas-document-kicker';document.querySelector('.actions-body').prepend(orderDate);
 const frame=document.createElement('div');frame.id='atlas-map-frame';frame.setAttribute('aria-hidden','true');document.getElementById('map-wrap').append(frame);
 const compass=document.createElement('div');compass.id='atlas-compass';compass.setAttribute('aria-hidden','true');
 compass.innerHTML='<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="26" fill="none" stroke="currentColor" stroke-width=".6"/><circle cx="40" cy="40" r="23" fill="none" stroke="currentColor" stroke-width=".4"/><path d="M40 9L45 35L71 40L45 45L40 71L35 45L9 40L35 35Z" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M40 9V40L45 35ZM40 71V40L35 45ZM9 40H40L35 35ZM71 40H40L45 45Z" fill="currentColor"/><path d="M22 22L40 40L58 58M58 22L40 40L22 58" stroke="currentColor" stroke-width=".4"/><text x="40" y="6" font-size="7" fill="currentColor" text-anchor="middle">С</text></svg><small>АТЛАС ДЕРЖАВ</small>';
 document.getElementById('map-wrap').append(compass);
 window.AtlasInterface={ready:false,refresh:compose};
 const oldCard=window.mobileCountryCard;window.mobileCountryCard=function(name){foreign=name;const r=oldCard(name);compose();return r;};openCountryRelations=window.mobileCountryCard;
 const oldRefresh=window.mobileRefreshCountry;window.mobileRefreshCountry=function(...args){const r=oldRefresh?.(...args);compose();return r;};
 const oldPower=renderPlayerPowerPanel;renderPlayerPowerPanel=function(...args){const r=oldPower(...args);compose();return r;};
 const oldNews=renderNewspaper;renderNewspaper=function(...args){const r=oldNews(...args);decorateNews();const edition=args[0];if(edition?.from===edition?.to)text(document.getElementById('newspaper-date'),edition.to);return r;};
 const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 window.addEventListener('gs:scenario-status',schedule);
 document.fonts.ready.then(()=>{if(typeof updateLabels==='function')updateLabels();AtlasView.refresh();});
 compose();
})();
