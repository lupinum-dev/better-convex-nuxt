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
    path: resolver.resolve('./runtime/auth/middleware/route-protection.global'),
    global: true,
  })

  addServerHandler({
    route: authRoute,
    handler: resolver.resolve('./runtime/auth/server/api/auth/[...]'),
  })
  addServerHandler({
    route: `${authRoute}/**`,
    handler: resolver.resolve('./runtime/auth/server/api/auth/[...]'),
  })

  addImports([
    { name: 'useConvexAuth', from: resolver.resolve('./runtime/auth/composables/useConvexAuth') },
    {
      name: 'useConvexAuthActions',
      from: resolver.resolve('./runtime/auth/composables/useConvexAuthActions'),
    },
    {
      name: 'useConvexSignIn',
      from: resolver.resolve('./runtime/auth/composables/useConvexSignIn'),
    },
    {
      name: 'useConvexSignUp',
      from: resolver.resolve('./runtime/auth/composables/useConvexSignUp'),
    },
    {
      name: 'useConvexPasswordReset',
      from: resolver.resolve('./runtime/auth/composables/useConvexPasswordReset'),
    },
  ])

  addComponentsDir({
    path: resolver.resolve('./runtime/auth/ui'),
    global: true,
  })
}
