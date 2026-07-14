// Models a well-behaved plugin: registers a resource on setup and tears it
// down via `import.meta.hot.dispose`, the pattern a correct Nuxt plugin uses
// (dispose runs immediately before the module is re-executed on HMR).
window.__hmrRegistry = window.__hmrRegistry || []
window.__hmrRegistry.push('good-listener')

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const index = window.__hmrRegistry.indexOf('good-listener')
    if (index !== -1) window.__hmrRegistry.splice(index, 1)
  })
  import.meta.hot.accept()
}
