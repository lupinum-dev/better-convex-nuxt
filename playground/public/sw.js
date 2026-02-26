// Dev-only safety stub for stale localhost service worker registrations.
// If a previous app registered /sw.js on http://localhost:3000, the browser
// will keep requesting it and can trigger noisy 404/error-overlay behavior in
// this playground. This stub immediately unregisters itself.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister())
})
