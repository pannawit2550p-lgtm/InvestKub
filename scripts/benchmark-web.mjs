// Read-only local benchmark. Never sends orders, credentials or provider calls.
// Usage: node scripts/benchmark-web.mjs http://localhost:3000 [playwright-module] [browser-exe]
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const base = new URL(process.argv[2] ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Use a local test server only');
const routes = ['/login', '/signup', '/', '/explore', '/api/portfolio', '/api/rank', '/api/market/overview'];
const report = { base: base.origin, authentication: 'anonymous; protected API timings are auth rejection only', routes: [], browser: null };
for (const route of routes) {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    const response = await fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
    const headersAt = performance.now();
    const bytes = (await response.arrayBuffer()).byteLength;
    samples.push({ status: response.status, ttfbMs: +(headersAt - start).toFixed(1), totalMs: +(performance.now() - start).toFixed(1), bytes });
  }
  const warm = samples.slice(1).map(s => s.ttfbMs).sort((a,b) => a-b);
  report.routes.push({ route, first: samples[0], warmMedianTtfbMs: warm[2], warmMaxTtfbMs: warm.at(-1), statuses: [...new Set(samples.map(s => s.status))] });
}
if (process.argv[3] && process.argv[4]) {
  const { chromium } = await import(pathToFileURL(process.argv[3]).href);
  const browser = await chromium.launch({ executablePath: process.argv[4], headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.benchmarkLcp = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.benchmarkLcp = entry.startTime; }).observe({type:'largest-contentful-paint',buffered:true});
    });
    const navigations = [];
    for (let i = 0; i < 2; i++) {
      await page.goto(new URL('/login', base).href, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      navigations.push(await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        return { ttfbMs: +n.responseStart.toFixed(1), domContentLoadedMs: +n.domContentLoadedEventEnd.toFixed(1), loadMs: +n.loadEventEnd.toFixed(1), lcpMs: +window.benchmarkLcp.toFixed(1),
          requests: resources.length, transferBytes: resources.reduce((s,r)=>s+r.transferSize,0),
          scripts: resources.filter(r=>r.initiatorType==='script').length,
          slowestResources: [...resources].sort((a,b)=>b.duration-a.duration).slice(0,5).map(r=>({path:new URL(r.name).pathname,durationMs:+r.duration.toFixed(1)})) };
      }));
    }
    report.browser = { viewport: '1366x768', route: '/login', coldBrowser: navigations[0], repeatBrowser: navigations[1], errors };
  } finally { await browser.close(); }
}
console.log(JSON.stringify(report, null, 2));
