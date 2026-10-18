import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

// Read generated local credentials directly from CLI stdout without logging them.
// This command only configures local development, never a hosted project.
function mergeLocalFile(path: string, updates: Record<string, string>) {
  let existing: Record<string, string | undefined> = {};
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${path} must be a regular file.`);
    existing = parseEnv(readFileSync(path, 'utf8'));
    if (existing.APP_ENV && existing.APP_ENV !== 'local') throw new Error(`Refusing to replace nonlocal settings in ${path}.`);
    if (existing.SUPABASE_URL && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(existing.SUPABASE_URL).hostname)) throw new Error(`Refusing to replace remote settings in ${path}.`);
  }
  execFileSync('git', ['check-ignore', '--quiet', '--', path], { stdio: 'ignore' });
  const contents = Object.entries({ ...existing, ...updates }).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
  writeFileSync(path, `# Generated local-only configuration. Never commit or print values.\n${contents}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

try {
  const status = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url)), 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Record<string, string>;
  const url = status.API_URL;
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const secretKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!url || !publicKey || !secretKey || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('A running local Supabase stack is required.');
  const demo = process.argv.includes('--demo');
  mergeLocalFile('.dev.vars', { APP_ENV: 'local', LAB_ENABLED: 'false', DATA_MODE: 'supabase', SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, LOCAL_DEMO_ENABLED: demo ? 'true' : 'false', SUPABASE_SECRET_KEY: demo ? secretKey : '' });
  mergeLocalFile('.env.local', { APP_ENV: 'local', SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: secretKey });
  console.log('Local Worker and fixture configuration saved in ignored files (0600). No credentials printed. Restart the dev server after configuration changes.');
} catch {
  console.error('Could not configure local Supabase. Ensure npm run db:start has succeeded and existing local config does not point to a remote project.');
  process.exitCode = 1;
}
