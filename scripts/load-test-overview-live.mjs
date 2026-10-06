// Opt-in live backend integration: no auth bypass, no public test route, no orders.
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

if (process.env.OVERVIEW_LIVE_WORKER === '1') {
  const counters = { finnhub: 0, twelvedata: 0, upstream429: 0, upstream5xx: 0 };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const provider = url.hostname === 'finnhub.io' ? 'finnhub' : url.hostname === 'api.twelvedata.com' ? 'twelvedata' : null;
    if (provider) counters[provider]++;
    const response = await originalFetch(input, init);
    if (provider && response.status === 429) counters.upstream429++;
    if (provider && response.status >= 500) counters.upstream5xx++;
    return response;
  };
  const { getMarketOverview } = createRequire(import.meta.url)(process.env.OVERVIEW_LIVE_BUNDLE);
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/metrics') { response.end(JSON.stringify(counters)); return; }
    if (request.url !== '/overview' || request.method !== 'GET') { response.writeHead(404); response.end('{}'); return; }
    try {
      const value = await getMarketOverview();
      // Return only public market data; never profile/portfolio credentials.
      response.end(JSON.stringify({ fetchedAt: value.fetchedAt, asOf: value.asOf, stale: value.stale,
        refreshFailed: value.refreshFailed, symbols: value.items.map((item) => item.symbol),
        charts: value.items.map((item) => ({ symbol: item.symbol, points: item.series.length })) }));
    } catch { response.writeHead(503); response.end(JSON.stringify({ error: 'overview_unavailable' })); }
  });
  server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('disconnect', () => { server.close(); server.closeAllConnections(); });
} else {
  if (!process.argv.includes('--live')) throw new Error('Explicit --live is required: this uses real provider quota');
  process.loadEnvFile('.env.local');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const quota = async () => {
    const { data, error } = await admin.from('market_provider_tokens').select('provider,quota_day,calls_today');
    if (error) throw new Error(`Shared quota table unavailable (${error.code})`);
    return data;
  };
  const { error } = await admin.from('market_overview_cache').select('cache_key').limit(1);
  if (error) throw new Error(`Migration 0014 unavailable (${error.code})`);
  const before = await quota();
  const directory = await mkdtemp(join(tmpdir(), 'investkub-live-overview-'));
  const bundle = join(directory, 'overview.cjs');
  await build({ entryPoints: ['src/lib/market/overview-server.ts'], outfile: bundle, bundle: true,
    platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent',
    plugins: [{ name: 'server-marker-in-node-harness', setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty-marker' }));
      builder.onLoad({ filter: /.*/, namespace: 'empty-marker' }, () => ({ contents: '', loader: 'js' }));
    } }],
  });
  const children = [];
  const metrics = []; const results = []; let cold;
  try {
    const urls = [];
    for (let i = 0; i < 2; i++) {
      const child = fork(new URL(import.meta.url), [], { env: { ...process.env, OVERVIEW_LIVE_WORKER: '1',
        OVERVIEW_LIVE_BUNDLE: bundle, NODE_PATH: resolve('node_modules') }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      children.push(child);
      const port = await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('Worker start timeout')), 15_000);
        child.once('message', (message) => { clearTimeout(timer); res(message.port); });
        child.once('exit', () => { clearTimeout(timer); rej(new Error('Worker startup failed')); });
      });
      urls.push(`http://127.0.0.1:${port}`);
    }
    const started = performance.now();
    const response = await fetch(`${urls[0]}/overview`, { signal: AbortSignal.timeout(30_000) });
    cold = { status: response.status, ms: +(performance.now() - started).toFixed(1), snapshot: await response.json() };
    if (!response.ok || cold.snapshot.refreshFailed) throw new Error(`Live warm-up failed (${response.status}); no burst traffic sent`);
    for (const [concurrency, requests] of [[5, 30], [10, 60], [20, 100]]) {
      let cursor = 0; let errors = 0; const times = []; const statuses = {};
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (cursor < requests) {
          const index = cursor++; const start = performance.now();
          try {
            const res = await fetch(`${urls[index % 2]}/overview`, { signal: AbortSignal.timeout(15_000) });
            const value = await res.json(); statuses[res.status] = (statuses[res.status] ?? 0) + 1;
            if (!res.ok || value.symbols?.length !== 3 || value.refreshFailed) errors++;
          } catch { errors++; }
          times.push(performance.now() - start);
        }
      }));
      times.sort((a, b) => a - b);
      results.push({ concurrency, requests, statuses, errors, errorPct: errors / requests * 100,
        p50Ms: +times[Math.ceil(times.length * .5) - 1].toFixed(1),
        p95Ms: +times[Math.ceil(times.length * .95) - 1].toFixed(1), p99Ms: +times[Math.ceil(times.length * .99) - 1].toFixed(1) });
      if (errors) break;
    }
    for (const url of urls) metrics.push(await (await fetch(`${url}/metrics`)).json());
  } catch (failure) {
    // Never print upstream URLs, headers, API keys or raw fetch exceptions.
    console.log(JSON.stringify({ scope: 'live backend integration', cold, results, completed: false,
      reason: failure.message?.startsWith('Live warm-up failed') ? failure.message : 'Harness failed; inspect test setup' }, null, 2));
    process.exitCode = 1;
  } finally {
    for (const child of children) child.kill();
  }
  const after = await quota();
  const quotaDelta = after.map((row) => ({ provider: row.provider,
    admittedCallsDelta: before.find((prior) => prior.provider === row.provider && prior.quota_day === row.quota_day)
      ? row.calls_today - before.find((prior) => prior.provider === row.provider).calls_today : null }));
  if (!process.exitCode) console.log(JSON.stringify({ scope: 'two real Node processes / live Supabase and providers; NOT Next authenticated HTTP or user capacity',
    cold, results, upstreamRequestsByProcess: metrics, quotaDelta, quotaNote: 'Includes other app traffic; UTC-day rollover yields null' }, null, 2));
}
