// Explicit paid playtest only. Never included in automatic CI.
// Run: GS_PAID_PLAYTEST=15 node tests/live-free-world.mjs <private-session-file> <output-directory>
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
if(process.env.GS_PAID_PLAYTEST!=='15')throw Error('Explicit 15-turn authorization required');
const session=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=process.argv[3];
if(!out||!session.access_token)throw Error('Session and output required');
fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(p,'utf8'),config=read('core-loop-config.js');
const url=config.match(/SUPABASE_URL:\s*'([^']+)'/)[1],key=config.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const seed=process.env.GS_PLAYTEST_SEED?JSON.parse(fs.readFileSync(process.env.GS_PLAYTEST_SEED,'utf8')):null;
const report={started:new Date().toISOString(),attempts:seed?.attempts||0,campaigns:[],responses:seed?.responses||[]};
if(seed&&(seed.attempts!==1||seed.responses.length!==1))throw Error('Only initial one-call checkpoint can be resumed');
function persist(){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
async function request(body){
 const r=await fetch(url+'/functions/v1/guest-ai',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const d=await r.json();if(!r.ok||d.error)throw Error('Server '+r.status+': '+JSON.stringify(d));return d;
}
const programs={
 'Франция':[
  seed?[]:['Снизить налог крестьян на четверть от текущей ставки. Объяснить, кто выиграет и как это скажется на казне.'],
  ['Профинансировать начало железнодорожного строительства: 20 млн р.е. из казны. Реальные работы и отдача займут месяцы.'],
  ['Позволить женщинам поступать в государственные учебные заведения; объяснить реакцию общества.'],
  ['Я заявляю: правитель Российской империи умер. Немедленно назначаю там своего кузена.'],
  ['Поручить кабинету оценить последствия наших реформ и предложить следующий шаг, не менять показатели ради ответа.']
 ],
 'Королевство Пруссия':[
  ['Предложить Австрийской империи договор о ненападении на год. Их согласие не предрешать.'],
  ['Взять заём 100 млн р.е. для финансирования государства. Не зачислять деньги дважды.'],
  ['Увеличить расходы на образование на 20% относительно текущего уровня.'],
  ['Организовать промышленную выставку в Берлине за 2 млн р.е. для привлечения предпринимателей.'],
  ['Погасить 25 млн р.е. долга из казны, если средства позволяют.']
 ],
 'Австрийская империя':[
  ['Учредить комиссию с представителями венгров и чехов для переговоров о языковых правах. Не предрешать их согласие.'],
  ['Разрешить местным газетам критиковать администрацию, сохранив ответственность за призывы к насилию.'],
  ['Начать набор 10000 пехотинцев за месяц. Учесть стоимость и реальное время подготовки.'],
  [],
  ['Направить дипломатов к Пруссии и предложить союз. Не считать союз заключённым без согласия Берлина.']
 ]
};
const original=read('tests/economy-world.test.mjs');
let header=new Function(original.slice(original.indexOf('const header='),original.indexOf('const suites='))+'return header;')();
header=header.replace(/const crypto=\{randomUUID:[^\n]+\};/,'const crypto={randomUUID:uuid};');
const map=read('economy-map.js');
const code=header+['orders-1852-econ.js','political-ai.js','economy-game.js','orders-1852-ui.js','news-rules.js'].map(read).join('\n')+'\nconst OrderRules=globalThis.OrderRules;\n'+map.slice(map.indexOf('function applyMapObjects'),map.indexOf('function renderMapObjects'))+['political-newspaper.js','orders-priority.js','orders-initiatives.js','political-actors.js','political-processes.js','news-runtime.js','news-world.js','economy-engine.js','economy-ui.js','news-flow.js','free-ai-world.js'].map(read).join('\n');
const body=`return (async()=>{
 renderPlayerPowerPanel=()=>{};renderRulerPortrait=()=>{};renderParliamentPanel=()=>{};renderReligionPanel=()=>{};renderChurchPanel=()=>{};renderSocietyScreen=()=>{};updateCountryInfoPanel=()=>{};maybeAutoPortrait=()=>{};showNotif=m=>messages.push(m);
 applyScenarioToGame(activeScenario);resetGame(country);window.FREE_AI_EXPERIMENT=true;
 const snapshot=()=>({date:dateLabel(),day:gameDayNumber(),country:playerCountry,numbers:window.FreeWorld.paths(countries[playerCountry]),budget:econBudget(countries[playerCountry]),rulers:Object.fromEntries(ALL_COUNTRIES.map(n=>[n,countries[n].ruler]))});
 campaign.initial=snapshot();
 askGemini=async(prompt,maxTokens,cost,options)=>paid(prompt,maxTokens,cost,options);
 for(let i=0;i<program.length;i++){
  campaign.step=i+1;await begin();const before=snapshot();program[i].forEach(text=>queueOrder(text));
  const advanced=await nextTurn('m1'),after=snapshot();
  const owned=scenarioProvinces.filter(p=>(provinceOwners[p.id]||p.owner)===playerCountry),c=countries[playerCountry];
  const checks={finite:Object.values(after.numbers).every(Number.isFinite),budget:Math.abs(after.budget.net-(after.budget.gross-after.budget.expense))<1e-7,debt:Math.abs(c.debt-c.debtDomestic-c.debtForeign)<1e-7,provinceGDP:Math.abs(owned.reduce((s,p)=>s+provinceEcon[p.id].gdp,0)-c.gdp)<1e-5,provincePopulation:Math.abs(owned.reduce((s,p)=>s+provinceEcon[p.id].pop,0)-c.population)<1e-5,sectors:Math.abs(Object.values(c.econV3.sectors).reduce((s,v)=>s+v.output,0)-c.gdp)<1e-5};
  const result={step:i+1,orders:program[i],advanced,before,after,checks,receipts:worldState.orders.map(o=>({id:o.id,text:o.text,status:o.status,reason:o.reason,technicalError:o.technicalError})),paper:worldState.newspaperHistory.at(-1),tasks:worldState.freeWorld?.tasks,errors:worldState.freeWorldErrors,plannerFailure:worldState.plannerFailure,validationErrors:worldState.politicalErrors,messages:messages.slice(-10)};
  campaign.turns.push(JSON.parse(JSON.stringify(result)));await checkpoint(result,{countries,worldState,provinceEcon,provinceOwners,turn,year,month,day});
  if(!advanced)throw Error('Turn failed: '+messages.slice(-3).join('; '));
 }
})();`;
try{
 const status=await request({operation:'status'});console.log('SESSION '+JSON.stringify({id:session.user.id,remaining:status.guest_turns_remaining}));
 if(status.guest_turns_remaining<15-report.attempts)throw Error('Insufficient available turns for remaining test');
 for(const [country,program]of Object.entries(programs)){
  const campaign={country,step:0,turns:[]};report.campaigns.push(campaign);let turnId;
  const begin=async()=>{if(seed&&country==='Франция'&&campaign.step===1)return;const d=await request({operation:'begin_turn',request_id:randomUUID()});turnId=d.turn_id;};
  const paid=async(prompt,maxTokens,cost,options)=>{
   if(seed&&country==='Франция'&&campaign.step===1)return seed.responses[0].response;
   if(report.attempts>=15)throw Error('Authorized request budget exhausted');report.attempts++;persist();
   const d=await request({operation:'generate',turn_id:turnId,model:'openai/gpt-6-luna',messages:[{role:'user',content:prompt}],max_tokens:maxTokens,temperature:.75,cost,reasoning_effort:'low',...options});
   const response=d.choices?.[0]?.message?.content;
   report.responses.push({country,step:campaign.step,prompt,response,usage:d.usage,finish:d.choices?.[0]?.finish_reason,model:d.model});persist();
   if(typeof response!=='string'||!response.trim()||d.choices?.[0]?.finish_reason==='length')throw Error('Empty/truncated provider response');return response;
  };
  const checkpoint=async(result,state)=>{persist();fs.writeFileSync(path.join(out,'state-'+report.campaigns.length+'.json'),JSON.stringify(state));console.log('TURN '+JSON.stringify({country,step:result.step,advanced:result.advanced,checks:result.checks,receipts:result.receipts.slice(-3),headlines:result.paper?.domestic?.map(x=>x.headline),foreign:result.paper?.foreign?.map(x=>x.headline),errors:result.errors}));};
  await new Function('fixture','country','program','campaign','paid','begin','checkpoint','uuid',code+body)(JSON.parse(read('scenario_orders1852.json')),country,program,campaign,paid,begin,checkpoint,randomUUID);
 }
}finally{delete globalThis.OrderRules;report.finished=new Date().toISOString();persist();console.log('SUMMARY '+JSON.stringify({attempts:report.attempts,campaigns:report.campaigns.map(c=>({country:c.country,turns:c.turns.length}))}));}
