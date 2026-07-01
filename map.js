// MAP.JS v6 — карта + объекты на карте (армии, штабы, передвижения)
const W = 960, H = 560;

// Известные страны: ID в world-atlas → название (для кликов и тултипов)
const KNOWN_COUNTRIES = {
  '826': { name: 'Великобритания', label: '👑 Премьер-министр лорд Абердин' },
  '643': { name: 'Россия',         label: '👑 Царь Николай I' },
  '40':  { name: 'Австрия',        label: '👑 Император Франц Иосиф I' },
  '276': { name: 'Пруссия',        label: '👑 Король Фридрих Вильгельм IV' },
};
const proj = d3.geoNaturalEarth1().scale(153).translate([W/2, H/2]);
const pathGen = d3.geoPath(proj);
const svgEl   = document.getElementById('map-svg');
const mapWrap = document.getElementById('map-wrap');
const tooltip = document.getElementById('tooltip');
const svg     = d3.select('#map-svg');
const worldG  = svg.select('#world-g');
const franceG = svg.select('#france-g');
const labelsG = svg.select('#labels-g');
const objectsG = svg.select('#objects-g');

// Цвет территории каждой страны — своя территория и всё захваченное красится в цвет владельца
const COUNTRY_COLORS = {
  'Франция':        '#2a5aa8',
  'Великобритания': '#a82a2a',
  'Россия':         '#3a7a3a',
  'Австрия':        '#8a5a1a',
  'Пруссия':        '#5a5a7a',
  'Испания':        '#c8a040'
};

const PROVINCE_INFO = {
  'Île-de-France':               { pop:'2.1 млн', income:'620 фр./мес' },
  'Normandie':                   { pop:'1.4 млн', income:'240 фр./мес' },
  'Bretagne':                    { pop:'2.0 млн', income:'160 фр./мес' },
  'Pays de la Loire':            { pop:'1.6 млн', income:'200 фр./мес' },
  'Centre-Val de Loire':         { pop:'1.1 млн', income:'150 фр./мес' },
  'Bourgogne-Franche-Comté':     { pop:'1.1 млн', income:'190 фр./мес' },
  'Grand Est':                   { pop:'1.4 млн', income:'210 фр./мес' },
  'Hauts-de-France':             { pop:'1.0 млн', income:'180 фр./мес' },
  'Auvergne-Rhône-Alpes':        { pop:'1.8 млн', income:'230 фр./мес' },
  "Provence-Alpes-Côte d'Azur":  { pop:'0.8 млн', income:'140 фр./мес' },
  'Occitanie':                   { pop:'1.4 млн', income:'155 фр./мес' },
  'Nouvelle-Aquitaine':          { pop:'2.1 млн', income:'170 фр./мес' },
  'Corse':                       { pop:'0.2 млн', income:'60 фр./мес'  },
};

// ID Франции в world-atlas (250 = France)
const FRANCE_ID = '250';

// ---- НАСТРОЙКИ ОТОБРАЖЕНИЯ (сохраняются в localStorage) ----
// showCountryLabels — показывать ли подписи с названиями стран (сами страны/границы видны всегда, иначе по ним нельзя будет кликать)
let showCountryLabels = localStorage.getItem('gs1852_show_labels') !== '0';
let countryLabelScale = parseFloat(localStorage.getItem('gs1852_label_scale')) || 1.2;
let objectScale = parseFloat(localStorage.getItem('gs1852_obj_scale')) || 1.8;

function setShowCountryLabels(v) {
  showCountryLabels = v;
  localStorage.setItem('gs1852_show_labels', v ? '1' : '0');
  labelsG.style('display', v ? null : 'none');
}

function setCountryLabelScale(v) {
  countryLabelScale = v;
  localStorage.setItem('gs1852_label_scale', v);
  updateCountryLabels();
}

function setObjectScale(v) {
  objectScale = v;
  localStorage.setItem('gs1852_obj_scale', v);
  renderMapObjects();
}

// Подпись страны — константный размер на экране независимо от зума карты
function addCountryLabel(name, coordsOrFeature, isFeature) {
  const xy = isFeature ? pathGen.centroid(coordsOrFeature) : proj(coordsOrFeature);
  if (!xy || isNaN(xy[0])) return;
  labelsG.append('text')
    .attr('class', 'country-label')
    .attr('data-cx', xy[0]).attr('data-cy', xy[1])
    .attr('x', xy[0]).attr('y', xy[1])
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('fill', '#2a2a2a').attr('font-family', 'Georgia,serif')
    .attr('pointer-events', 'none')
    .attr('paint-order', 'stroke')
    .attr('stroke', '#fff').attr('stroke-width', 2.2)
    .text(name);
}

function updateCountryLabels() {
  const zoom = W / vb.w;
  labelsG.selectAll('.country-label')
    .attr('font-size', d => (9 * countryLabelScale) / zoom)
    .attr('stroke-width', 2.2 / zoom);
}

// Известные города — координаты [lon, lat] для размещения объектов на карте.
// ИИ ссылается на эти названия в EFFECTS.map_objects.
const CITY_COORDS = {
  'Париж': [2.3488, 48.8534],
  'Марсель': [5.3698, 43.2965],
  'Лион': [4.8357, 45.7640],
  'Тулуза': [1.4442, 43.6047],
  'Бордо': [-0.5792, 44.8378],
  'Страсбург': [7.7521, 48.5734],
  'Брест': [-4.4861, 48.3904],
  'Тулон': [5.9280, 43.1242],
  'Лондон': [-0.1278, 51.5074],
  'Мадрид': [-3.7038, 40.4168],
  'Барселона': [2.1734, 41.3851],
  'Берлин': [13.4050, 52.5200],
  'Вена': [16.3738, 48.2082],
  'Санкт-Петербург': [30.3351, 59.9343],
  'Москва': [37.6173, 55.7558],
  'Рим': [12.4964, 41.9028]
};

function lighten(hex) {
  const n = parseInt(hex.slice(1),16);
  const r = Math.min(255,((n>>16)&0xff)+35);
  const g = Math.min(255,((n>>8) &0xff)+35);
  const b = Math.min(255,( n     &0xff)+35);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function positionTooltip(e) {
  const r = mapWrap.getBoundingClientRect();
  tooltip.style.left = (e.clientX - r.left + 14)+'px';
  tooltip.style.top  = (e.clientY - r.top  - 58)+'px';
}

// Парижский маркер — масштабируется с зумом
let parisXY = null;
function updateParis() {
  if (!parisXY) return;
  const zoom = W / vb.w;
  const r  = 2 / zoom;
  const fs = 7 / zoom;
  const show = zoom > 3;

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

    // Мировые страны — пропускаем Францию (её рисуем отдельно точнее)
    worldG.selectAll('path.country')
      .data(countries.features.filter(d => String(d.id) !== FRANCE_ID))
      .join('path')
      .attr('class','country')
      .attr('data-country', d => KNOWN_COUNTRIES[String(d.id)] ? KNOWN_COUNTRIES[String(d.id)].name : '')
      .attr('d', pathGen)
      .attr('fill', d => {
        const known = KNOWN_COUNTRIES[String(d.id)];
        if (!known) return '#e8e4dc';
        const owner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf(known.name) : known.name;
        return COUNTRY_COLORS[owner] || '#c8b870';
      })
      .attr('stroke','#888')
      .attr('stroke-width','0.25')
      .style('cursor', d => KNOWN_COUNTRIES[String(d.id)] ? 'pointer' : 'default')
      .on('mouseover',(e,d)=>{
        const known = KNOWN_COUNTRIES[String(d.id)];
        d3.select(e.currentTarget).style('opacity', known ? 0.8 : 1);
        tooltip.style.display='block';
        if (known) {
          const owner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf(known.name) : known.name;
          const ownerStr = owner !== known.name ? ` (владеет: ${owner})` : '';
          const rel = (typeof worldState !== 'undefined') ? (worldState.relations[known.name] || 0) : 0;
          const relStr = (rel > 0 ? '+' : '') + rel;
          const war = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(known.name) ? ' ⚔️ ВОЙНА' : '';
          document.getElementById('t-name').textContent = known.name + ownerStr + war;
          document.getElementById('t-info').textContent = known.label + ' · Отношения: ' + relStr;
        } else {
          document.getElementById('t-name').textContent='Страна';
          document.getElementById('t-info').textContent='Нет данных';
        }
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', (e,d)=>{
        d3.select(e.currentTarget).style('opacity', 1);
        tooltip.style.display='none';
      })
      .on('click', (e, d) => {
        const known = KNOWN_COUNTRIES[String(d.id)];
        if (typeof gameStarted !== 'undefined' && !gameStarted) {
          if (known && typeof selectPlayableCountry === 'function') selectPlayableCountry(known.name);
          return;
        }
        if (known && typeof openCountryRelations === 'function') {
          openCountryRelations(known.name);
        }
      });

    // Подписи известных стран — отдельный слой, масштаб фиксирован на экране
    countries.features
      .filter(d => KNOWN_COUNTRIES[String(d.id)])
      .forEach(d => addCountryLabel(KNOWN_COUNTRIES[String(d.id)].name, d, true));

    // Регионы Франции — реальный GeoJSON поверх, все в одном цвете страны-владельца
    franceGeo.features.forEach((feature, i) => {
      const name   = feature.properties.nom;
      const info   = PROVINCE_INFO[name] || { pop:'—', income:'—' };
      const owner  = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf('Франция') : 'Франция';
      const color  = COUNTRY_COLORS[owner] || COUNTRY_COLORS['Франция'];
      const hcolor = lighten(color);

      franceG.append('path')
        .datum(feature)
        .attr('class', 'france-province')
        .attr('d', pathGen)
        .attr('fill', color)
        .attr('stroke','#6a9ac0')   // серо-голубая граница
        .attr('stroke-width','0.4')
        .style('cursor','pointer')
        .on('mouseover', function(e){
          d3.select(this).style('opacity', 0.8);
          tooltip.style.display='block';
          document.getElementById('t-name').textContent = name;
          document.getElementById('t-info').textContent = '👥 '+info.pop+' · 💰 '+info.income;
        })
        .on('mousemove', e => positionTooltip(e))
        .on('mouseleave', function(){
          d3.select(this).style('opacity', 1);
          tooltip.style.display='none';
        })
        .on('click', function(){
          if (typeof gameStarted !== 'undefined' && !gameStarted) {
            if (typeof selectPlayableCountry === 'function') selectPlayableCountry('Франция');
          }
        });
      // Названия регионов больше не рисуются постоянно на карте — только во всплывающей подсказке при наведении
    });

    // Маркер Парижа — масштабируемый
    parisXY = proj([2.3488, 48.8534]);
    franceG.append('circle')
      .attr('id','paris-dot')
      .attr('cx', parisXY[0]).attr('cy', parisXY[1])
      .attr('r', 2.5)
      .attr('fill','#f0c040').attr('stroke','#805000').attr('stroke-width','0.8')
      .attr('pointer-events','none')
      .attr('visibility','hidden');
    franceG.append('text')
      .attr('id','paris-label')
      .attr('x', parisXY[0]+4).attr('y', parisXY[1]-2)
      .attr('font-size','8').attr('fill','#f0c040')
      .attr('font-family','Georgia,serif')
      .attr('pointer-events','none')
      .attr('visibility','hidden')
      .text('★ Париж');

    addCountryLabel('Франция', [2.3488, 46.6], false);
    labelsG.style('display', showCountryLabels ? null : 'none');
    updateLabels();
    renderMapObjects();

  }).catch(err=>{
    console.error(err);
    svg.append('text').attr('x',W/2).attr('y',H/2)
      .attr('text-anchor','middle').attr('font-size','13')
      .attr('fill','#888').text('Ошибка загрузки карты');
  });
}

function updateLabels() {
  updateParis();
  updateCountryLabels();
  updateObjectScale();
}

// Перекрасить все территории по текущим владельцам (вызывается после аннексий/передач)
function renderTerritoryColors() {
  worldG.selectAll('path.country').each(function() {
    const name = d3.select(this).attr('data-country');
    if (!name) return;
    const owner = territoryOwnerOf(name);
    d3.select(this).attr('fill', COUNTRY_COLORS[owner] || '#c8b870');
  });
  const franceOwner = territoryOwnerOf('Франция');
  franceG.selectAll('.france-province').attr('fill', COUNTRY_COLORS[franceOwner] || COUNTRY_COLORS['Франция']);
  const spainOwner = territoryOwnerOf('Испания');
  spainG.selectAll('.spain-territory').attr('fill', COUNTRY_COLORS[spainOwner] || COUNTRY_COLORS['Испания']);
}

// Выбор играбельной страны кликом по карте в главном меню
function selectPlayableCountry(name) {
  if (typeof newGame === 'function') newGame(name);
}

// ---- ЗУМ и перетаскивание ----
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
  updateLabels();
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
  updateLabels();
},{passive:false});

drawMap();

// ============================================================
// ИСПАНИЯ — отдельный слой
// ============================================================
const spainG = svg.select('#spain-g');

function drawSpain() {
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
    const countries = topojson.feature(world, world.objects.countries);
    // ID Испании = 724
    const spain = countries.features.find(d => String(d.id) === '724');
    if (!spain) return;

    spainG.append('path')
      .datum(spain)
      .attr('class', 'spain-territory')
      .attr('d', pathGen)
      .attr('fill', () => {
        const owner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf('Испания') : 'Испания';
        return COUNTRY_COLORS[owner] || COUNTRY_COLORS['Испания'];
      })
      .attr('stroke', '#7a5a10')
      .attr('stroke-width', '0.5')
      .style('cursor', 'pointer')
      .on('mouseover', function(e) {
        d3.select(this).style('opacity', 0.8);
        tooltip.style.display = 'block';
        const owner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf('Испания') : 'Испания';
        const ownerStr = owner !== 'Испания' ? ` (владеет: ${owner})` : '';
        const rel = (typeof worldState !== 'undefined') ? (worldState.relations['Испания'] || 0) : 0;
        const war = (typeof worldState !== 'undefined') && worldState.atWarWith.includes('Испания') ? ' ⚔️ ВОЙНА' : '';
        document.getElementById('t-name').textContent = 'Испания' + ownerStr + war;
        document.getElementById('t-info').textContent = '👑 Королева Изабелла II · Отношения: ' + (rel > 0 ? '+' : '') + rel;
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', function() {
        d3.select(this).style('opacity', 1);
        tooltip.style.display = 'none';
      })
      .on('click', function() {
        if (typeof gameStarted !== 'undefined' && !gameStarted) {
          if (typeof selectPlayableCountry === 'function') selectPlayableCountry('Испания');
          return;
        }
        if (typeof openCountryRelations === 'function') openCountryRelations('Испания');
      });

    addCountryLabel('Испания', spain, true);
    updateCountryLabels();
  });
}

drawSpain();

// ============================================================
// ОБЪЕКТЫ НА КАРТЕ — армии, штабы, передвижения (создаются через EFFECTS от ИИ)
// ============================================================
const TYPE_ICONS = { army: '⚔️', hq: '🏛', naval: '⚓', diplomat: '🕊️', other: '📍' };
const OWNER_COLORS = { rebel: '#7a1a1a', foreign: '#8a1a1a' };

function ownerColor(owner) {
  const pc = (typeof playerCountry !== 'undefined') ? playerCountry : 'Франция';
  if (owner === pc) return COUNTRY_COLORS[pc] || '#1a3a8a';
  if (owner === 'Бунтовщики' || owner === 'Мятежники') return OWNER_COLORS.rebel;
  return COUNTRY_COLORS[owner] || OWNER_COLORS.foreign;
}

// Суммарные войска игрока, уже размещённые на карте (для проверки лимита общей армии)
function totalFrenchTroopsOnMap(excludeId) {
  if (typeof worldState === 'undefined' || !worldState.mapObjects) return 0;
  const pc = (typeof playerCountry !== 'undefined') ? playerCountry : 'Франция';
  return worldState.mapObjects
    .filter(o => o.owner === pc && o.type === 'army' && o.id !== excludeId)
    .reduce((sum, o) => sum + (o.troops || 0), 0);
}

// Применить массив действий над объектами карты (вызывается из ai.js после EFFECTS)
function applyMapObjects(list) {
  if (!Array.isArray(list) || typeof worldState === 'undefined') return [];
  if (!worldState.mapObjects) worldState.mapObjects = [];
  const changeLog = [];

  list.forEach(item => {
    if (!item || !item.action) return;

    if (item.action === 'create') {
      const loc = CITY_COORDS[item.location];
      if (!loc) return; // неизвестный город — пропускаем
      let troops = item.troops || 0;
      const owner = item.owner || playerCountry;
      const type = item.type || 'other';

      if (owner === playerCountry && type === 'army') {
        const currentArmy = parseInt(document.getElementById('army').textContent.replace(/\s/g,'')) || 0;
        const already = totalFrenchTroopsOnMap(null);
        const room = Math.max(0, currentArmy - already);
        troops = Math.min(troops, room);
        if (troops <= 0) { changeLog.push(`⚠️ Недостаточно свободных солдат для «${item.label}»`); return; }
      }

      const obj = {
        id: item.id || ('obj_' + Date.now() + Math.random().toString(36).slice(2,6)),
        type, owner, label: item.label || 'Объект',
        troops: type === 'army' ? troops : 0,
        location: item.location
      };
      worldState.mapObjects.push(obj);
      changeLog.push(`${TYPE_ICONS[type] || '📍'} Создано: ${obj.label}${obj.troops ? ' (' + obj.troops.toLocaleString('ru') + ')' : ''}`);
    }

    if (item.action === 'remove') {
      const idx = worldState.mapObjects.findIndex(o => o.id === item.id || o.label === item.label);
      if (idx > -1) {
        changeLog.push(`✖ Убрано с карты: ${worldState.mapObjects[idx].label}`);
        worldState.mapObjects.splice(idx, 1);
      }
    }

    if (item.action === 'move') {
      const obj = worldState.mapObjects.find(o => o.id === item.id || o.label === item.label);
      const toLoc = CITY_COORDS[item.to];
      if (obj && toLoc) {
        animateMove(obj, item.to);
        changeLog.push(`➡️ ${obj.label} направляется: ${obj.location} → ${item.to}`);
        obj.location = item.to;
      }
    }
  });

  renderMapObjects();
  return changeLog;
}

function renderMapObjects() {
  if (typeof worldState === 'undefined' || !worldState.mapObjects) return;
  const zoom = W / vb.w;
  const sel = objectsG.selectAll('g.map-obj')
    .data(worldState.mapObjects, d => d.id);

  sel.exit().remove();

  const enter = sel.enter().append('g')
    .attr('class', 'map-obj')
    .attr('id', d => 'mo-' + d.id);

  enter.append('circle').attr('class', 'mo-dot');
  enter.append('text').attr('class', 'mo-icon').attr('text-anchor', 'middle').attr('pointer-events', 'none');
  enter.append('text').attr('class', 'mo-label').attr('text-anchor', 'middle').attr('pointer-events', 'none');

  const merged = enter.merge(sel);
  merged.each(function(d) {
    const loc = CITY_COORDS[d.location];
    if (!loc) return;
    const xy = proj(loc);
    const g = d3.select(this);
    g.select('.mo-dot')
      .attr('cx', xy[0]).attr('cy', xy[1])
      .attr('r', 3 * objectScale / zoom)
      .attr('fill', ownerColor(d.owner))
      .attr('stroke', '#fff').attr('stroke-width', 0.6 / zoom);
    g.select('.mo-icon')
      .attr('x', xy[0]).attr('y', xy[1] - (5 * objectScale) / zoom)
      .attr('font-size', 8 * objectScale / zoom)
      .text(TYPE_ICONS[d.type] || '📍');
    g.select('.mo-label')
      .attr('x', xy[0]).attr('y', xy[1] + (9 * objectScale) / zoom)
      .attr('font-size', 5.5 * objectScale / zoom)
      .attr('fill', '#222')
      .attr('font-family', 'Georgia,serif')
      .text(d.label + (d.troops ? ' «' + d.troops.toLocaleString('ru') + '»' : ''));
    g.style('cursor', 'default')
      .on('mouseover', () => {
        tooltip.style.display = 'block';
        document.getElementById('t-name').textContent = d.label;
        document.getElementById('t-info').textContent = (d.troops ? '👥 ' + d.troops.toLocaleString('ru') + ' чел. · ' : '') + d.location;
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

function updateObjectScale() {
  renderMapObjects();
}

// Анимация передвижения объекта между городами (~3 секунды)
function animateMove(obj, toCityName) {
  const fromLoc = CITY_COORDS[obj.location];
  const toLoc = CITY_COORDS[toCityName];
  if (!fromLoc || !toLoc) return;
  const from = proj(fromLoc), to = proj(toLoc);

  const line = objectsG.append('line')
    .attr('class', 'mo-travel-line')
    .attr('x1', from[0]).attr('y1', from[1])
    .attr('x2', from[0]).attr('y2', from[1])
    .attr('stroke', ownerColor(obj.owner))
    .attr('stroke-width', 0.6)
    .attr('stroke-dasharray', '2,2')
    .attr('opacity', 0.8);

  const dot = objectsG.append('circle')
    .attr('class', 'mo-travel-dot')
    .attr('cx', from[0]).attr('cy', from[1])
    .attr('r', 2.2)
    .attr('fill', ownerColor(obj.owner));

  line.transition().duration(3000).attr('x2', to[0]).attr('y2', to[1]);
  dot.transition().duration(3000)
    .attr('cx', to[0]).attr('cy', to[1])
    .on('end', () => {
      line.remove();
      dot.remove();
      renderMapObjects();
    });

  if (typeof showNotif === 'function') showNotif(`➡️ ${obj.label}: ${obj.location} → ${toCityName}`);
}
