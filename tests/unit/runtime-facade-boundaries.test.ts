import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const publicComposableFiles = [
  'src/runtime/composables/useConvexAction.ts',
  'src/runtime/composables/useConvexAuth.ts',
  'src/runtime/composables/useConvexConnectionState.ts',
  'src/runtime/composables/useConvexMutation.ts',
  'src/runtime/composables/useConvexPaginatedQuery.ts',
  'src/runtime/composables/useConvexQuery.ts',
  'src/runtime/composables/useConvexUpload.ts',
] as const

const bannedImports = [
  '../devtools/',
  '../../devtools/',
  '../utils/logger',
  '../../utils/logger',
  '../utils/convex-cache',
  '../../utils/convex-cache',
  '../utils/auth-unauthorized',
  '../../utils/auth-unauthorized',
  './internal/live-query-resource',
  './internal/convex-call-state',
] as const

describe('public composable facade boundaries', () => {
  it('keeps public composables free of low-level runtime plumbing imports', () => {
    const violations: string[] = []

    for (const relativePath of publicComposableFiles) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
      for (const banned of bannedImports) {
        if (source.includes(banned)) {
          violations.push(`${relativePath} imports ${banned}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
