import { useState, useSyncExternalStore } from 'react';
import { getSyncStatus, subscribeToSyncStatus, syncNow, type SyncStatus } from '../lib/sync';

const STATUS_TEXT: Record<SyncStatus, { label: string; className: string }> = {
  idle: { label: '', className: '' },
  syncing: { label: 'Syncing…', className: 'text-slate-400' },
  synced: { label: 'Synced', className: 'text-emerald-400' },
  offline: { label: 'Offline — will sync later', className: 'text-amber-400' },
  error: { label: 'Sync failed', className: 'text-red-400' },
};

const COLUMN_NAMES: Record<string, string> = {
  data_science_profile: 'Data Science progress',
  user_facts: 'your facts',
};

interface AccountBarProps {
  email: string | undefined;
  /** Resolves false (without signing out) when changes haven't synced and `force` is false. */
  onSignOut: (force: boolean) => Promise<boolean>;
}

const BUTTON = 'min-h-11 px-3 rounded-md border text-slate-300 hover:text-white disabled:opacity-50';

export function AccountBar({ email, onSignOut }: AccountBarProps) {
  const { status, error, missingColumns } = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus);
  const { label, className } = STATUS_TEXT[status];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async (force: boolean) => {
    setBusy(true);
    try {
      const done = await onSignOut(force);
      setConfirming(!done);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-950 border-b border-slate-800 text-xs">
      <div className="px-4 py-1 flex items-center gap-3">
        <span className="text-slate-400 truncate flex-1" title={email}>{email}</span>
        {label && (
          <span className={className} role="status">
            {label}
          </span>
        )}
        {!confirming && (
          <button
            type="button"
            onClick={() => void signOut(false)}
            disabled={busy}
            className={`${BUTTON} border-slate-700 hover:border-slate-500`}
          >
            Sign Out
          </button>
        )}
      </div>

      {status === 'error' && (
        <div role="alert" className="px-4 pb-2 flex items-center gap-3 text-red-300">
          <span className="flex-1">Couldn't sync your progress{error ? `: ${error}` : ''}. It's saved on this device.</span>
          <button type="button" onClick={() => void syncNow()} className={`${BUTTON} border-red-800 hover:border-red-600`}>
            Retry
          </button>
        </div>
      )}

      {missingColumns.length > 0 && (
        <p role="alert" className="px-4 pb-2 text-amber-300">
          The cloud database is out of date, so{' '}
          {missingColumns.map(c => COLUMN_NAMES[c] ?? c).join(' and ')} only{' '}
          {missingColumns.length === 1 ? 'stays' : 'stay'} on this device. Run supabase_schema.sql to sync{' '}
          {missingColumns.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {confirming && (
        <div role="alertdialog" aria-label="Unsynced changes" className="px-4 pb-2 flex flex-wrap items-center gap-3 text-amber-200">
          <span className="flex-1 min-w-48">
            Some progress hasn't reached your account yet. If you sign out it stays on this device and syncs the
            next time you sign in here.
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className={`${BUTTON} border-slate-700 hover:border-slate-500`}
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={() => void signOut(true)}
            disabled={busy}
            className={`${BUTTON} border-amber-700 hover:border-amber-500`}
          >
            Sign out anyway
          </button>
        </div>
      )}
    </div>
  );
}
