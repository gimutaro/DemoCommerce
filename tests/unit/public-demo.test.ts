import { expect, it } from 'vitest';
import app from '../../src/worker';
import { publicDemoConfigured } from '../../src/worker/lab';
import { assertM1Environment } from '../../scripts/assert-lab-isolated';
import type { Bindings } from '../../src/worker/config';
it('public demo exposes only the dedicated lab, still requiring Supabase auth for identities', async () => {
  const env = { PUBLIC_DEMO_ENABLED:'true',APP_ENV:'lab',LAB_ENABLED:'true',DATA_MODE:'supabase',LAB_SYNTHETIC_ONLY:'true',SUPABASE_URL:'https://dmagegescrocnfwffxog.supabase.co',LAB_SUPABASE_URL:'https://dmagegescrocnfwffxog.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test' };
  expect(publicDemoConfigured(env)).toBe(true);
  expect(publicDemoConfigured({...env,SUPABASE_URL:'https://other.supabase.co'})).toBe(false);
  expect(publicDemoConfigured({...env,APP_ENV:'production'})).toBe(false);
  expect(()=>assertM1Environment({...env,LAB_SYNTHETIC_ONLY:'false'})).toThrow();
  const result=await app.request('https://shop.example.test/api/config',{},env as Bindings);
  expect(result.status).toBe(200);
  expect(await result.text()).not.toContain('sb_secret');
  expect((await app.request('https://shop.example.test/api/lab/orders/2000000a-0000-4000-8000-000000000001',{},env as Bindings)).status).toBe(401);
});
