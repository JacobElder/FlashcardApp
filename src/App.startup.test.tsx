import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createSupabaseMock, signedIn } from './test/supabaseMock';
import { stopSync } from './lib/sync';

// App reads the URL when its module loads, so each test sets the URL and then imports a fresh copy
async function loadApp(url: string, { missingEnv = [] as string[] } = {}) {
  window.history.replaceState(null, '', url);
  vi.resetModules();
  const mock = createSupabaseMock();
  vi.doMock('./lib/supabase', () => ({
    missingSupabaseEnv: missingEnv,
    supabase: missingEnv.length ? null : mock.client,
    getSupabase: () => mock.client,
  }));
  vi.doMock('./data/triviaCards', () => ({
    triviaCards: [{ id: 'geo-1', type: 'trivia', category: 'Geography', front: 'Q', back: 'A' }],
  }));
  const { default: App } = await import('./App');
  // Warm the lazily loaded pages so they render without waiting
  await Promise.all([import('./pages/TriviaStudy'), import('./pages/VocabularyStudy')]);
  return { App, mock };
}

describe('App startup', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    stopSync();
    window.history.replaceState(null, '', '/');
  });

  it('opens straight to word capture from the home-screen shortcut, then drops the flag from the URL', async () => {
    const { App, mock } = await loadApp('/?capture');
    expect(window.location.search).toBe('');

    render(<App />);
    await act(async () => mock.emit('INITIAL_SESSION', signedIn()));
    expect(await screen.findByRole('heading', { name: 'Vocabulary Study' })).toBeVisible();
    expect(screen.getByLabelText('Capture a word to define later')).toHaveFocus();
  }, 30_000);

  it('shows the password form when opened from a reset link, even if the recovery event was missed', async () => {
    const { App, mock } = await loadApp('/#access_token=x&type=recovery');
    render(<App />);
    await act(async () => mock.emit('SIGNED_IN', signedIn()));
    expect(screen.getByRole('heading', { name: 'Choose a New Password' })).toBeInTheDocument();
  }, 30_000);

  it('explains a build that is missing its Supabase settings', async () => {
    const { App } = await loadApp('/', { missingEnv: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'App not configured' })).toBeInTheDocument();
    expect(screen.getByText(/missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument();
  }, 30_000);
});
