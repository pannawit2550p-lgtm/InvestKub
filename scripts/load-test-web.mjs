// Opt-in real authenticated GET test. Cookie comes from env, never printed or saved.
try { process.loadEnvFile('.env.local'); } catch { /* Environment-only configuration is supported. */ }
const base = new URL(process.env.LOAD_TEST_URL ?? 'http://localhost:3001');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Local server only');
const cookie = process.env.LOAD_TEST_COOKIE;
if (!cookie) throw new Error('Set LOAD_TEST_COOKIE to your test account browser Cookie header; do not commit it');
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 5);
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 30);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50 || !Number.isInteger(requests) || requests < 1 || requests > 500) throw new Error('Bounds: concurrency 1–50, requests 1–500');
const routes = ['/api/market/overview', '/api/rank'];
const preflight = await fetch(new URL(routes[0], base), { headers: { cookie }, signal: AbortSignal.timeout(20_000) });
if (!preflight.ok) throw new Error(`Authenticated preflight failed (${preflight.status}); no load test performed`);
await preflight.arrayBuffer();
async function quotaSnapshot() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const { data, error } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }).from('market_provider_tokens')
    .select('provider,quota_day,calls_today');
  return error ? null : data;
}
const quotaBefore = await quotaSnapshot();
let cursor = 0; let errors = 0; const times = []; const statuses = {}; const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < requests) {
    const i = cursor++; const start = performance.now();
    try {
      const response = await fetch(new URL(routes[i % routes.length], base), { headers: { cookie }, signal: AbortSignal.timeout(20_000) });
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      await response.arrayBuffer(); if (!response.ok) errors++;
    } catch { errors++; statuses.network = (statuses.network ?? 0) + 1; }
    times.push(performance.now() - start);
  }
}));
times.sort((a, b) => a - b);
const quotaAfter = await quotaSnapshot();
const quotaDelta = quotaBefore && quotaAfter ? quotaAfter.map((row) => {
  const previous = quotaBefore.find((item) => item.provider === row.provider);
  return { provider: row.provider, admittedCallsDelta: previous?.quota_day === row.quota_day
    ? row.calls_today - previous.calls_today : null };
}) : null;
console.log(JSON.stringify({ scope: 'authenticated local GET; one account; not distinct-user DB workload', concurrency, requests, statuses,
  errors, errorPct: errors / requests * 100, p50Ms: times[Math.ceil(times.length * .5) - 1],
  p95Ms: times[Math.ceil(times.length * .95) - 1], p99Ms: times[Math.ceil(times.length * .99) - 1],
  elapsedMs: performance.now() - started, quotaDelta,
  quotaNote: 'Shared guard counters; includes other traffic, excludes preflight, null if unavailable/day rollover; not upstream success counts' }, null, 2));
