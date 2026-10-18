import { it, expect } from 'vitest';
import app from '../../src/worker';
import { localDemoConfigured } from '../../src/worker/lab';
import { assertM1Environment } from '../../scripts/assert-lab-isolated';
import type { Bindings } from '../../src/worker/config';

it('restricts local demonstration to development, loopback database and host', async () => {
  const env = { APP_ENV: 'local', LAB_ENABLED: 'false', DATA_MODE: 'supabase', LOCAL_DEMO_ENABLED: 'true', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'test-only' };
  expect(localDemoConfigured(env)).toBe(true);
  expect(localDemoConfigured({ ...env, APP_ENV: 'production' })).toBe(false);
  expect(localDemoConfigured({ ...env, SUPABASE_URL: 'https://remote.supabase.co' })).toBe(false);
  expect((await app.request('http://remote.example.test/api/health', {}, env as Bindings)).status).toBe(404);
  expect(() => assertM1Environment(env)).toThrow('development-only');
});
