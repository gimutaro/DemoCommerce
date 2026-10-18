import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    launchOptions: { executablePath: chromium, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    trace: 'off', screenshot: 'off', video: 'off',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI, timeout: 60_000,
  },
});
