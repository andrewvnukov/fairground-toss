// Playwright smoke-тест «Ярмарочный Тир».
// Запуск:  npx playwright install chromium  (один раз)
//          node test/smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

let s0 = await state();
assert(typeof s0.coins === 'number', 'render_game_to_text returns state');
assert(s0.cansUp === 6, 'round starts with 6 cans up (3-2-1 pyramid)');

// реальный тап по canvas прямо на рогатке без натяжения (меньше MIN_PULL) — выстрела не должно быть
const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
const anchorX = box.w * 0.5, anchorY = box.h * 0.76;
await page.mouse.click(anchorX, anchorY);
await page.waitForTimeout(50);
let sTapOnly = await state();
assert(sTapOnly.ballActive === false, 'a plain tap below the pull threshold does not fire a shot');

// реальный жест: pointer down -> move (натяжение, почти максимальное) -> up (отпустить) через мышь Playwright
const pullDist = Math.min(box.w, box.h) * 0.19;
await page.mouse.move(anchorX, anchorY);
await page.mouse.down();
await page.mouse.move(anchorX, anchorY + pullDist, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(900);
let sShot = await state();
assert(sShot.ballActive === false, 'real drag-release gesture fires a shot that resolves within 900ms');

// сбрасываем пирамиду к известному состоянию (real-drag тест выше мог уже сбить банки)
await page.evaluate(() => window.__resetRound());

// гарантированный промах не наказывает и не блокирует следующий бросок
let beforeMiss = await state();
await page.evaluate(() => window.__forceMiss());
await page.waitForTimeout(300);
let sMiss = await state();
assert(sMiss.ballActive === false, 'a guaranteed miss clears the ball without penalty');
assert(sMiss.cansUp === beforeMiss.cansUp, 'a miss does not knock down any cans');

// детерминированное попадание в нижнюю центральную банку -> цепная реакция валит несколько банок
let before = await state();
await page.evaluate(() => window.__forceHitBottomCenter());
await page.waitForTimeout(500);
let after = await state();
assert(after.coins > before.coins, 'hitting the bottom-center can awards tokens');
assert(after.bestCascade >= 4, 'bottom-center hit topples a cascade of at least 4 cans (best-cascade record updates)');
assert(after.cansUp === before.cansUp - 4, 'exactly the cascaded cans go down (2 corner cans remain up)');

// добиваем оставшиеся угловые банки по одной, чтобы пирамида полностью очистилась
await page.evaluate(() => window.__forceHitIdx(0));
await page.waitForTimeout(400);
await page.evaluate(() => window.__forceHitIdx(2));
await page.waitForTimeout(2200);
let sReset = await state();
assert(sReset.cansUp === 6, 'pyramid respawns automatically after a full clear');

// прокачка: накопить жетоны и купить приз/апгрейд
await page.evaluate(() => window.__grant(100000));
let beforeBuy = await state();
await page.evaluate(() => window.__buyNextPrize());
let afterBuy = await state();
assert(afterBuy.prizes > beforeBuy.prizes, 'buying the next prize increases the shelf count');
assert(afterBuy.ips > beforeBuy.ips, 'a new prize increases passive income');

let beforeUp = await state();
await page.evaluate(() => window.__buyUp('upAim'));
let afterUp = await state();
assert(afterUp.upAim > beforeUp.upAim, 'buying the accuracy upgrade increases its level');

// пассивный доход капает через хук времени
let beforeIdle = await state();
await page.evaluate(() => window.advanceTime(5000));
let afterIdle = await state();
assert(afterIdle.coins >= beforeIdle.coins, 'time advance does not break state');

// переключатель языка
let beforeLang = await state();
await page.evaluate(() => window.__toggleLang());
let afterLang = await state();
assert(afterLang.lang !== beforeLang.lang, 'language toggle switches lang');

// UI: модалки открываются и закрываются
await page.click('#shopBtn');
assert(await page.isVisible('#modal:not(.hidden)'), 'shop modal opens');
await page.click('#mClose');
await page.click('#upBtn');
assert(await page.isVisible('#modal:not(.hidden)'), 'upgrades modal opens');
await page.click('#mClose');
await page.click('#shelfBtn');
assert(await page.isVisible('#modal:not(.hidden)'), 'prize shelf modal opens');
await page.click('#mClose');

// сейв переживает перезагрузку
let beforeReload = await state();
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let afterReload = await state();
assert(afterReload.coins === beforeReload.coins, 'save persists across reload (coins)');
assert(afterReload.prizes === beforeReload.prizes, 'save persists across reload (prizes)');

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
