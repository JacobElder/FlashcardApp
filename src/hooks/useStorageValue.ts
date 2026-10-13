import { useCallback, useSyncExternalStore } from 'react';
import { getFromStorage, subscribeToStorage } from '../lib/storage';

/**
 * Subscribe to a localStorage key. Re-renders whenever the key is written
 * through lib/storage (this tab, a cloud pull, or another tab).
 * `defaultValue` must be referentially stable (e.g. a module constant).
 */
export function useStorageValue<T>(key: string, defaultValue: T): T {
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeToStorage((changedKey) => {
        if (changedKey === key || changedKey === '*') onChange();
      }),
    [key]
  );
  const getSnapshot = useCallback(() => getFromStorage(key, defaultValue), [key, defaultValue]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
