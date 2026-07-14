// Models a plugin that registers a resource (e.g. an event listener) on
// setup but never tears it down on HMR dispose. A naive Nuxt plugin written
// as `defineNuxtPlugin(() => { window.addEventListener(...) })` with no
// `import.meta.hot.dispose` has exactly this shape: every dev-server edit to
// the plugin (or any module in its HMR boundary) re-runs setup and leaks
// one more listener.
window.__hmrRegistry = window.__hmrRegistry || []
window.__hmrRegistry.push('naive-listener')

if (import.meta.hot) {
  // Self-accept so editing this file triggers a real HMR module update
  // instead of Vite falling back to a full page reload (which would reset
  // `window.__hmrRegistry` and hide the leak this fixture exists to prove).
  import.meta.hot.accept()
}
