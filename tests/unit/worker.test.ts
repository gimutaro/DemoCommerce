import { describe, expect, it, vi } from 'vitest';
import app from '../../src/worker';
import { PRODUCTS } from '../../src/shared/products';
import { dataMode, supabaseConfig, type Bindings } from '../../src/worker/config';
import { assertM1Environment } from '../../scripts/assert-lab-isolated';

const mockEnv = { APP_ENV: 'local', DATA_MODE: 'mock', LAB_ENABLED: 'false' };
const request = (path: string, env: Partial<Bindings> = mockEnv, init?: RequestInit) => app.request(`http://localhost${path}`, init, env as Bindings);

describe('catalog API', () => {
  it('serves 10 public synthetic products with integer JPY prices', async () => {
    const response = await request('/api/products');
    expect(response.status).toBe(200);
    expect((await response.json() as { items: unknown }).items).toEqual(PRODUCTS);
    expect(PRODUCTS).toHaveLength(10);
    expect(PRODUCTS.every((p) => Number.isInteger(p.price_jpy) && p.price_jpy >= 0)).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('resolves known product slugs and rejects missing/malformed slugs', async () => {
    const response = await request(`/api/products/${PRODUCTS[0].slug}`);
    expect((await response.json() as { item: unknown }).item).toEqual(PRODUCTS[0]);
    for (const slug of ['does-not-exist', 'INVALID', "quoted%27", 'x'.repeat(101)]) {
      expect((await request(`/api/products/${slug}`)).status).toBe(404);
    }
  });

  it('fails closed without configuration or when mock is used outside local', async () => {
    for (const env of [{}, { ...mockEnv, APP_ENV: 'production' }]) {
      const response = await request('/api/products', env);
      expect(response.status).toBe(503);
      expect((await response.json() as { error: { code: string } }).error.code).toBe('NOT_CONFIGURED');
    }
  });

  it('never exposes server-only configuration', async () => {
    const env = { ...mockEnv, SUPABASE_SECRET_KEY: 'private-test-sentinel', ACCESS_AUD: 'private-audience' };
    const response = await request('/api/config', env);
    expect(await response.json()).toEqual({ mode: 'mock' });
  });

  it('rejects server secrets accidentally supplied as a public key', async () => {
    const legacySecret = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    for (const key of ['sb_secret_server-only-sentinel', legacySecret, 'unclassified-secret']) {
      const response = await request('/api/config', { APP_ENV: 'local', DATA_MODE: 'supabase', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: key });
      expect(await response.json()).toEqual({ mode: 'unconfigured' });
    }
  });

  it('Lab routes remain 404 for every environment and flag', async () => {
    for (const env of [{ ...mockEnv }, { ...mockEnv, APP_ENV: 'lab', LAB_ENABLED: 'true' }, { ...mockEnv, APP_ENV: 'production' }]) {
      for (const path of ['/api/lab/orders/anything', '/lab/orders/anything', '/lab']) {
        expect((await request(path, env)).status).toBe(404);
      }
    }
  });

  it('serves the SPA not-found page with HTTP 404 for unknown routes', async () => {
    const env = { ...mockEnv, ASSETS: { fetch: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Fetcher };
    expect((await request('/missing-page', env)).status).toBe(404);
    expect((await request('/login', env)).status).toBe(200);
    expect((await request('/contact', env)).status).toBe(200);
    expect((await request('/staff', env)).status).toBe(200);
  });
});

describe('authenticated profile', () => {
  it('requires a bearer token and does not invent a mock login', async () => {
    expect((await request('/api/me')).status).toBe(401);
    expect((await request('/api/me', mockEnv, { headers: { Authorization: 'Basic invalid' } })).status).toBe(401);
    expect((await request('/api/me', mockEnv, { headers: { Authorization: 'Bearer fake' } })).status).toBe(503);
  });

  it('verifies user tokens with Supabase Auth and queries only that user profile', async () => {
    const env = { APP_ENV: 'local', DATA_MODE: 'supabase', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-key' };
    const userId = '00000000-0000-4000-8000-000000000001';
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url.includes('/auth/v1/user')) return Response.json({ id: userId, email: 'buyer-a@example.test' });
      if (url.includes('/rest/v1/profiles')) return Response.json({ display_name: 'テストユーザー A' });
      return Response.json({}, { status: 500 });
    });
    const response = await request('/api/me', env, { headers: { Authorization: 'Bearer verified-test-token' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: userId, displayName: 'テストユーザー A' });
    expect(urls[0]).toContain('/auth/v1/user');
    expect(urls[1]).toContain(`id=eq.${userId}`);
  });

  it('rejects an unverified JWT with a generic error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message: 'sensitive backend detail', code: 'bad_jwt' }, { status: 401 }));
    const response = await request('/api/me', { APP_ENV: 'local', DATA_MODE: 'supabase', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-test-key' }, { headers: { Authorization: 'Bearer unverified' } });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('sensitive backend detail');
  });
});

describe('environment guards', () => {
  it('allows HTTP only for explicitly local loopback Supabase', () => {
    expect(supabaseConfig({ APP_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-key' })).not.toBeNull();
    for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com/path', 'not-a-url']) {
      expect(supabaseConfig({ APP_ENV: 'local', SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toBeNull();
    }
  });

  it('blocks Lab builds and nonlocal mock data', () => {
    expect(() => assertM1Environment({ APP_ENV: 'production', LAB_ENABLED: 'true' })).toThrow();
    expect(() => assertM1Environment({ APP_ENV: 'local', LAB_ENABLED: 'true' })).toThrow();
    expect(() => assertM1Environment({ APP_ENV: 'production', DATA_MODE: 'mock' })).toThrow();
    expect(() => assertM1Environment(mockEnv)).not.toThrow();
    expect(dataMode({ ...mockEnv, LAB_ENABLED: 'true' })).toBe('unconfigured');
  });
});
