import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

test('local real B login reads A through lab only', async ({ page }) => {
  test.skip(process.env.E2E_LOCAL_LAB !== 'true', 'Requires explicit synthetic demo test opt-in.');
  const credentials = parseEnv(readFileSync(process.env.E2E_CREDENTIALS_FILE ?? '.fixtures/test-users.env', 'utf8'));
  await page.goto('/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('buyer-b@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill(credentials.TEST_BUYER_B_PASSWORD!);
  await page.getByRole('button', { name: 'ログインする' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/orders/2000000a-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: '注文が見つかりませんでした' })).toBeVisible();
  await page.goto('/lab/orders/2000000a-0000-4000-8000-000000000001');
  await expect(page.getByText('架空 花子', { exact: true })).toBeVisible();
  await expect(page.getByText('ご注文番号', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.license-image').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  if (process.env.E2E_BASE_URL && test.info().project.name === 'desktop') await page.screenshot({ path: 'docs/cloud-demo.png', fullPage: true });
});
