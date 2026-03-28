import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('module auto-import surface', () => {
  it('includes the consolidated upload/query helpers and excludes removed/internal exports', () => {
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/module.ts'), 'utf8')

    expect(moduleSource).toMatch(/name:\s*'useConvexUpload'/)
    expect(moduleSource).toMatch(/name:\s*'useConvexAuthActions'/)
    expect(moduleSource).not.toMatch(/name:\s*'useConvexAuthInternal'/)
    expect(moduleSource).not.toMatch(/name:\s*'useAuthRedirect'/)
    // Removed deprecated composables
    expect(moduleSource).not.toMatch(/name:\s*'useConvexFileUpload'/)
    expect(moduleSource).not.toMatch(/name:\s*'useConvexUploadQueue'/)
    expect(moduleSource).not.toMatch(/name:\s*'defineSharedConvexQuery'/)
    expect(moduleSource).not.toMatch(/name:\s*'useConvexStorageUrlRef'/)
    expect(moduleSource).not.toMatch(/name:\s*'toCallResult'/)
    expect(moduleSource).not.toMatch(/name:\s*'useConvexCall'/)
    expect(moduleSource).not.toMatch(/name:\s*'getQueryKey'/)
    expect(moduleSource).not.toMatch(/name:\s*'useConvexRpc'/)
    expect(moduleSource).not.toMatch(/name:\s*'defineConvexMcpTool'/)
  })
})
