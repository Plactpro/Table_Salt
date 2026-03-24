import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/kitchen.json' });

test.describe('Kitchen Display', () => {
  test('navigate to dashboard after kitchen login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('kitchen dashboard renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    expect(body && body.length > 100).toBeTruthy();
  });

  test('navigate to kitchen board page', async ({ page }) => {
    await page.goto('/kitchen-board');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body && body.length > 50).toBeTruthy();
  });

  test('kitchen page shows orders or empty state', async ({ page }) => {
    await page.goto('/kitchen-board');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    const hasContent = content && content.length > 100;
    expect(hasContent).toBeTruthy();
  });
});
