import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/FlashcardApp/`;

// Browser tests against the production build: the GitHub Pages base path, the
// service worker, offline loading, and a sign-in-and-study flow against a
// fake Supabase, which unit tests in jsdom can't cover.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Placeholder project: the tests answer its requests themselves, so nothing real is touched
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://e2e-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'e2e-placeholder-anon-key',
    },
  },
});
