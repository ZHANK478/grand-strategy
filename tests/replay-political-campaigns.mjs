import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+'/'))throw Error('path');
  const data=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});

const fixtures=JSON.parse(await readFile('political-seed/fixtures/political-replay.json','utf8'));
let checked=0;const failed=[],sizes=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,r=>r.abort());
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:8765/economy-world.html',{waitUntil:'load'});
 await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:30000});
 await page.selectOption('#mobile-country-picker','Франция');await page.click('#mobile-start-btn');
 for(const name of ['peace','war','influence','reform']){
  const saved=JSON.parse(await readFile('political-seed/political-campaign-'+name+'/state.json','utf8'));
  const metrics=await page.evaluate(async saved=>{
   localStorage.setItem(SAVE_PREFIX+'late-replay',JSON.stringify(saved));if(!await loadGameSlot('late-replay'))throw Error('load');
   const selected=policySelect(6),ctx=policyContext(selected,[],'offline'),raw=policyPrompt(selected,[],'offline'),prompt=raw+'\n'+MARITIME_INSTRUCTIONS;
   return {country:playerCountry,selected,wire:JSON.stringify([{role:'user',content:prompt}]).length,sections:Object.fromEntries(Object.entries(ctx).map(([k,v])=>[k,JSON.stringify(v).length])),cabinetSections:ctx.cabinets.map(c=>({id:c.id,sections:Object.fromEntries(Object.entries(c.interests).map(([k,v])=>[k,JSON.stringify(v).length]))}))};
  },saved);
  sizes.push({name,...metrics});assert.ok(metrics.wire<110000,'Late cabinet context must fit with margin');console.log('REPLAY_SIZE_DETAIL '+JSON.stringify({name,...metrics}));
 }
 for(const fixture of fixtures){
  const result=await page.evaluate(f=>{
   resetGame(f.context.player);worldState.periodEvents=[];ensurePolitics();ensureWorldActors();
   const id=orderCountry(f.packet.country);
   if(!countries[id])return {error:'Unknown actual participant'};
   const known=f.cabinet;if(known){
    countries[id].treasury=known.interests.prosperity.treasury;
    countries[id].income=Math.max(countries[id].income,known.interests.prosperity.currentBudget?.gross||0);
    Object.assign(policyCabinet(id),{goals:known.goals,memory:known.memory,inbox:known.inbox});
    ensureNewsFlow().issues=known.issues||[];
    strategyState().offers=known.offers||[];
    strategyState().contracts=(known.interests.sovereignty.obligations||[]).map(o=>({id:o.id,a:id,b:o.partner,type:o.type,terms:o.terms,due:o.due,status:'active'}));
    const m=maritimeState(),sea=known.interests.maritime;
    if(sea){m.tradeOffers=sea.tradeOffers||[];m.agreements=sea.agreements||[];m.fleets=m.fleets.filter(x=>x.owner!==id).concat((sea.fleets||[]).map(x=>({...x,owner:id})));
    }
   }
   try{
    const d=policyValidate(f.packet,[id]);
    if(d.decision.task?.kind==='trade'&&d.decision.task.effects?.diplomatic_action)throw Error('wrong executor');
    return {ok:true,action:d.decision.action,kind:d.decision.task?.kind};
   }catch(e){return {error:e.message};}
  },fixture);
  if(result.ok)checked++;else failed.push({name:fixture.name,step:fixture.step,country:fixture.packet.country,original:fixture.errors,error:result.error});
 }
 console.log('REPLAY_SIZES '+JSON.stringify(sizes));
 console.log('REPLAY_RESULTS '+JSON.stringify({checked,total:fixtures.length,failed,paidRequests:0}));
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
