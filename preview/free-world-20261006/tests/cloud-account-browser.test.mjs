// Guest/account UI and cloud-save integration. All network AI calls are intercepted.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8766,'127.0.0.1',r));
const browser=await chromium.launch();
try{
 for(const mode of ['guest','account'])for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  const page=await browser.newPage({viewport}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  const sdk=`window.__writes=[];window.supabase={createClient(){const user={id:'test-${mode}',email:'player@example.invalid',is_anonymous:${mode==='guest'}};return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test-token'}}}),signInWithOAuth:async options=>{window.__oauth=options;return {}},signInWithOtp:async()=>({}),signOut:async()=>({})},from(table){const q={select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:table==='profiles'?{turns_balance:50,image_generations_remaining:5}:null}),upsert:async row=>{window.__writes.push({table,row});return {}},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q},storage:{from(){return {upload:async()=>({}),remove:async()=>({}),download:async()=>({data:new Blob(['{}'])})}}}}}};`;
  await page.route('**/supabase-js@2',r=>r.fulfill({contentType:'text/javascript',body:sdk}));
  await page.route('**/functions/v1/**',async r=>{const body=r.request().postDataJSON();requests.push(body);assert.notEqual(body.operation,'image','No paid image calls');assert.notEqual(body.operation,'generate','No paid text calls');await r.fulfill({contentType:'application/json',body:JSON.stringify(body.operation==='status'?{guest_turns_remaining:10,image_generations_remaining:0}:body.operation==='begin_turn'?{turn_id:body.request_id,turns_balance:49}:{urls:{}})});});
  await page.goto('http://127.0.0.1:8766/economy-world.html?v=19');
  await page.waitForFunction(()=>window.GS_MAP_LOAD?.status==='ready');
  console.log(mode+' auth '+JSON.stringify(await page.evaluate(()=>({note:document.getElementById('mobile-guest-note').textContent,sdk:!!window.supabase}))));
  await page.waitForFunction(mode=>mode==='account'?document.getElementById('menu-turn-count').textContent.includes('50'):document.getElementById('menu-turn-count').textContent.includes('10'),mode);
  const experiment=await page.evaluate(()=>!!window.FREE_AI_EXPERIMENT);
  assert.equal(await page.locator('#gs-login').count(),0,'No forced registration');
  assert.equal(await page.locator('#menu-login-btn').isVisible(),mode==='guest');
  if(mode==='guest'){
   await page.locator('#menu-login-btn').click();assert.equal(await page.locator('#gs-google-btn').isVisible(),true);
   await page.locator('#gs-google-btn').click();assert.equal(await page.evaluate(()=>__oauth.provider),'google');
   await page.locator('.gs-stay-guest').click();assert.equal(await page.locator('#gs-login').isVisible(),false);
  }else{
   assert.match(await page.locator('#menu-image-balance').textContent(),/5/);
   await page.evaluate(()=>gsCloudPut('map','test-map','Test map',{provinces:[]},{provinceCount:0}));
   assert.equal(await page.evaluate(()=>__writes.some(w=>w.table==='cloud_library'&&w.row.kind==='map')),!experiment);
  }
  await page.selectOption('#mobile-country-picker','Франция');await page.locator('#mobile-start-btn').click();
  await page.waitForFunction(()=>gameStarted);
  if(mode==='account'){
   assert.match(await page.locator('#test-hud-images').textContent(),/5/);
   await page.locator('#mobile-flag-button').click();assert.equal(await page.locator('#portrait-gen-btn').isVisible(),true,'Account can request a portrait');
   const positions=await page.evaluate(()=>{const turns=document.getElementById('test-hud-remaining').getBoundingClientRect(),images=document.getElementById('test-hud-images').getBoundingClientRect();return {turnBottom:turns.bottom,imageTop:images.top};});assert.ok(positions.imageTop>=positions.turnBottom,'Image counter appears below turns');
   await page.evaluate(()=>saveGame());if(experiment){assert.equal(await page.evaluate(()=>listSaves().length>0),true,'Experimental party stays local');}else await page.waitForFunction(()=>__writes.some(w=>w.table==='saves'));
   await page.evaluate(()=>testEnsureAIForTurn());assert.match(await page.locator('#test-hud-remaining').textContent(),/49/);
  }
  assert.deepEqual(errors,[],mode+' runtime errors');
  console.log(mode+' '+viewport.width+'px: optional login, allowance, library and HUD passed');await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
