import { useState } from 'react';
import { getSupabase } from '../lib/supabase';

interface ResetPasswordProps {
  onDone: () => void;
}

/** Shown after the user follows a password-reset email link. */
export function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else onDone();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="max-w-md w-full bg-slate-800 rounded-xl shadow-xl border border-slate-700 p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-white text-center">Choose a New Password</h1>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-300 mb-1">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-base text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && (
          <p className="text-sm text-red-400 text-center" role="alert">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save Password'}
        </button>
      </form>
    </div>
  );
}
