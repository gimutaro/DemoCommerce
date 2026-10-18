import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { publicDemoConfigured } from '../src/worker/lab';

export function assertM1Environment(values: Record<string, string | undefined>) {
  if (values.LOCAL_DEMO_ENABLED === 'true') throw new Error('Local demo is development-only. Disable LOCAL_DEMO_ENABLED before building.');
  if (values.PUBLIC_DEMO_ENABLED === 'true') {
    if (!publicDemoConfigured(values)) throw new Error('Public demo must use the explicitly dedicated synthetic project.');
    return;
  }
  if (values.LAB_ENABLED && values.LAB_ENABLED !== 'false' && !(values.LAB_ENABLED === 'true' && values.APP_ENV === 'lab' && values.DATA_MODE === 'supabase' && values.LAB_SYNTHETIC_ONLY === 'true' && values.SUPABASE_URL === values.LAB_SUPABASE_URL && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(values.SUPABASE_URL ?? '') && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(values.ACCESS_TEAM_DOMAIN ?? '') && values.ACCESS_AUD)) {
    throw new Error('Lab requires an isolated synthetic Supabase project and Cloudflare Access configuration.');
  }
  if (values.DATA_MODE === 'mock' && values.APP_ENV !== 'local') {
    throw new Error('Mock catalog is restricted to APP_ENV=local.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')) as { vars: Record<string, string> };
  const devVars = existsSync('.dev.vars') ? parseEnv(readFileSync('.dev.vars', 'utf8')) : {};
  // Check all sources, including shadowed unsafe flags, before building.
  for (const source of [config.vars, devVars, process.env]) {
    if (source.LAB_ENABLED && source.LAB_ENABLED !== 'false') assertM1Environment({ ...config.vars, ...source });
  }
  assertM1Environment({ ...config.vars, ...devVars, ...process.env });
  console.log('Environment isolation check passed. Runtime Access verification remains mandatory.');
}
