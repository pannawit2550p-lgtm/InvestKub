// Isolated layout fixture using the project's real CSS and podium assets.
// node scripts/test-podium-layout.mjs <playwright/index.mjs> <Edge executable> <output directory>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
try {
  const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const images = await Promise.all([2, 1, 3].map(async (rank) => {
    const png = await readFile(new URL(`../public/leaderboard/rank-${rank}.png`, import.meta.url));
    return `<div class="lb-podium-item lb-podium-item-${rank}">
      <button class="lb-podium-rank lb-podium-rank-${rank}" aria-label="อันดับ ${rank}"><span class="lb-podium-visual">
      <span class="lb-podium-avatar investkub-avatar" style="background:#39364b;border-radius:50%">${rank}</span>
      <img class="lb-podium-frame" style="position:absolute;inset:0;width:100%;height:100%" src="data:image/png;base64,${png.toString('base64')}" alt="" /></span></button>
      <button class="lb-podium-info"><strong class="lb-podium-name">ผู้เล่นอันดับ ${rank}</strong>
      <span class="lb-podium-total"><small>มูลค่าพอร์ต</small><strong>3,360,000.00 บาท</strong></span>
      <span class="leader-performance gain"><span>↑ +12.34%</span><small>(+320,450.00 บาท)</small></span></button>
    </div>`;
  }));
  const page = await browser.newPage();
  for (const [width, height] of [[320, 740], [360, 740], [390, 844], [768, 1024], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<html lang="th"><head><style>${css}</style></head><body><div class="app-shell"><main><div class="leaderboard-page">
      <header class="leaderboard-heading"><div><h1>อันดับ</h1><p>จัดอันดับจากผลตอบแทนของพอร์ตจำลองของทุกบัญชี</p></div></header>
      <section class="leaderboard-podium">${images.join('')}</section><section class="leaderboard-lower-list">
      <button class="leaderboard-player-row"><span class="leaderboard-row-rank">4</span><span>●</span><span class="leaderboard-row-name"><strong>ผู้เล่นอันดับ 4</strong></span><span class="leaderboard-row-value"><strong>3,360,000 บาท</strong></span></button>
      </section></div></main></div></body></html>`);
    const metrics = await page.evaluate(() => {
      const rect = (element) => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width }; };
      return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        ranks: [...document.querySelectorAll('.lb-podium-item')].map((item) => ({ visual: rect(item.querySelector('.lb-podium-visual')), info: rect(item.querySelector('.lb-podium-info')) })),
        list: rect(document.querySelector('.leaderboard-lower-list')) };
    });
    assert.ok(metrics.scrollWidth <= metrics.viewport, `${width}: horizontal overflow`);
    for (const rank of metrics.ranks) assert.ok(rank.info.top >= rank.visual.bottom + 8, `${width}: info overlaps podium`);
    assert.ok(metrics.list.top >= Math.max(...metrics.ranks.map((rank) => rank.info.bottom)) + 24, `${width}: rank 4 too close`);
    assert.ok(metrics.ranks[1].visual.width > metrics.ranks[0].visual.width, `${width}: first podium should be larger`);
    if (width >= 768) {
      assert.ok(metrics.ranks[0].visual.width > 205);
      assert.ok(metrics.ranks[1].visual.width > 260);
    }
    if (process.argv[4] && (width === 390 || width === 1366)) await page.screenshot({ path: path.join(process.argv[4], `podium-${width}.png`), fullPage: true });
    console.log(`PASS ${width}x${height}: no horizontal overflow; all info cards below podiums; rank 4 separated; visual widths ${metrics.ranks.map((rank) => Math.round(rank.visual.width)).join('/')}`);
  }
} finally { await browser.close(); }
