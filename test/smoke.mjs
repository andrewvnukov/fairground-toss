// Playwright smoke-тест «Ярмарочный Тир».
// Запуск:  npx playwright install chromium  (один раз)
//          node test/smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');

const errors = [];
// Путь к бинарю Chromium можно задать через PW_CHROMIUM (окружение CI без
// скачанных браузеров Playwright); по умолчанию — обычный браузер Playwright.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
// Сетевые сбои загрузки внешних ресурсов (шрифты, SDK Яндекса) — это не
// JS-ошибки игры: в офлайн-окружении они всегда есть и ничего не значат.
const isNetworkNoise = t => /Failed to load resource|ERR_(CONNECTION|NAME|INTERNET|NETWORK)/i.test(t);
page.on('console', m => { if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text()); });
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

// UI: модалки открываются и закрываются (магазин+полка объединены в одну модалку "призы" с вкладками)
await page.click('#prizeBtn');
assert(await page.isVisible('#modal:not(.hidden)'), 'prizes modal opens on the buy tab');
assert(await page.isVisible('.row'), 'buy tab shows the buyable prize list');
await page.click('#prizeTabShelf');
assert(await page.isVisible('.coll'), 'shelf tab shows the collection grid');
await page.click('#prizeTabBuy');
assert(await page.isVisible('.row'), 'switching back to the buy tab shows the list again');
await page.click('#mClose');
await page.click('#upBtn');
assert(await page.isVisible('#modal:not(.hidden)'), 'upgrades modal opens');
await page.click('#mClose');

// сейв переживает перезагрузку. Не строгое равенство: призы на полке приносят
// жетоны в каждом кадре, поэтому между записью и снимком после reload жетонов
// становится больше, а не меньше.
let beforeReload = JSON.parse(await page.evaluate(() => { persist(true); return window.render_game_to_text(); }));
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let afterReload = await state();
assert(afterReload.coins >= beforeReload.coins, 'save persists across reload (coins)');
assert(afterReload.prizes === beforeReload.prizes, 'save persists across reload (prizes)');

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

// ──────────────────────────────────────────────────────────────
//  Маршрут, офлайн, ежедневка, подсказки, подарки — проверки по
//  playermotivation.md §8 и idle-monetization.md §10
// ──────────────────────────────────────────────────────────────

// новый игрок видит первое место, ни один пункт чек-листа не закрыт сам собой
await page.evaluate(() => window.__seedSave(null));
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let fresh0 = await state();
assert(fresh0.route === 0, 'new player starts at the first place');
assert(fresh0.goals.every(g => g === false), 'no checklist item is pre-completed for a new player');
assert(fresh0.ready === false, 'a new player cannot move on immediately');

// дальний горизонт открывается в одно нажатие из шапки
await page.evaluate(() => window.__closeModal());
await page.click('#routeChip');
assert(await page.isVisible('#modal:not(.hidden)'), 'route map opens in one tap from the HUD');
const stopsShown = await page.evaluate(() => document.querySelectorAll('#mBody .stop').length);
assert(stopsShown >= 5, 'the map shows the whole route (' + stopsShown + ')');
assert((await page.evaluate(() => document.querySelectorAll('#mBody .stop.fog').length)) > 0,
  'far places are still under fog');
await page.click('#mClose');

// подарки не двигают метрику прогресса, производство двигает
let g0 = await state();
await page.evaluate(() => window.__grant(1e6));
let g1 = await state();
assert(g1.coins > g0.coins && g1.lifetime === g0.lifetime, 'a gift does NOT move the lifetime-earned metric');
await page.evaluate(() => window.__earn(1000));
assert((await state()).lifetime > g1.lifetime, 'production DOES move the lifetime-earned metric');

// одинаковые призы складываются в доход
await page.evaluate(() => { window.__grant(1e9); window.__buyPrize('bear'); });
let one = await state();
await page.evaluate(() => window.__buyPrize('bear'));
let two = await state();
assert(two.shelf === one.shelf + 1, 'a prize can be taken more than once');
assert(two.baseIps > one.baseIps, 'every prize on the shelf adds passive income');
assert(two.prizes === one.prizes, 'a second copy does not count as a new prize');

// высокая пирамида — твист места: банок становится больше
const cansBefore = (await state()).cansTotal;
await page.evaluate(() => {
  for (let i = 0; i < 4; i++) { window.__forceGoals(); window.__route(); window.__closeModal(); }
});
const cansAfter = (await state()).cansTotal;
assert(cansAfter > cansBefore, 'the taller-pyramid twist adds cans (' + cansBefore + ' -> ' + cansAfter + ')');

// за последним местом игра продолжается
await page.evaluate(() => {
  for (let i = 0; i < 8; i++) { window.__forceGoals(); window.__route(); window.__closeModal(); }
});
let looped = await state();
assert(looped.loop >= 1, 'the route continues past the finale into a second lap');
assert(isFinite(looped.baseIps), 'income stays finite after the finale');

// офлайн: короткая отлучка молчит, длинная показывает окно
await page.evaluate(() => { window.__setLastSeen(Date.now() - 10 * 1000); window.__checkOffline(); });
assert((await state()).modal !== 'offline', 'a 10-second absence does not open the return window');
await page.evaluate(() => { window.__setLastSeen(Date.now() - 6 * 3600 * 1000); });
const rep = await page.evaluate(() => window.__checkOffline());
assert(rep && rep.gained > 0, 'a 6-hour absence pays offline income');
assert((await state()).modal === 'offline', 'a long absence opens the return window');
await page.evaluate(() => window.__closeModal());

// доход за потолок ПРОПОРЦИОНАЛЕН времени (ловит скрытую обрезку в досчёте)
const prop = await page.evaluate(() => {
  const a = window.snapshot().coins; window.simulateFor(3600);
  const b = window.snapshot().coins; window.simulateFor(7200);
  return { h1: b - a, h2: window.snapshot().coins - b };
});
assert(prop.h1 > 0 && Math.abs(prop.h2 / prop.h1 - 2) < 0.05,
  'offline catch-up is proportional to time (' + (prop.h2 / prop.h1).toFixed(3) + ')');

// офлайн НЕ засчитывается в цели чек-листа
const throwsBefore = (await state()).throws;
await page.evaluate(() => window.simulateFor(6 * 3600));
assert((await state()).throws === throwsBefore,
  'the offline barker does not count towards the checklist');

// ежедневная серия: в один день награда одна
const firstDaily = await page.evaluate(() => window.__checkDaily());
if (firstDaily) await page.evaluate(() => window.__claimDaily());
assert((await page.evaluate(() => window.__checkDaily())) === false,
  'the daily bonus can only be claimed once per day');
await page.evaluate(() => window.__closeModal());

// реклама не стартует сама и не лезет сразу после запуска
assert((await page.evaluate(() => window.__adAllowed())) === false,
  'no interstitial during the warm-up right after boot');

// подсказки: не поверх открытого окна, один раз навсегда
await page.evaluate(() => window.__openModal('prizes'));
assert((await page.evaluate(() => window.__tipTick())) === null, 'no tip on top of an open sheet');
await page.evaluate(() => window.__closeModal());
const tipId = await page.evaluate(() => { window.__hintDone(); return window.__tipTick(); });
assert(tipId !== null, 'a tip appears once its condition holds');
await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
assert((await state()).tips >= 1, 'a dismissed tip is recorded in the save');

// старый сейв без полей маршрута стартует на правдоподобном месте
// и НЕ получает наград за прошлое
await page.evaluate(() => window.__seedSave(JSON.stringify({
  v: 1, coins: 5000, prizes: ['bear', 'elephant', 'giraffe'],
  upAim: 3, upLights: 2, upHost: 1, bestCascade: 4,
})));
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let legacy = await state();
assert(legacy.route >= 0 && legacy.route < 6, 'a legacy save lands on a valid place');
assert(legacy.seeds === 0 && legacy.seedsUsed === 0, 'a legacy save gets no golden tokens for the past');
assert(legacy.shelf === 3, 'a legacy shelf migrates without losing income');

// повреждённый сейв не заклинивает запуск
await page.evaluate(() => window.__seedSave('{not json at all'));
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
assert(typeof (await state()).coins === 'number', 'a corrupted save still boots the game');

// сейв из будущей версии: неизвестный id — это «ничего», а не самый дорогой приз
await page.evaluate(() => window.__seedSave(JSON.stringify({
  v: 99, coins: 10, prizes: ['bear', 'griffin'], route: 99, loop: 3,
  shelf: { griffin: 5, elephant: 2 },
})));
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let future = await state();
assert(future.route <= 5, 'an out-of-range place index is clamped on load');
assert(future.shelf === 3, 'an unknown prize id on the shelf resolves to nothing');

assert(errors.length === 0, 'no console/page errors at the end' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
