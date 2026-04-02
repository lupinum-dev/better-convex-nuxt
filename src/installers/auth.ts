import type { createResolver } from '@nuxt/kit'
import { addComponentsDir, addImports, addRouteMiddleware, addServerHandler } from '@nuxt/kit'

interface InstallAuthOptions {
  resolver: ReturnType<typeof createResolver>
  authRoute: string
}

export function installAuthTrellis(options: InstallAuthOptions): void {
  const { resolver, authRoute } = options

  addRouteMiddleware({
    name: 'convex-auth',
    path: resolver.resolve('./runtime/middleware/convex-auth.global'),
    global: true,
  })

  addServerHandler({
    route: authRoute,
    handler: resolver.resolve('./runtime/server/api/auth/[...]'),
  })
  addServerHandler({
    route: `${authRoute}/**`,
    handler: resolver.resolve('./runtime/server/api/auth/[...]'),
  })

  addImports([
    { name: 'useConvexAuth', from: resolver.resolve('./runtime/composables/useConvexAuth') },
    {
      name: 'useConvexAuthActions',
      from: resolver.resolve('./runtime/composables/useConvexAuthActions'),
    },
  ])

  addComponentsDir({
    path: resolver.resolve('./runtime/components'),
    global: true,
  })
}
