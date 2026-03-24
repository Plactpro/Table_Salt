import { Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './test-data';

type Role = keyof typeof TEST_CREDENTIALS;

export async function loginAs(page: Page, role: Role): Promise<void> {
  const creds = TEST_CREDENTIALS[role];
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  const usernameInput = page.locator('input[name="username"], input[placeholder*="username" i], input[data-testid="input-username"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await usernameInput.fill(creds.username);
  await passwordInput.fill(creds.password);

  const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
  await submitBtn.click();

  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
}

export async function logout(page: Page): Promise<void> {
  await page.goto('/');
  const profileMenu = page.locator('[data-testid="button-profile"], button:has-text("Logout"), [aria-label*="profile" i]').first();
  if (await profileMenu.isVisible()) {
    await profileMenu.click();
    const logoutBtn = page.locator('button:has-text("Logout"), [data-testid="button-logout"]').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }
  } else {
    await page.goto('/api/auth/logout', { waitUntil: 'commit' });
  }
}
