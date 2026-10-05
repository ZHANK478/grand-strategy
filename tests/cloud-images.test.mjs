import assert from 'node:assert/strict';
import {cachedImage,imageKey,resolveImages} from '../supabase/functions/_shared/images.ts';
const body={model:'google/gemini-3.1-flash-image',messages:[{role:'user',content:'A painted flag'}]};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
let calls=0,finish=[],claim={},storageFails=false,providerFails=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;return {ok:!providerFails,json:async()=>providerFails?{error:'failed'}:{choices:[{message:{images:[{image_url:{url:png}}]}}]}};};
const admin={rpc:async(name,args)=>{
 if(name==='shared_image_claim')return {data:claim};
 if(name==='shared_image_finish'){finish.push(args);return {data:true};}
 if(name==='mobile_image_status')return {data:0};
},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{image_generations_remaining:4}}),eq:()=>({maybeSingle:async()=>({data:{cache_key:'a'}})})})})}),storage:{from:()=>({upload:async()=>({error:storageFails?{message:'down'}:null}),createSignedUrl:async path=>({data:{signedUrl:'https://test.invalid/signed/'+path}})})}};
try{
 claim={hit:true,url:'storage:'+('a'.repeat(64))+'.png'};
 let r=await cachedImage(admin,'user',false,body,'test');assert.equal(calls,0);assert.equal(r.data.cache_hit,true);assert.equal(r.data.image_generations_remaining,4);assert.match(r.data.choices[0].message.images[0].image_url.url,/signed/);
 claim={error:'no_images'};r=await cachedImage(admin,'user',false,body,'test');assert.equal(r.status,402);assert.equal(calls,0);
 claim={error:'image_busy'};r=await cachedImage(admin,'user',false,body,'test');assert.equal(r.status,409);assert.equal(calls,0);
 claim={reservation:'ticket',remaining:4};r=await cachedImage(admin,'user',false,body,'test');assert.equal(calls,1);assert.equal(r.status,200);assert.match(finish.at(-1).p_url,/^storage:/);
 storageFails=true;r=await cachedImage(admin,'user',false,body,'test');assert.equal(r.status,200);assert.equal(finish.at(-1).p_url,png,'Storage failure persists original bytes instead of paying to regenerate');
 providerFails=true;r=await cachedImage(admin,'user',false,body,'test');assert.equal(r.status,502);assert.equal(finish.at(-1).p_url,null,'Failed generation refunds quota');
 const a='Formal painted state portrait, oil painting, 19th century academic style. Subject: Napoleon III, Emperor of France, 44 years old, year 1852. Dignified pose.';
 const b=a.replace('44 years old','45 years old').replace('year 1852','year 1853');
 assert.equal(await imageKey(body.model,[{role:'user',content:a}]),await imageKey(body.model,[{role:'user',content:b}]),'Same ruler is reusable after birthday');
 assert.notEqual(await imageKey(body.model,[{role:'user',content:a}]),await imageKey(body.model,[{role:'user',content:a.replace('Napoleon III','Louis Philippe')}]));
 r=await resolveImages(admin,['../secret']);assert.equal(r.status,400);
 console.log('Cloud images: cache, quotas, persistence, refund and identity checks passed; no paid API calls.');
}finally{globalThis.fetch=originalFetch;}
