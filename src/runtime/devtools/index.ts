/**
 * DevTools setup for Nuxt DevTools integration.
 * This file is called from module.ts in dev mode only.
 */
import type { Nuxt } from '@nuxt/schema'
import { addCustomTab } from '@nuxt/devtools-kit'
import { addServerHandler } from '@nuxt/kit'

export interface DevToolsSetupOptions {
  /** Resolver for file paths */
  resolve: (...paths: string[]) => string
}

/**
 * Setup Nuxt DevTools integration.
 * Registers custom tab and server handlers.
 */
export function setupDevTools(nuxt: Nuxt, options: DevToolsSetupOptions): void {
  const { resolve } = options

  // Register custom tab in Nuxt DevTools
  addCustomTab({
    name: 'convex',
    title: 'Convex',
    icon: 'carbon:data-base',
    category: 'app',
    view: {
      type: 'iframe',
      src: '/__convex_devtools__',
      persistent: true,
    },
  }, nuxt)

  // Add server route to serve DevTools UI
  addServerHandler({
    route: '/__convex_devtools__',
    handler: resolve('./runtime/devtools/server'),
  })
}
