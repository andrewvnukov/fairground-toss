// Прогон баланса без интерфейса (idle-economy-balance.md §10).
// Считает ВРЕМЯ ДО ВЕХ в минутах активной игры, а не единицы валюты.
//   node test/balance.mjs            — «оптимальный» бот
//   node test/balance.mjs greedy     — «жадный» (берёт самое дешёвое)
//   node test/balance.mjs stubborn   — «упрямый» (копит только на виды)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');
const strategy = process.argv[2] || 'optimal';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });

const rows = await page.evaluate(async (strategy) => {
  const st = window.__bal;                       // см. хуки внизу index.html
  return st(strategy);
}, strategy);

console.log('стратегия:', strategy);
console.log('веха                      актив.время   офлайн   доход/с      призов ур.  зёрен');
for (const r of rows) {
  const t = m => (Math.floor(m/60) + ':' + String(Math.floor(m%60)).padStart(2,'0'));
  console.log(
    r.label.padEnd(24),
    t(r.minutes).padStart(11),
    (r.offlineH+' ч').padStart(8),
    r.ips.toExponential(2).padStart(10),
    String(r.species).padStart(7),
    String(r.ups).padStart(4),
    String(r.seeds).padStart(6));
}
const total = rows.length ? rows[rows.length-1] : null;
if (total) {
  const days = (total.minutes/ (3*13)).toFixed(1);   // 3 захода по ~13 минут в день
  console.log('\nвсего активной игры: ' + Math.round(total.minutes) + ' мин ≈ ' + days + ' дней при 3 заходах по 13 мин');
}
await browser.close();
