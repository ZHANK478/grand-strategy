import {readFile} from 'node:fs/promises';
const report=JSON.parse(await readFile('repair-seed/report.json','utf8'));
const replies=JSON.parse(await readFile('repair-seed/responses.json','utf8'));
for(let i=0;i<report.cases.length;i++){
 const c=report.cases[i],part=replies.slice(i*3,i*3+3);
 if(c.receipts.some(o=>o.technical))console.log('DIAGNOSTIC_ORDER '+JSON.stringify({name:c.name,response:part[0].response}));
 for(const r of part.slice(1)){
  const data=JSON.parse(r.response),ctx=JSON.parse(r.request.split('Наблюдаемая обстановка: ')[1].split('\nМОРЕ И ТОРГОВЛЯ.')[0]);
  for(const packet of data.cabinets||[])if(c.audit.some(a=>a.country===packet.country))
   console.log('DIAGNOSTIC_PACKET '+JSON.stringify({name:c.name,packet,cabinet:ctx.cabinets.find(x=>x.id===packet.country),errors:c.audit.filter(a=>a.country===packet.country)}));
 }
}
