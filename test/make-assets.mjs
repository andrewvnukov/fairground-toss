// Headless-генерация магазинных ассетов (без внешних image-API).
// Делает: скриншоты геймплея с реального билда + обложки RU/EN + иконку из card.html.
// Запуск из папки игры:  node test/make-assets.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'store-assets');
mkdirSync(out, { recursive: true });
const gameUrl = 'file://' + resolve(root, 'index.html');
const cardUrl = 'file://' + resolve(root, 'store', 'card.html');

// ---- CONFIG ----
const CONFIG = {
  titleRu: 'Ярмарочный Тир', titleEn: 'Fairground Toss',
  subRu: 'Сбивай банки рогаткой', subEn: 'Knock down cans with a slingshot',
  // герой обложки: жестяная банка со звездой + летящий мешочек, векторный SVG (без эмодзи)
  heroSvg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
    + '<g transform="translate(52,60)" stroke="#3E2245" stroke-width="3.5" stroke-linejoin="round">'
    + '<ellipse cx="0" cy="26" rx="24" ry="6" fill="#B7BFC9"/>'
    + '<rect x="-24" y="-24" width="48" height="50" rx="3" fill="#E3E8F0"/>'
    + '<rect x="-24" y="-8" width="48" height="22" fill="#E8536B" stroke-width="3"/>'
    + '<g transform="translate(0,3)" stroke="none"><path d="M0,-6.4 L1.693,-2.33 L6.086,-1.978 L2.739,0.89 L3.762,5.178 L0,2.88 L-3.762,5.178 L-2.739,0.89 L-6.086,-1.978 L-1.693,-2.33 Z" fill="#fff"/></g>'
    + '<ellipse cx="0" cy="-24" rx="24" ry="7" fill="#EAEFF5"/>'
    + '<ellipse cx="-8" cy="0" rx="9" ry="16" fill="#fff" opacity=".35" stroke="none"/>'
    + '</g>'
    + '<g stroke="#3E2245" stroke-linejoin="round">'
    + '<path d="M18 14 L29 23 M23 8 L36 19 M14 23 L23 30" stroke="#FFE9A8" stroke-width="3.4" stroke-linecap="round" opacity=".85"/>'
    + '<circle cx="30" cy="26" r="10" fill="#C9A36B" stroke-width="3.5"/>'
    + '<ellipse cx="27" cy="23" rx="3.4" ry="4.4" fill="#fff" opacity=".4" stroke="none"/>'
    + '</g>'
    + '</svg>',
  accent: '#FF6F4A', bg: '#3E2245', ink: '#3E2245',
  // характерные экраны десктопа (1920x1080): свежая пирамида / каскад / полка призов / магазин / улучшения
  shots: [
    ['d1-gameplay', async () => {}],
    ['d2-cascade',  async p => { await p.evaluate(() => window.__forceHitBottomCenter()); await p.waitForTimeout(150); }],
    ['d3-shelf',    async p => { await p.evaluate(() => { window.__grant(1000000); for (let i=0;i<9;i++) window.__buyNextPrize(); }); await p.click('#prizeBtn'); await p.click('#prizeTabShelf'); }],
    ['d4-shop',     async p => { await p.evaluate(() => window.__grant(50000)); await p.click('#prizeBtn'); }],
    ['d5-upgrades', async p => { await p.evaluate(() => window.__grant(50000)); await p.click('#upBtn'); }],
  ],
};

const browser = await chromium.launch();

async function shot(url, w, h, file, prep, locale) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale });
  await page.goto(url);
  await page.waitForTimeout(400);
  if (prep) await prep(page);
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('saved', file);
}

// Скриншоты геймплея (десктоп 1920x1080) — RU и EN локали (авто-язык через navigator.language)
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '.png',    prep, 'ru-RU');
  await shot(gameUrl, 1920, 1080, name + '-en.png', prep, 'en-US');
}

// Обложки 800x470 и иконка 512x512 из card.html
const card = (o) => cardUrl + '?' + new URLSearchParams(o).toString();
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleRu,sub:CONFIG.subRu,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover.png');
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleEn,sub:CONFIG.subEn,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover-en.png');
await shot(card({ w:512,h:512,mode:'icon',heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 512, 512, 'icon.png');

await browser.close();
console.log('\nАссеты готовы в', out);
