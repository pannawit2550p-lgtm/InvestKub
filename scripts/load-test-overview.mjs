// Isolated two-server test: real migration/coordinator, synthetic upstream, no real API credits.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';

const pgliteModule = process.env.PGLITE_MODULE;
if (!pgliteModule) throw new Error('Set PGLITE_MODULE to an installed @electric-sql/pglite/dist/index.js (test dependency only)');
const { PGlite } = await import(pathToFileURL(pgliteModule).href);
const db = new PGlite();
const servers = [];
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const overviewUrl = dataUrl(compile(await readFile('src/lib/market/overview.ts', 'utf8')));
const sharedSource = compile(await readFile('src/lib/market/overview-shared.ts', 'utf8')).replace("'./overview'", JSON.stringify(overviewUrl));
const { createSharedOverviewCache } = await import(dataUrl(sharedSource));
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const store = (key) => ({
  async read() {
    const [row] = await query('select * from market_overview_cache where cache_key=$1', [key]);
    return row ? { payload: row.payload, expires: +new Date(row.expires_at), retryAt: +new Date(row.retry_at), failures: row.failures } : null;
  },
  async acquire(ttl) { return (await query('select acquire_overview_refresh($1,$2) as token', [key, ttl / 1000]))[0].token; },
  async publish(token, payload, ttl) { return (await query('select publish_overview_refresh($1,$2,$3,$4) as ok', [key, token, JSON.stringify(payload), ttl / 1000]))[0].ok; },
  async fail(token) { await query('select fail_overview_refresh($1,$2)', [key, token]); },
});
let providerCalls = 0;
const fixture = () => ({ asOf: Date.now(), fetchedAt: Date.now(), session: 'open', isDelayed: false,
  delayMinutes: 0, mode: 'etf-proxy', stale: false, refreshFailed: false,
  items: ['SPY', 'QQQ', 'DIA'].map((symbol, i) => ({ id: ['spx', 'ixic', 'dji'][i], name: symbol, symbol,
    price: 100, previousClose: 99, change: 1, changePercent: 1.01, series: [], seriesRange: null, source: 'synthetic-load-test' })) });
const load = async () => { providerCalls += 3; await new Promise((resolve) => setTimeout(resolve, 80)); return fixture(); };
const percentile = (times, fraction) => times[Math.ceil(times.length * fraction) - 1];
async function burst(urls, concurrency) {
  const times = []; let errors = 0; const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
    const start = performance.now();
    try {
      const response = await fetch(urls[i % urls.length], { signal: AbortSignal.timeout(15_000) });
      const body = await response.json(); if (!response.ok || body.items?.length !== 3) errors++;
    } catch { errors++; }
    times.push(performance.now() - start);
  }));
  times.sort((a, b) => a - b);
  return { concurrency, requests: concurrency, errors, errorPct: errors / concurrency * 100,
    p50Ms: +percentile(times, .5).toFixed(1), p95Ms: +percentile(times, .95).toFixed(1),
    p99Ms: +percentile(times, .99).toFixed(1), elapsedMs: +(performance.now() - started).toFixed(1) };
}
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  const migration = await readFile('supabase/migrations/0014_market_overview_shared.sql', 'utf8');
  await db.exec(migration); await db.exec(migration); // migration is repeatable
  const fencing = store('fencing'); const old = await fencing.acquire(60_000);
  await query("update market_overview_cache set lease_until=now()-interval '1 second' where cache_key='fencing'");
  const current = await fencing.acquire(60_000);
  assert.notEqual(old, current); assert.equal(await fencing.publish(old, fixture(), 60_000), false);
  await fencing.fail(old);
  assert.equal((await query("select lease_token from market_overview_cache where cache_key='fencing'"))[0].lease_token, current);
  assert.equal(await fencing.publish(current, fixture(), 60_000), true);
  const transition = store('transition'); const token = await transition.acquire(900_000);
  await transition.publish(token, { ...fixture(), fetchedAt: Date.now() - 120_000 }, 900_000);
  assert.equal(await transition.acquire(900_000), null);
  assert.ok(await transition.acquire(60_000)); // opening market shortens the closed-market TTL
  const permissions = await query("select has_table_privilege('authenticated','market_overview_cache','SELECT') as table_access, has_function_privilege('anon','acquire_overview_refresh(text,integer)','EXECUTE') as rpc_access");
  assert.equal(permissions[0].table_access, false); assert.equal(permissions[0].rpc_access, false);
  const urls = [];
  for (let i = 0; i < 2; i++) {
    const get = createSharedOverviewCache(store('load-test'), load, () => 'open');
    const server = createServer(async (_, response) => {
      try { const body = await get(); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); }
      catch { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end('{}'); }
    });
    servers.push(server); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    urls.push(`http://127.0.0.1:${server.address().port}/`);
  }
  const results = [];
  for (const concurrency of [50, 100, 200]) {
    const before = providerCalls;
    results.push({ ...(await burst(urls, concurrency)), syntheticQuoteCalls: providerCalls - before });
  }
  assert.equal(providerCalls, 3); assert.ok(results.every((result) => result.errors === 0));
  const failedStore = store('failure'); let failedCalls = 0;
  const failedLoad = async () => { failedCalls++; throw new Error('synthetic429'); };
  await assert.rejects(createSharedOverviewCache(failedStore, failedLoad, () => 'open')());
  await assert.rejects(createSharedOverviewCache(failedStore, failedLoad, () => 'open')());
  assert.equal(failedCalls, 1);
  console.log(JSON.stringify({ scope: 'isolated HTTP / two coordinators / PGlite / synthetic provider; NOT production capacity',
    checks: ['SQL repeatable', 'expired owner fenced', 'shared backoff', 'market-open TTL', 'private permissions'],
    realProviderCalls: 0, totalSyntheticQuoteCalls: providerCalls, results }, null, 2));
} finally {
  await Promise.all(servers.map((server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })));
  await db.close();
}
