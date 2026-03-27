import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('module auto-import surface', () => {
  it('includes useConvexFileUpload and useConvexUploadQueue and excludes removed/internal exports', () => {
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/module.ts'), 'utf8')
    const addImportsBlock = moduleSource.match(/addImports\(\[(?<imports>[\s\S]*?)\]\)/)?.groups
      ?.imports

    expect(addImportsBlock).toBeTruthy()
    expect(addImportsBlock).toMatch(/name:\s*'useConvexFileUpload'/)
    expect(addImportsBlock).toMatch(/name:\s*'useConvexUploadQueue'/)
    expect(addImportsBlock).not.toMatch(/name:\s*'useConvexUpload'[^Q]/)
    expect(addImportsBlock).not.toMatch(/name:\s*'useConvexCall'/)
    expect(addImportsBlock).not.toMatch(/name:\s*'getQueryKey'/)
    expect(addImportsBlock).not.toMatch(/name:\s*'useConvexRpc'/)
  })
})
