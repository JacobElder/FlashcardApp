import { test, expect, type Page } from '@playwright/test';

// Signs in and studies against a fake Supabase: requests to the placeholder
// project (see playwright.config.ts) are answered here, so nothing real is touched.
const USER = { id: 'e2e-user', email: 'e2e@example.com', aud: 'authenticated', role: 'authenticated' };

async function fakeSupabase(page: Page) {
  const cloud = { row: null as Record<string, unknown> | null, writes: 0 };
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/auth/v1/token**', route => route.fulfill(json({
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user: USER,
  })));
  await page.route('**/auth/v1/user**', route => route.fulfill(json(USER)));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }));

  await page.route('**/rest/v1/user_progress**', async route => {
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    switch (request.method()) {
      case 'GET':
        return route.fulfill(json(cloud.row ? [cloud.row] : []));
      case 'POST': // insert or upsert
        cloud.row = { ...body };
        cloud.writes += 1;
        return route.fulfill(json([], 201));
      case 'PATCH': { // compare-and-swap update
        const expected = new URL(request.url()).searchParams.get('updated_at')?.replace(/^eq\./, '');
        if (!cloud.row || cloud.row.updated_at !== expected) return route.fulfill(json([]));
        cloud.row = { ...cloud.row, ...body };
        cloud.writes += 1;
        return route.fulfill(json([{ user_id: USER.id }]));
      }
      default:
        return route.fulfill(json({ message: `unexpected ${request.method()}` }, 400));
    }
  });
  return cloud;
}

test('signs in, studies a card, syncs it to the cloud, and signs out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const cloud = await fakeSupabase(page);

  await page.goto('./');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Trivia Study' })).toBeVisible();
  await expect(page.getByText(USER.email)).toBeVisible();
  // First sync: nothing in the cloud yet, so the row is created
  await expect.poll(() => cloud.writes).toBe(1);

  // The real deck may lead with multiple choice; skip to an open-recall card
  const showAnswer = page.getByRole('button', { name: 'Show answer' });
  for (let i = 0; i < 20 && !(await showAnswer.isVisible()); i++) {
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await showAnswer.click();
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByText('✓ 1')).toBeVisible();

  // The answer reaches the cloud after the push debounce
  await expect.poll(
    () => Object.keys((cloud.row?.trivia_profile as { cardHistory?: object } | undefined)?.cardHistory ?? {}).length,
    { timeout: 10_000 }
  ).toBe(1);

  // Still signed in, with progress kept, after a reload
  await page.reload();
  await expect(page.getByText(USER.email)).toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('heading', { name: 'Adaptive Learning' })).toBeVisible();
  expect(errors).toEqual([]);
});
