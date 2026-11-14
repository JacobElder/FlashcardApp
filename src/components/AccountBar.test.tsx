import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SyncStatusSnapshot } from '../lib/sync';

const sync = vi.hoisted(() => ({
  snapshot: { status: 'idle', error: null, missingColumns: [] } as SyncStatusSnapshot,
  syncNow: vi.fn(async () => {}),
}));
vi.mock('../lib/sync', () => ({
  getSyncStatus: () => sync.snapshot,
  subscribeToSyncStatus: () => () => {},
  syncNow: sync.syncNow,
}));

import { AccountBar } from './AccountBar';

describe('AccountBar', () => {
  it('shows a sync error with a Retry button', () => {
    sync.snapshot = { status: 'error', error: 'permission denied', missingColumns: [] };
    render(<AccountBar email="me@example.com" onSignOut={async () => true} />);
    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(sync.syncNow).toHaveBeenCalled();
  });

  it('warns when the cloud database lacks columns', () => {
    sync.snapshot = { status: 'synced', error: null, missingColumns: ['data_science_profile'] };
    render(<AccountBar email="me@example.com" onSignOut={async () => true} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Data Science progress only stays on this device/);
  });

  it('has a full-size Sign Out tap target', () => {
    sync.snapshot = { status: 'synced', error: null, missingColumns: [] };
    render(<AccountBar email="me@example.com" onSignOut={async () => true} />);
    expect(screen.getByRole('button', { name: 'Sign Out' })).toHaveClass('min-h-11');
  });
});
