import { useSyncExternalStore } from 'react';
import { getSyncStatus, subscribeToSyncStatus, type SyncStatus } from '../lib/sync';

const STATUS_TEXT: Record<SyncStatus, { label: string; className: string }> = {
  idle: { label: '', className: '' },
  syncing: { label: 'Syncing…', className: 'text-slate-400' },
  synced: { label: 'Synced', className: 'text-emerald-400' },
  offline: { label: 'Offline — will sync later', className: 'text-amber-400' },
  error: { label: 'Sync failed', className: 'text-red-400' },
};

interface AccountBarProps {
  email: string | undefined;
  onSignOut: () => void;
}

export function AccountBar({ email, onSignOut }: AccountBarProps) {
  const { status, error } = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus);
  const { label, className } = STATUS_TEXT[status];

  return (
    <div className="bg-slate-950 border-b border-slate-800 px-4 py-1.5 flex items-center gap-3 text-xs">
      <span className="text-slate-400 truncate flex-1" title={email}>{email}</span>
      {label && (
        <span className={className} role="status" title={error ?? undefined}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={onSignOut}
        className="text-slate-300 hover:text-white px-2 py-1 rounded-md border border-slate-700 hover:border-slate-500"
      >
        Sign Out
      </button>
    </div>
  );
}
