// ============================================================
// MAP.JS — карта мира, провинции Франции, зум и перетаскивание
// ============================================================

const W = 960, H = 560;
const proj = d3.geoNaturalEarth1().scale(153).translate([W / 2, H / 2]);
const pathGen = d3.geoPath(proj);

const svgEl = document.getElementById('map-svg');
const mapWrap = document.getElementById('map-wrap');
const tooltip = document.getElementById('tooltip');
const svg = d3.select('#map-svg');
const worldG = svg.select('#world-g');
const franceG = svg.select('#france-g');

// Провинции Франции — координаты (упрощённые, будут заменены на GeoJSON)
const franceProvinces = [
  { name: 'Нормандия',         color: '#2e7040', hcolor: '#3a9050', pop: '1.4 млн', income: '240 фр./мес', coords: [[[-1.5,49.5],[-1,49.7],[0.2,49.9],[1.8,49.6],[1.5,49.1],[0.5,48.8],[-0.5,48.5],[-1.5,48.8],[-1.5,49.5]]] },
  { name: 'Иль-де-Франс',      color: '#348a48', hcolor: '#42aa58', pop: '2.1 млн', income: '620 фр./мес', coords: [[[1.5,49.1],[3.4,49.2],[3.2,48.3],[2.0,48.0],[1.2,48.3],[1.5,49.1]]] },
  { name: 'Шампань',           color: '#2a7838', hcolor: '#349848', pop: '0.8 млн', income: '180 фр./мес', coords: [[[3.4,49.2],[5.4,49.6],[5.8,48.6],[4.8,48.0],[3.2,48.3],[3.4,49.2]]] },
  { name: 'Эльзас-Лотарингия', color: '#267038', hcolor: '#309048', pop: '1.2 млн', income: '210 фр./мес', coords: [[[5.4,49.6],[8.2,48.9],[7.6,47.6],[5.8,47.2],[5.8,48.6],[5.4,49.6]]] },
  { name: 'Бретань',           color: '#2a6835', hcolor: '#348645', pop: '2.0 млн', income: '160 фр./мес', coords: [[ [-5.1,48.5],[-1.5,48.8],[-1.5,47.0],[-4.8,47.3],[-5.1,48.5] ]] },
  { name: 'Долина Луары',      color: '#307840', hcolor: '#3c9850', pop: '1.6 млн', income: '200 фр./мес', coords: [[ [-1.5,47.0],[1.5,47.2],[2.0,46.2],[0.5,45.8],[-0.5,45.5],[-1.5,46.0],[-1.5,47.0] ]] },
  { name: 'Пуату',             color: '#267038', hcolor: '#309048', pop: '0.9 млн', income: '130 фр./мес', coords: [[ [-2.5,47.0],[-1.5,47.0],[-1.5,46.0],[-0.5,45.5],[-1.5,45.2],[-2.5,45.5],[-2.5,47.0] ]] },
  { name: 'Гасконь',           color: '#248030', hcolor: '#2ea040', pop: '1.5 млн', income: '150 фр./мес', coords: [[ [-2.5,45.5],[-1.5,45.2],[0.0,44.8],[0.0,43.3],[-1.8,43.3],[-2.5,44.0],[-2.5,45.5] ]] },
  { name: 'Лангедок',          color: '#2a7030', hcolor: '#349040', pop: '1.3 млн', income: '160 фр./мес', coords: [[ [0.0,43.3],[0.0,44.8],[3.0,44.5],[4.8,43.7],[3.2,43.1],[0.0,43.3] ]] },
  { name: 'Прованс',           color: '#267238', hcolor: '#309248', pop: '0.7 млн', income: '140 фр./мес', coords: [[ [4.8,43.7],[7.6,43.8],[7.6,43.3],[6.0,42.8],[4.8,43.0],[4.8,43.7] ]] },
  { name: 'Бургундия',         color: '#2e7840', hcolor: '#389850', pop: '1.1 млн', income: '190 фр./мес', coords: [[ [2.0,48.0],[4.8,48.0],[5.0,46.8],[4.0,45.8],[2.5,45.8],[2.0,46.2],[2.0,48.0] ]] },
  { name: 'Овернь',            color: '#288040', hcolor: '#32a050', pop: '1.0 млн', income: '110 фр./мес', coords: [[ [2.5,45.8],[4.0,45.8],[4.0,44.8],[3.0,44.5],[2.0,44.8],[2.0,45.5],[2.5,45.8] ]] },
];

function updateLabelVisibility() {
  const scale = vb.w / W;
  // Названия появляются только при достаточном приближении
  const show = scale < 0.55;
  franceG.selectAll('.prov-label').attr('visibility', show ? 'hidden' : 'visible');
}

function drawMap() {
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
    const countries = topojson.feature(world, world.objects.countries);

    // Мировые страны — тёмно-серые
    worldG.selectAll('path.country')
      .data(countries.features).join('path')
      .attr('class', 'country')
      .attr('d', pathGen)
      .attr('fill', '#1e2e3e')
      .attr('stroke', '#2a3e54')
      .attr('stroke-width', '0.5')
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill', '#263848');
        tooltip.style.display = 'block';
        document.getElementById('t-name').textContent = 'Неизвестная страна';
        document.getElementById('t-info').textContent = 'Данные не определены';
      })
      .on('mousemove', e => {
        const r = mapWrap.getBoundingClientRect();
        tooltip.style.left = (e.clientX - r.left + 12) + 'px';
        tooltip.style.top  = (e.clientY - r.top  - 55) + 'px';
      })
      .on('mouseleave', e => {
        d3.select(e.currentTarget).attr('fill', '#1e2e3e');
        tooltip.style.display = 'none';
      });

    // Провинции Франции
    franceProvinces.forEach(prov => {
      const geo = { type: 'Feature', geometry: { type: 'Polygon', coordinates: prov.coords } };
      const p = pathGen(geo);
      if (!p) return;

      franceG.append('path').datum(prov)
        .attr('d', p)
        .attr('fill', prov.color)
        .attr('stroke', '#0a1a10')
        .attr('stroke-width', '1')
        .style('cursor', 'pointer')
        .on('mouseover', function(e, d) {
          d3.select(this).attr('fill', d.hcolor);
          tooltip.style.display = 'block';
          document.getElementById('t-name').textContent = d.name;
          document.getElementById('t-info').textContent = '👥 ' + d.pop + ' · 💰 ' + d.income;
        })
        .on('mousemove', e => {
          const r = mapWrap.getBoundingClientRect();
          tooltip.style.left = (e.clientX - r.left + 12) + 'px';
          tooltip.style.top  = (e.clientY - r.top  - 55) + 'px';
        })
        .on('mouseleave', function(e, d) {
          d3.select(this).attr('fill', d.color);
          tooltip.style.display = 'none';
        });

      const c = pathGen.centroid(geo);
      if (c && !isNaN(c[0])) {
        franceG.append('text')
          .attr('class', 'prov-label')
          .attr('x', c[0]).attr('y', c[1])
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '8')
          .attr('fill', '#c0e0c0')
          .attr('pointer-events', 'none')
          .text(prov.name);
      }
    });

    // Маркер Парижа
    const parisXY = proj([2.35, 48.85]);
    franceG.append('circle')
      .attr('cx', parisXY[0]).attr('cy', parisXY[1]).attr('r', 3)
      .attr('fill', '#f0c040').attr('stroke', '#907010').attr('stroke-width', '1')
      .attr('pointer-events', 'none');
    franceG.append('text')
      .attr('x', parisXY[0] + 5).attr('y', parisXY[1] - 3)
      .attr('font-size', '8').attr('fill', '#f0c040')
      .attr('pointer-events', 'none').text('★ Париж');

    updateLabelVisibility();

  }).catch(() => {
    svg.append('text').attr('x', W/2).attr('y', H/2)
      .attr('text-anchor', 'middle').attr('font-size', '14')
      .attr('fill', '#5a8aaa').text('Ошибка загрузки карты. Проверьте соединение.');
  });
}

// ---- Зум и перетаскивание ----
let dragging = false, ds = { x: 0, y: 0 };
let vb = { x: 0, y: 0, w: 960, h: 560 };

mapWrap.addEventListener('mousedown', e => { dragging = true; ds = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const scale = vb.w / mapWrap.offsetWidth;
  vb.x -= (e.clientX - ds.x) * scale;
  vb.y -= (e.clientY - ds.y) * scale;
  vb.x = Math.max(-400, Math.min(600, vb.x));
  vb.y = Math.max(-200, Math.min(400, vb.y));
  svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  ds = { x: e.clientX, y: e.clientY };
  updateLabelVisibility();
});
window.addEventListener('mouseup', () => dragging = false);

mapWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.15 : 0.87;
  const nw = Math.max(80, Math.min(1800, vb.w * f));
  const nh = Math.max(45, Math.min(1100, vb.h * f));
  const rect = mapWrap.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top)  / rect.height;
  vb.x += vb.w * mx - nw * mx;
  vb.y += vb.h * my - nh * my;
  vb.w = nw; vb.h = nh;
  svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  updateLabelVisibility();
}, { passive: false });

// Запускаем карту
drawMap();
