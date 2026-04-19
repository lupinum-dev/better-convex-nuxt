import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const publicComposableFiles = [
  'src/runtime/convex/composables/useConvexAction.ts',
  'src/runtime/auth/composables/useConvexAuth.ts',
  'src/runtime/convex/composables/useConvexConnectionState.ts',
  'src/runtime/convex/composables/useConvexMutation.ts',
  'src/runtime/convex/composables/useConvexPaginatedQuery.ts',
  'src/runtime/convex/composables/useConvexQuery.ts',
  'src/runtime/convex/composables/useConvexUpload.ts',
] as const

const bannedImports = [
  '../devtools/',
  '../../devtools/',
  '../utils/logger',
  '../../utils/logger',
  '../utils/convex-cache',
  '../../utils/convex-cache',
  '../shared/convex-cache',
  '../../shared/convex-cache',
  '../auth/shared/auth-unauthorized',
  '../../auth/shared/auth-unauthorized',
  '../query/live-query-resource',
  '../shared/convex-call-state',
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
