/**
 * Plausible Analytics Plugin
 *
 * Uses Nuxt Scripts for proper SSR/prerender compatibility and automatic deduplication.
 * Plausible is privacy-friendly analytics that doesn't use cookies.
 */

export default defineNuxtPlugin({
  name: 'plausible',
  parallel: true,
  setup() {
    // This plugin is client-only (.client.ts) so process.server is always false
    // But we still check for safety during prerendering
    if (import.meta.server) return

    // Use Nuxt Scripts composable for proper loading and automatic deduplication
    useScript(
      {
        key: 'plausible',
        src: 'https://plausible.io/js/pa-bJ1cXyrANyls7-RJ4PWVo.js',
        async: true,
        crossorigin: 'anonymous'
      },
      {
        use() {
          // Initialize Plausible function
          window.plausible
            = window.plausible
              || function (...args: unknown[]) {
                const plausible = window.plausible as { q?: unknown[] }
              ;(plausible.q = plausible.q || []).push(args)
              }

          window.plausible.init
            = window.plausible.init
              || function (i?: Record<string, unknown>) {
                const plausible = window.plausible as { o?: Record<string, unknown> }
                plausible.o = i || {}
              }

          // Initialize Plausible
          window.plausible.init()

          return { plausible: window.plausible }
        }
      }
    )
  }
})
