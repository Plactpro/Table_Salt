import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/owner.json' });

test.describe('Billing', () => {
  test('navigate to Billing page', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/billing/, { timeout: 5000 });
  });

  test('billing page renders content', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const mainContent = page.locator('main, [role="main"], h1, h2').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test('billing page shows billing data', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    const hasBillingContent =
      body?.toLowerCase().includes('bill') ||
      body?.toLowerCase().includes('invoice') ||
      body?.toLowerCase().includes('payment') ||
      body?.toLowerCase().includes('subscription') ||
      body?.toLowerCase().includes('plan');
    expect(hasBillingContent).toBeTruthy();
  });

  test('billing page has interactive controls', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const interactiveElements = await page.locator('button, a, [role="tab"]').count();
    expect(interactiveElements).toBeGreaterThan(0);
  });
});
