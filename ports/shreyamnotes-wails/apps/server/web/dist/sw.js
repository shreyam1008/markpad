// Minimal PWA service worker for ShreyamNotes Web.
//
// Strategy:
//   - App shell (HTML / JS / CSS bundles): cache-first after first load
//     so the PWA opens instantly and works offline for reads.
//   - API requests (<scope>/api/*): always hit the network; those
//     responses are not cached here (the IndexedDB layer inside the app
//     can do smarter per-note caching later).
//
// The SW derives the deployment prefix from its own registration scope,
// so the same file works both at the root ("/") and under a reverse
// proxy subpath ("/zennotes/"). This file is deliberately small —
// Workbox or similar can replace it later without changing the UI.

const CACHE_NAME = 'zennotes-shell-v3'
const SCOPE_PATH = new URL(self.registration.scope).pathname
const APP_SHELL = [
  SCOPE_PATH,
  SCOPE_PATH + 'index.html',
  SCOPE_PATH + 'manifest.webmanifest',
  SCOPE_PATH + 'favicon-32.png',
  SCOPE_PATH + 'icon-192.png',
  SCOPE_PATH + 'icon-512.png'
]
const API_PREFIX = SCOPE_PATH + 'api/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never cache API or websocket traffic.
  if (url.pathname.startsWith(API_PREFIX)) return

  // Same-origin assets: cache-first with background refresh.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})
