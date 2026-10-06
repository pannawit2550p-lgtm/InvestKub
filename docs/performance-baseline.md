# Development versus production baseline

Local Windows / headless Edge, 1366×768, 6 October 2026. Development remains on
3000; an isolated optimized build (`.next-production`) runs on 3001. No trading,
profile, database, provider settings or calculation logic was modified.

## Actual observations

Each HTTP route had one first request and five warm requests, sequentially.
“First” is first in this run, not a guaranteed cold server or clean machine.
Browser runs used a fresh context, then a repeat navigation in that same context.

| Login metric | Development :3000 | Production :3001 |
| --- | --- | --- |
| First HTTP TTFB | 791.1ms | 219.1ms |
| Median warm HTTP TTFB (5 samples) | 75.6ms | 6.2ms |
| Fresh browser DOMContentLoaded | 237.3ms | 61.2ms |
| Fresh browser load event | 462.6ms | 95.0ms |
| Fresh browser LCP | 416ms | 908ms |
| Repeat browser LCP | 140ms | 84ms |
| Fresh browser resource transfer | 3,455,932 bytes | 1,373,469 bytes |
| Repeat browser resource transfer | 2,366,237 bytes | 300 bytes |
| Browser errors | 0 | 0 |

Production warm HTML was ~12× faster in this local sample and first browser
resource transfers ~60% smaller. These are local observations, not guarantees
for internet users or a capacity/load test. Resource transfer includes assets and
Next prefetch requests, not just JavaScript; the build's compressed First Load JS
figures below are a different metric. Development and production browser requests
differ, including link prefetch and caching.

Importantly, **initial LCP was worse in production** in this run. The first
production browser's slow resources included Next's image optimizer (~1,570ms)
and the rocket PNG (~759ms). The rocket source itself is 966,597 bytes. The load
event occurred before some lazy/background/prefetch work; it is not equivalent
to “all page work complete.” Warm/repeat LCP improved to 84ms. Image optimization
and asset loading are the next candidate to investigate, not a proven universal
cause of every slow click. Development first-request compilation and large dev
bundles explain some of the measured local overhead.

Warm signup HTML TTFB: 62.2ms dev vs 4.5ms production. Anonymous redirects were
normal (307), and protected APIs returned 401. **Those API times are only auth
rejection times; no portfolio, quote, ranking, Supabase query or trade latency was
measured.** No user credentials or sessions were requested/exported, and the
benchmark never submits forms or sends orders. Logged-in navigation/API profiling
remains necessary to identify backend bottlenecks.

## Production build evidence

Build passed, including lint/type checks and generation of 33 static pages. Next
reported these First Load JS estimates:

| Route | First Load JS |
| --- | --- |
| Home | 117kB |
| Invest | 123kB |
| Orders | 117kB |
| Rank | 124kB |
| Learn | 113kB |
| Settings | 194kB |
| Login / signup | 178kB |
| Stock detail | 119kB |
| Trade | 122kB |

Settings and authentication have the largest bundles among these pages and are
candidates for dependency/lazy-load inspection, not measured logged-in slowdowns.
Webpack emitted large-string cache serialization warnings during build; these
are build/cache warnings, not proof of production request latency.

## Repeat safely

```powershell
npm.cmd run build:prod
npm.cmd run start:prod
# Opens production on 3001 by default; keep dev on 3000 if comparing.
npm.cmd run benchmark -- http://localhost:3000
npm.cmd run benchmark -- http://localhost:3001
```

Optional browser metrics require an existing Playwright module and Edge executable,
passed as the third/fourth script arguments. No new project package was installed.
The benchmark is local-only and prints aggregate metrics, not response bodies,
cookies, credentials or query-string details. Rerun several times without concurrent
builds/heavy work for a more representative baseline. No Lighthouse score, mobile
throttling, INP, authenticated navigation or multi-user stress test was performed.

Changed files: `package.json`, `.gitignore`, `scripts/production-server.mjs`,
`scripts/benchmark-web.mjs`, this report. Next automatically added
`.next-production/types/**/*.ts` to `tsconfig.json` during the build; existing
strictness and includes were preserved.

Next recommended scope: log in at `http://localhost:3001`, measure real navigation
and API waterfalls, then investigate the image payload and settings/auth bundle
only where measurements justify it. Production is a fixed build: run `build:prod`
again after code changes. Stop its server before rebuilding that same build folder.
