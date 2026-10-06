// Tests the actual React ProfileCard in headless Edge with fixture data only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
try {
  const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import ProfileCard from './src/components/ProfileCard';
    import {calculatePortfolio} from './src/lib/portfolio/calc';
    import {thbToUsd} from './src/lib/currency';
    const root=createRoot(document.querySelector('#fixture'));
    window.renderProfile=(scenario)=>{
      const profile={public_id:'public-display-uuid',player_number:4321,created_at:'2026-10-05T00:00:00Z',display_name:'นักลงทุนชื่อภาษาไทยยาวมากทดสอบ',display_name_custom:true,starting_balance:thbToUsd(100000),reward_balance:thbToUsd(scenario.reward||0),leaderboard_visible:scenario.visible!==false,avatar_type:'initial',avatar_character:null,avatar_url:null};
      const calc=calculatePortfolio(thbToUsd(scenario.value),thbToUsd(100000+(scenario.reward||0)),[],{},0);
      const portfolio={portfolio_value:calc.portfolioValue,total_pl:calc.totalPl,total_pl_pct:calc.totalPlPct,reward_balance:profile.reward_balance};
      root.render(React.createElement(ProfileCard,{profile:scenario.loading?undefined:profile,portfolio:scenario.loading||scenario.error?undefined:portfolio,rank:scenario.rank,loading:!!scenario.loading,portfolioLoading:!!scenario.loading,error:!!scenario.error,retrying:false,onEdit:()=>window.lastAction='edit',onAvatarEdit:()=>window.lastAction='avatar',onCopy:n=>window.lastAction='copy:'+n,onRetry:()=>window.lastAction='retry'}));
    };` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' } });
  const page = await browser.newPage();
  const scenarios = [
    { rank: 1, value: 836994.23 }, { rank: 2, value: 87655 }, { rank: 3, value: 100000 },
    { rank: 15, value: 12345678.9, reward: 15000 }, { rank: 1, value: 100000, visible: false },
    { rank: null, value: 0, loading: true }, { rank: null, value: 0, error: true },
  ];
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<html><head><style>${css}</style></head><body><div class="app-shell"><main><div class="settings-profile-page"><div id="fixture"></div></div></main></div><script>${bundle.outputFiles[0].text}</script></body></html>`);
    await page.waitForFunction(() => typeof window.renderProfile === 'function');
    for (const scenario of scenarios) {
      await page.evaluate((data) => window.renderProfile(data), scenario);
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(() => {
        const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width }; };
        return { scroll: document.documentElement.scrollWidth, viewport: innerWidth, card: rect('.investkub-profile-card'), identity: rect('.profile-card-identity'), edit: rect('.profile-card-edit'),
          overflow: [...document.querySelectorAll('.profile-stat-number')].some((node) => node.getBoundingClientRect().right > node.closest('dd').getBoundingClientRect().right + 1),
          hasRank: !!document.querySelector('.profile-rank-link'), rankHref: document.querySelector('.profile-rank-link')?.getAttribute('href'), text: document.querySelector('.investkub-profile-card').textContent };
      });
      assert.ok(metrics.scroll <= metrics.viewport, `${width}: horizontal overflow (${JSON.stringify(scenario)})`);
      assert.equal(metrics.overflow, false, `${width}: money overflow (${JSON.stringify(scenario)})`);
      if (width <= 430) assert.ok(metrics.edit.top >= metrics.identity.bottom + 10, `${width}: edit button must wrap`);
      if (width >= 768) assert.ok(metrics.edit.top < metrics.identity.bottom, `${width}: edit button should be inline`);
      if (scenario.visible === false || scenario.loading || scenario.rank === null) assert.equal(metrics.hasRank, false);
      else assert.equal(metrics.rankHref, '/rank?self=1');
      if (scenario.error) assert.ok(metrics.text.includes('โหลดข้อมูลไม่สำเร็จ'));
      if (scenario.reward) assert.ok(metrics.text.includes('รางวัลบทเรียน'));
    }
    if (process.argv[4] && width === 390) {
      await page.evaluate(() => window.renderProfile({ rank: 1, value: 836994.23, reward: 15000 }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(process.argv[4], 'profile-390.png'), fullPage: true });
    }
    console.log(`PASS ${width}px: positive/negative/zero; ranks 1/2/3/15/hidden; rewards; loading/error; long names/millions; edit button placement and no overflow`);
  }
  await page.getByRole('button', { name: 'เปลี่ยนรูปโปรไฟล์' }).click();
  assert.equal(await page.evaluate(() => window.lastAction), 'avatar');
  await page.getByRole('button', { name: 'แก้ไขโปรไฟล์', exact: true }).click();
  assert.equal(await page.evaluate(() => window.lastAction), 'edit');
  await page.getByRole('button', { name: 'คัดลอกรหัสผู้เล่น 4321' }).click();
  assert.equal(await page.evaluate(() => window.lastAction), 'copy:4321');
  console.log('PASS: pencil, edit, and player-number buttons call their existing handlers');
} finally { await browser.close(); }
