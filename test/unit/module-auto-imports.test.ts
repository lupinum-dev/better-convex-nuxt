import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  authAutoImports,
  composableAutoImports,
  permissionAutoImports,
} from '../../src/module-api-surface'

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
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/module.ts'), 'utf8')
    const templateSource = readFileSync(resolve(process.cwd(), 'src/module-templates.ts'), 'utf8')

    expect(moduleSource).toContain("nuxt.options.alias['#convex/api'] = convexApiAlias")
    expect(moduleSource).toContain("opts.tsConfig.compilerOptions.paths['#convex/api']")
    expect(moduleSource).toContain('convex/_generated/api')
    expect(moduleSource).toContain('hasGeneratedConvexApi')
    expect(moduleSource).toContain('better-convex-nuxt/convex-api-missing.ts')
    expect(templateSource).toContain('createMissingConvexApiProxy')
    expect(moduleSource).toContain("nuxt.options.alias['#convex/server']")
    expect(moduleSource).toContain("opts.tsConfig.compilerOptions.paths['#convex/server']")
    expect(moduleSource).toContain('./runtime/server/index')
  })
})
