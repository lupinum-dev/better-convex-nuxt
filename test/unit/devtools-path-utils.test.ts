import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isPathInsideDirectory, resolveDevtoolsFilePath } from '../../src/runtime/devtools/path-utils'

describe('devtools path utils', () => {
  it('allows files inside output directory', () => {
    const root = '/tmp/devtools-dist'
    const file = resolveDevtoolsFilePath(root, '/assets/app.js')
    expect(isPathInsideDirectory(root, file)).toBe(true)
  })

  it('rejects sibling prefix paths', () => {
    const root = '/tmp/out'
    const file = '/tmp/out-secrets/keys.txt'
    expect(isPathInsideDirectory(root, file)).toBe(false)
  })

  it('rejects traversal paths after resolution', () => {
    const root = '/tmp/devtools-dist'
    const traversed = join(root, '../secrets.txt')
    expect(isPathInsideDirectory(root, traversed)).toBe(false)
  })
})
