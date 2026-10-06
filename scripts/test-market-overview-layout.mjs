// Render the actual component with controlled fixtures, never provider data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
try {
  const css = await readFile('src/app/globals.css', 'utf8');
  const overviewCss = await readFile('src/components/market-overview.css', 'utf8');
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {MarketOverviewView} from './src/components/MarketOverview';
    import {OVERVIEW_ETFS} from './src/lib/market/overview';
    const root=createRoot(document.getElementById('fixture'));
    window.renderOverview=(scenario)=>{
      const data={asOf:1791230400000,fetchedAt:1791230400000,session:scenario.phase||'open',mode:scenario.mode||'etf-proxy',isDelayed:!!scenario.delayed,delayMinutes:21,stale:false,refreshFailed:!!scenario.failed,
        items:OVERVIEW_ETFS.map((item,i)=>({...item,name:scenario.mode==='index'&&i===1?'NASDAQ':item.name,price:5742.63+i*12000,previousClose:5700,change:i===1?-23.14:i===2?0:24.17,changePercent:i===1?-.42:i===2?0:.42,source:'fixture',seriesRange:scenario.daily?'30D':'1D',series:scenario.empty?[]:Array.from({length:20},(_,j)=>({t:j,v:100+j*(i===1?-1:1)}))}))};
      root.render(React.createElement(MarketOverviewView,{data:scenario.loading||scenario.noData?undefined:data,loading:!!scenario.loading,error:!!scenario.failed,retry:()=>window.retried=true}));
    };` }, bundle: true, write: false, outfile: 'fixture.js', jsx: 'automatic', platform: 'browser', define: { 'process.env': '{}' } });
  const script = bundle.outputFiles.find((f) => !f.path.endsWith('.css')).text;
  const page = await browser.newPage();
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${css}\n${overviewCss}</style><div style="padding:16px;min-width:0"><div id="fixture"></div></div><script>${script}</script>`);
    for (const scenario of [{}, {mode:'index'}, {loading:true}, {noData:true,failed:true}, {failed:true,delayed:true}, {daily:true}, {empty:true}, {phase:'closed'}]) {
      await page.evaluate(s => window.renderOverview(s), scenario); await page.waitForTimeout(30);
      const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        overlaps: [...document.querySelectorAll('.market-overview-value,.market-overview-name')].some(el => el.scrollWidth > el.clientWidth + 1),
        cards: document.querySelectorAll('[role=group]').length, text: document.querySelector('.market-overview').textContent }));
      assert.ok(metrics.scroll <= metrics.width, `${width} page overflow ${JSON.stringify(scenario)}`);
      assert.equal(metrics.overlaps, false, `${width} card text overflow ${JSON.stringify(scenario)}`);
      assert.equal(metrics.cards, 3);
      if (!scenario.mode && !scenario.loading) assert.ok(!metrics.text.includes('5,742.63'), 'ETF price must not masquerade as an index');
    }
    console.log(`PASS ${width}px: proxy/index, loading, failure, stale, empty/daily chart, closed; no overflow`);
  }
} finally { await browser.close(); }
