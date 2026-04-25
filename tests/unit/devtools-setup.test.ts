import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveDevtoolsUiMode } from '../../src/devtools'

const tempDirs: string[] = []

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'trellis-devtools-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('resolveDevtoolsUiMode', () => {
  it('prefers built client assets when available', () => {
    const root = tempDir()
    const clientPath = join(root, 'dist', 'client')
    const sourcePath = join(root, 'apps', 'devtools-ui')
    mkdirSync(clientPath, { recursive: true })
    mkdirSync(sourcePath, { recursive: true })

    expect(resolveDevtoolsUiMode({ clientPath, sourcePath })).toBe('client')
  })

  it('uses the source UI only in a source checkout', () => {
    const root = tempDir()
    const clientPath = join(root, 'dist', 'client')
    const sourcePath = join(root, 'apps', 'devtools-ui')
    mkdirSync(sourcePath, { recursive: true })

    expect(resolveDevtoolsUiMode({ clientPath, sourcePath })).toBe('source')
  })

  it('disables the UI when a packed package has no client assets or source app', () => {
    const root = tempDir()

    expect(
      resolveDevtoolsUiMode({
        clientPath: join(root, 'dist', 'client'),
        sourcePath: join(root, 'apps', 'devtools-ui'),
      }),
    ).toBeNull()
  })
})
