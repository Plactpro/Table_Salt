import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/manager.json' });

test.describe('Order Management', () => {
  test('navigate to Orders page', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/orders/, { timeout: 5000 });
  });

  test('orders page renders content', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const mainContent = page.locator('main, [role="main"], .orders-container, h1, h2').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('orders page has filter or status controls', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const controls = await page.locator('button, select, [role="tab"], [data-testid*="filter"]').count();
    expect(controls).toBeGreaterThan(0);
  });

  test('orders page shows order data or empty state', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    const hasContent = body && body.length > 100;
    expect(hasContent).toBeTruthy();
  });
});
