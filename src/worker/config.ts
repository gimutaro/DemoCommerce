import { labConfigured } from './lab';
export interface Bindings {
  ASSETS: Fetcher;
  APP_ENV?: string;
  LAB_ENABLED?: string;
  DATA_MODE?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  LAB_SUPABASE_URL?: string;
  LAB_SYNTHETIC_ONLY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  LOCAL_DEMO_ENABLED?: string;
  PUBLIC_DEMO_ENABLED?: string;
  ATTACK_LAB_ENABLED?: string;
  ATTACK_LAB_SESSION_SECRET?: string;
}

export function isPublishableKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (key.startsWith('sb_secret_')) return false;
  // Classify legacy keys to prevent accidental service-role exposure. This is
  // not JWT verification or user authentication; getUser() verifies user tokens.
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded)) as { role?: string };
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function supabaseConfig(env: Partial<Bindings>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  if (!isPublishableKey(env.SUPABASE_PUBLISHABLE_KEY)) return null;
  try {
    const url = new URL(env.SUPABASE_URL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(env.APP_ENV === 'local' && local && url.protocol === 'http:')) return null;
    return { url: url.origin, publishableKey: env.SUPABASE_PUBLISHABLE_KEY };
  } catch {
    return null;
  }
}

export function dataMode(env: Partial<Bindings>): 'mock' | 'supabase' | 'unconfigured' {
  if (env.LAB_ENABLED && env.LAB_ENABLED !== 'false' && !labConfigured(env)) return 'unconfigured';
  if (env.DATA_MODE === 'mock' && env.APP_ENV === 'local') return 'mock';
  if (env.DATA_MODE === 'supabase' && supabaseConfig(env)) return 'supabase';
  return 'unconfigured';
}
