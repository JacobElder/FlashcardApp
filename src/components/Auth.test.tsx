import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const supabaseMock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').createSupabaseMock> }));
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock');
  supabaseMock.current = createSupabaseMock();
  return { getSupabase: () => supabaseMock.current!.client };
});

import { Auth } from './Auth';
import { ResetPassword } from './ResetPassword';

const auth = () => supabaseMock.current!.auth;
const fill = (email: string, password?: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  if (password !== undefined) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};
const submit = (name: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name })); });

describe('Auth', () => {
  it('signs in', async () => {
    render(<Auth />);
    fill('me@example.com', 'secret1');
    await submit('Sign In');
    expect(auth().signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret1' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error from a failed sign-in, or a fallback for an unknown failure', async () => {
    auth().signInWithPassword.mockResolvedValueOnce({ data: {}, error: { message: 'Invalid login credentials' } });
    render(<Auth />);
    fill('me@example.com', 'wrong12');
    await submit('Sign In');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');

    auth().signInWithPassword.mockRejectedValueOnce('network down');
    await submit('Sign In');
    expect(screen.getByRole('alert')).toHaveTextContent('An error occurred during authentication.');
  });

  it('disables the button while a request is in flight', async () => {
    let finish!: () => void;
    auth().signInWithPassword.mockReturnValueOnce(new Promise(resolve => { finish = () => resolve({ data: {}, error: null }); }));
    render(<Auth />);
    fill('me@example.com', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('asks the user to confirm their email after signing up, then switches to sign-in', async () => {
    render(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    fill('new@example.com', 'secret1');
    await submit('Sign Up');
    expect(auth().signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com', password: 'secret1' }));
    expect(screen.getByRole('status')).toHaveTextContent('Check your email');
    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveAttribute('type', 'submit');
  });

  it('says nothing about email when sign-up signs the user straight in', async () => {
    auth().signUp.mockResolvedValueOnce({ data: { session: { user: {} } } as never, error: null });
    render(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    fill('new@example.com', 'secret1');
    await submit('Sign Up');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends a reset link without asking for a password', async () => {
    render(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fill('me@example.com');
    await submit('Send Reset Link');
    expect(auth().resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', { redirectTo: expect.stringContaining(window.location.origin) });
    expect(screen.getByRole('status')).toHaveTextContent('reset link is on its way');
  });
});

describe('ResetPassword', () => {
  const setPassword = () =>
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass1' } });

  it('saves the new password and continues', async () => {
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    setPassword();
    await submit('Save Password');
    expect(auth().updateUser).toHaveBeenCalledWith({ password: 'newpass1' });
    expect(onDone).toHaveBeenCalled();
  });

  it('shows a returned error and stays on the form', async () => {
    auth().updateUser.mockResolvedValueOnce({ data: {}, error: { message: 'Password too weak' } });
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    setPassword();
    await submit('Save Password');
    expect(screen.getByRole('alert')).toHaveTextContent('Password too weak');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('recovers from a request that throws instead of hanging on "Saving..."', async () => {
    auth().updateUser.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ResetPassword onDone={() => {}} />);
    setPassword();
    await submit('Save Password');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch');
    expect(screen.getByRole('button', { name: 'Save Password' })).toBeEnabled();
  });

  it('can be skipped', () => {
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDone).toHaveBeenCalled();
  });
});
