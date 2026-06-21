import { describe, expect, it } from 'vitest'

import { registerConvexAliases } from '../../src/module-aliases'
import {
  authAutoImports,
  composableAutoImports,
  permissionAutoImports,
} from '../../src/module-api-surface'
import { getMissingConvexApiTemplateContents } from '../../src/module-templates'

describe('module auto-import surface', () => {
  it('includes stable public composable auto-imports', () => {
    const autoImportNames = new Set(
      [...composableAutoImports, ...authAutoImports, ...permissionAutoImports].map(
        (entry) => entry.name,
      ),
    )

    expect(autoImportNames).toContain('useConvexCall')
    expect(autoImportNames).toContain('getQueryKey')
    expect(autoImportNames).toContain('createBetterConvexAuthClient')
    expect(autoImportNames).toContain('useConvexUser')
    expect(autoImportNames).not.toContain('useConvexRpc')
  })

  it('registers the #convex runtime and type aliases', () => {
    let prepareTypes:
      | ((options: {
          references: Array<{ path: string }>
          tsConfig: { compilerOptions?: { paths?: Record<string, string[]> } }
        }) => void)
      | undefined
    const nuxt = {
      options: {
        alias: {},
        buildDir: '/app/.nuxt',
      },
      hook: (name: 'prepare:types', callback: NonNullable<typeof prepareTypes>) => {
        expect(name).toBe('prepare:types')
        prepareTypes = callback
      },
    }
    const resolver = {
      resolve: (...parts: string[]) => parts.join('/'),
    }
    const tsConfigOptions = {
      references: [] as Array<{ path: string }>,
      tsConfig: {},
    }

    registerConvexAliases({
      nuxt,
      resolver,
      convexApiAlias: '/app/convex/_generated/api',
    })
    if (!prepareTypes) {
      throw new Error('Expected prepare:types hook to be registered')
    }
    prepareTypes(tsConfigOptions)

    expect(nuxt.options.alias).toEqual({
      '#convex/api': '/app/convex/_generated/api',
      '#convex/server': './runtime/server/index',
    })
    expect(tsConfigOptions).toEqual({
      references: [{ path: '/app/.nuxt/types/better-convex-nuxt.d.ts' }],
      tsConfig: {
        compilerOptions: {
          paths: {
            '#convex/api': ['/app/convex/_generated/api'],
            '#convex/server': ['./runtime/server/index'],
          },
        },
      },
    })
    expect(getMissingConvexApiTemplateContents()).toContain('createMissingConvexApiProxy')
  })
})
