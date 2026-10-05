import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
await mkdir('assets/atlas',{recursive:true});
const fonts=[{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/oldstandardtt/OFL.txt","sha":"618d209cf110925dabf2c533df818e701fa068da","path":"assets/atlas/OldStandard-OFL.txt"},{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/oldstandardtt/OldStandard-Bold.ttf","sha":"4e138db49eadd49f11a882056411ddfb338520d6","path":"assets/atlas/OldStandard-Bold.ttf"},{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/oldstandardtt/OldStandard-Italic.ttf","sha":"c6bd25f9dd03e5a6ecce32b66f5ad0d62f06c729","path":"assets/atlas/OldStandard-Italic.ttf"},{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/oldstandardtt/OldStandard-Regular.ttf","sha":"655abd750736123c26a11c69fa2ad711a5ac22d7","path":"assets/atlas/OldStandard-Regular.ttf"},{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/OFL.txt","sha":"50ee76cf00fbfe42fb7c74a9b95c9508dec5bb8f","path":"assets/atlas/SourceSans3-OFL.txt"},{"url":"https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf","sha":"d259aa494fe7117141a2752a998a52c172bbd42b","path":"assets/atlas/SourceSans3.ttf"}];
async function download(url){for(let i=0;i<4;i++){try{const r=await fetch(url,{headers:{'User-Agent':'GrandStrategyHistoricalAtlas/1.0 (public-domain art; github.com/ZHANK478/grand-strategy)'},signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error(r.status+' '+url);return Buffer.from(await r.arrayBuffer());}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,800*(i+1)));}}}
for(const f of fonts){const b=await download(f.url);const sha=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');if(sha!==f.sha)throw Error('Font revision changed: '+f.path);await writeFile(f.path,b);}
const paintings=[
 {name:'Napoleon III, 1851.png',file:'napoleon.webp',author:'Unknown',date:'1851',subject:'Луи-Наполеон Бонапарт'},
 {name:'Franz Krüger - Portrait of Emperor Nicholas I - WGA12289.jpg',file:'nicholas.webp',author:'Franz Krüger',date:'1852',subject:'Николай I'},
 {name:'Franz Krüger - Porträt des Königs Friedrich Wilhelm IV. von Preußen.jpg',file:'frederick.webp',author:'Franz Krüger',date:'19th century',subject:'Фридрих Вильгельм IV'},
 {name:'Winterhalter - Queen Victoria 1843.jpg',file:'victoria.webp',author:'Franz Xaver Winterhalter',date:'1843',subject:'Виктория'},
 {name:'KaiserFranzjosef1853-1-.jpg',file:'franz.webp',author:'Miklós Barabás',date:'1853',subject:'Франц Иосиф I'},
 {name:'1852 Levasseur Map of Europe - Geographicus - Europe-levasseur-1852.jpg',file:'europe1852.webp',author:'Victor Levasseur / Frédéric-Guillaume Laguillermie',date:'1852',subject:'Decorative start-screen illustration, not scenario geography'}
];
const manifest=[];
for(const item of paintings){
 const name=item.name.replaceAll(' ','_'),hash=createHash('md5').update(name).digest('hex');
 const url='https://upload.wikimedia.org/wikipedia/commons/'+hash[0]+'/'+hash.slice(0,2)+'/'+encodeURIComponent(name);
 const b=await download(url),meta=await sharp(b).metadata();
 const image=await sharp(b).rotate().resize({width:item.file==='europe1852.webp'?1600:600,withoutEnlargement:true}).webp({quality:84}).toBuffer();
 await writeFile('assets/atlas/'+item.file,image);
 manifest.push({...item,source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(name),download:url,license:'Public domain / PD-Art',modifications:'Resized and converted to WebP; no generative processing',originalSize:[meta.width,meta.height],bytes:image.length,sha256:createHash('sha256').update(image).digest('hex')});
}
await writeFile('assets/atlas/credits.json',JSON.stringify({paintings:manifest,fonts,cartography:'Natural Earth, public domain, see atlas-physical.json'},null,2));
console.log('Historical assets: '+manifest.map(x=>x.file+' '+x.bytes+' bytes').join(', '));
