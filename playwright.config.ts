import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';

function getChromiumPath(): string {
  try {
    const result = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (result) return result;
  } catch {}
  return '';
}

const chromiumPath = getChromiumPath();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  retries: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
});
