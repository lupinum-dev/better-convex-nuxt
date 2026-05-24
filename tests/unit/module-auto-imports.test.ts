import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installAdvancedTrellis } from '../../src/installers/advanced'
import { installAuthTrellis } from '../../src/installers/auth'
import { installCoreTrellis } from '../../src/installers/core'
import { installPermissionTrellis } from '../../src/installers/permissions'

const nuxtKitMocks = vi.hoisted(() => ({
  addImports: vi.fn(),
  addServerImports: vi.fn(),
  addPlugin: vi.fn(),
  addTemplate: vi.fn(({ filename }: { filename: string }) => ({
    dst: `/virtual/${filename}`,
  })),
  addComponentsDir: vi.fn(),
  addRouteMiddleware: vi.fn(),
  addServerHandler: vi.fn(),
}))

vi.mock('@nuxt/kit', () => ({
  addImports: nuxtKitMocks.addImports,
  addServerImports: nuxtKitMocks.addServerImports,
  addPlugin: nuxtKitMocks.addPlugin,
  addTemplate: nuxtKitMocks.addTemplate,
  addComponentsDir: nuxtKitMocks.addComponentsDir,
  addRouteMiddleware: nuxtKitMocks.addRouteMiddleware,
  addServerHandler: nuxtKitMocks.addServerHandler,
}))

function createResolver() {
  return {
    resolve: (path: string) => `/resolved${path}`,
  }
}

function createNuxt() {
  return {
    options: {
      alias: {} as Record<string, string>,
      buildDir: '/build',
      rootDir: '/root',
      srcDir: '/src',
    },
    hook: vi.fn(),
  }
}

describe('installer auto-import surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the core, auth, permissions, and alias surfaces through Nuxt Kit', () => {
    const nuxt = createNuxt()
    const resolver = createResolver()

    installCoreTrellis({
      nuxt: nuxt as never,
      resolver: resolver as never,
    })
    installAuthTrellis({
      resolver: resolver as never,
      authRoute: '/api/auth',
    })
    installPermissionTrellis({
      resolver: resolver as never,
      permissionQueryPath: 'permissions/context.getAccessContext',
    })
    installAdvancedTrellis({
      nuxt: nuxt as never,
      resolver: resolver as never,
    })

    const importedNames = nuxtKitMocks.addImports.mock.calls.flatMap(([entries]) =>
      (entries as Array<{ name: string }>).map((entry) => entry.name),
    )
    const serverImportedNames = nuxtKitMocks.addServerImports.mock.calls.flatMap(([entries]) =>
      (entries as Array<{ name: string }>).map((entry) => entry.name),
    )

    expect(importedNames).toEqual(
      expect.arrayContaining([
        'useConvexQuery',
        'useConvexPaginatedQuery',
        'useConvexMutation',
        'useConvexAction',
        'useConvexUpload',
        'useConvexAuth',
        'useBetterAuthClient',
        'useBetterAuthActions',
        'useBetterAuthSignIn',
        'useBetterAuthSignUp',
        'useBetterAuthPasswordReset',
        'useAccess',
        'useAuthGuard',
      ]),
    )
    expect(importedNames).not.toEqual(
      expect.arrayContaining([
        'useEnsureAuthSessionUser',
        'useConvexAuthInternal',
        'useConvexFileUpload',
        'useConvexUploadQueue',
        'defineSharedConvexQuery',
      ]),
    )

    expect(serverImportedNames).toEqual(
      expect.arrayContaining([
        'serverConvexQuery',
        'serverConvexMutation',
        'serverConvexAction',
        'serverConvexClearAuthCache',
        'validateConvexArgs',
      ]),
    )

    expect(nuxtKitMocks.addRouteMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'convex-auth',
        global: true,
      }),
    )
    expect(nuxtKitMocks.addServerHandler).toHaveBeenCalledTimes(2)
    expect(nuxtKitMocks.addComponentsDir).toHaveBeenCalledWith(
      expect.objectContaining({
        global: true,
      }),
    )
    expect(nuxtKitMocks.addTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'trellis/configured-permissions.ts',
      }),
    )
    expect(nuxtKitMocks.addTemplate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'trellis/permissions.ts',
      }),
    )
    expect(nuxt.options.alias).toMatchObject({
      '#trellis': '/virtual/trellis/index.ts',
      '#trellis/api': '/virtual/trellis/api.ts',
      '#trellis/server': '/virtual/trellis/server.ts',
      '#trellis/mcp': '/virtual/trellis/mcp.ts',
    })
  })
})
