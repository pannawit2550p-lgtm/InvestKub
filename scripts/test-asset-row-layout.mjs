import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
const baseline = process.argv.includes('--before');
try {
  const css = await readFile('src/app/globals.css', 'utf8');
  // Use the same locally built Noto Sans Thai faces as the running Next app.
  const fontCss = await readFile('.next/static/css/app/layout.css', 'utf8');
  const faces = fontCss.match(/@font-face\s*\{[^}]+\}/g) ?? [];
  let fonts = faces.join('\n');
  for (const name of [...new Set([...fonts.matchAll(/url\(\/_next\/static\/media\/([^)]+)\)/g)].map(m=>m[1]))]) {
    const bytes = await readFile(path.join('.next/static/media', name));
    fonts = fonts.replaceAll(`/_next/static/media/${name}`, `data:font/woff2;base64,${bytes.toString('base64')}`);
  }
  const family = fonts.match(/font-family:\s*'([^']+)'/)?.[1] ?? 'Arial';
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import AssetRow, * as parts from './src/components/AssetRow';
    const root=createRoot(document.getElementById('fixture'));
    window.renderRows=(showTag=true, loading=false, context='card')=>root.render(React.createElement('div',{className:context==='search'?'dropdown asset-list':'card asset-list',style:context==='search'?{position:'static',maxHeight:'none'}:{}},
      ...Array.from({length:20},(_,i)=>{
        const props={key:i,symbol:['AAPL','BRK.B','ABCDE'][i%3],name:'Taiwan Semiconductor Manufacturing Company Limited Long Name',price:i===4?undefined:[0.2619,1.2,1234.56,12345.67][i%4],currency:i===3?'THB':'USD',changePct:i===4?undefined:[2.16,-.22,0,-.0001][i%4],showTag,
          onToggleWatch:context==='search'?undefined:()=>window.watchCount=(window.watchCount||0)+1};
        return loading&&parts.AssetRowSkeleton?React.createElement(parts.AssetRowSkeleton,{key:i,showTag,withTrailing:context!=='search'}):React.createElement(AssetRow,props);
      })));
    window.renderRows();` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' },
    plugins: [{ name: 'fixture-link', setup(b) {
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react'; export default function Link(props){return React.createElement('a',props)}",loader:'js',resolveDir:process.cwd()}));
    }}] });
  const page = await browser.newPage();
  for (const width of [320,360,390,430,768,1280]) {
    await page.setViewportSize({width,height:900});
    await page.setContent(`<style>${fonts}\n${css}\n:root{--font-noto-sans-thai:'${family}'}</style><main style="max-width:600px;margin:auto;padding:16px"><h2>หุ้นสหรัฐฯ ทั้งหมด</h2><div id="fixture"></div></main><script>${bundle.outputFiles[0].text}</script>`);
    await page.waitForSelector('.asset-row');
    await page.evaluate(()=>document.fonts.ready);
    if (process.argv[4] && [360,1280].includes(width)) await page.screenshot({path:path.join(process.argv[4],`asset-row-${baseline?'before':'after'}-${width}.png`),fullPage:true});
    const heights=[];
    for (const [showTag,loading,context] of [[true,false,'card'],[false,false,'card'],[true,true,'card'],[true,false,'search']]) {
      await page.evaluate(([s,l,c])=>window.renderRows(s,l,c),[showTag,loading,context]);
      await page.waitForTimeout(60);
      const metrics=await page.evaluate(()=>{
        const rows=[...document.querySelectorAll('.asset-row')];
        const height=rows[0].getBoundingClientRect().height;
        return {height,scroll:document.documentElement.scrollWidth,width:innerWidth,count:rows.length,
          overlaps:rows.some(row=>{const info=row.querySelector('.asset-row-info'),value=row.querySelector('.asset-row-value');return info&&value&&info.getBoundingClientRect().right>value.getBoundingClientRect().left+1}),
          priceOverflow:[...document.querySelectorAll('.asset-row-value')].some(n=>n.scrollWidth>n.clientWidth+1),
          text:document.querySelector('#fixture').textContent,href:document.querySelector('.asset-row-main')?.getAttribute('href'),
          logo:document.querySelector('.asset-row-logo')?.getBoundingClientRect().width};
      });
      heights.push(metrics.height);
      if (!baseline) {
        assert.ok(metrics.scroll<=metrics.width,`${width}: page overflow`);
        assert.ok(!metrics.overlaps&&!metrics.priceOverflow,`${width}: overlapping/clipped prices`);
        assert.ok(metrics.height>=(showTag?64:52)&&metrics.height<=(showTag?76:60),`${width}: row height ${metrics.height} tag=${showTag} loading=${loading} context=${context}`);
        assert.equal(metrics.count,20);
        if(!loading) {assert.equal(metrics.logo,36);assert.equal(metrics.href,'/stock/AAPL');assert.ok(metrics.text.includes('0.2619'));assert.ok(metrics.text.includes('1.20'));assert.ok(metrics.text.includes('1,234.56'));assert.ok(!metrics.text.includes('-0.00%'));}
      }
    }
    if(!baseline) assert.ok(Math.abs(heights[0]-heights[2])<=1, 'skeleton must match actual row height');
    console.log(`${baseline?'BEFORE':'PASS'} ${width}px: tagged=${heights[0]}px, noTag=${heights[1]}px, skeleton=${heights[2]}px, search=${heights[3]}px`);
    if(!baseline) {await page.evaluate(()=>window.renderRows());await page.waitForTimeout(30);await page.getByRole('button',{name:'เพิ่มในรายการติดตาม'}).first().click();assert.ok(await page.evaluate(()=>window.watchCount>0));}
  }
} finally {await browser.close();}
