import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { findNuxtClientEngineViolations } from '../../scripts/check-no-nuxt-client-engine.mjs'

function write(root: string, path: string, contents: string) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

describe('Nuxt client-engine absence gate', () => {
  const directories: string[] = []
  const createRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 'bcn-no-nuxt-client-engine-'))
    directories.push(root)
    return root
  }

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true })
  })

  it('accepts public Vue package facades without a second engine', () => {
    const root = createRoot()
    write(
      root,
      'src/runtime/composables/useConvexMutation.ts',
      "import { useConvexMutation } from 'better-convex-vue'\n",
    )
    write(
      root,
      'dist/runtime/composables/useConvexMutation.js',
      "import { useConvexMutation } from 'better-convex-vue'\n",
    )

    expect(findNuxtClientEngineViolations(root, { dist: true })).toEqual([])
  })

  it('rejects removed source paths, private imports, controller ownership, and bundled engines', () => {
    const root = createRoot()
    write(root, 'src/runtime/client-core/query-controller.ts', 'export const old = true\n')
    write(
      root,
      'src/runtime/private.ts',
      "import 'better-convex-vue/internal'\ncreateClientOwner()\n",
    )
    write(root, 'dist/runtime/plugin.js', 'createCallableController()\n')

    expect(findNuxtClientEngineViolations(root, { dist: true })).toEqual(
      expect.arrayContaining([
        'removed path exists: src/runtime/client-core',
        'src/runtime/private.ts: forbidden better-convex-vue/internal',
        'src/runtime/private.ts: forbidden createClientOwner',
        'dist/runtime/plugin.js: forbidden createCallableController',
      ]),
    )
  })

  it('fails a requested dist proof when no build exists', () => {
    const root = createRoot()
    write(root, 'src/runtime/plugin.ts', "import { createBetterConvex } from 'better-convex-vue'\n")

    expect(findNuxtClientEngineViolations(root, { dist: true })).toContain(
      'dist root is missing: dist',
    )
  })
})
