import { defineNitroPlugin } from 'nitropack/runtime'

import { useRuntimeConfig } from '#imports'

/**
 * Materialize Nitro's request-scoped runtime config before public server
 * helpers read it. Keeping this Nuxt-specific bridge outside the `/server`
 * export preserves that entry's framework-neutral import contract.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    useRuntimeConfig(event)
  })
})
