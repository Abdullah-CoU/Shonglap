import { test, expect } from '@playwright/test';

test('citizen report flow', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.locator('header').first()).toBeVisible();

  // Navigate to report page
  await page.goto('http://localhost:5173/report');
  await expect(page).toHaveURL(/\/report/);

  // Fill text + area
  await page.locator('textarea').first().fill('Big pothole on Dhanmondi Road 27');
  await page.locator('select').first().selectOption('Dhanmondi');

  // Submit: click the last primary (blue) button - the form submit
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.bg-blue-600'));
    if (btns.length) btns[btns.length - 1].click();
  });
  await page.waitForURL(/\/review/, { timeout: 15000 });

  // Consent
  await page.locator('input[type="checkbox"]').check();

  // Submit on review
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.bg-blue-600'));
    if (btns.length) btns[btns.length - 1].click();
  });
  await page.waitForTimeout(1000);

  // If duplicate modal appeared, submit as new complaint
  const submitNew = page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.includes('Submit as new') || b.textContent.includes('নতুন অভিযোগ হিসেবে')
    );
    if (btn) { btn.click(); return true; }
    return false;
  });

  await page.waitForURL(/\/success/, { timeout: 15000 });

  await expect(page.locator('code')).toBeVisible();
  const trackingId = await page.locator('code').textContent();
  expect(trackingId).toMatch(/DHK-\d{8}-\d{4}/);
});
