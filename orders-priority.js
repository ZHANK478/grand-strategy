/* Scenario-independent political attention: economic weight, geography and actual involvement. */
'use strict';
let politicalGeoCache=null;
function politicalGeography(){
 const provinces=typeof scenarioProvinces==='undefined'?[]:scenarioProvinces;
 const signature=provinces.map(p=>p.id+':'+(provinceOwners[p.id]||p.owner)).join('|');
 if(politicalGeoCache?.signature===signature)return politicalGeoCache;
 const ownersByVertex=new Map(),points={},neighbors={};
 const walk=(coordinates,owner)=>{
  if(!Array.isArray(coordinates))return;
  if(typeof coordinates[0]==='number'){
   const [lon,lat]=coordinates;if(!Number.isFinite(lon)||!Number.isFinite(lat))return;
   const key=lon.toFixed(4)+','+lat.toFixed(4);
   if(!ownersByVertex.has(key))ownersByVertex.set(key,new Set());ownersByVertex.get(key).add(owner);
   (points[owner]||(points[owner]=[])).push([lon,lat]);return;
  }
  coordinates.forEach(v=>walk(v,owner));
 };
 provinces.forEach(p=>{const owner=provinceOwners[p.id]||p.owner;if(countries[owner]&&!countries[owner].annexed)walk(p.geometry?.coordinates,owner);});
 const shared={};
 ownersByVertex.forEach(owners=>{const list=[...owners];list.forEach((a,i)=>list.slice(i+1).forEach(b=>{const key=[a,b].sort().join('␟');shared[key]=(shared[key]||0)+1;}));});
 Object.entries(shared).filter(([,count])=>count>=2).forEach(([key])=>{const [a,b]=key.split('␟');(neighbors[a]||(neighbors[a]=new Set())).add(b);(neighbors[b]||(neighbors[b]=new Set())).add(a);});
 // Representative boundary points limit pair calculations; shared-border detection used every vertex.
 Object.keys(points).forEach(n=>{const v=points[n],step=Math.max(1,Math.ceil(v.length/40));points[n]=v.filter((_,i)=>i%step===0);});
 return politicalGeoCache={signature,points,neighbors,distances:new Map()};
}
function politicalDistance(a,b,geo=politicalGeography()){
 const key=[a,b].sort().join('␟');if(geo.distances.has(key))return geo.distances.get(key);
 if(geo.neighbors[a]?.has(b)){geo.distances.set(key,0);return 0;}
 const ap=geo.points[a]||[],bp=geo.points[b]||[];
 let minimum=999;
 ap.forEach(([x,y])=>bp.forEach(([u,v])=>{const longitude=Math.min(Math.abs(x-u),360-Math.abs(x-u));minimum=Math.min(minimum,Math.hypot(longitude*Math.cos((y+v)*Math.PI/360),y-v));}));
 if(!ap.length||!bp.length)minimum=countryDistance(a,b);
 geo.distances.set(key,minimum);return minimum;
}
function politicalRanking(viewer=playerCountry){
 const live=ALL_COUNTRIES.filter(n=>countries[n]&&!countries[n].annexed);
 const byGDP=live.slice().sort((a,b)=>(countries[b].gdp||0)-(countries[a].gdp||0)||a.localeCompare(b));
 const maximum=Math.max(1,...live.map(n=>Math.max(0,countries[n].gdp||0))),geo=politicalGeography();
 return live.filter(n=>n!==viewer).map(n=>{
  const gdp=Math.max(0,countries[n].gdp||0),rank=byGDP.indexOf(n)+1,distance=politicalDistance(viewer,n,geo),neighbor=geo.neighbors[viewer]?.has(n)||false;
  const reasons=[],weight=45*Math.sqrt(gdp/maximum);if(weight>=20)reasons.push('экономический вес');
  let score=weight;
  if(neighbor){score+=45;reasons.push('общая граница');}
  else if(distance<15){score+=25*(1-distance/15);reasons.push('географическая близость');}
  if(isAtWar(viewer,n)){score+=80;reasons.push('война');}
  if((worldState.treaties||[]).some(t=>(t.a===viewer&&t.b===n)||(t.b===viewer&&t.a===n))){score+=25;reasons.push('договор');}
  if((worldState.initiatives||[]).some(i=>i.country===viewer&&i.target_country===n&&!['closed','failed'].includes(i.status))){score+=35;reasons.push('действующая миссия');}
  if((worldState.orders||[]).some(o=>o.resolvedTurn>=turn-2&&o.effects?.relations?.[n]!=null)){score+=20;reasons.push('недавняя дипломатия');}
  const foreignActor=worldState.actors?.[n+'::government'];
  if(viewer===playerCountry&&foreignActor?.issue&&gameDayNumber()-foreignActor.issue.day<90){score+=15;reasons.push('текущий политический вопрос');}
  return {id:n,gdp,gdpRank:rank,tier:gdp>=maximum*.25?'великая':gdp>=maximum*.06?'региональная':'малая',distance,neighbor,score:Math.round(score*10)/10,reasons};
 }).sort((a,b)=>b.score-a.score||a.gdpRank-b.gdpRank);
}
function selectPoliticalCountries(viewer=playerCountry,limit=10){
 const ranked=politicalRanking(viewer),strong=ranked.slice().sort((a,b)=>a.gdpRank-b.gdpRank).slice(0,Math.min(3,Math.max(1,Math.floor(limit/3))));
 const involved=ranked.filter(x=>x.reasons.some(r=>['война','действующая миссия'].includes(r))).slice(0,Math.max(0,limit-3));
 const close=ranked.filter(x=>x.neighbor||x.distance<15).slice(0,Math.min(3,Math.max(0,limit-strong.length-involved.length)));
 return [...new Set([...involved,...close,...strong,...ranked].map(x=>x.id))].slice(0,limit);
}
function foreignNewsWeight(item,ranked=politicalRanking()){
 const subjects=(item.actors||[]).filter(n=>n!==playerCountry);
 const weight=Math.max(0,...subjects.map(n=>ranked.find(x=>x.id===n)?.score||0));
 return (item.priority||0)*10+weight;
}
