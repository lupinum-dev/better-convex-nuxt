import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('module auto-import surface', () => {
  it('includes stable public composable auto-imports', () => {
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/module.ts'), 'utf8')
    const addImportsBlock = moduleSource.match(/addImports\(\[(?<imports>[\s\S]*?)\]\)/)?.groups
      ?.imports

    expect(addImportsBlock).toBeTruthy()
    expect(addImportsBlock).toMatch(/name:\s*'useConvexCall'/)
    expect(addImportsBlock).toMatch(/name:\s*'getQueryKey'/)
    expect(moduleSource).toMatch(/name:\s*'createBetterConvexAuthClient'/)
    expect(moduleSource).toMatch(/name:\s*'useConvexUser'/)
    expect(addImportsBlock).not.toMatch(/name:\s*'useConvexRpc'/)
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
