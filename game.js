// ============================================================
// GAME.JS — игровая логика: ходы, время, казна
// ============================================================

let turn     = 1;
let month    = 0;   // 0 = Январь
let year     = 1852;
let treasury = 4200;
let incomePerMonth = 580;

const months = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

function nextTurn() {
  turn++;
  month++;
  if (month >= 12) { month = 0; year++; }

  treasury += incomePerMonth;

  // Обновляем UI
  document.getElementById('treasury').textContent  = treasury.toLocaleString('ru') + ' фр.';
  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  showNotif('📅 ' + months[month] + ' ' + year + ' — новый месяц');

  // Здесь в будущем: триггеры ИИ, события, изменения на карте
  runAITriggers();
}

// ---- Заглушка для будущих ИИ-триггеров ----
function runAITriggers() {
  // Пример: каждые 12 ходов что-то происходит
  if (turn % 12 === 0) {
    showNotif('📰 Прошёл год. Мир меняется...');
  }
  // Здесь будут вызовы: changeCountryColor(), createMapEntity(), etc.
}
