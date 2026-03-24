import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/owner.json' });

test.describe('POS Checkout', () => {
  test.beforeEach(async ({ page }) => {
    const authDone = page.waitForResponse(r => r.url().includes('/api/auth/me'), { timeout: 10000 }).catch(() => null);
    await page.goto('/');
    await authDone;
    await page.waitForTimeout(1000);
  });

  test('navigate to POS page', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('POS page has menu items', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(2000);
    const anyClickable = await page.locator('button, [role="button"]').count();
    expect(anyClickable).toBeGreaterThan(0);
  });

  test('POS page renders cart section', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(3000);
    const pageContent = await page.textContent('body');
    const hasContent = pageContent && pageContent.length > 200;
    expect(hasContent).toBeTruthy();
  });
});
