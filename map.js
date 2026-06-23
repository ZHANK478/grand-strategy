// ============================================================
// MAP.JS v3 — реальная карта, GeoJSON Франции, портреты
// ============================================================

const W = 960, H = 560; 
const proj = d3.geoNaturalEarth1().scale(153).translate([W / 2, H / 2]);
const pathGen = d3.geoPath(proj);

const svgEl  = document.getElementById('map-svg');
const mapWrap = document.getElementById('map-wrap');
const tooltip = document.getElementById('tooltip');
const svg     = d3.select('#map-svg');
const worldG  = svg.select('#world-g');
const franceG = svg.select('#france-g');

// Цвета провинций Франции (голубые оттенки)
const FRANCE_COLORS = [
  '#4a90c4','#5aa0d4','#3a80b4','#6ab0d4','#4a98cc',
  '#3888bc','#5a9ccc','#4a8cbc','#5aa4d0','#3a84b8',
  '#4e94c8','#5aa8d4','#3c82b0','#4896c0','#569ed0'
];

// Информация о провинциях (по регионам)
const PROVINCE_INFO = {
  'Île-de-France':        { pop: '2.1 млн', income: '620 фр./мес' },
  'Normandie':            { pop: '1.4 млн', income: '240 фр./мес' },
  'Bretagne':             { pop: '2.0 млн', income: '160 фр./мес' },
  'Pays de la Loire':     { pop: '1.6 млн', income: '200 фр./мес' },
  'Centre-Val de Loire':  { pop: '1.1 млн', income: '150 фр./мес' },
  'Bourgogne-Franche-Comté': { pop: '1.1 млн', income: '190 фр./мес' },
  'Grand Est':            { pop: '1.4 млн', income: '210 фр./мес' },
  'Hauts-de-France':      { pop: '1.0 млн', income: '180 фр./мес' },
  'Auvergne-Rhône-Alpes': { pop: '1.8 млн', income: '230 фр./мес' },
  "Provence-Alpes-Côte d'Azur": { pop: '0.8 млн', income: '140 фр./мес' },
  'Occitanie':            { pop: '1.4 млн', income: '155 фр./мес' },
  'Nouvelle-Aquitaine':   { pop: '2.1 млн', income: '170 фр./мес' },
  'Corse':                { pop: '0.2 млн', income:  '60 фр./мес' },
};

function drawMap() {
  // Загружаем мировую карту и регионы Франции параллельно
  Promise.all([
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
    d3.json('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson')
  ]).then(([world, franceGeo]) => {

    // --- МИР: бело-серые страны ---
    const countries = topojson.feature(world, world.objects.countries);
    worldG.selectAll('path.country')
      .data(countries.features).join('path')
      .attr('class', 'country')
      .attr('d', pathGen)
      .attr('fill', '#d8d4cc')
      .attr('stroke', '#555')
      .attr('stroke-width', '0.25')
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill', '#c8c4bc');
        tooltip.style.display = 'block';
        document.getElementById('t-name').textContent = 'Страна';
        document.getElementById('t-info').textContent = 'Данные не определены';
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', e => {
        d3.select(e.currentTarget).attr('fill', '#d8d4cc');
        tooltip.style.display = 'none';
      });

    // --- ФРАНЦИЯ: реальные регионы, голубые ---
    franceGeo.features.forEach((feature, i) => {
      const name  = feature.properties.nom;
      const info  = PROVINCE_INFO[name] || { pop: '—', income: '—' };
      const color = FRANCE_COLORS[i % FRANCE_COLORS.length];
      const hcolor = lighten(color);

      franceG.append('path')
        .datum(feature)
        .attr('d', pathGen)
        .attr('fill', color)
        .attr('stroke', '#1a3a5a')
        .attr('stroke-width', '0.8')
        .style('cursor', 'pointer')
        .on('mouseover', function(e) {
          d3.select(this).attr('fill', hcolor);
          tooltip.style.display = 'block';
          document.getElementById('t-name').textContent = name;
          document.getElementById('t-info').textContent =
            '👥 ' + info.pop + ' · 💰 ' + info.income;
        })
        .on('mousemove', e => positionTooltip(e))
        .on('mouseleave', function() {
          d3.select(this).attr('fill', color);
          tooltip.style.display = 'none';
        });

      // Подпись региона
      const c = pathGen.centroid(feature);
      if (c && !isNaN(c[0])) {
        franceG.append('text')
          .attr('class', 'prov-label')
          .attr('x', c[0]).attr('y', c[1])
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '6.5')
          .attr('fill', '#fff')
          .attr('pointer-events', 'none')
          .attr('font-family', 'Georgia, serif')
          .text(name);
      }
    });

    // Маркер Парижа
    const parisXY = proj([2.3488, 48.8534]);
    franceG.append('circle')
      .attr('cx', parisXY[0]).attr('cy', parisXY[1]).attr('r', 3)
      .attr('fill', '#f0c040').attr('stroke', '#805000').attr('stroke-width', '1')
      .attr('pointer-events', 'none');
    franceG.append('text')
      .attr('x', parisXY[0] + 5).attr('y', parisXY[1] - 3)
      .attr('font-size', '8').attr('fill', '#f0c040')
      .attr('font-family', 'Georgia, serif')
      .attr('pointer-events', 'none').text('★ Париж');

    updateLabels();

  }).catch(err => {
    console.error(err);
    svg.append('text').attr('x', W/2).attr('y', H/2)
      .attr('text-anchor', 'middle').attr('font-size', '13')
      .attr('fill', '#888').text('Ошибка загрузки карты');
  });
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 40);
  const g = Math.min(255, ((n >>  8) & 0xff) + 40);
  const b = Math.min(255, ( n        & 0xff) + 40);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function positionTooltip(e) {
  const r = mapWrap.getBoundingClientRect();
  tooltip.style.left = (e.clientX - r.left + 14) + 'px';
  tooltip.style.top  = (e.clientY - r.top  - 58) + 'px';
}

function updateLabels() {
  const scale = vb.w / W;
  // Показываем подписи только при достаточном приближении
  franceG.selectAll('.prov-label').attr('visibility', scale < 0.6 ? 'hidden' : 'visible');
}

// ---- ЗУМ и перетаскивание ----
let dragging = false, ds = { x: 0, y: 0 };
let vb = { x: 0, y: 0, w: 960, h: 560 };

mapWrap.addEventListener('mousedown', e => {
  dragging = true;
  ds = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const scale = vb.w / mapWrap.offsetWidth;
  vb.x -= (e.clientX - ds.x) * scale;
  vb.y -= (e.clientY - ds.y) * scale;
  // Широкие лимиты чтобы можно было путешествовать по карте
  vb.x = Math.max(-600, Math.min(800, vb.x));
  vb.y = Math.max(-400, Math.min(600, vb.y));
  svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  ds = { x: e.clientX, y: e.clientY };
  updateLabels();
});
window.addEventListener('mouseup', () => dragging = false);

mapWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.12 : 0.89;
  // Убираем ограничение снизу — можно приближать очень сильно
  const nw = Math.max(30, Math.min(1800, vb.w * f));
  const nh = Math.max(18, Math.min(1100, vb.h * f));
  const rect = mapWrap.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top)  / rect.height;
  vb.x += vb.w * mx - nw * mx;
  vb.y += vb.h * my - nh * my;
  vb.w = nw; vb.h = nh;
  svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  updateLabels();
}, { passive: false });

drawMap();

