// ============================================================
// GAME.JS — ходы, казна, время
// ============================================================

let turn = 1, month = 0, year = 1852, treasury = 4200, incomePerMonth = 580;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// Динамическое состояние власти — может меняться через события ИИ
let stateOfPower = {
  ruler: 'Луи-Наполеон Бонапарт',
  government: 'Президентская республика',
  pm: 'Эжен Руэр'
};

async function nextTurn() {
  const btn = document.querySelector('.next-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Симуляция...';

  turn++; month++;
  if (month >= 12) { month = 0; year++; }
  treasury += incomePerMonth;

  document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.';
  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  // Запускаем ИИ-события
  await onTurnEnd();

  btn.disabled = false;
  btn.textContent = 'Следующий месяц ▶';
}

// Изменить показатели (вызывается из ИИ-триггеров)
function changeGameStat(stat, delta) {
  if (stat === 'treasury') { treasury += delta; document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.'; }
  if (stat === 'army') {
    const cur = parseInt(document.getElementById('army').textContent.replace(/\s/g,''));
    document.getElementById('army').textContent = (cur + delta).toLocaleString('ru');
  }
  if (stat === 'stability') {
    const cur = parseInt(document.getElementById('stab').textContent);
    document.getElementById('stab').textContent = Math.max(0, Math.min(100, cur + delta));
  }
  if (stat === 'income') {
    incomePerMonth += delta;
    document.getElementById('income').textContent = (incomePerMonth >= 0 ? '+' : '') + incomePerMonth.toLocaleString('ru') + ' фр.';
  }
}

// Изменить главу государства / форму правления / премьер-министра
function changePowerState(field, value) {
  if (!value) return;
  if (field === 'ruler') {
    stateOfPower.ruler = value;
    const el = document.getElementById('ruler-name');
    if (el) el.textContent = value;
  }
  if (field === 'government') {
    stateOfPower.government = value;
    const titleEl = document.getElementById('ruler-title');
    const badgeEl = document.getElementById('govbadge-text');
    if (titleEl) titleEl.textContent = value === 'Империя' ? 'Император французов' : 'Президент Французской республики';
    if (badgeEl) badgeEl.textContent = '🏛 ' + value;
  }
  if (field === 'pm') {
    stateOfPower.pm = value;
    const el = document.getElementById('pm-name');
    if (el) el.textContent = value;
  }
}
