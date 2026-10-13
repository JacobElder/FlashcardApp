import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('./lib/supabase', () => {
  const client = {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        callback('INITIAL_SESSION', { user: { id: 'user-1', email: 'me@example.com' } });
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: auth.signOut,
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
  };
  return { missingSupabaseEnv: [], supabase: client, getSupabase: () => client };
});

import App from './App';

describe('App (signed in)', () => {
  it('studies a trivia card, keeps the session across tabs, and signs out', async () => {
    render(<App />);

    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Trivia Study' })).toBeInTheDocument();

    // Scoped to the trivia page: the other tabs stay mounted (hidden) once visited
    const triviaPage = screen.getByRole('heading', { name: 'Trivia Study' }).closest('header')!.parentElement!;
    const reviewed = () =>
      within(within(triviaPage).getByText('Reviewed').parentElement!).getByText(/\d+/).textContent;

    // Answer the first card, whichever format the scheduler picked
    const showAnswer = within(triviaPage).queryByRole('button', { name: 'Show answer' });
    if (showAnswer) {
      fireEvent.click(showAnswer);
      fireEvent.click(within(triviaPage).getByRole('button', { name: /^Good:/ }));
    } else {
      const card = within(triviaPage).getByRole('main');
      fireEvent.click(within(card).getAllByRole('button')[0]);
    }
    await vi.waitFor(() => expect(reviewed()).toBe('1'), { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
    expect(await screen.findByRole('heading', { name: 'Quant Analytics' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    expect(await screen.findByRole('heading', { name: 'Vocabulary Study' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Trivia' }));

    // Switching tabs no longer remounts the page and loses the session
    expect(reviewed()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  });
});
