import { describe, expect, it } from 'vitest'

import { checkPackedPathClasses } from '../../scripts/check-package-exports.mjs'

function validate(...paths: string[]): string[] {
  const failures: string[] = []
  checkPackedPathClasses(
    {
      files: paths.map((path) => ({ path })),
    },
    failures,
  )
  return failures
}

describe('packed artifact path classes', () => {
  it('allows package metadata, declarations, runtime files, and built DevTools assets', () => {
    expect(
      validate(
        'LICENSE',
        'LICENSES/Apache-2.0.txt',
        'README.md',
        'THIRD_PARTY_NOTICES.md',
        'package.json',
        'security/upstream-convex-better-auth.json',
        'dist/module.mjs',
        'dist/runtime/errors/index.d.ts',
        'dist/runtime/devtools/ui/dist/_nuxt/entry.js',
      ),
    ).toEqual([])
  })

  it.each([
    'research/notes.md',
    'dist/runtime/devtools/.output/public/index.html',
    'dist/runtime/devtools/ui/app.vue',
    'dist/runtime/devtools/ui/dist/_nuxt/entry.d.ts',
    'dist/runtime/server/tsconfig.json',
    'dist/tsconfig.tsbuildinfo',
  ])('rejects %s', (path) => {
    expect(validate(path)).not.toEqual([])
  })
})
