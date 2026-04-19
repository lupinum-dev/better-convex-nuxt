import { startSubprocess } from '@nuxt/devtools-kit'
import { createResolver, defineNuxtModule } from '@nuxt/kit'

import { resolveNuxtCliArgs } from '../../src/devtools/nuxt-cli'
import { DEVTOOLS_UI_PORT } from '../../src/runtime/devtools/constants'

const resolver = createResolver(import.meta.url)

export default defineNuxtModule((_, nuxt) => {
  if (!nuxt.options.dev) return

  startSubprocess(
    {
      ...resolveNuxtCliArgs(import.meta.url, 'dev', ['--port', DEVTOOLS_UI_PORT.toString()]),
      cwd: resolver.resolve('.'),
    },
    {
      id: 'nuxt-devtools:convex-client',
      name: 'Convex DevTools Client',
    },
  )
})
