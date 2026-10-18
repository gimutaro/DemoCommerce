import { test, expect } from '@playwright/test';
import { customerFixture } from '../../src/shared/customers';
import { buyerFixtures } from '../../src/shared/fixtures';

// Browser-only transport stubs verify presentation, not live Supabase integration.
test('synthetic identity, license image, blocked control and JSON evidence', async ({ page }) => {
  const user = { id: '10000000-0000-4000-8000-00000000000b', email: 'buyer-b@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-18T00:00:00Z' };
  const fixture = buyerFixtures('A', '10000000-0000-4000-8000-00000000000a');
  const detail = { item: fixture.orders[0], items: fixture.items.slice(0, 2), customer: customerFixture('A', fixture.orders[0].user_id), viewerIsOwner: false, synthetic: true };
  await page.addInitScript(({ user }) => localStorage.setItem('sb-synthetic-auth-token', JSON.stringify({ access_token: 'synthetic-ui-test-token', refresh_token: 'synthetic-ui-test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })), { user });
  await page.route('**/api/config', route => route.fulfill({ json: { mode: 'supabase', supabaseUrl: 'https://synthetic.supabase.co', supabasePublishableKey: 'sb_publishable_test' } }));
  await page.route('https://synthetic.supabase.co/**', route => route.fulfill({ json: user }));
  await page.route('**/lab/orders/*', async route => {
    if (route.request().url().includes('/api/')) return route.fulfill({ json: detail });
    const response = await page.request.get('/');
    return route.fulfill({ status: 200, contentType: 'text/html', body: await response.text() });
  });
  await page.route('**/api/orders/*', route => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } }));
  await page.goto(`/lab/orders/${fixture.orders[0].id}`);
  await expect(page.getByText('ご注文番号', { exact: true })).toBeVisible();
  await expect(page.getByText('架空 花子', { exact: true })).toBeVisible();
  await expect(page.getByText('1995-04-12', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.license-image').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '注文情報をダウンロード' }).click();
  expect((await download).suggestedFilename()).toBe('SYNTHETIC-customer-evidence.json');
  await page.goto(`/orders/${fixture.orders[0].id}`);
  await expect(page.getByRole('heading', { name: '注文が見つかりませんでした' })).toBeVisible();
  await expect(page.getByText('架空 花子', { exact: true })).toHaveCount(0);
});
