import { useState } from 'react';
import { getSupabase } from '../lib/supabase';

type Mode = 'signIn' | 'signUp' | 'reset';

const MODE_TEXT: Record<Mode, { submit: string; subtitle: string }> = {
  signIn: { submit: 'Sign In', subtitle: 'Sign in to sync your progress across devices' },
  signUp: { submit: 'Sign Up', subtitle: 'Create an account to sync your progress across devices' },
  reset: { submit: 'Send Reset Link', subtitle: "Enter your email and we'll send you a link to reset your password" },
};

const INPUT_CLASS =
  'w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-base text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500';

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'An error occurred during authentication.';
}

export function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signIn');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = getSupabase();
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;

    try {
      if (mode === 'signUp') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signIn');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setNotice('If an account exists for that email, a password reset link is on its way.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-xl border border-slate-700 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            Adaptive Learning
          </h1>
          <p className="text-slate-400">{MODE_TEXT[mode].subtitle}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
              placeholder="you@example.com"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label htmlFor="auth-password" className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                {mode === 'signIn' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg" role="alert">
              <p className="text-sm text-red-400 text-center">{error}</p>
            </div>
          )}

          {notice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/50 rounded-lg" role="status">
              <p className="text-sm text-emerald-300 text-center">{notice}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : MODE_TEXT[mode].submit}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          {mode === 'signUp' ? 'Already have an account?' : mode === 'reset' ? 'Remembered it?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
