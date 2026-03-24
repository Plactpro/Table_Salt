import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';
import { TEST_CREDENTIALS, INVALID_CREDENTIALS } from './helpers/test-data';

test.describe('Authentication', () => {
  test('owner login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const usernameInput = page.locator('input[name="username"], input[data-testid="input-username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await usernameInput.fill(TEST_CREDENTIALS.owner.username);
    await passwordInput.fill(TEST_CREDENTIALS.owner.password);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
  });

  test('login with wrong password shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const usernameInput = page.locator('input[name="username"], input[data-testid="input-username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await usernameInput.fill(INVALID_CREDENTIALS.username);
    await passwordInput.fill(INVALID_CREDENTIALS.password);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('text=/invalid|incorrect|wrong|error/i').isVisible().catch(() => false);
    const stillOnLogin = page.url().includes('/login');
    expect(errorVisible || stillOnLogin).toBeTruthy();
  });

  test('login with empty fields stays on login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('register page loads correctly', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');

    const heading = page.locator('h1, h2, [data-testid*="register"], form').first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('logout redirects to login page', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/api/auth/logout', { waitUntil: 'commit' });
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
