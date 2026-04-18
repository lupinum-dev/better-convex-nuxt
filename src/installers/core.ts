import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import type { createResolver } from '@nuxt/kit'
import { addImports, addPlugin, addServerImports, addTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

interface InstallCoreOptions {
  nuxt: Nuxt
  resolver: ReturnType<typeof createResolver>
}

export function installCoreTrellis(options: InstallCoreOptions): void {
  const { nuxt, resolver } = options

  addPlugin({
    src: resolver.resolve('./runtime/plugin.server'),
    mode: 'server',
  })

  addPlugin(resolver.resolve('./runtime/plugin.client'))

  addTemplate({
    filename: 'types/trellis.d.ts',
    getContents: () => `
import type { ConvexClient } from 'convex/browser'
import type { createAuthClient } from 'better-auth/vue'
import type { RouteLocationRaw } from 'vue-router'
import type {
  ConvexAuthChangedPayload,
  ConvexCallErrorPayload,
  ConvexCallSuccessPayload,
  ConvexConnectionChangedPayload,
  ConvexUnauthorizedPayload,
} from '${resolver.resolve('./runtime/utils/types')}'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $convex?: ConvexClient
    $auth?: AuthClient
  }

  interface RuntimeNuxtHooks {
    'trellis:auth:refresh': () => void | Promise<void>
    'trellis:auth:invalidate': () => void | Promise<void>
    'trellis:unauthorized': (payload: ConvexUnauthorizedPayload) => void | Promise<void>
    'trellis:mutation:success': (payload: ConvexCallSuccessPayload<'mutation'>) => void | Promise<void>
    'trellis:mutation:error': (payload: ConvexCallErrorPayload<'mutation'>) => void | Promise<void>
    'trellis:action:success': (payload: ConvexCallSuccessPayload<'action'>) => void | Promise<void>
    'trellis:action:error': (payload: ConvexCallErrorPayload<'action'>) => void | Promise<void>
    'trellis:connection:changed': (payload: ConvexConnectionChangedPayload) => void | Promise<void>
    'trellis:auth:changed': (payload: ConvexAuthChangedPayload) => void | Promise<void>
  }

  interface PageMeta {
    skipAuthTokenFetch?: boolean
    convexAuth?: boolean | { redirectTo?: RouteLocationRaw }
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex?: ConvexClient
    $auth?: AuthClient
  }
}

export {}
`,
  })

  const trellisBarrelTemplate = addTemplate({
    filename: 'trellis/index.ts',
    write: true,
    getContents: () => `export * from '${resolver.resolve('./runtime/composables/index')}'
`,
  })
  nuxt.options.alias['#trellis'] = trellisBarrelTemplate.dst

  const trellisApiTemplate = addTemplate({
    filename: 'trellis/api.ts',
    write: true,
    getContents: () => {
      const candidatePaths = [
        ...new Set([
          resolvePath(nuxt.options.srcDir, 'convex/_generated/api'),
          resolvePath(nuxt.options.rootDir, 'convex/_generated/api'),
        ]),
      ]
      const convexGenApi = candidatePaths.find(
        (candidate) => existsSync(candidate + '.ts') || existsSync(candidate + '.js'),
      )

      if (!convexGenApi) {
        return `const error = () =>
  new Error(
    '[trellis] \`#trellis/api\` is unavailable because convex/_generated/api has not been generated yet. Run \`npx convex dev\` first.',
  )

export const api = new Proxy(
  {},
  {
    get() {
      throw error()
    },
    apply() {
      throw error()
    },
  },
) as never

export const internal = new Proxy(
  {},
  {
    get() {
      throw error()
    },
    apply() {
      throw error()
    },
  },
) as never
`
      }

      return `export { api, internal } from '${convexGenApi}'
`
    },
  })
  nuxt.options.alias['#trellis/api'] = trellisApiTemplate.dst

  addImports([
    { name: 'useConvex', from: resolver.resolve('./runtime/composables/useConvex') },
    {
      name: 'useConvexMutation',
      from: resolver.resolve('./runtime/composables/useConvexMutation'),
    },
    { name: 'useConvexAction', from: resolver.resolve('./runtime/composables/useConvexAction') },
    { name: 'useConvexQuery', from: resolver.resolve('./runtime/composables/useConvexQuery') },
    { name: 'useCachedQuery', from: resolver.resolve('./runtime/composables/useCachedQuery') },
    {
      name: 'executeConvexQuery',
      from: resolver.resolve('./runtime/composables/useConvexQuery'),
    },
    {
      name: 'useConvexPaginatedQuery',
      from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
    },
    {
      name: 'useConvexConnectionState',
      from: resolver.resolve('./runtime/composables/useConvexConnectionState'),
    },
    {
      name: 'useConvexUpload',
      from: resolver.resolve('./runtime/composables/useConvexUpload'),
    },
    {
      name: 'useConvexStorageUrl',
      from: resolver.resolve('./runtime/composables/useConvexStorageUrl'),
    },
    { name: 'prependTo', from: resolver.resolve('./runtime/composables/optimistic-updates') },
    { name: 'appendTo', from: resolver.resolve('./runtime/composables/optimistic-updates') },
    { name: 'removeFrom', from: resolver.resolve('./runtime/composables/optimistic-updates') },
    { name: 'updateIn', from: resolver.resolve('./runtime/composables/optimistic-updates') },
  ])

  addServerImports([
    { name: 'serverConvexQuery', from: resolver.resolve('./runtime/server/utils/convex') },
    { name: 'serverConvexMutation', from: resolver.resolve('./runtime/server/utils/convex') },
    { name: 'serverConvexAction', from: resolver.resolve('./runtime/server/utils/convex') },
    {
      name: 'serverConvexClearAuthCache',
      from: resolver.resolve('./runtime/server/utils/auth-cache'),
    },
    {
      name: 'validateConvexArgs',
      from: resolver.resolve('./runtime/server/utils/validate'),
    },
  ])

  nuxt.hook('prepare:types', (opts) => {
    opts.references.push({
      path: resolver.resolve(nuxt.options.buildDir, 'types/trellis.d.ts'),
    })
  })
}
