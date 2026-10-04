import {readFile} from 'node:fs/promises';
const report=JSON.parse(await readFile('control-seed/report.json','utf8'));
console.log('RECORDED_FAILURES '+JSON.stringify(report.campaigns.map(c=>({country:c.country,failures:c.turns.filter(t=>t.failed)}))));
for(const country of ['Франция','Пруссия']){
 const replies=JSON.parse(await readFile('control-seed/'+country+'-responses.json','utf8'));
 console.log('RECORDED_ORDERS '+JSON.stringify({country,replies:replies.filter(r=>r.type==='orders')}));
 console.log('RECORDED_FOREIGN '+JSON.stringify({country,replies:replies.filter(r=>r.type==='foreign')}));
}
