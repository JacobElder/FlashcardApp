import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo at https://jacobelder.github.io/FlashcardApp/
const PAGES_BASE = '/FlashcardApp/'

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` serves the built files, whose URLs already include the base
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NYC Trivia Study App',
        short_name: 'NYC Trivia',
        description: 'Study trivia and vocabulary with spaced repetition',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: PAGES_BASE,
        start_url: PAGES_BASE,
        // Long-press the home-screen icon to jump straight to word capture
        shortcuts: [
          {
            name: 'Add word',
            short_name: 'Add word',
            description: 'Save a vocabulary word to define later',
            url: `${PAGES_BASE}?capture`,
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright specs run in a real browser via `npm run test:e2e`
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Fixed zone west of UTC so local-vs-UTC date bugs show up on any machine
    env: { TZ: 'America/New_York' },
    // Undo vi.spyOn / vi.stubGlobal after every test so one test's mocks can't leak into the next
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
      exclude: ['src/data/**', 'src/test/**', 'src/main.tsx', '**/*.test.*', '**/*.d.ts', 'scripts/pending-words.mjs'],
      // Floors, not targets: they stop coverage silently sliding back
      thresholds: {
        'src/lib/**': { lines: 90, branches: 80 },
        lines: 80,
        branches: 70,
      },
    },
  }
}))
