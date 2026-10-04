import {readFile,writeFile} from 'node:fs/promises';
const cases=['peace','war','influence','reform'],fixtures=[];
for(const name of cases){
 const path='political-seed/political-campaign-'+name;
 const report=JSON.parse(await readFile(path+'/report.json','utf8'));
 const replies=JSON.parse(await readFile(path+'/responses.json','utf8'));
 console.log('CAMPAIGN_TOTAL '+JSON.stringify({name,cost:report.cost,usage:report.usage,initial:report.initial}));
 const logged=new Set();
 for(const t of report.turns){
  const errors=(t.policyErrors||[]).filter(e=>!logged.has(JSON.stringify(e)));
  errors.forEach(e=>logged.add(JSON.stringify(e)));
  const turns=replies.filter(r=>r.step===t.step&&r.type==='cabinets');
  for(const r of turns){
   let data;try{data=JSON.parse(r.response);}catch{console.log('PACKET_PARSE '+JSON.stringify({name,step:t.step,usage:r.usage,response:r.response}));continue;}
   const context=JSON.parse(r.request.split('Наблюдаемая обстановка: ')[1].split('\nMARITIME')[0]);
   for(const c of data.cabinets||[]){
    const matched=errors.filter(e=>e.country===c.country);
    if(matched.length){
     const cabinet=context.cabinets.find(x=>x.id===c.country);
     fixtures.push({name,step:t.step,packet:c,cabinet,context,errors:matched});
     console.log('PACKET_FAILURE '+JSON.stringify({name,step:t.step,packet:c,errors:matched,offers:cabinet?.offers,issues:cabinet?.issues,inbox:cabinet?.inbox,sovereignty:cabinet?.interests.sovereignty}));
    }
   }
  }
 }
}
await writeFile('political-replay.json',JSON.stringify(fixtures,null,2));
