import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function getChromiumPath(): string {
  try {
    const result = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (result) return result;
  } catch {}
  return '';
}

const TEST_CREDENTIALS = {
  owner: { username: 'owner', password: 'demo123' },
  manager: { username: 'manager', password: 'demo123' },
  kitchen: { username: 'kitchen', password: 'demo123' },
};

function isAuthFileFresh(filePath: string, maxAgeMinutes = 1440): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < maxAgeMinutes * 60 * 1000;
  } catch {
    return false;
  }
}

async function loginAndSave(page: any, username: string, password: string, storagePath: string) {
  if (isAuthFileFresh(storagePath)) {
    return;
  }

  await page.goto('http://localhost:5000/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  const usernameInput = page.locator('input[name="username"], input[placeholder*="username" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 25000 });
  await page.context().storageState({ path: storagePath });
}

export default async function globalSetup(config: FullConfig) {
  const authDir = '.auth';
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const ownerPath = path.join(authDir, 'owner.json');
  const managerPath = path.join(authDir, 'manager.json');
  const kitchenPath = path.join(authDir, 'kitchen.json');

  const allFresh = isAuthFileFresh(ownerPath) && isAuthFileFresh(managerPath) && isAuthFileFresh(kitchenPath);
  if (allFresh) {
    return;
  }

  const chromiumPath = getChromiumPath();
  const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};
  
  const browser = await chromium.launch(launchOptions);

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await loginAndSave(ownerPage, TEST_CREDENTIALS.owner.username, TEST_CREDENTIALS.owner.password, ownerPath);
  await ownerContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await loginAndSave(managerPage, TEST_CREDENTIALS.manager.username, TEST_CREDENTIALS.manager.password, managerPath);
  await managerContext.close();

  const kitchenContext = await browser.newContext();
  const kitchenPage = await kitchenContext.newPage();
  await loginAndSave(kitchenPage, TEST_CREDENTIALS.kitchen.username, TEST_CREDENTIALS.kitchen.password, kitchenPath);
  await kitchenContext.close();

  await browser.close();
}
