import { test, expect } from '@playwright/test';

test('loads under the GitHub Pages base path with no failed requests or errors', async ({ page }) => {
  const failures: string[] = [];
  page.on('requestfailed', request => failures.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Adaptive Learning' })).toBeVisible();
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('serves a manifest with the "Add word" shortcut scoped to the base path', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
  expect(manifest.start_url).toBe('/FlashcardApp/');
  expect(manifest.shortcuts[0].url).toBe('/FlashcardApp/?capture');
});

test('keeps working offline once the service worker has installed', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the service worker
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Adaptive Learning' })).toBeVisible();
});
