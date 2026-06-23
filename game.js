// ============================================================
// GAME.JS — ходы, казна, время
// ============================================================

let turn = 1, month = 0, year = 1852, treasury = 4200, incomePerMonth = 580;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

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

// Изменить показатели (вызывается из ИИ-триггеров в будущем)
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
}
