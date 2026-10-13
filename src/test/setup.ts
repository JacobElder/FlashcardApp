import '@testing-library/jest-dom'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetStorageCache } from '../lib/storage'

// In-memory localStorage (Node's experimental global localStorage can shadow jsdom's)
const store = new Map<string, string>()
const localStorageMock: Storage = {
  get length() { return store.size },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
  clear: () => { store.clear() },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

beforeEach(() => {
  localStorageMock.clear()
  resetStorageCache()
})

afterEach(() => {
  cleanup()
})
