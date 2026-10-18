import { describe, it, expect, vi } from 'vitest';
import app from '../../src/worker';
import * as lab from '../../src/worker/lab';
import { customerFixture } from '../../src/shared/customers';
import type { Bindings } from '../../src/worker/config';

const env = { APP_ENV: 'lab', DATA_MODE: 'supabase', LAB_ENABLED: 'true', LAB_SYNTHETIC_ONLY: 'true', SUPABASE_URL: 'https://synthetic.supabase.co', LAB_SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test', ACCESS_TEAM_DOMAIN: 'https://synthetic.cloudflareaccess.com', ACCESS_AUD: 'test-audience' };
const id = '2000000a-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-00000000000a';
const viewer = '10000000-0000-4000-8000-00000000000b';
function backend() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: viewer, email: 'buyer-b@example.test', app_metadata: { democommerce_fixture: 'democommerce-m1' } });
    if (url.pathname.startsWith('/auth/v1/admin/users/')) return Response.json({ id: owner, email: 'buyer-a@example.test', app_metadata: { democommerce_fixture: 'democommerce-m1' } });
    if (url.pathname.endsWith('/orders')) return Response.json(url.searchParams.has('user_id') ? null : { id, user_id: owner, order_code: 'DEMO_ONLY_ORDER_A_1', total_jpy: 1000 });
    if (url.pathname.endsWith('/order_items')) return Response.json([]);
    if (url.pathname.endsWith('/demo_customers')) return Response.json(customerFixture('A', owner));
    return Response.json({}, { status: 500 });
  });
}
const request = (path: string, token = true, bindings = env) => app.request(`https://shop.example.test${path}`, { headers: token ? { Authorization: 'Bearer test-token' } : {} }, bindings as Bindings);
describe('isolated synthetic customer disclosure', () => {
  it('fails closed across the entire Worker without Access, including assets', async () => {
    const fetch = backend();
    for (const path of ['/', '/api/config', `/api/lab/orders/${id}`, '/assets/app.js']) expect((await request(path)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires exact lab configuration', async () => {
    for (const change of [{ APP_ENV: 'production' }, { LAB_SYNTHETIC_ONLY: 'false' }, { LAB_SUPABASE_URL: 'https://other.supabase.co' }, { ACCESS_AUD: '' }]) expect((await request(`/api/lab/orders/${id}`, true, { ...env, ...change })).status).toBe(404);
  });
  it('B gets A synthetic identity and image only via lab; normal route rejects', async () => {
    vi.spyOn(lab, 'verifyAccess').mockResolvedValue(true);
    backend();
    const response = await request(`/api/lab/orders/${id}`);
    expect(response.status).toBe(200);
    const data = await response.json() as { customer: ReturnType<typeof customerFixture>; viewerIsOwner: boolean };
    expect(data.viewerIsOwner).toBe(false);
    expect(data.customer.full_name).toBe('架空 花子');
    expect(data.customer.license_svg).toContain('SAMPLE / 架空・無効');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await request(`/api/orders/${id}`)).status).toBe(404);
    expect((await request(`/api/orders/${id}`, false)).status).toBe(401);
    expect((await request(`/api/lab/orders/${id}`, false)).status).toBe(401);
  });
  it('never reads arbitrary IDs with the privileged client', async () => {
    vi.spyOn(lab, 'verifyAccess').mockResolvedValue(true);
    const fetch = backend();
    expect((await request('/api/lab/orders/2000000a-0000-4000-8000-000000000099')).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
