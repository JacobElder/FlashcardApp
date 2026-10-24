import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

const supabaseMock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('./test/supabaseMock').createSupabaseMock> }));

vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock');
  supabaseMock.current = createSupabaseMock();
  return { missingSupabaseEnv: [], supabase: supabaseMock.current.client, getSupabase: () => supabaseMock.current!.client };
});
// A small, open-recall-only deck keeps the flow deterministic and fast
vi.mock('./data/triviaCards', () => ({
  triviaCards: ['a', 'b', 'c'].map(id => ({ id: `geo-${id}`, type: 'trivia', category: 'Geography', front: `Q ${id}`, back: `A ${id}` })),
}));
// The chart isn't under test, and loading recharts is what made this suite slow and flaky
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, ResponsiveContainer: Stub, ReferenceLine: Stub };
});

import App from './App';
import { signedIn } from './test/supabaseMock';
import { STORAGE_KEYS, getFromStorage, setToStorage } from './lib/storage';
import { stopSync } from './lib/sync';

const mock = () => supabaseMock.current!;

async function renderSignedIn() {
  render(<App />);
  await act(async () => mock().emit('INITIAL_SESSION', signedIn()));
}

describe('App', () => {
  beforeAll(async () => {
    // Load the lazily split pages up front so React.lazy resolves from the module cache
    await Promise.all([import('./pages/TriviaStudy'), import('./pages/VocabularyStudy'), import('./pages/Analytics')]);
  }, 30_000);

  afterEach(() => stopSync());

  it('studies a card, keeps the session across tabs, and signs out', async () => {
    await renderSignedIn();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Trivia Study' })).toBeInTheDocument();

    // Scoped to the trivia page: the other tabs stay mounted (hidden) once visited
    const triviaPage = screen.getByRole('heading', { name: 'Trivia Study' }).closest('header')!.parentElement!;
    const reviewed = () =>
      within(within(triviaPage).getByText('Reviewed').parentElement!).getByText(/\d+/).textContent;

    fireEvent.click(within(triviaPage).getByRole('button', { name: 'Show answer' }));
    fireEvent.click(within(triviaPage).getByRole('button', { name: /^Good:/ }));
    expect(reviewed()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
    expect(await screen.findByRole('heading', { name: 'Quant Analytics' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    expect(await screen.findByRole('heading', { name: 'Vocabulary Study' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Trivia' }));

    // Switching tabs doesn't remount the page and lose the session
    expect(reviewed()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await vi.waitFor(() => expect(mock().auth.signOut).toHaveBeenCalled());
  });

  it('shows the sign-in screen when signed out', async () => {
    render(<App />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await act(async () => mock().emit('INITIAL_SESSION', null));
    expect(screen.getByRole('heading', { name: 'Adaptive Learning' })).toBeInTheDocument();
  });

  it('asks for a new password after a reset link, and can be dismissed', async () => {
    render(<App />);
    await act(async () => mock().emit('PASSWORD_RECOVERY', signedIn()));
    expect(screen.getByRole('heading', { name: 'Choose a New Password' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Trivia Study' })).toBeInTheDocument();
  });

  it('forgets a pending password reset when the user signs out', async () => {
    render(<App />);
    await act(async () => mock().emit('PASSWORD_RECOVERY', signedIn()));
    await act(async () => mock().emit('SIGNED_OUT', null));
    await act(async () => mock().emit('SIGNED_IN', signedIn()));
    expect(screen.queryByRole('heading', { name: 'Choose a New Password' })).not.toBeInTheDocument();
  });

  it('clears synced local data on sign-out', async () => {
    await renderSignedIn();
    await screen.findByRole('heading', { name: 'Trivia Study' });
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await vi.waitFor(() => expect(getFromStorage(STORAGE_KEYS.INCORRECT_COUNTS, null)).toBeNull());
  });

  it('still finishes signing out when the sign-out request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mock().auth.signOut.mockRejectedValueOnce(new Error('offline'));
    await renderSignedIn();
    await screen.findByRole('heading', { name: 'Trivia Study' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('Sign-out request failed:', expect.any(Error)));
  });

  it('warns when this device has run out of storage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderSignedIn();
    await screen.findByRole('heading', { name: 'Trivia Study' });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    act(() => setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 }));
    expect(screen.getByRole('alert')).toHaveTextContent(/storage is full/);
  });
});
