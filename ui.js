// ============================================================
// UI.JS — панели, попапы, уведомления
// ============================================================

let panelOpen = true;

function togglePanel() {
  panelOpen = !panelOpen;
  const p = document.getElementById('left-panel');
  const t = document.getElementById('toggle-btn');
  const m = document.getElementById('map-wrap');
  if (panelOpen) {
    p.classList.remove('hidden');
    t.style.left = '280px';
    t.textContent = '◀';
    t.classList.remove('closed');
    m.style.left = '280px';
  } else {
    p.classList.add('hidden');
    t.style.left = '0px';
    t.textContent = '▶';
    t.classList.add('closed');
    m.style.left = '0';
  }
}

function toggle(id) {
  const el  = document.getElementById(id);
  const btn = el.previousElementSibling;
  el.classList.toggle('open');
  btn.textContent = (el.classList.contains('open') ? '▼ ' : '▶ ') + btn.textContent.slice(2);
}

function togglePop(show, hide) {
  document.getElementById(hide).style.display = 'none';
  const s = document.getElementById(show);
  s.style.display = s.style.display === 'block' ? 'none' : 'block';
}

function sendMsg() {
  const t = document.getElementById('diplo-txt').value.trim();
  if (!t) return;
  showNotif('📜 Послание отправлено всем державам');
  document.getElementById('diplo-txt').value = '';
  document.getElementById('diplo-pop').style.display = 'none';
}

function showNotif(msg) {
  const e = document.createElement('div');
  e.className   = 'notif';
  e.textContent = msg;
  document.body.appendChild(e);
  setTimeout(() => e.remove(), 3300);
}

// ============================================================
// БУДУЩИЕ ФУНКЦИИ — ИИ и сущности на карте
// ============================================================

// Изменить цвет страны (вызывается ИИ-триггером)
function changeCountryColor(countryId, newColor) {
  d3.selectAll('path.country')
    .filter(d => d && d.id == countryId)
    .attr('fill', newColor);
}

// Создать точку-сущность на карте (армия, завод, посольство и т.д.)
// type — просто метка, никаких жёстких ограничений
function createMapEntity({ lon, lat, label, color = '#f0c040', radius = 4 }) {
  const xy = proj([lon, lat]);
  const g  = d3.select('#france-g'); // или отдельный слой entities-g

  g.append('circle')
    .attr('cx', xy[0]).attr('cy', xy[1]).attr('r', radius)
    .attr('fill', color).attr('stroke', '#000').attr('stroke-width', '0.5')
    .attr('class', 'map-entity')
    .style('cursor', 'pointer')
    .on('mouseover', (e) => {
      tooltip.style.display = 'block';
      document.getElementById('t-name').textContent = label;
      document.getElementById('t-info').textContent = 'Сущность на карте';
    })
    .on('mousemove', e => {
      const r = mapWrap.getBoundingClientRect();
      tooltip.style.left = (e.clientX - r.left + 12) + 'px';
      tooltip.style.top  = (e.clientY - r.top  - 55) + 'px';
    })
    .on('mouseleave', () => { tooltip.style.display = 'none'; });

  if (label) {
    g.append('text')
      .attr('x', xy[0] + 6).attr('y', xy[1] - 3)
      .attr('font-size', '8').attr('fill', color)
      .attr('pointer-events', 'none').text(label);
  }
}
