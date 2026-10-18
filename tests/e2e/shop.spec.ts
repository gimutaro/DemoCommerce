import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';

test('catalog shows ten products and original images without horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(10);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('いつもの暮らしに');
  await expect(page.locator('.product-card').first()).toContainText('￥1,280');
  await page.locator('.product-card img').evaluateAll((images) => images.forEach((image) => { (image as HTMLImageElement).loading = 'eager'; }));
  await expect.poll(() => page.locator('.product-card img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('category and search filters have clear and empty states', async ({ page }) => {
  await page.goto('/#collection');
  await expect(page.locator('.product-card')).toHaveCount(10);
  await page.getByRole('button', { name: '文房具', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.getByRole('searchbox', { name: '商品を検索' }).fill('存在しない商品');
  await expect(page.getByRole('heading', { name: 'お探しの商品が見つかりませんでした' })).toBeVisible();
  await page.getByRole('button', { name: '絞り込みをクリア' }).click();
  await expect(page.locator('.product-card')).toHaveCount(10);
  await page.getByRole('searchbox', { name: '商品を検索' }).fill('マグ');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('朝のマグカップ');
});

test('product navigation, direct links and not-found routes work', async ({ page }) => {
  await page.goto('/');
  await page.locator('.product-card').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/products\/cloud-notebook$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('余白のノート');
  await expect(page.getByText('在庫あり（24点）')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('余白のノート');
  await page.goto('/products/no-such-product');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('この商品は見つかりませんでした。');
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('お探しのページが見つかりませんでした。');
});

test('catalog failure provides a working retry', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/products', async (route) => {
    if (unavailable) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE' } }) });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '商品を読み込めませんでした' })).toBeVisible();
  unavailable = false;
  await page.getByRole('button', { name: 'もう一度読み込む' }).click();
  await expect(page.locator('.product-card')).toHaveCount(10);
});

test('mock catalog never offers a fake login', async ({ page }) => {
  await page.route('**/api/config', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode: 'mock' }) }));
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel('メールアドレス', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ログインする' })).toBeDisabled();
  await expect(page.getByText('ただいまログインをご利用いただけません')).toBeVisible();
});

test('Lab pages and endpoints remain inaccessible', async ({ request }) => {
  for (const path of ['/lab/orders/anything', '/api/lab/orders/anything']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test('real test-account login, verified profile, safe redirect and logout', async ({ page }) => {
  test.skip(process.env.E2E_WITH_SUPABASE !== 'true', 'Enable after provisioning the local Supabase test accounts.');
  const credentials = existsSync('.fixtures/test-users.env') ? parseEnv(readFileSync('.fixtures/test-users.env', 'utf8')) : {};
  const password = process.env.TEST_BUYER_A_PASSWORD || credentials.TEST_BUYER_A_PASSWORD;
  expect(Boolean(password), 'A provisioned local test account is required').toBe(true);
  await page.goto('/login?returnTo=https://untrusted.example.test');
  await page.getByLabel('メールアドレス', { exact: true }).fill('buyer-a@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'ログインする' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator('.account-page')).toContainText('テストユーザー A');
  await page.getByRole('link', { name: '注文履歴・お客様情報' }).click();
  await expect(page.locator('.demo-order-row')).toHaveCount(2);
  await page.locator('.demo-order-row').first().click();
  await expect(page.getByText('架空 花子', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.license-image').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.goto('/orders/2000000b-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: '注文が見つかりませんでした' })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?returnTo=%2Faccount)?$/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
});
