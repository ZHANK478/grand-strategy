import {readFile} from 'node:fs/promises';
const rs=JSON.parse(await readFile('inspect/responses.json','utf8'));
for(const r of rs){
 if(r.type==='planner') {
 const dataLine=r.request.split('Свободные приказы: ')[1]?.split('\n')[0];
 console.log('PLANNER '+JSON.stringify({step:r.step,chars:r.request.length,orders:dataLine,response:r.response}));
 }
}
const report=JSON.parse(await readFile('inspect/report.json','utf8'));
console.log('WORLD '+JSON.stringify(report.turns.map(t=>({step:t.step,newspaper:t.newspaper?.frontPage?.slice?.(0,500),audit:t.audit}))));
