import {readFileSync} from 'node:fs';
const map=readFileSync('economy-map.js','utf8'),html=readFileSync('economy-world.html','utf8'),startup=readFileSync('core-loop-startup.js','utf8');

let checks=0;function check(value,message){if(!value)throw Error(message);checks++;}
const payload=html.match(/<script type="application\/json" id="gs-builtin-world-data">([\s\S]*?)<\/script>/)[1];
const data=JSON.parse(payload);check(data.provinces.length===672,'complete embedded world');
check(!payload.includes('<'),'safe JSON embedding');
new Function(map);new Function(startup);
const loader=map.slice(map.indexOf('function loadScenarioData(ref)'),map.indexOf('async function switchActiveScenario'));
let calls=0,cleared=0;
const load=new Function('document','d3','BUILTIN_SCENARIOS','AbortController','setTimeout','clearTimeout','idbGetScenario','scenarioDataKey','localStorage',loader+';return loadScenarioData;');
const make=(embedded)=>load({getElementById:()=>embedded?{textContent:payload}:null},{json:async()=>{calls++;return data;}},{'builtin-world':{file:'scenario_orders1852.json'}},class{signal={};abort(){}},()=>1,()=>cleared++,async()=>data,x=>x,{getItem:()=>null});
check((await make(true)('builtin-world')).provinces.length===672,'embedded load');
check(calls===0,'no second network request');check(cleared===1,'timeout cleared');
await make(false)('builtin-world');check(calls===1,'legacy network fallback');
await make(false)('custom');check(calls===1,'custom IndexedDB preserved');
const ids={};for(const id of ['game-loading-screen','game-loading-fill','game-loading-message','game-loading-retry','game-loading-default','map-load-status','map-load-retry','map-load-default','mobile-country-picker','mobile-start-btn']){
 ids[id]={hidden:false,style:{},value:'',disabled:false,textContent:'',classList:{remove(){},add(){},toggle(){}},setAttribute(){},replaceChildren(){}};
}
let timers=[],microtasks=[],events={};
const win={GS_MAP_LOAD:{status:'loading'},addEventListener:(n,f)=>events[n]=f};
new Function('window','document','setTimeout','clearTimeout','queueMicrotask','Option',startup)(win,{getElementById:id=>ids[id]},f=>{timers.push(f);return timers.length;},()=>{},f=>microtasks.push(f),function(){});
check(!ids['game-loading-screen'].hidden,'initial screen covers map');
check(ids['mobile-start-btn'].disabled,'cannot start before readiness');
win.GS_MAP_LOAD={status:'rendering'};events['gs:scenario-status']();
check(ids['game-loading-fill'].style.width==='70%','render stage progress');
win.GS_MAP_LOAD={status:'ready'};events['gs:scenario-status']();
check(!ids['game-loading-screen'].hidden,'screen stays until ready fade');
ids['mobile-country-picker'].value='France';microtasks.pop()();
check(!ids['mobile-start-btn'].disabled,'selected country can start after listeners');
timers.pop()();check(ids['game-loading-screen'].hidden,'ready hides loading screen');
win.GS_MAP_LOAD={status:'error',message:'test'};events['gs:scenario-status']();
check(!ids['game-loading-screen'].hidden,'error covers map');
check(!ids['game-loading-retry'].hidden&&!ids['game-loading-default'].hidden,'recovery buttons');
win.GS_MAP_LOAD={status:'ready'};events['gs:scenario-status']();const old=timers.pop();
win.GS_MAP_LOAD={status:'loading'};events['gs:scenario-status']();old();
check(!ids['game-loading-screen'].hidden,'stale ready cannot hide new load');
const bootstrap=map.slice(map.indexOf('function startInitialScenario'),map.indexOf('// ============================================================',map.indexOf('function startInitialScenario')));
let begin=0,domReady;new Function('document','switchActiveScenario','activeScenarioRef',bootstrap)({readyState:'loading',addEventListener:(n,f)=>domReady=f},()=>{begin++;return Promise.resolve();},'builtin-world');
check(begin===0,'wait for game scripts');domReady();check(begin===1,'start after DOMContentLoaded');
console.log(checks+' startup checks passed');
