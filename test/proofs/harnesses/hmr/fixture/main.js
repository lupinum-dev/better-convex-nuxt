// HMR harness entry point. Both plugin modules are self-accepting
// (`import.meta.hot.accept()`), so editing either one triggers a real Vite
// HMR module update — not a full page reload — which is the exact mechanic
// the harness proves and counts across.
import './good-plugin.js'
import './naive-plugin.js'

window.__hmrHarnessLoaded = (window.__hmrHarnessLoaded || 0) + 1

// A completion signal the harness polls on, incremented once per finished
// HMR batch (fired after all updated modules re-executed).
window.__hmrUpdateCount = window.__hmrUpdateCount || 0
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    window.__hmrUpdateCount += 1
  })
}
