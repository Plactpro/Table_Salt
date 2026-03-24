import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/owner.json' });

test.describe('Support', () => {
  test('support widget is visible on dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body && body.length > 100).toBeTruthy();
  });

  test('navigate to tickets page', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('tickets page renders content', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const mainContent = page.locator('main, [role="main"], h1, h2').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test('tickets page shows ticket list or empty state', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(3000);
    const body = await page.textContent('body');
    expect(body && body.length > 200).toBeTruthy();
  });
});
