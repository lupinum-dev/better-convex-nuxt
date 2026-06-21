import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('module auto-import surface', () => {
  it('includes stable public composable auto-imports', () => {
    const apiSurfaceSource = readFileSync(
      resolve(process.cwd(), 'src/module-api-surface.ts'),
      'utf8',
    )

    expect(apiSurfaceSource).toMatch(/name:\s*'useConvexCall'/)
    expect(apiSurfaceSource).toMatch(/name:\s*'getQueryKey'/)
    expect(apiSurfaceSource).toMatch(/name:\s*'createBetterConvexAuthClient'/)
    expect(apiSurfaceSource).toMatch(/name:\s*'useConvexUser'/)
    expect(apiSurfaceSource).not.toMatch(/name:\s*'useConvexRpc'/)
  })

  it('registers the #convex runtime and type aliases', () => {
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/module.ts'), 'utf8')

    expect(moduleSource).toContain("nuxt.options.alias['#convex/api'] = convexApiAlias")
    expect(moduleSource).toContain("opts.tsConfig.compilerOptions.paths['#convex/api']")
    expect(moduleSource).toContain('convex/_generated/api')
    expect(moduleSource).toContain('hasGeneratedConvexApi')
    expect(moduleSource).toContain('better-convex-nuxt/convex-api-missing.ts')
    expect(moduleSource).toContain("nuxt.options.alias['#convex/server']")
    expect(moduleSource).toContain("opts.tsConfig.compilerOptions.paths['#convex/server']")
    expect(moduleSource).toContain('./runtime/server/index')
  })
})
