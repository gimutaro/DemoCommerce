import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { mode: 'mock', attackLabEnabled: true } }));
  await page.route('**/api/attack-lab/status', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/attack-lab/me', route => route.fulfill({ status: 401, json: { error: 'LOGIN_REQUIRED' } }));
});

test('storefront and member sign-in present ordinary shopping navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(10);
  await expect(page.locator('body')).not.toContainText(/VULNERABLE|SECURITY LAB|攻撃テスト|未ログイン|DEMO ONLY|架空のストア/);
  await page.getByRole('link', { name: 'マイページ', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: '会員ログイン' })).toBeVisible();
  await expect(page.getByLabel('メールアドレス', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.locator('body')).not.toContainText(/SQL|IDOR|XSS|VULNERABLE|未ログイン|HTTP|検証ケース/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.goto('/staff'))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'スタッフログイン' })).toBeVisible();
});

test('sign-in, profile display, and sign-out keep technical metadata out of the page', async ({ page }) => {
  await page.route('**/api/attack-lab/login', async route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'member@example.test', password: 'sample-member-password', mode: 'vulnerable' });
    await route.fulfill({ json: { viewer: { id: 2, email: 'member@example.test', role: 'customer' }, query: 'internal query', marker: 'internal marker' } });
  });
  await page.route('**/api/attack-lab/profile?*', route => route.fulfill({ json: { customer: { id: 2, full_name: 'サンプル会員', email: 'member@example.test', internal_notes: 'private note' }, marker: 'internal marker' } }));
  await page.route('**/api/attack-lab/logout', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('member@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('sample-member-password');
  await page.getByRole('button', { name: 'ログインする' }).click();
  await expect(page.getByRole('heading', { name: '会員情報' })).toBeVisible();
  await page.getByRole('button', { name: '登録情報を確認する' }).click();
  await expect(page.getByText('サンプル会員', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/internal query|internal marker|private note|HTTP/);
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('heading', { name: '会員ログイン' })).toBeVisible();
  await expect(page.getByText('サンプル会員', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('');
});

test('failed sign-in shows a customer-facing error with no raw response', async ({ page }) => {
  await page.route('**/api/attack-lab/login', route => route.fulfill({ status: 401, json: { error: 'LOGIN_FAILED', query: 'internal query' } }));
  await page.goto('/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('member@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'ログインする' }).click();
  await expect(page.getByRole('alert')).toHaveText('メールアドレスとパスワードをご確認ください。');
  await expect(page.locator('body')).not.toContainText(/LOGIN_FAILED|internal query|HTTP 401/);
});

test('contact confirmation displays the message as text without pretending to send it', async ({ page }) => {
  expect((await page.goto('/contact'))?.status()).toBe(200);
  await page.getByLabel('お問い合わせ内容', { exact: true }).fill('マグカップについて確認したいです。<b>メモ</b>');
  await page.getByRole('button', { name: '内容を確認する' }).click();
  await expect(page.locator('.member-message')).toHaveText('マグカップについて確認したいです。<b>メモ</b>');
  await expect(page.locator('.member-message b')).toHaveCount(0);
  await expect(page.getByText('内容を確認できます。この画面からの送信は受け付けていません。')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
