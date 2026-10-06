// Free public-page smoke check: never allow provider or Supabase AI requests.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url='https://zhank478.github.io/grand-strategy/economy-world.html';
let ready=false;
for(let i=0;i<36;i++){
 const response=await fetch(url+'?release=20261004-v18-'+i);
 const html=await response.text();
 if(response.ok&&html.includes('news-runtime.js?v=18')){ready=true;break;}
 await new Promise(r=>setTimeout(r,5000));
}
assert.ok(ready,'Pages must serve the new release');
const browser=await chromium.launch({headless:true});
try{
 for(const [mode,options]of [['desktop',{viewport:{width:1440,height:900}}],['phone',{viewport:{width:844,height:390},isMobile:true,hasTouch:true}]]){
  const context=await browser.newContext(options),errors=[];
  await context.route(/supabase\.co|openrouter\.ai|generativelanguage\.googleapis\.com/,r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://zhank478.github.io/grand-strategy/?release=20261004-v18',{waitUntil:'load',timeout:90000});
  await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready',{},{timeout:60000});
  await page.selectOption('#mobile-country-picker','Франция');
  await page.click('#mobile-start-btn');
  assert.ok(new URL(page.url()).pathname.endsWith('/economy-world.html')&&new URL(page.url()).searchParams.get('v')==='18','Root entry opens current build');
  const state=await page.evaluate(()=>({started:gameStarted,player:playerCountry,countries:Object.keys(countries).length,ports:worldState.maritime?.ports.length}));
  assert.ok(state.started&&state.player==='Франция'&&state.countries>40&&state.ports>0);
  assert.equal(errors.length,0,errors.join('; '));
  console.log('PUBLISHED '+mode+' '+JSON.stringify(state));
  await context.close();
 }
}finally{await browser.close();}
