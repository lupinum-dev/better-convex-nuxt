import type { createResolver } from '@nuxt/kit'
import {
  addComponentsDir,
  addImports,
  addRouteMiddleware,
  addServerHandler,
  addTemplate,
} from '@nuxt/kit'

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

  addTemplate({
    filename: 'types/trellis-auth.d.ts',
    getContents: () => `
import type { createAuthClient } from 'better-auth/vue'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $auth?: AuthClient
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $auth?: AuthClient
  }
}

export {}
`,
  })

  addImports([
    { name: 'useConvexAuth', from: resolver.resolve('./runtime/auth/composables/useConvexAuth') },
    {
      name: 'useBetterAuthClient',
      from: resolver.resolve('./runtime/auth/composables/useBetterAuthClient'),
    },
    {
      name: 'useBetterAuthActions',
      from: resolver.resolve('./runtime/auth/composables/useBetterAuthActions'),
    },
    {
      name: 'useBetterAuthSignIn',
      from: resolver.resolve('./runtime/auth/composables/useBetterAuthSignIn'),
    },
    {
      name: 'useBetterAuthSignUp',
      from: resolver.resolve('./runtime/auth/composables/useBetterAuthSignUp'),
    },
    {
      name: 'useBetterAuthPasswordReset',
      from: resolver.resolve('./runtime/auth/composables/useBetterAuthPasswordReset'),
    },
  ])

  addComponentsDir({
    path: resolver.resolve('./runtime/auth/ui'),
    global: true,
  })
}
