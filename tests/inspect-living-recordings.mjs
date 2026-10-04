// Read only authorised playtest artifacts; no network or model calls.
import {readFile} from 'node:fs/promises';
for(const id of ['france','prussia','austria']){
 const dir='recordings/living-campaign-'+id;
 const report=JSON.parse(await readFile(dir+'/report.json','utf8'));
 console.log('REPORT_METRICS '+JSON.stringify({id,requests:report.usage.map(u=>({type:u.type,extra:u.extra,tokens:u.usage,wire:u.wire,ms:u.ms})),initial:report.initial,final:report.turns.at(-1)&&{education:report.turns.at(-1).education,demography:report.turns.at(-1).demography,cash:report.turns.at(-1).cash},cost:report.cost}));
 const replies=JSON.parse(await readFile(dir+'/responses.json','utf8'));
 for(const item of replies){
  if(typeof item.response!=='string')continue;
  let data;try{data=JSON.parse(item.response.trim().replace(/^\`\`\`(?:json)?\\s*/i,'').replace(/\\s*\`\`\`$/,''));}catch{continue;}
  const turn=report.turns.find(t=>t.step===item.step);
  const problems=turn?.policyErrors?.filter(e=>!report.turns.find(t=>t.step===item.step-1)?.policyErrors?.some(p=>p.error===e.error&&p.country===e.country))||[];
  if(item.type==='planner')for(const o of data.orders||[])if(JSON.stringify(o).includes('court_scene'))console.log('RECORDED_FORMAT '+JSON.stringify({id,step:item.step,type:item.type,order:o}));
  if(item.type==='cabinets')for(const p of problems)for(const c of data.cabinets||[])if(c.country===p.country)console.log('RECORDED_FORMAT '+JSON.stringify({id,step:item.step,error:p.error,cabinet:c}));
 }
}
