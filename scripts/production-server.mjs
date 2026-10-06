// Keep the production build separate so benchmarking never overwrites next dev.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const action = process.argv[2];
if (!['build', 'start'].includes(action)) throw new Error('Expected build or start');
const extra = process.argv.slice(3);
const args = [action, ...extra];
if (action === 'start' && !extra.some(arg => arg === '-p' || arg === '--port' || arg.startsWith('--port='))) args.push('-p', '3001');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...args], {
  env: { ...process.env, NEXT_DIST_DIR: '.next-production' }, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
