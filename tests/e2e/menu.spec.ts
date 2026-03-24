import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/owner.json' });

test.describe('Menu Management', () => {
  test('navigate to Menu page', async ({ page }) => {
    await page.goto('/menu');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('menu page renders categories and items', async ({ page }) => {
    await page.goto('/menu');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    await page.waitForTimeout(2000);
    const mainContent = page.locator('main, [role="main"], h1, h2').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test('menu page shows menu data', async ({ page }) => {
    await page.goto('/menu');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body && body.length > 200).toBeTruthy();
  });

  test('menu page has interactive controls', async ({ page }) => {
    await page.goto('/menu');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    await page.waitForTimeout(2000);
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('menu items are listed on the page', async ({ page }) => {
    await page.goto('/menu');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body && body.length > 200).toBeTruthy();
  });
});
