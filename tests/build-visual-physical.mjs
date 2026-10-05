import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const revision='ca96624a56bd078437bca8184e78163e5039ad19';
const base='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'+revision+'/geojson/';
const sources={mountains:base+'ne_10m_geography_regions_polys.geojson',rivers:base+'ne_50m_rivers_lake_centerlines.geojson'};
const entries=await Promise.all(Object.entries(sources).map(async([key,url])=>{
 const response=await fetch(url);if(!response.ok)throw Error('Natural Earth '+response.status);
 const raw=await response.json();
 const selected=raw.features.filter(f=>key==='mountains'?f.properties.FEATURECLA==='Range/mtn'&&f.properties.SCALERANK<=4:f.properties.scalerank<=4);
 const features=selected.map(f=>({type:'Feature',properties:{name:f.properties.NAME||f.properties.name||'',kind:f.properties.FEATURECLA||f.properties.featurecla||''},geometry:f.geometry}));
 return [key,{type:'FeatureCollection',features}];
}));
const data={...Object.fromEntries(entries),provenance:{provider:'Natural Earth',revision,sources,license:'Public domain',licenseURL:'https://www.naturalearthdata.com/about/terms-of-use/',note:'Named mountain region extents and major river/lake centre lines, not DEM. Original coordinates retained; no modern political boundaries used.'}};
assert.equal(data.mountains.features.length,129);assert.equal(data.rivers.features.length,187);
await writeFile('visual-physical.json',JSON.stringify(data));
console.log('Physical atlas data prepared:129 mountain regions,187 river lines.');
