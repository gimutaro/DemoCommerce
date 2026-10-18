import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Bindings } from './config';

// Public hackathon mode was explicitly requested. Pin it to this synthetic project.
export function publicDemoConfigured(env: Partial<Bindings>): boolean {
  return env.PUBLIC_DEMO_ENABLED === 'true' && env.APP_ENV === 'lab'
    && env.LAB_ENABLED === 'true' && env.DATA_MODE === 'supabase'
    && env.LAB_SYNTHETIC_ONLY === 'true'
    && env.SUPABASE_URL === 'https://dmagegescrocnfwffxog.supabase.co'
    && env.LAB_SUPABASE_URL === env.SUPABASE_URL;
}

// Vite removes this path from production builds. It is only for loopback development.
export function localDemoConfigured(env: Partial<Bindings>): boolean {
  return import.meta.env.DEV && env.APP_ENV === 'local' && env.LAB_ENABLED === 'false'
    && env.LOCAL_DEMO_ENABLED === 'true' && env.DATA_MODE === 'supabase'
    && /^http:\/\/127\.0\.0\.1:54321$/.test(env.SUPABASE_URL ?? '')
    && !!env.SUPABASE_SECRET_KEY;
}

export function labConfigured(env: Partial<Bindings>): boolean {
  if (localDemoConfigured(env)) return true;
  if (publicDemoConfigured(env) && env.SUPABASE_SECRET_KEY) return true;
  return env.APP_ENV === 'lab' && env.LAB_ENABLED === 'true'
    && env.DATA_MODE === 'supabase' && env.LAB_SYNTHETIC_ONLY === 'true'
    && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL ?? '')
    && env.SUPABASE_URL === env.LAB_SUPABASE_URL
    && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN ?? '')
    && !!env.ACCESS_AUD && !!env.SUPABASE_SECRET_KEY;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAccess(token: string | undefined, env: Bindings): Promise<boolean> {
  if (!token || !labConfigured(env)) return false;
  const issuer = env.ACCESS_TEAM_DOMAIN!;
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keys);
  }
  try {
    await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat'] });
    return true;
  } catch { return false; }
}
