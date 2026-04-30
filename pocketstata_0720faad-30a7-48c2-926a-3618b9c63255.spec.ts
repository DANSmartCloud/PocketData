
import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test('PocketStata_2026-04-17', async ({ page, context }) => {
  
    // Navigate to URL
    await page.goto('http://localhost:1420/');

    // Take screenshot
    await page.screenshot({ path: 'PocketStata_initial.png' });
});