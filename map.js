// MAP.JS v4 (исправленный)
const W = 960, H = 560;
const proj = d3.geoNaturalEarth1().scale(153).translate([W/2, H/2]); 
const pathGen = d3.geoPath(proj);
const svgEl   = document.getElementById('map-svg');
const mapWrap = document.getElementById('map-wrap');
const tooltip = document.getElementById('tooltip');
const svg     = d3.select('#map-svg');
const worldG  = svg.select('#world-g');
const franceG = svg.select('#france-g');

const FRANCE_COLORS = [
  '#3a7ab8','#4a8ac8','#2e6aa8','#5a98cc','#3a80bc',
  '#2868a0','#4a90c4','#3878b0','#5294c8','#2c6aaa',
  '#4286be','#3a7cb8','#2e72ac','#4a8cc4','#5698cc'
];

const PROVINCE_INFO = {
  'Île-de-France':                { pop:'2.1 млн', income:'620 фр./мес' },
  'Normandie':                    { pop:'1.4 млн', income:'240 фр./мес' },
  'Bretagne':                     { pop:'2.0 млн', income:'160 фр./мес' },
  'Pays de la Loire':             { pop:'1.6 млн', income:'200 фр./мес' },
  'Centre-Val de Loire':          { pop:'1.1 млн', income:'150 фр./мес' },
  'Bourgogne-Franche-Comté':      { pop:'1.1 млн', income:'190 фр./мес' },
  'Grand Est':                    { pop:'1.4 млн', income:'210 фр./мес' },
  'Hauts-de-France':              { pop:'1.0 млн', income:'180 фр./мес' },
  'Auvergne-Rhône-Alpes':         { pop:'1.8 млн', income:'230 фр./мес' },
  "Provence-Alpes-Côte d'Azur":   { pop:'0.8 млн', income:'140 фр./мес' },
  'Occitanie':                    { pop:'1.4 млн', income:'155 фр./мес' },
  'Nouvelle-Aquitaine':           { pop:'2.1 млн', income:'170 фр./мес' },
  'Corse':                        { pop:'0.2 млн', income:'60 фр./мес'  },
};

const FRANCE_ID = '250';

function lighten(hex) {
  const n = parseInt(hex.slice(1),16);
  const r = Math.min(255,((n>>16)&0xff)+35);
  const g = Math.min(255,((n>>8) &0xff)+35);
  const b = Math.min(255,( n      &0xff)+35);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function positionTooltip(e) {
  const r = mapWrap.getBoundingClientRect();
  tooltip.style.left = (e.clientX - r.left + 14)+'px';
  tooltip.style.top  = (e.clientY - r.top  - 58)+'px';
}

let parisXY = null;
function updateParis() {
  if (!parisXY) return;
  const zoom = W / vb.w;
  const show = zoom > 3;
  // Делим на zoom — элемент в SVG уменьшается когда карта приближается
  const r  = 2 / zoom;
  const fs = 7 / zoom;

  svg.select('#paris-dot')
    .attr('r', r)
    .attr('visibility', show ? 'visible' : 'hidden');
  svg.select('#paris-label')
    .attr('font-size', fs)
    .attr('x', parisXY[0] + r + 0.5/zoom)
    .attr('y', parisXY[1] + 0.5/zoom)
    .attr('visibility', show ? 'visible' : 'hidden');
}

function drawMap() {
  Promise.all([
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
    d3.json('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson')
  ]).then(([world, franceGeo]) => {
    const countries = topojson.feature(world, world.objects.countries);

    worldG.selectAll('path.country')
      .data(countries.features.filter(d => String(d.id) !== FRANCE_ID))
      .join('path')
      .attr('class','country')
      .attr('d', pathGen)
      .attr('fill','#e8e4dc')
      .attr('stroke','#888')
      .attr('stroke-width','0.25')
      .on('mouseover',(e,d)=>{
        d3.select(e.currentTarget).attr('fill','#d8d4cc');
        tooltip.style.display='block';
        document.getElementById('t-name').textContent='Страна';
        document.getElementById('t-info').textContent='Данные не определены';
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', e=>{
        d3.select(e.currentTarget).attr('fill','#e8e4dc');
        tooltip.style.display='none';
      });

    franceGeo.features.forEach((feature, i) => {
      const name   = feature.properties.nom;
      const info   = PROVINCE_INFO[name] || { pop:'—', income:'—' };
      const color  = FRANCE_COLORS[i % FRANCE_COLORS.length];
      const hcolor = lighten(color);

      franceG.append('path')
        .datum(feature)
        .attr('d', pathGen)
        .attr('fill', color)
        .attr('stroke','#1a3a60') // ПРАВКА 3: новые границы
        .attr('stroke-width','0.3')
        .style('cursor','pointer')
        .on('mouseover', function(e){
          d3.select(this).attr('fill', hcolor);
          tooltip.style.display='block';
          document.getElementById('t-name').textContent = name;
          document.getElementById('t-info').textContent = '👥 '+info.pop+' · 💰 '+info.income;
        })
        .on('mousemove', e => positionTooltip(e))
        .on('mouseleave', function(){
          d3.select(this).attr('fill', color);
          tooltip.style.display='none';
        });
    });

parisXY = proj([2.3488, 48.8534]);
    franceG.append('circle')
      .attr('id','paris-dot')
      .attr('cx', parisXY[0]).attr('cy', parisXY[1])
      .attr('r', 0.001)
      .attr('fill','#cc2200')
      .attr('pointer-events','none')
      .attr('visibility','hidden');
    franceG.append('text')
      .attr('id','paris-label')
      .attr('x', parisXY[0]).attr('y', parisXY[1])
      .attr('font-size','0.001')
      .attr('fill','#222')
      .attr('font-family','Georgia,serif')
      .attr('pointer-events','none')
      .attr('visibility','hidden')
      .text('• Париж');

    updateParis();
  }).catch(err => console.error(err));
}

let dragging = false, ds = {x:0,y:0};
let vb = {x:0, y:0, w:960, h:560};

mapWrap.addEventListener('mousedown', e=>{ dragging=true; ds={x:e.clientX,y:e.clientY}; });
window.addEventListener('mousemove', e=>{
  if (!dragging) return;
  const scale = vb.w / mapWrap.offsetWidth;
  vb.x -= (e.clientX-ds.x)*scale;
  vb.y -= (e.clientY-ds.y)*scale;
  vb.x = Math.max(-600, Math.min(800, vb.x));
  vb.y = Math.max(-400, Math.min(600, vb.y));
  svgEl.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  ds = {x:e.clientX, y:e.clientY};
  updateParis();
});
window.addEventListener('mouseup', ()=>dragging=false);

mapWrap.addEventListener('wheel', e=>{
  e.preventDefault();
  const f  = e.deltaY>0 ? 1.12 : 0.89;
  const nw = Math.max(25, Math.min(1800, vb.w*f));
  const nh = Math.max(15, Math.min(1100, vb.h*f));
  const rect = mapWrap.getBoundingClientRect();
  const mx = (e.clientX-rect.left)/rect.width;
  const my = (e.clientY-rect.top) /rect.height;
  vb.x += vb.w*mx - nw*mx;
  vb.y += vb.h*my - nh*my;
  vb.w=nw; vb.h=nh;
  svgEl.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  updateParis();
},{passive:false});

drawMap();
