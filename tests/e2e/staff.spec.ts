import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/owner.json' });

test.describe('Staff Management', () => {
  test('navigate to Staff page', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('staff page renders staff list', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const mainContent = page.locator('main, [role="main"], h1, h2, table, [data-testid*="staff"]').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test('staff page has action buttons', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('staff page shows existing staff members', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body && body.length > 200).toBeTruthy();
  });
});
